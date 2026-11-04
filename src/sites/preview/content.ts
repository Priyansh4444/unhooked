/**
 * The hover preview: outlines what a control or wand removal covers on this page, for the popup and
 * the picker. Loaded the first time something is hovered, so ordinary visits never pay for the
 * selector tables it needs.
 */
import { ext } from "../../shared/ext-api.ts";
import { escapeHtml, Overlay } from "../../shared/overlay.ts";
import { customKey, customRules, type RawStorage } from "../../shared/preferences.ts";
import { PREVIEW_ACTION, type PreviewRequest } from "../custom/protocol.ts";
import { wandSiteFor } from "../hosts.ts";
import { controlSiteById, featureClass } from "../registry.ts";
import { OPTION_CLASSES, type YouTubeOptionKey } from "../youtube/options.ts";
import { selectorsForOption } from "../youtube/selectors.ts";

const siteId = wandSiteFor(location.hostname);
const registry = globalThis as { __unhookedPreview?: boolean };

/** The removals, read when asked, for saying a hovered one is already hidden. */
let raw: RawStorage = {};
const customRulesNow = async () => {
  raw = await ext.storage.local.get(customKey(siteId));
};

if (window.top === window && !registry.__unhookedPreview) {
  registry.__unhookedPreview = true;
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

  ext.runtime.onMessage.addListener((message: PreviewRequest, _sender, sendResponse) => {
    if (message?.action !== PREVIEW_ACTION) return false;
    if (message.clear) {
      current = null;
      overlay?.clear();
      if (overlay) delete overlay.host.dataset.preview;
      sendResponse({ count: 0 });
      return false;
    }
    void customRulesNow().then(() => {
      current = message;
      sendResponse({ count: draw() });
    });
    return true;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      current = null;
      overlay?.clear();
    }
  });
}
