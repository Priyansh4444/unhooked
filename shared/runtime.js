/**
 * Shared content-script lifecycle: storage sync, SPA route checks, bfcache, and self-healing.
 * Callers supply an idempotent render(raw); it must not write to the DOM when nothing changed.
 */
(function (root) {
  "use strict";
  root.unhookedRunController = function (hooks) {
    var raw = {},
      pending = {},
      loaded = false,
      running = false,
      generation = 0;
    var routeTimer = null,
      observer = null,
      lastURL = "";
    var documentEvents = ["DOMContentLoaded"].concat(hooks.documentEvents || []);
    function render() {
      var html = document.documentElement;
      if (!html || !loaded || !running) return;
      lastURL = location.href;
      hooks.render(raw, html);
      // Pages that reset <html> classes or drop injected nodes get the current state back.
      if (!observer && typeof MutationObserver === "function") {
        observer = new MutationObserver(render);
        observer.observe(html, {
          attributes: true,
          attributeFilter: ["class", "data-uh-site", "data-uh-route"],
          childList: true
        });
      }
    }
    function changed(changes, area) {
      if (area !== "local") return;
      if (loaded) root.unhookedMergeChanges(raw, changes);
      // Keep removal tombstones until the initial storage read returns.
      else
        Object.keys(changes).forEach(function (key) {
          pending[key] = changes[key].newValue;
        });
      render();
    }
    function navigated() {
      if (lastURL !== location.href) render();
    }
    function start() {
      if (running) return;
      running = true;
      loaded = false;
      pending = {};
      var current = ++generation;
      chrome.storage.onChanged.addListener(changed);
      chrome.storage.local.get(null, function (data) {
        if (!running || current !== generation || chrome.runtime.lastError) return;
        raw = root.unhookedMergeChanges(data || {}, toChanges(pending));
        loaded = true;
        pending = {};
        render();
      });
      documentEvents.forEach(function (name) {
        document.addEventListener(name, render);
      });
      window.addEventListener("popstate", navigated);
      window.addEventListener("hashchange", navigated);
      if (window.navigation) window.navigation.addEventListener("navigatesuccess", navigated);
      // Isolated worlds cannot see the page's history.pushState, so poll the URL cheaply.
      routeTimer = window.setInterval(navigated, 250);
    }
    function stop() {
      running = false;
      generation++;
      if (hooks.stop) hooks.stop();
      window.clearInterval(routeTimer);
      routeTimer = null;
      if (observer) observer.disconnect();
      observer = null;
      chrome.storage.onChanged.removeListener(changed);
      documentEvents.forEach(function (name) {
        document.removeEventListener(name, render);
      });
      window.removeEventListener("popstate", navigated);
      window.removeEventListener("hashchange", navigated);
      if (window.navigation) window.navigation.removeEventListener("navigatesuccess", navigated);
    }
    function toChanges(values) {
      var changes = {};
      Object.keys(values).forEach(function (key) {
        changes[key] = { newValue: values[key] };
      });
      return changes;
    }
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", start);
    start();
  };
})(globalThis);
