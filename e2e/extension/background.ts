// Test build only: runs the real background unchanged, plus a small hook the tests talk to.
// Firefox won't let automation open extension pages, so tests reach the extension through
// bridge.ts (a content script on the harness's own page) instead.
import "../../src/background.ts";
import { ext } from "../../src/shared/ext-api.ts";
import { frontTab, step } from "../../src/time/background.ts";
import {
  allDays,
  eraseAll,
  getIcons,
  getTracker,
  putDays,
  setIcon,
  setTracker,
  type DayRecord,
} from "../../src/time/store.ts";

type Op = {
  op:
    | "set"
    | "get"
    | "timeSeed"
    | "timeDays"
    | "timeState"
    | "timeSnapshot"
    | "tabId"
    | "inject"
    | "send";
  args: never;
};

import type { FrontTab } from "../../src/time/tracker.ts";

async function run({ op, args }: { op: string; args: unknown }): Promise<unknown> {
  switch (op) {
    case "set":
      await ext.storage.local.set(args as Record<string, unknown>);
      return {};
    case "get":
      return ext.storage.local.get(args as string[]);
    case "timeSeed":
      await eraseAll();
      await putDays(args as DayRecord[]);
      return {};
    case "timeStep": {
      // A step with the browser's signals overridden: what can't be staged for real in a test.
      const signals = args as Partial<FrontTab>;
      await step(async () => {
        const tab = await frontTab();
        return tab ? { ...tab, ...signals } : tab;
      });
      return {};
    }
    case "timeRewind": {
      // As if the computer had slept since the last step.
      const state = await getTracker();
      const by = args as number;
      await setTracker({
        ...state,
        watch: state.watch && {
          ...state.watch,
          since: state.watch.since - by,
          stretch: state.watch.stretch - by,
        },
      });
      return {};
    }
    case "timeIcons":
      await step();
      return getIcons();
    case "timeSetIcon": {
      const { host, src } = args as { host: string; src: string };
      await setIcon(host, src, Date.now());
      return {};
    }
    case "timeRead": {
      // What's stored, without taking a step that would use the real signals.
      const [days, state] = await Promise.all([allDays(), getTracker()]);
      return { days, state };
    }
    case "timeSnapshot": {
      // Both from the same step, with no time passing between them.
      await step();
      const [days, state] = await Promise.all([allDays(), getTracker()]);
      return { days, state };
    }
    case "timeState":
      await step();
      return getTracker();
    case "timeDays":
      await step();
      return allDays();
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
    default:
      throw new Error(`unknown e2e op ${op}`);
  }
}

ext.runtime.onMessage.addListener((message: { action?: string } & Partial<Op>, _sender, send) => {
  if (message?.action !== "e2e") return false;
  run({ op: message.op!, args: message.args }).then(send, (e) => send({ error: String(e) }));
  return true;
});
