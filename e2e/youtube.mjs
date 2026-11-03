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

await close();
finish();
