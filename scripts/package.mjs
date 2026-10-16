import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist", "unhooked");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const files = ["manifest.json", "LICENSE", "README.md"];

async function collect(directory) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) await collect(relative);
    else files.push(relative);
  }
}

for (const directory of ["content", "shared", "popup"]) await collect(directory);
try {
  await collect("icons");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const referenced = [
  manifest.action.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((script) => [
    ...(script.js || []),
    ...(script.css || [])
  ])
];
for (const relative of referenced) {
  if (!files.includes(relative)) throw new Error(`Missing packaged manifest asset: ${relative}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const archive = {};
for (const relative of files.sort()) {
  const target = path.join(output, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, relative), target);
  // ZIP stores local calendar fields; UTC midnight could fall in the previous year locally.
  archive[relative] = [new Uint8Array(await readFile(target)), { mtime: new Date(2000, 0, 1) }];
}
const zipPath = path.join(root, "dist", `unhooked-${manifest.version}.zip`);
await writeFile(zipPath, zipSync(archive, { level: 9 }));
console.log(`Verified ${referenced.length} manifest references; packaged ${files.length} files.`);
console.log(`Load unpacked: ${output}`);
console.log(`ZIP: ${zipPath}`);
