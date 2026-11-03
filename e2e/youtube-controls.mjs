// YouTube hide controls against stubbed pages: legacy settings, autoplay, self-healing, embeds.
import { createChecker, launch, sleep, stub } from "./lib.mjs";
import { fixturePage } from "./social-fixtures.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const HOME = fixturePage(
  `<ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer><article id="feed">Home video recommendations</article></ytd-rich-grid-renderer></div></ytd-browse>` +
    `<button class="ytp-autonav-toggle-button" aria-checked="true" onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')">Autoplay</button>`,
);
const visible = (page, selector) =>
  page.evaluate((s) => document.querySelector(s)?.checkVisibility() ?? null, selector);
async function until(name, probe) {
  const end = Date.now() + 5000;
  let ok = false;
  while (Date.now() < end && !(ok = await probe().catch(() => false))) await sleep(50);
  check(name, ok);
}

await ext.set({ unhookedOptions: { hideHomeFeed: true, disableAutoplay: true } });
const page = await newPage();
await stub(page, [["https://www.youtube.com/", HOME]]);
await page.goto("https://www.youtube.com/", { waitUntil: "load" });
await until(
  "saved upstream settings still hide recommendations",
  async () => !(await visible(page, "#feed")),
);
const autoplay = () =>
  page.evaluate(() =>
    document.querySelector(".ytp-autonav-toggle-button").getAttribute("aria-checked"),
  );
await until(
  "disable autoplay switches the player control off",
  async () => (await autoplay()) === "false",
);

await page.evaluate(() => (document.documentElement.className = ""));
await until("page-cleared classes are restored", async () => !(await visible(page, "#feed")));

await ext.set({ "unhooked.site.youtube.hideHomeFeed": false, "unhooked.paused": true });
await until("global pause restores the page", async () => await visible(page, "#feed"));
await page.evaluate(() =>
  document.querySelector(".ytp-autonav-toggle-button").setAttribute("aria-checked", "true"),
);
await sleep(1100);
check("paused extension stops changing autoplay", (await autoplay()) === "true");
await ext.set({ "unhooked.paused": false });
await sleep(500);
check("explicit false overrides the legacy true", await visible(page, "#feed"));
await page.close();

// Embedded players on unrelated sites get the controls, without touching the parent page.
await ext.set({ "unhooked.site.youtube.hideEndScreenCards": true });
const embed = await newPage();
await stub(embed, [
  [
    "https://example.org/",
    fixturePage(
      '<iframe title="Embedded YouTube" src="https://www.youtube-nocookie.com/embed/x"></iframe>',
    ),
  ],
  [
    "https://www.youtube-nocookie.com/",
    fixturePage('<div class="ytp-ce-element" id="end-card">End-screen recommendation</div>'),
  ],
]);
await embed.goto("https://example.org/", { waitUntil: "load" });
const frame = () => embed.frames().find((f) => f.url().includes("youtube-nocookie"));
const cardVisible = () =>
  frame()?.evaluate(() => document.querySelector("#end-card")?.checkVisibility()) ??
  Promise.resolve(null);
await until("embedded end-screen cards are hidden", async () => (await cardVisible()) === false);
await ext.set({ "unhooked.paused": true });
await until("pause restores embedded cards", async () => (await cardVisible()) === true);
await ext.set({ "unhooked.paused": false });
check(
  "the parent page is untouched",
  (await embed.evaluate(() => document.documentElement.getAttribute("class"))) === null,
);

// The video takes the width of an empty side column, and never hides one that's in use.
const WATCH = (attrs = "") =>
  fixturePage(`<ytd-app is-watch-page><ytd-watch-flexy ${attrs}><div id="columns"><div id="primary"><div id="player">video</div><div id="below">below</div></div>
    <div id="secondary"><div id="related">recommended</div></div></div></ytd-watch-flexy></ytd-app>`);
const watch = await newPage();
let watchHtml = WATCH();
await watch.setRequestInterception(true);
watch.on("request", (request) => {
  const hit = request.url().startsWith("https://www.youtube.com/watch");
  void (
    hit
      ? request.respond({ status: 200, contentType: "text/html", body: watchHtml })
      : request.continue()
  ).catch(() => {});
});
await ext.set({
  unhookedOptions: {},
  "unhooked.site.youtube.hideRelatedSidebar": true,
  "unhooked.site.youtube.hidePlaylistSidebar": false,
  "unhooked.paused": false,
});
const openWatch = async (attrs) => {
  watchHtml = WATCH(attrs);
  await watch.goto("https://www.youtube.com/watch?v=abc", { waitUntil: "load" });
  await watch.bringToFront();
  await sleep(500);
  return visible(watch, "#secondary");
};
check("an empty side column goes", (await openWatch("")) === false);
check("a playlist keeps it", (await openWatch("playlist")) === true);
check("live chat keeps it", (await openWatch("should-stamp-chat")) === true);
check("expanded live chat keeps it", (await openWatch("live-chat-present-and-expanded")) === true);
check("an open panel keeps it", (await openWatch("panel-expanded")) === true);
check("theater mode isn't touched", (await openWatch("theater")) === true);
await ext.set({ "unhooked.site.youtube.hidePlaylistSidebar": true });
check(
  "a playlist that's hidden doesn't keep it",
  (await openWatch("playlist playlist-panel-expanded panel-expanded")) === false,
);
check("but another open panel still does", (await openWatch("playlist panel-expanded")) === true);
await ext.set({
  "unhooked.site.youtube.hideRelatedSidebar": false,
  "unhooked.site.youtube.hidePlaylistSidebar": false,
});
check("with recommendations showing, it stays", (await openWatch("")) === true);

await close();
finish();
