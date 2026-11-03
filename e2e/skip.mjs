// "Skip the feeds": feed pages are left for the page the user chose, on load and on SPA
// navigation, never while paused, and never into a loop. Stubbed pages; Chrome and Firefox.
import { createChecker, launch, sleep, stub } from "./lib.mjs";
import { fixturePage } from "./social-fixtures.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const page = (id) => fixturePage(`<main><article id="${id}">${id}</article></main>`);
// Instagram's navigation sits outside <main> and links to the account with its picture.
const instagram = fixturePage(
  `<div role="navigation"><a href="/"><img alt="Home"></a><a href="/someone/"><img alt="someone's profile picture"></a></div><main><article id="feed">A home post</article></main>`,
);

async function landsOn(name, url, expected, routes, keep = false) {
  const tab = await newPage();
  await stub(tab, routes);
  await tab.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  const end = Date.now() + 5000;
  while (Date.now() < end && tab.url() !== expected) await sleep(50);
  check(name, tab.url() === expected, `ended on ${tab.url()}`);
  if (!keep) await tab.close();
  return tab;
}

await ext.set({
  "unhooked.paused": false,
  "unhooked.site.x.redirect": true,
  "unhooked.site.youtube.redirect": true,
  "unhooked.site.instagram.redirect": true,
  "unhooked.site.instagram.redirectTo": "/{user}/saved/",
});
await ext.set({ "unhooked.user.instagram": null });

const xRoutes = [["https://x.com/", page("x")]];
await landsOn(
  "X Home goes to Notifications",
  "https://x.com/home",
  "https://x.com/notifications",
  xRoutes,
);

// Clicking through to Home inside the app (history.pushState) skips it too.
const profile = await landsOn(
  "a profile stays put",
  "https://x.com/someone",
  "https://x.com/someone",
  xRoutes,
  true,
);
await profile.evaluate(() => history.pushState({}, "", "/home"));
const end = Date.now() + 5000;
while (Date.now() < end && profile.url() !== "https://x.com/notifications") await sleep(50);
check(
  "navigating to Home inside X skips it",
  profile.url() === "https://x.com/notifications",
  profile.url(),
);
await profile.close();

await ext.set({ "unhooked.site.x.redirectTo": "/i/bookmarks" });
await landsOn(
  "the chosen page is used",
  "https://x.com/home",
  "https://x.com/i/bookmarks",
  xRoutes,
);

// A target that is itself a feed would loop: it is ignored rather than followed.
await ext.set({ "unhooked.site.x.redirectTo": "/explore" });
await landsOn("a feed is never a target", "https://x.com/home", "https://x.com/home", xRoutes);
await ext.set({ "unhooked.site.x.redirectTo": "/notifications" });

await ext.set({ "unhooked.paused": true });
await landsOn("pause stops skipping", "https://x.com/home", "https://x.com/home", xRoutes);
await ext.set({ "unhooked.paused": false, "unhooked.site.x.enabled": false });
await landsOn(
  "turning the site off stops skipping",
  "https://x.com/home",
  "https://x.com/home",
  xRoutes,
);
await ext.set({ "unhooked.site.x.enabled": true });

const ytRoutes = [["https://www.youtube.com/", page("youtube")]];
await landsOn(
  "a Short opens in the normal player",
  "https://www.youtube.com/shorts/abc123",
  "https://www.youtube.com/watch?v=abc123",
  ytRoutes,
);
await landsOn(
  "YouTube Home goes to Subscriptions",
  "https://www.youtube.com/",
  "https://www.youtube.com/feed/subscriptions",
  ytRoutes,
);

const igRoutes = [["https://www.instagram.com/", instagram]];
await landsOn(
  "Instagram Home goes to the account's saved posts",
  "https://www.instagram.com/",
  "https://www.instagram.com/someone/saved/",
  igRoutes,
);
const user = (await ext.get("unhooked.user.instagram"))["unhooked.user.instagram"];
check("the account name is remembered for next time", user === "someone", String(user));

await ext.set({
  "unhooked.site.x.redirect": false,
  "unhooked.site.youtube.redirect": false,
  "unhooked.site.instagram.redirect": false,
});
await landsOn("off again, Home stays", "https://x.com/home", "https://x.com/home", xRoutes);

await close();
finish();
