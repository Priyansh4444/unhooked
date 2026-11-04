// CHROME_PATH=… bun scripts/perf.ts [runs]
// What Unhooked costs a page: the production build against no extension, with every control on.
// Prints the median of each measure. docs/PERFORMANCE.md records the results and what they mean.
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildExtension } from "../build.ts";
import { CONTROL_SITES } from "../src/sites/registry.ts";

const RUNS = Number(process.argv[2] ?? 5);
const CHURN_MS = 8000;
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

const POST = (
  i: number,
) => `<div data-testid="cellInnerDiv"><article data-testid="tweet"><div data-testid="User-Name">Someone ${i}</div>
  <div data-testid="tweetText" lang="en">A post with some words in it, number ${i}, to give the page something to lay out.</div>
  <div role="group"><div><button data-testid="reply">r</button></div><div><button data-testid="retweet">t</button></div><div><button data-testid="like">l</button></div><div><button data-testid="bookmark">b</button></div></div></article></div>`;
const TIMELINE = `<!doctype html><html><body><div id="react-root" style="display:flex"><header role="banner"><a href="/i/grok">Grok</a><a href="/i/chat">Chat</a></header>
  <main role="main"><div><div><div data-testid="primaryColumn"><section aria-label="Timeline: Home" id="feed">${Array.from({ length: 80 }, (_, i) => POST(i)).join("")}</section></div>
  <div data-testid="sidebarColumn"><div><div><div><div><div><div>Search</div><div>Trends</div></div></div></div></div></div></div></div></main></div></body></html>`;

/** What a busy timeline does: posts arrive and old ones leave, about 20 a second. */
const churn = (page: Page) =>
  page.evaluate(
    (ms, post) =>
      new Promise<void>((done) => {
        const feed = document.querySelector("#feed")!;
        const started = performance.now();
        let i = 1000;
        const timer = setInterval(() => {
          feed.insertAdjacentHTML("beforeend", post.replaceAll("NUMBER", String(i++)));
          feed.firstElementChild?.remove();
          if (performance.now() - started > ms) {
            clearInterval(timer);
            done();
          }
        }, 50);
      }),
    CHURN_MS,
    POST(0).replaceAll("Someone 0", "Someone NUMBER"),
  );

async function measure(browser: Browser, url: string, stubHtml: string | null, busy: boolean) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  if (stubHtml) {
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const hit = request.url() === url;
      void (
        hit
          ? request.respond({ status: 200, contentType: "text/html", body: stubHtml })
          : request.continue()
      ).catch(() => {});
    });
  }
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  await page.bringToFront();
  await sleep(stubHtml ? 1500 : 6000);
  const atLoad = await page.metrics();
  if (busy) await churn(page);
  const after = await page.metrics();
  await page.close();
  return {
    scriptLoadMs: (atLoad.ScriptDuration ?? 0) * 1000,
    styleLoadMs: (atLoad.RecalcStyleDuration ?? 0) * 1000,
    scriptBusyMs: ((after.ScriptDuration ?? 0) - (atLoad.ScriptDuration ?? 0)) * 1000,
    styleBusyMs: ((after.RecalcStyleDuration ?? 0) - (atLoad.RecalcStyleDuration ?? 0)) * 1000,
    layoutBusyMs: ((after.LayoutDuration ?? 0) - (atLoad.LayoutDuration ?? 0)) * 1000,
    heapMb: (after.JSHeapUsedSize ?? 0) / 1_048_576,
  };
}

type Sample = Awaited<ReturnType<typeof measure>>;
const medians = (samples: Sample[]) =>
  Object.fromEntries(
    (Object.keys(samples[0]!) as (keyof Sample)[]).map((key) => [
      key,
      Math.round(median(samples.map((sample) => sample[key])) * 10) / 10,
    ]),
  );

const launch = (extension: string | null) =>
  puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    pipe: true,
    args: ["--disable-gpu"],
    ...(extension && { enableExtensions: [extension] }),
    defaultViewport: null,
  });

const scenes: [string, string, string | null, boolean][] = [
  ["busy X-like timeline", "https://x.com/home", TIMELINE, true],
  ["unrelated site", "https://example.org/", "<!doctype html><title>x</title><p>hello</p>", false],
  ["YouTube watch page (live)", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", null, false],
];

const outdir = resolve("dist-perf");
await buildExtension({ target: "chrome", outdir, minify: true });

const plain = await launch(null);
const withExt = await launch(outdir);
const worker = await withExt.waitForTarget((t) => t.type() === "service_worker");
const sw = (await worker.worker())!;
const everything = Object.fromEntries(
  CONTROL_SITES.flatMap((site) =>
    site.features.map((f) => [`unhooked.site.${site.id}.${f.id}`, true] as const),
  ),
);
await sw.evaluate((values) => chrome.storage.local.set(values), everything);
await sleep(500);

for (const [name, url, html, busy] of scenes) {
  const runs = html ? RUNS : Math.min(RUNS, 3);
  const off: Sample[] = [];
  const on: Sample[] = [];
  for (let i = 0; i < runs; i++) {
    off.push(await measure(plain, url, html, busy));
    on.push(await measure(withExt, url, html, busy));
  }
  console.log(`\n${name}`);
  console.log("  without", JSON.stringify(medians(off)));
  console.log("  with   ", JSON.stringify(medians(on)));
}

// The background, which only runs for moments at a time.
const session = await worker.createCDPSession();
await session.send("Runtime.enable");
const heap = await session.send("Runtime.getHeapUsage");
const stepMs = await sw.evaluate(async () => {
  const started = performance.now();
  for (let i = 0; i < 20; i++) await chrome.runtime.getPlatformInfo();
  return (performance.now() - started) / 20;
});
const sizes: Record<string, number> = {};
for (const dir of [
  "sites/x",
  "sites/social",
  "sites/custom",
  "sites/youtube",
  "sites/excalidraw",
  "sites/twitch",
]) {
  const files = (await readdir(join(outdir, dir))).filter((file) => file.endsWith(".js"));
  sizes[dir] = (await Promise.all(files.map((file) => stat(join(outdir, dir, file))))).reduce(
    (sum, s) => sum + s.size,
    0,
  );
}
console.log(
  "\nbackground heap MB",
  (heap.usedSize / 1_048_576).toFixed(2),
  "api round trip ms",
  stepMs.toFixed(2),
);
console.log("content script bytes", JSON.stringify(sizes));
await plain.close();
await withExt.close();
process.exit(0);
