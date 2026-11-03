// The time tracker counting real tabs, and the page that shows what it counted.
import { BROWSER, createChecker, launch, sleep, stub } from "./lib.mjs";
import { dateKey } from "../src/time/tracker.ts";

const { browser, newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const until = async (name, condition, ms = 6000) => {
  const start = Date.now();
  let ok = false;
  while (!ok && Date.now() - start < ms) {
    ok = await condition().catch(() => false);
    if (!ok) await sleep(100);
  }
  check(name, ok);
};
const spentOn = async (host) => {
  const days = await ext.timeDays();
  return days.reduce(
    (sum, day) =>
      sum + Object.values(day.hosts[host] ?? {}).reduce((total, seconds) => total + seconds, 0),
    0,
  );
};

// ---- counting -----------------------------------------------------------------------------------
await ext.timeSeed([]);
const page = "<!doctype html><title>a page</title><p>hello</p>";
const x = await newPage();
await stub(x, [["https://twitter.com/", page]]);
const other = await newPage();
await stub(other, [["https://www.example.org/", page]]);
await x.goto("https://twitter.com/home", { waitUntil: "load" });
await other.goto("https://www.example.org/", { waitUntil: "load" });

await x.bringToFront();
await ext.timeDays();
const behindAtSwitch = await spentOn("example.org"); // it was in front until a moment ago
await until("time on the front tab is counted", async () => (await spentOn("x.com")) >= 1);
check("under the site's one name, whichever address it's on", (await spentOn("twitter.com")) === 0);
check("a tab behind it isn't counted", (await spentOn("example.org")) - behindAtSwitch < 0.5);

await other.bringToFront();
await ext.timeDays();
const xAtSwitch = await spentOn("x.com");
await until("the new front tab takes over", async () => (await spentOn("example.org")) >= 1);
check("and the old one stops", (await spentOn("x.com")) - xAtSwitch < 0.5);

await ext.set({ "unhooked.time.ignored": ["example.org"] });
await sleep(200);
const skipped = await spentOn("example.org");
await sleep(1200);
check("a site left out stops counting", (await spentOn("example.org")) - skipped < 0.5);
await ext.set({ "unhooked.time.ignored": [] });

await ext.set({ "unhooked.time.enabled": false });
await sleep(200);
const before = await spentOn("example.org");
await sleep(1200);
check("turning it off stops counting", (await spentOn("example.org")) - before < 0.5);
await ext.set({ "unhooked.time.enabled": true });

// Accuracy: what's counted is what passed on the clock.
await ext.timeSeed([]);
await x.bringToFront();
await ext.timeDays();
const before2 = await spentOn("x.com");
const clockStart = Date.now();
await sleep(3000);
const counted = (await spentOn("x.com")) - before2;
const elapsed = (Date.now() - clockStart) / 1000;
check(
  "the count matches the clock to within half a second",
  Math.abs(counted - elapsed) < 0.5,
  `counted ${counted}, clock ${elapsed}`,
);
await sleep(3000);
const state = await ext.timeState();
const live = state.open["x.com"];
check("the visit in progress is being timed", live?.seconds >= 5, JSON.stringify(state));
check(
  "and matches the time counted",
  Math.abs(live.seconds - (await spentOn("x.com"))) < 1,
  `${live?.seconds}`,
);
await other.bringToFront();
await ext.timeDays();
check("looking away doesn't end it", (await ext.timeState()).open["x.com"]?.start === live.start);

// A page reading everything mustn't be handed a year of browsing.
const keys = await other.evaluate(() => Object.keys(localStorage));
check("nothing is left in the page", keys.length === 0);
check(
  "nothing reaches extension storage that content scripts read",
  Object.keys(await ext.get(null)).every((key) => !/^\d{4}-/.test(key) && !key.includes("days")),
);

// ---- the page (Chrome only: Firefox will not let automation open extension pages) ---------------
if (BROWSER !== "chrome") {
  await close();
  finish();
}

const hours = (from, to, seconds) =>
  Object.fromEntries(Array.from({ length: to - from }, (_, i) => [from + i, seconds]));
const record = (daysAgo, hosts) => ({ date: dateKey(Date.now() - daysAgo * 86_400_000), hosts });
await ext.set({ "unhooked.time.enabled": false }); // keep the numbers still while testing them
const session = (host, daysAgo, seconds) => {
  const start = Date.now() - daysAgo * 86_400_000 - 600_000;
  return { host, start, end: start + seconds * 1000, seconds };
};
const withSessions = (entry, sessions) => ({ ...entry, sessions });
await ext.timeSeed([
  record(13, {}),
  withSessions(record(0, { "x.com": hours(8, 10, 1800), "example.org": hours(9, 10, 900) }), [
    session("x.com", 0, 3600),
    session("example.org", 0.2, 900),
  ]),
  withSessions(record(1, { "x.com": hours(20, 22, 3600), "youtube.com": hours(21, 22, 1800) }), [
    session("x.com", 1, 300),
    session("x.com", 1.2, 45),
    session("youtube.com", 1.4, 1800),
  ]),
  record(3, { "<b>weird</b>.example": hours(10, 11, 600), "example.org": hours(10, 11, 1200) }),
  record(10, { "x.com": hours(9, 11, 3600) }),
]);

const worker = await browser.waitForTarget((t) => t.type() === "service_worker");
const url = `chrome-extension://${new URL(worker.url()).host}/ui/time/index.html`;
const app = await newPage({ width: 1280, height: 900 });
const errors = [];
app.on("pageerror", (error) => errors.push(error.message));
await app.goto(url, { waitUntil: "load" });
await app.bringToFront();

const text = (selector) => app.$eval(selector, (el) => el.textContent);
const rows = () => app.$$eval("#sites li", (items) => items.map((li) => li.dataset.host));

await until(
  "the total counts up to its real value",
  async () => (await text("#hero")) === "4h 15m",
);
check("it says what the number is", (await text("#heroNote")) === "online in the last 7 days");
check(
  "it compares with the time before",
  (await text("#heroCompare")) === "2h 15m more than the 7 days before",
);
check(
  "sites are ranked",
  (await rows()).join() === "x.com,example.org,youtube.com,<b>weird</b>.example",
);
check(
  "a site's name is shown as text, never as markup",
  await app.$eval("#sites li:last-child .site-name", (el) => el.children.length === 0),
);
check("the tiles agree", (await text("#tileSites")) === "4");

// Sessions, worked out by hand from what was seeded: 3600, 900, 300, 45 and 1800 seconds.
await until("sessions are counted", async () => (await text("#sessionCount")) === "5");
await until("with their average", async () => (await text("#sessionAverage")) === "22m");
check("and median", (await text("#sessionMedian")) === "median 15m");
await until("the longest", async () => (await text("#sessionLongest")) === "1h");
await until("the shortest", async () => (await text("#sessionShortest")) === "45s");
await until("and time in focus", async () => (await text("#sessionFocused")) === "1h 45m");
check("as a share", (await text("#sessionFocusedNote")).startsWith("95%"));
check("the longest says what and when", (await text("#sessionLongestNote")).startsWith("x.com · "));
await until(
  "lengths are sorted into groups",
  async () =>
    (await app.$$eval("#buckets .count", (counts) => counts.map((c) => c.textContent))).join() ===
    "1,,1,1,1,1",
);
check(
  "every site has its numbers",
  (
    await app.$$eval("#siteNumbers tr:first-child td", (cells) => cells.map((c) => c.textContent))
  ).join() === "x.com,3h,3,21m,45s,1h",
);
check(
  "a site with no sessions yet says so rather than showing zero",
  (await app.$$eval("#siteNumbers tr:last-child td", (cells) => cells[2].textContent)) === "–",
);
const chart = "#timeline";
check("a week has seven points", (await app.$eval(chart, (el) => el.dataset.count)) === "7");
await until(
  "the line is drawn, with its gradient under it",
  () =>
    app.$eval(chart, (el) => {
      const line = el.querySelector(".line-stroke").getAttribute("d");
      const area = el.querySelector(".line-area").getAttribute("d");
      return line.startsWith("M") && line.includes("C") && area.endsWith("Z");
    }),
  3000,
);
const fill = await app.$eval(`${chart} .line-area`, (el) => {
  const gradient = document.querySelector(el.getAttribute("fill").slice(4, -1));
  return [...gradient.children].map((stop) => getComputedStyle(stop).stopColor);
});
check(
  "the gradient stays on the scheme's amber",
  fill.every((color) => color === "rgb(214, 162, 78)"),
  fill.join(),
);
check(
  "today, not over yet, is the one point in red",
  await app.$eval(`${chart} .line-end`, (el) => getComputedStyle(el).fill === "rgb(227, 23, 12)"),
);
await until(
  "nothing is left animating out of place",
  () =>
    app.$eval(chart, (el) => {
      const box = el.getBoundingClientRect();
      const line = el.querySelector(".line-stroke").getBoundingClientRect();
      return line.bottom <= box.bottom && line.top >= box.top;
    }),
  3000,
);

// Hover and keyboard read the same values, and the pointer only has to find the x.
const pointX = async (index, of = 7) =>
  app.$eval(
    chart,
    (el, [index, of]) => {
      const box = el.getBoundingClientRect();
      const left = box.left + 40;
      return [left + ((box.width - 54) * index) / (of - 1), box.top + 8];
    },
    [index, of],
  );
const [yesterdayX, nearTop] = await pointX(5);
await app.mouse.move(yesterdayX, nearTop);
await until("pointing above a day still finds it", async () =>
  (await text("#tipValue")).startsWith("2h 30m"),
);
check(
  "the tooltip is visible",
  await app.$eval("#tip", (el) => !el.hidden && !el.classList.contains("is-away")),
);
check(
  "with a line marking the day",
  await app.$eval(`${chart} .line-hair`, (el) => el.style.opacity === "1"),
);
await app.mouse.move(5, 5);
await until("and leaves with the pointer", () =>
  app.$eval("#tip", (el) => el.classList.contains("is-away")),
);
await app.focus(chart);
await until("focus lands on the latest point", async () =>
  (await text("#tipLabel")).endsWith("so far"),
);
await app.keyboard.press("ArrowLeft");
await until("arrow keys walk the line", async () => (await text("#tipValue")).startsWith("2h 30m"));
check(
  "with one tab stop for the whole chart",
  await app.$eval(
    chart,
    (el) => el.tabIndex === 0 && el.querySelectorAll("[tabindex]").length === 0,
  ),
);
check(
  "and a description for a screen reader",
  (await app.$eval(chart, (el) => el.getAttribute("aria-label"))).includes("2h 30m"),
);
await app.keyboard.press("Tab");
await app.mouse.move(5, 5);

// The heat grid.
check("the grid has every hour of the week", (await app.$$("#heat .cell")).length === 168);
check(
  "hours with time stand out",
  (await app.$$("#heat .cell.has-time")).length === 5,
  String((await app.$$("#heat .cell.has-time")).length),
);

// Ranges reuse the marks.
await app.click('[data-range="30"]');
await until(
  "a longer range adds what's further back",
  async () => (await text("#hero")) === "6h 15m",
);
await app.click('[data-range="today"]');
await until("today shows today", async () => (await text("#hero")) === "1h 15m");
check("drawn by the hour", (await app.$eval(chart, (el) => el.dataset.count)) === "24");
check(
  "with no line into hours that haven't happened",
  Number(await app.$eval(chart, (el) => el.dataset.plotted)) === new Date().getHours() + 1,
);
await app.click('[data-range="7"]');
await until("back to the week", async () => (await text("#hero")) === "4h 15m");
const markLeft = await app.$eval("#rangesMark", (el) => el.getBoundingClientRect().left);
const pressedLeft = await app.$eval('[data-range="7"]', (el) => el.getBoundingClientRect().left);
await sleep(400);
check(
  "the range's underline follows",
  Math.abs(
    (await app.$eval("#rangesMark", (el) => el.getBoundingClientRect().left)) - pressedLeft,
  ) < 2,
  String(markLeft),
);

// One site.
await app.click('#sites li[data-host="x.com"] button');
await until("choosing a site narrows everything", async () => (await text("#hero")) === "3h");
check("the list stays, to choose another", (await rows()).length === 4);
check("it's named", (await text("#heroNote")) === "on x.com in the last 7 days");
await until("sessions narrow with it", async () => (await text("#sessionCount")) === "3");
await until("to that site's", async () => (await text("#sessionAverage")) === "21m");
await app.click("#clearSite");
await until("and it can be cleared", async () => (await text("#hero")) === "4h 15m");

// Sharing.
await app.click("#openShare");
await until("Share opens its dialog", () => app.$eval("#shareDialog", (el) => el.open));
const size = await app.$eval("#card", (el) => [el.width, el.height]);
check("the card is 16:9, at twice the size", size.join() === "2400,1350");
const drawn = await app.$eval("#card", (el) => {
  const { data } = el.getContext("2d").getImageData(0, 0, el.width, el.height);
  let bright = 0;
  let amber = 0;
  for (let i = 0; i < data.length; i += 400) {
    if (data[i] > 200 && data[i + 1] > 200) bright++;
    if (data[i] > 180 && data[i + 1] > 120 && data[i + 2] < 110) amber++;
  }
  return { bright, amber };
});
check("it has text and marks on it", drawn.bright > 50 && drawn.amber > 50, JSON.stringify(drawn));
const picture = () => app.$eval("#card", (el) => el.toDataURL("image/png").length);
const withNames = await picture();
await app.click(".share-actions .foot-switch");
await sleep(100);
check("site names can be left out", (await picture()) !== withNames);
await app.evaluate(() => {
  navigator.clipboard.write = async () => {
    window.copiedImage = true;
  };
});
const intent = browser.waitForTarget((t) => t.url().includes("x.com/intent/post"), {
  timeout: 5000,
});
await app.click("#postX");
const compose = await intent;
await until("Post on X copies the picture first", () =>
  app.evaluate(() => window.copiedImage === true),
);
const said = decodeURIComponent(compose.url());
check("and opens a post with the words in", said.includes("4h 15m online in the last 7 days"));
check(
  "without naming sites when they're left out",
  !said.includes("x.com took") && !said.includes("% of it"),
);
await (await compose.page())?.close();
await app.bringToFront();
await until("it says to paste", async () => (await text("#shareStatus")).includes("Paste"));
await app.click("#closeShare");
await until("the dialog closes", () => app.$eval("#shareDialog", (el) => !el.open));

// Forgetting a site, and changing your mind.
await app.click('#sites li[data-host="youtube.com"] button');
await until("a site is chosen", async () => (await text("#clearSite")) === "youtube.com");
await app.click("#forgetSite");
await until("Forget removes its history", async () => !(await rows()).includes("youtube.com"));
check(
  "and stops counting it",
  (await ext.get("unhooked.time.ignored"))["unhooked.time.ignored"].includes("youtube.com"),
);
check("the page says where to bring it back", (await text("#ignored")).includes("youtube.com"));
await app.click("#status button");
await until("Undo brings both back", async () => (await rows()).includes("youtube.com"));
check(
  "counting it again",
  ((await ext.get("unhooked.time.ignored"))["unhooked.time.ignored"] ?? []).length === 0,
);

await ext.set({ "unhooked.time.enabled": true }); // the page is in front, which never counts
await sleep(200);
await app.click("#eraseAll");
await until("Erase everything empties it", async () => (await rows()).length === 0);
check("and explains the empty page", (await text("#notice")).startsWith("Nothing yet"));
await until("the number comes down to nothing", async () => (await text("#hero")) === "0s");
await app.click("#status button");
await until("Undo puts it back too", async () => (await rows()).length === 4);

// Reduced motion: every number lands at once.
await app.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await app.click('[data-range="30"]');
check("with reduced motion, numbers land at once", (await text("#hero")) === "6h 15m");
await app.emulateMediaFeatures([]);

// Narrow windows.
await app.setViewport({ width: 390, height: 800 });
await sleep(300);
check(
  "no sideways scrolling on a phone-sized window",
  await app.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
check("no errors on the page", errors.length === 0, errors.join("; "));

await close();
finish();
