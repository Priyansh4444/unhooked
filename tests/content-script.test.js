import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("content/content.js wiring", () => {
  const src = readFileSync(join(rootDir, "content/content.js"), "utf8");

  it("delegates class application to unhookedApplyOptionClasses", () => {
    expect(src).toContain("unhookedApplyOptionClasses");
    expect(src).not.toContain("UNHOOKED_KEY_TO_CLASS");
  });

  it("uses mergeUnhookedOptions and UNHOOKED_STORAGE_KEY from shared/options.js", () => {
    expect(src).toContain("mergeUnhookedOptions");
    expect(src).toContain("UNHOOKED_STORAGE_KEY");
  });

  it("listens for chrome.storage.onChanged and yt-navigate-finish", () => {
    expect(src).toContain("chrome.storage.onChanged");
    expect(src).toContain("yt-navigate-finish");
  });

  it("schedules autoplay off only when extension is active", () => {
    expect(src).toContain("disableAutoplay");
    expect(src).toContain("extensionDisabled");
  });
});
