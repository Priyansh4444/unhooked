import { ext } from "./shared/ext-api.ts";
import { injectScript } from "./shared/inject.ts";
import { siteSwitchPatch } from "./shared/preferences.ts";
import { initWandPages } from "./sites/custom/pages.ts";
import { WAND_ACTION } from "./sites/custom/protocol.ts";
import {
  FILM_CAPTURE,
  FILM_START,
  SCREENSHOT_ACCESS,
  type CaptureReply,
} from "./sites/film/protocol.ts";
import { siteForUrl } from "./sites/hosts.ts";
import { DEFAULTS, STORAGE_KEYS } from "./shared/settings.ts";
import { initTimeTracker } from "./time/background.ts";
import { initTwitchBackground } from "./sites/twitch/background/index.ts";

// One background for Chrome, Firefox and Safari. Everything that touches a page lives in the
// content scripts; the background owns shortcuts, screenshots, the time tracker and cross-origin fetches.

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

async function askForScreenshots(tabId: number | undefined): Promise<void> {
  const url = ext.runtime.getURL(`ui/allow/index.html?tab=${tabId ?? ""}`);
  const [open] = await ext.tabs.query({ url: ext.runtime.getURL("ui/allow/index.html*") });
  if (open?.windowId !== undefined) {
    await ext.windows.update(open.windowId, { focused: true });
    return;
  }
  await ext.windows.create({ url, type: "popup", width: 480, height: 400 });
}

ext.runtime.onMessage.addListener(
  (message: { action?: string }, sender, sendResponse: (reply: CaptureReply) => void) => {
    const tab = sender.tab;
    // The wand shortcut, pressed on a page the wand may run on: start or stop it in that tab.
    if (message?.action === WAND_ACTION && typeof tab?.id === "number") {
      injectScript(tab.id, "sites/wand/content.js").catch(() => {});
      return false;
    }
    // A post's film button: film mode loads now, in the tab that asked.
    if (message?.action === FILM_START && typeof tab?.id === "number") {
      injectScript(tab.id, "sites/film/content.js").then(
        () => sendResponse({}),
        () => sendResponse({}),
      );
      return true;
    }
    // Film mode's screenshot. Works where Unhooked was just invoked on this tab, or with access to
    // all sites. Without either, a small window asks, the first time it's needed.
    if (message?.action === FILM_CAPTURE && typeof tab?.windowId === "number") {
      ext.tabs.captureVisibleTab(tab.windowId, { format: "png" }).then(
        (image) => sendResponse({ image }),
        async () => {
          const allowed = await ext.permissions.contains(SCREENSHOT_ACCESS).catch(() => false);
          if (allowed) return sendResponse({ error: "capture failed" });
          await askForScreenshots(tab.id);
          sendResponse({ asking: true });
        },
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

initTimeTracker();
initWandPages();
initTwitchBackground();
