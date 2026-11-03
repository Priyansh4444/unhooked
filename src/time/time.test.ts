import { describe, expect, it } from "bun:test";
import {
  comparison,
  computeView,
  insights,
  joinSessions,
  summarizeSessions,
  timeTicks,
} from "./stats.ts";
import type { DayRecord } from "./store.ts";
import {
  EMPTY_STATE,
  IDLE_SECONDS,
  MIN_SESSION_SECONDS,
  SESSION_GAP_MS,
  advance,
  dateKey,
  formatDuration,
  hostToCount,
  siteKey,
  siteOfUrl,
  slicesBetween,
  type FrontTab,
  type Session,
  type TrackerState,
} from "./tracker.ts";

const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();

describe("which site time counts under", () => {
  it("treats every address of a supported site as one", () => {
    expect(siteKey("www.youtube.com")).toBe("youtube.com");
    expect(siteKey("m.youtube.com")).toBe("youtube.com");
    expect(siteKey("twitter.com")).toBe("x.com");
    expect(siteKey("old.reddit.com")).toBe("reddit.com");
  });
  it("keeps other sites as they are, without www", () => {
    expect(siteKey("www.example.org")).toBe("example.org");
    expect(siteKey("music.youtube.com")).toBe("music.youtube.com");
  });
  it("only counts web pages", () => {
    expect(siteOfUrl("https://x.com/home")).toBe("x.com");
    expect(siteOfUrl("chrome://extensions")).toBeNull();
    expect(siteOfUrl("chrome-extension://abc/ui/time/index.html")).toBeNull();
    expect(siteOfUrl("about:blank")).toBeNull();
    expect(siteOfUrl(undefined)).toBeNull();
    expect(siteOfUrl("not a url")).toBeNull();
  });
});

describe("one name per site", () => {
  it.each([
    ["www.example.org", "example.org"],
    ["www2.example.org", "example.org"],
    ["m.example.org", "example.org"],
    ["mobile.example.org", "example.org"],
    ["amp.example.org", "example.org"],
    ["GitHub.com", "github.com"],
    ["gist.github.com", "gist.github.com"],
    ["calendar.google.com", "calendar.google.com"],
    ["m.co", "m.co"],
  ])("%s counts as %s", (host, name) => expect(siteKey(host)).toBe(name));

  it("merges what older records called the same site", () => {
    const now = new Date(2026, 2, 11, 15).getTime();
    const date = dateKey(now);
    const session: Session = { host: "www.example.org", start: now, end: now, seconds: 60 };
    const view = computeView(
      [
        {
          date,
          hosts: { "www.example.org": { 9: 100 }, "example.org": { 9: 50, 10: 25 } },
          sessions: [session],
        },
      ],
      "today",
      null,
      now,
    );
    expect(view.sites.map((row) => [row.host, row.seconds])).toEqual([["example.org", 175]]);
    expect(view.bySite["example.org"]!.count).toBe(1);
  });
});

describe("what counts right now", () => {
  const tab: FrontTab = {
    url: "https://x.com/home",
    focused: true,
    incognito: false,
    audible: false,
    idle: "active",
  };
  it("counts the site in front", () => expect(hostToCount(tab, true, [])).toBe("x.com"));
  it("not when the browser isn't focused", () =>
    expect(hostToCount({ ...tab, focused: false }, true, [])).toBeNull());
  it("not in a private window", () =>
    expect(hostToCount({ ...tab, incognito: true }, true, [])).toBeNull());
  it("not when you've walked away", () =>
    expect(hostToCount({ ...tab, idle: "idle" }, true, [])).toBeNull());
  it("unless it's playing, as a video does", () =>
    expect(hostToCount({ ...tab, idle: "idle", audible: true }, true, [])).toBe("x.com"));
  it("never with the screen locked", () =>
    expect(hostToCount({ ...tab, idle: "locked", audible: true }, true, [])).toBeNull());
  it("not when turned off", () => expect(hostToCount(tab, false, [])).toBeNull());
  it("not for a site you've excluded", () => expect(hostToCount(tab, true, ["x.com"])).toBeNull());
  it("not without a tab", () => expect(hostToCount(null, true, [])).toBeNull());
});

describe("cutting time into hours", () => {
  it("keeps a stretch inside one hour whole", () => {
    expect(slicesBetween("x.com", at(2026, 3, 2, 9, 10), at(2026, 3, 2, 9, 11))).toEqual([
      { date: "2026-03-02", hour: 9, host: "x.com", seconds: 60 },
    ]);
  });
  it("splits at the hour", () => {
    const slices = slicesBetween("x.com", at(2026, 3, 2, 9, 59), at(2026, 3, 2, 10, 1));
    expect(slices.map((s) => [s.hour, s.seconds])).toEqual([
      [9, 60],
      [10, 60],
    ]);
  });
  it("splits at midnight into two days", () => {
    const slices = slicesBetween("x.com", at(2026, 3, 2, 23, 59), at(2026, 3, 3, 0, 1));
    expect(slices.map((s) => [s.date, s.hour])).toEqual([
      ["2026-03-02", 23],
      ["2026-03-03", 0],
    ]);
  });
  it("nothing passes when no time has", () => {
    const since = at(2026, 3, 2, 9);
    expect(slicesBetween("x.com", since, since)).toEqual([]);
  });
});

/** Runs a script of [seconds later, what's in front, went idle], and adds up what comes out. */
function play(steps: [number, string | null, boolean?][], start = at(2026, 3, 2, 9)) {
  let state: TrackerState = EMPTY_STATE;
  let now = start;
  const seconds: Record<string, number> = {};
  const closed: Session[] = [];
  for (const [later, host, idle] of steps) {
    now += later * 1000;
    const step = advance(state, now, host, idle);
    state = step.state;
    closed.push(...step.closed);
    for (const slice of step.slices)
      seconds[slice.host] = (seconds[slice.host] ?? 0) + slice.seconds;
  }
  return { seconds, closed, state, now };
}

describe("counting", () => {
  it("credits exactly the time in front", () => {
    expect(
      play([
        [0, "x.com"],
        [60, "x.com"],
        [30, "x.com"],
      ]).seconds["x.com"],
    ).toBe(90);
  });
  it("credits the site you just left, not the one you arrived at", () => {
    const { seconds } = play([
      [0, "x.com"],
      [40, "example.org"],
      [20, "example.org"],
    ]);
    expect(seconds).toEqual({ "x.com": 40, "example.org": 20 });
  });
  it("adds up to the time that passed, however many events there were", () => {
    const steps: [number, string][] = [[0, "x.com"]];
    for (let i = 0; i < 200; i++) steps.push([7, i % 3 ? "x.com" : "example.org"]);
    const { seconds } = play(steps);
    expect((seconds["x.com"] ?? 0) + (seconds["example.org"] ?? 0)).toBe(1400);
  });
  it("counts nothing while nothing is in front", () => {
    expect(
      play([
        [0, "x.com"],
        [10, null],
        [500, null],
        [10, "x.com"],
        [10, "x.com"],
      ]).seconds,
    ).toEqual({
      "x.com": 20,
    });
  });
  it("counts none of a gap the computer slept through", () => {
    const { seconds } = play([
      [0, "x.com"],
      [60, "x.com"],
      [8 * 3600, "x.com"],
      [10, "x.com"],
    ]);
    expect(seconds["x.com"]).toBe(70);
  });
  it("takes back the minute before the browser reported idle", () => {
    const { seconds } = play([
      [0, "x.com"],
      [60, "x.com"],
      [60, "x.com"],
      [60, "x.com"],
      [10, null, true],
    ]);
    expect(seconds["x.com"]).toBe(190 - IDLE_SECONDS);
  });
  it("never takes back more than this stretch", () => {
    const { seconds } = play([
      [0, "example.org"],
      [100, "x.com"],
      [30, null, true],
    ]);
    expect(seconds["x.com"]).toBe(0);
    expect(seconds["example.org"]).toBe(100);
  });
  it("doesn't take anything back when you simply switched away", () => {
    expect(
      play([
        [0, "x.com"],
        [90, null],
      ]).seconds["x.com"],
    ).toBe(90);
  });
});

describe("sessions", () => {
  it("are kept once they end", () => {
    const { closed } = play([
      [0, "x.com"],
      [120, null],
      [SESSION_GAP_MS / 1000 + 1, null],
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0]!.seconds).toBe(120);
    expect(closed[0]!.host).toBe("x.com");
  });
  it("continue through a quick look away", () => {
    const { closed, state } = play([
      [0, "x.com"],
      [100, "example.org"],
      [10, "x.com"],
      [100, "x.com"],
    ]);
    expect(state.open["x.com"]!.seconds).toBe(200);
    expect(state.open["x.com"]!.start).toBe(at(2026, 3, 2, 9));
    expect(closed.map((s) => [s.host, s.seconds])).toEqual([["example.org", 10]]);
  });
  it("end when you're gone for longer", () => {
    const gone = SESSION_GAP_MS / 1000 + 1;
    const { closed, state } = play([
      [0, "x.com"],
      [100, null],
      [gone, "x.com"],
      [50, "x.com"],
    ]);
    expect(closed.map((s) => s.seconds)).toEqual([100]);
    expect(state.open["x.com"]!.seconds).toBe(50);
  });
  it("don't include what idle took back", () => {
    const { closed } = play([
      [0, "x.com"],
      [100, "x.com"],
      [100, null, true],
    ]);
    expect(closed[0]!.seconds).toBe(200 - IDLE_SECONDS);
    expect(closed[0]!.end).toBe(at(2026, 3, 2, 9) + (200 - IDLE_SECONDS) * 1000);
  });
  it("leave out passing through a tab", () => {
    const gone = SESSION_GAP_MS / 1000 + 1;
    const { closed, seconds } = play([
      [0, "x.com"],
      [MIN_SESSION_SECONDS - 1, null],
      [gone, null],
    ]);
    expect(closed).toHaveLength(0);
    expect(seconds["x.com"]).toBe(MIN_SESSION_SECONDS - 1); // still time
  });
  it("close across a sleep, without the sleep in them", () => {
    const { closed } = play([
      [0, "x.com"],
      [60, "x.com"],
      [8 * 3600, "x.com"],
    ]);
    expect(closed.map((s) => s.seconds)).toEqual([60]);
  });
});

describe("session numbers", () => {
  const session = (seconds: number, start = 0, host = "x.com"): Session => ({
    host,
    start,
    end: start + seconds * 1000,
    seconds,
  });
  it("gives the count, average, median, longest and shortest", () => {
    const stats = summarizeSessions([session(10), session(50), session(600), session(1340)]);
    expect(stats.count).toBe(4);
    expect(stats.average).toBe(500);
    expect(stats.median).toBe(325);
    expect(stats.longest!.seconds).toBe(1340);
    expect(stats.shortest!.seconds).toBe(10);
  });
  it("counts focus as time in stretches of ten minutes or more", () => {
    const stats = summarizeSessions([session(599), session(600), session(1801)]);
    expect(stats.focused).toBe(2401);
    expect(stats.focusedShare).toBeCloseTo(2401 / 3000);
  });
  it("sorts them into buckets with nothing lost at the edges", () => {
    const stats = summarizeSessions(
      [59, 60, 299, 300, 899, 900, 1799, 1800, 3599, 3600].map((s) => session(s)),
    );
    expect(stats.buckets.map((b) => b.count)).toEqual([1, 2, 2, 2, 2, 1]);
  });
  it("is empty without any", () => {
    const stats = summarizeSessions([]);
    expect(stats).toMatchObject({ count: 0, average: 0, median: 0, longest: null, shortest: null });
  });
  it("joins sites into stretches online, split by a gap of over a minute", () => {
    const joined = joinSessions([
      session(100, 0, "x.com"),
      session(100, 100_000, "example.org"),
      session(50, 200_000 + SESSION_GAP_MS, "x.com"),
      session(50, 250_000 + SESSION_GAP_MS * 2 + 1000, "x.com"),
    ]);
    expect(joined.map((s) => s.seconds)).toEqual([250, 50]);
  });
});

describe("durations", () => {
  it.each([
    [45, "45s"],
    [60, "1m"],
    [2280, "38m"],
    [3600, "1h"],
    [51720, "14h 22m"],
  ])("%d seconds reads %s", (seconds, text) => expect(formatDuration(seconds)).toBe(text));
});

const NOW = at(2026, 3, 11, 15, 30); // a Wednesday
const day = (offset: number, hosts: DayRecord["hosts"]): DayRecord => ({
  date: dateKey(at(2026, 3, 11 + offset)),
  hosts,
});

describe("the view of a range", () => {
  const days = [
    day(0, { "x.com": { 9: 1800, 15: 600 }, "example.org": { 10: 600 } }),
    day(-1, { "x.com": { 9: 3600 }, "youtube.com": { 21: 3600 } }),
    day(-3, { "example.org": { 22: 1800 } }),
    day(-8, { "x.com": { 9: 7200 } }),
  ];

  it("totals only the range", () => {
    expect(computeView(days, "today", null, NOW).total).toBe(3000);
    expect(computeView(days, "7", null, NOW).total).toBe(3000 + 7200 + 1800);
    expect(computeView(days, "30", null, NOW).total).toBe(3000 + 7200 + 1800 + 7200);
  });

  it("ranks sites, largest first, with their share", () => {
    const { sites } = computeView(days, "7", null, NOW);
    expect(sites.map((row) => row.host)).toEqual(["x.com", "youtube.com", "example.org"]);
    expect(sites[0]!.seconds).toBe(6000);
    expect(sites[0]!.share).toBeCloseTo(0.5);
  });

  it("knows which sites are feeds", () => {
    const view = computeView(days, "7", null, NOW);
    expect(view.sites.find((row) => row.host === "x.com")!.feed).toBe(true);
    expect(view.sites.find((row) => row.host === "example.org")!.feed).toBe(false);
    expect(view.feedShare).toBeCloseTo((6000 + 3600) / 12000);
  });

  it("narrows to one site, but the list stays whole", () => {
    const view = computeView(days, "7", "x.com", NOW);
    expect(view.total).toBe(6000);
    expect(view.points.at(-2)!.seconds).toBe(3600);
    expect(view.sites).toHaveLength(3);
    expect(view.heat.flat().reduce((a, b) => a + b, 0)).toBe(6000);
  });

  it("draws hours for today and days for a week", () => {
    const today = computeView(days, "today", null, NOW);
    expect(today.points).toHaveLength(24);
    expect(today.points[9]!.seconds).toBe(1800);
    expect(today.points[15]!.current).toBe(true);
    const week = computeView(days, "7", null, NOW);
    expect(week.points).toHaveLength(7);
    expect(week.points.at(-1)!.current).toBe(true);
    expect(week.points.at(-1)!.label).toBe("Wed");
  });

  it("folds a long history into weeks", () => {
    const old = [...days, day(-200, { "x.com": { 9: 60 } })];
    const view = computeView(old, "all", null, NOW);
    expect(view.points.length).toBeLessThan(40);
    expect(view.points.reduce((sum, point) => sum + point.seconds, 0)).toBe(view.total);
  });

  it("places time on its weekday and hour, Monday first", () => {
    const { heat } = computeView(days, "7", null, NOW);
    expect(heat[2]![9]).toBe(1800); // Wednesday
    expect(heat[1]![21]).toBe(3600); // Tuesday
  });

  it("compares with the same stretch just before", () => {
    const whole = [...days, day(-13, {})];
    expect(computeView(whole, "7", null, NOW).previous).toBe(7200);
    expect(comparison(computeView(whole, "7", null, NOW))).toBe(
      "1h 20m more than the 7 days before",
    );
  });

  it("cuts that stretch off at the same time of day, since today isn't over", () => {
    const history = [
      ...days,
      day(-13, {}),
      day(-7, { "x.com": { 9: 100, 15: 200, 20: 400 } }), // 8 pm hasn't come yet today
    ];
    expect(computeView(history, "7", null, NOW).previous).toBe(7200 + 300);
  });

  it("doesn't compare with part of a period", () => {
    expect(computeView(days, "7", null, NOW).previous).toBeNull();
  });

  it("compares today with yesterday up to this hour", () => {
    const view = computeView(days, "today", null, NOW);
    expect(view.previous).toBe(3600); // not the 9 pm hour, which hasn't come yet today
    expect(comparison(view)).toBe("10m less than by now yesterday");
  });

  it("compares nothing when there's no earlier time", () => {
    const view = computeView([day(0, { "x.com": { 9: 600 } })], "7", null, NOW);
    expect(view.previous).toBeNull();
    expect(comparison(view)).toBeNull();
  });

  it("is quiet with no data", () => {
    const view = computeView([], "7", null, NOW);
    expect(view.total).toBe(0);
    expect(view.peakHour).toBeNull();
    expect(view.peak).toBeNull();
    expect(insights(view)).toEqual([]);
    expect(view.points).toHaveLength(7);
  });

  it("reports sessions for the period, per site and overall", () => {
    const session = (host: string, start: number, seconds: number): Session => ({
      host,
      start,
      end: start + seconds * 1000,
      seconds,
    });
    const today = at(2026, 3, 11, 9);
    const withSessions = [
      {
        ...day(0, { "x.com": { 9: 900 }, "example.org": { 9: 300 } }),
        sessions: [session("x.com", today, 600), session("example.org", today + 600_000, 300)],
      },
      {
        ...day(-40, { "x.com": { 9: 7200 } }),
        sessions: [session("x.com", at(2026, 1, 30, 9), 7200)],
      },
    ];
    const live = [session("x.com", today + 900_000, 300)];
    const all = computeView(withSessions, "7", null, NOW, live);
    expect(all.sessions.count).toBe(1); // one stretch online, across both sites
    expect(all.sessions.longest!.seconds).toBe(1200);
    const one = computeView(withSessions, "7", "x.com", NOW, live);
    expect(one.sessions.count).toBe(2);
    expect(one.sessions.average).toBe(450);
    expect(one.sessions.shortest!.seconds).toBe(300);
    expect(all.bySite["x.com"]).toEqual({ count: 2, average: 450, shortest: 300, longest: 600 });
    expect(all.bySite["example.org"]!.count).toBe(1);
  });

  it("leaves passing through out of the numbers, whatever was stored", () => {
    const flick: Session = { host: "x.com", start: NOW, end: NOW + 2000, seconds: 2 };
    const real: Session = { host: "x.com", start: NOW, end: NOW + 60_000, seconds: 60 };
    const view = computeView([{ ...day(0, {}), sessions: [flick, real] }], "7", "x.com", NOW);
    expect(view.sessions.count).toBe(1);
    expect(view.sessions.shortest!.seconds).toBe(60);
  });

  it("says when sessions only began partway through the period", () => {
    const later = day(0, { "x.com": { 9: 600 } });
    const older = day(-3, { "x.com": { 9: 600 } });
    const session: Session = { host: "x.com", start: NOW, end: NOW, seconds: 600 };
    const view = computeView([{ ...later, sessions: [session] }, older], "7", null, NOW);
    expect(view.sessionsSince).toBe(later.date);
    const fine = computeView([{ ...later, sessions: [session] }], "7", null, NOW);
    expect(fine.sessionsSince).toBeNull();
  });

  it("says what stands out", () => {
    const lines = insights(computeView(days, "7", null, NOW));
    expect(lines).toContain("Your longest day was Tuesday, at 2h.");
    expect(lines).toContain("You're online most around 9 am.");
    expect(lines).toContain("x.com took 50% of your time.");
  });
});

describe("axis steps", () => {
  it("picks round times", () => {
    expect(timeTicks(10_000)).toEqual([3600, 7200]);
    expect(timeTicks(1500)).toEqual([900]);
    expect(timeTicks(0)).toHaveLength(1);
  });
});
