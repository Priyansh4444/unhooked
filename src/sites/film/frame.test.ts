import { describe, expect, it } from "bun:test";
import { cropBox, fitScale, sharperImage, shotName } from "./frame.ts";

const view = { width: 1000, height: 800 };

describe("framing a post", () => {
  it("enlarges a short post, but not without limit", () => {
    expect(fitScale({ width: 400, height: 200 }, view)).toBe(1.5);
  });
  it("shrinks a slightly tall post to fit the height", () => {
    expect(fitScale({ width: 600, height: 700 }, view)).toBeCloseTo(0.96);
  });
  it("stops shrinking a long post while it can still be read", () => {
    expect(fitScale({ width: 600, height: 5000 }, view)).toBe(0.9);
  });
  it("shrinks a wide post to fit the width", () => {
    expect(fitScale({ width: 1760, height: 100 }, view)).toBeCloseTo(0.5);
  });
});

describe("cropping the picture", () => {
  const box = { left: 200, top: 300, width: 600, height: 200 };
  it("keeps a margin of backdrop around the post, in image pixels", () => {
    expect(cropBox(box, view, 2000)).toEqual({ left: 288, top: 488, width: 1424, height: 624 });
  });
  it("stays inside the image", () => {
    const edge = cropBox({ left: 10, top: 10, width: 980, height: 780 }, view, 1000);
    expect(edge).toEqual({ left: 0, top: 0, width: 1000, height: 800 });
  });
});

describe("sharper pictures", () => {
  it("asks X for the large copy of media", () => {
    expect(sharperImage("https://pbs.twimg.com/media/abc?format=jpg&name=small")).toBe(
      "https://pbs.twimg.com/media/abc?format=jpg&name=large",
    );
    expect(sharperImage("https://pbs.twimg.com/media/abc?name=360x360&format=webp")).toBe(
      "https://pbs.twimg.com/media/abc?name=large&format=webp",
    );
  });
  it("and of link cards", () => {
    expect(sharperImage("https://pbs.twimg.com/card_img/1/a?format=jpg&name=small")).toBe(
      "https://pbs.twimg.com/card_img/1/a?format=jpg&name=large",
    );
  });
  it("asks for the big profile picture", () => {
    expect(sharperImage("https://pbs.twimg.com/profile_images/1/a_normal.jpg")).toBe(
      "https://pbs.twimg.com/profile_images/1/a_400x400.jpg",
    );
  });
  it("leaves everything else alone", () => {
    for (const url of [
      "https://abs.twimg.com/emoji/v2/svg/1f600.svg",
      "https://example.org/media/a?name=small",
    ])
      expect(sharperImage(url)).toBe(url);
  });
});

describe("the file name", () => {
  it("names the site and the time", () => {
    expect(shotName("www.youtube.com", new Date(2026, 10, 2, 8, 5, 9))).toBe(
      "youtube.com-2026-11-02-08-05-09.png",
    );
  });
});
