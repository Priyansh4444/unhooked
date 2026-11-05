// bun scripts/size.ts            the production build against what build/sizes.json recorded
// bun scripts/size.ts --update   records what it is now
//
// Every file is held to the byte, either way: growing has to show up in a diff someone reads, and
// shrinking is recorded so the room it made can't be spent without anyone noticing.
import { appendFile, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { packageTarget } from "./package.ts";

const RECORD = "build/sizes.json";
const PAGES = ["popup", "picker", "transfer", "time", "allow"];

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

const bytes = async (files: string[]): Promise<number> =>
  (await Promise.all(files.map((file) => stat(file)))).reduce((sum, s) => sum + s.size, 0);

/** What each thing costs: chunk names change with their content, so a page is summed by name. */
async function measure(): Promise<Record<string, number>> {
  const work = await mkdtemp(join(tmpdir(), "unhooked-size-"));
  try {
    const sizes: Record<string, number> = {};
    const chrome = join(work, "chrome");
    const zip = await packageTarget("chrome", chrome, work);
    sizes["package: chrome"] = await bytes([zip]);
    const firefox = await packageTarget("firefox", join(work, "firefox"), work);
    sizes["package: firefox"] = await bytes([firefox]);

    const all = await filesIn(chrome);
    const counted = new Set<string>();
    const count = async (name: string, files: string[]) => {
      for (const file of files) counted.add(file);
      sizes[name] = await bytes(files);
    };
    for (const page of PAGES) {
      const html = join(chrome, "ui", page, "index.html");
      const parts = [...(await readFile(html, "utf8")).matchAll(/chunk-\w+\.(?:js|css)/g)].map(
        ([chunk]) => join(chrome, "ui", chunk),
      );
      await count(`page: ${page}`, [html, ...new Set(parts)]);
    }
    await count(
      "fonts",
      all.filter((file) => file.includes("/ui/fonts/")),
    );
    await count(
      "icons",
      all.filter((file) => file.endsWith(".png")),
    );
    for (const file of all.filter((each) => !counted.has(each)).sort())
      sizes[relative(chrome, file)] = await bytes([file]);
    return Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const sizes = await measure();
if (process.argv.includes("--update")) {
  await writeFile(RECORD, `${JSON.stringify(sizes, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(sizes).length} sizes in ${RECORD}`);
  process.exit(0);
}

const recorded: Record<string, number> = JSON.parse(await readFile(RECORD, "utf8"));
const changes = [...new Set([...Object.keys(recorded), ...Object.keys(sizes)])]
  .map((name) => ({ name, was: recorded[name] ?? 0, now: sizes[name] ?? 0 }))
  .filter(({ was, now }) => was !== now);
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const table = [
  "| | Recorded | Now | Change |",
  "| :-- | --: | --: | --: |",
  ...changes.map(
    ({ name, was, now }) => `| ${name} | ${was} | ${now} | ${signed(now - was)} bytes |`,
  ),
].join("\n");

const packaged = `${(sizes["package: chrome"]! / 1024).toFixed(1)} KB`;
if (!changes.length) {
  console.log(`Sizes match ${RECORD}. The Chrome package is ${packaged}.`);
  process.exit(0);
}

const total = changes.reduce((sum, { was, now }) => sum + now - was, 0);
const pinned = pkg.packageManager.replace("bun@", "");
const report = [
  `### Sizes differ from ${RECORD}`,
  "",
  table,
  "",
  "If this is meant, run `bun run size:update` and commit it, so the change shows up in review.",
  ...(Bun.version === pinned
    ? []
    : [`\nThese were recorded with Bun ${pinned}, and this is Bun ${Bun.version}.`]),
].join("\n");
console.error(report);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
console.error(`\n${signed(total)} bytes in all. The Chrome package is ${packaged}.`);
process.exit(1);
