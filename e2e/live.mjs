// Checks every hide control on the real sites (Chrome). Not part of the normal run: it needs the
// network, and for X, Instagram, Facebook, LinkedIn and signed-in pages, a logged-in profile.
//
//   CHROME_PATH=… bun scripts/live-login.ts                       # once: log in, close the browser
//   CHROME_PATH=… LIVE_PROFILE=~/.cache/unhooked-live-profile bun e2e/live.mjs [site…]
//
// For each page it counts what each control's selectors match, turns the control on, and checks
// those elements are gone. "no match" means the part isn't on that page right now, or the site
// changed its markup (check the screenshot); "STILL VISIBLE" means hiding is broken.
// Screenshots and report.json land in e2e/shots/live/.
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildExtension } from "../build.ts";
import { featurePatch } from "../src/shared/preferences.ts";
import { CONTROL_SITES } from "../src/sites/registry.ts";
import { OPTION_CLASSES } from "../src/sites/youtube/options.ts";
import { parseOptionSelectors, controlsCss } from "../src/sites/youtube/selectors.ts";

process.env.LIVE_PROFILE ??= join(homedir(), ".cache", "unhooked-live-profile");
process.env.EXT ??= "dist-e2e-chrome";
await buildExtension({ target: "chrome", outdir: process.env.EXT, minify: true, e2e: true });
const { launch, sleep } = await import("./lib.mjs");

const PAGES = {
  youtube: [
    "https://www.youtube.com/",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    "https://www.youtube.com/results?search_query=music",
  ],
  x: ["https://x.com/home", "https://x.com/explore"],
  reddit: ["https://www.reddit.com/", "https://www.reddit.com/r/popular/"],
  instagram: [
    "https://www.instagram.com/",
    "https://www.instagram.com/explore/",
    "https://www.instagram.com/reels/",
  ],
  tiktok: [
    "https://www.tiktok.com/foryou",
    "https://www.tiktok.com/explore",
    "https://www.tiktok.com/live",
  ],
  facebook: ["https://www.facebook.com/", "https://www.facebook.com/reel/"],
  linkedin: ["https://www.linkedin.com/feed/"],
  threads: ["https://www.threads.com/"],
};
const only = process.argv.slice(2);
const youtubeSelectors = parseOptionSelectors(controlsCss);
const out = join("e2e", "shots", "live");
await mkdir(out, { recursive: true });

/** Selectors each control applies on the page as it is now (route and <html> state). */
function selectorsOnPage(site, route, htmlClasses) {
  return Object.fromEntries(
    site.features.map((feature) => {
      if (site.id === "youtube") {
        const entries = youtubeSelectors.get(OPTION_CLASSES[feature.id]) ?? [];
        return [
          feature.id,
          entries
            .filter((e) => e.requires.every((c) => htmlClasses.includes(c)))
            .map((e) => e.selector),
        ];
      }
      return [
        feature.id,
        feature.rules
          .filter((rule) => rule.routes.includes("*") || rule.routes.includes(route))
          .flatMap((rule) => rule.selectors),
      ];
    }),
  );
}

const visibleCount = (page, selectors) =>
  page.evaluate(
    (selectors) =>
      selectors.reduce((sum, selector) => {
        try {
          return (
            sum +
            [...document.querySelectorAll(selector)].filter((el) => el.checkVisibility()).length
          );
        } catch {
          return sum;
        }
      }, 0),
    selectors,
  );

const { newPage, ext, close } = await launch();
const report = [];
for (const site of CONTROL_SITES) {
  if (only.length && !only.includes(site.id)) continue;
  for (const url of PAGES[site.id]) {
    const page = await newPage({ width: 1440, height: 1000 });
    await ext.set({ "unhooked.paused": false, [`unhooked.site.${site.id}.enabled`]: true });
    for (const feature of site.features) await ext.set(featurePatch(site.id, feature.id, false));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await sleep(9000);
    const name = `${site.id}-${new URL(url).pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}`;
    const state = await page.evaluate(() => ({
      url: location.href,
      route: document.documentElement.dataset.uhRoute ?? "",
      classes: [...document.documentElement.classList],
      title: document.title,
    }));
    const signedOut =
      /login|signin|accounts|flow/i.test(new URL(state.url).pathname) && state.url !== url;
    console.log(
      `\n== ${site.label}  ${url}${signedOut ? "  (redirected to sign-in; log in with scripts/live-login.ts)" : ""}`,
    );
    await page.screenshot({ path: join(out, `${name}-before.png`) });
    const selectors = selectorsOnPage(site, state.route, state.classes);
    for (const feature of site.features) {
      if (!selectors[feature.id].length) continue; // not a control for this route
      const before = await visibleCount(page, selectors[feature.id]);
      await ext.set(featurePatch(site.id, feature.id, true));
      await sleep(700);
      const after = await visibleCount(page, selectors[feature.id]);
      const result =
        before === 0
          ? "no match"
          : after === 0
            ? `hides ${before}`
            : `STILL VISIBLE ${after}/${before}`;
      console.log(`  ${result.padEnd(20)} ${feature.label}`);
      report.push({
        site: site.id,
        url,
        route: state.route,
        feature: feature.id,
        before,
        after,
        result,
        signedOut,
      });
    }
    await page.screenshot({ path: join(out, `${name}-after.png`) });
    for (const feature of site.features) await ext.set(featurePatch(site.id, feature.id, false));
    await page.close();
  }
}
await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
await close();
const broken = report.filter((r) => r.result.startsWith("STILL"));
console.log(
  `\n${report.filter((r) => r.result.startsWith("hides")).length} hiding, ${report.filter((r) => r.result === "no match").length} not on the page, ${broken.length} broken. Screenshots: ${out}`,
);
process.exit(broken.length ? 1 : 0);
