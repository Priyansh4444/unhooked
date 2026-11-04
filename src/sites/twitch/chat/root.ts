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

/** How often to look for chat while it isn't there. */
const LOOK_MS = 500;

/**
 * Calls `onFound` once chat exists (Twitch is a SPA: it may not yet). Aborting stops the wait.
 * On a timer, not a watch on the document: Twitch changes its page constantly, and each change
 * would mean five more searches of it, on any page without a chat, for as long as it's open.
 */
export function waitForChatRoot(onFound: (root: Element) => void, signal: AbortSignal): void {
  const existing = findChatRoot();
  if (existing) return onFound(existing);

  const timer = setInterval(() => {
    const root = findChatRoot();
    if (!root) return;
    clearInterval(timer);
    onFound(root);
  }, LOOK_MS);
  signal.addEventListener("abort", () => clearInterval(timer), { once: true });
}
