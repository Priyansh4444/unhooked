import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSharedExtensionScripts } from "./helpers/load-shared.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("content/styles.css vs mappings", () => {
  const css = readFileSync(join(rootDir, "content/styles.css"), "utf8");

  /** @param {string} text */
  function extractUhClasses(text) {
    const re = /\.(uh-[a-z0-9-]+)/g;
    const out = new Set();
    let m;
    while ((m = re.exec(text)) !== null) {
      out.add(m[1]);
    }
    return out;
  }

  it("every mapped option class appears at least once in styles.css (or is JS-only)", () => {
    const ctx = loadSharedExtensionScripts();
    const used = extractUhClasses(css);
    const structural = new Set(["uh-extension-disabled", "uh-mobile", "uh-embed"]);
    /** Applied on <html> for parity; autoplay is enforced in content script, not CSS */
    const jsOnlyClasses = new Set(["uh-disable-autoplay"]);
    for (const cls of Object.values(ctx.UNHOOKED_KEY_TO_CLASS)) {
      if (jsOnlyClasses.has(cls)) continue;
      if (!used.has(cls)) {
        throw new Error(`Class ${cls} never referenced in styles.css`);
      }
    }
    for (const s of structural) {
      expect(used.has(s), `structural class ${s} should appear in CSS`).toBe(true);
    }
  });

  it("styles.css does not reference unknown uh- tokens beyond mapping + structural", () => {
    const ctx = loadSharedExtensionScripts();
    const mapped = new Set(Object.values(ctx.UNHOOKED_KEY_TO_CLASS));
    const structural = new Set(["uh-extension-disabled", "uh-mobile", "uh-embed"]);
    const jsOnlyClasses = new Set(["uh-disable-autoplay"]);
    const allowed = new Set([...mapped, ...structural, ...jsOnlyClasses]);
    const used = extractUhClasses(css);
    for (const cls of used) {
      expect(allowed.has(cls), `orphan or stale class in CSS: ${cls}`).toBe(true);
    }
  });
});
