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
check("the embed sets no focus badge", (await ext.badge("example.org")) === "");

await close();
finish();
