/**
 * The arithmetic of counting time on sites. Pure, so it is unit-tested; time/background.ts feeds
 * it the browser's events and time/store.ts keeps what it produces.
 */
import { SITE_HOSTS, siteForHost } from "../sites/hosts.ts";

/** A site being counted, and since when. */
export interface Watch {
  host: string;
  since: number;
}

/** Part of a stretch of time that falls inside one hour of one day. */
export interface Slice {
  date: string;
  hour: number;
  host: string;
  seconds: number;
}

/**
 * The heartbeat comes every minute. A longer gap means the computer slept or the browser closed
 * while a site was in front, and that isn't time on the site.
 */
export const MAX_GAP_MS = 150_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day, so "today" means what the person looking at it thinks it means. */
export const dateKey = (when: Date | number): string => {
  const d = new Date(when);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A day key back to local midnight. */
export const dayStart = (date: string): Date => {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/**
 * The name time is counted under. A supported site is one thing however it's reached (x.com and
 * twitter.com); anything else is its host without www, so music.youtube.com stays itself.
 */
export function siteKey(hostname: string): string {
  const host = hostname.toLowerCase();
  const site = siteForHost(host);
  const name = site ? SITE_HOSTS[site][0] : host;
  return name.replace(/^www\./, "");
}

/** The site of a tab's address, or null for anything that isn't a web page. */
export function siteOfUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol, hostname } = new URL(url);
    return /^https?:$/.test(protocol) && hostname ? siteKey(hostname) : null;
  } catch {
    return null;
  }
}

/** Cuts a stretch of time at each hour boundary, in local time, ignoring what MAX_GAP_MS rules out. */
export function slicesOf(watch: Watch, now: number): Slice[] {
  const end = Math.min(now, watch.since + MAX_GAP_MS);
  const slices: Slice[] = [];
  let from = watch.since;
  while (from < end) {
    const at = new Date(from);
    const nextHour = new Date(at);
    nextHour.setHours(at.getHours() + 1, 0, 0, 0);
    const until = Math.min(end, nextHour.getTime());
    slices.push({
      date: dateKey(at),
      hour: at.getHours(),
      host: watch.host,
      seconds: (until - from) / 1000,
    });
    from = until;
  }
  return slices;
}

/** What counts right now, from what the browser says about the front tab. */
export interface FrontTab {
  url?: string;
  /** The window has the system's focus. */
  focused: boolean;
  incognito: boolean;
  audible: boolean;
  idle: "active" | "idle" | "locked";
}

export function hostToCount(
  tab: FrontTab | null,
  enabled: boolean,
  ignored: string[],
): string | null {
  if (!enabled || !tab || !tab.focused || tab.incognito) return null;
  // No input for a while still counts while the tab plays sound: that's someone watching a video.
  if (tab.idle === "locked" || (tab.idle === "idle" && !tab.audible)) return null;
  const host = siteOfUrl(tab.url);
  return host && !ignored.includes(host) ? host : null;
}

/** "14h 22m", "38m", "45s". Hours and minutes are what a habit is read in. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
