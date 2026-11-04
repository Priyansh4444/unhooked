/** A year in one place: the numbers behind the recap. Pure, so it's unit-tested. */
import { siteKey, type Session } from "./tracker.ts";
import type { DayRecord } from "./store.ts";

const TOP_SITES = 5;

export interface Recap {
  year: number;
  /** The year isn't over, so these are its numbers so far. */
  soFar: boolean;
  /** Its first day with anything counted. Later than January means it isn't the whole year. */
  firstDate: string | null;
  seconds: number;
  activeDays: number;
  siteCount: number;
  sites: { host: string; seconds: number }[];
  /** Seconds in each month, January first. */
  months: number[];
  busiestMonth: number;
  busiestDay: { date: string; seconds: number } | null;
  /** The hour of the day with the most time, 0 to 23. */
  busiestHour: number | null;
  longest: Session | null;
  sessions: number;
}

const yearOf = (date: string) => Number(date.slice(0, 4));

/** The years there's anything to recap, newest first. */
export const recapYears = (days: DayRecord[]): number[] =>
  [
    ...new Set(
      days
        .filter((day) => Object.keys(day.hosts).length)
        .map((day) => yearOf(day.date))
        .filter(Number.isFinite),
    ),
  ].sort((a, b) => b - a);

export function computeRecap(days: DayRecord[], year: number, now = Date.now()): Recap {
  const bySite = new Map<string, number>();
  const months = Array.from({ length: 12 }, () => 0);
  const hours = Array.from({ length: 24 }, () => 0);
  let seconds = 0;
  let activeDays = 0;
  let sessions = 0;
  let busiestDay: Recap["busiestDay"] = null;
  let longest: Session | null = null;
  let firstDate: string | null = null;
  for (const day of days) {
    if (yearOf(day.date) !== year) continue;
    let dayTotal = 0;
    for (const [host, byHour] of Object.entries(day.hosts)) {
      const site = siteKey(host);
      for (const [hour, amount] of Object.entries(byHour)) {
        dayTotal += amount;
        bySite.set(site, (bySite.get(site) ?? 0) + amount);
        hours[Number(hour)] = (hours[Number(hour)] ?? 0) + amount;
      }
    }
    if (!dayTotal) continue;
    activeDays += 1;
    if (!firstDate || day.date < firstDate) firstDate = day.date;
    seconds += dayTotal;
    const month = Number(day.date.slice(5, 7)) - 1;
    months[month] = (months[month] ?? 0) + dayTotal;
    if (!busiestDay || dayTotal > busiestDay.seconds)
      busiestDay = { date: day.date, seconds: dayTotal };
    for (const session of day.sessions ?? []) {
      sessions += 1;
      if (!longest || session.seconds > longest.seconds)
        longest = { ...session, host: siteKey(session.host) };
    }
  }
  const most = (values: number[]) => values.indexOf(Math.max(...values));
  return {
    year,
    soFar: new Date(now).getFullYear() === year,
    firstDate,
    seconds,
    activeDays,
    siteCount: bySite.size,
    sites: [...bySite]
      .map(([host, amount]) => ({ host, seconds: amount }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, TOP_SITES),
    months,
    busiestMonth: most(months),
    busiestDay,
    busiestHour: seconds ? most(hours) : null,
    longest,
    sessions,
  };
}

/**
 * What a recap covers, in words. History is only kept for 400 days and starts when tracking did, so
 * a year can be missing its start, and it shouldn't read as if it weren't.
 */
export function recapPeriod(recap: Recap): string {
  const name = recap.soFar ? `${recap.year} so far` : String(recap.year);
  const first = recap.firstDate;
  if (!first || first.slice(5) <= "01-07") return name;
  const since = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${first}T12:00`),
  );
  return `${name}, since ${since}`;
}
