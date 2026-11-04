/** Turns the stored days into what the page and the share card show. Pure, so it is unit-tested. */
import { SITE_HOSTS } from "../sites/hosts.ts";
import { CONTROL_SITES } from "../sites/registry.ts";
import type { DayRecord } from "./store.ts";
import {
  MIN_SESSION_SECONDS,
  SESSION_GAP_MS,
  dateKey,
  dayStart,
  formatDuration,
  siteKey,
  type Session,
} from "./tracker.ts";

export type Range = "today" | "7" | "30" | "90" | "all";

export const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7": "7 days",
  "30": "30 days",
  "90": "90 days",
  all: "All time",
};

export interface Point {
  key: string;
  /** Under the point, when there's room. */
  label: string;
  /** In the tooltip and the table. */
  title: string;
  seconds: number;
  /** The period the page is "in": today, this hour. */
  current: boolean;
  /** Later today: it has a place on the axis, and nothing to show yet. */
  future?: boolean;
}

export interface SiteRow {
  host: string;
  seconds: number;
  share: number;
  /** A site Unhooked has feed controls for. */
  feed: boolean;
}

export interface Bucket {
  label: string;
  count: number;
}

export interface SessionStats {
  count: number;
  average: number;
  median: number;
  longest: Session | null;
  /** The longest few, longest first. */
  top: Session[];
  shortest: Session | null;
  /** Time spent in sessions of LONG_STRETCH_SECONDS or more. */
  inLongStretches: number;
  /** That, as a share of all time in sessions. */
  longStretchShare: number;
  buckets: Bucket[];
}

export interface SiteSessions {
  count: number;
  average: number;
  shortest: number;
  longest: number;
}

export interface View {
  range: Range;
  site: string | null;
  total: number;
  /** The same length of time just before, to compare with. Null when there's nothing to compare. */
  previous: number | null;
  points: Point[];
  sites: SiteRow[];
  /** Seconds by weekday (Monday first) and hour. */
  heat: number[][];
  dailyAverage: number;
  feedShare: number;
  activeDays: number;
  peakHour: number | null;
  /** The busiest point, for naming it. */
  peak: Point | null;
  sessions: SessionStats;
  bySite: Record<string, SiteSessions>;
  /** The first day sessions were counted, when this period reaches further back. */
  sessionsSince: string | null;
}

/** A stretch this long on one thing, without leaving for more than a minute, counts as long. */
export const LONG_STRETCH_SECONDS = 600;
const BUCKETS: [string, number][] = [
  ["<1m", 60],
  ["1–5m", 300],
  ["5–15m", 900],
  ["15–30m", 1800],
  ["30–60m", 3600],
  ["1h+", Infinity],
];

const TOP_SESSIONS = 5;

/** The longest session on each site, for the sites with the longest ones. */
function longestOnEachSite(bySite: Map<string, Session[]>): Session[] {
  const longest = [...bySite.values()].map((list) =>
    list.reduce((best, session) => (session.seconds > best.seconds ? session : best)),
  );
  return longest.sort((a, b) => b.seconds - a.seconds).slice(0, TOP_SESSIONS);
}

export function summarizeSessions(sessions: Session[]): SessionStats {
  const sorted = [...sessions].sort((a, b) => a.seconds - b.seconds);
  const total = sorted.reduce((sum, session) => sum + session.seconds, 0);
  const middle = sorted.length / 2;
  const inLongStretches = sorted
    .filter((session) => session.seconds >= LONG_STRETCH_SECONDS)
    .reduce((sum, session) => sum + session.seconds, 0);
  return {
    count: sorted.length,
    average: sorted.length ? total / sorted.length : 0,
    median: !sorted.length
      ? 0
      : sorted.length % 2
        ? sorted[Math.floor(middle)]!.seconds
        : (sorted[middle - 1]!.seconds + sorted[middle]!.seconds) / 2,
    longest: sorted.at(-1) ?? null,
    top: sorted.slice(-TOP_SESSIONS).reverse(),
    shortest: sorted[0] ?? null,
    inLongStretches,
    longStretchShare: total ? inLongStretches / total : 0,
    buckets: BUCKETS.map(([label, under], i) => ({
      label,
      count: sorted.filter(
        (session) => session.seconds < under && session.seconds >= (i ? BUCKETS[i - 1]![1] : 0),
      ).length,
    })),
  };
}

/** Sessions on any site joined into stretches online, broken by a gap of over a minute. */
export function joinSessions(sessions: Session[]): Session[] {
  const joined: Session[] = [];
  for (const session of [...sessions].sort((a, b) => a.start - b.start)) {
    const last = joined.at(-1);
    if (last && session.start - last.end <= SESSION_GAP_MS) {
      last.end = Math.max(last.end, session.end);
      last.seconds += session.seconds;
      last.host = last.host === session.host ? last.host : "";
    } else joined.push({ ...session });
  }
  return joined;
}

const FEED_HOSTS = new Set<string>(CONTROL_SITES.map((site) => siteKey(SITE_HOSTS[site.id][0])));
export const isFeedHost = (host: string): boolean => FEED_HOSTS.has(host);

const DAY_MS = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "short" });
const LONG_WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "long" });
const SHORT_DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const LONG_DATE = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "short",
  day: "numeric",
});

/** The hours that count, ending now, for comparing a part-finished day fairly. */
const secondsIn = (record: DayRecord | undefined, site: string | null, upToHour = 23): number => {
  if (!record) return 0;
  let total = 0;
  for (const [host, hours] of Object.entries(record.hosts)) {
    if (site && host !== site) continue;
    for (const [hour, seconds] of Object.entries(hours)) {
      if (Number(hour) <= upToHour) total += seconds;
    }
  }
  return total;
};

const shiftDays = (date: string, by: number): string => {
  const moved = dayStart(date);
  moved.setDate(moved.getDate() + by);
  return dateKey(moved);
};

export const hourLabel = (hour: number): string => {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
};

/** Monday first, whatever the locale's calendar: the shape of a working week reads best that way. */
const weekdayIndex = (date: string): number => (dayStart(date).getDay() + 6) % 7;

/** One name per site, whatever older records called it, so no site is listed twice. */
function mergedDays(days: DayRecord[]): DayRecord[] {
  return days.map((record) => {
    const hosts: DayRecord["hosts"] = {};
    for (const [name, hours] of Object.entries(record.hosts)) {
      const merged = (hosts[siteKey(name)] ??= {});
      for (const [hour, seconds] of Object.entries(hours))
        merged[Number(hour)] = (merged[Number(hour)] ?? 0) + seconds;
    }
    return {
      ...record,
      hosts,
      sessions: record.sessions?.map((session) => ({ ...session, host: siteKey(session.host) })),
    };
  });
}

export function computeView(
  days: DayRecord[],
  range: Range,
  site: string | null,
  now: number,
  openSessions: Session[] = [],
): View {
  const today = dateKey(now);
  const byDate = new Map(mergedDays(days).map((record) => [record.date, record]));
  const dates = [...byDate.keys()].sort();
  const earliest = dates[0] ?? today;

  const length =
    range === "today"
      ? 1
      : range === "all"
        ? Math.max(
            1,
            Math.round((dayStart(today).getTime() - dayStart(earliest).getTime()) / DAY_MS) + 1,
          )
        : Number(range);
  const window = Array.from({ length }, (_, i) => shiftDays(today, i - length + 1));

  // Totals by site, and the grid of when.
  const totals = new Map<string, number>();
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const hourTotals = Array<number>(24).fill(0);
  for (const date of window) {
    const record = byDate.get(date);
    if (!record) continue;
    for (const [host, hours] of Object.entries(record.hosts)) {
      const sum = Object.values(hours).reduce((a, b) => a + b, 0);
      totals.set(host, (totals.get(host) ?? 0) + sum);
      if (site && host !== site) continue;
      for (const [hour, seconds] of Object.entries(hours)) {
        heat[weekdayIndex(date)]![Number(hour)]! += seconds;
        hourTotals[Number(hour)]! += seconds;
      }
    }
  }

  const everything = [...totals.values()].reduce((a, b) => a + b, 0);
  const sites = [...totals.entries()]
    .filter(([, seconds]) => seconds >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([host, seconds]) => ({
      host,
      seconds,
      share: everything ? seconds / everything : 0,
      feed: isFeedHost(host),
    }));

  const total = site ? (totals.get(site) ?? 0) : everything;
  const feedTime = sites.filter((row) => row.feed).reduce((a, row) => a + row.seconds, 0);

  const nowHour = new Date(now).getHours();
  let points: Point[];
  if (range === "today") {
    points = Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour),
      label: hour % 6 === 0 ? hourLabel(hour) : "",
      title: hourLabel(hour),
      seconds: hourTotals[hour]!,
      current: hour === nowHour,
      future: hour > nowHour,
    }));
  } else if (length > 120) {
    // A year of days is thinner than a pixel can show; a week is still a habit.
    points = [];
    for (let end = length; end > 0; end -= 7) {
      const part = window.slice(Math.max(0, end - 7), end);
      points.unshift({
        key: part[0]!,
        label: "",
        title: `Week of ${SHORT_DATE.format(dayStart(part[0]!))}`,
        seconds: part.reduce((sum, date) => sum + secondsIn(byDate.get(date), site), 0),
        current: part.includes(today),
      });
    }
    points.forEach((point, i) => {
      if (i % Math.ceil(points.length / 6) === 0)
        point.label = SHORT_DATE.format(dayStart(point.key));
    });
  } else {
    const every = length <= 7 ? 1 : Math.ceil(length / 6);
    points = window.map((date, i) => ({
      key: date,
      label:
        length <= 7
          ? WEEKDAY.format(dayStart(date))
          : (length - 1 - i) % every === 0
            ? SHORT_DATE.format(dayStart(date))
            : "",
      title: LONG_DATE.format(dayStart(date)),
      seconds: secondsIn(byDate.get(date), site),
      current: date === today,
    }));
  }

  // The same stretch just before, cut off at the same time of day, because today isn't over yet.
  // Only with a whole earlier stretch to compare: a part of one would flatter any period.
  let previous: number | null = null;
  if (range === "today") {
    const yesterday = byDate.get(shiftDays(today, -1));
    previous = yesterday ? secondsIn(yesterday, site, nowHour) : null;
  } else if (range !== "all") {
    const before = Array.from({ length }, (_, i) => shiftDays(today, i - 2 * length + 1));
    if (earliest <= before[0]!)
      previous = before.reduce(
        (sum, date, i) => sum + secondsIn(byDate.get(date), site, i === length - 1 ? nowHour : 23),
        0,
      );
  }

  // Sessions that started in this period, including any still going.
  const inPeriod = new Set(window);
  const recorded = window.flatMap((date) => byDate.get(date)?.sessions ?? []);
  const live = openSessions.filter((session) => inPeriod.has(dateKey(session.start)));
  const every = [...recorded, ...live].filter((session) => session.seconds >= MIN_SESSION_SECONDS);
  const bySiteLists = new Map<string, Session[]>();
  for (const session of every) {
    bySiteLists.set(session.host, [...(bySiteLists.get(session.host) ?? []), session]);
  }
  const bySite: Record<string, SiteSessions> = {};
  for (const [host, list] of bySiteLists) {
    const seconds = list.map((session) => session.seconds);
    bySite[host] = {
      count: list.length,
      average: seconds.reduce((a, b) => a + b, 0) / list.length,
      shortest: Math.min(...seconds),
      longest: Math.max(...seconds),
    };
  }
  const sessions = summarizeSessions(site ? (bySiteLists.get(site) ?? []) : joinSessions(every));
  // Joined sessions cross sites, so this view lists each site's own longest, which also says more
  // than five rows of the same site.
  if (!site) sessions.top = longestOnEachSite(bySiteLists);
  const firstCounted = dates.find((date) => byDate.get(date)?.sessions?.length);
  const sessionsSince =
    total > 0 && (!firstCounted || firstCounted > (dates.find((d) => inPeriod.has(d)) ?? today))
      ? (firstCounted ?? today)
      : null;

  const activeDays = window.filter((date) => secondsIn(byDate.get(date), site) > 0).length;
  const peakSeconds = Math.max(...hourTotals);
  const busiest = points.reduce<Point | null>(
    (best, point) => (point.seconds > (best?.seconds ?? 0) ? point : best),
    null,
  );

  return {
    range,
    site,
    total,
    previous,
    points,
    sites,
    heat,
    dailyAverage: activeDays ? total / activeDays : 0,
    feedShare: everything ? feedTime / everything : 0,
    activeDays,
    peakHour: peakSeconds > 0 ? hourTotals.indexOf(peakSeconds) : null,
    peak: busiest,
    sessions,
    bySite,
    sessionsSince,
  };
}

export function periodPhrase(range: Range): string {
  if (range === "today") return "today";
  if (range === "all") return "so far";
  return `in the last ${range} days`;
}

/** "3h 10m less than the 7 days before", or null with nothing to compare. */
export function comparison(view: View): string | null {
  if (view.previous === null || view.total < 1) return null;
  const change = view.total - view.previous;
  const against =
    view.range === "today" ? "than by now yesterday" : `than the ${view.range} days before`;
  if (Math.abs(change) < 60) return `About the same ${against.replace("than ", "as ")}`;
  return `${formatDuration(Math.abs(change))} ${change < 0 ? "less" : "more"} ${against}`;
}

/** A few plain sentences about the habit, for what the charts don't say by themselves. */
export function insights(view: View): string[] {
  const lines: string[] = [];
  if (view.total < 60) return lines;
  if (view.peak && view.range !== "today" && view.points.length <= 120) {
    const name =
      view.range === "7" ? LONG_WEEKDAY.format(dayStart(view.peak.key)) : view.peak.title;
    lines.push(`Your longest day was ${name}, at ${formatDuration(view.peak.seconds)}.`);
  }
  if (view.peakHour !== null) lines.push(`You're online most around ${hourLabel(view.peakHour)}.`);
  const top = view.sites[0];
  if (!view.site && top && top.share >= 0.05) {
    lines.push(`${top.host} took ${Math.round(top.share * 100)}% of your time.`);
  }
  return lines;
}

/** Clean axis steps for a time scale: 15m, 30m, 1h, 2h... */
export function timeTicks(max: number): number[] {
  const steps = [60, 300, 900, 1800, 3600, 7200, 10_800, 14_400, 21_600, 43_200, 86_400, 172_800];
  const step = steps.find((candidate) => max / candidate <= 3) ?? 345_600;
  const ticks: number[] = [];
  for (let tick = step; tick <= max + 1 && ticks.length < 4; tick += step) ticks.push(tick);
  return ticks.length ? ticks : [step];
}
