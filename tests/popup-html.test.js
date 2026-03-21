import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadOptionsModule } from "./helpers/load-options.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("popup/popup.html", () => {
  const html = readFileSync(join(rootDir, "popup/popup.html"), "utf8");
  const { UNHOOKED_OPTION_KEYS } = loadOptionsModule();

  it.each(UNHOOKED_OPTION_KEYS)("has checkbox id=%s", (key) => {
    const re = new RegExp(`id="${key}"`, "m");
    expect(html).toMatch(re);
  });

  it("declares bulk group controls", () => {
    expect(html).toMatch(/id="bulkVideoSidebar"/);
    expect(html).toMatch(/id="bulkVideoInfo"/);
    expect(html).toMatch(/id="bulkTopHeader"/);
  });

  it("loads shared/options.js before popup.js", () => {
    const iOpt = html.indexOf("shared/options.js");
    const iPop = html.indexOf("popup.js");
    expect(iOpt).toBeGreaterThan(-1);
    expect(iPop).toBeGreaterThan(iOpt);
  });
});
