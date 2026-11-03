/** Turns chat links into compact chips (icon + short label) and back. */

import {
  classifyLink,
  enrichedPillLabelFromMeta,
  type ClassifiedLink,
  type LinkMeta,
} from "../links.ts";
import { iconForKind } from "./icons.ts";
import { resolveLinkMeta } from "./resolve-client.ts";

export const PILL_CLASS = "uh-link-pill";
const KIND_ATTR = "data-uh-kind";
const URL_ATTR = "data-uh-url";

/** How the anchor looked before we touched it, so turning pills off puts it back. */
interface Original {
  children: Node[];
  title: string | null;
  rel: string | null;
  ariaLabel: string | null;
}
const originals = new WeakMap<HTMLAnchorElement, Original>();

const isPill = (anchor: Element): boolean => Boolean(anchor.closest(`.${PILL_CLASS}`));

export const pillUrl = (pill: Element): string | null => pill.getAttribute(URL_ATTR);

// ---- labels ----------------------------------------------------------------------------------

function setLabel(anchor: HTMLAnchorElement, label: string): void {
  const el = anchor.querySelector(".uh-link-pill__label");
  if (el) el.textContent = label;
  anchor.setAttribute("aria-label", `Link: ${label}`);
}

/** Show what a lookup learned: a better label, and the full text as the tooltip. */
export function applyMetaToPill(anchor: HTMLAnchorElement, meta: LinkMeta): void {
  setLabel(anchor, enrichedPillLabelFromMeta(meta));
  const handle = meta.authorHandle ? `@${meta.authorHandle}` : null;
  anchor.title = [handle, meta.title, meta.url].filter(Boolean).join("\n");
}

// Newest chat lines first, a few lookups at a time.
const lookups: Array<() => Promise<void>> = [];
let activeLookups = 0;
const MAX_LOOKUPS = 4;

function pumpLookups(): void {
  while (activeLookups < MAX_LOOKUPS && lookups.length) {
    activeLookups++;
    void lookups.pop()!().finally(() => {
      activeLookups--;
      pumpLookups();
    });
  }
}

function enrichLabel(anchor: HTMLAnchorElement, url: string): void {
  lookups.push(async () => {
    const meta = await resolveLinkMeta(url);
    if (anchor.isConnected && isPill(anchor)) applyMetaToPill(anchor, meta);
  });
  pumpLookups();
}

// ---- pillify / unpillify ---------------------------------------------------------------------

function makePill(anchor: HTMLAnchorElement, link: ClassifiedLink): void {
  originals.set(anchor, {
    children: Array.from(anchor.childNodes),
    title: anchor.getAttribute("title"),
    rel: anchor.getAttribute("rel"),
    ariaLabel: anchor.getAttribute("aria-label"),
  });

  anchor.classList.add(PILL_CLASS, `${PILL_CLASS}--${link.kind}`);
  anchor.setAttribute(KIND_ATTR, link.kind);
  anchor.setAttribute(URL_ATTR, link.url);
  anchor.title = link.url;
  anchor.rel ||= "noopener noreferrer";

  const icon = document.createElement("span");
  icon.className = "uh-link-pill__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = iconForKind(link.kind);
  const label = document.createElement("span");
  label.className = "uh-link-pill__label";
  anchor.replaceChildren(icon, label);
  setLabel(anchor, link.label);
}

/**
 * Only links typed in the message become pills. Twitch also renders anchors of its own (the
 * preview card under a clip link, with a thumbnail): pillifying those would wreck the card.
 */
function isMessageLink(anchor: HTMLAnchorElement): boolean {
  if (anchor.querySelector("img, video, picture, svg, div, button")) return false;
  const line = anchor.closest(".chat-line__message, [data-a-target='chat-line-message']");
  const body = line?.querySelector("[data-a-target='chat-line-message-body']");
  return !body || body.contains(anchor);
}

/** Pillify one anchor. Returns the classification if it became a pill, else null. */
export function pillify(anchor: HTMLAnchorElement): ClassifiedLink | null {
  if (isPill(anchor) || !isMessageLink(anchor)) return null;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;
  const link = classifyLink(href, location.href);
  if (!link) return null;

  makePill(anchor, link);
  if (link.enrichable) enrichLabel(anchor, link.url);
  return link;
}

function unpillify(anchor: HTMLAnchorElement): void {
  const original = originals.get(anchor);
  if (original) {
    anchor.replaceChildren(...original.children);
    for (const [name, value] of [
      ["title", original.title],
      ["rel", original.rel],
      ["aria-label", original.ariaLabel],
    ] as const) {
      if (value === null) anchor.removeAttribute(name);
      else anchor.setAttribute(name, value);
    }
    originals.delete(anchor);
  }
  anchor.classList.remove(PILL_CLASS, `${PILL_CLASS}--${anchor.getAttribute(KIND_ATTR)}`);
  anchor.removeAttribute(KIND_ATTR);
  anchor.removeAttribute(URL_ATTR);
}

export const unpillifyAll = (root: ParentNode): void =>
  root.querySelectorAll<HTMLAnchorElement>(`a.${PILL_CLASS}`).forEach(unpillify);

/** Every anchor at or under `node`. */
export function collectAnchors(node: Node): HTMLAnchorElement[] {
  if (!(node instanceof Element)) return [];
  const anchors = Array.from(node.querySelectorAll<HTMLAnchorElement>("a[href]"));
  return node instanceof HTMLAnchorElement ? [node, ...anchors] : anchors;
}
