// Live YouTube, global persistence mode: state is shared across tabs and follows mode changes.
import { createChecker, gotoYT, launch, press, sleep } from "./lib.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();
await ext.set({ youtube_persistence_mode: "global", twitter_persistence_mode: "global" });
const focused = (page) =>
  page.evaluate(() => document.documentElement.classList.contains("uh-focus-youtube"));
const VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const a = await newPage();
await gotoYT(a, VIDEO);
const b = await newPage();
await gotoYT(b, VIDEO);
await press(a, "`");
await sleep(3000);
check("global: tab A focused", await focused(a));
check("global: tab B follows", await focused(b));

const c = await newPage();
await gotoYT(c, VIDEO);
await sleep(2000);
check("global: new tab C starts focused", await focused(c));

await press(b, "`");
await sleep(2500);
check("global: toggle off propagates", !(await focused(a)) && !(await focused(c)));

// switching mode -> tab: tabs re-pull (state in tab mode is per tab, none set => off)
await press(a, "`");
await sleep(1500);
await ext.set({ youtube_persistence_mode: "tab" });
await sleep(2000);
check("mode change to tab re-pulls (no tab state => off)", !(await focused(b)));

await close();
finish();
