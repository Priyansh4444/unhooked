import { ext, getActionApi } from "../shared/ext-api.ts";
import { isPaused } from "../shared/preferences.ts";
import { STORAGE_KEYS } from "../shared/settings.ts";
import { FOCUS_ACTION, type FocusPush, type FocusReply, type FocusRequest } from "./protocol.ts";
import {
  FOCUS_SITES,
  FOCUS_SITE_IDS,
  findFocusSiteByUrl,
  siteMatchesUrl,
  type FocusSite,
} from "./sites.ts";
import {
  forgetTab,
  getPersistenceMode,
  isFocusEnabled,
  resetTabStates,
  setFocusEnabled,
} from "./state.ts";

const paused = async (): Promise<boolean> =>
  isPaused(await ext.storage.local.get([STORAGE_KEYS.PAUSED, STORAGE_KEYS.LEGACY_YOUTUBE_OPTIONS]));

/** "ON" only while focus mode is actually showing; no badge otherwise. */
const setBadge = async (tabId: number, enabled: boolean): Promise<void> => {
  const text = enabled && !(await paused()) ? "ON" : "";
  try {
    await getActionApi().setBadgeText({ tabId, text });
  } catch {
    // The tab was closed in the meantime.
  }
};

const refreshBadge = async (tab: chrome.tabs.Tab): Promise<void> => {
  const site = findFocusSiteByUrl(tab.url);
  if (site && typeof tab.id === "number") {
    await setBadge(tab.id, await isFocusEnabled(site, tab.id));
  }
};

const refreshBadgesForSite = async (site: FocusSite): Promise<void> => {
  const tabs = await ext.tabs.query({});
  await Promise.all(
    tabs.filter((tab) => tab.url && siteMatchesUrl(site, tab.url)).map((tab) => refreshBadge(tab)),
  );
};

/** Tabs that were open before the extension was installed/updated have no content script yet. */
const injectContentScript = async (tabId: number, site: FocusSite): Promise<void> => {
  const file = `sites/${site}/content.js`;
  try {
    if (ext.scripting) {
      await ext.scripting.executeScript({ target: { tabId }, files: [file] });
    } else {
      // Safari MV2
      await (
        ext.tabs as unknown as { executeScript: (id: number, d: object) => Promise<unknown> }
      ).executeScript(tabId, { file });
    }
  } catch {
    // Restricted page or tab gone; nothing more we can do.
  }
};

/** Tell a tab's content script about new state. A freshly injected script pulls state itself. */
const pushToTab = async (tabId: number, site: FocusSite, enabled: boolean): Promise<void> => {
  const message: FocusPush = { action: FOCUS_ACTION.SET, site, enabled };
  try {
    await ext.tabs.sendMessage(tabId, message);
  } catch {
    await injectContentScript(tabId, site);
  }
};

const toggleFocus = async (site: FocusSite, tabId: number): Promise<boolean> => {
  const enabled = !(await isFocusEnabled(site, tabId));
  await setFocusEnabled(site, tabId, enabled);
  await pushToTab(tabId, site, enabled);

  // In global mode the other tabs react to the storage change themselves; only badges need work.
  if ((await getPersistenceMode(site)) === "global") {
    await refreshBadgesForSite(site);
  } else {
    await setBadge(tabId, enabled);
  }
  return enabled;
};

const handleFocusRequest = async (
  request: FocusRequest,
  sender: chrome.runtime.MessageSender,
): Promise<FocusReply> => {
  const tabId = typeof request.tabId === "number" ? request.tabId : sender.tab?.id;
  if (typeof tabId !== "number" || !FOCUS_SITES[request.site]) {
    return { enabled: false };
  }

  if (request.action === FOCUS_ACTION.TOGGLE) {
    return { enabled: await toggleFocus(request.site, tabId) };
  }

  const enabled = await isFocusEnabled(request.site, tabId);
  await setBadge(tabId, enabled);
  return { enabled };
};

export const initFocus = (): void => {
  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action !== FOCUS_ACTION.GET && message?.action !== FOCUS_ACTION.TOGGLE) {
      return false;
    }
    handleFocusRequest(message as FocusRequest, sender).then(sendResponse, () =>
      sendResponse({ enabled: false } satisfies FocusReply),
    );
    return true;
  });

  ext.commands.onCommand.addListener(async (command) => {
    const site = FOCUS_SITE_IDS.find((id) => FOCUS_SITES[id].command === command);
    if (!site) return;

    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && typeof tab.id === "number" && siteMatchesUrl(site, tab.url)) {
      await toggleFocus(site, tab.id);
    }
  });

  ext.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      await refreshBadge(await ext.tabs.get(tabId));
    } catch {
      // Tab closed.
    }
  });

  // Chrome clears per-tab badge text when a tab navigates.
  ext.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") void refreshBadge(tab);
  });

  ext.tabs.onRemoved.addListener((tabId) => {
    void forgetTab(tabId);
  });

  ext.runtime.onStartup.addListener(() => {
    void resetTabStates();
  });

  // Switching between per-tab and global mode (or editing global state) changes what each tab
  // should show; content scripts re-pull on the same events, the background only fixes badges.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const pauseChanged = Boolean(
      changes[STORAGE_KEYS.PAUSED] || changes[STORAGE_KEYS.LEGACY_YOUTUBE_OPTIONS],
    );
    for (const site of FOCUS_SITE_IDS) {
      const { stateKey, persistenceKey } = FOCUS_SITES[site];
      if (pauseChanged || changes[stateKey] || changes[persistenceKey])
        void refreshBadgesForSite(site);
    }
  });
};
