import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("manifest.json", () => {
  const raw = readFileSync(join(root, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw);

  it("is valid manifest v3", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBeTruthy();
    expect(manifest.description.length).toBeLessThanOrEqual(132);
    expect(typeof manifest.version).toBe("string");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("declares content scripts and popup assets", () => {
    expect(Array.isArray(manifest.content_scripts)).toBe(true);
    expect(manifest.content_scripts.length).toBeGreaterThan(0);
    const cs = manifest.content_scripts[0];
    expect(cs.js).toEqual([
      "shared/options.js",
      "shared/sites.js",
      "shared/settings.js",
      "shared/mappings.js",
      "shared/apply-option-classes.js",
      "content/content.js"
    ]);
    expect(cs.css).toContain("content/styles.css");
    expect(manifest.action?.default_popup).toBe("popup/popup.html");
  });

  it("lists required permissions", () => {
    expect(manifest.permissions).toContain("storage");
    expect(Array.isArray(manifest.host_permissions)).toBe(true);
    expect(manifest.host_permissions.length).toBeGreaterThan(0);
  });

  it("host_permissions cover youtube desktop, mobile, and nocookie embeds", () => {
    const h = manifest.host_permissions.join(" ");
    expect(h).toContain("youtube.com");
    expect(h).toContain("m.youtube.com");
    expect(h).toContain("youtube-nocookie.com");
  });

  it("every referenced extension file exists on disk", () => {
    const paths = new Set();
    paths.add(manifest.action.default_popup);
    for (const cs of manifest.content_scripts) {
      for (const p of cs.js || []) paths.add(p);
      for (const p of cs.css || []) paths.add(p);
    }
    for (const p of Object.values(manifest.icons || {})) paths.add(p);
    for (const rel of paths) {
      const abs = join(root, rel);
      expect(existsSync(abs), `missing ${rel}`).toBe(true);
    }
  });

  it("content script matches align with host_permissions hosts", () => {
    const cs = manifest.content_scripts[0];
    const matches = cs.matches.join(" ");
    expect(matches).toContain("youtube.com");
    expect(matches).toContain("m.youtube.com");
    expect(matches).toContain("youtube-nocookie.com");
  });
});


describe("precise social permissions", () => {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  it("uses only storage and exact content script hosts", () => {
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.background).toBeUndefined();
    const matches = manifest.content_scripts.flatMap((entry) => entry.matches);
    expect([...matches].sort()).toEqual([...manifest.host_permissions].sort());
    for (const match of matches) expect(match).toMatch(/^\*:\/\/[a-z0-9.-]+\/\*$/);
  });
});
