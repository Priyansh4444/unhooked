import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  applyOptionClasses,
  defaultYouTubeOptions,
  mergeLegacyOptions,
  OPTION_CLASSES,
  YOUTUBE_OPTION_KEYS,
} from "./options.ts";

const element = () => {
  const classes = new Set<string>();
  let writes = 0;
  return {
    classes,
    writes: () => writes,
    classList: {
      // Mirrors DOMTokenList: a forced toggle that changes nothing writes nothing.
      toggle(name: string, force?: boolean) {
        const on = force ?? !classes.has(name);
        if (on !== classes.has(name)) writes++;
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
    },
  };
};

const host = { isMobile: false, isEmbed: false };

describe("legacy option migration", () => {
  it("lists every option once and defaults them off", () => {
    expect(new Set(YOUTUBE_OPTION_KEYS).size).toBe(YOUTUBE_OPTION_KEYS.length);
    expect(Object.values(defaultYouTubeOptions()).every((value) => value === false)).toBe(true);
  });

  it.each([[null], [undefined], [1], ["x"], [[]]])("returns defaults for %p", (stored) => {
    expect(mergeLegacyOptions(stored)).toEqual(defaultYouTubeOptions());
  });

  it("applies valid booleans and ignores unknown keys and non-booleans", () => {
    const merged = mergeLegacyOptions({ hideComments: true, hideShorts: "yes", mystery: true });
    expect(merged.hideComments).toBe(true);
    expect(merged.hideShorts).toBe(false);
    expect("mystery" in merged).toBe(false);
  });

  it("migrates renamed options and drops the old names", () => {
    const merged = mergeLegacyOptions({
      hideEndScreen: true,
      hideMerchShelf: true,
      hideSearchMovieOffers: true,
    }) as Record<string, unknown>;
    expect(merged.hideEndScreenFeed).toBe(true);
    expect(merged.hideEndScreenCards).toBe(true);
    expect(merged.hideMerchTicketsOffers).toBe(true);
    expect(merged.hideInaptSearchResults).toBe(true);
    expect("hideEndScreen" in merged).toBe(false);
    expect(mergeLegacyOptions({ hideEndScreen: false }).hideEndScreenFeed).toBe(false);
  });
});

describe("option classes", () => {
  it("maps every option to a class that controls.css uses", () => {
    const css = readFileSync(new URL("./controls.css", import.meta.url), "utf8");
    for (const key of YOUTUBE_OPTION_KEYS) {
      if (key === "disableAutoplay") continue; // handled by the content script
      expect(css).toContain(`.${OPTION_CLASSES[key]}`);
    }
  });

  it("applies enabled options and clears everything when disabled", () => {
    const el = element();
    applyOptionClasses(el, { ...defaultYouTubeOptions(), hideComments: true }, host);
    expect(el.classes.has("uh-hide-comments")).toBe(true);
    applyOptionClasses(
      el,
      { ...defaultYouTubeOptions(), hideComments: true, extensionDisabled: true },
      host,
    );
    expect(el.classes.has("uh-hide-comments")).toBe(false);
    expect(el.classes.has("uh-extension-disabled")).toBe(true);
  });

  it("writes nothing when re-applied with the same options (observer safety)", () => {
    const el = element();
    const options = { ...defaultYouTubeOptions(), hideShorts: true };
    applyOptionClasses(el, options, { isMobile: true, isEmbed: false });
    const before = el.writes();
    applyOptionClasses(el, options, { isMobile: true, isEmbed: false });
    expect(el.writes()).toBe(before);
  });
});
