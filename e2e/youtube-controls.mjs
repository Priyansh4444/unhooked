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

// ` and the player's button. The stub's theater button swallows its first click, as the real one
// does before the player has wired it up.
const FILL_KEY = "unhooked.site.youtube.fillTheater";
const FILL = (attrs = "") =>
  fixturePage(`<ytd-app is-watch-page><ytd-watch-flexy ${attrs}><div id="movie_player" style="position:relative;height:400px"><input id="typing">
    <div class="ytp-popup" id="menu" style="display:none">menu</div>
    <div class="ytp-right-controls-right" style="position:absolute;bottom:0;right:0"><button class="ytp-size-button" onclick="if (!window.wired) { window.wired = true; return; } document.querySelector('ytd-watch-flexy').toggleAttribute('theater')">theater</button></div>
    </div></ytd-watch-flexy></ytd-app>`);
const openFill = async (attrs = "") => {
  watchHtml = FILL(attrs);
  await watch.goto("https://www.youtube.com/watch?v=abc", { waitUntil: "load" });
  await watch.bringToFront();
  await watch.evaluate(() => document.dispatchEvent(new Event("yt-navigate-finish")));
  await watch.waitForSelector(".uh-fill-btn", { timeout: 4000 }).catch(() => {});
};
const fill = () =>
  watch.evaluate(() => {
    const button = document.querySelector(".uh-fill-btn");
    return {
      theater: document.querySelector("ytd-watch-flexy").hasAttribute("theater"),
      filled: /uh-fill-(theater|now)/.test(document.documentElement.className),
      pressed: button?.getAttribute("aria-pressed"),
      shown: button ? getComputedStyle(button).display !== "none" : false,
      beforeTheater: button?.nextElementSibling?.classList.contains("ytp-size-button"),
      native: button?.hasAttribute("title"),
      tip: document.querySelector(".uh-fill-tip")?.textContent ?? null,
    };
  });
const untilFill = async (test) => {
  for (let tries = 0; tries < 40 && !test(await fill()); tries++) await sleep(100);
  return fill();
};
const isOn = (s) => s.theater && s.filled && s.pressed === "true";
const isOutOfTheater = (s) => !s.theater && !s.filled && s.pressed === "false";

await openFill();
let filling = await fill();
check("the button sits beside the theater button", filling.shown && filling.beforeTheater);
check("and nothing is filled to begin with", isOutOfTheater(filling), JSON.stringify(filling));
await watch.keyboard.press("Backquote");
check("` fills the window", isOn(await untilFill(isOn)));
await watch.keyboard.press("Backquote");
check("` again goes back", isOutOfTheater(await untilFill(isOutOfTheater)));
await watch.click(".uh-fill-btn");
check("the button fills it", isOn(await untilFill(isOn)));
await watch.click(".uh-fill-btn");
check("and goes back", isOutOfTheater(await untilFill(isOutOfTheater)));

await watch.mouse.move(0, 0);
await watch.hover(".uh-fill-btn");
filling = await untilFill((s) => s.tip);
check("hovering shows a tooltip with its key", filling.tip === "Fill the window`", filling.tip);
check("instead of the browser's own", !filling.native);
await watch.mouse.move(0, 0);
check("and it leaves with the pointer", (await untilFill((s) => !s.tip)).tip === null);

await watch.keyboard.press("Backquote");
await untilFill(isOn);
await watch.evaluate(() => (document.querySelector("#menu").style.display = "block"));
await watch.keyboard.press("Escape");
await sleep(150);
check("Esc closes a menu first", isOn(await fill()));
await watch.evaluate(() => (document.querySelector("#menu").style.display = "none"));
await watch.keyboard.press("Escape");
check("then goes back", isOutOfTheater(await untilFill(isOutOfTheater)));

await watch.keyboard.press("Backquote");
await untilFill(isOn);
await watch.click(".ytp-size-button");
filling = await untilFill((s) => !s.theater && s.pressed === "false");
check("T steps out of it", !filling.theater && filling.pressed === "false");
await watch.click(".ytp-size-button");
check("and T comes back to it", isOn(await untilFill(isOn)));
await watch.click(".ytp-size-button");
await untilFill((s) => !s.theater);
await watch.keyboard.press("Backquote");
check("` also comes back to it", isOn(await untilFill(isOn)));
await openFill();
check("a reload keeps it", isOn(await untilFill(isOn)));
await watch.keyboard.press("Backquote");
await untilFill((s) => !s.filled);

await openFill("theater");
await watch.keyboard.press("Backquote");
check("in theater already, ` fills", isOn(await untilFill(isOn)));
await watch.keyboard.press("Backquote");
await untilFill((s) => !s.filled);
filling = await fill();
check("and going back stays in the theater you chose", filling.theater && !filling.filled);

await openFill();
await watch.focus("#typing");
await watch.keyboard.press("Backquote");
await sleep(150);
filling = await fill();
check("typing isn't taken", !filling.theater, JSON.stringify(filling));
check(
  "the character is typed",
  (await watch.evaluate(() => document.querySelector("#typing").value)) === "`",
);
await watch.evaluate(() => document.activeElement.blur());
await watch.keyboard.down("Shift");
await watch.keyboard.press("Backquote");
await watch.keyboard.up("Shift");
await sleep(150);
check("Shift+` isn't it", !(await fill()).theater);

await watch.keyboard.press("Backquote");
await untilFill(isOn);
await ext.set({ "unhooked.paused": true });
await untilFill((s) => !s.theater);
filling = await fill();
check("Pause all goes back", !filling.theater, JSON.stringify(filling));
check("and takes the button away", !filling.shown);
await watch.keyboard.press("Backquote");
await sleep(150);
check("and ` does nothing", !(await fill()).theater);
await ext.set({ "unhooked.paused": false });
check("resuming fills again", isOn(await untilFill(isOn)));
await watch.keyboard.press("Backquote");
await untilFill(isOutOfTheater);

await ext.set({ [FILL_KEY]: true });
check("the switch fills it too", isOn(await untilFill(isOn)));
await watch.keyboard.press("Backquote");
check("and ` turns the switch off", isOutOfTheater(await untilFill(isOutOfTheater)));
check(
  "for good",
  await (async () => {
    await openFill();
    return isOutOfTheater(await fill());
  })(),
);

await close();
finish();
