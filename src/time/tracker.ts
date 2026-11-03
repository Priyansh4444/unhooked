/**
 * The arithmetic of counting time on sites. Pure, so it is unit-tested; time/background.ts feeds
 * it the browser's events and time/store.ts keeps what it produces.
 */
import { SITE_HOSTS, siteForHost } from "../sites/hosts.ts";

/** A site being counted: since the last count, and since it last came to the front. */
export interface Watch {
  host: string;
  since: number;
  stretch: number;
}

/** Part of a stretch of time that falls inside one hour of one day. */
export interface Slice {
  date: string;
  hour: number;
  host: string;
  seconds: number;
}

/** One unbroken visit to a site. `seconds` is time actually counted, `end - start` isn't. */
export interface Session {
  host: string;
  start: number;
  end: number;
  seconds: number;
}

export interface TrackerState {
  watch: Watch | null;
  /** Each site's visit still in progress, which a quick return can continue. */
  open: Record<string, Session>;
}

export const EMPTY_STATE: TrackerState = { watch: null, open: {} };

/**
 * The heartbeat comes every minute. A longer gap means the computer slept or the browser closed
 * while a site was in front. How much of it was real can't be known, so none of it counts.
 */
export const MAX_GAP_MS = 150_000;
/** Away from a site for less than this and it's the same visit: a glance at another window. */
export const SESSION_GAP_MS = 60_000;
/** Shorter than this is passing through a tab. It counts as time, but not as a session. */
export const MIN_SESSION_SECONDS = 5;
/** The browser reports idle this long after the last input. */
export const IDLE_SECONDS = 60;

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

/** Cuts a stretch of time at each hour boundary, in local time. */
export function slicesBetween(host: string, from: number, to: number, sign = 1): Slice[] {
  const slices: Slice[] = [];
  let at = from;
  while (at < to) {
    const when = new Date(at);
    const nextHour = new Date(when);
    nextHour.setHours(when.getHours() + 1, 0, 0, 0);
    const until = Math.min(to, nextHour.getTime());
    slices.push({
      date: dateKey(when),
      hour: when.getHours(),
      host,
      seconds: (sign * (until - at)) / 1000,
    });
    at = until;
  }
  return slices;
}

export interface Advance {
  state: TrackerState;
  /** Time to add. Negative where time already added turned out to be nobody there. */
  slices: Slice[];
  /** Visits that have ended and are long enough to keep. */
  closed: Session[];
}

/**
 * One step: credit what has passed to the site being counted, then take in what's in front now.
 * `wentIdle` says the site stopped being counted because the browser reported idle, which it does
 * a minute after the last input, so that last minute wasn't anyone using the site.
 */
export function advance(
  state: TrackerState,
  now: number,
  host: string | null,
  wentIdle = false,
): Advance {
  const open: Record<string, Session> = { ...state.open };
  const slices: Slice[] = [];
  const { watch } = state;

  if (watch && now > watch.since && now - watch.since <= MAX_GAP_MS) {
    slices.push(...slicesBetween(watch.host, watch.since, now));
    const session = open[watch.host];
    if (session)
      open[watch.host] = {
        ...session,
        end: now,
        seconds: session.seconds + (now - watch.since) / 1000,
      };
    if (wentIdle && !host) {
      const from = Math.max(watch.stretch, now - IDLE_SECONDS * 1000);
      slices.push(...slicesBetween(watch.host, from, now, -1));
      const counted = open[watch.host];
      if (counted)
        open[watch.host] = {
          ...counted,
          end: from,
          seconds: Math.max(0, counted.seconds - (now - from) / 1000),
        };
    }
  }

  const closed: Session[] = [];
  for (const [name, session] of Object.entries(open)) {
    const stillCounting = name === host && now - session.end <= SESSION_GAP_MS;
    if (!stillCounting && (name === host || now - session.end > SESSION_GAP_MS)) {
      delete open[name];
      if (session.seconds >= MIN_SESSION_SECONDS) closed.push(session);
    }
  }
  if (host && !open[host]) open[host] = { host, start: now, end: now, seconds: 0 };

  const continuing = watch?.host === host && now - (watch?.since ?? 0) <= MAX_GAP_MS;
  return {
    state: {
      open,
      watch: host ? { host, since: now, stretch: continuing ? watch!.stretch : now } : null,
    },
    slices,
    closed,
  };
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
