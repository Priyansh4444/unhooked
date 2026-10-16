(function () {
  "use strict";
  var site = unhookedSiteForHost(location.hostname);
  if (!site || site.id === "youtube") return;
  var css = unhookedCompileSiteCSS(site),
    style = null;
  function setAttribute(html, name, value) {
    if (html.getAttribute(name) !== value) html.setAttribute(name, value);
  }
  unhookedRunController({
    render: function (raw, html) {
      if (!style) {
        style = document.createElement("style");
        style.id = "unhooked-social-rules";
        style.textContent = css;
      }
      if (!style.isConnected) html.appendChild(style);
      setAttribute(html, "data-uh-site", site.id);
      setAttribute(html, "data-uh-route", site.classify(new URL(location.href)));
      var state = unhookedResolveSettings(raw, site);
      site.features.forEach(function (feature) {
        html.classList.toggle(
          unhookedFeatureClass(site.id, feature.id),
          !state.paused && state.enabled && state.features[feature.id]
        );
      });
    }
  });
})();
