// Hide controls on X, Reddit, Instagram, TikTok, Facebook, LinkedIn and Threads, against stubbed
// pages with each site's real markers. Storage writes go through the bridge, like the popup's.
import { featurePatch, presetPatch } from "../src/shared/preferences.ts";
import { createChecker, launch, sleep, stub } from "./lib.mjs";
import { discoveryFixtures, fixturePage, fixtures } from "./social-fixtures.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

/** Poll until `selector`'s visibility matches `expected` (5s), then report. */
async function visible(page, selector, expected, name) {
  const until = Date.now() + 5000;
  let actual;
  while (Date.now() < until) {
    actual = await page
      .evaluate((s) => document.querySelector(s)?.checkVisibility() ?? null, selector)
      .catch(() => null);
    if (actual === expected) break;
    await sleep(50);
  }
  check(name, actual === expected, `${selector} visible=${actual}`);
}

const open = async (url, html) => {
  const page = await newPage();
  await stub(page, [[new URL(url).origin + "/", fixturePage(html)]]);
  await page.goto(url, { waitUntil: "load" });
  return page;
};
const pushState = (page, path) => page.evaluate((p) => history.pushState({}, "", p), path);
const reset = (id) =>
  ext.set({
    ...presetPatch(id, "clear"),
    "unhooked.paused": false,
    [`unhooked.site.${id}.enabled`]: true,
  });

for (const f of fixtures) {
  console.log(`== ${f.id}`);
  await reset(f.id);
  const page = await open(f.url, f.html);
  await visible(page, "#feed", true, `${f.id}: starts visible`);
  await ext.set(featurePatch(f.id, "hideHomeFeed", true));
  await visible(page, "#feed", false, `${f.id}: preference hides the home feed`);
  await visible(page, "#navigation", true, `${f.id}: navigation stays`);
  await visible(page, "#unrelated", true, `${f.id}: unrelated content stays`);

  await page.evaluate(() => {
    const clone = document.querySelector("#feed").cloneNode(true);
    clone.id = "late-post";
    document.querySelector("#feed").after(clone);
  });
  await visible(page, "#late-post", false, `${f.id}: late-rendered posts are hidden by CSS`);

  const mutations = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const observer = new MutationObserver((list) => (n += list.length));
        observer.observe(document.documentElement, { attributes: true, childList: true });
        setTimeout(() => (observer.disconnect(), resolve(n)), 600);
      }),
  );
  check(`${f.id}: settled page has no mutation loop`, mutations === 0, `${mutations} mutations`);

  // Site frameworks may reset <html> classes or drop unknown nodes during hydration.
  await page.evaluate(() => {
    document.documentElement.className = "";
    document.getElementById("unhooked-social-rules").remove();
  });
  await visible(page, "#feed", false, `${f.id}: page-cleared state is restored`);

  const second = await open(f.url, f.html);
  await visible(second, "#feed", false, `${f.id}: a second tab applies the same choice`);
  await ext.set({ "unhooked.paused": true });
  await visible(page, "#feed", true, `${f.id}: pause reaches the first tab`);
  await visible(second, "#feed", true, `${f.id}: pause reaches the second tab`);
  await ext.set({ "unhooked.paused": false });
  await visible(page, "#feed", false, `${f.id}: resume reaches the first tab`);
  await visible(second, "#feed", false, `${f.id}: resume reaches the second tab`);
  await second.close();

  await ext.set({ [`unhooked.site.${f.id}.enabled`]: false });
  await visible(page, "#feed", true, `${f.id}: turning the site off restores the page`);
  await ext.set({ [`unhooked.site.${f.id}.enabled`]: true });
  await visible(page, "#feed", false, `${f.id}: turning it back on reapplies`);

  await ext.set(presetPatch(f.id, "focused"));
  for (const route of [f.profile, f.detail, f.search, f.messages, "/unrecognized/route"]) {
    await pushState(page, route);
    await visible(page, "#feed", true, `${f.id}: ${route} stays visible`);
  }
  await pushState(page, new URL(f.url).pathname);
  await visible(page, "#feed", false, `${f.id}: SPA return to home hides again`);

  if (f.sidebarAnywhere) {
    await ext.set({
      ...presetPatch(f.id, "clear"),
      ...featurePatch(f.id, f.sidebarAnywhere, true),
    });
    await pushState(page, "/unrecognized/route");
    await visible(page, "#suggestions", false, `${f.id}: sidebar hides on unknown routes`);
    await visible(page, "#feed", true, `${f.id}: unknown routes keep primary content`);
    await pushState(page, new URL(f.url).pathname);
  }
  for (const [feature, targets] of Object.entries(f.features)) {
    await ext.set({ ...presetPatch(f.id, "clear"), ...featurePatch(f.id, feature, true) });
    for (const target of targets)
      await visible(page, `#${target}`, false, `${f.id}: ${feature} hides #${target}`);
    await visible(page, "#feed", true, `${f.id}: ${feature} leaves the feed alone`);
    await ext.set(featurePatch(f.id, feature, false));
    for (const target of targets)
      await visible(page, `#${target}`, true, `${f.id}: ${feature} restores #${target}`);
  }
  await page.close();
}

for (const f of discoveryFixtures) {
  console.log(`== ${f.id} ${f.path}`);
  await reset(f.id);
  const page = await open(f.origin + f.path, f.html);
  await visible(page, "#discovery", true, `${f.id} ${f.path}: starts visible`);
  await ext.set(featurePatch(f.id, f.feature, true));
  await visible(page, "#discovery", false, `${f.id} ${f.path}: ${f.feature} hides it`);
  await visible(page, "#navigation", true, `${f.id} ${f.path}: navigation stays`);
  await ext.set({ "unhooked.paused": true });
  await visible(page, "#discovery", true, `${f.id} ${f.path}: pause restores it`);
  await ext.set({ "unhooked.paused": false });
  await pushState(page, "/profile/direct/unknown");
  await visible(page, "#discovery", true, `${f.id} ${f.path}: unknown routes stay visible`);
  await page.close();
}

const unrelated = await open("https://evilx.com/home", fixtures[0].html);
await sleep(500);
check(
  "unsupported hosts get no controller",
  (await unrelated.evaluate(() => document.documentElement.dataset.uhSite)) === undefined,
);
await unrelated.close();

await close();
finish();
