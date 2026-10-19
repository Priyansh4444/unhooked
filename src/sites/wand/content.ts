/**
 * The magic wand: an inspect-element style picker the popup injects into the current tab.
 * Hover shows exactly what a click would remove (every element the rule would match), a click
 * saves the rule for this site, and the custom content script hides it from then on.
 *
 *   ↑ / ↓   widen to the parent, or narrow back
 *   S       all elements like this one ⇄ this one only
 *   Z       undo the last removal
 *   Esc     done
 *
 * Injecting the script again while it runs turns it off.
 */
import { ext } from "../../shared/ext-api.ts";
import { escapeHtml, Overlay } from "../../shared/overlay.ts";
import { customKey, customRules, type CustomRule } from "../../shared/preferences.ts";
import { describe, meaningfulTarget, selectorsFor } from "../../shared/selector.ts";
import { siteForHost } from "../hosts.ts";

interface Wand {
  stop(): void;
}

const registry = globalThis as { __unhookedWand?: Wand };

const BANNER = `<b>Magic wand</b>&nbsp; click to hide &nbsp; <kbd>↑</kbd><kbd>↓</kbd> wider/narrower &nbsp; <kbd>S</kbd> this one/all like it &nbsp; <kbd>Z</kbd> undo &nbsp; <kbd>Esc</kbd> done`;

function start(siteId: string): Wand {
  const overlay = new Overlay();
  overlay.host.dataset.wand = "on";
  overlay.banner(BANNER);
  let target: Element | null = null;
  let pointed: Element | null = null;
  const narrower: Element[] = [];
  let mode: "all" | "one" = "all";
  let selector = "";
  let frame = 0;
  let toast: ReturnType<typeof setTimeout> | undefined;
  const added: CustomRule[] = [];

  const pickable = (el: Element | null): el is Element =>
    !!el && el !== document.documentElement && el !== document.body && !overlay.owns(el);

  const matches = (sel: string): Element[] => {
    try {
      return [...document.querySelectorAll(sel)];
    } catch {
      return [];
    }
  };

  const update = () => {
    frame = 0;
    if (!target || !target.isConnected) {
      overlay.clear();
      return;
    }
    const candidates = selectorsFor(target);
    selector = mode === "all" ? candidates.all : candidates.one;
    let found = matches(selector);
    if (!found.includes(target)) {
      selector = candidates.one;
      found = matches(selector);
    }
    const rects = found
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .slice(0, 80);
    const own = target.getBoundingClientRect();
    const tag = target.tagName.toLowerCase();
    const scope = found.length > 1 ? `${found.length} like this (S: just this one)` : "this one";
    overlay.show({
      rects,
      title: `<b>${escapeHtml(describe(target))}</b>`,
      detail: `${tag}  ${Math.round(own.width)}×${Math.round(own.height)}  ${scope}`,
    });
    // Plain-text state for tests and debugging (the overlay's shadow root is closed).
    overlay.host.dataset.selector = selector;
    overlay.host.dataset.count = String(found.length);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const flash = (html: string) => {
    overlay.banner(html);
    clearTimeout(toast);
    toast = setTimeout(() => overlay.banner(BANNER), 2600);
  };

  const save = async (rules: CustomRule[]) => {
    await ext.storage.local.set({ [customKey(siteId)]: rules });
  };

  const pick = async () => {
    if (!target || !selector) return;
    const label = describe(target);
    const stored = customRules(await ext.storage.local.get(customKey(siteId)), siteId);
    if (!stored.some((rule) => rule.selector === selector)) {
      const rule = { selector, label, at: Date.now() };
      added.push(rule);
      await save([...stored, rule]);
    }
    flash(`<b>Hidden:</b> ${escapeHtml(label)} &nbsp; <kbd>Z</kbd> undo`);
    target = null;
    pointed = null;
    narrower.length = 0;
    overlay.clear();
  };

  const undo = async () => {
    const last = added.pop();
    if (!last) return;
    const stored = customRules(await ext.storage.local.get(customKey(siteId)), siteId);
    await save(stored.filter((rule) => rule.selector !== last.selector));
    flash(`<b>Back:</b> ${escapeHtml(last.label)}`);
  };

  const onMove = (event: PointerEvent) => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!pickable(el) || el === pointed) return;
    pointed = el;
    // Start at the component around the pointer; ↓ steps down to exactly what is under it.
    const chain = meaningfulTarget(el, { width: innerWidth, height: innerHeight });
    const next = chain.at(-1)!;
    narrower.length = 0;
    narrower.push(...chain.slice(0, -1));
    if (next === target) return;
    target = next;
    schedule();
  };

  // While the wand is on, the page must not see clicks: nothing navigates or opens.
  const swallow = (event: Event) => {
    if (overlay.owns(event.target as Node)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") void pick();
  };

  const onKey = (event: KeyboardEvent) => {
    // Chords belong to the page or to the wand shortcut (which toggles the wand off).
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    let handled = true;
    if (event.key === "Escape") stop();
    else if (event.key === "ArrowUp" && target?.parentElement && pickable(target.parentElement)) {
      narrower.push(target);
      target = target.parentElement;
      schedule();
    } else if (event.key === "ArrowDown" && narrower.length) {
      target = narrower.pop()!;
      schedule();
    } else if (event.key.toLowerCase() === "s") {
      mode = mode === "all" ? "one" : "all";
      schedule();
    } else if (event.key.toLowerCase() === "z") void undo();
    else if (event.key === "Enter") void pick();
    else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const BLOCKED = [
    "click",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "auxclick",
    "contextmenu",
  ];
  addEventListener("pointermove", onMove, { capture: true, passive: true });
  addEventListener("keydown", onKey, true);
  addEventListener("scroll", schedule, { capture: true, passive: true });
  addEventListener("resize", schedule);
  for (const type of BLOCKED) addEventListener(type, swallow, true);
  document.documentElement.style.cursor = "crosshair";

  function stop() {
    removeEventListener("pointermove", onMove, { capture: true });
    removeEventListener("keydown", onKey, true);
    removeEventListener("scroll", schedule, { capture: true });
    removeEventListener("resize", schedule);
    for (const type of BLOCKED) removeEventListener(type, swallow, true);
    document.documentElement.style.cursor = "";
    clearTimeout(toast);
    overlay.destroy();
    delete registry.__unhookedWand;
  }

  return { stop };
}

const siteId = siteForHost(location.hostname);
if (registry.__unhookedWand) registry.__unhookedWand.stop();
else if (siteId) registry.__unhookedWand = start(siteId);
