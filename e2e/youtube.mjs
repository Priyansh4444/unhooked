// Live YouTube scenarios (needs network): focus mode must only affect watch pages in theater mode.
import { createChecker, gotoYT, launch, press, sleep, ytState } from "./lib.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();
const page = await newPage();
page.on("pageerror", (e) => console.log("pageerror", String(e.message).slice(0, 120)));

const toggle = () => press(page, "`");
const state = async (label) => {
  const s = await ytState(page);
  console.log(
    "   ",
    label.padEnd(30),
    JSON.stringify({
      url: s.url,
      theater: s.theater,
      flexyHidden: s.flexyHidden,
      sec: s.secondary?.display,
      mast: s.masthead?.opacity,
      ph: s.player?.h,
      cls: s.htmlClass,
    }),
  );
  return s;
};
const waitState = async (predicate, ms = 15000) => {
  const start = Date.now();
  let s;
  while (Date.now() - start < ms) {
    s = await ytState(page);
    if (predicate(s)) return s;
    await sleep(300);
  }
  return s;
};
const badge = () => ext.badge("youtube.com");

console.log("== home page");
await gotoYT(page, "https://www.youtube.com/");
let s = await state("home initial");
await toggle();
await sleep(1000);
s = await state("home, focus toggled ON");
check(
  "home: masthead stays visible with focus ON",
  s.masthead.opacity === "1",
  JSON.stringify(s.masthead),
);
check("home: html flag set", s.htmlClass.includes("uh-focus-youtube"));
check("badge ON", (await badge()) === "ON", String(await badge()));

console.log("== SPA: home -> search results -> video (focus ON)");
await page.type("input[name=search_query]", "me at the zoo");
await page.keyboard.press("Enter");
s = await waitState((x) => x.url.startsWith("/results"), 20000);
await sleep(3000);
s = await state("search results");
check(
  "results page unaffected by focus",
  s.masthead.opacity === "1" && s.url.startsWith("/results"),
  JSON.stringify(s),
);
// The search box keeps focus after typing, and focus inside the header deliberately reveals it.
await page.evaluate(() => {
  document.activeElement?.blur();
  document.querySelector('a#video-title[href^="/watch?v="]')?.click();
});
s = await waitState(
  (x) => x.url.startsWith("/watch") && x.theater === true && x.masthead?.opacity === "0",
  25000,
);
await sleep(800);
s = await state("watch via SPA");
check("auto theater after SPA nav", s.theater === true);
check("masthead hidden in focus", s.masthead.opacity === "0", JSON.stringify(s.masthead));
check("secondary hidden", s.secondary.display === "none");
check("player fills viewport", s.player.h === 900, JSON.stringify(s.player));

console.log("== leave theater with 't'");
await page.keyboard.press("t");
await sleep(1500);
s = await state("after t");
check("theater off", s.theater === false);
check("masthead visible again", s.masthead.opacity === "1", JSON.stringify(s.masthead));
check("secondary visible again", s.secondary.display !== "none", JSON.stringify(s.secondary));
check(
  "player not forced to 100vh",
  s.player.h !== 900 || s.player.w < 1400,
  JSON.stringify(s.player),
);
await page.keyboard.press("t");
await sleep(1500);
s = await state("after t again");
check("re-enter theater re-focuses", s.theater === true && s.masthead.opacity === "0");

console.log("== SPA: video -> home (focus ON)");
await page.evaluate(() => document.querySelector("a#logo")?.click());
// the URL changes before YouTube swaps the page: wait for the watch page to be gone
s = await waitState((x) => x.url === "/" && x.flexyHidden !== false, 15000);
await sleep(1500);
s = await state("home after SPA");
check("home normal after leaving video", s.masthead.opacity === "1", JSON.stringify(s.masthead));

console.log("== back to video, toggle OFF restores theater");
await page.goBack();
await sleep(3500);
await state("back");
await toggle();
await sleep(2500);
s = await state("after toggle OFF");
check("html flag cleared", !s.htmlClass.includes("uh-focus-youtube"));
check("masthead visible", s.masthead.opacity === "1");
check("no badge when off", (await badge()) === "", String(await badge()));

console.log("== reload with focus ON persists (tab mode)");
await toggle();
await sleep(1500);
await gotoYT(page, "https://www.youtube.com/watch?v=jNQXAC9IVRw");
await waitState((x) => x.theater === true && x.masthead?.opacity === "0", 20000);
s = await state("after reload");
check(
  "focus restored after reload",
  s.theater === true && s.masthead.opacity === "0",
  JSON.stringify(s),
);

await close();
finish();
