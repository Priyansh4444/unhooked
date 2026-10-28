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
await scoped.hover("label.row:has(#focusToggle)");
await until(
  "hovering Focus this tab outlines what focus hides",
  async () =>
    (await canvas.evaluate(() => document.querySelector("unhooked-overlay")?.dataset.preview)) ===
    "1",
);
await scoped.mouse.move(5, 5);
await scoped.click('[data-memory="global"]');
await until(
  "All tabs saves global focus memory",
  async () =>
    (await ext.get("excalidraw_persistence_mode")).excalidraw_persistence_mode === "global",
);
await scoped.close();
await popup.bringToFront();

// The wand, hover previews and wand removals, against a real (stubbed) Reddit tab.
check(
  "the wand needs the tab to be on the selected site",
  await popup.$eval("#openWand", (el) => el.disabled),
);
const reddit = await newPage();
await stub(reddit, [
  [
    "https://www.reddit.com/",
    '<!doctype html><shreddit-feed><article id="feed">A post</article></shreddit-feed><aside class="promo">Promo</aside>',
  ],
]);
await reddit.goto("https://www.reddit.com/", { waitUntil: "load" });
await reddit.waitForFunction(() => document.documentElement.dataset.uhSite === "reddit");
const redditTab = await ext.tabId("reddit.com");
await ext.set({ "unhooked.custom.reddit": [{ selector: "aside.promo", label: "Promo", at: 1 }] });
const onReddit = await openPopup(`?tab=${redditTab}`);
check(
  "the wand is available on the tab's site",
  await onReddit.$eval("#openWand", (el) => !el.disabled),
);
await until("wand removals are listed with what they were", async () =>
  (await onReddit.$eval("#customList", (el) => el.textContent)).includes("aside.promo"),
);
await onReddit.hover("label.row:has(#social-hideHomeFeed)");
await until(
  "hovering a control outlines it on the page",
  async () =>
    (await reddit.evaluate(() => document.querySelector("unhooked-overlay")?.dataset.preview)) ===
    "1",
);
check(
  "the hovered control's description shows in the footer",
  await onReddit.$eval(
    "#hint",
    (el) => getComputedStyle(el).display !== "none" && el.textContent.length > 10,
  ),
);
await onReddit.mouse.move(5, 5);
await until(
  "moving away clears the outline",
  async () =>
    (await reddit.evaluate(() => document.querySelector("unhooked-overlay")?.dataset.preview)) ===
    undefined,
);
await ext.set({ "unhooked.site.reddit.hideHomeFeed": true });
await onReddit.hover("#siteEnabled");
await until(
  "hovering the site switch outlines everything it hides",
  async () =>
    (await reddit.evaluate(() => document.querySelector("unhooked-overlay")?.dataset.preview)) !==
    undefined,
);
await onReddit.mouse.move(5, 5);
await ext.set({ "unhooked.site.reddit.hideHomeFeed": false });

// The wand shortcut recorder.
check(
  "the wand button shows its shortcut",
  /W$/.test(await onReddit.$eval("#wandShortcut", (el) => el.textContent.trim())),
);
await onReddit.click("#wandShortcut");
await until(
  "clicking the shortcut starts recording",
  async () => (await onReddit.$eval("#wandShortcut", (el) => el.textContent)) === "Press keys",
);
await onReddit.keyboard.down("Control");
await onReddit.keyboard.down("Alt");
await onReddit.keyboard.press("KeyK");
await onReddit.keyboard.up("Alt");
await onReddit.keyboard.up("Control");
await until(
  "pressing keys saves them as the shortcut",
  async () => (await ext.get("unhooked.wandShortcut"))["unhooked.wandShortcut"] === "Ctrl+Alt+KeyK",
);
await until("the new shortcut shows on the button", async () =>
  /K$/.test(await onReddit.$eval("#wandShortcut", (el) => el.textContent.trim())),
);
await onReddit.click("#wandShortcut");
await onReddit.keyboard.press("Backspace");
await until(
  "Backspace removes the shortcut",
  async () => (await ext.get("unhooked.wandShortcut"))["unhooked.wandShortcut"] === "",
);
await ext.set({ "unhooked.wandShortcut": "Alt+Shift+KeyW" });
await onReddit.click("#customList .bring-back");
await until(
  "Bring back removes a wand removal",
  async () =>
    ((await ext.get("unhooked.custom.reddit"))["unhooked.custom.reddit"] ?? []).length === 0,
);
await onReddit.click("#openWand");
await until(
  "the wand button starts the wand on the page",
  async () =>
    await reddit.evaluate(() => document.querySelector("unhooked-overlay[data-wand]") !== null),
);
await reddit.bringToFront();
await reddit.keyboard.press("Escape");
await popup.bringToFront();

// Renaming a wand removal: click its name, type, Enter. (The wand button closed the popup.)
await ext.set({ "unhooked.custom.reddit": [{ selector: "aside.promo", label: "Promo", at: 1 }] });
const again = await openPopup(`?tab=${redditTab}`);
await again.bringToFront();
const nameField = "#customList .rule-name";
await again.waitForSelector(nameField);
const rename = async (name) => {
  await again.focus(nameField);
  await again.$eval(nameField, (input) => input.select());
  if (name) await again.keyboard.type(name);
  else await again.keyboard.press("Backspace");
  await again.keyboard.press("Enter");
};
await rename("Premium promo");
const savedRule = async () =>
  (await ext.get("unhooked.custom.reddit"))["unhooked.custom.reddit"]?.[0];
await until("a removal can be renamed, and keeps what the wand called it", async () => {
  const rule = await savedRule();
  return rule?.label === "Premium promo" && rule.original === "Promo";
});
await rename("");
await until(
  "clearing the name puts the wand's name back",
  async () => (await savedRule())?.label === "Promo",
);

// Skip the feeds: the stronger option, with a page of the site's own to go to instead.
const skip = (key) =>
  ext.get(`unhooked.site.reddit.${key}`).then((r) => r[`unhooked.site.reddit.${key}`]);
check(
  "Skip the feeds is offered on the site",
  await again.$eval("#skipSection", (el) => !el.hidden),
);
await again.click("label.row:has(#skipToggle)");
await until("turning it on is saved", async () => (await skip("redirect")) === true);
await again.click('#skipChoices [data-path="/message/inbox/"]');
await until(
  "choosing where to go is saved",
  async () => (await skip("redirectTo")) === "/message/inbox/",
);
await again.click('#skipChoices [data-path=""]');
await until("Other opens a path field", async () =>
  again.$eval("#skipPathForm", (el) => !el.hidden),
);
await again.type("#skipPath", "//elsewhere.example");
await again.keyboard.press("Enter");
await until("a path off the site is refused", async () =>
  (await text(again, "#saveStatus")).includes("starting with /"),
);
await again.$eval("#skipPath", (el) => (el.value = ""));
await again.type("#skipPath", "https://www.reddit.com/r/rust/");
await again.keyboard.press("Enter");
await until(
  "a pasted address on the site becomes its path",
  async () => (await skip("redirectTo")) === "/r/rust/",
);
await ext.set({ "unhooked.site.reddit.redirect": false, "unhooked.site.reddit.redirectTo": null });

// Any other website gets its own place in the rail, for the wand.
const otherSite = await newPage();
await stub(otherSite, [
  ["https://example.org/", '<!doctype html><div class="banner">Banner</div><p>Text</p>'],
]);
await otherSite.goto("https://example.org/", { waitUntil: "load" });
await ext.set({
  "unhooked.custom.web:example.org": [{ selector: ".banner", label: "Banner", at: 1 }],
});
const onOther = await openPopup(`?tab=${await ext.tabId("example.org")}`);
await onOther.bringToFront();
check("another website appears in the rail", (await onOther.$$("#sitePicker .site")).length === 11);
check(
  "and opens selected, named by its host",
  (await text(onOther, "#siteName")) === "example.org",
);
check(
  "with the wand, and without controls it doesn't have",
  await onOther.evaluate(
    () =>
      !document.querySelector("#openWand").disabled &&
      document.querySelector("#presets").hidden &&
      document.querySelector("#controlsSection").hidden &&
      document.querySelector("#siteEnabled").hidden,
  ),
);
await until("its removals are listed", async () =>
  (await onOther.$eval("#customList", (el) => el.textContent)).includes(".banner"),
);
await onOther.click("#resetAll");
await until(
  "Forget site removes them",
  async () =>
    (await ext.get("unhooked.custom.web:example.org"))["unhooked.custom.web:example.org"] ===
    undefined,
);
await otherSite.close();

// The picker opens in a tab, on the selected site.
await popup.bringToFront();
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
