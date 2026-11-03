// On the real YouTube (needs network): Fill the window only acts on a watch page in theater mode.
import { createChecker, gotoYT, launch, press, sleep, ytState } from "./lib.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();
const page = await newPage();
const VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const until = async (predicate, ms = 15000) => {
  const start = Date.now();
  let state;
  while (Date.now() - start < ms) {
    state = await ytState(page);
    if (predicate(state)) return state;
    await sleep(300);
  }
  return state;
};

await ext.set({ "unhooked.site.youtube.fillTheater": true });
await gotoYT(page, "https://www.youtube.com/");
let state = await ytState(page);
check("home: the header stays", state.masthead?.opacity !== "0", JSON.stringify(state.masthead));

await gotoYT(page, VIDEO);
await page.waitForSelector("#movie_player", { timeout: 30000 });
state = await until((s) => s.theater !== undefined);
if (state.theater) await press(page, "t");
state = await until((s) => !s.theater);
check("out of theater, the header stays", state.masthead?.opacity !== "0");

await press(page, "t");
state = await until((s) => s.theater && s.masthead?.opacity === "0");
check("in theater, the header hides", state.masthead?.opacity === "0");
const height = await page.evaluate(() => innerHeight);
check("and the player fills the window", state.player?.h === height, JSON.stringify(state.player));

await ext.set({ "unhooked.paused": true });
state = await until((s) => s.masthead?.opacity !== "0");
check("Pause all puts the header back", state.masthead?.opacity !== "0");
await ext.set({ "unhooked.paused": false });

await press(page, "t");
state = await until((s) => !s.theater);
check("leaving theater restores the page", state.masthead?.opacity !== "0");

// With the recommendations hidden, the video takes the width they left.
await ext.set({
  "unhooked.site.youtube.fillTheater": false,
  "unhooked.site.youtube.hideRelatedSidebar": false,
});
await page.setViewport({ width: 1440, height: 900 });
const WIDE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const boxes = () =>
  page.evaluate(() => {
    const width = (s) => document.querySelector(s)?.getBoundingClientRect().width ?? 0;
    return {
      player: width("#movie_player"),
      video: width("#movie_player video"),
      side: width("#secondary"),
    };
  });
const settleOn = async (test, ms = 8000) => {
  const start = Date.now();
  let seen = await boxes();
  while (!test(seen) && Date.now() - start < ms) {
    await sleep(250);
    seen = await boxes();
  }
  return seen;
};
await gotoYT(page, WIDE);
await page.waitForSelector("#movie_player video", { timeout: 30000 });
const narrow = await settleOn((b) => b.player > 500);
check("the column is there at first", narrow.side > 200, JSON.stringify(narrow));
await ext.set({ "unhooked.site.youtube.hideRelatedSidebar": true });
const wide = await settleOn((b) => b.video > narrow.video + 100);
check("hiding it gives the video the width", wide.video > narrow.video + 100, JSON.stringify(wide));
check("and the player follows", Math.abs(wide.video - wide.player) < 2, JSON.stringify(wide));
check("the empty column is gone", wide.side === 0);
await page.setViewport({ width: 1100, height: 900 });
const resized = await settleOn((b) => b.player <= 1100 && b.video <= 1100);
check(
  "it stays inside a smaller window",
  resized.player <= 1100 && resized.video <= 1100,
  JSON.stringify(resized),
);
await page.setViewport({ width: 1440, height: 900 });
await gotoYT(page, `${WIDE}&list=RDdQw4w9WgXcQ`);
await page.waitForSelector("ytd-watch-flexy[playlist]", { timeout: 20000 }).catch(() => {});
const withList = await settleOn((b) => b.side > 200);
check("a playlist keeps its column", withList.side > 200, JSON.stringify(withList));
await ext.set({ "unhooked.site.youtube.hidePlaylistSidebar": true });
const listHidden = await settleOn((b) => b.side === 0);
check("until it's hidden too", listHidden.side === 0, JSON.stringify(listHidden));
await ext.set({ "unhooked.site.youtube.hidePlaylistSidebar": false });
await gotoYT(page, WIDE);
await page.waitForSelector("#movie_player video", { timeout: 30000 });
await settleOn((b) => b.video > 1000);

await ext.set({ "unhooked.paused": true });
const paused = await settleOn((b) => b.side > 200 && b.video < wide.video);
check(
  "Pause all puts it back",
  paused.side > 200 && paused.video < wide.video,
  JSON.stringify(paused),
);
await ext.set({ "unhooked.paused": false });
await ext.set({ "unhooked.site.youtube.hideRelatedSidebar": false });

await close();
finish();
