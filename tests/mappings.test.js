import { describe, expect, it } from "vitest";
import { loadOptionsModule } from "./helpers/load-options.js";
import { loadSharedExtensionScripts } from "./helpers/load-shared.js";

describe("shared/mappings.js", () => {
  const { UNHOOKED_OPTION_KEYS } = loadOptionsModule();

  it("every option key except extensionDisabled has a CSS class mapping", () => {
    const ctx = loadSharedExtensionScripts();
    const map = ctx.UNHOOKED_KEY_TO_CLASS;
    const keysNeedingClass = UNHOOKED_OPTION_KEYS.filter((k) => k !== "extensionDisabled");
    for (const k of keysNeedingClass) {
      expect(map[k], `missing mapping for ${k}`).toBeTruthy();
      expect(typeof map[k]).toBe("string");
    }
  });

  it("mapping has no extra keys outside UNHOOKED_OPTION_KEYS", () => {
    const ctx = loadSharedExtensionScripts();
    const map = ctx.UNHOOKED_KEY_TO_CLASS;
    const allowed = new Set(UNHOOKED_OPTION_KEYS);
    for (const k of Object.keys(map)) {
      expect(allowed.has(k), `unexpected mapping key ${k}`).toBe(true);
      expect(k).not.toBe("extensionDisabled");
    }
  });

  it("all class tokens match uh- prefix pattern and are unique", () => {
    const ctx = loadSharedExtensionScripts();
    const map = ctx.UNHOOKED_KEY_TO_CLASS;
    const re = /^uh-[a-z0-9-]+$/;
    const seen = new Set();
    for (const cls of Object.values(map)) {
      expect(cls).toMatch(re);
      expect(seen.has(cls), `duplicate class ${cls}`).toBe(false);
      seen.add(cls);
    }
  });

  it("hideInaptSearchResults maps to shortened inapt-search class (CSS alias)", () => {
    const ctx = loadSharedExtensionScripts();
    expect(ctx.UNHOOKED_KEY_TO_CLASS.hideInaptSearchResults).toBe("uh-hide-inapt-search");
  });
});
