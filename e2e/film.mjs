// Film mode: frame a post at the center of the screen, and save clean screenshots.
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BROWSER, createChecker, launch, sleep, stub } from "./lib.mjs";

const { browser, newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const until = async (name, condition, ms = 5000) => {
  const start = Date.now();
  let ok = false;
  while (!ok && Date.now() - start < ms) {
    ok = await condition().catch(() => false);
    if (!ok) await sleep(50);
  }
  check(name, ok);
};

// Posts in cells moved by a transform, as X's timeline does, so `position: fixed` wouldn't work.
const post = (
  id,
  y,
) => `<div data-testid="cellInnerDiv" style="position:absolute;width:600px;transform:translateY(${y}px)">
  <article data-testid="tweet" id="${id}" style="padding:12px;color:#fff">
    <a href="/post/${id}" id="${id}-link">A post worth keeping, ${id}</a>
    <button data-testid="caret" id="${id}-caret">…</button>
    <div role="group" id="${id}-actions">reply repost like</div>
  </article></div>`;
const X_PAGE = `<!doctype html><html><body style="margin:0;background:rgb(0,0,0)"><main style="position:relative;margin-left:300px">
  ${post("one", 40)}${post("two", 200)}</main><a href="#elsewhere" id="elsewhere" style="position:fixed;left:10px;top:10px;color:#fff">elsewhere</a></body></html>`;

const page = await newPage({ width: 1200, height: 800 });
await stub(page, [["https://x.com/", X_PAGE]]);
await page.goto("https://x.com/home", { waitUntil: "load" });
await page.bringToFront();
await sleep(500);

const overlay = () => page.$("unhooked-overlay[data-film]");
const stage = () => page.$("#uh-film-stage");
const center = (selector) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });

// The film button, in each post's row of actions.
const slots = (selector = "main") =>
  page.$$eval(`${selector} .uh-film-slot`, (found) => found.length);
await until("each post gets a film button", async () => (await slots()) === 2);
check(
  "in its row of actions",
  await page.$eval("#one-actions .uh-film-slot", (el) => el.parentElement.id === "one-actions"),
);
await page.click("#one-actions .uh-film-btn");
await until("the button frames that post", async () => (await stage()) !== null);
check("without opening it", page.url() === "https://x.com/home");
check(
  "the right post",
  (await page.$eval("#uh-film-stage article", (el) => el.textContent)).includes("keeping, one"),
);
check(
  "its copy doesn't show the button",
  await page.$eval("#uh-film-stage .uh-film-slot", (el) => getComputedStyle(el).display === "none"),
);
await page.keyboard.press("Escape");
await until("Esc goes back to the page", async () => (await stage()) === null);
await until(
  "and out of film mode, since it only started for this",
  async () => (await overlay()) === null,
);
await page.evaluate(() => {
  const row = document.querySelector("#two-actions");
  row.replaceWith(Object.assign(row.cloneNode(false), { textContent: "redrawn" }));
});
await until(
  "a post the site redraws gets its button back",
  async () => (await page.$("#two-actions .uh-film-slot")) !== null,
);
await sleep(600);
check("and only one", (await slots()) === 2);
await ext.set({ twitter_film_button: false });
await until("it can be turned off", async () => (await slots()) === 0);
await ext.set({ twitter_film_button: true });
await until("and on again", async () => (await slots()) === 2);
await ext.set({ "unhooked.paused": true });
await until("Pause all takes it away", async () => (await slots()) === 0);
await ext.set({ "unhooked.paused": false });
await until("Resume brings it back", async () => (await slots()) === 2);

await ext.inject("x.com", "sites/film/content.js");
await until("film mode starts on the page", async () => (await overlay()) !== null);

// Framing.
const [x, y] = await center("#one");
await page.mouse.move(x, y);
await page.mouse.click(x, y);
await until("clicking a post frames it", async () => (await stage()) !== null);
check("the click didn't follow the post's link", page.url() === "https://x.com/home");
const flight = await page.evaluate(() => {
  const card = document.querySelector("#uh-film-stage > div:last-child");
  const [animation] = card.getAnimations();
  if (!animation) return null;
  animation.pause();
  animation.currentTime = 0;
  const start = card.getBoundingClientRect();
  animation.finish();
  const post = document.querySelector("#one").getBoundingClientRect();
  return [start.left - post.left, start.top - post.top, start.width - post.width].map(Math.abs);
});
check(
  "it flies from exactly where the post was",
  flight === null || flight.every((gap) => gap < 2),
  JSON.stringify(flight),
);
await sleep(600);
const card = await page.$eval("#uh-film-stage > div:last-child", (el) => {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    width: r.width,
    // Zoom scales the radius too; this is how round it looks.
    radius: parseFloat(s.borderRadius) * (el.currentCSSZoom ?? 1),
    transform: s.transform,
    images: el.querySelectorAll("img, canvas").length,
    article: el.querySelector("article")?.textContent,
  };
});
check(
  "it sits at the center of the screen",
  Math.abs(card.x - 600) < 2 && Math.abs(card.y - 400) < 2,
);
check("slightly rounded", Math.abs(card.radius - 16) < 0.5, String(card.radius));
check("enlarged", card.width > 650, String(card.width));
check(
  "it's real elements, not a picture of them",
  card.article?.includes("A post worth keeping") && card.images === 0,
);
if (BROWSER === "chrome")
  check(
    "enlarged by layout, so the browser draws it sharp rather than stretching it",
    card.transform === "none",
    card.transform,
  );
check(
  "it's a copy, with the real post left in the timeline",
  await page.evaluate(
    () =>
      document.querySelector('main [data-testid="cellInnerDiv"] #one') !== null &&
      document.querySelector("#uh-film-stage article") !== null,
  ),
);
check(
  "the card matches the page's theme",
  (await page.$eval(
    "#uh-film-stage > div:last-child",
    (el) => getComputedStyle(el).backgroundColor,
  )) === "rgb(0, 0, 0)",
);
check(
  "the post's menu is left out of the picture",
  await page.$eval(
    "#uh-film-stage [data-testid=caret]",
    (el) => getComputedStyle(el).display === "none",
  ),
);
await page.keyboard.press("a");
check(
  "A hides its buttons",
  await page.$eval(
    '#uh-film-stage [role="group"]',
    (el) => getComputedStyle(el).display === "none",
  ),
);
await page.keyboard.press("a");

// A take stays clean: with nothing going on, the toolbar and pointer leave the frame.
await sleep(3000);
check(
  "the pointer leaves the frame when idle",
  await page.$eval("#uh-film-stage", (el) => el.style.cursor === "none"),
);
await page.mouse.move(20, 20);
await until("and comes back when you move", () =>
  page.$eval("#uh-film-stage", (el) => el.style.cursor === ""),
);

await page.keyboard.press("Escape");
await until("Esc returns to the page", async () => (await stage()) === null);
check(
  "the post is visible again",
  await page.$eval("#one", (el) => getComputedStyle(el).visibility === "visible"),
);
check("film mode is still on", (await overlay()) !== null);

// The rest of the page keeps working.
await page.click("#elsewhere");
await until("links outside posts still work", async () => page.url().endsWith("#elsewhere"));

// Screenshots: Firefox's automation can't grant the capture, so Chrome checks the file itself.
if (BROWSER === "chrome") {
  const folder = mkdtempSync(join(tmpdir(), "unhooked-film-"));
  const session = await browser.target().createCDPSession();
  await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: folder });
  const pngSize = (file) => {
    const data = readFileSync(join(folder, file));
    return {
      signature: data.toString("latin1", 1, 4),
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
    };
  };
  const newest = async (count) => {
    await until(
      `screenshot ${count} is saved`,
      async () => readdirSync(folder).filter((f) => f.endsWith(".png")).length >= count,
      8000,
    );
    return readdirSync(folder)
      .filter((f) => f.endsWith(".png"))
      .sort()
      .at(-1);
  };
  await page.keyboard.press("s");
  const whole = await newest(1);
  check("the file is named for the site", whole?.startsWith("x.com-"), whole);
  const wholeSize = pngSize(whole);
  check("S saves a PNG", wholeSize.signature === "PNG");
  check(
    "of the whole window",
    wholeSize.width === 1200 && wholeSize.height === 800,
    JSON.stringify(wholeSize),
  );
  const pixelsHidden = await page.$eval(
    "unhooked-overlay[data-film]",
    (el) => el.style.display === "",
  );
  check("the overlay comes back after the shot", pixelsHidden);

  await sleep(1100); // browsers allow a couple of captures a second, and file names are by the second
  const [a, b] = await center("#two");
  await page.mouse.move(a, b);
  await page.mouse.click(a, b);
  await until("a second post frames", async () => (await stage()) !== null);
  await sleep(600);
  await page.keyboard.press("s");
  const framed = await newest(2);
  const framedSize = pngSize(framed);
  check(
    "a framed post is cropped to its card and backdrop",
    framedSize.width < 1200 && framedSize.height < 800 && framedSize.width > 600,
    JSON.stringify(framedSize),
  );
  await page.keyboard.press("Escape");
  await until("back to the page", async () => (await stage()) === null);
}

// Injecting again turns it off, leaving nothing behind.
await page.keyboard.press("Escape");
await until("Esc leaves film mode", async () => (await overlay()) === null);
await ext.inject("x.com", "sites/film/content.js");
await until("it can start again", async () => (await overlay()) !== null);
await ext.inject("x.com", "sites/film/content.js");
await until("starting it twice turns it off", async () => (await overlay()) === null);

// Any other site: screenshots only, and posts aren't touched.
const other = await newPage({ width: 1000, height: 600 });
await stub(other, [
  [
    "https://example.org/",
    `<!doctype html><article data-testid="tweet" id="lookalike">not X</article>`,
  ],
]);
await other.goto("https://example.org/", { waitUntil: "load" });
await other.bringToFront();
await ext.inject("example.org", "sites/film/content.js");
await until(
  "film mode starts on any site",
  async () => (await other.$("unhooked-overlay[data-film]")) !== null,
);
const look = await other.$eval("#lookalike", (el) => {
  const r = el.getBoundingClientRect();
  return [r.left + 5, r.top + 5];
});
await other.mouse.click(...look);
await sleep(300);
check("only X's posts are framed", (await other.$("#uh-film-stage")) === null);

await close();
finish();
