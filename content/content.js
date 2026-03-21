(function () {
  "use strict";

  var host = location.hostname;
  var isMobile = host === "m.youtube.com";
  var isEmbed =
    location.pathname.startsWith("/embed/") ||
    document.documentElement.matches("html.embed");

  function loadAndApply() {
    var api = chrome.storage && chrome.storage.local;
    if (!api) return;
    api.get([UNHOOKED_STORAGE_KEY], function (data) {
      var opts = mergeUnhookedOptions(data[UNHOOKED_STORAGE_KEY]);
      unhookedApplyOptionClasses(document.documentElement, opts, {
        isMobile: isMobile,
        isEmbed: isEmbed
      });
      if (!opts.extensionDisabled && opts.disableAutoplay) scheduleAutoplayOff();
    });
  }

  var autoplayTimer = null;
  function scheduleAutoplayOff() {
    if (autoplayTimer) return;
    autoplayTimer = window.setInterval(tryTurnOffAutoplay, 800);
    window.setTimeout(function () {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }, 120000);
  }

  function tryTurnOffAutoplay() {
    var btn = document.querySelector(".ytp-autonav-toggle-button");
    if (!btn) return;
    var on =
      btn.getAttribute("aria-checked") === "true" ||
      btn.classList.contains("ytp-autonav-toggle-button-checked");
    if (on) btn.click();
  }

  loadAndApply();

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes[UNHOOKED_STORAGE_KEY]) return;
      var next = mergeUnhookedOptions(changes[UNHOOKED_STORAGE_KEY].newValue);
      unhookedApplyOptionClasses(document.documentElement, next, {
        isMobile: isMobile,
        isEmbed: isEmbed
      });
      if (!next.extensionDisabled && next.disableAutoplay) scheduleAutoplayOff();
    });
  }

  document.addEventListener("yt-navigate-finish", loadAndApply);
})();
