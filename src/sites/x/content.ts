/**
 * X's Layout switches: centering and text size. The look lives in style.css, gated on classes set
 * here on <html>; the things X's other switches hide come from the control registry.
 */
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

runPageController({
  render(raw, html) {
    const on = !isPaused(raw) && siteSwitchOn(raw, "x");
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
