import { describe, expect, it } from "bun:test";
import { comparison, computeView, insights, timeTicks } from "./stats.ts";
import type { DayRecord } from "./store.ts";
import {
  MAX_GAP_MS,
  dateKey,
  formatDuration,
  hostToCount,
  siteKey,
  siteOfUrl,
  slicesOf,
  type FrontTab,
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
    expect(
      slicesOf({ host: "x.com", since: at(2026, 3, 2, 9, 10) }, at(2026, 3, 2, 9, 11)),
    ).toEqual([{ date: "2026-03-02", hour: 9, host: "x.com", seconds: 60 }]);
  });
  it("splits at the hour", () => {
    const slices = slicesOf({ host: "x.com", since: at(2026, 3, 2, 9, 59) }, at(2026, 3, 2, 10, 1));
    expect(slices.map((s) => [s.hour, s.seconds])).toEqual([
      [9, 60],
      [10, 60],
    ]);
  });
  it("splits at midnight into two days", () => {
    const slices = slicesOf({ host: "x.com", since: at(2026, 3, 2, 23, 59) }, at(2026, 3, 3, 0, 1));
    expect(slices.map((s) => [s.date, s.hour])).toEqual([
      ["2026-03-02", 23],
      ["2026-03-03", 0],
    ]);
  });
  it("doesn't count a gap the computer slept through", () => {
    const since = at(2026, 3, 2, 9);
    const slices = slicesOf({ host: "x.com", since }, since + 8 * 3_600_000);
    expect(slices.reduce((sum, s) => sum + s.seconds, 0)).toBe(MAX_GAP_MS / 1000);
  });
  it("nothing passes when no time has", () => {
    const since = at(2026, 3, 2, 9);
    expect(slicesOf({ host: "x.com", since }, since)).toEqual([]);
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
    expect(view.bars.at(-2)!.seconds).toBe(3600);
    expect(view.sites).toHaveLength(3);
    expect(view.heat.flat().reduce((a, b) => a + b, 0)).toBe(6000);
  });

  it("draws hours for today and days for a week", () => {
    const today = computeView(days, "today", null, NOW);
    expect(today.bars).toHaveLength(24);
    expect(today.bars[9]!.seconds).toBe(1800);
    expect(today.bars[15]!.current).toBe(true);
    const week = computeView(days, "7", null, NOW);
    expect(week.bars).toHaveLength(7);
    expect(week.bars.at(-1)!.current).toBe(true);
    expect(week.bars.at(-1)!.label).toBe("Wed");
  });

  it("folds a long history into weeks", () => {
    const old = [...days, day(-200, { "x.com": { 9: 60 } })];
    const view = computeView(old, "all", null, NOW);
    expect(view.bars.length).toBeLessThan(40);
    expect(view.bars.reduce((sum, bar) => sum + bar.seconds, 0)).toBe(view.total);
  });

  it("places time on its weekday and hour, Monday first", () => {
    const { heat } = computeView(days, "7", null, NOW);
    expect(heat[2]![9]).toBe(1800); // Wednesday
    expect(heat[1]![21]).toBe(3600); // Tuesday
  });

  it("compares with the same stretch just before", () => {
    expect(computeView(days, "7", null, NOW).previous).toBe(7200);
    expect(comparison(computeView(days, "7", null, NOW))).toBe(
      "1h 20m more than the 7 days before",
    );
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
    expect(view.bars).toHaveLength(7);
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
