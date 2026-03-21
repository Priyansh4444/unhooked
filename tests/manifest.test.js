import { readFileSync } from "node:fs";
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
    expect(typeof manifest.version).toBe("string");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("declares content scripts and popup assets", () => {
    expect(Array.isArray(manifest.content_scripts)).toBe(true);
    expect(manifest.content_scripts.length).toBeGreaterThan(0);
    const cs = manifest.content_scripts[0];
    expect(cs.js).toContain("shared/options.js");
    expect(cs.js).toContain("content/content.js");
    expect(cs.css).toContain("content/styles.css");
    expect(manifest.action?.default_popup).toBe("popup/popup.html");
  });

  it("lists required permissions", () => {
    expect(manifest.permissions).toContain("storage");
    expect(Array.isArray(manifest.host_permissions)).toBe(true);
    expect(manifest.host_permissions.length).toBeGreaterThan(0);
  });
});
