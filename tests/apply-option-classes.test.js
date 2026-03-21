import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSharedExtensionScripts } from "./helpers/load-shared.js";
import { createElementWithClassMock } from "./helpers/class-list-mock.js";
import { loadOptionsModule } from "./helpers/load-options.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("shared/apply-option-classes.js", () => {
  it("throws if mappings were not loaded first", () => {
    const code = readFileSync(join(rootDir, "shared/apply-option-classes.js"), "utf8");
    const context = vm.createContext({ console });
    const opts = readFileSync(join(rootDir, "shared/options.js"), "utf8");
    vm.runInContext(opts, context);
    vm.runInContext(code, context);
    const el = createElementWithClassMock();
    expect(() =>
      context.unhookedApplyOptionClasses(el, { extensionDisabled: false }, { isMobile: false, isEmbed: false })
    ).toThrow(/mappings\.js/);
  });

  it("adds uh-mobile and uh-embed from hostInfo", () => {
    const ctx = loadSharedExtensionScripts();
    const { classList } = createElementWithClassMock();
    const base = ctx.defaultUnhookedOptions();
    ctx.unhookedApplyOptionClasses({ classList }, base, { isMobile: true, isEmbed: true });
    expect(classList.snapshot()).toContain("uh-mobile");
    expect(classList.snapshot()).toContain("uh-embed");
  });

  it("when extensionDisabled, only structural classes + uh-extension-disabled", () => {
    const ctx = loadSharedExtensionScripts();
    const { classList } = createElementWithClassMock();
    const o = ctx.defaultUnhookedOptions();
    o.extensionDisabled = true;
    o.hideComments = true;
    ctx.unhookedApplyOptionClasses({ classList }, o, { isMobile: false, isEmbed: false });
    const snap = classList.snapshot();
    expect(snap).toContain("uh-extension-disabled");
    expect(snap).not.toContain("uh-hide-comments");
  });

  it("maps every toggled option key to its CSS class", () => {
    const ctx = loadSharedExtensionScripts();
    const { classList } = createElementWithClassMock();
    const o = ctx.defaultUnhookedOptions();
    const map = ctx.UNHOOKED_KEY_TO_CLASS;
    for (const key of Object.keys(map)) {
      o[key] = true;
    }
    ctx.unhookedApplyOptionClasses({ classList }, o, { isMobile: false, isEmbed: false });
    const snap = new Set(classList.snapshot());
    for (const cls of Object.values(map)) {
      expect(snap.has(cls)).toBe(true);
    }
  });

  it("clears prior hide classes on re-apply", () => {
    const ctx = loadSharedExtensionScripts();
    const { classList } = createElementWithClassMock();
    const a = ctx.defaultUnhookedOptions();
    a.hideComments = true;
    ctx.unhookedApplyOptionClasses({ classList }, a, { isMobile: false, isEmbed: false });
    expect(classList.snapshot()).toContain("uh-hide-comments");
    const b = ctx.defaultUnhookedOptions();
    ctx.unhookedApplyOptionClasses({ classList }, b, { isMobile: false, isEmbed: false });
    expect(classList.snapshot()).not.toContain("uh-hide-comments");
  });

  it("remove extensionDisabled restores hide classes", () => {
    const ctx = loadSharedExtensionScripts();
    const { classList } = createElementWithClassMock();
    const off = ctx.defaultUnhookedOptions();
    off.extensionDisabled = true;
    ctx.unhookedApplyOptionClasses({ classList }, off, { isMobile: false, isEmbed: false });
    expect(classList.snapshot()).toContain("uh-extension-disabled");
    const on = ctx.defaultUnhookedOptions();
    on.hideShorts = true;
    ctx.unhookedApplyOptionClasses({ classList }, on, { isMobile: false, isEmbed: false });
    expect(classList.snapshot()).not.toContain("uh-extension-disabled");
    expect(classList.snapshot()).toContain("uh-hide-shorts");
  });
});

describe("merge + apply integration", () => {
  it("legacy hideEndScreen migrates then applies both end-screen classes", () => {
    const { mergeUnhookedOptions } = loadOptionsModule();
    const ctx = loadSharedExtensionScripts();
    const { classList } = createElementWithClassMock();
    const merged = mergeUnhookedOptions({ hideEndScreen: true });
    ctx.unhookedApplyOptionClasses({ classList }, merged, { isMobile: false, isEmbed: false });
    expect(classList.snapshot()).toContain("uh-hide-end-screen-feed");
    expect(classList.snapshot()).toContain("uh-hide-end-screen-cards");
  });
});
