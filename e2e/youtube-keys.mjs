// Mixing the focus key (`) with YouTube's own theater key (t) in both orders must leave a clean layout.
import { createChecker, gotoYT, launch, press, sleep } from "./lib.mjs";
const { newPage, close } = await launch();
const { check, finish } = createChecker();
const page = await newPage();

const layout = () =>
  page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) };
    };
    return {
      theater: document.querySelector("ytd-watch-flexy")?.hasAttribute("theater"),
      cls: document.documentElement.classList.contains("uh-focus-youtube"),
      masthead: r("#masthead-container"),
      pageManager: r("ytd-page-manager"),
      player: r("#movie_player"),
      video: r("#movie_player video"),
    };
  });
const settle = async (pred, ms = 8000) => {
  const t0 = Date.now();
  let l;
  while (Date.now() - t0 < ms) {
    l = await layout();
    if (pred(l)) return l;
    await sleep(300);
  }
  return l;
};
const pause = () => page.evaluate(() => document.querySelector("video")?.pause());

console.log("== ` then t: leaving theater must give the normal page back");
await gotoYT(page, "https://www.youtube.com/watch?v=jNQXAC9IVRw");
await settle((l) => l.player?.h > 100);
await press(page, "`");
let l = await settle((l) => l.theater && l.cls);
console.log("   focus on  ", JSON.stringify(l));
await press(page, "t");
l = await settle((l) => l.theater === false);
await sleep(1000);
l = await layout();
console.log("   t pressed ", JSON.stringify(l));
check("theater is off", l.theater === false);
check(
  "page content sits below the header, not under it",
  l.pageManager.top >= l.masthead.h - 1,
  JSON.stringify(l),
);
await press(page, "t");
await settle((l) => l.theater);
await press(page, "`");
await sleep(500);

console.log("== t then `: the video must fill the whole player");
await gotoYT(page, "https://www.youtube.com/watch?v=jNQXAC9IVRw");
await settle((l) => l.player?.h > 100);
if (!(await layout()).theater) await press(page, "t");
await settle((l) => l.theater && !l.cls);
await pause();
l = await layout();
console.log("   theater   ", JSON.stringify(l));
await press(page, "`");
l = await settle((l) => l.cls && l.player.h >= 890);
await sleep(1500);
l = await layout();
console.log("   focus on  ", JSON.stringify(l));
check("player fills the viewport", l.player.h >= 890, JSON.stringify(l));
check(
  "video fills the player (no gap underneath)",
  l.video.h >= l.player.h - 2,
  `video ${l.video.h} vs player ${l.player.h}`,
);

await close();
finish();
