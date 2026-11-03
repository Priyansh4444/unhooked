// Moving settings between browsers: copy here, paste there, with what's unsafe or private left out.
// (Chrome only: Firefox will not let automation open extension pages.)
import { BROWSER, createChecker, launch, sleep } from "./lib.mjs";

if (BROWSER !== "chrome") {
  console.log("SKIP  transfer suite runs on Chrome only");
  process.exit(0);
}

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

const worker = await browser.waitForTarget((t) => t.type() === "service_worker");
const page = await newPage({ width: 1000, height: 760 });
await page.goto(`chrome-extension://${new URL(worker.url()).host}/ui/transfer/index.html`, {
  waitUntil: "load",
});
const text = (selector) => page.$eval(selector, (el) => el.textContent);
const paste = (value) =>
  page.$eval(
    "#incoming",
    (el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value,
  );

await ext.set({
  "unhooked.site.x.hideHomeFeed": true,
  "unhooked.site.x.redirect": true,
  "unhooked.site.instagram.redirectTo": "/{user}/saved/",
  "unhooked.custom.reddit": [{ selector: "aside.promo", label: "Promo", at: 1 }],
  "unhooked.custom.web:example.org": [{ selector: ".banner", label: "Banner", at: 1 }],
  "unhooked.wandShortcut": "Alt+Shift+KeyQ",
  "unhooked.paused": false,
  twitch_url_log: [{ url: "https://example.com/private" }],
  "unhooked.user.instagram": "someone",
});
await until("the page says what would be moved", async () =>
  (await text("#mine")).startsWith("1 control on 1 site, 2 wand removals"),
);

// Copy: capture what reaches the clipboard (headless Chrome has no real one to read).
await page.evaluate(() => {
  navigator.clipboard.writeText = (value) => {
    window.copied = value;
    return Promise.resolve();
  };
});
await page.click("#copy");
await until("Copy settings reaches the clipboard", () =>
  page.evaluate(() => typeof window.copied === "string"),
);
const copied = await page.evaluate(() => window.copied);
check("the copy holds the choices", copied.includes("unhooked.site.x.hideHomeFeed"));
check("it holds the wand removals", copied.includes(".banner"));
check(
  "what belongs to this browser stays behind",
  !copied.includes("private") && !copied.includes("someone") && !copied.includes("unhooked.paused"),
);

// Save: the file a click would download.
await page.evaluate(() => {
  HTMLAnchorElement.prototype.click = function () {
    window.saved = this.download;
  };
});
await page.click("#save");
await until("Save as a file names the file by date", () =>
  page.evaluate(() => /^unhooked-settings-\d{4}-\d\d-\d\d\.json$/.test(window.saved ?? "")),
);

// Now pretend to be the other browser: a different state to import into.
await ext.set({
  "unhooked.site.x.hideHomeFeed": false,
  "unhooked.site.x.redirect": false,
  "unhooked.wandShortcut": "",
  "unhooked.custom.reddit": [{ selector: "aside.here", label: "Made here", at: 2 }],
});
const isDisabled = () => page.$eval("#import", (el) => el.disabled);
check("Import waits for settings", await isDisabled());

await paste("something else entirely");
await until("the wrong text is explained, not imported", async () =>
  (await text("#found")).includes("isn't an Unhooked"),
);
check("and Import stays off", await isDisabled());

await paste(copied);
await until("pasting shows what will arrive", async () =>
  (await text("#found")).startsWith("1 control on 1 site"),
);
await page.click("#import");
await until("Import brings the choices over", async () => {
  const got = await ext.get("unhooked.site.x.hideHomeFeed", "unhooked.wandShortcut");
  return (
    got["unhooked.site.x.hideHomeFeed"] === true &&
    got["unhooked.wandShortcut"] === "Alt+Shift+KeyQ"
  );
});
const rules = (await ext.get("unhooked.custom.reddit"))["unhooked.custom.reddit"];
check(
  "and keeps removals made here",
  rules.map((rule) => rule.selector).join() === "aside.here,aside.promo",
);
check("the field is cleared", (await page.$eval("#incoming", (el) => el.value)) === "");

await page.click("#undo");
await until("Undo puts this browser back", async () => {
  const got = await ext.get("unhooked.site.x.hideHomeFeed", "unhooked.custom.reddit");
  return (
    got["unhooked.site.x.hideHomeFeed"] === false && got["unhooked.custom.reddit"].length === 1
  );
});

// Unsafe things in a file don't get in.
await paste(
  JSON.stringify({
    format: "unhooked-settings",
    version: 1,
    settings: {
      "unhooked.site.x.hideHomeFeed": true,
      "unhooked.site.x.redirectTo": "//evil.example/",
      "unhooked.paused": true,
      "unhooked.custom.x": [{ selector: "a{} body{display:none}", label: "Bad", at: 1 }],
    },
  }),
);
await page.click("#import");
await until("a file's usable settings are imported", async () => {
  const got = await ext.get("unhooked.site.x.hideHomeFeed");
  return got["unhooked.site.x.hideHomeFeed"] === true;
});
const after = await ext.get("unhooked.site.x.redirectTo", "unhooked.paused", "unhooked.custom.x");
check("a redirect off the site is dropped", after["unhooked.site.x.redirectTo"] === undefined);
check("Pause all isn't changed by a file", after["unhooked.paused"] === false);
check("a removal that escapes its CSS rule is dropped", after["unhooked.custom.x"] === undefined);

await close();
finish();
