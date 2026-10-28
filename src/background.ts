import { initFocus } from "./focus/background.ts";
import { ext } from "./shared/ext-api.ts";
import { initWandPages } from "./sites/custom/pages.ts";
import { WAND_ACTION } from "./sites/custom/protocol.ts";
import { DEFAULTS, STORAGE_KEYS } from "./shared/settings.ts";
import { initTwitchBackground } from "./sites/twitch/background/index.ts";

// One background for Chrome, Firefox and Safari. Everything that touches a page lives in the
// content scripts; the background owns state, badges, shortcuts and cross-origin fetches.

/** `STORAGE_KEYS.FOO` -> `DEFAULTS.FOO` for every setting that has a default. */
const defaultSettings = (): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(STORAGE_KEYS)
      .filter(([name]) => name in DEFAULTS)
      .map(([name, key]) => [key, DEFAULTS[name as keyof typeof DEFAULTS]]),
  );

ext.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await ext.storage.local.set({ ...defaultSettings(), [STORAGE_KEYS.TWITCH_URL_LOG]: [] });
  }
});

// The wand shortcut, pressed on a supported page (or one the wand was allowed on): start (or stop) the wand in that tab.
ext.runtime.onMessage.addListener((message: { action?: string }, sender) => {
  const tabId = sender.tab?.id;
  if (message?.action !== WAND_ACTION || typeof tabId !== "number") return false;
  const file = "sites/wand/content.js";
  const run = ext.scripting
    ? ext.scripting.executeScript({ target: { tabId }, files: [file] })
    : (
        ext.tabs as unknown as { executeScript: (id: number, d: object) => Promise<unknown> }
      ).executeScript(tabId, { file });
  run.catch(() => {});
  return false;
});

initFocus();
initWandPages();
initTwitchBackground();
