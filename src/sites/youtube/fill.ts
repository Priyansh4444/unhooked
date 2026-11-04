/**
 * The video fills the window, in the page and without going full screen. ` and a button in the
 * player do it for this tab, which remembers through reloads and new videos; the "Fill the window"
 * switch does it everywhere. It's theater mode plus CSS, so YouTube keeps a state it understands: T
 * leaves and comes back to the same layout, and off a watch page nothing applies.
 */
import { ext } from "../../shared/ext-api.ts";
import { isEditableTarget } from "../../shared/keys.ts";
import { preferenceKey } from "../../shared/preferences.ts";

const STORAGE_KEY = preferenceKey("youtube", "fillTheater");
const TAB_KEY = "unhooked.fill";
const FILL_CLASS = "uh-fill-theater";
const WATCH = "ytd-watch-flexy:not([hidden]), ytd-watch-grid:not([hidden])";
/** A stream's own address, /live/ID, keeps its address on the same watch page. */
const WATCH_PATH = /^\/(watch$|live\/)/;
const SIZE_BUTTON = ".ytp-size-button";
const OPEN_MENUS = ".ytp-popup, tp-yt-iron-dropdown, tp-yt-paper-dialog";
const LABEL = "Fill the window";
const LEAVE_LABEL = "Stop filling the window";
const SHORTCUT = "`";
const SVG = "http://www.w3.org/2000/svg";
const ICON_FILL = "M7 11V8h3M17 13v3h-3";
const ICON_LEAVE = "M10 8v3H7M14 16v-3h3";
/** The theater button exists before the player wires it up, so a click can be swallowed. */
const CLICK_SETTLE_MS = 800;
const MOST_CLICKS = 5;
const PLAYER_POLL_MS = 200;
const PLAYER_WAIT_MS = 10_000;
/** The player's controls arrive some time after the page says it has finished navigating. */
const PLACE_RETRIES_MS = [1000, 3000];
/** Where YouTube puts a control's tooltip: just above the progress bar. */
const TIP_ABOVE_BUTTON_PX = 22;
const TIP_EDGE_PX = 12;

let on = false;
let off = false;
let always = false;
let forThisTab = readTab();
let weEnteredTheater = false;
let theaterRequest = 0;
let button: HTMLButtonElement | null = null;
let iconPath: SVGPathElement | null = null;
let tip: HTMLElement | null = null;
let tipText: HTMLElement | null = null;
let observed: Element | null = null;
const timers = new Set<ReturnType<typeof setTimeout>>();

/** sessionStorage: one tab's, gone with the tab, and it can throw on a locked-down page. */
function readTab(): boolean {
  try {
    return sessionStorage.getItem(TAB_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTab(value: boolean): void {
  forThisTab = value;
  try {
    if (value) sessionStorage.setItem(TAB_KEY, "1");
    else sessionStorage.removeItem(TAB_KEY);
  } catch {
    // It still holds until the page goes away.
  }
}

const watchRoot = (): Element | null => document.querySelector(WATCH);
const inTheater = (): boolean => watchRoot()?.hasAttribute("theater") ?? false;
const isFilling = (): boolean => on && inTheater();

const later = (work: () => void, ms: number): void => {
  const timer = setTimeout(() => {
    timers.delete(timer);
    work();
  }, ms);
  timers.add(timer);
};

/** YouTube sizes the video in script when the window resizes, and CSS resized the player. */
function relayoutPlayer(): void {
  const tell = () => window.dispatchEvent(new Event("resize"));
  requestAnimationFrame(tell);
  later(tell, 300);
}

/** Keeps clicking, spaced out, until YouTube confirms: it ignores a click while it's changing. */
function moveTheater(target: boolean): void {
  const request = ++theaterRequest;
  if (!WATCH_PATH.test(location.pathname)) return;
  const giveUpAt = Date.now() + PLAYER_WAIT_MS;
  let clicks = 0;
  const attempt = (): void => {
    if (request !== theaterRequest || inTheater() === target || clicks === MOST_CLICKS) return;
    if (Date.now() > giveUpAt) return;
    const size = watchRoot() && document.querySelector<HTMLElement>(SIZE_BUTTON);
    if (!size) {
      later(attempt, PLAYER_POLL_MS);
      return;
    }
    clicks += 1;
    size.click();
    later(attempt, CLICK_SETTLE_MS);
  };
  attempt();
}

function enterTheater(): void {
  if (!inTheater()) weEnteredTheater = true;
  moveTheater(true);
}

/** Only what we did ourselves is undone: a theater you chose stays. */
function restoreTheater(): void {
  if (weEnteredTheater) moveTheater(false);
  else theaterRequest += 1;
  weEnteredTheater = false;
}

function stopFilling(): void {
  writeTab(false);
  if (always) void ext.storage.local.set({ [STORAGE_KEY]: false }).catch(() => {});
  else applyState();
}

function toggle(): void {
  if (off || !watchRoot() || document.fullscreenElement) return;
  if (on && !inTheater()) {
    enterTheater();
  } else if (on) {
    stopFilling();
  } else {
    window.scrollTo(0, 0);
    writeTab(true);
    applyState();
  }
}

function showTip(): void {
  const player = button?.closest("#movie_player");
  if (!button || !player) return;
  if (!tip) {
    // YouTube's own classes, so it looks like the tooltips beside it and follows their changes.
    tip = document.createElement("div");
    tip.className = "ytp-tooltip ytp-bottom uh-fill-tip";
    const wrapper = document.createElement("div");
    wrapper.className = "ytp-tooltip-text-wrapper";
    const row = document.createElement("div");
    row.className = "ytp-tooltip-bottom-text";
    tipText = document.createElement("span");
    tipText.className = "ytp-tooltip-text";
    const shortcut = document.createElement("div");
    shortcut.className = "ytp-tooltip-keyboard-shortcut";
    shortcut.textContent = SHORTCUT;
    row.append(tipText, shortcut);
    wrapper.append(row);
    tip.append(wrapper);
  }
  tipText!.textContent = isFilling() ? LEAVE_LABEL : LABEL;
  player.append(tip);
  const box = button.getBoundingClientRect();
  const area = player.getBoundingClientRect();
  const center = box.left + box.width / 2 - area.left;
  const most = Math.max(0, area.width - tip.offsetWidth - TIP_EDGE_PX);
  tip.style.left = `${Math.min(most, Math.max(TIP_EDGE_PX, center - tip.offsetWidth / 2))}px`;
  tip.style.top = `${box.top - area.top - tip.offsetHeight - TIP_ABOVE_BUTTON_PX}px`;
}

const hideTip = (): void => tip?.remove();

function makeButton(): HTMLButtonElement {
  const made = document.createElement("button");
  made.className = "ytp-button uh-fill-btn";
  made.type = "button";
  made.setAttribute("aria-keyshortcuts", SHORTCUT);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const frame = document.createElementNS(SVG, "rect");
  for (const [name, value] of Object.entries({ x: 2, y: 4, width: 20, height: 16, rx: 2 }))
    frame.setAttribute(name, String(value));
  iconPath = document.createElementNS(SVG, "path");
  svg.append(frame, iconPath);
  made.append(svg);
  made.addEventListener("click", toggle);
  made.addEventListener("mouseenter", showTip);
  made.addEventListener("mouseleave", hideTip);
  made.addEventListener("focus", showTip);
  made.addEventListener("blur", hideTip);
  return made;
}

/** Brings the button in line with the page. Only touches the DOM when something's changed. */
function syncButton(): void {
  const size = document.querySelector(SIZE_BUTTON);
  const root = watchRoot();
  if (!size || !root) return;
  button ??= makeButton();
  if (button.nextElementSibling !== size) size.before(button);
  const filling = isFilling();
  if (button.getAttribute("aria-pressed") !== String(filling)) {
    button.setAttribute("aria-pressed", String(filling));
    button.setAttribute("aria-label", filling ? LEAVE_LABEL : LABEL);
    iconPath?.setAttribute("d", filling ? ICON_LEAVE : ICON_FILL);
    if (tip?.isConnected) showTip();
  }
  if (observed === root) return;
  theaterWatcher.disconnect();
  theaterWatcher.observe(root, { attributes: true, attributeFilter: ["theater"] });
  observed = root;
}

/** T, the theater button or YouTube itself changed theater. Filling comes back with it. */
const theaterWatcher = new MutationObserver(() => {
  syncButton();
  if (on) relayoutPlayer();
});

const anyMenuOpen = (): boolean =>
  [...document.querySelectorAll(OPEN_MENUS)].some((menu) => menu.checkVisibility());

function onKey(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
  if (isEditableTarget(event.composedPath()[0] ?? event.target)) return;
  if (event.code === "Backquote" || event.key === SHORTCUT) {
    if (off || !watchRoot()) return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  } else if (event.key === "Escape" && !always && isFilling() && !anyMenuOpen()) {
    // Not with the switch on: stopping then turns it off in every tab, too much for a stray Esc.
    stopFilling();
  }
}

function onNavigated(): void {
  if (on) enterTheater();
  syncButton();
  for (const ms of PLACE_RETRIES_MS) later(syncButton, ms);
}

function applyState(): void {
  const wanted = (always || forThisTab) && !off;
  // The same answer the render gives through tabFills, or the two would fight over the class.
  document.documentElement.classList.toggle(FILL_CLASS, wanted);
  if (wanted !== on) {
    on = wanted;
    if (on) enterTheater();
    else restoreTheater();
    relayoutPlayer();
  }
  syncButton();
}

/** Called on every render, with the current options. */
export function setFillOptions(next: { enabled: boolean; off: boolean }): void {
  always = next.enabled;
  off = next.off;
  applyState();
}

/** This tab asked to fill the window, whatever the switch says. */
export const tabFills = (): boolean => forThisTab;

export function startFill(): void {
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("yt-navigate-finish", onNavigated);
}

export function stopFill(): void {
  document.removeEventListener("keydown", onKey, true);
  document.removeEventListener("yt-navigate-finish", onNavigated);
  theaterWatcher.disconnect();
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  button?.remove();
  hideTip();
  if (!always) document.documentElement.classList.remove(FILL_CLASS);
}
