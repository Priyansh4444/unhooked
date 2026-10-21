/**
 * Content-script lifecycle for hide controls: storage snapshot, SPA route checks, bfcache, and
 * self-healing. Callers supply an idempotent `render`; it must not write to the DOM when nothing
 * changed, because the observer below re-runs it after every page-made change to <html>.
 */
import { ext } from "./ext-api.ts";
import { mergeChanges, type RawStorage } from "./preferences.ts";

type Changes = Record<string, { newValue?: unknown }>;

/** Everything the runtime touches, injectable so unit tests can drive it without a browser. */
export interface PageEnv {
  document: Pick<Document, "documentElement" | "addEventListener" | "removeEventListener">;
  window: Pick<
    Window,
    "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval"
  > & { navigation?: EventTarget };
  location: Pick<Location, "href">;
  storage: {
    get(): Promise<RawStorage>;
    onChanged: {
      addListener(fn: (changes: Changes, area: string) => void): void;
      removeListener(fn: (changes: Changes, area: string) => void): void;
    };
  };
  MutationObserver?: typeof MutationObserver;
}

export interface PageHooks {
  render(raw: RawStorage, html: HTMLElement): void;
  /** Extra document events after which the page may need re-rendering. */
  documentEvents?: readonly string[];
  stop?(): void;
}

const browserEnv = (): PageEnv => ({
  document,
  window,
  location,
  storage: {
    get: () => ext.storage.local.get(null) as Promise<RawStorage>,
    onChanged: ext.storage.onChanged,
  },
  MutationObserver: globalThis.MutationObserver,
});

export function runPageController(hooks: PageHooks, env: PageEnv = browserEnv()): void {
  const { document: doc, window: win, storage } = env;
  let raw: RawStorage = {};
  let pending: RawStorage = {};
  let loaded = false;
  let running = false;
  let generation = 0;
  let routeTimer: number | undefined;
  let observer: MutationObserver | null = null;
  let lastUrl = "";
  const documentEvents = ["DOMContentLoaded", ...(hooks.documentEvents ?? [])];

  const render = (): void => {
    const html = doc.documentElement;
    if (!html || !loaded || !running) return;
    lastUrl = env.location.href;
    hooks.render(raw, html);
    // Pages that reset <html> classes or drop injected nodes get the current state back.
    if (!observer && env.MutationObserver) {
      observer = new env.MutationObserver(render);
      observer.observe(html, {
        attributes: true,
        attributeFilter: ["class", "data-uh-site", "data-uh-route"],
        childList: true,
      });
    }
  };

  const changed = (changes: Changes, area: string): void => {
    if (area !== "local") return;
    if (loaded) mergeChanges(raw, changes);
    // Keep removal tombstones until the initial storage read returns.
    else for (const [key, change] of Object.entries(changes)) pending[key] = change.newValue;
    render();
  };

  const navigated = (): void => {
    if (lastUrl !== env.location.href) render();
  };

  const start = (): void => {
    if (running) return;
    running = true;
    loaded = false;
    pending = {};
    const current = ++generation;
    storage.onChanged.addListener(changed);
    storage.get().then(
      (data) => {
        if (!running || current !== generation) return;
        const changes: Changes = {};
        for (const [key, value] of Object.entries(pending)) changes[key] = { newValue: value };
        raw = mergeChanges({ ...data }, changes);
        loaded = true;
        pending = {};
        render();
      },
      () => {}, // extension context gone (reloaded); the page keeps its last state
    );
    for (const name of documentEvents) doc.addEventListener(name, render);
    win.addEventListener("popstate", navigated);
    win.addEventListener("hashchange", navigated);
    win.navigation?.addEventListener("navigatesuccess", navigated);
    // Isolated worlds cannot see the page's history.pushState, so poll the URL cheaply.
    routeTimer = win.setInterval(navigated, 250);
  };

  const stop = (): void => {
    running = false;
    generation++;
    hooks.stop?.();
    win.clearInterval(routeTimer);
    routeTimer = undefined;
    observer?.disconnect();
    observer = null;
    storage.onChanged.removeListener(changed);
    for (const name of documentEvents) doc.removeEventListener(name, render);
    win.removeEventListener("popstate", navigated);
    win.removeEventListener("hashchange", navigated);
    win.navigation?.removeEventListener("navigatesuccess", navigated);
  };

  win.addEventListener("pagehide", stop);
  win.addEventListener("pageshow", start);
  start();
}
