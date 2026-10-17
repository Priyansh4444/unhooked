import { initFocus } from "./focus/background.ts";
import { ext } from "./shared/ext-api.ts";
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

initFocus();
initTwitchBackground();
