(function () {
  "use strict";
  // Legacy UNHOOKED_STORAGE_KEY is projected by unhookedYouTubeOptions through mergeUnhookedOptions.
  var raw = {}, pending = {}, loaded = false, running = false, generation = 0;
  var autoplayTimer = null, autoplayDeadline = null, routeTimer = null, lastURL = "";
  function stopAutoplay() {
    window.clearInterval(autoplayTimer);
    window.clearTimeout(autoplayDeadline);
    autoplayTimer = null; autoplayDeadline = null;
  }
  function tryTurnOffAutoplay() {
    var opts = unhookedYouTubeOptions(raw);
    if (!running || opts.extensionDisabled || !opts.disableAutoplay) { stopAutoplay(); return; }
    var btn = document.querySelector(".ytp-autonav-toggle-button");
    if (btn && (btn.getAttribute("aria-checked") === "true" || btn.classList.contains("ytp-autonav-toggle-button-checked"))) btn.click();
  }
  function scheduleAutoplayOff() {
    if (autoplayTimer !== null) return;
    tryTurnOffAutoplay();
    autoplayTimer = window.setInterval(tryTurnOffAutoplay, 800);
    autoplayDeadline = window.setTimeout(stopAutoplay, 120000);
  }
  function render() {
    var html = document.documentElement;
    if (!html || !loaded || !running) return;
    var opts = unhookedYouTubeOptions(raw);
    unhookedApplyOptionClasses(html, opts, {
      isMobile: location.hostname === "m.youtube.com",
      isEmbed: location.pathname.startsWith("/embed/") || html.matches("html.embed")
    });
    if (!opts.extensionDisabled && opts.disableAutoplay) scheduleAutoplayOff(); else stopAutoplay();
    lastURL = location.href;
  }
  function changed(changes, area) {
    if (area !== "local") return;
    if (loaded) unhookedMergeChanges(raw, changes);
    else Object.keys(changes).forEach(function (key) { pending[key] = changes[key].newValue; });
    render();
  }
  function navigated() { if (lastURL !== location.href) render(); }
  function start() {
    if (running) return;
    running = true; loaded = false; pending = {};
    var current = ++generation;
    chrome.storage.onChanged.addListener(changed);
    chrome.storage.local.get(null, function (data) {
      if (!running || current !== generation) return;
      if (chrome.runtime.lastError) return;
      raw = data || {};
      Object.keys(pending).forEach(function (key) {
        if (typeof pending[key] === "undefined") delete raw[key]; else raw[key] = pending[key];
      });
      loaded = true; pending = {}; render();
    });
    document.addEventListener("yt-navigate-finish", render);
    document.addEventListener("DOMContentLoaded", render);
    window.addEventListener("popstate", navigated);
    window.addEventListener("hashchange", navigated);
    routeTimer = window.setInterval(navigated, 250);
  }
  function stop() {
    running = false; generation++; stopAutoplay();
    window.clearInterval(routeTimer); routeTimer = null;
    chrome.storage.onChanged.removeListener(changed);
    document.removeEventListener("yt-navigate-finish", render);
    document.removeEventListener("DOMContentLoaded", render);
    window.removeEventListener("popstate", navigated);
    window.removeEventListener("hashchange", navigated);
  }
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", start);
  start();
})();
