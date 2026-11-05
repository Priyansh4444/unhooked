// bun scripts/size.ts            the production build against what build/sizes.json recorded
// bun scripts/size.ts --update   records what it is now
//
// Fails when something has grown more than 10% past its record. The record only moves when someone
// updates it, so small changes add up towards that limit instead of each getting a free pass.
import { appendFile, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { packageTarget } from "./package.ts";

const RECORD = "build/sizes.json";
const PAGES = ["popup", "picker", "transfer", "time", "allow"];
const MOST_GROWTH = 0.1;
/** A tiny file growing by a few rules isn't worth stopping for. */
const MOST_GROWTH_BYTES = 512;

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
const tooBig = changes.filter(
  ({ was, now }) => now - was > Math.max(was * MOST_GROWTH, MOST_GROWTH_BYTES),
);
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const percent = (was: number, now: number) =>
  was ? `${signed(Math.round(((now - was) / was) * 100))}%` : "new";
const report = [
  `### Sizes against ${RECORD}`,
  "",
  `The Chrome package is ${(sizes["package: chrome"]! / 1024).toFixed(1)} KB.`,
  ...(changes.length
    ? [
        "",
        "| | Recorded | Now | Change | |",
        "| :-- | --: | --: | --: | --: |",
        ...changes.map(
          ({ name, was, now }) =>
            `| ${name} | ${was} | ${now} | ${signed(now - was)} | ${percent(was, now)} |`,
        ),
      ]
    : []),
  ...(tooBig.length
    ? [
        "",
        `Over the limit of ${MOST_GROWTH * 100}%: ${tooBig.map(({ name }) => name).join(", ")}.`,
        "Look at what's taking the room. If it's worth it, `bun run size:update` records the new size.",
      ]
    : []),
].join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exit(tooBig.length ? 1 : 0);
