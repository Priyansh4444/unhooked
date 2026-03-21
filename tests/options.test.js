import { describe, expect, it } from "vitest";
import { loadOptionsModule } from "./helpers/load-options.js";

describe("shared/options.js", () => {
  const {
    defaultUnhookedOptions,
    mergeUnhookedOptions,
    UNHOOKED_OPTION_KEYS,
    UNHOOKED_STORAGE_KEY
  } = loadOptionsModule();

  it("uses a stable storage key", () => {
    expect(UNHOOKED_STORAGE_KEY).toBe("unhookedOptions");
  });

  it("lists every option key exactly once", () => {
    const set = new Set(UNHOOKED_OPTION_KEYS);
    expect(UNHOOKED_OPTION_KEYS.length).toBe(set.size);
  });

  it("defaultUnhookedOptions sets every key to false", () => {
    const d = defaultUnhookedOptions();
    expect(Object.keys(d).sort()).toEqual([...UNHOOKED_OPTION_KEYS].sort());
    for (const k of UNHOOKED_OPTION_KEYS) {
      expect(d[k]).toBe(false);
    }
  });

  it("mergeUnhookedOptions returns defaults for null/undefined/non-object", () => {
    const base = defaultUnhookedOptions();
    expect(mergeUnhookedOptions(null)).toEqual(base);
    expect(mergeUnhookedOptions(undefined)).toEqual(base);
    expect(mergeUnhookedOptions("x")).toEqual(base);
    expect(mergeUnhookedOptions(1)).toEqual(base);
  });

  it("mergeUnhookedOptions ignores unknown keys and non-booleans", () => {
    const merged = mergeUnhookedOptions({
      hideComments: "yes",
      hideShorts: false,
      unknownKey: true,
      hideLiveChat: true
    });
    expect(merged.hideComments).toBe(false);
    expect(merged.hideShorts).toBe(false);
    expect(merged.unknownKey).toBeUndefined();
    expect(merged.hideLiveChat).toBe(true);
  });

  it("mergeUnhookedOptions applies valid booleans", () => {
    const merged = mergeUnhookedOptions({
      hideComments: true,
      hideShorts: true
    });
    expect(merged.hideComments).toBe(true);
    expect(merged.hideShorts).toBe(true);
    expect(merged.hideLiveChat).toBe(false);
  });

  it("migrates legacy keys from older versions", () => {
    const merged = mergeUnhookedOptions({
      hideEndScreen: true,
      hideMerchShelf: true,
      hideSearchMovieOffers: true
    });
    expect(merged.hideEndScreenFeed).toBe(true);
    expect(merged.hideEndScreenCards).toBe(true);
    expect(merged.hideMerchTicketsOffers).toBe(true);
    expect(merged.hideInaptSearchResults).toBe(true);
  });
});
