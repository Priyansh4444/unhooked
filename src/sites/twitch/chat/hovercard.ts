/**
 * One shared hover card for every pill: short open delay, closes on leave, a single DOM node.
 * What's inside it comes from card-views.ts.
 */

import { classifyLink } from "../links.ts";
import { renderLink, renderSkeleton } from "./card-views.ts";
import { PILL_CLASS, applyMetaToPill, pillUrl } from "./pill.ts";
import { resolveLinkMeta } from "./resolve-client.ts";

const CARD_ID = "uh-twitch-hovercard";
const CLOSE_GRACE_MS = 100;

let hoverDelayMs = 180;
let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let card: HTMLElement | null = null;
let resizeWatch: ResizeObserver | null = null;
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

  // Embeds and images change the card's height after it opened: keep it on screen.
  resizeWatch = new ResizeObserver(() => {
    if (activePill && !el.hidden) position(activePill, el);
  });
  resizeWatch.observe(el);

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

/** Below the pill, flipped above if it would be cut off, kept inside the viewport. */
function position(pill: HTMLElement, el: HTMLElement): void {
  const pillBox = pill.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const margin = 8;
  let top = pillBox.bottom + margin;
  if (top + box.height > innerHeight - margin && pillBox.top > box.height + margin) {
    top = pillBox.top - box.height - margin;
  }
  const left = Math.max(margin, Math.min(pillBox.left, innerWidth - box.width - margin));
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

async function open(pill: HTMLElement): Promise<void> {
  const url = pillUrl(pill);
  if (!url) return;

  activePill = pill;
  const el = ensureCard();
  el.hidden = false;
  const link = classifyLink(url);
  el.dataset.kind = link?.kind ?? "generic";
  renderSkeleton(inner());
  position(pill, el);

  const meta = await resolveLinkMeta(url);
  if (activePill !== pill) return; // moved on while waiting
  el.dataset.kind = meta.kind;
  renderLink(inner(), meta);
  if (pill instanceof HTMLAnchorElement) applyMetaToPill(pill, meta);
  position(pill, el);
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
  resizeWatch?.disconnect();
  resizeWatch = null;
  card?.remove();
  card = null;
}
