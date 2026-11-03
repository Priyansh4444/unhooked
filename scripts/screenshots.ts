// CHROME_PATH=… bun scripts/screenshots.ts [popup|transfer|picker|wand|youtube]
// Regenerates the README's images in docs/screenshots from the real extension. Nothing here is
// signed in, so no account's feed ends up in the repository; `wand` and `youtube` use public pages.
// film.png isn't made here: X shows posts only when signed in, so it is a public account's post,
// framed by hand with film mode.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { Page, Viewport } from "puppeteer-core";
import { join } from "node:path";
import { buildExtension } from "../build.ts";
import { launch, sleep, stub } from "../e2e/lib.mjs";
import { presetPatch } from "../src/shared/preferences.ts";

const OUT = "docs/screenshots";
const only = process.argv.slice(2);
const wanted = (name: string) => !only.length || only.includes(name);

await buildExtension({ target: "chrome", outdir: "dist-e2e-chrome", minify: false, e2e: true });
// The wand demo's page, allowed up front as if the user had said yes to the browser's prompt.
const manifestPath = "dist-e2e-chrome/manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.host_permissions.push("*://news.ycombinator.com/*");
await writeFile(manifestPath, JSON.stringify(manifest));
await mkdir(OUT, { recursive: true });
const { browser, newPage: openPage, ext, close } = await launch();
const newPage = openPage as (viewport?: Viewport) => Promise<Page>;
const worker = await browser.waitForTarget((t) => t.type() === "service_worker");
const base = `chrome-extension://${new URL(worker.url()).host}/ui`;
const shot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });

await ext.set({
  "unhooked.site.x.hideHomeFeed": true,
  "unhooked.site.x.hideExplore": true,
  "unhooked.site.x.hideRecommendations": true,
  "unhooked.custom.x": [
    { selector: '[data-testid="premium"]', label: "Premium upsell", at: 1 },
    { selector: '[aria-label="Grok"]', label: "Grok button", at: 2 },
    { selector: "aside.promo", label: "Promoted accounts", at: 3 },
  ],
});

if (wanted("popup")) {
  const site = await newPage();
  await stub(site, [["https://x.com/", "<!doctype html><title>X</title><main>Home</main>"]]);
  await site.goto("https://x.com/home");
  const tabId = await ext.tabId("x.com");
  const popup = await newPage({ width: 400, height: 600, deviceScaleFactor: 2 });
  await popup.goto(`${base}/popup/index.html?tab=${tabId}`, { waitUntil: "load" });
  await popup.waitForFunction(() => !document.querySelector<HTMLElement>("#customSection")?.hidden);
  await popup.bringToFront();
  await sleep(300);
  await shot(popup, "popup");
  await popup.close();
  await site.close();
}

if (wanted("transfer")) {
  const page = await newPage({ width: 1000, height: 640, deviceScaleFactor: 2 });
  await page.goto(`${base}/transfer/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() =>
    document.querySelector("#mine")?.textContent?.includes("control"),
  );
  await page.bringToFront();
  await shot(page, "transfer");
  await page.close();
}

if (wanted("picker")) {
  await ext.set({ "unhooked.site.youtube.hideRelatedSidebar": true });
  const page = await newPage({ width: 1320, height: 900, deviceScaleFactor: 2 });
  await page.goto(`${base}/picker/index.html#youtube`, { waitUntil: "load" });
  await page.waitForSelector("#canvas button");
  await page.bringToFront();
  await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#views [role=tab]")]
      .find((tab) => tab.textContent?.toLowerCase().includes("watch"))
      ?.click(),
  );
  await sleep(500);
  await page.hover("#canvas button:not([aria-pressed=true])");
  await sleep(500);
  await shot(page, "picker");
  await page.close();
  await ext.set({ "unhooked.site.youtube.hideRelatedSidebar": false });
}

if (wanted("youtube")) {
  const page = await newPage({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw", { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForSelector("ytd-watch-flexy", { timeout: 30_000 });
  await sleep(6000);
  await page.evaluate(() => document.querySelector("video")?.pause());
  // What YouTube recommends differs per run and isn't ours to publish, so that column is blurred.
  await page.addStyleTag({ content: "#secondary { filter: blur(9px); }" });
  await sleep(300);
  await shot(page, "youtube-before");
  await ext.set(presetPatch("youtube", "balanced"));
  await sleep(800);
  await shot(page, "youtube-after");
  await ext.set(presetPatch("youtube", "clear"));
  await page.close();
}

if (wanted("wand")) {
  const page = await newPage({ width: 1000, height: 620, deviceScaleFactor: 1 });
  await page.goto("https://news.ycombinator.com/", { waitUntil: "load" });
  await page.bringToFront();
  await ext.inject("news.ycombinator.com", "sites/custom/content.js");
  // Headless browsers draw no pointer, so the demo draws one that clicks pass through.
  await page.evaluate(() => {
    const pointer = document.createElement("div");
    pointer.id = "demo-pointer";
    pointer.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:18px;height:22px";
    pointer.innerHTML = `<svg viewBox="0 0 18 22" width="18" height="22"><path d="M2 1l13 12.5H8.6L5 20z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    document.documentElement.append(pointer);
  });
  let at = { x: 40, y: 120 };
  const glide = async (x: number, y: number, ms = 600) => {
    const steps = Math.round(ms / 24);
    const from = at;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = 1 - (1 - t) ** 3;
      at = { x: from.x + (x - from.x) * eased, y: from.y + (y - from.y) * eased };
      await page.mouse.move(at.x, at.y);
      await page.evaluate(({ x, y }) => {
        document.getElementById("demo-pointer")!.style.transform = `translate(${x}px,${y}px)`;
      }, at);
      await sleep(16);
    }
  };
  const centerOf = (selector: string, index = 0) =>
    page.$$eval(
      selector,
      (els, index) => {
        const r = els[index]!.getBoundingClientRect();
        return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2 };
      },
      index,
    );

  const widenToRows = async () => {
    const selector = () =>
      page.$eval("unhooked-overlay[data-wand]", (el) => (el as HTMLElement).dataset.selector ?? "");
    for (let i = 0; i < 5 && !/tr[^ >]*$/.test(await selector()); i++) {
      await page.keyboard.press("ArrowUp");
      await sleep(450);
    }
    await sleep(300);
  };

  const recording = await page.screencast({ path: join(OUT, "wand-raw.webm") as `${string}.webm` });
  // Rest on a headline first, so the wand's first box is a story rather than the whole page.
  const start = await centerOf(".titleline > a", 8);
  await glide(start.x, start.y, 48);
  await sleep(500);
  await ext.inject("news.ycombinator.com", "sites/wand/content.js");
  await page.mouse.move(at.x + 1, at.y);
  await sleep(900);
  // Over a few headlines, then widen to the whole story row and take them all.
  for (const index of [6, 3, 1]) {
    const point = await centerOf(".titleline > a", index);
    await glide(point.x, point.y);
    await sleep(350);
  }
  await widenToRows();
  await page.mouse.down();
  await page.mouse.up();
  await sleep(1100);
  // The lines of points and comments under them go the same way.
  const points = await centerOf(".subtext", 1);
  await glide(points.x, points.y);
  await sleep(500);
  await widenToRows();
  await page.mouse.down();
  await page.mouse.up();
  await sleep(1600);
  await recording.stop();
  await page.close();
  const palette =
    "fps=12,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle";
  const ffmpeg = Bun.spawn(
    [
      "ffmpeg",
      "-y",
      "-loglevel",
      "error",
      "-i",
      join(OUT, "wand-raw.webm"),
      "-filter_complex",
      palette,
      join(OUT, "wand.gif"),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  await ffmpeg.exited;
  await rm(join(OUT, "wand-raw.webm"));
}

await close();
