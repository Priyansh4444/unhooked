// CHROME_PATH=… bun scripts/bench.ts [--runs N] [--live]   what Unhooked costs a page
//   --check            calls and page changes against build/bench.json
//   --update           records them
//   --compare <ref>    this code against <ref> on this machine, and fails on a real slowdown
//
// Two kinds of number, because neither is enough alone. Counts (how often our code ran, what it
// added to the page) are the same on any machine, so they can be recorded and catch slow creep.
// Times aren't, so they're only ever compared within one run, taking turns on the same machine.
// docs/PERFORMANCE.md records the results and what they mean.
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { $ } from "bun";
import { appendFile, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildExtension } from "../build.ts";
import { chatLink, twitchChatPage } from "../e2e/lib.mjs";
import { CONTROL_SITES } from "../src/sites/registry.ts";

const { values: flags } = parseArgs({
  options: {
    runs: { type: "string", default: "5" },
    compare: { type: "string" },
    check: { type: "boolean", default: false },
    update: { type: "boolean", default: false },
    live: { type: "boolean", default: false },
    scene: { type: "string" },
  },
});
const RUNS = Number(flags.runs);
const RECORD = "build/bench.json";
const WORK = resolve("dist-perf");

/** The counts repeat exactly on one browser. This is room for another version of the browser. */
const COUNT_SLACK = 0.02;
/**
 * Slower means by this share of all the work on the page, and by at least this many ms. It's judged
 * on the difference between the builds and not on our cost: hiding a feed saves more than our
 * script takes, so a page's cost can be below zero, where a share of it says nothing.
 */
const SLOWER_SHARE = 0.1;
const SLOWER_MS = 15;
/** Style work on its own too: a costly selector can be lost in the noise of a page's layout. */
const SLOWER_STYLE_SHARE = 0.25;
const SLOWER_STYLE_MS = 5;

const SLOW = "/slow-to-load.js";
const SLOW_MS = 150;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A page's own changes, a fixed number of them, so that every run asks for the same work. */
const everyTick = (page: Page, change: string, ticks: number, ms: number, arg?: unknown) =>
  page.evaluate(
    (body, count, gap, value) =>
      new Promise<void>((done) => {
        // eslint-disable-next-line no-new-func -- it's our own text, sent across to the page
        const step = new Function("i", "value", body);
        let i = 0;
        const timer = setInterval(() => {
          step(i++, value);
          if (i === count) {
            clearInterval(timer);
            done();
          }
        }, gap);
      }),
    change,
    ticks,
    ms,
    arg,
  );

const POST = (
  i: number | string,
) => `<div data-testid="cellInnerDiv"><article data-testid="tweet"><div data-testid="User-Name">Someone ${i}</div>
  <div data-testid="tweetText" lang="en">A post with some words in it, number ${i}, to give the page something to lay out.</div>
  <div role="group"><div><button data-testid="reply">r</button></div><div><button data-testid="retweet">t</button></div><div><button data-testid="like">l</button></div><div><button data-testid="bookmark">b</button></div></div></article></div>`;
const TIMELINE = `<!doctype html><html><body><div id="react-root" style="display:flex"><header role="banner"><a href="/i/grok">Grok</a><a href="/i/chat">Chat</a></header>
  <main role="main"><div><div><div data-testid="primaryColumn"><section aria-label="Timeline: Home" id="feed">${Array.from({ length: 80 }, (_, i) => POST(i)).join("")}</section></div>
  <div data-testid="sidebarColumn"><div><div><div><div><div><div>Search</div><div>Trends</div></div></div></div></div></div></div></div></main></div></body></html>`;

const CARD = (i: number | string) =>
  `<ytd-compact-video-renderer><a href="/watch?v=${i}"><div id="thumbnail"></div><h3>A video that was recommended, number ${i}</h3></a></ytd-compact-video-renderer>`;
const watchPage = (
  cards: number,
) => `<!doctype html><html><body><ytd-app><div id="masthead-container"></div><ytd-page-manager id="page-manager"><ytd-watch-flexy role="main" video-id="x"><div id="columns"><div id="primary"><div id="player"><div id="movie_player" class="html5-video-player"><div class="ytp-right-controls"><button class="ytp-size-button" onclick="document.querySelector('ytd-watch-flexy').toggleAttribute('theater')"></button></div></div></div><div id="comments"></div></div>
  <div id="secondary"><div id="related">${Array.from({ length: cards }, (_, i) => CARD(i)).join("")}</div></div></div></ytd-watch-flexy></ytd-page-manager></ytd-app></body></html>`;

const CHAT = twitchChatPage(
  Array.from({ length: 60 }, (_, i) => [`viewer${i}`, `A line of chat, number ${i}`]),
);

interface Scene {
  name: string;
  url: string;
  /** null: the real page. */
  html: string | null;
  settleMs: number;
  /**
   * Every control is on otherwise, which hides most of the page, and a browser does no style work
   * for what's hidden. A costly selector only shows on a page that's still there.
   */
  controlsOff?: boolean;
  work?: (page: Page) => Promise<void>;
}

const addComments = (page: Page) =>
  everyTick(
    page,
    `document.querySelector("#comments").insertAdjacentHTML("beforeend", value.replaceAll("NUMBER", String(i)));`,
    50,
    50,
    CARD("NUMBER"),
  );

const SCENES: Scene[] = [
  {
    name: "Unrelated site",
    url: "https://example.org/",
    html: "<!doctype html><title>x</title><p>hello</p>",
    settleMs: 1000,
  },
  {
    name: "Busy X timeline",
    url: "https://x.com/home",
    html: TIMELINE,
    settleMs: 1500,
    work: (page) =>
      everyTick(
        page,
        `const feed = document.querySelector("#feed");
         feed.insertAdjacentHTML("beforeend", value.replaceAll("NUMBER", String(i)));
         feed.firstElementChild.remove();`,
        100,
        50,
        POST("NUMBER"),
      ),
  },
  {
    name: "Busy Twitch chat",
    url: "https://www.twitch.tv/somestreamer",
    html: CHAT,
    settleMs: 2500,
    work: (page) =>
      everyTick(
        page,
        `const chat = document.querySelector('[data-a-target="chat-scroller"]');
         const line = chat.firstElementChild.cloneNode(true);
         line.querySelector(".text-fragment").innerHTML = i % 3 === 0
           ? value.replaceAll("NUMBER", String(i))
           : "Another line of chat, number " + i;
         chat.append(line);
         chat.firstElementChild.remove();`,
        100,
        50,
        chatLink("https://example.com/NUMBER"),
      ),
  },
  {
    name: "YouTube watch page",
    url: "https://www.youtube.com/watch?v=x",
    html: watchPage(60),
    settleMs: 1500,
    work: addComments,
  },
  {
    name: "Long YouTube page, controls off",
    url: "https://www.youtube.com/watch?v=x",
    html: watchPage(600),
    settleMs: 1500,
    controlsOff: true,
    work: addComments,
  },
];
if (flags.live)
  SCENES.push({
    name: "YouTube watch page (live)",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    html: null,
    settleMs: 6000,
  });

interface Sample {
  /** Script, style and layout, from before the page loads until its changes have stopped. */
  workMs: number;
  scriptMs: number;
  styleMs: number;
  layoutMs: number;
  heapKb: number;
  styleRecalcs: number;
  layouts: number;
  /** Times a function of ours ran. */
  calls: number;
  nodes: number;
  listeners: number;
}

async function measure(browser: Browser, scene: Scene, countCalls = false): Promise<Sample> {
  await setControls.get(browser)?.(!scene.controlsOff);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  if (scene.html !== null) {
    await page.setRequestInterception(true);
    // A real page takes longer to parse than our settings take to read. A stub would race them,
    // and our script renders once more depending on which wins.
    const body = scene.html.replace(
      "<!doctype html>",
      `<!doctype html><script src="${SLOW}"></script>`,
    );
    page.on("request", async (request) => {
      const url = new URL(request.url());
      if (url.pathname === SLOW) await sleep(SLOW_MS);
      const answer =
        url.pathname === SLOW
          ? request.respond({ status: 200, contentType: "text/javascript", body: "" })
          : request.url() === scene.url
            ? request.respond({ status: 200, contentType: "text/html", body })
            : request.abort();
      void answer.catch(() => {});
    });
  }
  const cdp = await page.createCDPSession();
  await cdp.send("Profiler.enable");
  // It keeps every function from being optimized, so it doesn't run when the time is what counts.
  if (countCalls)
    await cdp.send("Profiler.startPreciseCoverage", { callCount: true, detailed: false });
  await page.goto(scene.url, { waitUntil: "load", timeout: 60_000 });
  await page.bringToFront();
  await sleep(scene.settleMs);
  await scene.work?.(page);
  await sleep(300);
  await cdp.send("HeapProfiler.collectGarbage");
  const m = await page.metrics();
  let calls = 0;
  if (countCalls) {
    const { result } = await cdp.send("Profiler.takePreciseCoverage");
    for (const script of result)
      if (script.url.startsWith("chrome-extension://"))
        for (const fn of script.functions) calls += fn.ranges[0]?.count ?? 0;
  }
  await page.close();
  const ms = (seconds = 0) => seconds * 1000;
  return {
    workMs: ms(m.ScriptDuration) + ms(m.RecalcStyleDuration) + ms(m.LayoutDuration),
    scriptMs: ms(m.ScriptDuration),
    styleMs: ms(m.RecalcStyleDuration),
    layoutMs: ms(m.LayoutDuration),
    heapKb: (m.JSHeapUsedSize ?? 0) / 1024,
    styleRecalcs: m.RecalcStyleCount ?? 0,
    layouts: m.LayoutCount ?? 0,
    calls,
    nodes: m.Nodes ?? 0,
    listeners: m.JSEventListeners ?? 0,
  };
}

const launch = (extension: string | null) =>
  puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    pipe: true,
    args: [
      "--disable-gpu",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
    ...(extension && { enableExtensions: [extension] }),
    defaultViewport: null,
  });

const setControls = new Map<Browser, (on: boolean) => Promise<void>>();

async function launchWith(extension: string): Promise<Browser> {
  const browser = await launch(extension);
  const target = await browser.waitForTarget((t) => t.type() === "service_worker");
  const worker = (await target.worker())!;
  let current: boolean | undefined;
  setControls.set(browser, async (on) => {
    if (on === current) return;
    current = on;
    const values = Object.fromEntries(
      CONTROL_SITES.flatMap((site) =>
        site.features.map((f) => [`unhooked.site.${site.id}.${f.id}`, on] as const),
      ),
    );
    await worker.evaluate((all) => chrome.storage.local.set(all), values);
    await sleep(500);
  });
  return browser;
}

/** An earlier commit's build, from its own files. node_modules is only what it builds with. */
async function buildRef(ref: string): Promise<string> {
  const source = join(WORK, "ref-source");
  await mkdir(source, { recursive: true });
  await $`git archive ${ref} | tar -x -C ${source}`;
  await symlink(resolve("node_modules"), join(source, "node_modules"));
  const outdir = join(WORK, "ref");
  const script = `import { buildExtension } from "./build.ts";
    await buildExtension({ target: "chrome", outdir: ${JSON.stringify(outdir)}, minify: true });`;
  await $`bun -e ${script}`.cwd(source).quiet();
  return outdir;
}

await rm(WORK, { recursive: true, force: true });
const here = join(WORK, "here");
await buildExtension({ target: "chrome", outdir: here, minify: true });

const plain = await launch(null);
const ours = await launchWith(here);
const failures: string[] = [];
const lines: string[] = [];
const say = (line = "") => {
  console.log(line);
  lines.push(line);
};
const sceneHtml = SCENES.filter(
  (scene) => scene.html !== null && (!flags.scene || scene.name.includes(flags.scene)),
);

// How often our code ran and what it added to the page, which no machine changes.
const counts: Record<string, { calls: number; nodes: number; listeners: number }> = {};
for (const scene of sceneHtml) {
  const [without, withUs] = [await measure(plain, scene), await measure(ours, scene, true)];
  counts[scene.name] = {
    calls: withUs.calls,
    nodes: withUs.nodes - without.nodes,
    listeners: withUs.listeners - without.listeners,
  };
}
say("### What runs and what's added");
say();
say("| Page | Calls into our code | Nodes added | Listeners added |");
say("| :-- | --: | --: | --: |");
for (const [name, c] of Object.entries(counts))
  say(`| ${name} | ${c.calls} | ${c.nodes} | ${c.listeners} |`);
say();

if (flags.update) {
  await writeFile(RECORD, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`Recorded in ${RECORD}`);
}
if (flags.check) {
  const recorded: typeof counts = JSON.parse(await readFile(RECORD, "utf8"));
  for (const [name, now] of Object.entries(counts)) {
    for (const key of ["calls", "nodes", "listeners"] as const) {
      const was = recorded[name]?.[key] ?? 0;
      if (Math.abs(now[key] - was) > was * COUNT_SLACK)
        failures.push(
          `${name}: ${key} ${was} recorded, ${now[key]} now. If this is meant, run \`bun run bench:update\` and commit it.`,
        );
    }
  }
}
// The one thing that's never negotiable: on any other site, none of it runs.
if (counts["Unrelated site"]?.calls)
  failures.push(`Our code ran ${counts["Unrelated site"].calls} times on an unrelated site.`);

if (flags.compare || !flags.update) {
  const ref = flags.compare ? await launchWith(await buildRef(flags.compare)) : null;
  const builds = [
    ["without", plain],
    ["here", ours],
    ...(ref ? [["ref", ref] as const] : []),
  ] as const;
  const samples = new Map<string, Sample[]>();
  const scenes = flags.live
    ? [...sceneHtml, ...SCENES.filter((each) => each.html === null)]
    : sceneHtml;
  /** Taking turns, starting with a different one each round, so a slow moment hits them all. */
  const sample = async (scene: Scene, rounds: number) => {
    for (let run = 0; run < rounds; run++) {
      for (let turn = 0; turn < builds.length; turn++) {
        const [name, browser] = builds[(turn + run) % builds.length]!;
        const key = `${scene.name}/${name}`;
        samples.set(key, [...(samples.get(key) ?? []), await measure(browser, scene)]);
      }
    }
  };
  const of = (scene: Scene, build: string) => samples.get(`${scene.name}/${build}`)!;
  const middle = (scene: Scene, build: string, key: keyof Sample) =>
    round1(median(of(scene, build).map((each) => each[key])));
  /** Round by round, so whatever the machine was doing during that round doesn't count. */
  const between = (scene: Scene, build: string, other: string, key: keyof Sample = "workMs") =>
    round1(median(of(scene, build).map((each, i) => each[key] - of(scene, other)[i]![key])));
  const tooSlow = (scene: Scene) => {
    const room = Math.max(SLOWER_MS, middle(scene, "ref", "workMs") * SLOWER_SHARE);
    const styleRoom = Math.max(
      SLOWER_STYLE_MS,
      middle(scene, "ref", "styleMs") * SLOWER_STYLE_SHARE,
    );
    return (
      between(scene, "here", "ref") > room || between(scene, "here", "ref", "styleMs") > styleRoom
    );
  };

  for (const scene of scenes) {
    await sample(scene, RUNS);
    // A shared machine can have a bad minute, so a slowdown has to show up twice.
    if (ref && tooSlow(scene)) await sample(scene, RUNS);
  }

  say(`### Time, median of at least ${RUNS} runs`);
  say();
  say("| Page | Measure | Without | With |" + (ref ? " Before this change |" : ""));
  say("| :-- | :-- | --: | --: |" + (ref ? " --: |" : ""));
  for (const scene of scenes) {
    for (const [label, key] of [
      ["Script ms", "scriptMs"],
      ["Style ms", "styleMs"],
      ["Layout ms", "layoutMs"],
      ["Style passes", "styleRecalcs"],
      ["Layouts", "layouts"],
      ["Memory KB", "heapKb"],
    ] as const) {
      const before = ref ? ` ${middle(scene, "ref", key)} |` : "";
      say(
        `| ${scene.name} | ${label} | ${middle(scene, "without", key)} | ${middle(scene, "here", key)} |${before}`,
      );
    }
    const before = ref ? ` ${between(scene, "ref", "without")} |` : "";
    say(
      `| ${scene.name} | **Our cost, ms** | | **${between(scene, "here", "without")}** |${before}`,
    );
    if (ref) {
      const change = between(scene, "here", "ref");
      const style = between(scene, "here", "ref", "styleMs");
      say(`| ${scene.name} | **Change, ms** | | **${change}**, of which style ${style} | |`);
      if (tooSlow(scene))
        failures.push(
          `${scene.name}: ${change} ms more work than ${flags.compare}, ${style} ms of it style.`,
        );
    }
  }
  say();
  await ref?.close();
}

await plain.close();
await ours.close();

if (failures.length) {
  say("### Failed");
  say();
  for (const failure of failures) say(`- ${failure}`);
}
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
process.exit(failures.length ? 1 : 0);
