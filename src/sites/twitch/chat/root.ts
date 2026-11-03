/** Finding Twitch's chat (main page and popout). Selectors drift: keep them in one place. */

const CHAT_ROOT_SELECTORS = [
  '[data-a-target="chat-scroller"]',
  ".chat-scrollable-area__message-container",
  '[data-test-selector="chat-scrollable-area__message-container"]',
  ".chat-list--default",
  '[role="log"]',
];

const CHANNEL = "[a-zA-Z0-9_]{2,25}";
const CHAT_PATHS = [
  /\/popout\/.*\/chat/i,
  /\/embed\/.*chat/i,
  /^\/moderator\//i,
  new RegExp(`^/(?:popout/)?${CHANNEL}(?:/(?:chat|videos|clip|schedule|about|home))?/?$`, "i"),
  /^\/videos\/\d+/i,
  new RegExp(`^/${CHANNEL}/clip/`, "i"),
];

export const isLikelyTwitchChatPage = (pathname: string = location.pathname): boolean =>
  CHAT_PATHS.some((pattern) => pattern.test(pathname));

const NOT_A_CHANNEL = new Set(
  "directory videos settings downloads jobs p turbo wallet inventory subscriptions drops prime search".split(
    " ",
  ),
);

export function getChannelSlug(pathname: string = location.pathname): string {
  const slug = (pathname.match(/\/popout\/(\w{2,25})\/chat/i) ??
    pathname.match(/\/moderator\/(\w{2,25})/i) ??
    pathname.match(/^\/(\w{2,25})(?:\/|$)/))?.[1]?.toLowerCase();
  return slug && !NOT_A_CHANNEL.has(slug) ? slug : "unknown";
}

function findChatRoot(): Element | null {
  for (const selector of CHAT_ROOT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/** Calls `onFound` once chat exists (Twitch is a SPA: it may not yet). Aborting stops the wait. */
export function waitForChatRoot(onFound: (root: Element) => void, signal: AbortSignal): void {
  const existing = findChatRoot();
  if (existing) return onFound(existing);

  const observer = new MutationObserver(() => {
    const root = findChatRoot();
    if (!root) return;
    observer.disconnect();
    onFound(root);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
