// Shared test harness: the same tests run in Chrome and Firefox (BROWSER=chrome|firefox).
//
// Both are driven by Puppeteer. The extension is a special "e2e" build (see e2e/extension): the
// real code plus a bridge, so tests can read/write extension storage and badges from a page the
// harness serves itself. Everything else goes through the page, the way a user would.
import puppeteer from "puppeteer-core";
import { resolve } from "node:path";

export const BROWSER = process.env.BROWSER === "firefox" ? "firefox" : "chrome";
export const EXT = resolve(process.env.EXT ?? `dist-e2e-${BROWSER}`);
const BINARY = BROWSER === "firefox" ? process.env.FIREFOX_PATH : process.env.CHROME_PATH;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  if (!BINARY) {
    throw new Error(
      BROWSER === "firefox"
        ? "Set FIREFOX_PATH to a Firefox binary (see CONTRIBUTING.md)"
        : "Set CHROME_PATH to a Chromium that can load extensions (see CONTRIBUTING.md)",
    );
  }
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response("<!doctype html><title>e2e</title>", {
        headers: { "content-type": "text/html" },
      }),
  });

  let browser;
  if (BROWSER === "firefox") {
    browser = await puppeteer.launch({
      browser: "firefox",
      executablePath: BINARY,
      headless: true,
    });
    await browser.installExtension(EXT);
    // Let the add-on finish installing before the harness opens its page.
    await sleep(3000);
  } else {
    browser = await puppeteer.launch({
      executablePath: BINARY,
      headless: true,
      pipe: true,
      enableExtensions: [EXT],
      args: ["--disable-gpu"],
      defaultViewport: { width: 1400, height: 900 },
    });
  }

  // Helium bundles uBlock Origin, which reloads tabs opened before its filters are ready.
  // Wait for its network listener before opening test pages so that startup cannot erase them.
  for (const target of browser.targets().filter((target) => target.type() === "background_page")) {
    const page = await target.page();
    if ((await page.evaluate(() => chrome.runtime.getManifest().name)) !== "uBlock Origin")
      continue;
    await page
      .waitForFunction(
        () =>
          typeof vAPI !== "undefined" &&
          vAPI.net?.suspendableListener !== undefined &&
          vAPI.net.suspendDepth === 0,
        { polling: 100, timeout: 30_000 },
      )
      .catch((cause) => {
        throw new Error("Bundled uBlock Origin did not finish initializing its network filters", {
          cause,
        });
      });
  }

  // The harness page the extension bridge listens on.
  const control = await browser.newPage();
  await control.goto(`http://127.0.0.1:${server.port}/`);
  let seq = 0;
  const call = (request) =>
    Promise.race([
      sleep(10_000).then(() => {
        throw new Error(`extension bridge did not answer ${JSON.stringify(request).slice(0, 80)}`);
      }),
      bridgeCall(request),
    ]);
  const bridgeCall = (request) =>
    control.evaluate(
      (request, id) =>
        new Promise((resolve) => {
          const onReply = ({ data }) => {
            if (data?.type !== "unhooked-e2e-reply" || data.id !== id) return;
            removeEventListener("message", onReply);
            resolve(data.result);
          };
          addEventListener("message", onReply);
          postMessage({ type: "unhooked-e2e", id, request }, "*");
        }),
      request,
      ++seq,
    );

  const ext = {
    set: (values) => call({ op: "set", args: values }),
    get: (...keys) => call({ op: "get", args: keys }),
    /** Badge text of the first tab whose URL contains `urlPart`. */
    badge: (urlPart) => call({ op: "badge", args: urlPart }),
    /** Id of the first tab whose URL contains `urlPart`. */
    tabId: (urlPart) => call({ op: "tabId", args: urlPart }),
  };

  // Wait until the extension is up (its first reply proves bridge + background are alive).
  for (let i = 0; i < 40; i++) {
    const reply = await Promise.race([ext.get("ping"), sleep(500).then(() => null)]);
    if (reply) break;
    await sleep(250);
  }
  // Close any extension page a fresh profile opened, so tests start from the harness page.
  for (const page of await browser.pages()) {
    if (/^(chrome|moz)-extension:/.test(page.url())) await page.close();
  }

  return {
    browser,
    ext,
    control,
    async newPage(viewport = { width: 1400, height: 900 }) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      return page;
    },
    async close() {
      await browser.close().catch(() => {});
      server.stop(true);
    },
  };
}

/** `press(page, "Control+b")`: modifiers held while the last key is pressed. */
export async function press(page, chord) {
  await page.bringToFront();
  const keys = chord.split("+");
  const key = keys.pop();
  for (const modifier of keys) await page.keyboard.down(modifier);
  await page.keyboard.press(key);
  for (const modifier of keys.reverse()) await page.keyboard.up(modifier);
}

/** Serve `routes` ([urlPrefix, html] pairs) instead of the network for this page. */
export async function stub(page, routes) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const hit = routes.find(([prefix]) => request.url().startsWith(prefix));
    if (hit) void request.respond({ status: 200, contentType: "text/html", body: hit[1] });
    else void request.continue();
  });
}

// ---- Twitch helpers --------------------------------------------------------------------------

/** A link the way Twitch renders one in a chat message. */
export const chatLink = (url) =>
  `<a class="link-fragment tw-link" href="${url}" target="_blank">${url}</a>`;

/**
 * A twitch.tv page whose chat mimics the real markup and metrics (14px text, 22px lines).
 * `lines` are [user, text] pairs; URLs in the text become links. A third element adds a clip
 * preview card under the message, with an anchor of its own like Twitch's.
 */
export function twitchChatPage(lines) {
  const linkify = (text) => text.replace(/(https?:\/\/\S+)/g, chatLink("$1"));
  const row = ([user, text, card]) => `
    <div class="chat-line__message" data-a-target="chat-line-message" style="padding:5px 20px;font-size:14px;line-height:22px">
      <div class="chat-line__message-container"><span style="color:#bf94ff;font-weight:700">${user}</span><span aria-hidden="true">: </span><span data-a-target="chat-line-message-body" dir="auto"><span class="text-fragment" data-a-target="chat-message-text">${linkify(text)}</span></span></div>
      ${card ? `<div class="chat-card" style="margin:4px 0;padding:6px;background:#26262c;border-radius:6px"><a href="${card}"><span style="display:inline-block;width:60px;height:34px;background:#555"></span> Clip title</a></div>` : ""}
    </div>`;
  return `<!doctype html><html><body style="margin:0;background:#18181b;color:#efeff1;font-family:Inter,Roboto,Arial,sans-serif">
    <div style="width:340px;min-height:100vh;border-left:1px solid #333"><div style="padding:10px;font-weight:700;border-bottom:1px solid #333">STREAM CHAT</div>
    <div data-a-target="chat-scroller">${lines.map(row).join("")}</div></div></body></html>`;
}

export const count = async (page, selector) => (await page.$$(selector)).length;

export function createChecker() {
  let failures = 0;
  return {
    check(name, ok, detail = "") {
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + detail}`);
      if (!ok) failures++;
    },
    finish() {
      console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
      process.exit(failures ? 1 : 0);
    },
  };
}

// ---- YouTube helpers -------------------------------------------------------------------------

export const ytState = (page) =>
  page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const vis = (s) => {
      const e = q(s);
      if (!e) return null;
      const cs = getComputedStyle(e);
      const box = e.getBoundingClientRect();
      return {
        display: cs.display,
        opacity: cs.opacity,
        h: Math.round(box.height),
        w: Math.round(box.width),
      };
    };
    const flexy = q("ytd-watch-flexy");
    return {
      url: location.pathname + location.search,
      theater: flexy ? flexy.hasAttribute("theater") : null,
      flexyHidden: flexy ? flexy.hasAttribute("hidden") : null,
      secondary: vis("ytd-watch-flexy #secondary") || vis("#secondary"),
      masthead: vis("#masthead-container"),
      player: vis("#movie_player"),
      htmlClass: document.documentElement.className.slice(0, 80),
    };
  });

/** YouTube streams its HTML, so wait for the document (not just the response) before testing. */
export async function gotoYT(page, url) {
  await page.goto(url, { waitUntil: [], timeout: 90000 }).catch(() => {});
  const start = Date.now();
  while (Date.now() - start < 80000) {
    const state = await page.evaluate(() => document.readyState).catch(() => "x");
    if (state === "interactive" || state === "complete") break;
    await sleep(500);
  }
  await sleep(2500);
}
