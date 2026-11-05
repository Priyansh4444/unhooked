/**
 * One shared hover card for every pill: short open delay, closes on leave, a single DOM node.
 * What's inside it comes from card-views.ts.
 */

import { classifyLink, type LinkMeta } from "../links.ts";
import { renderLink, renderSkeleton } from "./card-views.ts";
import { PILL_CLASS, applyMetaToPill, pillUrl } from "./pill.ts";
import { knownLinkMeta, resolveLinkMeta } from "./resolve-client.ts";

const CARD_ID = "uh-twitch-hovercard";
/** Long enough to cross from a pill to its card without it closing. */
const CLOSE_GRACE_MS = 180;
const GAP_PX = 6;
const EDGE_PX = 8;
/** The most a card takes up, and so how much room below a pill is plenty. */
const TALLEST_PX = 640;

let hoverDelayMs = 180;
let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let card: HTMLElement | null = null;
let activePill: HTMLElement | null = null;
let bound = false;
/** Pill under the pointer whose open delay is running. */
let pendingPill: HTMLElement | null = null;
/** Last real pointer position (see onPointerMove). */
let pointer = { x: Number.NaN, y: Number.NaN };

export const setHoverDelay = (ms: number): void => {
  hoverDelayMs = Math.min(1200, Math.max(80, ms));
};

const inner = (): HTMLElement => card!.querySelector(".uh-hovercard__inner") as HTMLElement;

function ensureCard(): HTMLElement {
  if (card?.isConnected) return card;

  const el = document.createElement("div");
  el.id = CARD_ID;
  el.className = "uh-hovercard";
  el.setAttribute("role", "tooltip");
  el.hidden = true;
  el.innerHTML = '<div class="uh-hovercard__inner"></div>';
  document.documentElement.appendChild(el);

  card = el;
  return el;
}

function scheduleClose(): void {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(hide, CLOSE_GRACE_MS);
}

function hide(): void {
  clearTimeout(openTimer);
  pendingPill = null;
  activePill = null;
  if (!card) return;
  card.hidden = true;
  inner().replaceChildren(); // also stops any playing video / embed
}

/**
 * Decided once, when the card opens, and held by the edge beside the pill. Whatever arrives after
 * that grows it away from the pill, and past the room there is it scrolls inside: a card that
 * re-measured itself would hop to the other side of the pill as its picture loaded. It stays put
 * as chat moves too.
 */
function place(pill: HTMLElement, el: HTMLElement): void {
  const box = pill.getBoundingClientRect();
  const roomBelow = innerHeight - box.bottom - GAP_PX - EDGE_PX;
  const roomAbove = box.top - GAP_PX - EDGE_PX;
  const below = roomBelow >= Math.min(TALLEST_PX, roomAbove);
  el.dataset.side = below ? "below" : "above";
  el.style.setProperty("--uh-pill-left", `${Math.round(box.left)}px`);
  el.style.top = below ? `${Math.round(box.bottom + GAP_PX)}px` : "auto";
  el.style.bottom = below ? "auto" : `${Math.round(innerHeight - box.top + GAP_PX)}px`;
  inner().style.maxHeight = `${Math.round(Math.min(TALLEST_PX, below ? roomBelow : roomAbove))}px`;
}

function show(el: HTMLElement, meta: LinkMeta): void {
  el.dataset.kind = meta.kind;
  if (meta.accent) el.style.setProperty("--uh-accent", meta.accent);
  else el.style.removeProperty("--uh-accent");
  renderLink(inner(), meta);
}

async function open(pill: HTMLElement): Promise<void> {
  const url = pillUrl(pill);
  if (!url) return;

  activePill = pill;
  const el = ensureCard();
  el.hidden = false;
  place(pill, el);
  const seen = knownLinkMeta(url);
  if (seen) {
    show(el, seen);
    if (pill instanceof HTMLAnchorElement) applyMetaToPill(pill, seen);
    return;
  }
  el.dataset.kind = classifyLink(url)?.kind ?? "generic";
  renderSkeleton(inner());

  const meta = await resolveLinkMeta(url);
  if (activePill !== pill) return; // moved on while waiting
  show(el, meta);
  if (pill instanceof HTMLAnchorElement) applyMetaToPill(pill, meta);
}

const pillOf = (event: Event): HTMLElement | null =>
  event.target instanceof Element ? event.target.closest<HTMLElement>(`.${PILL_CLASS}`) : null;

// Driven by real pointer movement only. A busy chat keeps scrolling under a still mouse, and the
// browser then reports the pointer "leaving" a pill (or "entering" another) although it never
// moved; reacting to that closed the card a moment after it opened, or opened the wrong one.
const onPointerMove = (event: PointerEvent) => {
  if (event.clientX === pointer.x && event.clientY === pointer.y) return; // content moved, not the mouse
  pointer = { x: event.clientX, y: event.clientY };

  const pill = pillOf(event);
  if (pill) {
    clearTimeout(closeTimer);
    if (pill === activePill || pill === pendingPill) return;
    clearTimeout(openTimer);
    pendingPill = pill;
    openTimer = setTimeout(() => {
      pendingPill = null;
      void open(pill);
    }, hoverDelayMs);
    return;
  }
  clearTimeout(openTimer);
  pendingPill = null;
  if (card && event.target instanceof Node && card.contains(event.target)) {
    clearTimeout(closeTimer); // on the way into (or inside) the card
  } else if (activePill) {
    scheduleClose();
  }
};

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Escape") hide();
};

export function bindHovercard(): void {
  if (bound) return;
  bound = true;
  document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  document.addEventListener("keydown", onKeyDown, true);
}

export function unbindHovercard(): void {
  if (!bound) return;
  bound = false;
  document.removeEventListener("pointermove", onPointerMove, { capture: true });
  document.removeEventListener("keydown", onKeyDown, true);
  hide();
  card?.remove();
  card = null;
}
