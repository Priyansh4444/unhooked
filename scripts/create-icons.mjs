import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../icons/", import.meta.url));
await mkdir(directory, { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#102923"/><path d="M37 35v36c0 15 10 25 27 25s27-10 27-25V52" fill="none" stroke="#92edc6" stroke-width="12" stroke-linecap="round"/><path d="m79 31 10-10m10 22 10-3" stroke="#92edc6" stroke-width="7" stroke-linecap="round"/></svg>`;
await writeFile(`${directory}icon.svg`, svg);
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    `<style>body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`
  );
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.screenshot({ path: `${directory}icon-${size}.png`, omitBackground: true });
  }
} finally {
  await browser.close();
}
