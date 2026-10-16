import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
function runtime(name, initial = {}) {
  const listeners = {},
    changed = new Set(),
    intervals = new Map(),
    timeouts = new Map(),
    classes = new Set(),
    attrs = {};
  let nextId = 0,
    getCallback,
    clicks = 0,
    appended = 0,
    created = null;
  const observers = new Set();
  const getCallbacks = [];
  const html = {
    classList: {
      toggle(key, value) {
        if (value) classes.add(key);
        else classes.delete(key);
      },
      add(key) {
        classes.add(key);
      },
      remove(key) {
        classes.delete(key);
      }
    },
    matches: () => false,
    getAttribute: (key) => attrs[key],
    setAttribute: (key, value) => {
      attrs[key] = value;
    },
    appendChild(node) {
      appended++;
      node.isConnected = true;
    }
  };
  const add = (name, fn) => {
      (listeners[name] ||= new Set()).add(fn);
    },
    remove = (name, fn) => listeners[name]?.delete(fn);
  const button = {
    getAttribute: () => "true",
    classList: { contains: () => false },
    click() {
      clicks++;
    }
  };
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target, options) {
      this.options = options;
      observers.add(this);
    }
    disconnect() {
      observers.delete(this);
    }
  }
  const context = vm.createContext({
    URL,
    console,
    MutationObserver,
    location: {
      hostname: name === "social" ? "x.com" : "www.youtube.com",
      pathname: name === "social" ? "/home" : "/watch",
      href: name === "social" ? "https://x.com/home" : "https://www.youtube.com/watch?v=1"
    },
    document: {
      documentElement: html,
      createElement: () => (created = {}),
      querySelector: () => button,
      addEventListener: add,
      removeEventListener: remove
    },
    chrome: {
      runtime: {},
      storage: {
        local: {
          get(keys, callback) {
            getCallback = callback;
            getCallbacks.push(callback);
          }
        },
        onChanged: {
          addListener(fn) {
            changed.add(fn);
          },
          removeListener(fn) {
            changed.delete(fn);
          }
        }
      }
    }
  });
  context.window = {
    addEventListener: add,
    removeEventListener: remove,
    setInterval(fn) {
      const id = ++nextId;
      intervals.set(id, fn);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(fn) {
      const id = ++nextId;
      timeouts.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    }
  };
  for (const file of [
    "shared/options.js",
    "shared/sites.js",
    "shared/settings.js",
    "shared/mappings.js",
    "shared/apply-option-classes.js",
    "shared/runtime.js",
    "content/" + (name === "social" ? "social" : "content") + ".js"
  ])
    vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), context);
  return {
    context,
    classes,
    attrs,
    intervals,
    timeouts,
    changed,
    observers,
    clicks: () => clicks,
    appended: () => appended,
    styleNode: () => created,
    mutate() {
      observers.forEach((observer) => observer.callback([]));
    },
    load: (data = initial) => getCallback(data),
    loadAt: (index, data = initial) => getCallbacks[index](data),
    change(data) {
      changed.forEach((fn) => fn(data, "local"));
    },
    event(name) {
      listeners[name]?.forEach((fn) => fn());
    }
  };
}
describe("content lifecycle", () => {
  it("buffers a change that arrives before the initial storage read", () => {
    const r = runtime("social", { "unhooked.site.x.hideHomeFeed": false });
    r.change({ "unhooked.site.x.hideHomeFeed": { newValue: true } });
    r.load();
    expect(r.classes.has("uh-social-x-hideHomeFeed")).toBe(true);
    r.change({ "unhooked.paused": { newValue: true } });
    expect(r.classes.has("uh-social-x-hideHomeFeed")).toBe(false);
    r.change({
      "unhooked.paused": { newValue: false },
      "unhooked.site.x.enabled": { newValue: false }
    });
    expect(r.classes.has("uh-social-x-hideHomeFeed")).toBe(false);
    r.change({ "unhooked.site.x.enabled": { newValue: true } });
    expect(r.classes.has("uh-social-x-hideHomeFeed")).toBe(true);
  });
  it("keeps removal tombstones when an initial snapshot still contains the deleted key", () => {
    const r = runtime("social", { "unhooked.site.x.hideHomeFeed": true });
    r.change({ "unhooked.site.x.hideHomeFeed": { oldValue: true } });
    r.load();
    expect(r.classes.has("uh-social-x-hideHomeFeed")).toBe(false);
  });
  it("ignores a stale initial read after pagehide and pageshow", () => {
    const r = runtime("social");
    r.event("pagehide");
    r.event("pageshow");
    r.loadAt(0, { "unhooked.site.x.hideHomeFeed": true });
    expect(r.attrs["data-uh-site"]).toBeUndefined();
    r.loadAt(1, { "unhooked.site.x.hideHomeFeed": false });
    expect(r.attrs["data-uh-site"]).toBe("x");
    expect(r.classes.has("uh-social-x-hideHomeFeed")).toBe(false);
  });
  it("observes isolated-world URL changes and cleans up/resumes bfcache lifecycle", () => {
    const r = runtime("social", { "unhooked.site.x.hideHomeFeed": true });
    r.load();
    expect(r.attrs["data-uh-route"]).toBe("home");
    r.context.location.href = "https://x.com/alice";
    r.context.location.pathname = "/alice";
    r.intervals.forEach((fn) => fn());
    expect(r.attrs["data-uh-route"]).toBe("profile");
    r.event("pagehide");
    expect(r.intervals.size).toBe(0);
    expect(r.changed.size).toBe(0);
    r.event("pageshow");
    r.load();
    expect(r.intervals.size).toBe(1);
    expect(r.changed.size).toBe(1);
  });
  it("restores state when the page resets <html> classes or removes the stylesheet", () => {
    const r = runtime("social", { "unhooked.site.x.hideHomeFeed": true });
    expect(r.observers.size).toBe(0);
    r.load();
    expect(r.observers.size).toBe(1);
    const [observer] = r.observers;
    expect(observer.options).toMatchObject({ attributes: true, childList: true });
    expect(observer.options.attributeFilter).toContain("class");
    r.classes.clear();
    delete r.attrs["data-uh-route"];
    r.mutate();
    expect(r.classes.has("uh-social-x-hideHomeFeed")).toBe(true);
    expect(r.attrs["data-uh-route"]).toBe("home");
    expect(r.appended()).toBe(1);
    // A site framework removed our <style>; the same node is attached again.
    const style = r.styleNode();
    style.isConnected = false;
    r.mutate();
    expect(r.appended()).toBe(2);
    expect(r.styleNode()).toBe(style);
    r.event("pagehide");
    expect(r.observers.size).toBe(0);
  });
  it("re-renders YouTube classes after the page clears them", () => {
    const r = runtime("youtube", { "unhooked.site.youtube.hideHomeFeed": true });
    r.load();
    expect(r.classes.has("uh-hide-home-feed")).toBe(true);
    r.classes.clear();
    r.mutate();
    expect(r.classes.has("uh-hide-home-feed")).toBe(true);
  });
  it.each([
    "unhooked.paused",
    "unhooked.site.youtube.enabled",
    "unhooked.site.youtube.disableAutoplay"
  ])("stops autoplay polling immediately on %s", (key) => {
    const r = runtime("youtube", { "unhooked.site.youtube.disableAutoplay": true });
    r.load();
    expect(r.intervals.size).toBe(2);
    expect(r.timeouts.size).toBe(1);
    expect(r.clicks()).toBe(1);
    r.change({ [key]: { newValue: key === "unhooked.paused" } });
    expect(r.intervals.size).toBe(1);
    expect(r.timeouts.size).toBe(0);
    r.intervals.forEach((fn) => fn());
    expect(r.clicks()).toBe(1);
  });
});
