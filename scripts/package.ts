// bun scripts/package.ts [chrome|firefox|safari|all]   (default: all)
// Production builds plus reproducible ZIPs: sorted entries and fixed timestamps.
import { zipSync } from "fflate";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { buildExtension } from "../build.ts";
import type { Target } from "../build/manifest.ts";
import pkg from "../package.json" with { type: "json" };

const arg = process.argv[2] ?? "all";
const targets: Target[] = arg === "all" ? ["chrome", "firefox", "safari"] : [arg as Target];

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

for (const target of targets) {
  const outdir = target === "chrome" ? "dist/chrome" : `dist/${target}`;
  await buildExtension({ target, outdir, minify: true });
  const archive: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const file of await files(outdir)) {
    // ZIP stores local calendar fields; UTC midnight could fall in the previous year locally.
    archive[relative(outdir, file)] = [await readFile(file), { mtime: new Date(2000, 0, 1) }];
  }
  const zip = `dist/unhooked-${target}-${pkg.version}.zip`;
  await writeFile(zip, zipSync(archive, { level: 9 }));
  console.log(`✓ ${zip} (${Object.keys(archive).length} files)`);
}
