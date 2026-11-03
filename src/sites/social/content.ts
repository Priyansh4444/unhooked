/**
 * Hide controls for X, Reddit, Instagram, TikTok, Facebook, LinkedIn and Threads. The rules are
 * one generated stylesheet gated on <html> state, so newly rendered posts are covered by CSS
 * and turning a control off restores the page without touching its nodes.
 */
import { runPageController } from "../../shared/page-runtime.ts";
import { resolveSettings } from "../../shared/preferences.ts";
import { compileSiteCss, controlSiteForHost, featureClass } from "../registry.ts";

const site = controlSiteForHost(location.hostname);

if (site && site.id !== "youtube") {
  const css = compileSiteCss(site);
  let style: HTMLStyleElement | null = null;
  const setAttribute = (html: HTMLElement, name: string, value: string): void => {
    if (html.getAttribute(name) !== value) html.setAttribute(name, value);
  };

  // CSS hides a video but doesn't stop it, and a hidden Reel keeps talking. Videos that play
  // while hidden, or are playing when their part of the page is hidden, are paused.
  const pauseHidden = (video: Element) => {
    if (video instanceof HTMLVideoElement && !video.paused && !video.checkVisibility())
      video.pause();
  };
  addEventListener("play", (event) => pauseHidden(event.target as Element), true);

  runPageController({
    render(raw, html) {
      if (!style) {
        style = document.createElement("style");
        style.id = "unhooked-social-rules";
        style.textContent = css;
      }
      if (!style.isConnected) html.appendChild(style);
      setAttribute(html, "data-uh-site", site.id);
      setAttribute(html, "data-uh-route", site.classify(new URL(location.href)));
      const state = resolveSettings(raw, site);
      for (const feature of site.features) {
        html.classList.toggle(
          featureClass(site.id, feature.id),
          !state.paused && state.enabled && Boolean(state.features[feature.id]),
        );
      }
      for (const video of document.querySelectorAll("video")) pauseHidden(video);
    },
  });
}
