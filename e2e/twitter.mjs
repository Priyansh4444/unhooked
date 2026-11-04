// X's Layout switches against a stubbed x.com page (X blocks automation and needs a login).
import { createChecker, launch, press, sleep, stub } from "./lib.mjs";

const { newPage, ext, close } = await launch();
const { check, finish } = createChecker();

const PAGE = `<!doctype html><html><body><div style="display:flex">
<header role="banner" style="flex-grow:1">nav</header><main role="main" style="flex-grow:1"><div>
  <div style="display:flex;justify-content:space-between;width:600px">
    <div data-testid="primaryColumn"><div data-testid="cellInnerDiv"><article>a post</article></div></div>
    <div data-testid="sidebarColumn">side</div>
  </div>
</div></main></div></body></html>`;

const page = await newPage();
await stub(page, [["https://x.com/", PAGE]]);
await page.goto("https://x.com/home", { waitUntil: "load" });
await sleep(1200);

const html = (name) =>
  page.evaluate((name) => document.documentElement.classList.contains(name), name);
const rule = (selector, property) =>
  page.evaluate((s, p) => getComputedStyle(document.querySelector(s))[p], selector, property);

check("no layout change until asked", !(await html("uh-x-center")));
await ext.set({ twitter_center_timeline: true, twitter_width: 60 });
await sleep(300);
check("Center timeline acts when flipped", await html("uh-x-center"));
check(
  "it centers the column",
  (await rule('div:has(> [data-testid="primaryColumn"])', "justifyContent")) === "center",
);
check(
  "it uses the chosen width",
  (await rule('[data-testid="primaryColumn"]', "maxWidth")) === "60%",
);
check(
  "it keeps a gap between the timeline and the sidebar",
  await page.evaluate(() => {
    const timeline = document
      .querySelector('[data-testid="primaryColumn"]')
      .getBoundingClientRect();
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]').getBoundingClientRect();
    return sidebar.left - timeline.right >= 30;
  }),
);
check(
  "centering leaves the navigation alone",
  (await rule('header[role="banner"]', "display")) !== "none",
);
await ext.set({ twitter_use_default_font: false, twitter_font_size: 20 });
await sleep(300);
check("Custom text size acts when flipped", await html("uh-x-font"));

await ext.set({ "unhooked.paused": true });
await sleep(300);
check("Pause all takes the layout off", !(await html("uh-x-center")) && !(await html("uh-x-font")));
await ext.set({ "unhooked.paused": false });
await sleep(300);
check("Resume puts it back", (await html("uh-x-center")) && (await html("uh-x-font")));
await ext.set({ "unhooked.site.x.enabled": false });
await sleep(300);
check("the site's switch takes the layout off too", !(await html("uh-x-center")));
await ext.set({ "unhooked.site.x.enabled": true });
await sleep(300);
check("and brings it back", await html("uh-x-center"));

// Focus mode is gone: its keys do nothing here.
await press(page, "Control+b");
await sleep(400);
check(
  "Ctrl+B belongs to the page again",
  await page.evaluate(() => !document.documentElement.classList.contains("uh-focus-x")),
);
check("X's header has no extra button", (await page.$("#uh-focus-x-toggle")) === null);

await ext.set({ twitter_center_timeline: false, twitter_use_default_font: true });
await sleep(300);
check("turning them off restores the page", !(await html("uh-x-center")));

await close();
finish();
