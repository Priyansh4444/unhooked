// bun scripts/measure-layout.ts <url> '<label>=<selector>' ...
// Prints where each selector sits on the live page (1440×1000 window, in page pixels) and how
// many elements it matches. Used to keep src/ui/picker/sketches.ts true to the real sites and to
// spot hide selectors that no longer match. Needs CHROME_PATH; logged out unless you add a profile.
import puppeteer from "puppeteer-core";

const [url, ...specs] = process.argv.slice(2);
if (!url || !specs.length) {
  console.error("usage: bun scripts/measure-layout.ts <url> '<label>=<selector>' ...");
  process.exit(1);
}
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--lang=en-US"],
});
try {
  const page = await browser.newPage();
  // Several sites serve a bot check to a user agent that says "HeadlessChrome".
  await page.setUserAgent((await browser.userAgent()).replace("HeadlessChrome", "Chrome"));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.WAIT ?? 9000)));
  for (const spec of specs) {
    const at = spec.indexOf("=");
    const [label, selector] = [spec.slice(0, at), spec.slice(at + 1)];
    const found = await page.evaluate((selector) => {
      const rects = [...document.querySelectorAll(selector)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 4 && r.height > 4);
      if (!rects.length) return null;
      const x = Math.min(...rects.map((r) => r.left));
      const y = Math.min(...rects.map((r) => r.top + scrollY));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom + scrollY));
      return { box: [x, y, right - x, bottom - y].map(Math.round), count: rects.length };
    }, selector);
    console.log(
      `${label.padEnd(20)} ${found ? `[${found.box.join(", ")}] ×${found.count}` : "no visible match"}`,
    );
  }
} finally {
  await browser.close();
}
