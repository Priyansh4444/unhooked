// Excalidraw focus mode on the real excalidraw.com: Ctrl+B hides the UI, state persists per tab.
import { mkdirSync } from "node:fs";
import { createChecker, launch, press, sleep } from "./lib.mjs";

const SHOTS = process.env.SHOTS ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });
const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const page = await newPage();
await page.goto("https://excalidraw.com/", { waitUntil: "load", timeout: 60000 });
await page.waitForSelector(".layer-ui__wrapper", { timeout: 30000 });
await sleep(1000);
const uiDisplay = (p = page) =>
  p.evaluate(() => getComputedStyle(document.querySelector(".layer-ui__wrapper")).display);
const badge = () => ext.badge("excalidraw.com");

check("UI visible initially", (await uiDisplay()) !== "none");
await page.screenshot({ path: `${SHOTS}/excalidraw-1-normal.png` });
await press(page, "Control+b");
await sleep(1000);
check("Ctrl+B hides the UI", (await uiDisplay()) === "none");
check("badge ON", (await badge()) === "ON", String(await badge()));
await page.screenshot({ path: `${SHOTS}/excalidraw-2-focus.png` });

await page.reload({ waitUntil: "load" });
await page.waitForSelector(".layer-ui__wrapper", { hidden: false });
await sleep(2500);
check("focus survives reload (tab mode)", (await uiDisplay()) === "none");

await press(page, "Control+b");
await sleep(1000);
check("Ctrl+B again restores the UI", (await uiDisplay()) !== "none");
check("no badge when off", (await badge()) === "", String(await badge()));

const other = await newPage();
await other.goto("https://excalidraw.com/", { waitUntil: "load" });
await other.waitForSelector(".layer-ui__wrapper");
await press(page, "Control+b");
await sleep(1000);
check("tab mode: other tab unaffected", (await uiDisplay(other)) !== "none");

await close();
finish();
