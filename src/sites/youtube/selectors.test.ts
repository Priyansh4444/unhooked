import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { OPTION_CLASSES, YOUTUBE_OPTION_KEYS } from "./options.ts";
import { parseOptionSelectors } from "./selectors.ts";

const css = readFileSync(new URL("./controls.css", import.meta.url), "utf8");

describe("YouTube option selectors", () => {
  const parsed = parseOptionSelectors(css);

  it("finds page selectors for every hide option", () => {
    for (const key of YOUTUBE_OPTION_KEYS) {
      if (key === "disableAutoplay") continue; // a player setting, not something on the page
      expect(parsed.get(OPTION_CLASSES[key])?.length ?? 0, key).toBeGreaterThan(0);
    }
  });

  it("keeps :has() lists whole and records extra html conditions", () => {
    const shorts = parsed.get(OPTION_CLASSES.hideShorts)!.map((e) => e.selector);
    expect(shorts).toContain('ytd-rich-item-renderer:has(a[href^="/shorts/"])');
    const endScreen = parsed.get(OPTION_CLASSES.hideEndScreenFeed)!;
    expect(endScreen.some((e) => e.requires.includes("uh-embed"))).toBe(true);
  });

  it("strips the html gate and keeps only the page part", () => {
    for (const entries of parsed.values())
      for (const { selector } of entries) {
        expect(selector.startsWith("html")).toBe(false);
        expect(selector).not.toMatch(/[{}]|uh-extension-disabled/);
      }
  });
});
