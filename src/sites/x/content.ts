/**
 * X's Layout switches: centering and text size, and the film button on posts. The look lives in
 * style.css, gated on classes set here on <html>; the things X's other switches hide come from the
 * control registry.
 */
import { filmMode } from "../film/film.ts";
import { runPageController } from "../../shared/page-runtime.ts";
import { isPaused, siteSwitchOn } from "../../shared/preferences.ts";
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
const FILM_ICON =
  '<svg viewBox="0 0 16 16" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.75 5.25h10.5a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75z"/><path d="M2.2 5.2 12.9 2.4l.6 2.2M5.4 4.4l.8 1M8.6 3.6l.8 1"/></svg>';

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
    filmMode().frame(post, true);
  });
  slot.append(button);
  return slot;
}

function addFilmButtons(): void {
  for (const row of document.querySelectorAll<HTMLElement>(
    'article[data-testid="tweet"] [role="group"]',
  )) {
    if (row.querySelector(`:scope > .${SLOT}`)) continue;
    const post = row.closest<HTMLElement>("article")!;
    // Beside bookmark and share, where the actions on a post itself live.
    const before = [...row.children].find((child) =>
      child.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]'),
    );
    const slot = filmSlot(post);
    // On a post's own page each action takes an equal share of the row, so this one does too.
    if (before && getComputedStyle(before).flexGrow !== "0") slot.classList.add("uh-film-share");
    row.insertBefore(slot, before ?? null);
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
