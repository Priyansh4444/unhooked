import { describe, expect, it } from "bun:test";
import { grantedPages } from "./pages.ts";

describe("wand pages", () => {
  it("keeps the sites the user allowed and drops Unhooked's own", () => {
    expect(
      grantedPages([
        "*://news.ycombinator.com/*",
        "https://x.com/*",
        "*://x.com/*",
        "*://www.youtube.com/*",
        "*://api.github.com/*",
        "<all_urls>",
      ]),
    ).toEqual(["*://news.ycombinator.com/*"]);
  });
});
