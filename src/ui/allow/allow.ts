/**
 * Asks for access film mode's screenshots need. A page's own script can't ask, because a browser
 * only shows the prompt for a click in the extension's own page, so film mode opens this one.
 */
import { ext } from "../../shared/ext-api.ts";
import { FILM_SHOOT, SCREENSHOT_ACCESS } from "../../sites/film/protocol.ts";

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const tabId = Number(new URLSearchParams(location.search).get("tab"));

$("allow").addEventListener("click", async () => {
  const allowed = await ext.permissions.request(SCREENSHOT_ACCESS).catch(() => false);
  if (!allowed) {
    $("status").textContent = "Not allowed, so film mode can't save pictures yet.";
    return;
  }
  // Back to the tab it was asked from, which takes the picture it was asked for.
  if (tabId) {
    const tab = await ext.tabs.update(tabId, { active: true }).catch(() => undefined);
    if (tab?.windowId !== undefined)
      await ext.windows.update(tab.windowId, { focused: true }).catch(() => {});
    setTimeout(() => {
      void ext.tabs.sendMessage(tabId, { action: FILM_SHOOT }).catch(() => {});
      window.close();
    }, 300);
  } else window.close();
});
$("later").addEventListener("click", () => window.close());
