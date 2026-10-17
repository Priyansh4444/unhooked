/** Pure link-label contract: kind, pill label and enrichment inputs. No network. */
import { describe, expect, test } from "bun:test";
import {
  classifyLink,
  enrichedPillLabelFromMeta,
  extractTwitterStatusId,
  tryParseUrl,
  type LinkMeta,
} from "./links.ts";

const kindLabel = (href: string): string | null => {
  const c = classifyLink(href);
  return c ? `${c.kind}|${c.label}` : null;
};

describe("github pills keep the number", () => {
  test("pull request", () => {
    expect(kindLabel("https://github.com/Priyansh4444/Unhooked/pull/12")).toBe(
      "github|Priyansh4444/Unhooked#12",
    );
  });
  test("discussion", () => {
    expect(kindLabel("https://github.com/vercel/next.js/discussions/100010")).toBe(
      "github|vercel/next.js#100010",
    );
  });
  test("discussion category page is not a post", () => {
    expect(kindLabel("https://github.com/vercel/next.js/discussions/categories/ideas")).toBe(
      "github|vercel/next.js · discussions",
    );
  });
  test("long repo shortens the name, never the number", () => {
    expect(
      kindLabel("https://github.com/a-very-long-org-name/a-very-long-repo-name/issues/12345"),
    ).toBe("github|a-very-long-org-name/a-ve…#12345");
  });
  test("commit short sha", () => {
    expect(kindLabel("https://github.com/o/r/commit/abcdef1234567890")).toBe("github|o/r@abcdef1");
  });
});

describe("twitter parsing", () => {
  test("status id survives query params", () => {
    const url = tryParseUrl("https://x.com/notpronsh/status/2079836828107165938?s=20");
    expect(url && extractTwitterStatusId(url)).toBe("2079836828107165938");
    expect(kindLabel("https://x.com/notpronsh/status/2079836828107165938?s=20")).toBe(
      "twitter|@notpronsh",
    );
  });
  test("reserved routes are not handles", () => {
    expect(kindLabel("https://x.com/home")).toBe("twitter|X");
  });
});

describe("twitch own links", () => {
  test("clip, vod, channel", () => {
    expect(kindLabel("https://www.twitch.tv/4hbunger/clip/SavageFunnyAsp")).toBe(
      "twitch|Clip · 4hbunger",
    );
    expect(kindLabel("https://www.twitch.tv/videos/1234567890")).toBe("twitch|VOD · 1234567890");
    expect(kindLabel("https://www.twitch.tv/pronshh")).toBe("twitch|pronshh");
  });
  test("chrome is not content", () => {
    expect(classifyLink("https://www.twitch.tv/")).toBeNull();
    expect(classifyLink("https://static-cdn.jtvnw.net/foo.png")).toBeNull();
    expect(classifyLink("javascript:alert(1)")).toBeNull();
  });
});

describe("enriched pill labels", () => {
  const base: LinkMeta = { kind: "generic", url: "https://x.com/u/status/1", title: "" };
  test("live tweet", () => {
    expect(
      enrichedPillLabelFromMeta({
        ...base,
        kind: "twitter",
        url: "https://x.com/jack/status/20",
        title: "just setting up my twttr",
        textSnippet: "just setting up my twttr",
      }),
    ).toBe("@jack · just setting up my twttr");
  });
  test("deleted tweet stays a clean sentence", () => {
    expect(
      enrichedPillLabelFromMeta({
        ...base,
        kind: "twitter",
        url: "https://x.com/notpronsh/status/2079836828107165938",
        title: "Post not found",
        textSnippet: "Post not found — deleted or private.",
      }),
    ).toBe("@notpronsh · Post not found — deleted");
  });
});

// Every pill must say what the link is: never just the site name when the URL says more.
describe("pills are specific", () => {
  const cases: [string, string][] = [
    ["https://www.youtube.com/@t3dotgg", "youtube|@t3dotgg"],
    ["https://youtube.com/@t3dotgg/videos", "youtube|@t3dotgg"],
    ["https://www.youtube.com/c/TheoBrowne", "youtube|TheoBrowne"],
    ["https://www.youtube.com/user/PewDiePie", "youtube|PewDiePie"],
    ["https://www.youtube.com/channel/UCbRP3c757lWg9M-U7TyEkXA", "youtube|YouTube channel"],
    ["https://www.youtube.com/playlist?list=PLx0sYbCqOb8", "youtube|YouTube playlist"],
    ["https://www.youtube.com/shorts/aqz-KE-bpKQ", "youtube|Short · aqz-KE-bpKQ"],
    ["https://www.youtube.com/live/abcdefghijk", "youtube|Live · abcdefghijk"],
    ["https://music.youtube.com/watch?v=jNQXAC9IVRw", "youtube|YT Music · jNQXAC9IVRw"],
    [
      "https://www.youtube.com/results?search_query=bun+vs+node",
      "youtube|YouTube search: bun vs node",
    ],
    ["https://x.com/i/status/1900000000000000000", "twitter|Post on X"],
    ["https://x.com/hashtag/javascript", "twitter|#javascript"],
    ["https://x.com/search?q=bun", "twitter|X search: bun"],
    ["https://x.com/t3dotgg/likes", "twitter|@t3dotgg"],
    ["https://redd.it/abc123", "reddit|Reddit post"],
    ["https://github.com/oven-sh/bun/blob/main/src/cli.zig", "github|oven-sh/bun · cli.zig"],
    ["https://github.com/oven-sh/bun/tree/main/docs", "github|oven-sh/bun · docs/"],
    ["https://github.com/oven-sh/bun/releases/tag/bun-v1.2.0", "github|oven-sh/bun · bun-v1.2.0"],
    ["https://github.com/oven-sh/bun/issues", "github|oven-sh/bun · issues"],
    ["https://github.com/orgs/oven-sh/repositories", "github|oven-sh"],
    ["https://github.com/topics/javascript", "github|GitHub topic: javascript"],
    ["https://github.com/settings/profile", "github|GitHub"],
    ["https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC", "spotify|Spotify track"],
    ["https://kick.com/xqc/videos/abc", "kick|xqc · VOD"],
    ["https://www.twitch.tv/directory/category/just-chatting", "twitch|Twitch · just chatting"],
    ["https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit", "generic|Google Doc"],
    ["https://news.ycombinator.com/item?id=41234567", "generic|Hacker News"],
    [
      "https://stackoverflow.com/questions/12345/how-to-do-x",
      "generic|Stack Overflow · how to do x",
    ],
    ["https://www.npmjs.com/package/react", "generic|npm · react"],
    ["https://www.amazon.com/dp/B0ABCDEF12", "generic|Amazon"],
    ["https://something.lakebed.app/dashboard", "generic|something.lakebed.app/dashboard"],
  ];
  for (const [href, expected] of cases) {
    test(href, () => expect(kindLabel(href)).toBe(expected));
  }
});

describe("lookups upgrade vague pills", () => {
  const meta = (url: string, kind: LinkMeta["kind"], title: string): LinkMeta => ({
    kind,
    url,
    title,
    textSnippet: title,
  });
  test("channel id becomes the channel name", () => {
    const url = "https://www.youtube.com/channel/UCbRP3c757lWg9M-U7TyEkXA";
    expect(classifyLink(url)?.enrichable).toBe(true);
    expect(enrichedPillLabelFromMeta(meta(url, "youtube", "Theo - t3.gg"))).toBe("Theo - t3.gg");
  });
  test("playlist and short keep what they are", () => {
    expect(
      enrichedPillLabelFromMeta(
        meta("https://www.youtube.com/playlist?list=PLx", "youtube", "Hits 2026"),
      ),
    ).toBe("Playlist · Hits 2026");
    expect(
      enrichedPillLabelFromMeta(
        meta("https://www.youtube.com/shorts/aqz-KE-bpKQ", "youtube", "A cat"),
      ),
    ).toBe("Short · A cat");
  });
  test("spotify names the track", () => {
    const url = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC";
    expect(classifyLink(url)?.enrichable).toBe(true);
    expect(enrichedPillLabelFromMeta(meta(url, "spotify", "Never Gonna Give You Up"))).toBe(
      "Spotify · Never Gonna Give You Up",
    );
  });
});
