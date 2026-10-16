/**
 * Applies option booleans to a DOM element's classList (document.documentElement on YouTube).
 * Depends on UNHOOKED_KEY_TO_CLASS + UNHOOKED_OPTION_KEYS (load options.js + mappings.js first).
 */
(function (root) {
  "use strict";

  root.unhookedApplyOptionClasses = function unhookedApplyOptionClasses(
    element,
    options,
    hostInfo
  ) {
    var KEY_TO_CLASS = root.UNHOOKED_KEY_TO_CLASS;
    var KEYS = root.UNHOOKED_OPTION_KEYS;
    if (!KEY_TO_CLASS || !KEYS) {
      throw new Error(
        "Unhooked: load shared/options.js and shared/mappings.js before apply-option-classes.js"
      );
    }

    var allClasses = Object.values(KEY_TO_CLASS);
    var isMobile = !!hostInfo.isMobile;
    var isEmbed = !!hostInfo.isEmbed;
    var i;
    var el = element;

    for (i = 0; i < allClasses.length; i++) el.classList.remove(allClasses[i]);
    el.classList.toggle("uh-mobile", isMobile);
    el.classList.toggle("uh-embed", isEmbed);

    if (options.extensionDisabled) {
      el.classList.add("uh-extension-disabled");
      return;
    }
    el.classList.remove("uh-extension-disabled");

    for (i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (key === "extensionDisabled") continue;
      if (options[key] && KEY_TO_CLASS[key]) el.classList.add(KEY_TO_CLASS[key]);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
