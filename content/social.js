(function () {
  "use strict";
  var site = unhookedSiteForHost(location.hostname);
  if (!site || site.id === "youtube") return;
  var raw = {},
    pending = {},
    loaded = false,
    running = false,
    generation = 0;
  var routeTimer = null,
    lastURL = "",
    style = null;
  function render() {
    var html = document.documentElement;
    if (!html || !loaded || !running) return;
    if (!style || !style.isConnected) {
      style = document.createElement("style");
      style.id = "unhooked-social-rules";
      style.textContent = unhookedCompileSiteCSS(site);
      html.appendChild(style);
    }
    var route = site.classify(new URL(location.href));
    if (html.getAttribute("data-uh-site") !== site.id) html.setAttribute("data-uh-site", site.id);
    if (html.getAttribute("data-uh-route") !== route) html.setAttribute("data-uh-route", route);
    var state = unhookedResolveSettings(raw, site);
    site.features.forEach(function (feature) {
      html.classList.toggle(
        unhookedFeatureClass(site.id, feature.id),
        !state.paused && state.enabled && state.features[feature.id]
      );
    });
    lastURL = location.href;
  }
  function changed(changes, area) {
    if (area !== "local") return;
    if (loaded) unhookedMergeChanges(raw, changes);
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
      if (!running || current !== generation) return;
      if (chrome.runtime.lastError) return;
      raw = data || {};
      Object.keys(pending).forEach(function (key) {
        if (typeof pending[key] === "undefined") delete raw[key];
        else raw[key] = pending[key];
      });
      loaded = true;
      pending = {};
      render();
    });
    window.addEventListener("popstate", navigated);
    window.addEventListener("hashchange", navigated);
    if (window.navigation) window.navigation.addEventListener("navigatesuccess", navigated);
    document.addEventListener("DOMContentLoaded", render);
    routeTimer = window.setInterval(navigated, 250);
  }
  function stop() {
    running = false;
    generation++;
    window.clearInterval(routeTimer);
    routeTimer = null;
    chrome.storage.onChanged.removeListener(changed);
    window.removeEventListener("popstate", navigated);
    window.removeEventListener("hashchange", navigated);
    if (window.navigation) window.navigation.removeEventListener("navigatesuccess", navigated);
    document.removeEventListener("DOMContentLoaded", render);
  }
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", start);
  start();
})();
