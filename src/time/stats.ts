/** Turns the stored days into what the page and the share card show. Pure, so it is unit-tested. */
import { SITE_HOSTS } from "../sites/hosts.ts";
import { CONTROL_SITES } from "../sites/registry.ts";
import type { DayRecord } from "./store.ts";
import { dateKey, dayStart, formatDuration, siteKey } from "./tracker.ts";

export type Range = "today" | "7" | "30" | "90" | "all";

export const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7": "7 days",
  "30": "30 days",
  "90": "90 days",
  all: "All time",
};

export interface Bar {
  key: string;
  /** Under the bar, when there's room. */
  label: string;
  /** In the tooltip and the table. */
  title: string;
  seconds: number;
  /** The period the page is "in": today, this hour. */
  current: boolean;
}

export interface SiteRow {
  host: string;
  seconds: number;
  share: number;
  /** A site Unhooked has feed controls for. */
  feed: boolean;
}

export interface View {
  range: Range;
  site: string | null;
  total: number;
  /** The same length of time just before, to compare with. Null when there's nothing to compare. */
  previous: number | null;
  bars: Bar[];
  sites: SiteRow[];
  /** Seconds by weekday (Monday first) and hour. */
  heat: number[][];
  dailyAverage: number;
  feedShare: number;
  activeDays: number;
  peakHour: number | null;
  /** The busiest bar, for naming it. */
  peak: Bar | null;
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

export function computeView(
  days: DayRecord[],
  range: Range,
  site: string | null,
  now: number,
): View {
  const today = dateKey(now);
  const byDate = new Map(days.map((record) => [record.date, record]));
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

  let bars: Bar[];
  if (range === "today") {
    const nowHour = new Date(now).getHours();
    bars = Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour),
      label: hour % 6 === 0 ? hourLabel(hour) : "",
      title: hourLabel(hour),
      seconds: hourTotals[hour]!,
      current: hour === nowHour,
    }));
  } else if (length > 120) {
    // A year of days is thinner than a pixel can show; a week is still a habit.
    bars = [];
    for (let end = length; end > 0; end -= 7) {
      const part = window.slice(Math.max(0, end - 7), end);
      bars.unshift({
        key: part[0]!,
        label: "",
        title: `Week of ${SHORT_DATE.format(dayStart(part[0]!))}`,
        seconds: part.reduce((sum, date) => sum + secondsIn(byDate.get(date), site), 0),
        current: part.includes(today),
      });
    }
    bars.forEach((bar, i) => {
      if (i % Math.ceil(bars.length / 6) === 0) bar.label = SHORT_DATE.format(dayStart(bar.key));
    });
  } else {
    const every = length <= 7 ? 1 : Math.ceil(length / 6);
    bars = window.map((date, i) => ({
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

  // The same stretch just before. Today is compared with yesterday up to this hour.
  let previous: number | null = null;
  if (range === "today") {
    const yesterday = byDate.get(shiftDays(today, -1));
    previous = yesterday ? secondsIn(yesterday, site, new Date(now).getHours()) : null;
  } else if (range !== "all") {
    const before = Array.from({ length }, (_, i) => shiftDays(today, i - 2 * length + 1));
    if (before.some((date) => byDate.has(date)))
      previous = before.reduce((sum, date) => sum + secondsIn(byDate.get(date), site), 0);
  }

  const activeDays = window.filter((date) => secondsIn(byDate.get(date), site) > 0).length;
  const peakSeconds = Math.max(...hourTotals);
  const busiest = bars.reduce<Bar | null>(
    (best, bar) => (bar.seconds > (best?.seconds ?? 0) ? bar : best),
    null,
  );

  return {
    range,
    site,
    total,
    previous,
    bars,
    sites,
    heat,
    dailyAverage: activeDays ? total / activeDays : 0,
    feedShare: everything ? feedTime / everything : 0,
    activeDays,
    peakHour: peakSeconds > 0 ? hourTotals.indexOf(peakSeconds) : null,
    peak: busiest,
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
  if (view.peak && view.range !== "today" && view.bars.length <= 120) {
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
