/** Sends a hover preview to a tab, loading the preview script there the first time. */
import { ext } from "./ext-api.ts";
import { injectScript } from "./inject.ts";
import type { PreviewRequest } from "../sites/custom/protocol.ts";

const loaded = new Set<number>();

export async function previewOnTab(tabId: number, message: PreviewRequest): Promise<void> {
  if (!loaded.has(tabId)) {
    // Nothing to clear on a tab that never showed one.
    if (message.clear) return;
    await injectScript(tabId, "sites/preview/content.js");
    loaded.add(tabId);
  }
  try {
    await ext.tabs.sendMessage(tabId, message);
  } catch {
    // The tab has moved to a new page since, which starts without the script.
    loaded.delete(tabId);
    if (message.clear) return;
    await injectScript(tabId, "sites/preview/content.js");
    loaded.add(tabId);
    await ext.tabs.sendMessage(tabId, message);
  }
}
