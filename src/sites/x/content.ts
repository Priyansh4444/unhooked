import { startFocusSite } from "../../focus/runtime.ts";
import { ext } from "../../shared/ext-api.ts";
import { isTwitterToggleShortcut } from "../../shared/keys.ts";
import { DEFAULTS, STORAGE_KEYS, type TwitterFocusControls } from "../../shared/settings.ts";

// The look lives in style.css, gated on classes set here on <html>. This script turns the user's
// settings into those classes and keeps a toggle button in X's header.

const ACTIVE_CLASS = "uh-focus-x";
const BUTTON_ID = "uh-focus-x-toggle";
const SETTING_KEYS = [
  STORAGE_KEYS.TWITTER_WIDTH,
  STORAGE_KEYS.TWITTER_FONT_SIZE,
  STORAGE_KEYS.TWITTER_USE_DEFAULT_FONT,
  STORAGE_KEYS.TWITTER_FOCUS_CONTROLS,
];

/** <html> class -> which focus control turns it on. The header hides with the centred timeline. */
const CONTROL_CLASSES: [string, keyof TwitterFocusControls][] = [
  ["uh-focus-x-hide-sidebar", "hideSidebarColumn"],
  ["uh-focus-x-hide-chat", "hideChatDrawer"],
  ["uh-focus-x-hide-grok", "hideGrokDrawer"],
  ["uh-focus-x-hide-header", "centerTimeline"],
  ["uh-focus-x-center-timeline", "centerTimeline"],
];
const FONT_CLASS = "uh-focus-x-custom-font";
const VARIABLES = ["--twitter-width", "--twitter-font-size", "--twitter-icon-scale"];

const root = document.documentElement;

const numberOr = (value: unknown, fallback: number): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

async function applySettings(): Promise<void> {
  const raw = await ext.storage.local.get(SETTING_KEYS);
  const stored = raw[STORAGE_KEYS.TWITTER_FOCUS_CONTROLS];
  const controls: TwitterFocusControls = {
    ...DEFAULTS.TWITTER_FOCUS_CONTROLS,
    ...(stored && typeof stored === "object" ? stored : {}),
  };
  for (const [className, control] of CONTROL_CLASSES) {
    root.classList.toggle(className, Boolean(controls[control]));
  }

  root.style.setProperty(
    "--twitter-width",
    `${numberOr(raw[STORAGE_KEYS.TWITTER_WIDTH], DEFAULTS.TWITTER_WIDTH)}%`,
  );
  const customFont = raw[STORAGE_KEYS.TWITTER_USE_DEFAULT_FONT] === false;
  root.classList.toggle(FONT_CLASS, customFont);
  if (customFont) {
    const size = numberOr(raw[STORAGE_KEYS.TWITTER_FONT_SIZE], DEFAULTS.TWITTER_FONT_SIZE);
    root.style.setProperty("--twitter-font-size", `${size}px`);
    root.style.setProperty("--twitter-icon-scale", String(1 + (size / 15 - 1) * 0.5));
  } else {
    root.style.removeProperty("--twitter-font-size");
    root.style.removeProperty("--twitter-icon-scale");
  }
}

function clearSettings(): void {
  root.classList.remove(FONT_CLASS, ...CONTROL_CLASSES.map(([className]) => className));
  for (const variable of VARIABLES) root.style.removeProperty(variable);
}

// ---- toggle button in the header ---------------------------------------------------------------

const PRIMARY_COLUMN = '[data-testid="primaryColumn"]';
// Anything inside the feed itself: never a place for the button.
const FEED_CONTENT = 'article, [data-testid="cellInnerDiv"]';

/** Nearest ancestor of `from` that is a full-width flex row: the header's own row. */
function findHeaderRow(from: HTMLElement, column: HTMLElement): HTMLElement | null {
  const minWidth = column.getBoundingClientRect().width * 0.5;
  for (let node = from.parentElement; node && node !== column; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      style.display.includes("flex") &&
      style.flexDirection === "row" &&
      node.getBoundingClientRect().width >= minWidth
    ) {
      return node;
    }
  }
  return null;
}

/**
 * The header at the top of the main column: the For you / Following tabs on the home timeline,
 * or the back-arrow + title row on posts, profiles and the like. Never the feed itself.
 */
function headerRow(): HTMLElement | null {
  const column = document.querySelector<HTMLElement>(PRIMARY_COLUMN);
  if (!column) return null;

  const tabList = column.querySelector<HTMLElement>("[data-testid='ScrollSnap-SwipeableList']");
  if (tabList && !tabList.closest(FEED_CONTENT)) {
    return tabList.closest<HTMLElement>("nav") ?? findHeaderRow(tabList, column);
  }

  const back = column.querySelector<HTMLElement>("[data-testid='app-bar-back']");
  if (back && !back.closest(FEED_CONTENT)) return findHeaderRow(back, column);

  // Only the first heading can be the header; later ones belong to the feed.
  const heading = column.querySelector<HTMLElement>("h2[role='heading']");
  return heading && !heading.closest(FEED_CONTENT) ? findHeaderRow(heading, column) : null;
}

const ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="3" x2="9" y2="21"/></svg>';

function placeButton(): void {
  const existing = document.getElementById(BUTTON_ID);
  // A button anywhere but the header (e.g. left over after navigating) must go.
  if (existing?.closest(PRIMARY_COLUMN) && !existing.closest(FEED_CONTENT)) return;
  existing?.remove();

  const target = headerRow();
  if (!target) return;
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.setAttribute("aria-label", "Toggle clean view");
  button.setAttribute("aria-pressed", String(root.classList.contains(ACTIVE_CLASS)));
  button.innerHTML = ICON_SVG;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void focus.toggle();
  });
  target.appendChild(button);
}

const focus = startFocusSite({
  site: "x",
  isShortcut: isTwitterToggleShortcut,
  watchUrlChanges: true,
  settingKeys: SETTING_KEYS,
  async apply(enabled) {
    if (enabled) await applySettings();
    else clearSettings();
    root.classList.toggle(ACTIVE_CLASS, enabled);
    document.getElementById(BUTTON_ID)?.setAttribute("aria-pressed", String(enabled));
    placeButton();
  },
});

// X re-renders its header often; keep the toggle button attached (at most once per frame).
let checkScheduled = false;
new MutationObserver(() => {
  if (checkScheduled) return;
  checkScheduled = true;
  requestAnimationFrame(() => {
    checkScheduled = false;
    placeButton();
  });
}).observe(root, { subtree: true, childList: true });
