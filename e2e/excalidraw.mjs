// On the real excalidraw.com: the site's switch hides the toolbars and survives a reload.
import { createChecker, launch, sleep } from "./lib.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const page = await newPage();
await page.goto("https://excalidraw.com/", { waitUntil: "load", timeout: 60000 });
await page.waitForSelector(".layer-ui__wrapper", { timeout: 30000 });
await sleep(1000);
const uiDisplay = () =>
  page.evaluate(() => getComputedStyle(document.querySelector(".layer-ui__wrapper")).display);

check("toolbars visible initially", (await uiDisplay()) !== "none");
await ext.set({ excalidraw_canvas_only: true });
await sleep(800);
check("the switch hides them", (await uiDisplay()) === "none");
await page.reload({ waitUntil: "load" });
await page.waitForSelector(".layer-ui__wrapper", { hidden: false });
await sleep(2500);
check("still hidden after a reload", (await uiDisplay()) === "none");
await ext.set({ excalidraw_canvas_only: false });
await sleep(800);
check("the switch restores them", (await uiDisplay()) !== "none");

await close();
finish();
