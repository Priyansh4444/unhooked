// Twitter/X focus mode against a stubbed x.com page (X blocks automation and needs a login).
import { count, createChecker, launch, press, sleep, stub } from "./lib.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const reply = '<div role="group"><button aria-label="Reply">r</button></div>';
const PAGE = `<!doctype html><html><body>
<header role="banner">hdr</header><main role="main"><div><div data-testid="primaryColumn">
  <nav style="display:flex"><div data-testid="ScrollSnap-SwipeableList">tabs</div></nav>
  <div data-testid="cellInnerDiv"><article>tweet ${reply}</article></div>
  <div data-testid="cellInnerDiv"><article>tweet 2 ${reply}</article></div>
</div><div data-testid="sidebarColumn">side</div></div></main>
<script>setTimeout(()=>{history.pushState({}, "", "/home2"); document.body.appendChild(document.createElement("div"))}, 6000)</script>
</body></html>`;

const open = async () => {
  const page = await newPage();
  await stub(page, [["https://x.com/", PAGE]]);
  await page.goto("https://x.com/home", { waitUntil: "load" });
  await sleep(1500);
  return page;
};
const on = (page) => page.evaluate(() => document.documentElement.classList.contains("uh-focus-x"));
const display = (page, selector) =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)).display, selector);

const page = await open();
check("toggle button injected", (await count(page, "#uh-focus-x-toggle")) === 1);
check(
  "toggle button only in the header, once",
  await page.evaluate(() => {
    const buttons = document.querySelectorAll("#uh-focus-x-toggle");
    return buttons.length === 1 && !!buttons[0].closest("nav") && !buttons[0].closest("article");
  }),
);

await press(page, "Control+b");
await sleep(1200);
check("ctrl+b enables", await on(page));
check("sidebar hidden", (await display(page, '[data-testid="sidebarColumn"]')) === "none");
await page.click("#uh-focus-x-toggle");
await sleep(1000);
check("button disables", !(await on(page)));
check("sidebar back", (await display(page, '[data-testid="sidebarColumn"]')) !== "none");

// The layout switches act on their own, without focus.
check("focus is off before the switches", !(await on(page)));
const html = (name) =>
  page.evaluate((name) => document.documentElement.classList.contains(name), name);
const rule = (selector, property) =>
  page.evaluate((s, p) => getComputedStyle(document.querySelector(s))[p], selector, property);
await ext.set({ twitter_center_timeline: true, twitter_width: 60 });
await sleep(300);
check("Center timeline works without focus", await html("uh-x-center"));
check(
  "it centers the column",
  (await rule('div:has(> [data-testid="primaryColumn"])', "justifyContent")) === "center",
);
check(
  "it uses the chosen width",
  (await rule('[data-testid="primaryColumn"]', "maxWidth")) === "60%",
);
check(
  "centering leaves the navigation alone",
  (await display(page, 'header[role="banner"]')) !== "none",
);
await ext.set({ twitter_use_default_font: false, twitter_font_size: 20 });
await sleep(300);
check("Custom text size works without focus", await html("uh-x-font"));
await ext.set({ "unhooked.paused": true });
await sleep(300);
check("Pause all takes the layout off", !(await html("uh-x-center")) && !(await html("uh-x-font")));
await ext.set({ "unhooked.paused": false });
await sleep(300);
check("Resume puts it back", (await html("uh-x-center")) && (await html("uh-x-font")));
await ext.set({ "unhooked.site.x.enabled": false });
await sleep(300);
check("the site's switch takes the layout off too", !(await html("uh-x-center")));
await ext.set({
  "unhooked.site.x.enabled": true,
  twitter_center_timeline: false,
  twitter_use_default_font: true,
});
await sleep(300);
check("turning them off restores the page", !(await html("uh-x-center")));

await press(page, "Control+b");
await sleep(1000);
check(
  "Ctrl+B still hides the sidebar",
  (await display(page, '[data-testid="sidebarColumn"]')) === "none",
);

await sleep(5500);
check("survives SPA url change", (await on(page)) && page.url().endsWith("/home2"));

// Post page: back arrow + title row; replies below must not get a button.
await page.evaluate((reply) => {
  document.querySelector('[data-testid="primaryColumn"]').innerHTML = `
    <div style="position:sticky;top:0"><div style="display:flex;flex-direction:row;width:600px">
      <div><button data-testid="app-bar-back">b</button></div><h2 role="heading">Post</h2></div></div>
    <div data-testid="cellInnerDiv"><article>a ${reply}</article></div>
    <div data-testid="cellInnerDiv"><article>b ${reply}</article></div>`;
}, reply);
await sleep(600);
check(
  "post page: one button, in the header row, none in replies",
  await page.evaluate(() => {
    const buttons = document.querySelectorAll("#uh-focus-x-toggle");
    return (
      buttons.length === 1 &&
      !buttons[0].closest("article") &&
      !!buttons[0].parentElement.querySelector("h2")
    );
  }),
);

// No header at all: the button must disappear rather than land in the feed.
await page.evaluate((reply) => {
  document.querySelector('[data-testid="primaryColumn"]').innerHTML =
    `<div data-testid="cellInnerDiv"><article>x ${reply}</article></div>`;
}, reply);
await sleep(600);
check("no header: no button anywhere", (await count(page, "#uh-focus-x-toggle")) === 0);

await page.reload({ waitUntil: "load" });
await sleep(1500);
check("tab-mode state survives reload", await on(page));

// Global mode: the in-page button, Ctrl+B and every tab share one state (no tab "owns" it).
await ext.set({ twitter_persistence_mode: "global", twitter_state: { enabled: false } });
const [A, B] = [await open(), await open()];
const both = async () => [await on(A), await on(B)];
await A.bringToFront();
await A.click("#uh-focus-x-toggle");
await sleep(1200);
check("global: button in A turns on A and B", (await both()).every(Boolean), String(await both()));
await press(B, "Control+b");
await sleep(1200);
check(
  "global: Ctrl+B in B turns off A and B",
  (await both()).every((v) => !v),
  String(await both()),
);
await B.bringToFront();
await B.click("#uh-focus-x-toggle");
await sleep(1200);
check("global: button in B turns on A and B", (await both()).every(Boolean), String(await both()));

await close();
finish();
