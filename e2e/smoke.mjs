// The extension loads, its background answers, and content scripts reach a page.
import { createChecker, launch, sleep, stub } from "./lib.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

check("background answers through the bridge", (await ext.get("nothing")) !== undefined);
await ext.set({ smoke: 1 });
check("storage round-trips", (await ext.get("smoke")).smoke === 1);

// excalidraw's content script is the smallest one: its site switch sets a class on <html>
const page = await newPage();
await stub(page, [
  [
    "https://excalidraw.com/",
    "<!doctype html><body><div class='layer-ui__wrapper'>ui</div></body>",
  ],
]);
await page.goto("https://excalidraw.com/", { waitUntil: "load" });
await sleep(1500);
const active = () =>
  page.evaluate(() => document.documentElement.classList.contains("uh-canvas-only"));
check("content script not active before the switch", !(await active()));
await ext.set({ excalidraw_canvas_only: true });
await sleep(500);
check("the switch reaches the content script", await active());
await close();
finish();
