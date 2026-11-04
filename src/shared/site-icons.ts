/** Popular sites' icons, which ship with the extension in icons/sites. */
import { SITE_ICON_HOSTS } from "./site-icon-hosts.ts";

const HOSTS = new Set(SITE_ICON_HOSTS);
/** Addresses that are another name for a site with an icon. */
const SAME_SITE: Record<string, string> = {
  "t.co": "x.com",
  "twitter.com": "x.com",
  "fxtwitter.com": "x.com",
  "vxtwitter.com": "x.com",
  "fixupx.com": "x.com",
  "fixvx.com": "x.com",
  "youtu.be": "youtube.com",
  "redd.it": "reddit.com",
  "threads.net": "threads.com",
  "whatsapp.com": "web.whatsapp.com",
  "telegram.org": "web.telegram.org",
  "bing.ai": "bing.com",
};

const pathOf = (host: string) => `icons/sites/${host}.png`;

/** This exact site's icon. */
export function ownSiteIcon(host: string): string | undefined {
  const name = host.replace(/^www\./, "");
  const same = SAME_SITE[name] ?? name;
  return HOSTS.has(same) ? pathOf(same) : undefined;
}

/** The icon of this site, or of the site it's part of, as docs.google.com is of Google. */
export function siteIcon(host: string): string | undefined {
  for (let name = host; name.includes("."); name = name.slice(name.indexOf(".") + 1)) {
    const icon = ownSiteIcon(name);
    if (icon) return icon;
  }
  return undefined;
}
