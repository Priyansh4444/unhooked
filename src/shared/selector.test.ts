import { describe, expect, it } from "bun:test";
import { isStableToken } from "./selector.ts";

describe("stable selector tokens", () => {
  it.each([
    ["primaryColumn"],
    ["ytd-rich-shelf-renderer"],
    ["sidebarColumn"],
    ["right-sidebar-container"],
    ["feed-video"],
    ["post"],
  ])("keeps %s", (token) => expect(isStableToken(token)).toBe(true));

  it.each([
    ["css-1dbjc4n"],
    ["tiktok-1fm4cl2"],
    ["eqg5fwt3"],
    ["sc-bdVaJa"],
    ["_aoqh"],
    ["x1lliihq"],
    ["a8f3c91e"],
    ["video-4471234"],
    [""],
  ])("drops generated %s", (token) => expect(isStableToken(token)).toBe(false));
});
