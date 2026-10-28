/**
 * "Skip the feeds": instead of hiding a feed, leave its page for one the user chose. Pure, so the
 * rules are unit-tested; sites/custom/content.ts does the navigating.
 */
import type { ControlSite } from "../sites/registry.ts";
import { isSitePath, type SiteSettings } from "./preferences.ts";

export type RedirectDecision =
  | { go: string }
  /** The target names the signed-in account, which the page hasn't shown yet. */
  | { needsUser: true }
  | null;

export function redirectFor(
  site: ControlSite,
  url: URL,
  settings: SiteSettings,
  user?: string | null,
): RedirectDecision {
  if (settings.paused || !settings.enabled || !settings.redirect) return null;
  const route = site.classify(url);
  // A Short opens in the normal player instead, where it is one video rather than a feed.
  if (site.id === "youtube" && route === "shorts") {
    const id = url.pathname.split("/")[2];
    return id ? { go: new URL(`/watch?v=${encodeURIComponent(id)}`, url.origin).href } : null;
  }
  if (!site.redirect.routes.includes(route)) return null;
  let path = settings.redirectTo;
  if (path.includes("{user}")) {
    if (!user) return { needsUser: true };
    path = path.replaceAll("{user}", encodeURIComponent(user));
  }
  if (!isSitePath(path)) return null;
  const target = new URL(path, url.origin);
  // Never into another skipped page (a loop), and never to where we already are.
  if (site.redirect.routes.includes(site.classify(target)) || target.href === url.href) return null;
  return { go: target.href };
}
