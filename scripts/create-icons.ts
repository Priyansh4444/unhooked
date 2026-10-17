// bun scripts/create-icons.ts — renders icons/icon.svg to the PNG sizes the manifest lists.
// Needs CHROME_PATH (any Chromium); the PNGs are committed, so this only runs after a redesign.
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";
import { ICONS } from "../build/manifest.ts";

const svg = await readFile("icons/icon.svg", "utf8");
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    `<style>body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
  );
  for (const [size, file] of Object.entries(ICONS)) {
    await page.setViewport({ width: Number(size), height: Number(size) });
    await page.screenshot({ path: `icons/${file}`, omitBackground: true });
  }
} finally {
  await browser.close();
}
