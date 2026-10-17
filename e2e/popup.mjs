// The popup, opened as a page (Chrome only: Firefox will not let automation open extension
// pages). `?tab=<id>` points it at a real tab, so its focus toggle acts on that page.
import { BROWSER, createChecker, launch, sleep, stub } from "./lib.mjs";

if (BROWSER !== "chrome") {
  console.log("SKIP  popup suite runs on Chrome only");
  process.exit(0);
}

const { browser, newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const worker = await browser.waitForTarget((t) => t.type() === "service_worker");
const popupUrl = `chrome-extension://${new URL(worker.url()).host}/ui/popup/index.html`;
const openPopup = async (query = "") => {
  const page = await newPage({ width: 400, height: 600 });
  await page.goto(popupUrl + query, { waitUntil: "load" });
  await page.waitForFunction(() => !document.querySelector("#site-x")?.disabled);
  return page;
};
const text = (page, selector) => page.$eval(selector, (el) => el.textContent);
async function until(name, probe) {
  const end = Date.now() + 5000;
  let ok = false;
  while (Date.now() < end && !(ok = await probe().catch(() => false))) await sleep(50);
  check(name, ok);
}

const popup = await openPopup();
check(
  "opens on YouTube when the current tab is not a supported site",
  (await text(popup, "#siteName")) === "YouTube",
);
check("lists every site in the rail", (await popup.$$("#sitePicker .site")).length === 10);

await popup.click("label.site:has(#site-x)");
await until(
  "selecting a site shows its controls",
  async () => (await text(popup, "#siteName")) === "X / Twitter",
);
await popup.click('[data-preset="focused"]');
await until(
  "Focus preset turns X's controls on",
  async () => (await text(popup, "#meta-x")) === "3",
);
check(
  "one matching preset is marked (Balanced and Focus coincide on X)",
  JSON.stringify(
    await popup.$$eval("#presets [data-preset]", (b) =>
      b.map((x) => x.getAttribute("aria-pressed")),
    ),
  ) === '["true","false","false"]',
);
await popup.click("label.row:has(#social-hideExplore)");
await until(
  "a custom choice updates the count and clears the preset mark",
  async () =>
    (await text(popup, "#meta-x")) === "2" &&
    (await popup.$$("#presets [aria-pressed=true]")).length === 0,
);

await popup.click("#btnPower");
await until(
  "pausing shows the notice and relabels the rail button",
  async () =>
    (await text(popup, "#powerLabel")) === "Resume" &&
    (await popup.$eval("#pausedNote", (el) => !el.hidden)) &&
    (await popup.$("body.is-paused")) !== null,
);
await popup.click("#btnResume");
await until(
  "Resume clears the pause",
  async () => (await text(popup, "#powerLabel")) === "Pause all",
);

await popup.focus("#site-x");
await popup.keyboard.press("ArrowDown");
await until(
  "arrow keys move between sites",
  async () => (await text(popup, "#siteName")) === "Reddit",
);

await popup.click("#siteEnabled");
await until(
  "the header switch turns the site off",
  async () => (await text(popup, "#meta-reddit")) === "off",
);
await popup.click("#resetAll");
await until(
  "Reset turns the site back on",
  async () => (await text(popup, "#meta-reddit")) === "0",
);

// Two popups writing different sites at once must not overwrite each other.
const other = await openPopup();
await other.click("label.site:has(#site-tiktok)");
await popup.bringToFront();
await popup.click("label.site:has(#site-x)");
// Background tabs never report intersection, so dispatch these clicks inside each page.
const tick = (page, selector) => page.$eval(selector, (el) => el.click());
await Promise.all([tick(popup, "#social-hideHomeFeed"), tick(other, "#social-hideSuggestions")]);
await sleep(300);
const stored = await ext.get(
  "unhooked.site.x.hideHomeFeed",
  "unhooked.site.tiktok.hideSuggestions",
);
check(
  "concurrent writes from two popups both land",
  stored["unhooked.site.x.hideHomeFeed"] === false &&
    stored["unhooked.site.tiktok.hideSuggestions"] === true,
  JSON.stringify(stored),
);
await other.close();
await popup.bringToFront();

// Twitch: header switch is link pills; the log section renders stored links.
await ext.set({
  twitch_url_log: [
    {
      url: "https://github.com/a/b",
      hostname: "github.com",
      kind: "github",
      channel: "pronshh",
      seenAt: 1,
      label: "a/b",
    },
  ],
});
await popup.click("label.site:has(#site-twitch)");
await until("the Twitch log lists recent links", async () =>
  (await text(popup, "#twitchLogList")).includes("a/b"),
);
await popup.click("#siteEnabled");
await until(
  "the Twitch switch turns link pills off",
  async () => (await ext.get("twitch_link_pills")).twitch_link_pills === false,
);
await ext.set({ twitch_link_pills: true });

// Focus mode from the popup, acting on a real Excalidraw tab.
const canvas = await newPage();
await stub(canvas, [
  ["https://excalidraw.com/", "<!doctype html><div class='layer-ui__wrapper'>ui</div>"],
]);
await canvas.goto("https://excalidraw.com/", { waitUntil: "load" });
await sleep(800);
const tabId = await ext.tabId("excalidraw.com");
const scoped = await openPopup(`?tab=${tabId}`);
check("opens on the current tab's site", (await text(scoped, "#siteName")) === "Excalidraw");
check(
  "the focus switch is available on that site",
  await scoped.$eval("#focusToggle", (el) => !el.disabled),
);
await scoped.click("label.row:has(#focusToggle)");
await until("the popup turns focus on in that tab", () =>
  canvas.evaluate(() => document.documentElement.classList.contains("uh-focus-excalidraw")),
);
check("the badge shows ON", (await ext.badge("excalidraw.com")) === "ON");
await ext.set({ "unhooked.paused": true });
await until(
  "pausing hides focus mode and its badge",
  async () =>
    !(await canvas.evaluate(() =>
      document.documentElement.classList.contains("uh-focus-excalidraw"),
    )) && (await ext.badge("excalidraw.com")) === "",
);
await ext.set({ "unhooked.paused": false });
await until("resuming brings focus back", () =>
  canvas.evaluate(() => document.documentElement.classList.contains("uh-focus-excalidraw")),
);
await scoped.click('[data-memory="global"]');
await until(
  "All tabs saves global focus memory",
  async () =>
    (await ext.get("excalidraw_persistence_mode")).excalidraw_persistence_mode === "global",
);
await scoped.close();
await popup.bringToFront();

// The picker opens in a tab, on the selected site.
await popup.click("label.site:has(#site-reddit)");
const opened = browser.waitForTarget((t) => t.url().includes("/ui/picker/index.html"));
await popup.click("#openPicker");
check(
  "the sketch button opens the picker on the selected site",
  (await opened).url().endsWith("/ui/picker/index.html#reddit"),
);
// The button closes the popup, as a real popup should; reopen it for the last checks.
const reopened = await openPopup();

// Dark only, and the size of a Chrome popup.
check(
  "the popup is dark",
  await reopened.evaluate(() => getComputedStyle(document.documentElement).colorScheme === "dark"),
);
const size = await reopened.evaluate(() => ({
  height: document.body.getBoundingClientRect().height,
  footer: document.querySelector("footer").getBoundingClientRect().bottom,
  width: document.documentElement.scrollWidth,
}));
check(
  "fits Chrome's 600px popup",
  size.height === 600 && size.footer <= 600 && size.width <= 400,
  JSON.stringify(size),
);

await close();
finish();
