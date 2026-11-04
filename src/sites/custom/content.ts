/**
 * Runs on every supported site, and on any other site the user has let the wand work on:
 * applies the wand's removals, skips feeds the user chose to skip, and starts the wand from its
 * shortcut. The hover preview is sites/preview, loaded only when something is hovered.
 */
import { ext } from "../../shared/ext-api.ts";
import { runPageController } from "../../shared/page-runtime.ts";
import { customRules, resolveSettings, type RawStorage } from "../../shared/preferences.ts";
import { redirectFor } from "../../shared/redirect.ts";
import { wandSiteFor } from "../hosts.ts";
import { controlSiteById, type ControlSite } from "../registry.ts";
import { WAND_ACTION } from "./protocol.ts";
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
}
