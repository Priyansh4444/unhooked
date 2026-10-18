// bun scripts/live-login.ts — opens a visible browser on Unhooked's test profile, with a tab for
// each site's sign-in page. Log in yourself, then close the browser. The sessions stay in the
// profile (LIVE_PROFILE, default ~/.cache/unhooked-live-profile) for e2e/live.mjs to reuse.
// Nothing here sees your passwords: you type them into the real sites.
import puppeteer from "puppeteer-core";
import { homedir } from "node:os";
import { join } from "node:path";

const profile = process.env.LIVE_PROFILE ?? join(homedir(), ".cache", "unhooked-live-profile");
const SIGN_IN = [
  "https://accounts.google.com/ServiceLogin?service=youtube",
  "https://x.com/i/flow/login",
  "https://www.reddit.com/login/",
  "https://www.instagram.com/accounts/login/",
  "https://www.tiktok.com/login",
  "https://www.facebook.com/login/",
  "https://www.linkedin.com/login",
  "https://www.threads.com/login",
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  headless: false,
  userDataDir: profile,
  defaultViewport: null,
  args: ["--no-first-run", "--no-default-browser-check"],
});
const [first] = await browser.pages();
await first?.goto(SIGN_IN[0]!);
for (const url of SIGN_IN.slice(1)) await (await browser.newPage()).goto(url).catch(() => {});
console.log(`Log in to the sites you want tested, then close the browser.\nProfile: ${profile}`);
await new Promise((resolve) => browser.on("disconnected", resolve));
