/**
 * The pages each site runs on. The manifests (build/manifest.ts), the focus registry
 * (focus/sites.ts), the control registry (sites/registry.ts) and the popup's current-site
 * detection are all generated from this, so a new site is added in one place.
 */
export const SITE_HOSTS = {
  youtube: ["www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  reddit: ["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "sh.reddit.com"],
  instagram: ["instagram.com", "www.instagram.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  facebook: ["facebook.com", "www.facebook.com"],
  linkedin: ["linkedin.com", "www.linkedin.com"],
  threads: ["threads.com", "www.threads.com", "threads.net", "www.threads.net"],
  twitch: ["www.twitch.tv", "twitch.tv", "m.twitch.tv"],
  excalidraw: ["excalidraw.com", "www.excalidraw.com"],
} as const;

export type SiteId = keyof typeof SITE_HOSTS;

export const SITE_IDS = Object.keys(SITE_HOSTS) as SiteId[];

export const siteForHost = (host: string): SiteId | undefined =>
  SITE_IDS.find((site) => (SITE_HOSTS[site] as readonly string[]).includes(host.toLowerCase()));

export const siteForUrl = (url: string | undefined): SiteId | undefined => {
  try {
    return url ? siteForHost(new URL(url).hostname) : undefined;
  } catch {
    return undefined;
  }
};

export const hostBelongsTo = (site: SiteId, url: string): boolean => siteForUrl(url) === site;

/** Hosts the background fetches Twitch link details from; also become host permissions. */
export const LOOKUP_HOSTS = [
  "www.youtube.com",
  "publish.x.com",
  "www.reddit.com",
  "vimeo.com",
  "open.spotify.com",
  "api.github.com",
  "github.com",
  "imgur.com",
  "lakebed.app",
  "*.lakebed.app",
] as const;

/**
 * Where a page's wand removals are kept: the site's id on a supported site, otherwise
 * `web:<hostname>` for any other site the user has let the wand work on.
 */
export const wandSiteFor = (host: string): string =>
  siteForHost(host) ?? `web:${host.toLowerCase()}`;

/** Match pattern for every page on one host, as granted for the wand. */
export const originPattern = (host: string): string => `*://${host.toLowerCase()}/*`;
