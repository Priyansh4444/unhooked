/** A link's mark: its site's logo if it ships with us, the browser's favicon, or a drawn icon. */
import { ext } from "../../../shared/ext-api.ts";
import { siteIcon } from "../../../shared/site-icons.ts";
import type { LinkKind } from "../links.ts";
import { iconForKind } from "./icons.ts";

function browserFavicon(host: string): string | undefined {
  if (!ext.runtime.getManifest().permissions?.includes("favicon")) return undefined;
  const url = new URL(ext.runtime.getURL("_favicon/"));
  url.searchParams.set("pageUrl", `https://${host}/`);
  url.searchParams.set("size", "32");
  return url.href;
}

export function fillGlyph(slot: HTMLElement, kind: LinkKind, host: string): void {
  const drawn = () => {
    slot.innerHTML = iconForKind(kind);
  };
  const logo = siteIcon(host);
  const src = logo
    ? ext.runtime.getURL(logo)
    : kind === "generic"
      ? browserFavicon(host)
      : undefined;
  if (!src) {
    drawn();
    return;
  }
  const image = document.createElement("img");
  image.alt = "";
  image.decoding = "async";
  image.addEventListener("error", drawn, { once: true });
  image.src = src;
  slot.replaceChildren(image);
}
