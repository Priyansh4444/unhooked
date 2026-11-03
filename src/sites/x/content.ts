/**
 * X's Layout switches: centering and text size, and the film button on posts. The look lives in
 * style.css, gated on classes set here on <html>; the things X's other switches hide come from the
 * control registry.
 */
import { ext } from "../../shared/ext-api.ts";
import { FILM_START } from "../film/protocol.ts";
import { runPageController } from "../../shared/page-runtime.ts";
import { isPaused, siteSwitchOn } from "../../shared/switches.ts";
import { DEFAULTS, STORAGE_KEYS } from "../../shared/settings.ts";

const numberOr = (value: unknown, fallback: number): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Only writes a change, because the runtime re-renders after changes to <html>. */
function setVariable(html: HTMLElement, name: string, value: string | null): void {
  if (html.style.getPropertyValue(name) === (value ?? "")) return;
  if (value === null) html.style.removeProperty(name);
  else html.style.setProperty(name, value);
}

// ---- the film button, in each post's row of actions -------------------------------------------

const SLOT = "uh-film-slot";
const CHECK_EVERY_MS = 250;
// Drawn on X's own 24-unit grid and stroke, and sized from the icons beside it when it's placed.
const FILM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.2 8.5h15.6c.7 0 1.2.5 1.2 1.2v9.1c0 .7-.5 1.2-1.2 1.2H4.2c-.7 0-1.2-.5-1.2-1.2V9.7c0-.7.5-1.2 1.2-1.2z"/><path d="M3.4 8.4 19.6 4l.9 3.4M8.4 7l1.4 1.5M13.4 5.7l1.4 1.5"/></svg>';

const film = globalThis as {
  __unhookedFilm?: { frame(post: HTMLElement, alone: boolean): void };
};

/** Film mode is only loaded when it's wanted, not on every visit to X. */
async function framePost(post: HTMLElement): Promise<void> {
  if (!film.__unhookedFilm) await ext.runtime.sendMessage({ action: FILM_START });
  film.__unhookedFilm?.frame(post, true);
}

function filmSlot(post: HTMLElement): HTMLElement {
  const slot = document.createElement("div");
  slot.className = SLOT;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "uh-film-btn";
  button.title = "Frame this post";
  button.setAttribute("aria-label", "Frame this post in film mode");
  button.innerHTML = FILM_ICON;
  button.addEventListener("click", (event) => {
    // A click anywhere else on a post opens it.
    event.preventDefault();
    event.stopPropagation();
    void framePost(post);
  });
  slot.append(button);
  return slot;
}

/**
 * Directly left of the last action, Share, on every post and every layout, so the rest of the row
 * keeps X's own rhythm. X can draw actions after the rest, so this is checked again every time.
 */
function placeSlot(row: HTMLElement, slot: HTMLElement): void {
  const share = [...row.children].filter((child) => child !== slot).at(-1) ?? null;
  if (slot.parentElement === row && slot.nextElementSibling === share) return;
  // X's icons change size between the timeline and a post's own page, so copy them, not a number.
  const neighbour = share?.querySelector("svg") ?? row.querySelector("svg");
  if (neighbour) {
    slot.style.setProperty("--uh-film-size", `${neighbour.getBoundingClientRect().width}px`);
    slot.style.color = getComputedStyle(neighbour).color;
  }
  row.insertBefore(slot, share);
}

function addFilmButtons(): void {
  for (const row of document.querySelectorAll<HTMLElement>(
    'article[data-testid="tweet"] [role="group"]',
  )) {
    const slot =
      row.querySelector<HTMLElement>(`:scope > .${SLOT}`) ??
      filmSlot(row.closest<HTMLElement>("article")!);
    placeSlot(row, slot);
  }
}

let checking: ReturnType<typeof setTimeout> | undefined;
const postWatcher = new MutationObserver(() => {
  checking ??= setTimeout(() => {
    checking = undefined;
    addFilmButtons();
  }, CHECK_EVERY_MS);
});
let buttonsOn = false;

function setFilmButtons(on: boolean): void {
  if (on === buttonsOn) return;
  buttonsOn = on;
  if (on) {
    addFilmButtons();
    postWatcher.observe(document.documentElement, { subtree: true, childList: true });
    return;
  }
  postWatcher.disconnect();
  clearTimeout(checking);
  checking = undefined;
  for (const slot of document.querySelectorAll(`.${SLOT}`)) slot.remove();
}

runPageController({
  render(raw, html) {
    const on = !isPaused(raw) && siteSwitchOn(raw, "x");
    setFilmButtons(on && raw[STORAGE_KEYS.TWITTER_FILM_BUTTON] !== false);
    html.classList.toggle("uh-x-center", on && raw[STORAGE_KEYS.TWITTER_CENTER_TIMELINE] === true);
    const width = numberOr(raw[STORAGE_KEYS.TWITTER_WIDTH], DEFAULTS.TWITTER_WIDTH);
    setVariable(html, "--twitter-width", `${width}%`);

    const customFont = on && raw[STORAGE_KEYS.TWITTER_USE_DEFAULT_FONT] === false;
    html.classList.toggle("uh-x-font", customFont);
    const size = numberOr(raw[STORAGE_KEYS.TWITTER_FONT_SIZE], DEFAULTS.TWITTER_FONT_SIZE);
    setVariable(html, "--twitter-font-size", customFont ? `${size}px` : null);
    setVariable(
      html,
      "--twitter-icon-scale",
      customFont ? String(1 + (size / 15 - 1) * 0.5) : null,
    );
  },
});
