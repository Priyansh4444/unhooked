import { describe, expect, it } from "bun:test";
import { runPageController, type PageEnv } from "./page-runtime.ts";
import type { RawStorage } from "./preferences.ts";

type Listener = (...args: any[]) => void;

/** A fake browser: storage reads resolve on demand, timers and observers are inspectable. */
function harness(href = "https://x.com/home") {
  const listeners = new Map<string, Set<Listener>>();
  const on = (name: string, fn: Listener) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(fn);
  };
  const off = (name: string, fn: Listener) => listeners.get(name)?.delete(fn);
  const fire = (name: string) => listeners.get(name)?.forEach((fn) => fn());
  const storageListeners = new Set<Listener>();
  const reads: ((data: RawStorage) => void)[] = [];
  const intervals = new Map<number, Listener>();
  const observers = new Set<{ callback: Listener; disconnect(): void }>();
  let nextId = 0;

  class FakeObserver {
    constructor(public callback: Listener) {}
    observe() {
      observers.add(this);
    }
    disconnect() {
      observers.delete(this);
    }
  }

  const html = {} as HTMLElement;
  const env: PageEnv = {
    document: { documentElement: html, addEventListener: on, removeEventListener: off } as never,
    window: {
      addEventListener: on,
      removeEventListener: off,
      setInterval: ((fn: Listener) => {
        intervals.set(++nextId, fn);
        return nextId;
      }) as never,
      clearInterval: ((id: number) => intervals.delete(id)) as never,
    },
    location: { href },
    storage: {
      get: () => new Promise((resolve) => reads.push(resolve)),
      onChanged: {
        addListener: (fn) => storageListeners.add(fn),
        removeListener: (fn) => storageListeners.delete(fn),
      },
    },
    MutationObserver: FakeObserver as never,
  };

  const renders: RawStorage[] = [];
  return {
    env,
    renders,
    intervals,
    observers,
    storageListeners,
    fire,
    start: () => runPageController({ render: (raw) => renders.push({ ...raw }) }, env),
    /** Resolve the `index`-th storage read and let its promise settle. */
    async load(data: RawStorage, index = reads.length - 1) {
      reads[index]!(data);
      await Promise.resolve();
      await Promise.resolve();
    },
    change(changes: Record<string, { newValue?: unknown }>) {
      storageListeners.forEach((fn) => fn(changes, "local"));
    },
  };
}

describe("page runtime", () => {
  it("buffers changes that arrive before the first storage read", async () => {
    const h = harness();
    h.start();
    h.change({ a: { newValue: 1 } });
    expect(h.renders).toHaveLength(0);
    await h.load({ a: 0, b: 2 });
    expect(h.renders.at(-1)).toEqual({ a: 1, b: 2 });
    h.change({ b: { newValue: 3 } });
    expect(h.renders.at(-1)).toEqual({ a: 1, b: 3 });
  });

  it("keeps removal tombstones when the snapshot still contains the deleted key", async () => {
    const h = harness();
    h.start();
    h.change({ a: {} });
    await h.load({ a: true });
    expect(h.renders.at(-1)).toEqual({});
  });

  it("ignores a stale read after pagehide and pageshow", async () => {
    const h = harness();
    h.start();
    h.fire("pagehide");
    h.fire("pageshow");
    await h.load({ stale: true }, 0);
    expect(h.renders).toHaveLength(0);
    await h.load({ fresh: true }, 1);
    expect(h.renders.at(-1)).toEqual({ fresh: true });
  });

  it("re-renders on URL changes and cleans up and resumes across bfcache", async () => {
    const h = harness();
    h.start();
    await h.load({});
    const count = h.renders.length;
    h.intervals.forEach((fn) => fn());
    expect(h.renders).toHaveLength(count); // same URL: nothing to do
    h.env.location.href = "https://x.com/alice";
    h.intervals.forEach((fn) => fn());
    expect(h.renders).toHaveLength(count + 1);

    h.fire("pagehide");
    expect(h.intervals.size).toBe(0);
    expect(h.storageListeners.size).toBe(0);
    expect(h.observers.size).toBe(0);
    h.fire("pageshow");
    await h.load({});
    expect(h.intervals.size).toBe(1);
    expect(h.storageListeners.size).toBe(1);
  });

  it("re-renders when the page changes <html>, observing only after the first render", async () => {
    const h = harness();
    h.start();
    expect(h.observers.size).toBe(0);
    await h.load({ a: 1 });
    expect(h.observers.size).toBe(1);
    const count = h.renders.length;
    h.observers.forEach((observer) => observer.callback([]));
    expect(h.renders).toHaveLength(count + 1);
  });
});
