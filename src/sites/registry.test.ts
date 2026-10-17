import { describe, expect, it } from "bun:test";
import { createManifest, SOCIAL_SITES } from "../../build/manifest.ts";
import { SITE_HOSTS, siteForHost } from "./hosts.ts";
import { CONTROL_SITES, compileSiteCss, controlSiteById, controlSiteForHost } from "./registry.ts";

const classify = (id: string, path: string) => {
  const site = controlSiteById(id)!;
  return site.classify(new URL(`https://${site.hosts[0]}${path}`));
};

describe("site boundaries", () => {
  it("matches exact hosts only", () => {
    for (const site of CONTROL_SITES)
      for (const host of site.hosts) expect(controlSiteForHost(host)?.id).toBe(site.id);
    expect(siteForHost("notx.com")).toBeUndefined();
    expect(siteForHost("x.com.evil.test")).toBeUndefined();
    expect(siteForHost("news.reddit.com")).toBeUndefined();
    expect(siteForHost("threads.net")).toBe("threads");
    expect(siteForHost("WWW.YOUTUBE.COM")).toBe("youtube");
  });

  it("generates manifests from the host registry for every browser", () => {
    for (const target of ["chrome", "firefox", "safari"] as const) {
      const manifest = createManifest(target) as Record<string, any>;
      const permissions: string[] = manifest.host_permissions ?? manifest.permissions;
      for (const host of Object.values(SITE_HOSTS).flat()) {
        expect(permissions.some((pattern) => pattern.includes(`://${host}/`))).toBe(true);
      }
      const social = manifest.content_scripts.find((script: any) =>
        script.js.includes("sites/social/content.js"),
      );
      expect(social.matches.sort()).toEqual(
        SOCIAL_SITES.flatMap((id) => SITE_HOSTS[id].map((host) => `*://${host}/*`)).sort(),
      );
      const youtube = manifest.content_scripts.find((script: any) =>
        script.js.includes("sites/youtube/content.js"),
      );
      expect(youtube.all_frames).toBe(true);
      expect(manifest.description.length).toBeLessThanOrEqual(132);
    }
    expect(createManifest("firefox").browser_specific_settings?.gecko.id).toBe(
      "unhooked@pronsh.dev",
    );
  });
});

describe("protected routes", () => {
  const routes: Record<
    string,
    [home: string, profile: string, detail: string, search: string, messages: string]
  > = {
    x: ["/home", "/alice", "/alice/status/123", "/search?q=hello", "/messages"],
    reddit: [
      "/r/popular",
      "/r/example",
      "/r/example/comments/123/title",
      "/search?q=hello",
      "/message/inbox",
    ],
    instagram: ["/", "/alice/", "/p/abc/", "/accounts/login/", "/direct/inbox/"],
    tiktok: ["/foryou", "/@alice", "/@alice/video/123", "/search?q=hello", "/messages"],
    facebook: ["/", "/profile.php?id=1", "/alice/posts/123", "/search/top", "/messages/t/123"],
    linkedin: [
      "/feed/",
      "/in/alice/",
      "/feed/update/urn:123/",
      "/search/results/all/",
      "/messaging/",
    ],
    threads: ["/following", "/@alice", "/@alice/post/123", "/search", "/messages"],
  };

  it.each(Object.entries(routes))(
    "%s classifies home without mistaking direct routes for it",
    (id, [home, profile, detail, search, messages]) => {
      expect(classify(id, home)).toBe("home");
      expect(classify(id, profile)).toBe("profile");
      expect(classify(id, detail)).toBe("detail");
      expect(classify(id, search)).not.toBe("home");
      expect(classify(id, messages)).toBe("messages");
      expect(classify(id, "/unrecognized/nested/route")).toBe("other");
      const site = controlSiteById(id)!;
      const feed = site.features.find((f) => f.id === "hideHomeFeed")!;
      expect(feed.rules.every((rule) => rule.routes.every((route) => route === "home"))).toBe(true);
      const css = compileSiteCss(site);
      expect(css).toContain(`html[data-uh-site="${id}"][data-uh-route="home"]`);
      expect(css).not.toContain('[data-uh-route="other"]');
      expect(css).not.toContain('[data-uh-route="messages"]');
    },
  );

  it.each([
    ["x", "/explore/tabs/trending", "discovery"],
    ["x", "/explore/tabs/for-you/", "discovery"],
    ["x", "/explorer", "profile"],
    ["reddit", "/best/", "home"],
    ["reddit", "/new", "home"],
    ["reddit", "/r/popular/hot/", "home"],
    ["reddit", "/r/all/top", "home"],
    ["reddit", "/r/rust/hot/", "other"],
    ["instagram", "/reels/", "shorts"],
    ["instagram", "/reels/C1abc/", "shorts"],
    ["instagram", "/reel/C1abc/", "detail"],
  ])("%s classifies %s as %s", (id, path, route) => {
    expect(classify(id, path) as string).toBe(route);
  });

  it("applies sidebar-only rules everywhere and keeps feed rules route scoped", () => {
    for (const [id, feature] of [
      ["x", "hideRecommendations"],
      ["reddit", "hideRecommendations"],
      ["tiktok", "hideSuggestions"],
    ] as const) {
      const site = controlSiteById(id)!;
      const rules = site.features.find((f) => f.id === feature)!.rules;
      expect(rules.every((rule) => rule.routes.join() === "*")).toBe(true);
      expect(compileSiteCss(site)).toContain(
        `html[data-uh-site="${id}"].uh-social-${id}-${feature} `,
      );
    }
    for (const site of CONTROL_SITES)
      for (const feature of site.features)
        if (feature.id === "hideHomeFeed")
          expect(feature.rules.every((rule) => !rule.routes.includes("*"))).toBe(true);
  });
});
