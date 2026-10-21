/**
 * Runs on every supported site: applies the wand's removals, and draws the hover preview the
 * popup and picker ask for ("this is what that control hides on this page").
 */
import { ext } from "../../shared/ext-api.ts";
import { escapeHtml, Overlay } from "../../shared/overlay.ts";
import { runPageController } from "../../shared/page-runtime.ts";
import { customRules, resolveSettings, type RawStorage } from "../../shared/preferences.ts";
import { siteForHost } from "../hosts.ts";
import { controlSiteById, featureClass } from "../registry.ts";
import { OPTION_CLASSES, type YouTubeOptionKey } from "../youtube/options.ts";
import { selectorsForOption } from "../youtube/selectors.ts";
import { PREVIEW_ACTION, WAND_ACTION, type PreviewRequest } from "./protocol.ts";
import { isEditableTarget } from "../../shared/keys.ts";
import { STORAGE_KEYS } from "../../shared/settings.ts";
import { matchesShortcut, wandShortcut } from "../../shared/shortcut.ts";

const siteId = siteForHost(location.hostname);

const valid = (selector: string): boolean => {
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
};

if (siteId && window.top === window) {
  let raw: RawStorage = {};
  let style: HTMLStyleElement | null = null;

  runPageController({
    render(storage, html) {
      raw = storage;
      const control = controlSiteById(siteId);
      const state = control ? resolveSettings(storage, control) : null;
      const off = state ? state.paused || !state.enabled : storage["unhooked.paused"] === true;
      const css = off
        ? ""
        : customRules(storage, siteId)
            .filter((rule) => valid(rule.selector))
            .map((rule) => `${rule.selector} { display: none !important; }`)
            .join("\n");
      if (!style) {
        style = document.createElement("style");
        style.id = "unhooked-custom-rules";
      }
      if (style.textContent !== css) style.textContent = css;
      if (!style.isConnected) html.appendChild(style);
    },
  });

  // ---- hover preview -----------------------------------------------------------------------
  let overlay: Overlay | null = null;
  let current: PreviewRequest | null = null;
  let frame = 0;

  const featureSelectors = (id: string): string[] => {
    const html = document.documentElement;
    if (siteId === "youtube") return selectorsForOption(id as YouTubeOptionKey, html);
    const route = html.dataset.uhRoute ?? "other";
    const feature = controlSiteById(siteId)?.features.find((f) => f.id === id);
    return (feature?.rules ?? [])
      .filter((rule) => rule.routes.includes("*") || rule.routes.includes(route as never))
      .flatMap((rule) => rule.selectors);
  };

  const selectorsFor = (request: PreviewRequest): string[] => [
    ...(request.selector ? [request.selector] : []),
    ...(request.selectors ?? []),
    ...[...(request.features ?? []), ...(request.feature ? [request.feature] : [])].flatMap(
      featureSelectors,
    ),
  ];

  const isHidden = (request: PreviewRequest): boolean => {
    const html = document.documentElement;
    if (request.selector)
      return customRules(raw, siteId).some((r) => r.selector === request.selector);
    if (!request.feature) return false;
    return siteId === "youtube"
      ? html.classList.contains(OPTION_CLASSES[request.feature as YouTubeOptionKey] ?? "")
      : html.classList.contains(featureClass(siteId, request.feature));
  };

  const draw = (): number => {
    frame = 0;
    if (!current) return 0;
    const elements = [
      ...new Set(
        selectorsFor(current).flatMap((selector) => {
          try {
            return [...document.querySelectorAll(selector)];
          } catch {
            return [];
          }
        }),
      ),
    ];
    const rects = elements
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .slice(0, 80);
    overlay ??= new Overlay();
    // Plain-text state for tests and debugging (the overlay's shadow root is closed).
    overlay.host.dataset.preview = String(rects.length);
    const title = `<b>${escapeHtml(current.label ?? "")}</b>`;
    if (rects.length) {
      overlay.show({
        rects,
        title,
        detail: rects.length > 1 ? `${rects.length} on this page` : "",
      });
    } else {
      overlay.show({
        rects: [],
        title,
        detail: isHidden(current) ? "hidden on this page" : "not on this page",
      });
    }
    return rects.length;
  };

  const redraw = () => {
    if (current && !frame) frame = requestAnimationFrame(() => void draw());
  };
  addEventListener("scroll", redraw, { passive: true, capture: true });
  addEventListener("resize", redraw);

  // ---- the wand shortcut ------------------------------------------------------------------
  addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (!matchesShortcut(event, wandShortcut(raw[STORAGE_KEYS.WAND_SHORTCUT]))) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      ext.runtime.sendMessage({ action: WAND_ACTION }).catch(() => {});
    },
    true,
  );

  ext.runtime.onMessage.addListener((message: PreviewRequest, _sender, sendResponse) => {
    if (message?.action !== PREVIEW_ACTION) return false;
    if (message.clear) {
      current = null;
      overlay?.clear();
      if (overlay) delete overlay.host.dataset.preview;
      sendResponse({ count: 0 });
      return false;
    }
    current = message;
    sendResponse({ count: draw() });
    return false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      current = null;
      overlay?.clear();
    }
  });
}
