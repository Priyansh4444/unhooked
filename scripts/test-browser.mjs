import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { fixtures, discoveryFixtures, fixturePage } from "./browser-fixtures.mjs";

const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const extensionPath = process.env.UNHOOKED_EXTENSION_PATH
  ? await realpath(process.env.UNHOOKED_EXTENSION_PATH)
  : root;
// Chromium derives an unpacked extension's ID from its canonical installation path.
const idPath = process.platform === "win32" ? extensionPath.toLowerCase() : extensionPath;
const extensionId = createHash("sha256")
  .update(idPath)
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
const evidence = path.join(root, "test-results");
await mkdir(evidence, { recursive: true });
const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  viewport: { width: 1100, height: 800 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
});
const results = [];
const errors = [];
context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));

async function waitFor(check, message) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(message);
}

async function visible(page, selector, expected, message) {
  await waitFor(
    () =>
      page
        .locator(selector)
        .isVisible()
        .then((value) => value === expected),
    message
  );
}

try {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForFunction(() => typeof globalThis.unhookedPresetPatch === "function");
  await popup.evaluate(() => chrome.storage.local.clear());
  // Routing supplies deterministic remote documents while preserving real supported origins.
  await context.route("https://**/*", async (route) => {
    const request = route.request();
    if (request.resourceType() !== "document") return route.abort();
    const url = new URL(request.url());
    if (url.hostname === "example.org") {
      return route.fulfill({
        contentType: "text/html",
        body: fixturePage(
          '<iframe title="Embedded YouTube" src="https://www.youtube-nocookie.com/embed/example"></iframe>'
        )
      });
    }
    if (url.hostname === "www.youtube-nocookie.com") {
      return route.fulfill({
        contentType: "text/html",
        body: fixturePage(
          '<div class="ytp-ce-element" id="end-card">End-screen recommendation</div>'
        )
      });
    }
    const fixture = fixtures.find((candidate) => new URL(candidate.url).hostname === url.hostname);
    const discovery = discoveryFixtures.find(
      (candidate) => candidate.origin === url.origin && candidate.path === url.pathname
    );
    const body =
      fixture?.html ||
      `<ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer><article id="feed">Home video recommendations</article></ytd-rich-grid-renderer></div></ytd-browse><button class="ytp-autonav-toggle-button" aria-checked="true" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')==='true'?'false':'true')">Autoplay</button>`;
    return route.fulfill({ contentType: "text/html", body: fixturePage(discovery?.html || body) });
  });

  async function set(patch) {
    await popup.evaluate((values) => chrome.storage.local.set(values), patch);
  }
  async function preset(site, value) {
    await popup.evaluate(
      ({ site, value }) => chrome.storage.local.set(unhookedPresetPatch(site, value)),
      { site, value }
    );
  }

  for (const fixture of fixtures) {
    const page = await context.newPage();
    await preset(fixture.id, "clear");
    await set({ "unhooked.paused": false, [`unhooked.site.${fixture.id}.enabled`]: true });
    await popup.locator(`#site-${fixture.id}`).check();
    await page.goto(fixture.url);
    await page.waitForFunction((id) => document.documentElement.dataset.uhSite === id, fixture.id);
    await visible(page, "#feed", true, `${fixture.id}: starts visible`);
    await popup.locator("#social-hideHomeFeed").check();
    await visible(page, "#feed", false, `${fixture.id}: preference hides the home feed`);
    await visible(page, "#navigation", true, `${fixture.id}: navigation remains available`);
    await visible(page, "#unrelated", true, `${fixture.id}: unrelated content remains available`);

    // A late-rendered matching post must be hidden without another storage event.
    await page.evaluate(() => {
      const original = document.querySelector("#feed");
      const clone = original.cloneNode(true);
      clone.id = "late-post";
      original.after(clone);
    });
    await visible(page, "#late-post", false, `${fixture.id}: dynamic feed insertion is hidden`);
    // Our own idempotent writes must not feed back into the self-healing observer.
    assert.equal(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const records = [];
            const observer = new MutationObserver((list) => records.push(...list));
            observer.observe(document.documentElement, { attributes: true, childList: true });
            setTimeout(() => {
              observer.disconnect();
              resolve(records.length);
            }, 600);
          })
      ),
      0,
      `${fixture.id}: settled page has no extension mutation loop`
    );
    // Site frameworks may reset <html> classes or drop unknown nodes during hydration.
    await page.evaluate(() => {
      document.documentElement.className = "";
      document.getElementById("unhooked-social-rules").remove();
    });
    await visible(page, "#feed", false, `${fixture.id}: page-cleared state is restored`);
    const second = await context.newPage();
    await second.goto(fixture.url);
    await visible(second, "#feed", false, `${fixture.id}: second tab applies the same choice`);
    await popup.locator("#btnPower").click();
    await visible(page, "#feed", true, `${fixture.id}: pause reaches the first tab`);
    await visible(second, "#feed", true, `${fixture.id}: pause reaches the second tab`);
    await popup.locator("#btnPower").click();
    await visible(page, "#feed", false, `${fixture.id}: resume reaches the first tab`);
    await visible(second, "#feed", false, `${fixture.id}: resume reaches the second tab`);
    await second.close();
    await popup.locator("#siteEnabled").uncheck();
    await visible(page, "#feed", true, `${fixture.id}: site disable restores existing DOM`);
    await popup.locator("#siteEnabled").check();
    await visible(page, "#feed", false, `${fixture.id}: site resume reapplies choices`);

    await popup.locator('[data-preset="focused"]').click();
    for (const route of [
      fixture.profile,
      fixture.detail,
      fixture.search,
      fixture.messages,
      "/unrecognized/route"
    ]) {
      await page.evaluate((route) => history.pushState({}, "", route), route);
      await visible(page, "#feed", true, `${fixture.id}: direct route stays visible: ${route}`);
      await visible(page, "#navigation", true, `${fixture.id}: direct route preserves navigation`);
    }
    await page.evaluate((route) => history.pushState({}, "", route), new URL(fixture.url).pathname);
    await visible(page, "#feed", false, `${fixture.id}: SPA return to home reapplies hiding`);

    if (fixture.sidebarAnywhere) {
      await preset(fixture.id, "clear");
      await set({ [`unhooked.site.${fixture.id}.${fixture.sidebarAnywhere}`]: true });
      await page.evaluate(() => history.pushState({}, "", "/unrecognized/route"));
      await visible(page, "#suggestions", false, `${fixture.id}: sidebar hides on unknown routes`);
      await visible(page, "#feed", true, `${fixture.id}: unknown route keeps primary content`);
      await page.evaluate(
        (route) => history.pushState({}, "", route),
        new URL(fixture.url).pathname
      );
    }
    for (const [feature, targets] of Object.entries(fixture.features)) {
      await preset(fixture.id, "clear");
      await set({ [`unhooked.site.${fixture.id}.${feature}`]: true });
      for (const target of targets)
        await visible(page, `#${target}`, false, `${fixture.id}: ${feature} hides ${target}`);
      await visible(page, "#feed", true, `${fixture.id}: ancillary toggle preserves feed`);
      await set({ [`unhooked.site.${fixture.id}.${feature}`]: false });
      for (const target of targets)
        await visible(page, `#${target}`, true, `${fixture.id}: ${feature} restores ${target}`);
    }
    await preset(fixture.id, "clear");
    await page.close();
    results.push(
      `${fixture.id}: live storage, CSS, dynamic DOM, self-healing, cross-tab pause, site disable, protected routes, SPA, ancillary controls`
    );
    console.log(`PASS ${results.at(-1)}`);
  }

  for (const fixture of discoveryFixtures) {
    const page = await context.newPage();
    await preset(fixture.id, "clear");
    await popup.locator(`#site-${fixture.id}`).check();
    await page.goto(fixture.origin + fixture.path);
    await visible(page, "#discovery", true, `${fixture.id}: ${fixture.path} starts visible`);
    await popup.locator(`#social-${fixture.feature}`).check();
    await visible(
      page,
      "#discovery",
      false,
      `${fixture.id}: ${fixture.feature} suppresses ${fixture.path}`
    );
    await visible(page, "#navigation", true, `${fixture.id}: discovery hide preserves navigation`);
    await popup.locator("#btnPower").click();
    await visible(page, "#discovery", true, `${fixture.id}: discovery pause restores viewer`);
    await popup.locator("#btnPower").click();
    await page.evaluate(() => history.pushState({}, "", "/profile/direct/unknown"));
    await visible(
      page,
      "#discovery",
      true,
      `${fixture.id}: discovery hide leaves unknown routes visible`
    );
    await page.close();
    results.push(
      `${fixture.id}: ${fixture.feature} on ${fixture.path}, reversible and route scoped`
    );
    console.log(`PASS ${results.at(-1)}`);
  }

  const unrelated = await context.newPage();
  await unrelated.goto("https://evilx.com/home");
  assert.equal(
    await unrelated.locator("html").getAttribute("data-uh-site"),
    null,
    "Unsupported hosts receive no social controller"
  );
  await visible(unrelated, "#feed", true, "Unsupported sites remain unchanged");
  await unrelated.close();

  // Legacy settings remain effective, and explicit scalar false overrides legacy true.
  const youtube = await context.newPage();
  await popup.evaluate(() => chrome.storage.local.clear());
  await set({ unhookedOptions: { hideHomeFeed: true, disableAutoplay: true } });
  await youtube.goto("https://www.youtube.com/");
  await visible(
    youtube,
    "#feed",
    false,
    "YouTube: existing saved settings still hide recommendations"
  );
  await youtube.evaluate(() => {
    document.documentElement.className = "";
  });
  await visible(youtube, "#feed", false, "YouTube: page-cleared classes are restored");
  await waitFor(
    () =>
      youtube
        .locator(".ytp-autonav-toggle-button")
        .getAttribute("aria-checked")
        .then((value) => value === "false"),
    "YouTube: disable autoplay clicks player control"
  );
  await set({ "unhooked.site.youtube.hideHomeFeed": false, "unhooked.paused": true });
  await visible(youtube, "#feed", true, "YouTube: global pause restores content");
  await youtube
    .locator(".ytp-autonav-toggle-button")
    .evaluate((button) => button.setAttribute("aria-checked", "true"));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(
    await youtube.locator(".ytp-autonav-toggle-button").getAttribute("aria-checked"),
    "true",
    "YouTube: paused extension must stop changing autoplay"
  );
  await set({ "unhooked.paused": false });
  await visible(youtube, "#feed", true, "YouTube: explicit false overrides legacy true");
  await youtube.close();
  results.push(
    "youtube: legacy compatibility, explicit false, autoplay behavior and pause cancellation"
  );
  console.log(`PASS ${results.at(-1)}`);

  await set({ "unhooked.site.youtube.hideEndScreenCards": true });
  const embedded = await context.newPage();
  await embedded.goto("https://example.org/");
  const frame = embedded.frameLocator("iframe");
  await frame.locator("#end-card").waitFor({ state: "attached" });
  await waitFor(
    () => frame.locator("#end-card").isHidden(),
    "YouTube: iframe end-screen controls apply on unrelated parent sites"
  );
  await set({ "unhooked.paused": true });
  await waitFor(
    () => frame.locator("#end-card").isVisible(),
    "YouTube: global pause restores embedded end-screen content"
  );
  await set({ "unhooked.paused": false });
  assert.equal(
    await embedded.locator("html").getAttribute("class"),
    null,
    "YouTube frame controls do not mutate the parent website"
  );
  await embedded.close();
  results.push(
    "youtube embeds: actual cross-origin frame injection, end-screen hiding and pause restoration"
  );
  console.log(`PASS ${results.at(-1)}`);

  // Popup interaction checks are below the fixture checks so failures retain the full DOM evidence.
  await popup.reload();
  await popup.waitForFunction(() => typeof globalThis.unhookedSiteById === "function");
  await popup.locator("#site-x").check();
  await popup.locator('[data-preset="focused"]').click();
  await waitFor(
    () => popup.locator("#social-hideHomeFeed").isChecked(),
    "Popup: Focus preset checks home feed"
  );
  const text = (selector) => popup.locator(selector).textContent();
  await waitFor(
    async () => (await text("#meta-x")) === "3",
    "Popup: the site rail shows how many controls are on"
  );
  // On X, Balanced and Focus coincide; exactly one preset is marked.
  assert.deepEqual(
    await popup
      .locator("[data-preset]")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-pressed"))),
    ["true", "false", "false"],
    "Popup: one matching preset is marked"
  );
  await popup.locator("#social-hideExplore").uncheck();
  await waitFor(
    async () =>
      (await text("#meta-x")) === "2" &&
      (await popup.locator("[aria-pressed=true][data-preset]").count()) === 0,
    "Popup: custom choices update the rail count and clear the preset mark"
  );
  await popup.locator("#social-hideExplore").check();
  await popup.locator("#btnPower").click();
  await waitFor(
    async () =>
      (await popup.locator("#pausedNote").isVisible()) &&
      (await text("#powerLabel")) === "Resume" &&
      (await popup.locator("body.is-paused").count()) === 1,
    "Popup: pausing shows the notice, relabels the rail button, and dims choices"
  );
  await popup.locator("#btnResume").click();
  await waitFor(
    async () => (await popup.locator("#pausedNote").isHidden()) && (await text("#meta-x")) === "3",
    "Popup: Resume restores every site"
  );
  await popup.locator("#site-x").focus();
  await popup.keyboard.press("ArrowRight");
  await waitFor(
    async () => (await popup.locator("#siteName").textContent()) === "Reddit",
    "Popup: arrow keys move between sites"
  );
  await popup.locator("#site-x").check();
  const otherPopup = await context.newPage();
  await otherPopup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await otherPopup.locator("#site-reddit").check();
  await Promise.all([
    popup.locator("#social-hideExplore").uncheck(),
    otherPopup.locator("#social-hideRecommendations").check()
  ]);
  const concurrent = await popup.evaluate(() =>
    chrome.storage.local.get([
      "unhooked.site.x.hideExplore",
      "unhooked.site.reddit.hideRecommendations"
    ])
  );
  assert.equal(concurrent["unhooked.site.x.hideExplore"], false);
  assert.equal(concurrent["unhooked.site.reddit.hideRecommendations"], true);
  await popup.locator("#siteEnabled").uncheck();
  await popup.locator("#resetAll").click();
  await waitFor(
    () =>
      popup
        .locator("#social-hideHomeFeed")
        .isChecked()
        .then((value) => !value),
    "Popup: reset clears the selected site"
  );
  await waitFor(
    () => popup.locator("#siteEnabled").isChecked(),
    "Popup: reset turns the selected site back on"
  );
  assert.equal(
    (
      await popup.evaluate(() =>
        chrome.storage.local.get("unhooked.site.reddit.hideRecommendations")
      )
    )["unhooked.site.reddit.hideRecommendations"],
    true,
    "Popup: resetting X preserves Reddit"
  );
  await otherPopup.close();
  await popup.locator('[data-preset="balanced"]').click();
  await set({ unhookedPopupTheme: "system" });
  await popup.locator("#btnTheme").click();
  await waitFor(
    () =>
      popup
        .locator("html")
        .getAttribute("data-popup-theme")
        .then((theme) => theme === "dark"),
    "Popup: theme button persists dark theme"
  );
  results.push(
    "popup: site rail, preset marking, pause notice, keyboard selection, reset isolation, concurrent writes and theme"
  );
  console.log(`PASS ${results.at(-1)}`);
  await popup.setViewportSize({ width: 400, height: 600 });
  await popup.screenshot({ path: path.join(evidence, "popup-dark.png") });
  await popup.locator("#btnTheme").click();
  await waitFor(
    () =>
      popup
        .locator("html")
        .getAttribute("data-popup-theme")
        .then((theme) => theme === "light"),
    "Popup: theme button persists light theme"
  );
  const dimensions = await popup.evaluate(() => ({
    height: document.body.getBoundingClientRect().height,
    footerBottom: document.querySelector("footer").getBoundingClientRect().bottom,
    width: document.documentElement.scrollWidth
  }));
  assert.equal(dimensions.height, 600, "Popup must fit Chrome’s 600px height limit");
  assert.ok(dimensions.footerBottom <= 600, "Save feedback and reset must stay visible");
  assert.ok(dimensions.width <= 400, "Popup must not scroll horizontally");
  await popup.screenshot({ path: path.join(evidence, "popup.png") });
  assert.deepEqual(errors, [], `Browser errors: ${errors.join("; ")}`);
  await writeFile(
    path.join(evidence, "browser-results.json"),
    JSON.stringify({ extensionId, extensionPath, results, errors }, null, 2)
  );
  console.log(`Passed ${results.length} platform journeys in real Chromium. Evidence: ${evidence}`);
} catch (error) {
  for (const [index, page] of context.pages().entries()) {
    await page
      .screenshot({ path: path.join(evidence, `failure-${index}.png`), fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  await context.close();
}
