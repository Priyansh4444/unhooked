import { describe, expect, it } from "bun:test";
import { CONTROL_SITES, controlSiteById } from "../sites/registry.ts";
import {
  featurePatch,
  isPaused,
  matchingPreset,
  mergeChanges,
  preferenceKey,
  presetPatch,
  PRESETS,
  resolveSettings,
  youTubeOptions,
} from "./preferences.ts";

const site = (id: string) => controlSiteById(id)!;

describe("independent scalar preferences", () => {
  it("defaults to enabled with every hide off on all eight sites", () => {
    expect(CONTROL_SITES).toHaveLength(8);
    for (const s of CONTROL_SITES) {
      const state = resolveSettings({}, s);
      expect(state.enabled).toBe(true);
      expect(state.paused).toBe(false);
      expect(Object.values(state.features).every((v) => v === false)).toBe(true);
    }
  });

  it("validates booleans and ignores unknown keys", () => {
    const state = resolveSettings(
      {
        "unhooked.site.x.enabled": 0,
        "unhooked.site.x.hideHomeFeed": "true",
        "unhooked.paused": "false",
        mystery: true,
      },
      site("x"),
    );
    expect(state).toEqual({
      paused: false,
      enabled: true,
      features: { hideHomeFeed: false, hideExplore: false, hideRecommendations: false },
    });
    expect(() => featurePatch("x", "hideHomeFeed", 1 as unknown as boolean)).toThrow();
    expect(() => featurePatch("unknown", "hideHomeFeed", true)).toThrow();
    expect(() => featurePatch("x", "bogus", true)).toThrow();
  });

  it("keeps legacy aliases and lets explicit scalar values win", () => {
    const legacy = {
      unhookedOptions: {
        hideEndScreen: true,
        hideMerchShelf: true,
        hideSearchMovieOffers: true,
        extensionDisabled: true,
        hideComments: true,
      },
    };
    const options = youTubeOptions(legacy);
    expect(options.hideEndScreenFeed).toBe(true);
    expect(options.hideEndScreenCards).toBe(true);
    expect(options.hideMerchTicketsOffers).toBe(true);
    expect(options.hideInaptSearchResults).toBe(true);
    expect(options.extensionDisabled).toBe(true);
    expect(isPaused(legacy)).toBe(true);

    const explicit = youTubeOptions({
      ...legacy,
      "unhooked.paused": false,
      "unhooked.site.youtube.hideComments": false,
    });
    expect(explicit.extensionDisabled).toBe(false);
    expect(explicit.hideComments).toBe(false);
    expect(
      youTubeOptions({
        ...legacy,
        "unhooked.paused": false,
        "unhooked.site.youtube.enabled": false,
      }).extensionDisabled,
    ).toBe(true);
  });

  it("writes only the selected setting, so concurrent unrelated writes survive", () => {
    const first = featurePatch("x", "hideHomeFeed", true);
    const second = featurePatch("reddit", "hideHomeFeed", true);
    expect(Object.keys(first)).toEqual(["unhooked.site.x.hideHomeFeed"]);
    const storage = { ...first, ...second };
    expect(resolveSettings(storage, site("x")).features.hideHomeFeed).toBe(true);
    expect(resolveSettings(storage, site("reddit")).features.hideHomeFeed).toBe(true);
  });

  it("presets touch exactly one site's features and keep pause and enable", () => {
    for (const s of CONTROL_SITES) {
      for (const preset of PRESETS) {
        const patch = presetPatch(s.id, preset);
        expect(Object.keys(patch)).toHaveLength(s.features.length);
        for (const key of Object.keys(patch)) {
          expect(key.startsWith(`unhooked.site.${s.id}.`) && !key.endsWith(".enabled")).toBe(true);
        }
        const state = resolveSettings(
          { "unhooked.paused": true, [preferenceKey(s.id, "enabled")]: false, ...patch },
          s,
        );
        expect(state.paused).toBe(true);
        expect(state.enabled).toBe(false);
        for (const f of s.features) {
          expect(state.features[f.id]).toBe(
            preset === "focused" || (preset === "balanced" && f.balanced),
          );
        }
      }
    }
    expect(() => presetPatch("x", "typo" as never)).toThrow();
  });

  it("marks one matching preset, preferring the first when two coincide", () => {
    // Every X control is in Balanced, so Balanced and Focus produce the same choices.
    const x = site("x");
    expect(matchingPreset("x", resolveSettings(presetPatch("x", "focused"), x))).toBe("balanced");
    expect(matchingPreset("x", resolveSettings({}, x))).toBe("clear");
    const custom = { ...presetPatch("x", "focused"), ...featurePatch("x", "hideExplore", false) };
    expect(matchingPreset("x", resolveSettings(custom, x))).toBeUndefined();
  });

  it("removing a scalar key restores its legacy fallback", () => {
    const raw = {
      unhookedOptions: { hideComments: true },
      "unhooked.site.youtube.hideComments": false,
    };
    mergeChanges(raw, { "unhooked.site.youtube.hideComments": {} });
    expect(youTubeOptions(raw).hideComments).toBe(true);
  });
});
