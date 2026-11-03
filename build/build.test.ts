import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExtension } from "../build.ts";
import { BUNDLES } from "./manifest.ts";

describe("production build", () => {
  it("wraps every content script in its own scope", async () => {
    // Scripts injected into one page share an isolated world; on x.com two of ours do. Minified
    // top-level names would overwrite each other without a wrapper.
    const outdir = await mkdtemp(join(tmpdir(), "unhooked-build-"));
    try {
      await buildExtension({ target: "chrome", outdir, minify: true });
      for (const bundle of Object.keys(BUNDLES)) {
        const code = await readFile(join(outdir, "sites", bundle, "content.js"), "utf8");
        expect(code.startsWith("(()=>{")).toBe(true);
      }
      const manifest = JSON.parse(await readFile(join(outdir, "manifest.json"), "utf8"));
      for (const script of manifest.content_scripts)
        for (const file of [...script.js, ...(script.css ?? [])])
          expect(await Bun.file(join(outdir, file)).exists()).toBe(true);
    } finally {
      await rm(outdir, { recursive: true, force: true });
    }
  });
});
