/**
 * Asks for access to all sites, for film mode's screenshots or for chat link previews. A page's own
 * script can't ask, because a browser only shows the prompt for a click in the extension's own page.
 */
import { ext } from "../../shared/ext-api.ts";
import { STORAGE_KEYS } from "../../shared/settings.ts";
import { FILM_SHOOT, SCREENSHOT_ACCESS } from "../../sites/film/protocol.ts";

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const query = new URLSearchParams(location.search);
const tabId = Number(query.get("tab"));
const forPreviews = query.get("for") === "previews";

if (forPreviews) {
  $("title").textContent = "See what every link in chat is?";
  $("why").textContent =
    "Previewing any link means reading that page's title and picture, and a browser only allows that with access to all sites. Your browser will word it broadly. Unhooked uses it for one thing: reading a link's page when you point at it, without your accounts, and showing the picture it names.";
}

$("allow").addEventListener("click", async () => {
  const allowed = await ext.permissions.request(SCREENSHOT_ACCESS).catch(() => false);
  if (!allowed) {
    $("status").textContent = forPreviews
      ? "Not allowed, so links keep their short cards."
      : "Not allowed, so film mode can't save pictures yet.";
    return;
  }
  if (forPreviews) {
    await ext.storage.local.set({ [STORAGE_KEYS.TWITCH_LINK_PREVIEWS]: true });
    window.close();
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
