/** A link's mark: its site's favicon, fetched when it's shown, or a drawn icon without one. */
import { isPublicHost, type LinkKind } from "../links.ts";
import { iconForKind } from "./icons.ts";

/** Addresses whose own icon says less than the site they belong to. */
const SAME_SITE: Record<string, string> = { "t.co": "x.com", "youtu.be": "youtube.com" };
/** Only the domain goes to this service, and with no referrer it doesn't learn the page. */
const iconUrl = (host: string) =>
  `https://icons.duckduckgo.com/ip3/${encodeURIComponent(SAME_SITE[host] ?? host)}.ico`;

export function fillGlyph(slot: HTMLElement, kind: LinkKind, host: string): void {
  const drawn = () => {
    slot.innerHTML = iconForKind(kind);
  };
  if (!isPublicHost(host)) {
    drawn();
    return;
  }
  const image = document.createElement("img");
  image.alt = "";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", drawn, { once: true });
  image.src = iconUrl(host);
  slot.replaceChildren(image);
}
