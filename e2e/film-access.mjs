// How film mode's screenshots are really allowed, on a build without the access tests normally have:
// through the toolbar button, which a real install relies on, or else by asking.
// (Chromium only: this drives the toolbar through its debugging protocol.)
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExtension } from "../build.ts";
import { BROWSER, createChecker, launch, sleep, stub } from "./lib.mjs";

if (BROWSER !== "chrome") {
  console.log("SKIP  film-access suite runs on Chromium only");
  process.exit(0);
}
const { check, finish } = createChecker();

const outdir = "dist-e2e-access";
await buildExtension({ target: "chrome", outdir, minify: false, e2e: true, noCaptureAccess: true });
process.env.EXT = outdir;

const { browser, newPage, ext, close } = await launch({ debugExtensions: true });

const until = async (name, condition, ms = 8000) => {
  const start = Date.now();
  let ok = false;
  while (!ok && Date.now() - start < ms) {
    ok = await condition().catch(() => false);
    if (!ok) await sleep(100);
  }
  check(name, ok);
};

const POST_PAGE = `<!doctype html><html><body style="margin:0;background:rgb(0,0,0)"><main style="margin-left:300px;width:600px">
  <article data-testid="tweet" id="one" style="padding:12px;color:#fff">A post worth keeping
    <div role="group" id="one-actions">reply repost like</div></article></main></body></html>`;

const folder = mkdtempSync(join(tmpdir(), "unhooked-access-"));
const session = await browser.target().createCDPSession();
await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: folder });
const saved = () => readdirSync(folder).filter((name) => name.endsWith(".png")).length;

const page = await newPage({ width: 1200, height: 800 });
await stub(page, [["https://x.com/", POST_PAGE]]);
await page.goto("https://x.com/home", { waitUntil: "load" });
await page.bringToFront();
await until("the film button is on the post", async () => (await page.$(".uh-film-btn")) !== null);

const allowWindow = () =>
  browser.waitForTarget((t) => t.url().includes("/ui/allow/index.html"), { timeout: 8000 });

// Without having used the extension on this tab, a picture has to be asked for.
await page.click(".uh-film-btn");
await until("the button frames the post", async () => (await page.$("#uh-film-stage")) !== null);
await sleep(600);
const asked = allowWindow();
await page.keyboard.press("s");
const allow = await asked;
check("pressing S asks for access in a small window", Boolean(allow));
check("and no picture is saved yet", saved() === 0);
const tabId = await ext.tabId("x.com/home");
check("the window knows which tab asked", allow.url().endsWith(`?tab=${tabId}`), allow.url());
const prompt = await allow.asPage();
await prompt.waitForSelector("#allow");
check(
  "it says what the access is for",
  (await prompt.$eval("main", (el) => el.textContent)).includes("when you press S"),
);
await prompt.evaluate(() => {
  window.asked = null;
  chrome.permissions.request = async (request) => {
    window.asked = request;
    return false;
  };
});
await prompt.click("#allow");
await until("Allow asks the browser for what capture needs", () =>
  prompt.evaluate(() => JSON.stringify(window.asked?.origins) === '["<all_urls>"]'),
);
await until("refusing says so, and stays calm", async () =>
  (await prompt.$eval("#status", (el) => el.textContent)).includes("Not allowed"),
);
check("no picture is taken", saved() === 0);
await prompt.close();
await page.bringToFront();
await page.keyboard.press("Escape");
await until("the frame closes", async () => (await page.$("#uh-film-stage")) === null);

// The toolbar button: pressing it is what lets an extension capture this tab.
const [extension] = [...(await browser.extensions()).values()].filter((e) => e.name === "Unhooked");
const popupOpens = browser.waitForTarget((t) => t.url().includes("/ui/popup/index.html"), {
  timeout: 10000,
});
await page.bringToFront();
await page.triggerExtensionAction(extension);
const popupTarget = await popupOpens;
check("the real toolbar button opens the real popup", Boolean(popupTarget));
const popup = await popupTarget.asPage();
await popup.waitForSelector("#openFilm:not([disabled])");
check(
  "on the tab it was pressed on",
  (await popup.$eval("#siteName", (el) => el.textContent)) === "X / Twitter",
);
await popup.click("#openFilm");
await until(
  "the popup's Film mode button starts it on the page",
  async () => (await page.$("unhooked-overlay[data-film]")) !== null,
);
await page.bringToFront();
await sleep(300);
await page.keyboard.down("Shift");
await page.keyboard.press("s");
await page.keyboard.up("Shift");
await until("then a real picture is taken, with no question asked", async () => saved() === 1);

// Once it's been pressed, the same is true of the button on the post.
await page.keyboard.press("Escape");
await until("film mode ends", async () => (await page.$("unhooked-overlay[data-film]")) === null);
await sleep(1100);
await page.click(".uh-film-btn");
await until(
  "the post's button frames it again",
  async () => (await page.$("#uh-film-stage")) !== null,
);
await sleep(600);
await page.keyboard.down("Shift");
await page.keyboard.press("s");
await page.keyboard.up("Shift");
await until("and that works too", async () => saved() === 2);

await close();
finish();
