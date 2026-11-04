// Hover cards for each kind of chat link, on a stubbed twitch.tv chat page. Needs network for
// the real GitHub / YouTube / X lookups. One screenshot per card goes to $SHOTS.
import { mkdirSync } from "node:fs";
import { count, createChecker, launch, sleep, stub, twitchChatPage } from "./lib.mjs";

const SHOTS = process.env.SHOTS ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });
const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const links = [
  ["x-post", "https://x.com/jack/status/20"],
  ["x-profile", "https://x.com/jack"],
  ["x-photo", "https://x.com/NASA/status/2117633046002225363"],
  ["x-video", "https://x.com/SpaceX/status/2112502543947325773"],
  ["x-quote", "https://x.com/stevesi/status/2117664974319603962"],
  ["x-photo-page", "https://x.com/NASA/status/2117633046002225363/photo/1"],
  ["x-mirror", "https://fxtwitter.com/jack/status/20"],
  ["x-old-name", "https://twitter.com/jack/status/20?s=20"],
  ["x-no-handle", "https://x.com/i/web/status/20"],
  ["x-tab", "https://x.com/jack/media"],
  ["x-hashtag", "https://x.com/hashtag/typescript"],
  ["x-search", "https://x.com/search?q=bun"],
  ["x-space", "https://x.com/i/spaces/1YqJDgNRgRzGV"],
  ["x-list", "https://x.com/i/lists/1234"],
  ["x-community", "https://x.com/i/communities/1493446837214187523"],
  ["x-short", "https://t.co/aqD1x7wzRq"],
  ["ai-lab", "https://claude.ai/"],
  ["ai-lab-2", "https://openai.com/"],
  ["any-site", "https://developer.mozilla.org/en-US/docs/Web/HTML"],
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

// Access to all sites alone, as film mode gets it, doesn't read a stranger's link: it asks first.
await (await page.$$(".uh-link-pill"))[links.findIndex(([name]) => name === "any-site")].hover();
await page.waitForSelector("#uh-twitch-hovercard .uh-hovercard__body", { timeout: 5000 });
check(
  "any site, not yet asked: its card offers to ask",
  !!(await page.$("#uh-twitch-hovercard .uh-hovercard__ask")),
);
await ext.set({ twitch_link_previews: true });
await page.mouse.move(800, 700);
await sleep(400);

for (const [index, [name]] of links.entries()) {
  await page.mouse.move(800, 700);
  await sleep(400);
  await (await page.$$(".uh-link-pill"))[index].hover();
  // From the moment it opens, through its lookup and pictures, the card doesn't move.
  const held = await page.evaluate(
    (ms, pillIndex) =>
      new Promise((done) => {
        const pill = document.querySelectorAll(".uh-link-pill")[pillIndex];
        const anchors = new Set();
        let covered = false;
        const started = performance.now();
        const look = () => {
          const card = document.getElementById("uh-twitch-hovercard");
          if (card && !card.hidden) {
            const box = card.getBoundingClientRect();
            const anchor = card.dataset.side === "below" ? box.top : box.bottom;
            anchors.add(`${card.dataset.side} ${Math.round(anchor)} ${Math.round(box.left)}`);
            const at = pill.getBoundingClientRect();
            covered ||= box.top < at.bottom - 1 && box.bottom > at.top + 1;
          }
          if (performance.now() - started < ms) requestAnimationFrame(look);
          else done({ anchors: [...anchors], covered });
        };
        look();
      }),
    name.startsWith("x-") || name === "youtube" ? 4500 : 3500,
    index,
  );
  check(`${name}: the card holds still`, held.anchors.length === 1, held.anchors.join(" | "));
  check(`${name}: and never covers its pill`, !held.covered);
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
  if (name === "ai-lab" || name === "ai-lab-2") {
    const host = name === "ai-lab" ? "claude.ai" : "openai.com";
    check(
      `${name}: its pill has the lab's logo`,
      await page.evaluate(
        (i, host) =>
          document
            .querySelectorAll(".uh-link-pill")
            [i]?.querySelector("img")
            ?.src.includes(`/icons/sites/${host}.png`) &&
          document.querySelectorAll(".uh-link-pill")[i].querySelector("img").naturalWidth > 0,
        index,
        host,
      ),
    );
  }
  if (name === "any-site") {
    const embed = await page.evaluate(() => {
      const card = document.getElementById("uh-twitch-hovercard");
      const inner = card.querySelector(".uh-hovercard__inner");
      return {
        title: card.querySelector(".uh-hovercard__title")?.textContent ?? "",
        link: card.querySelector("a.uh-hovercard__title")?.href ?? "",
        bar: getComputedStyle(inner).borderLeftWidth,
      };
    });
    check("any site with access: its card reads the page", /HTML/.test(embed.title), embed.title);
    check("with a title to click", embed.link.startsWith("https://developer.mozilla.org/"));
    check("and an embed's bar down its side", embed.bar === "3px", embed.bar);
  }
  // Every kind of X link has a card that says what it is.
  if (name.startsWith("x-") && name !== "x-post") {
    const seen = await page.evaluate(() => {
      const card = document.getElementById("uh-twitch-hovercard");
      return {
        text: card?.innerText ?? "",
        avatar: !!card?.querySelector(".uh-hovercard__avatar"),
        photos: card?.querySelectorAll(".uh-hovercard__photo img").length ?? 0,
        play: !!card?.querySelector(".uh-hovercard__play"),
        quote: !!card?.querySelector(".uh-hovercard__quote"),
        open: card?.querySelector(".uh-hovercard__open")?.href ?? "",
      };
    });
    const about = {
      "x-profile": seen.avatar && /no state is the best state/.test(seen.text),
      "x-photo": seen.avatar && seen.photos > 0,
      "x-video": seen.avatar && seen.play,
      "x-quote": seen.avatar && seen.quote,
      "x-photo-page": seen.avatar && seen.photos > 0,
      "x-mirror": /just setting up/.test(seen.text) && seen.open.startsWith("https://x.com/"),
      "x-old-name": /just setting up/.test(seen.text) && seen.open.startsWith("https://x.com/"),
      "x-no-handle": /just setting up/.test(seen.text),
      "x-tab": /@jack/.test(seen.text),
      "x-hashtag": /#typescript/.test(seen.text),
      "x-search": /Search: bun/.test(seen.text),
      "x-space": /Space on X/.test(seen.text),
      "x-list": /List on X/.test(seen.text),
      "x-community": /Community on X/.test(seen.text),
      "x-short": /nasa\.gov|NASA/i.test(seen.text + seen.open),
    }[name];
    check(`${name}: card says what it is`, about, JSON.stringify(seen).slice(0, 220));
    if (name === "x-profile") {
      const label = await page.evaluate(
        (i) => document.querySelectorAll(".uh-link-pill__label")[i]?.textContent ?? "",
        index,
      );
      check("x-profile: the pill has the bio", /no state is the best state/.test(label), label);
    }
    if (name === "x-video") {
      await page.click(".uh-hovercard__play");
      await sleep(800);
      check(
        "x-video: a click plays it in the card",
        (await count(page, ".uh-hovercard video")) === 1,
      );
    }
  }
  if (name === "youtube-channel-id" || name === "spotify") {
    const label = await page.evaluate(
      (i) => document.querySelectorAll(".uh-link-pill__label")[i]?.textContent ?? "",
      index,
    );
    const want = name === "spotify" ? /^Never Gonna/ : /theo/i;
    check(`${name}: pill shows the real name`, want.test(label), label);
  }
  if (name === "youtube") {
    const still = await page.$eval(".uh-hovercard__media img", (img) => img.naturalWidth);
    check("youtube: a real still, not YouTube's grey placeholder", still > 120, String(still));
    await page.screenshot({ path: `${SHOTS}/card-youtube-still.png` });
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
