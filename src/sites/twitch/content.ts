/**
 * Twitch chat: link pills + hover cards, and the recent-links log.
 *
 * Pills and the log are independent: the log keeps working with pills off, and vice versa.
 * Styles come from the manifest (style.css); pill markup only exists while pills are on.
 */

import { ext } from "../../shared/ext-api.ts";
import { isPaused } from "../../shared/preferences.ts";
import { DEFAULTS, STORAGE_KEYS } from "../../shared/settings.ts";
import { bindHovercard, setHoverDelay, unbindHovercard } from "./chat/hovercard.ts";
import { observeChat, type ChatObserver } from "./chat/observer.ts";
import { isLikelyTwitchChatPage, waitForChatRoot } from "./chat/root.ts";

const settings: { pills: boolean; log: boolean; paused: boolean } = {
  pills: DEFAULTS.TWITCH_LINK_PILLS,
  log: DEFAULTS.TWITCH_URL_LOG_ENABLED,
  paused: false,
};

// The global pause turns both off without changing the saved choices.
const pillsOn = (): boolean => settings.pills && !settings.paused;
const logOn = (): boolean => settings.log && !settings.paused;

let observer: ChatObserver | null = null;
let waiting: AbortController | null = null;
let rootGone: ReturnType<typeof setInterval> | undefined;
/** How often to check the chat is still on the page. Twitch removes it when the panel closes. */
const CHAT_CHECK_MS = 1500;

const wantsChat = (): boolean => pillsOn() || logOn();

function detach(): void {
  observer?.disconnect();
  observer = null;
  clearInterval(rootGone);
  unbindHovercard();
}

function applyPillsSetting(): void {
  observer?.setPillsEnabled(pillsOn());
  if (pillsOn()) bindHovercard();
  else unbindHovercard();
}

function attach(root: Element): void {
  detach();
  if (!wantsChat()) return;
  observer = observeChat(root, { pillsEnabled: pillsOn(), logEnabled: logOn() });
  applyPillsSetting();

  // Wait for it to come back after the panel closes. A timer rather than a watch on the document,
  // which would wake on every change Twitch makes to its page.
  rootGone = setInterval(() => {
    if (root.isConnected) return;
    detach();
    start();
  }, CHAT_CHECK_MS);
}

/** (Re)find the chat and attach to it. Safe to call whenever the page or settings change. */
function start(): void {
  waiting?.abort();
  waiting = new AbortController();
  if (wantsChat() && isLikelyTwitchChatPage()) waitForChatRoot(attach, waiting.signal);
}

function onSettingsChanged(changes: Record<string, { newValue?: unknown }>): void {
  const flag = (key: string, fallback: boolean) =>
    key in changes ? changes[key]?.newValue !== false : fallback;
  settings.pills = flag(STORAGE_KEYS.TWITCH_LINK_PILLS, settings.pills);
  settings.log = flag(STORAGE_KEYS.TWITCH_URL_LOG_ENABLED, settings.log);
  if (STORAGE_KEYS.PAUSED in changes)
    settings.paused = changes[STORAGE_KEYS.PAUSED]?.newValue === true;

  const delay = changes[STORAGE_KEYS.TWITCH_HOVER_DELAY_MS]?.newValue;
  if (typeof delay === "number") setHoverDelay(delay);

  observer?.setLogEnabled(logOn());
  if (!wantsChat()) {
    observer?.setPillsEnabled(false); // unpill before letting go
    detach();
    waiting?.abort();
  } else if (observer) {
    applyPillsSetting();
  } else {
    start();
  }
}

/**
 * Twitch is a SPA: re-check chat after every change of address. A content script can't wrap the
 * page's history.pushState, since it has its own copy of `history`, so this reads the address.
 */
function watchNavigation(): void {
  const restart = () => {
    detach();
    start();
  };
  const navigation = (window as { navigation?: EventTarget }).navigation;
  if (navigation) {
    navigation.addEventListener("navigatesuccess", restart);
    return;
  }
  let address = location.href;
  setInterval(() => {
    if (location.href === address) return;
    address = location.href;
    restart();
  }, CHAT_CHECK_MS);
}

async function init(): Promise<void> {
  const stored = await ext.storage.local.get([
    STORAGE_KEYS.TWITCH_LINK_PILLS,
    STORAGE_KEYS.TWITCH_URL_LOG_ENABLED,
    STORAGE_KEYS.TWITCH_HOVER_DELAY_MS,
    STORAGE_KEYS.PAUSED,
    STORAGE_KEYS.LEGACY_YOUTUBE_OPTIONS,
  ]);
  settings.paused = isPaused(stored);
  settings.pills = stored[STORAGE_KEYS.TWITCH_LINK_PILLS] !== false;
  settings.log = stored[STORAGE_KEYS.TWITCH_URL_LOG_ENABLED] !== false;
  const delay = stored[STORAGE_KEYS.TWITCH_HOVER_DELAY_MS];
  setHoverDelay(typeof delay === "number" ? delay : DEFAULTS.TWITCH_HOVER_DELAY_MS);

  watchNavigation();
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local") onSettingsChanged(changes);
  });
  start();
}

void init();
