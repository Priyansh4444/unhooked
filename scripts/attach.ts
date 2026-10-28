// bun scripts/attach.ts <command> — check the sites in the browser you already use, signed in.
//
// For a running Chromium browser (Helium, Chrome 144+): open chrome://inspect/#remote-debugging,
// turn remote debugging on, then `serve`. The browser asks you to allow the connection once;
// `serve` keeps that one connection and every other command goes through it, so you aren't
// asked again. BROWSER_PROFILE overrides the profile directory (default: Helium's).
//
//   serve                                  connect and keep the connection (run it in the background)
//   tabs                                   list open tabs; * marks the ones opened here
//   open <url> [width]                     open a page in its own window, behind yours
//   goto <url-part> <url>                  navigate a tab opened here
//   measure <url-part> 'label=selector' …  how many elements each selector matches, and where
//   outline <url-part> [root] [depth]      the tab's structure: tags, roles, test ids, labels
//   eval <url-part> <expression>           evaluate in a tab (read the page, don't change yours)
//   shot <url-part> <file.png>             screenshot a tab opened here
//   quit                                   close the windows opened here and disconnect
//
// Your own tabs are only ever read: open/goto/shot work on the windows this opened, and quit
// closes those and disconnects without closing the browser.
import puppeteer, { type Page } from "puppeteer-core";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.ATTACH_PORT ?? 9333);
const [command = "tabs", ...args] = process.argv.slice(2);

if (command === "serve") await serve();
else await client();

async function serve(): Promise<void> {
  const profile = process.env.BROWSER_PROFILE ?? join(homedir(), ".config", "net.imput.helium");
  const active = await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(() => "");
  const [port, path] = active.trim().split("\n");
  if (!port || !path) {
    console.error(
      `No DevToolsActivePort in ${profile}. Turn on chrome://inspect/#remote-debugging there.`,
    );
    process.exit(1);
  }
  const browser = await puppeteer.connect({
    browserWSEndpoint: `ws://127.0.0.1:${port}${path}`,
    defaultViewport: null,
  });
  const mine = new Set<Page>();
  const find = async (part: string, own = false): Promise<Page> => {
    for (const page of mine) if (page.isClosed()) mine.delete(page);
    for (const page of mine) if (page.url().includes(part)) return page;
    if (!own) for (const page of await browser.pages()) if (page.url().includes(part)) return page;
    throw new Error(`No ${own ? "tab opened here" : "tab"} whose address contains "${part}"`);
  };
  const go = async (page: Page, url: string) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 7000));
    return page.url();
  };

  const run: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
    tabs: async () => (await browser.pages()).map((p) => `${mine.has(p) ? "* " : "  "}${p.url()}`),
    open: async ({ url, width }) => {
      // A window of its own, opened behind yours, so the one you're using is left alone.
      const session = await browser.target().createCDPSession();
      const { targetId } = await session.send("Target.createTarget", {
        url: "about:blank",
        newWindow: true,
        background: true,
      });
      const target = await browser.waitForTarget(
        (t) => (t as unknown as { _targetId: string })._targetId === targetId,
      );
      const page = (await target.page())!;
      mine.add(page);
      if (width) await page.setViewport({ width: Number(width), height: 1000 });
      return go(page, String(url));
    },
    goto: async ({ part, url }) => go(await find(String(part), true), String(url)),
    eval: async ({ part, expression }) => (await find(String(part))).evaluate(String(expression)),
    shot: async ({ part, file }) => {
      await (await find(String(part), true)).screenshot({ path: String(file) as `${string}.png` });
      return file;
    },
    quit: async () => {
      for (const page of mine) await page.close().catch(() => {});
      await browser.disconnect();
      setTimeout(() => process.exit(0), 100);
      return "disconnected";
    },
  };

  Bun.serve({
    port: PORT,
    hostname: "127.0.0.1",
    idleTimeout: 120,
    async fetch(request) {
      const name = new URL(request.url).pathname.slice(1);
      try {
        const handler = run[name];
        if (!handler) throw new Error(`unknown command ${name}`);
        return Response.json({ result: await handler((await request.json()) as never) });
      } catch (error) {
        return Response.json({ error: String(error) });
      }
    },
  });
  console.log(`Connected. Commands go to http://127.0.0.1:${PORT}.`);
}

async function client(): Promise<void> {
  const call = async (name: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(`http://127.0.0.1:${PORT}/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!response) throw new Error("Not connected: run `bun scripts/attach.ts serve` first.");
    const reply = (await response.json()) as { result?: unknown; error?: string };
    if (reply.error) throw new Error(reply.error);
    return reply.result;
  };
  const [part = "", ...rest] = args;
  const print = (value: unknown) =>
    console.log(typeof value === "string" ? value : JSON.stringify(value, null, 1));

  switch (command) {
    case "tabs":
      return console.log(((await call("tabs")) as string[]).join("\n"));
    case "open":
      return print(await call("open", { url: part, width: rest[0] }));
    case "goto":
      return print(await call("goto", { part, url: rest[0] }));
    case "eval":
      return print(await call("eval", { part, expression: rest.join(" ") }));
    case "shot":
      return print(await call("shot", { part, file: rest[0] }));
    case "quit":
      return print(await call("quit"));
    case "measure":
      for (const spec of rest) {
        const at = spec.indexOf("=");
        const [label, selector] = [spec.slice(0, at), spec.slice(at + 1)];
        const expression = `(${measure})(${JSON.stringify(selector)})`;
        console.log(
          `${label.padEnd(22)} ${JSON.stringify(await call("eval", { part, expression }))}`,
        );
      }
      return;
    case "outline": {
      const [root = "body", depth = "12"] = rest;
      const expression = `(${outline})(${JSON.stringify(root)}, ${Number(depth)})`;
      return print(await call("eval", { part, expression }));
    }
    default:
      console.error(`unknown command ${command}`);
      process.exitCode = 1;
  }
}

// These two run in the page (sent as source), so they only use what the page has.
function measure(selector: string) {
  let elements: Element[];
  try {
    elements = [...document.querySelectorAll(selector)];
  } catch (error) {
    return { error: String(error) };
  }
  const rects = elements
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 4 && r.height > 4);
  if (!rects.length) return { count: elements.length, box: null };
  const x = Math.min(...rects.map((r) => r.left));
  const y = Math.min(...rects.map((r) => r.top + scrollY));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom + scrollY));
  return {
    count: elements.length,
    visible: rects.length,
    box: [x, y, right - x, bottom - y].map(Math.round),
  };
}

function outline(root: string, maxDepth: number) {
  const lines: string[] = [];
  const attributes = ["role", "data-testid", "data-pagelet", "data-e2e", "aria-label", "href"];
  const describe = (el: Element) => {
    const r = el.getBoundingClientRect();
    const attrs = attributes
      .filter((a) => el.hasAttribute(a))
      .map((a) => `[${a}=${(el.getAttribute(a) ?? "").slice(0, 50)}]`)
      .join("");
    const id = el.id ? `#${el.id}` : "";
    const at = `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top + scrollY)}`;
    return `${el.tagName.toLowerCase()}${id}${attrs} ${at}`;
  };
  const walk = (el: Element, depth: number) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    lines.push(`${"  ".repeat(depth)}${describe(el)}`);
    if (depth < maxDepth) for (const child of el.children) walk(child, depth + 1);
  };
  const start = document.querySelector(root);
  if (!start) return `nothing matches ${root}`;
  walk(start, 0);
  return lines.slice(0, 500).join("\n");
}
