import { ext } from "./shared/ext-api.ts";
import { injectScript } from "./shared/inject.ts";
import { siteSwitchPatch } from "./shared/preferences.ts";
import { initWandPages } from "./sites/custom/pages.ts";
import { WAND_ACTION } from "./sites/custom/protocol.ts";
import { FILM_CAPTURE, type CaptureReply } from "./sites/film/protocol.ts";
import { siteForUrl } from "./sites/hosts.ts";
import { DEFAULTS, STORAGE_KEYS } from "./shared/settings.ts";
import { initTwitchBackground } from "./sites/twitch/background/index.ts";

// One background for Chrome, Firefox and Safari. Everything that touches a page lives in the
// content scripts; the background owns shortcuts, screenshots and cross-origin fetches.

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

ext.runtime.onMessage.addListener(
  (message: { action?: string }, sender, sendResponse: (reply: CaptureReply) => void) => {
    const tab = sender.tab;
    // The wand shortcut, pressed on a page the wand may run on: start or stop it in that tab.
    if (message?.action === WAND_ACTION && typeof tab?.id === "number") {
      injectScript(tab.id, "sites/wand/content.js").catch(() => {});
      return false;
    }
    // Film mode's screenshot. Allowed while the user has invoked Unhooked on this tab.
    if (message?.action === FILM_CAPTURE && typeof tab?.windowId === "number") {
      ext.tabs.captureVisibleTab(tab.windowId, { format: "png" }).then(
        (image) => sendResponse({ image }),
        (error: Error) => sendResponse({ error: error.message }),
      );
      return true;
    }
    return false;
  },
);

ext.commands?.onCommand.addListener(async (command, given) => {
  const [tab] = given ? [given] : await ext.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== "number") return;
  if (command === "film-mode") {
    await injectScript(tab.id, "sites/film/content.js").catch(() => {});
  } else if (command === "toggle-site") {
    const site = siteForUrl(tab.url);
    if (site) await ext.storage.local.set(siteSwitchPatch(await ext.storage.local.get(null), site));
  }
});

initWandPages();
initTwitchBackground();
