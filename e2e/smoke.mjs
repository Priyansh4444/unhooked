// The extension loads, its background answers, and content scripts reach a page.
import { createChecker, launch, press, sleep, stub } from "./lib.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

check("background answers through the bridge", (await ext.get("nothing")) !== undefined);
await ext.set({ smoke: 1 });
check("storage round-trips", (await ext.get("smoke")).smoke === 1);

// excalidraw's content script is the smallest one: Ctrl+B toggles a class on <html>
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
  page.evaluate(() => document.documentElement.classList.contains("uh-focus-excalidraw"));
check("content script not active before toggle", !(await active()));
await press(page, "Control+b");
await sleep(1000);
check("Ctrl+B reaches the content script and the background", await active());
check(
  "badge says ON",
  (await ext.badge("excalidraw.com")) === "ON",
  String(await ext.badge("excalidraw.com")),
);
await close();
finish();
