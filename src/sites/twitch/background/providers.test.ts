import { describe, expect, it } from "bun:test";
import type { LinkMeta } from "../links.ts";
import { metaFromTweet, refreshTarget, tweetToken, type XTweet } from "./providers.ts";

const base: LinkMeta = {
  kind: "twitter",
  url: "https://x.com/a/status/1",
  title: "Post on X",
  twitterStatusId: "1",
};
const user = { name: "A", screen_name: "a", profile_image_url_https: "https://p/x_normal.jpg" };
const card = (tweet: XTweet) => metaFromTweet({ user, text: "hi", ...tweet }, base)!;

describe("an X post as a card", () => {
  it("sends the value X's own embed sends", () => {
    expect(tweetToken("20")).toBe("6dq1a2xwd9");
  });
  it("names who wrote it, with a sharper avatar", () => {
    const meta = card({ text: "hello", favorite_count: 1200, conversation_count: 3 });
    expect(meta.textSnippet).toBe("hello");
    expect(meta.authorName).toBe("A");
    expect(meta.authorHandle).toBe("a");
    expect(meta.authorAvatar).toBe("https://p/x_bigger.jpg");
    expect(meta.chips).toContain("♥ 1.2K");
  });
  it("leaves off the trailing link to its own media", () => {
    const meta = card({ text: "look https://t.co/m", display_text_range: [0, 4] });
    expect(meta.textSnippet).toBe("look");
  });
  it("spells out links and entities", () => {
    const meta = card({
      text: "a &amp; b https://t.co/x",
      entities: { urls: [{ url: "https://t.co/x", display_url: "site.com" }] },
    });
    expect(meta.textSnippet).toBe("a & b site.com");
  });
  it("carries up to four photos", () => {
    const photos = ["1", "2", "3", "4", "5"].map((n) => ({ url: `https://p/${n}.jpg` }));
    expect(card({ photos }).photos).toHaveLength(4);
  });
  it("plays the best video file, and doesn't also show its still as a photo", () => {
    const meta = card({
      photos: [{ url: "https://p/still.jpg" }],
      mediaDetails: [
        {
          type: "video",
          media_url_https: "https://p/poster.jpg",
          video_info: {
            variants: [
              { content_type: "application/x-mpegURL", url: "https://v/a.m3u8" },
              { content_type: "video/mp4", bitrate: 800, url: "https://v/low.mp4" },
              { content_type: "video/mp4", bitrate: 2000, url: "https://v/high.mp4" },
            ],
          },
        },
      ],
    });
    expect(meta.video).toEqual({ poster: "https://p/poster.jpg", src: "https://v/high.mp4" });
    expect(meta.photos).toBeUndefined();
  });
  it("doesn't reach for the 4K file", () => {
    const meta = card({
      mediaDetails: [
        {
          type: "video",
          media_url_https: "https://p/poster.jpg",
          video_info: {
            variants: [
              { content_type: "video/mp4", bitrate: 8_000_000, url: "https://v/4k.mp4" },
              { content_type: "video/mp4", bitrate: 2_176_000, url: "https://v/720.mp4" },
              { content_type: "video/mp4", bitrate: 832_000, url: "https://v/480.mp4" },
            ],
          },
        },
      ],
    });
    expect(meta.video?.src).toBe("https://v/720.mp4");
  });
  it("includes the post it quotes", () => {
    const meta = card({ quoted_tweet: { user: { name: "B", screen_name: "b" }, text: "orig" } });
    expect(meta.quote).toEqual({ name: "B", handle: "b", avatar: undefined, text: "orig" });
  });
  it("says what it replies to", () => {
    expect(card({ in_reply_to_screen_name: "c" }).replyTo).toBe("c");
  });
  it("reads an article by its title, cover and preview", () => {
    const meta = card({
      article: {
        title: "Long read",
        preview_text: "It begins",
        cover_media: { media_info: { original_img_url: "https://p/cover.jpg" } },
      },
    });
    expect(meta.textSnippet).toBe("Long read");
    expect(meta.description).toBe("It begins");
    expect(meta.photos).toEqual(["https://p/cover.jpg"]);
  });
  it("lists a poll's choices", () => {
    const values = {
      choice1_label: { string_value: "Yes" },
      choice2_label: { string_value: "No" },
    };
    expect(card({ card: { binding_values: values } }).description).toBe("Poll: Yes · No");
  });
  it("has nothing to say about a gone post", () => {
    expect(metaFromTweet(null, base)).toBeNull();
    expect(metaFromTweet({ __typename: "TweetTombstone" }, base)).toBeNull();
  });
});

describe("where a shortened link goes", () => {
  it("reads the refresh tag", () => {
    const page = `<head><noscript><META http-equiv="refresh" content="0;URL=https://a.example/b?c=1"></noscript></head>`;
    expect(refreshTarget(page)).toBe("https://a.example/b?c=1");
  });
  it("takes the tag's attributes in either order", () => {
    expect(refreshTarget(`<meta content="0; url=https://a.example" http-equiv=refresh>`)).toBe(
      "https://a.example",
    );
  });
  it("ignores any other url= on the page", () => {
    const page = `<a href="https://share.example/?url=https://b.example">share</a>`;
    expect(refreshTarget(page)).toBeUndefined();
  });
});
