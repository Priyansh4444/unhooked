(function () {
  "use strict";
  var options = unhookedYouTubeOptions({}),
    autoplayTimer = null,
    autoplayDeadline = null;
  function stopAutoplay() {
    window.clearInterval(autoplayTimer);
    window.clearTimeout(autoplayDeadline);
    autoplayTimer = null;
    autoplayDeadline = null;
  }
  function tryTurnOffAutoplay() {
    if (options.extensionDisabled || !options.disableAutoplay) {
      stopAutoplay();
      return;
    }
    var btn = document.querySelector(".ytp-autonav-toggle-button");
    if (
      btn &&
      (btn.getAttribute("aria-checked") === "true" ||
        btn.classList.contains("ytp-autonav-toggle-button-checked"))
    )
      btn.click();
  }
  function scheduleAutoplayOff() {
    if (autoplayTimer !== null) return;
    tryTurnOffAutoplay();
    autoplayTimer = window.setInterval(tryTurnOffAutoplay, 800);
    autoplayDeadline = window.setTimeout(stopAutoplay, 120000);
  }
  unhookedRunController({
    documentEvents: ["yt-navigate-finish"],
    render: function (raw, html) {
      options = unhookedYouTubeOptions(raw);
      unhookedApplyOptionClasses(html, options, {
        isMobile: location.hostname === "m.youtube.com",
        isEmbed: location.pathname.startsWith("/embed/") || html.matches("html.embed")
      });
      if (!options.extensionDisabled && options.disableAutoplay) scheduleAutoplayOff();
      else stopAutoplay();
    },
    stop: stopAutoplay
  });
})();
