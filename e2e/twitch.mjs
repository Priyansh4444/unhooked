// Twitch chat link pills against a stubbed twitch.tv chat page. Screenshots go to $SHOTS.
import { mkdirSync } from "node:fs";
import { BROWSER, count, createChecker, launch, sleep, stub, twitchChatPage } from "./lib.mjs";

const SHOTS = process.env.SHOTS ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });
const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const messages = [
  ["viewer_one", "that clip is wild https://www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["gh_dev", "source is here https://github.com/Priyansh4444/Unhooked"],
  ["tweeter", "he said it https://x.com/jack/status/20"],
  ["redditor", "thread https://www.reddit.com/r/programming/"],
  ["spammer", "free stuff https://bit.ly/3abcdef"],
  ["pic_guy", "look at this https://imgur.com/gallery/abc123 and https://i.imgur.com/Xy12zQ9.png"],
  ["app_dev", "deployed it https://something.lakebed.app/dashboard"],
  ["pr_dev", "review https://github.com/Priyansh4444/Unhooked/pull/12 please"],
  [
    "clipper",
    "ICANT https://www.twitch.tv/4hbunger/clip/SavageFunnyAsp",
    "https://www.twitch.tv/4hbunger/clip/SavageFunnyAsp",
  ],
  ["plain", "no links in this one, just vibes"],
  ["short", "hey https://x.com/jack ok"],
  ["wiki", "https://en.wikipedia.org/wiki/Elephant is the answer"],
];
const CHAT = twitchChatPage(messages);

const page = await newPage({ width: 900, height: 760 });
await stub(page, [["https://www.twitch.tv/", CHAT]]);
const open = async () => {
  await page.goto("https://www.twitch.tv/somestreamer", { waitUntil: "load" });
  await sleep(2500);
};
const heights = () =>
  page.$$eval(".chat-line__message", (lines) =>
    Object.fromEntries(
      lines.map((line) => [
        line.querySelector("span").textContent,
        line.getBoundingClientRect().height,
      ]),
    ),
  );
const clip = { x: 0, y: 0, width: 400, height: 560 };
const pills = () => count(page, ".uh-link-pill");

await ext.set({ twitch_link_pills: false });
await open();
await page.screenshot({ path: `${SHOTS}/twitch-1-before-pills-off.png`, clip });
const rawHeights = await heights();
const cardHeight = () => page.$eval(".chat-card", (el) => el.getBoundingClientRect().height);
const rawCard = await cardHeight();
check("pills off: raw anchors untouched", (await pills()) === 0);

await ext.set({ twitch_link_pills: true });
await open();
const pillHeights = await heights();
check(
  "a pill does not make its line taller (no layout shift)",
  Math.abs(pillHeights.short - rawHeights.short) < 0.1 &&
    Math.abs(pillHeights.plain - rawHeights.plain) < 0.1,
  `short ${rawHeights.short} -> ${pillHeights.short}`,
);
check(
  "the clip card keeps its height",
  Math.abs((await cardHeight()) - rawCard) < 0.1,
  `${rawCard} -> ${await cardHeight()}`,
);
const total = await pills();
check("links become pills", total === 12, `got ${total}`);
console.log(
  "   labels:",
  JSON.stringify(await page.$$eval(".uh-link-pill__label", (els) => els.map((e) => e.textContent))),
);
await page.screenshot({ path: `${SHOTS}/twitch-2-after-pills.png`, clip });

const labels = await page.$$eval(".uh-link-pill__label", (els) => els.map((e) => e.textContent));
check(
  "PR link label shows the PR number",
  labels.includes("Priyansh4444/Unhooked#12"),
  JSON.stringify(labels),
);
check(
  "Twitch's own clip card is left alone",
  await page.evaluate(() => {
    const card = document.querySelector(".chat-card a");
    return (
      !!card &&
      !card.classList.contains("uh-link-pill") &&
      card.textContent.includes("Clip title") &&
      !!card.querySelector("span")
    );
  }),
);

const hoverPill = async (index) => (await page.$$(".uh-link-pill"))[index].hover();
const card = () =>
  page.evaluate(() => {
    const el = document.getElementById("uh-twitch-hovercard");
    return !!el && !el.hidden;
  });
await hoverPill(1);
await sleep(1500);
check("hover opens preview card", await card());
await page.screenshot({
  path: `${SHOTS}/twitch-3-hovercard.png`,
  clip: { x: 0, y: 0, width: 760, height: 420 },
});
// A busy chat scrolls under a still mouse: the card must not close (or jump) because of that.
await page.evaluate(() => {
  const spacer = document.createElement("div");
  spacer.style.height = "120px";
  document.querySelector('[data-a-target="chat-scroller"]').prepend(spacer);
});
await sleep(800);
check("card stays open when chat moves under a still pointer", await card());
await page.evaluate(() =>
  document.querySelector('[data-a-target="chat-scroller"]').firstElementChild.remove(),
);
await page.mouse.move(700, 700);
await sleep(600);
check("hover card closes", !(await card()));

// turning pills off live puts every link back exactly as it was
const originalTexts = messages.flatMap(([, text]) => text.match(/https?:\/\/\S+/g) ?? []);
await ext.set({ twitch_link_pills: false });
await sleep(500);
check("pills off live: no pills left", (await pills()) === 0);
const restored = await page.$$eval("a.link-fragment", (els) => els.map((e) => e.textContent));
check(
  "pills off live: original link text restored",
  JSON.stringify(restored) === JSON.stringify(originalTexts),
  JSON.stringify(restored),
);
check(
  "pills off live: no leftover attributes",
  (await count(page, "a[data-uh-url], a[class*=uh-link]")) === 0,
);

const addLine = (html) =>
  page.evaluate((html) => {
    const line = document.createElement("div");
    line.className = "chat-line__message";
    line.innerHTML = html;
    document.querySelector('[data-a-target="chat-scroller"]').appendChild(line);
  }, html);
await addLine('new <a href="https://github.com/a/b">https://github.com/a/b</a>');
await sleep(300);
check("pills off: new links are not pillified", (await pills()) === 0);
await ext.set({ twitch_link_pills: true });
await sleep(500);
check("pills back on live", (await pills()) === total + 1);

// the URL log stays short, has no duplicates, and works with pills off
await ext.set({ twitch_link_pills: false, twitch_url_log: [] });
await sleep(300);
await page.evaluate(() => {
  const root = document.querySelector('[data-a-target="chat-scroller"]');
  for (let i = 0; i < 60; i++) {
    const line = document.createElement("div");
    line.className = "chat-line__message";
    line.innerHTML = `<a href="https://example.com/p${i % 40}">https://example.com/p${i % 40}</a>`;
    root.appendChild(line);
  }
});
await sleep(2500);
const log = (await ext.get("twitch_url_log")).twitch_url_log;
check("log works with pills off and is capped at 25", log.length === 25, `got ${log.length}`);
check("log has no duplicate urls", new Set(log.map((e) => e.url)).size === log.length);
await ext.set({ twitch_link_pills: true });
await open();

// the popup shows the log (Chrome only: Firefox won't let automation open extension pages)
if (BROWSER === "chrome") {
  const [worker] = (await page.browser().targets()).filter((t) => t.type() === "service_worker");
  const extId = new URL(worker.url()).host;
  const popup = await newPage({ width: 420, height: 760 });
  await popup.evaluateOnNewDocument(() => {
    const real = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (q) =>
      q?.active ? [{ id: 1, url: "https://www.twitch.tv/somestreamer" }] : real(q);
  });
  await popup.goto(`chrome-extension://${extId}/ui/popup/index.html`);
  await sleep(1500);
  const items = await count(popup, "#twitchLogList li:not(.log-empty)");
  check("popup shows logged chat URLs", items >= 5, `got ${items}`);
  await popup.screenshot({ path: `${SHOTS}/twitch-4-popup.png`, fullPage: true });
}

await close();
finish();
