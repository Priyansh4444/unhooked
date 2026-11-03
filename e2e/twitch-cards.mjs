// Hover cards for each kind of chat link, on a stubbed twitch.tv chat page. Needs network for
// the real GitHub / YouTube / X lookups. One screenshot per card goes to $SHOTS.
import { mkdirSync } from "node:fs";
import { count, createChecker, launch, sleep, stub, twitchChatPage } from "./lib.mjs";

const SHOTS = process.env.SHOTS ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });
const { newPage, close } = await launch();
const { check, finish } = createChecker();

const links = [
  ["x-post", "https://x.com/jack/status/20"],
  ["x-profile", "https://x.com/jack"],
  ["youtube", "https://www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["youtube-channel", "https://www.youtube.com/@t3dotgg"],
  ["youtube-channel-id", "https://www.youtube.com/channel/UCbRP3c757lWg9M-U7TyEkXA"],
  ["spotify", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"],
  ["github-repo", "https://github.com/Priyansh4444/Unhooked"],
  ["github-pr", "https://github.com/Priyansh4444/Unhooked/pull/1"],
  ["github-discussion", "https://github.com/vercel/next.js/discussions/100010"],
  ["github-user", "https://github.com/torvalds"],
  ["imgur", "https://i.imgur.com/Xy12zQ9.png"],
  ["lakebed", "https://something.lakebed.app/dashboard"],
];
const CHAT = twitchChatPage(links.map(([name, url]) => [name, url]));

// GitHub allows 60 unauthenticated API calls an hour per IP; repeated runs can use them up.
const githubLimited = await fetch("https://api.github.com/rate_limit")
  .then((r) => r.json())
  .then((r) => r.resources.core.remaining === 0)
  .catch(() => false);
if (githubLimited)
  console.log("   (GitHub API rate limit used up: GitHub detail checks are skipped)");
const githubCheck = (name, ok, detail) =>
  githubLimited ? console.log(`SKIP  ${name}  (GitHub rate limit)`) : check(name, ok, detail);

const page = await newPage({ width: 900, height: 760 });
await stub(page, [["https://www.twitch.tv/", CHAT]]);
await page.goto("https://www.twitch.tv/somestreamer", { waitUntil: "load" });
await sleep(2500);

for (const [index, [name]] of links.entries()) {
  await page.mouse.move(800, 700);
  await sleep(400);
  await (await page.$$(".uh-link-pill"))[index].hover();
  await sleep(name === "x-post" || name === "youtube" ? 6000 : 3500);
  const info = await page.evaluate(() => {
    const card = document.getElementById("uh-twitch-hovercard");
    if (!card || card.hidden) return null;
    const box = card.getBoundingClientRect();
    return {
      kind: card.dataset.kind,
      chips: [...card.querySelectorAll(".uh-chip")].map((c) => c.textContent).join(" "),
      frames: card.querySelectorAll("iframe").length,
      onScreen: box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth,
    };
  });
  console.log("  ", name, JSON.stringify(info));
  check(`${name}: card opens on screen`, !!info && info.onScreen, JSON.stringify(info));

  if (name === "x-post") {
    check(
      "x-post: tweet text card, no iframe",
      await page.evaluate(() => {
        const card = document.getElementById("uh-twitch-hovercard");
        const text = card.querySelector(".uh-hovercard__tweet-text")?.textContent ?? "";
        return (
          card.querySelectorAll("iframe").length === 0 && text.includes("just setting up my twttr")
        );
      }),
    );
  }
  if (name === "x-profile")
    check(
      "x-profile: handle card",
      await page.evaluate(() => {
        const card = document.getElementById("uh-twitch-hovercard");
        const text = card?.innerText ?? "";
        return text.includes("@jack") && card.querySelectorAll("iframe").length === 0;
      }),
      JSON.stringify(info),
    );
  if (name === "github-repo")
    githubCheck("github-repo: has stats chips", /★/.test(info?.chips ?? ""), JSON.stringify(info));
  if (name === "github-pr") {
    const labels = await page.$$eval(".uh-link-pill__label", (els) =>
      els.map((e) => e.textContent),
    );
    check(
      "github-pr: pill shows the PR number",
      labels.includes("Priyansh4444/Unhooked#1"),
      JSON.stringify(labels),
    );
    const site = await page.evaluate(
      () => document.querySelector(".uh-hovercard__site")?.textContent ?? "",
    );
    check("github-pr: card shows the PR number", site.includes("Pull request #1"), site);
  }
  if (name === "github-discussion") {
    const labels = await page.$$eval(".uh-link-pill__label", (els) =>
      els.map((e) => e.textContent),
    );
    githubCheck(
      "github-discussion: pill shows the discussion number",
      labels.includes("vercel/next.js#100010"),
      JSON.stringify(labels),
    );
    const site = await page.evaluate(
      () => document.querySelector(".uh-hovercard__site")?.textContent ?? "",
    );
    githubCheck(
      "github-discussion: card names the discussion",
      site.includes("Discussion #100010"),
      site,
    );
  }
  if (name === "youtube-channel") {
    const card = await page.evaluate(
      () => document.getElementById("uh-twitch-hovercard")?.innerText ?? "",
    );
    const avatar = await page.evaluate(() => !!document.querySelector(".uh-hovercard__avatar"));
    check("youtube-channel: card names the channel", /theo/i.test(card), card);
    check("youtube-channel: card shows the channel avatar", avatar);
  }
  if (name === "youtube-channel-id" || name === "spotify") {
    const label = await page.evaluate(
      (i) => document.querySelectorAll(".uh-link-pill__label")[i]?.textContent ?? "",
      index,
    );
    const want = name === "spotify" ? /^Spotify · Never Gonna/ : /theo/i;
    check(`${name}: pill shows the real name`, want.test(label), label);
  }
  if (name === "youtube") {
    await page.click(".uh-hovercard__play");
    await sleep(1500);
    check(
      "youtube: click plays the embedded player",
      (await count(page, ".uh-hovercard iframe[src*=youtube-nocookie]")) === 1,
    );
  }
  await page.screenshot({ path: `${SHOTS}/card-${name}.png` });
}

await close();
finish();
