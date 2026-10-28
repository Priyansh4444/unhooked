/**
 * Runs on every supported site, and on any other site the user has let the wand work on:
 * applies the wand's removals, skips feeds the user chose to skip, starts the wand from its
 * shortcut, and draws the hover preview the popup and picker ask for ("this is what that
 * control hides on this page").
 */
import { ext } from "../../shared/ext-api.ts";
import { escapeHtml, Overlay } from "../../shared/overlay.ts";
import { runPageController } from "../../shared/page-runtime.ts";
import { customRules, resolveSettings, type RawStorage } from "../../shared/preferences.ts";
import { redirectFor } from "../../shared/redirect.ts";
import { wandSiteFor } from "../hosts.ts";
import { controlSiteById, featureClass, type ControlSite } from "../registry.ts";
import { OPTION_CLASSES, type YouTubeOptionKey } from "../youtube/options.ts";
import { selectorsForOption } from "../youtube/selectors.ts";
import { PREVIEW_ACTION, WAND_ACTION, type PreviewRequest } from "./protocol.ts";
import { isEditableTarget } from "../../shared/keys.ts";
import { STORAGE_KEYS } from "../../shared/settings.ts";
import { matchesShortcut, wandShortcut } from "../../shared/shortcut.ts";

const siteId = wandSiteFor(location.hostname);
// The popup injects this script into a page it was just allowed on; the registered copy takes
// over from the next load. One copy per page.
const registry = globalThis as { __unhookedCustom?: boolean };

/** While a redirect waits for the account name, the page stays blank instead of showing a feed. */
const SKIPPING = "html[data-uh-skipping] body { visibility: hidden !important; }";

const valid = (selector: string): boolean => {
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
};

/** The signed-in account, for targets like Instagram's "/{user}/saved/". */
const USER_KEY = (site: string) => `unhooked.user.${site}`;
const ONE_SEGMENT = /^\/([A-Za-z0-9._]{1,30})\/?$/;
const RESERVED = /^(explore|reels|reel|direct|accounts|stories|p|tv|about|legal|web)$/;

function findUser(): string | null {
  // Instagram: the navigation's own-profile link (the one with the account's picture), outside
  // the feed and the suggestions.
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]:has(img)")) {
    if (link.closest("main, article, [role='dialog']")) continue;
    const name = ONE_SEGMENT.exec(link.getAttribute("href") ?? "")?.[1];
    if (name && !RESERVED.test(name)) return name;
  }
  return null;
}

function skipFeeds(control: ControlSite, storage: RawStorage, html: HTMLElement): void {
  const settings = resolveSettings(storage, control);
  const url = new URL(location.href);
  const cached = storage[USER_KEY(control.id)];
  let decision = redirectFor(control, url, settings, typeof cached === "string" ? cached : null);
  if (decision && "needsUser" in decision) {
    // Keep the feed out of sight while the page shows who is signed in.
    html.dataset.uhSkipping = "";
    const user = findUser();
    if (!user) return;
    void ext.storage.local.set({ [USER_KEY(control.id)]: user });
    decision = redirectFor(control, url, settings, user);
  }
  delete html.dataset.uhSkipping;
  if (decision && "go" in decision) location.replace(decision.go);
}

if (window.top === window && !registry.__unhookedCustom) {
  registry.__unhookedCustom = true;
  let raw: RawStorage = {};
  let style: HTMLStyleElement | null = null;
  let userTimer: number | undefined;

  runPageController({
    render(storage, html) {
      raw = storage;
      const control = controlSiteById(siteId);
      const state = control ? resolveSettings(storage, control) : null;
      const off = state ? state.paused || !state.enabled : storage["unhooked.paused"] === true;
      if (control) {
        skipFeeds(control, storage, html);
        // Waiting on the account name: look again until the page has drawn its navigation.
        clearInterval(userTimer);
        if (html.dataset.uhSkipping !== undefined) {
          let tries = 0;
          userTimer = window.setInterval(() => {
            if (++tries > 50) {
              clearInterval(userTimer);
              delete html.dataset.uhSkipping;
            } else skipFeeds(control, raw, html);
          }, 100);
        }
      }
      const css = off
        ? ""
        : customRules(storage, siteId)
            .filter((rule) => valid(rule.selector))
            .map((rule) => `${rule.selector} { display: none !important; }`)
            .concat(SKIPPING)
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
