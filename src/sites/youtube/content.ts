/**
 * YouTube: hide controls (controls.css, gated on <html> classes) in every frame, including
 * embedded players, plus focus mode (focus.css) in the top frame only.
 */
import { runPageController } from "../../shared/page-runtime.ts";
import { youTubeOptions } from "../../shared/preferences.ts";
import { startYouTubeFocus } from "./focus.ts";
import { applyOptionClasses, type YouTubeOptions } from "./options.ts";

let options: YouTubeOptions = youTubeOptions({});
let autoplayTimer: ReturnType<typeof setInterval> | undefined;
let autoplayDeadline: ReturnType<typeof setTimeout> | undefined;

function stopAutoplay(): void {
  clearInterval(autoplayTimer);
  clearTimeout(autoplayDeadline);
  autoplayTimer = undefined;
  autoplayDeadline = undefined;
}

function turnOffAutoplay(): void {
  if (options.extensionDisabled || !options.disableAutoplay) {
    stopAutoplay();
    return;
  }
  const button = document.querySelector<HTMLElement>(".ytp-autonav-toggle-button");
  if (
    button &&
    (button.getAttribute("aria-checked") === "true" ||
      button.classList.contains("ytp-autonav-toggle-button-checked"))
  )
    button.click();
}

/** The player re-enables autoplay as it loads; keep switching it off for a while after renders. */
function scheduleAutoplayOff(): void {
  if (autoplayTimer !== undefined) return;
  turnOffAutoplay();
  autoplayTimer = setInterval(turnOffAutoplay, 800);
  autoplayDeadline = setTimeout(stopAutoplay, 120_000);
}

runPageController({
  documentEvents: ["yt-navigate-finish"],
  render(raw, html) {
    options = youTubeOptions(raw);
    applyOptionClasses(html, options, {
      isMobile: location.hostname === "m.youtube.com",
      isEmbed: location.pathname.startsWith("/embed/") || html.matches("html.embed"),
    });
    if (!options.extensionDisabled && options.disableAutoplay) scheduleAutoplayOff();
    else stopAutoplay();
  },
  stop: stopAutoplay,
});

if (window.top === window) startYouTubeFocus();
