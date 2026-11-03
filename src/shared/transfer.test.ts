import { describe, expect, it } from "bun:test";
import {
  describeSummary,
  importPatch,
  originsToAsk,
  readSettingsFile,
  settingsFile,
  summarize,
  transferable,
} from "./transfer.ts";

const rule = (selector: string, label = selector) => ({ selector, label, at: 1 });

describe("what travels in a settings file", () => {
  it("keeps choices and leaves out what belongs to this browser", () => {
    const out = transferable({
      "unhooked.site.x.hideHomeFeed": true,
      "unhooked.site.instagram.redirectTo": "/{user}/saved/",
      "unhooked.custom.reddit": [rule("aside.promo")],
      "unhooked.wandShortcut": "Alt+Shift+KeyW",
      twitter_width: 60,
      // this browser's own
      "unhooked.paused": true,
      youtube_state: { enabled: true },
      twitch_url_log: [{ url: "https://example.com" }],
      "unhooked.user.instagram": "someone",
    });
    expect(Object.keys(out).sort()).toEqual([
      "twitter_width",
      "unhooked.custom.reddit",
      "unhooked.site.instagram.redirectTo",
      "unhooked.site.x.hideHomeFeed",
      "unhooked.wandShortcut",
    ]);
  });

  it("round-trips through the file", () => {
    const raw = {
      "unhooked.site.x.hideHomeFeed": true,
      "unhooked.custom.web:example.org": [rule(".banner", "Banner")],
    };
    expect(readSettingsFile(settingsFile(raw))).toEqual(raw);
  });
});

describe("a file from somewhere else", () => {
  const file = (settings: unknown, extra = {}) =>
    JSON.stringify({ format: "unhooked-settings", version: 1, settings, ...extra });

  it("says plainly when it isn't one", () => {
    expect(() => readSettingsFile("not json")).toThrow("isn't an Unhooked");
    expect(() => readSettingsFile('{"a":1}')).toThrow("isn't an Unhooked");
    expect(() => readSettingsFile(file({}))).toThrow("no settings");
    expect(() => readSettingsFile(file({ a: 1 }, { version: 2 }))).toThrow("newer");
  });

  it("drops unknown keys and values of the wrong type", () => {
    const out = readSettingsFile(
      file({
        "unhooked.site.x.hideHomeFeed": "yes",
        "unhooked.site.x.notAControl": true,
        "unhooked.site.nowhere.enabled": true,
        "unhooked.paused": true,
        twitter_width: 5000,
        anything: "else",
        "unhooked.site.x.enabled": false,
      }),
    );
    expect(out).toEqual({ "unhooked.site.x.enabled": false });
  });

  it("never lets a redirect leave the site", () => {
    const out = transferable({
      "unhooked.site.x.redirectTo": "//evil.example/",
      "unhooked.site.reddit.redirectTo": "https://evil.example/",
      "unhooked.site.youtube.redirectTo": "/feed/subscriptions",
    });
    expect(out).toEqual({ "unhooked.site.youtube.redirectTo": "/feed/subscriptions" });
  });

  it("drops a removal that would break out of its CSS rule", () => {
    const out = transferable({
      "unhooked.custom.x": [
        rule("a{} body{background:url(//evil.example/)}"),
        rule("a /* comment"),
        rule(".fine"),
      ],
    });
    expect((out["unhooked.custom.x"] as { selector: string }[]).map((r) => r.selector)).toEqual([
      ".fine",
    ]);
  });

  it("only accepts removals for real sites and plain host names", () => {
    const out = transferable({
      "unhooked.custom.nowhere": [rule(".a")],
      "unhooked.custom.web:*": [rule(".a")],
      "unhooked.custom.web:a/b.example": [rule(".a")],
      "unhooked.custom.web:news.ycombinator.com": [rule(".a")],
    });
    expect(Object.keys(out)).toEqual(["unhooked.custom.web:news.ycombinator.com"]);
  });
});

describe("importing", () => {
  it("lets the file win, but keeps removals made here", () => {
    const patch = importPatch(
      {
        "unhooked.site.x.hideHomeFeed": false,
        "unhooked.custom.x": [rule(".here"), rule(".both", "old name")],
      },
      {
        "unhooked.site.x.hideHomeFeed": true,
        "unhooked.custom.x": [rule(".both", "new name"), rule(".there")],
      },
    );
    expect(patch["unhooked.site.x.hideHomeFeed"]).toBe(true);
    expect(patch["unhooked.custom.x"]).toEqual([
      rule(".here"),
      rule(".both", "new name"),
      rule(".there"),
    ]);
  });

  it("asks for access only to sites outside the list", () => {
    expect(
      originsToAsk({
        "unhooked.custom.reddit": [rule(".a")],
        "unhooked.custom.web:news.ycombinator.com": [rule(".a")],
      }),
    ).toEqual(["*://news.ycombinator.com/*"]);
  });
});

describe("the summary", () => {
  it("counts what the file holds", () => {
    const summary = summarize({
      "unhooked.site.x.hideHomeFeed": true,
      "unhooked.site.x.hideExplore": true,
      "unhooked.site.x.hideRecommendations": false,
      "unhooked.site.reddit.hideHomeFeed": true,
      "unhooked.site.reddit.enabled": true,
      "unhooked.site.x.redirect": true,
      "unhooked.custom.x": [rule(".a"), rule(".b")],
      "unhooked.custom.web:example.org": [rule(".c")],
    });
    expect(summary).toEqual({ sites: 2, controls: 3, skipping: 1, removals: 3, otherSites: 1 });
    expect(describeSummary(summary)).toBe(
      "3 controls on 2 sites, 3 wand removals, feeds skipped on 1 site",
    );
    expect(describeSummary(summarize({}))).toBe("Default choices");
  });
});
