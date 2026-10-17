import { startFocusSite } from "../../focus/runtime.ts";
import { isYouTubeBackquoteShortcut } from "../../shared/keys.ts";

// Focus mode only flips `html.uh-focus-youtube` and nudges YouTube into theater mode. The look
// of focus mode is pure CSS (focus.css, loaded by the manifest) gated on that class,
// the watch-page marker and the theater attribute, so it can't leak onto other pages.

const ROOT_CLASS = "uh-focus-youtube";
const WATCH_ROOT = "ytd-watch-flexy, ytd-watch-grid";
const THEATER_BUTTON = ".ytp-size-button";
const PLAYER_WAIT_MS = 10_000;
const CLICK_SETTLE_MS = 800;
const MAX_THEATER_CLICKS = 5;
const POLL_MS = 100;

const onWatchPage = (): boolean => location.pathname === "/watch";

const getWatchRoot = (): Element | null => {
  for (const element of document.querySelectorAll(WATCH_ROOT)) {
    if (!element.hasAttribute("hidden")) return element;
  }
  return null;
};

const getTheaterButton = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>(THEATER_BUTTON);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve with `find()`'s result once truthy, or null on timeout / when superseded.
 * The clock only runs once the document has finished parsing: YouTube streams its HTML, so on a
 * slow connection the player can legitimately take a long time to show up.
 */
const waitFor = async <T>(
  find: () => T | null,
  isCurrent: () => boolean,
  timeoutMs = PLAYER_WAIT_MS,
): Promise<T | null> => {
  let waited = 0;
  while (waited <= timeoutMs && isCurrent()) {
    const found = find();
    if (found) return found;
    await sleep(POLL_MS);
    if (document.readyState !== "loading") waited += POLL_MS;
  }
  return null;
};

// Did *we* switch the player into theater mode? Only then do we switch it back afterwards.
let weEnabledTheater = false;
// Bumped on every request so a stale wait for the player can't act after the state moved on.
let theaterRequest = 0;

const enterTheater = async (): Promise<void> => {
  const request = ++theaterRequest;
  if (!onWatchPage()) return;

  const isCurrent = () => request === theaterRequest;
  const root = await waitFor(getWatchRoot, isCurrent);
  if (!root) return;

  // The button exists before the player wires up its click handler, so a click can be swallowed:
  // keep clicking, spaced out, until YouTube confirms with the `theater` attribute.
  let clicked = false;
  for (let attempt = 0; attempt < MAX_THEATER_CLICKS && isCurrent(); attempt++) {
    if (root.hasAttribute("theater")) {
      weEnabledTheater ||= clicked;
      return;
    }
    const button = await waitFor(getTheaterButton, isCurrent);
    if (!button) return;
    button.click();
    clicked = true;
    await waitFor(() => (root.hasAttribute("theater") ? true : null), isCurrent, CLICK_SETTLE_MS);
  }
};

const restoreTheater = async (): Promise<void> => {
  const request = ++theaterRequest;
  if (!weEnabledTheater || !onWatchPage()) return; // off-watch: retried on the next navigation

  const root = await waitFor(getWatchRoot, () => request === theaterRequest);
  if (!root || request !== theaterRequest) return;

  weEnabledTheater = false;
  if (root.hasAttribute("theater")) getTheaterButton()?.click();
};

// YouTube sizes the <video> in JS when the player resizes. Our CSS resizes the player behind its
// back, so without a nudge the video keeps its old size and leaves a gap (`t` then `` ` ``).
const relayoutPlayer = (): void => {
  const fire = () => window.dispatchEvent(new Event("resize"));
  requestAnimationFrame(fire);
  setTimeout(fire, 300);
};

/** Focus mode: theater, no recommendations, player fills the viewport. Top frame only. */
export function startYouTubeFocus(): void {
  // Pressing `t` with focus on flips the same layout on and off by itself.
  new MutationObserver(() => {
    if (document.documentElement.classList.contains(ROOT_CLASS)) relayoutPlayer();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["theater"],
    subtree: true,
  });

  startFocusSite({
    site: "youtube",
    isShortcut: isYouTubeBackquoteShortcut,
    navigationEvents: ["yt-navigate-finish"],
    apply(enabled) {
      document.documentElement.classList.toggle(ROOT_CLASS, enabled);
      relayoutPlayer();
      return enabled ? enterTheater() : restoreTheater();
    },
  });
}
