/** YouTube: hide controls (controls.css, gated on <html> classes) in every frame, including embeds. */
import { runPageController } from "../../shared/page-runtime.ts";
import { youTubeOptions } from "../../shared/preferences.ts";
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

/** What decides the video's width. The player only re-measures when the window says to. */
let layoutOptions = "";

function tellPlayerIfLayoutChanged(): void {
  const next = options.extensionDisabled
    ? ""
    : [options.hideRelatedSidebar, options.hidePlaylistSidebar, options.hideLiveChat].join();
  if (next === layoutOptions || window.top !== window) {
    layoutOptions = next;
    return;
  }
  layoutOptions = next;
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

runPageController({
  documentEvents: ["yt-navigate-finish"],
  render(raw, html) {
    options = youTubeOptions(raw);
    applyOptionClasses(html, options, {
      isMobile: location.hostname === "m.youtube.com",
      isEmbed: location.pathname.startsWith("/embed/") || html.matches("html.embed"),
    });
    tellPlayerIfLayoutChanged();
    if (!options.extensionDisabled && options.disableAutoplay) scheduleAutoplayOff();
    else stopAutoplay();
  },
  stop: stopAutoplay,
});

// A new video's player starts at the old width too.
document.addEventListener("yt-navigate-finish", () => {
  if (window.top === window && !options.extensionDisabled && options.hideRelatedSidebar)
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
});
