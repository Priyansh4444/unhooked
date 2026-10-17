// The picker: click parts of a site sketch to hide them. Chrome only, because Firefox will not
// let automation open extension pages.
import { BROWSER, createChecker, launch, sleep, stub } from "./lib.mjs";
import { fixturePage } from "./social-fixtures.mjs";

if (BROWSER !== "chrome") {
  console.log("SKIP  picker suite runs on Chrome only");
  process.exit(0);
}

const { browser, newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const worker = await browser.waitForTarget((t) => t.type() === "service_worker");
const base = `chrome-extension://${new URL(worker.url()).host}/ui/picker/index.html`;
const part = (feature) => `.canvas [data-feature="${feature}"]`;
const pressed = (page, feature) =>
  page.$eval(part(feature), (el) => el.getAttribute("aria-pressed"));
const stored = async (key) => (await ext.get(key))[key];
async function until(name, probe) {
  const end = Date.now() + 5000;
  let ok = false;
  while (Date.now() < end && !(ok = await probe().catch(() => false))) await sleep(50);
  check(name, ok);
}

const picker = await newPage({ width: 1280, height: 900 });
await picker.goto(`${base}#youtube`, { waitUntil: "load" });
await picker.waitForSelector(part("hideHomeFeed"));
check(
  "opens on the site named in the address",
  (await picker.$eval("#siteTitle", (el) => el.textContent)) === "YouTube",
);
check(
  "the hand-written note greets a first visit",
  await picker.$eval("#handNote", (el) => el.classList.contains("is-shown")),
);
check(
  "parts Unhooked always keeps are not controls",
  (await picker.$$eval(".canvas .kept", (els) => els.every((el) => el.tagName === "DIV"))) &&
    (await picker.$$(".canvas .kept")).length > 0,
);
check(
  "every control part is a labelled toggle",
  await picker.$$eval(".canvas button.part", (els) =>
    els.every(
      (el) =>
        el.getAttribute("aria-label")?.startsWith("Hide") ||
        el.getAttribute("aria-label")?.startsWith("Disable"),
    ),
  ),
);

await picker.click(part("hideHomeFeed"));
await until(
  "clicking a part hides it",
  async () => (await stored("unhooked.site.youtube.hideHomeFeed")) === true,
);
check("the part reads as hidden", (await pressed(picker, "hideHomeFeed")) === "true");
check(
  "the receipt lists it",
  (await picker.$eval("#receipt", (el) => el.textContent)).includes("home feed"),
);
check(
  "the note goes away after the first click",
  !(await picker.$eval("#handNote", (el) => el.classList.contains("is-shown"))),
);
await picker.click(part("hideHomeFeed"));
await until(
  "clicking it again brings it back",
  async () => (await stored("unhooked.site.youtube.hideHomeFeed")) === false,
);

await picker.click('.views [data-view="watch"]');
await picker.waitForSelector(part("hideComments"));
await picker.click(part("hideComments"));
await until(
  "parts on other pages of a site work too",
  async () => (await stored("unhooked.site.youtube.hideComments")) === true,
);

await picker.focus(part("hideDescription"));
await picker.keyboard.press("Enter");
await until(
  "parts toggle from the keyboard",
  async () => (await stored("unhooked.site.youtube.hideDescription")) === true,
);

await ext.set({ "unhooked.site.youtube.hideLiveChat": true });
await until(
  "changes made elsewhere show up live",
  async () => (await pressed(picker, "hideLiveChat")) === "true",
);

await ext.set({ "unhooked.paused": true });
await until("a paused extension is explained", () => picker.$eval("#notice", (el) => !el.hidden));
await picker.click("#noticeAction");
await until("Resume clears the pause", async () => (await stored("unhooked.paused")) === false);
await ext.set({ "unhooked.site.youtube.enabled": false });
await until(
  "a site that is off is explained",
  async () => (await picker.$eval("#noticeAction", (el) => el.textContent)) === "Turn it on",
);
await picker.click("#noticeAction");
await until(
  "Turn it on turns the site back on",
  async () => (await stored("unhooked.site.youtube.enabled")) === true,
);

await picker.click("#bringBack");
await until(
  "Bring everything back clears the site",
  async () =>
    (await stored("unhooked.site.youtube.hideComments")) === false &&
    (await stored("unhooked.site.youtube.hideLiveChat")) === false,
);

await picker.click('.site-list a[data-site="x"]');
await until(
  "the site list switches sketches",
  async () =>
    (await picker.$eval("#siteTitle", (el) => el.textContent)) === "X / Twitter" &&
    (await picker.$(part("hideRecommendations"))) !== null,
);
await picker.click(part("hideRecommendations"));
await until("a feature drawn on two pages updates both", async () => {
  await picker.click('.views [data-view="explore"]');
  return (await pressed(picker, "hideRecommendations")) === "true";
});

// End to end: a click in the sketch hides the feed on an open YouTube tab.
const youtube = await newPage();
await stub(youtube, [
  [
    "https://www.youtube.com/",
    fixturePage(
      '<ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer><article id="feed">Home video recommendations</article></ytd-rich-grid-renderer></div></ytd-browse>',
    ),
  ],
]);
await youtube.goto("https://www.youtube.com/", { waitUntil: "load" });
const feedVisible = () => youtube.evaluate(() => document.querySelector("#feed").checkVisibility());
await until("the YouTube feed starts visible", feedVisible);
await picker.bringToFront();
await picker.goto(`${base}#youtube`, { waitUntil: "load" });
// The picker remembers each site's last page (Watch, above); go back to Home.
await picker.click('.views [data-view="home"]');
await picker.waitForSelector(part("hideHomeFeed"));
await picker.click(part("hideHomeFeed"));
await until(
  "a click in the sketch hides the feed on the real page",
  async () => !(await feedVisible()),
);

await close();
finish();
