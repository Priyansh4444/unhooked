import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
const moduleCode = ["options", "sites", "settings"].map((name) => readFileSync(new URL("../shared/" + name + ".js", import.meta.url), "utf8")).join("\n");
function load() { const context = vm.createContext({ URL }); vm.runInContext(moduleCode, context); return context; }

describe("independent scalar preferences", () => {
  it("defaults to enabled with every hide off on all eight sites", () => {
    const c = load(); expect(c.UNHOOKED_SITES).toHaveLength(8);
    for (const site of c.UNHOOKED_SITES) {
      const state = c.unhookedResolveSettings({}, site);
      expect(state.enabled).toBe(true); expect(state.paused).toBe(false);
      expect(Object.values(state.features).every((v) => v === false)).toBe(true);
    }
  });
  it("validates booleans and discards unknown legacy options", () => {
    const c = load(), site = c.unhookedSiteById("x");
    const state = c.unhookedResolveSettings({ "unhooked.site.x.enabled": 0, "unhooked.site.x.hideHomeFeed": "true", "unhooked.paused": "false", mystery: true }, site);
    expect(state).toEqual({ paused: false, enabled: true, features: { hideHomeFeed: false, hideExplore: false, hideRecommendations: false } });
    expect(() => c.unhookedFeaturePatch("x", "hideHomeFeed", 1)).toThrow();
    expect(() => c.unhookedFeaturePatch("unknown", "hideHomeFeed", true)).toThrow();
    expect(() => c.unhookedFeaturePatch("x", "bogus", true)).toThrow();
  });
  it("preserves legacy aliases and explicit scalar false precedence", () => {
    const c = load(); const legacy = { unhookedOptions: { hideEndScreen: true, hideMerchShelf: true, hideSearchMovieOffers: true, extensionDisabled: true, hideComments: true } };
    const opts = c.unhookedYouTubeOptions(legacy);
    expect(opts.hideEndScreenFeed).toBe(true); expect(opts.hideEndScreenCards).toBe(true);
    expect(opts.hideMerchTicketsOffers).toBe(true); expect(opts.hideInaptSearchResults).toBe(true);
    expect(opts.extensionDisabled).toBe(true);
    const explicit = c.unhookedYouTubeOptions({ ...legacy, "unhooked.paused": false, "unhooked.site.youtube.hideComments": false });
    expect(explicit.extensionDisabled).toBe(false); expect(explicit.hideComments).toBe(false);
    expect(c.unhookedYouTubeOptions({ ...legacy, "unhooked.paused": false, "unhooked.site.youtube.enabled": false }).extensionDisabled).toBe(true);
  });
  it("writes only the selected setting and preserves concurrent unrelated writes", () => {
    const c = load(); const first = c.unhookedFeaturePatch("x", "hideHomeFeed", true);
    const second = c.unhookedFeaturePatch("reddit", "hideHomeFeed", true);
    expect(Object.keys(first)).toEqual(["unhooked.site.x.hideHomeFeed"]);
    const storage = Object.assign({}, first, second);
    expect(c.unhookedResolveSettings(storage, c.unhookedSiteById("x")).features.hideHomeFeed).toBe(true);
    expect(c.unhookedResolveSettings(storage, c.unhookedSiteById("reddit")).features.hideHomeFeed).toBe(true);
  });
  it("presets affect exactly a site's features, preserving pause and enable", () => {
    const c = load();
    for (const site of c.UNHOOKED_SITES) for (const preset of ["balanced", "focused", "clear"]) {
      const patch = c.unhookedPresetPatch(site.id, preset);
      expect(Object.keys(patch)).toHaveLength(site.features.length);
      expect(Object.keys(patch).every((key) => key.startsWith("unhooked.site." + site.id + ".") && !key.endsWith(".enabled"))).toBe(true);
      const storage = { "unhooked.paused": true, [c.unhookedPreferenceKey(site.id, "enabled")]: false, ...patch };
      const state = c.unhookedResolveSettings(storage, site);
      expect(state.paused).toBe(true); expect(state.enabled).toBe(false);
      site.features.forEach((f) => expect(state.features[f.id]).toBe(preset === "focused" || (preset === "balanced" && f.balanced)));
    }
    expect(() => c.unhookedPresetPatch("x", "typo")).toThrow();
  });
  it("removing a scalar key restores its legacy fallback", () => {
    const c = load(), raw = { unhookedOptions: { hideComments: true }, "unhooked.site.youtube.hideComments": false };
    c.unhookedMergeChanges(raw, { "unhooked.site.youtube.hideComments": { oldValue: false } });
    expect(c.unhookedYouTubeOptions(raw).hideComments).toBe(true);
  });
});

describe("site boundaries and protected routes", () => {
  it("matches exact hosts, including current and legacy Threads", () => {
    const c = load();
    for (const site of c.UNHOOKED_SITES) for (const host of site.hosts) expect(c.unhookedSiteForHost(host).id).toBe(site.id);
    expect(c.unhookedSiteForHost("notx.com")).toBeUndefined();
    expect(c.unhookedSiteForHost("x.com.evil.test")).toBeUndefined();
    expect(c.unhookedSiteForHost("news.reddit.com")).toBeUndefined();
    expect(c.unhookedSiteForHost("www.threads.com").id).toBe("threads");
    expect(c.unhookedSiteForHost("threads.net").id).toBe("threads");
  });
  const routes = {
    x: ["/home", "/alice", "/alice/status/123", "/search?q=hello", "/messages"],
    reddit: ["/r/popular", "/r/example", "/r/example/comments/123/title", "/search?q=hello", "/message/inbox"],
    instagram: ["/", "/alice/", "/p/abc/", "/accounts/login/", "/direct/inbox/"],
    tiktok: ["/foryou", "/@alice", "/@alice/video/123", "/search?q=hello", "/messages"],
    facebook: ["/", "/profile.php?id=1", "/alice/posts/123", "/search/top", "/messages/t/123"],
    linkedin: ["/feed/", "/in/alice/", "/feed/update/urn:123/", "/search/results/all/", "/messaging/"],
    threads: ["/following", "/@alice", "/@alice/post/123", "/search", "/messages"]
  };
  it.each(Object.entries(routes))("%s classifies home without mistaking direct routes for it", (id, paths) => {
    const c = load(), site = c.unhookedSiteById(id);
    const classified = paths.map((p) => site.classify(new URL("https://" + site.hosts[0] + p)));
    expect(classified[0]).toBe("home"); expect(classified[1]).toBe("profile"); expect(classified[2]).toBe("detail");
    expect(classified[3]).not.toBe("home"); expect(classified[4]).toBe("messages");
    expect(site.classify(new URL("https://" + site.hosts[0] + "/unrecognized/nested/route"))).toBe("other");
    const feed = site.features.find((feature) => feature.id === "hideHomeFeed");
    expect(feed.rules.every((rule) => rule.routes.every((route) => route === "home"))).toBe(true);
    const css = c.unhookedCompileSiteCSS(site);
    expect(css).toContain('html[data-uh-site="' + id + '"][data-uh-route="home"]');
    expect(css).not.toContain('[data-uh-route="other"]');
    expect(css).not.toContain('[data-uh-route="messages"]');
  });
  it("registry hosts exactly match every manifest host", () => {
    const c = load(), manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(c.UNHOOKED_SITES.flatMap((site) => site.hosts).sort()).toEqual(manifest.host_permissions.map((pattern) => pattern.split("/")[2]).sort());
    const social = manifest.content_scripts[1].matches.map((pattern) => pattern.split("/")[2]).sort();
    expect(social).toEqual(c.UNHOOKED_SITES.filter((site) => site.id !== "youtube").flatMap((site) => site.hosts).sort());
  });
});
