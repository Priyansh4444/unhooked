// Test build only: runs the real background unchanged, plus a small hook the tests talk to.
// Firefox won't let automation open extension pages, so tests reach the extension through
// bridge.ts (a content script on the harness's own page) instead.
import "../../src/background.ts";
import { ext, getActionApi } from "../../src/shared/ext-api.ts";

type Op = { op: "set" | "get" | "badge" | "tabId" | "inject" | "send"; args: never };

async function run({ op, args }: { op: string; args: unknown }): Promise<unknown> {
  switch (op) {
    case "set":
      await ext.storage.local.set(args as Record<string, unknown>);
      return {};
    case "get":
      return ext.storage.local.get(args as string[]);
    case "tabId":
      // id of the first tab whose URL contains `args`
      return (await ext.tabs.query({})).find((t) => t.url?.includes(args as string))?.id ?? null;
    case "inject": {
      // run an extension script in the first tab whose URL contains `url` (the popup's wand button)
      const { url, file } = args as { url: string; file: string };
      const tab = (await ext.tabs.query({})).find((t) => t.url?.includes(url));
      if (tab?.id === undefined) return { error: "no tab" };
      await ext.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
      return {};
    }
    case "send": {
      // message the first tab whose URL contains `url` (the popup's and picker's hover preview)
      const { url, message } = args as { url: string; message: unknown };
      const tab = (await ext.tabs.query({})).find((t) => t.url?.includes(url));
      return tab?.id === undefined ? null : ext.tabs.sendMessage(tab.id, message);
    }
    case "badge": {
      // badge text of the first tab whose URL contains `args`
      const tab = (await ext.tabs.query({})).find((t) => t.url?.includes(args as string));
      return tab?.id === undefined ? null : getActionApi().getBadgeText({ tabId: tab.id });
    }
    default:
      throw new Error(`unknown e2e op ${op}`);
  }
}

ext.runtime.onMessage.addListener((message: { action?: string } & Partial<Op>, _sender, send) => {
  if (message?.action !== "e2e") return false;
  run({ op: message.op!, args: message.args }).then(send, (e) => send({ error: String(e) }));
  return true;
});
