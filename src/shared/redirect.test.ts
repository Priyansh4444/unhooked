import { describe, expect, it } from "bun:test";
import { controlSiteById } from "../sites/registry.ts";
import { resolveSettings } from "./preferences.ts";
import { redirectFor } from "./redirect.ts";

const on = (siteId: string, extra: Record<string, unknown> = {}) =>
  resolveSettings(
    { [`unhooked.site.${siteId}.redirect`]: true, ...extra },
    controlSiteById(siteId)!,
  );
const at = (siteId: string, path: string) =>
  new URL(`https://${controlSiteById(siteId)!.hosts[0]}${path}`);

describe("skip the feeds", () => {
  it("does nothing until it is turned on, or while paused or the site is off", () => {
    const x = controlSiteById("x")!;
    expect(redirectFor(x, at("x", "/home"), resolveSettings({}, x))).toBeNull();
    expect(redirectFor(x, at("x", "/home"), on("x", { "unhooked.paused": true }))).toBeNull();
    expect(
      redirectFor(x, at("x", "/home"), on("x", { "unhooked.site.x.enabled": false })),
    ).toBeNull();
  });

  it("leaves feed routes for the chosen page and nothing else", () => {
    const x = controlSiteById("x")!;
    expect(redirectFor(x, at("x", "/home"), on("x"))).toEqual({
      go: "https://x.com/notifications",
    });
    expect(redirectFor(x, at("x", "/explore/tabs/for-you"), on("x"))).not.toBeNull();
    for (const path of ["/someone", "/someone/status/1", "/search?q=a", "/messages"])
      expect(redirectFor(x, at("x", path), on("x"))).toBeNull();
  });

  it("uses the user's own path, but never into another feed (a loop)", () => {
    const yt = controlSiteById("youtube")!;
    const to = (path: string) => on("youtube", { "unhooked.site.youtube.redirectTo": path });
    expect(redirectFor(yt, at("youtube", "/"), to("/playlist?list=WL"))).toEqual({
      go: "https://www.youtube.com/playlist?list=WL",
    });
    expect(redirectFor(yt, at("youtube", "/"), to("/feed/trending"))).toBeNull();
    // Another origin is not a path on the site: the default is used instead.
    expect(redirectFor(yt, at("youtube", "/"), to("//evil.example/"))).toEqual({
      go: "https://www.youtube.com/feed/subscriptions",
    });
  });

  it("opens Shorts in the normal player", () => {
    const yt = controlSiteById("youtube")!;
    expect(redirectFor(yt, at("youtube", "/shorts/abc123"), on("youtube"))).toEqual({
      go: "https://www.youtube.com/watch?v=abc123",
    });
    expect(redirectFor(yt, at("youtube", "/watch?v=abc123"), on("youtube"))).toBeNull();
  });

  it("waits for the signed-in account when the page names it", () => {
    const ig = controlSiteById("instagram")!;
    const saved = on("instagram", { "unhooked.site.instagram.redirectTo": "/{user}/saved/" });
    expect(redirectFor(ig, at("instagram", "/"), saved)).toEqual({ needsUser: true });
    expect(redirectFor(ig, at("instagram", "/reels/"), saved, "pronsh")).toEqual({
      go: "https://instagram.com/pronsh/saved/",
    });
    expect(redirectFor(ig, at("instagram", "/pronsh/saved/"), saved, "pronsh")).toBeNull();
  });

  it("offers only same-site paths that are not feeds themselves", () => {
    for (const id of [
      "youtube",
      "x",
      "reddit",
      "instagram",
      "tiktok",
      "facebook",
      "linkedin",
      "threads",
    ]) {
      const site = controlSiteById(id)!;
      for (const { path } of site.redirect.choices) {
        const target = at(id, path.replaceAll("{user}", "someone"));
        expect(site.redirect.routes, `${id} ${path}`).not.toContain(site.classify(target));
      }
    }
  });
});
