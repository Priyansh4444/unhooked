// bun e2e/run.mjs [chrome|firefox] [test names...]   (or BROWSER=firefox bun e2e/run.mjs)
// Builds the e2e extension for the browser, then runs each test file in its own process.
// MINIFY=1 tests the minified bundle (what ships).
import { buildExtension } from "../build.ts";

const [first, ...rest] = process.argv.slice(2);
const browser =
  first === "firefox" || first === "chrome" ? first : (process.env.BROWSER ?? "chrome");
const only = first === "firefox" || first === "chrome" ? rest : process.argv.slice(2);

const ALL = [
  "smoke",
  "social",
  "youtube-controls",
  "popup",
  "picker",
  "twitter",
  "twitch",
  "twitch-cards",
  "excalidraw",
  "youtube",
  "youtube-keys",
  "youtube-global",
];
const tests = only.length ? only : ALL;

await buildExtension({
  target: browser,
  outdir: `dist-e2e-${browser}`,
  minify: process.env.MINIFY === "1",
  e2e: true,
});

const failed = [];
for (const test of tests) {
  console.log(`\n=== ${browser}: ${test}`);
  const run = Bun.spawn(["bun", `e2e/${test}.mjs`], {
    env: { ...process.env, BROWSER: browser },
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await run.exited) !== 0) failed.push(test);
}

console.log(
  failed.length ? `\n${browser}: FAILED ${failed.join(", ")}` : `\n${browser}: all suites passed`,
);
process.exit(failed.length ? 1 : 0);
