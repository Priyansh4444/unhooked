// The magic wand and the hover preview, on a stubbed reddit.com page. Runs in Chrome and
// Firefox: the bridge injects the wand the way the popup's button does.
import { createChecker, launch, press, sleep, stub } from "./lib.mjs";
import { fixturePage } from "./social-fixtures.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const PAGE = fixturePage(`
  <shreddit-feed><article id="feed">A front-page post</article></shreddit-feed>
  <aside class="promo-card"><h3 id="promo-heading">Try Premium</h3><p>Ad copy</p></aside>
  <aside class="promo-card"><h3>Another promo</h3><p>More ad copy</p></aside>
  <a id="away" href="https://www.reddit.com/elsewhere">A link the wand must not follow</a>
  <input id="box" aria-label="A text box">`);
const open = async () => {
  const page = await newPage();
  await stub(page, [["https://www.reddit.com/", PAGE]]);
  await page.goto("https://www.reddit.com/", { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.uhSite === "reddit");
  return page;
};
async function until(name, probe, detail = async () => "") {
  const end = Date.now() + 5000;
  let ok = false;
  while (Date.now() < end && !(ok = await probe().catch(() => false))) await sleep(50);
  check(name, ok, ok ? "" : await detail().catch(() => ""));
}
const visible = (page, selector) =>
  page.$$eval(selector, (els) => els.map((el) => el.checkVisibility()));
const wandState = (page) =>
  page.evaluate(() => {
    const host = document.querySelector("unhooked-overlay[data-wand]");
    return host ? { ...host.dataset } : null;
  });
const rules = async () => (await ext.get("unhooked.custom.reddit"))["unhooked.custom.reddit"] ?? [];
const center = async (page, selector) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

await ext.set({ "unhooked.paused": false, "unhooked.custom.reddit": [] });
const page = await open();

// Preview: what a control covers, drawn on the page while the popup row is hovered.
const reply = await ext.send("reddit.com", {
  action: "uh/preview",
  feature: "hideHomeFeed",
  label: "Home feed",
});
check(
  "hovering a control outlines what it covers on the page",
  reply?.count === 1,
  JSON.stringify(reply),
);
await until(
  "the outline is drawn",
  async () =>
    (await page.evaluate(() => document.querySelector("unhooked-overlay")?.dataset.preview)) ===
    "1",
);
await ext.send("reddit.com", { action: "uh/preview", clear: true });
await until(
  "leaving the control clears the outline",
  async () =>
    (await page.evaluate(() => document.querySelector("unhooked-overlay")?.dataset.preview)) ===
    undefined,
);

// The wand.
await ext.inject("reddit.com", "sites/wand/content.js");
await until("the wand starts on the page", async () => (await wandState(page))?.wand === "on");
const promo = await center(page, "aside.promo-card");
await page.mouse.move(promo.x, promo.y + 10);
await until(
  "hovering shows every element like this one",
  async () => (await wandState(page))?.count === "2",
  async () => JSON.stringify(await wandState(page)),
);
check(
  "the rule is readable, not a generated path",
  /aside\.promo-card$/.test((await wandState(page)).selector),
  (await wandState(page)).selector,
);
await press(page, "s");
await until("S narrows to this one", async () => (await wandState(page))?.count === "1");
await press(page, "s");
await until("S widens back to all", async () => (await wandState(page))?.count === "2");

const heading = await center(page, "#promo-heading");
await page.mouse.move(heading.x, heading.y);
await until("pointing inside a part picks the whole part", async () =>
  /aside\.promo-card$/.test((await wandState(page))?.selector ?? ""),
);
await press(page, "ArrowDown");
await until("↓ narrows to exactly what is under the pointer", async () =>
  (await wandState(page))?.selector?.includes("promo-heading"),
);
await press(page, "ArrowUp");
await until("↑ widens back to the part", async () =>
  /aside\.promo-card$/.test((await wandState(page))?.selector ?? ""),
);

const away = await center(page, "#away");
await page.mouse.move(away.x, away.y);
await sleep(200);
await page.mouse.move(promo.x, promo.y + 10);
await sleep(200);
await page.mouse.click(promo.x, promo.y + 10);
await until("a click saves a rule for this site", async () => (await rules()).length === 1);
await until("the picked elements disappear", async () =>
  (await visible(page, "aside.promo-card")).every((v) => v === false),
);
check("the rest of the page stays", (await visible(page, "#feed"))[0] === true);
check("the page never saw the click", page.url() === "https://www.reddit.com/");

await press(page, "z");
await until("Z undoes the last removal", async () => (await rules()).length === 0);
await until("undone elements come back", async () =>
  (await visible(page, "aside.promo-card")).every((v) => v === true),
);
// Pick from the keyboard this time: point at the heading (its promo is picked), press Enter.
await page.mouse.move(away.x, away.y);
await sleep(150);
await page.mouse.move(heading.x, heading.y);
await until("pointing again picks the promo", async () =>
  /aside\.promo-card$/.test((await wandState(page))?.selector ?? ""),
);
await press(page, "Enter");
await until("picking again saves again", async () => (await rules()).length === 1);
await press(page, "Escape");
await until("Esc puts the wand away", async () => (await wandState(page)) === null);

// Preview of a wand removal that is already hidden.
const saved = (await rules())[0];
const hiddenReply = await ext.send("reddit.com", {
  action: "uh/preview",
  selector: saved.selector,
  label: saved.label,
});
check(
  "previewing a hidden removal reports nothing visible",
  hiddenReply?.count === 0,
  JSON.stringify(hiddenReply),
);
await ext.send("reddit.com", { action: "uh/preview", clear: true });

// Removals persist, and follow the global pause.
const again = await open();
await until(
  "removals apply again after a reload",
  async () => (await visible(again, "aside.promo-card")).every((v) => v === false),
  async () => JSON.stringify(await rules()),
);
await ext.set({ "unhooked.paused": true });
await until("pausing brings removals back", async () =>
  (await visible(again, "aside.promo-card")).every((v) => v === true),
);
await ext.set({ "unhooked.paused": false });
await until("resuming hides them again", async () =>
  (await visible(again, "aside.promo-card")).every((v) => v === false),
);

// The wand shortcut: set by the user in the popup, pressed on the page.
const wandOn = async () => (await wandState(again)) !== null;
await again.bringToFront();
await again.mouse.click(5, 5);
await press(again, "Alt+Shift+KeyW");
await until("the default shortcut starts the wand", wandOn);
await press(again, "Alt+Shift+KeyW");
await until("pressing it again puts the wand away", async () => !(await wandOn()));
await ext.set({ "unhooked.wandShortcut": "Ctrl+Alt+KeyK" });
await sleep(300);
await press(again, "Alt+Shift+KeyW");
await sleep(500);
check("a changed shortcut replaces the default", !(await wandOn()));
await press(again, "Control+Alt+KeyK");
await until("the user's shortcut starts the wand", wandOn);
await press(again, "Escape");
await until("Esc still puts it away", async () => !(await wandOn()));
await again.focus("#box");
await press(again, "Control+Alt+KeyK");
await sleep(500);
check("typing in a text box never starts the wand", !(await wandOn()));
await again.mouse.click(5, 5);
await ext.set({ "unhooked.wandShortcut": "" });
await sleep(300);
await press(again, "Control+Alt+KeyK");
await sleep(500);
check("a removed shortcut does nothing", !(await wandOn()));
await ext.set({ "unhooked.wandShortcut": "Alt+Shift+KeyW" });

// ---- a site Unhooked has no controls for ------------------------------------------------------
// The test build is already allowed on example.org, as if the user had said yes to the wand there.
console.log("== any other site");
const OTHER = "web:example.org";
const otherRules = async () =>
  (await ext.get(`unhooked.custom.${OTHER}`))[`unhooked.custom.${OTHER}`] ?? [];
await ext.set({
  [`unhooked.custom.${OTHER}`]: [{ selector: ".cookie-wall", label: "Cookie wall", at: 1 }],
});
const elsewhere = await newPage();
await stub(elsewhere, [
  [
    "https://example.org/",
    `<!doctype html><title>Example</title><div class="cookie-wall" style="height:80px">Accept cookies</div><div id="sticky" style="height:60px">Sticky banner</div><p id="article">The article</p>`,
  ],
]);
await elsewhere.goto("https://example.org/news", { waitUntil: "load" });
await until(
  "a removal made on another site stays removed on the next visit",
  async () => (await visible(elsewhere, ".cookie-wall"))[0] === false,
);
check("the rest of that page is left alone", (await visible(elsewhere, "#article"))[0] === true);
await ext.inject("example.org", "sites/wand/content.js");
await until("the wand starts there too", async () => (await wandState(elsewhere)) !== null);
const sticky = await center(elsewhere, "#sticky");
await elsewhere.mouse.move(sticky.x, sticky.y);
await until(
  "and outlines what is under the pointer",
  async () => (await wandState(elsewhere))?.selector?.includes("sticky"),
  async () => JSON.stringify(await wandState(elsewhere)),
);
await elsewhere.mouse.click(sticky.x, sticky.y);
await until(
  "a click saves the removal under that site",
  async () => (await otherRules()).some((rule) => rule.selector.includes("sticky")),
  async () => JSON.stringify(await otherRules()),
);
await until("and hides it", async () => (await visible(elsewhere, "#sticky"))[0] === false);
await press(elsewhere, "Escape");
await ext.set({ "unhooked.paused": true });
await until("pause brings it back", async () => (await visible(elsewhere, "#sticky"))[0] === true);
await ext.set({ "unhooked.paused": false, [`unhooked.custom.${OTHER}`]: [] });

await close();
finish();
