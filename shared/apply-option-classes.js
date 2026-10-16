/**
 * Applies option booleans to a DOM element's classList (document.documentElement on YouTube).
 * Only changed classes are written, so repeated calls are safe under a MutationObserver.
 * Depends on UNHOOKED_KEY_TO_CLASS (load options.js + mappings.js first).
 */
(function (root) {
  "use strict";

  root.unhookedApplyOptionClasses = function unhookedApplyOptionClasses(
    element,
    options,
    hostInfo
  ) {
    var KEY_TO_CLASS = root.UNHOOKED_KEY_TO_CLASS;
    if (!KEY_TO_CLASS) {
      throw new Error(
        "Unhooked: load shared/options.js and shared/mappings.js before apply-option-classes.js"
      );
    }
    var classList = element.classList;
    var disabled = !!options.extensionDisabled;
    classList.toggle("uh-mobile", !!hostInfo.isMobile);
    classList.toggle("uh-embed", !!hostInfo.isEmbed);
    classList.toggle("uh-extension-disabled", disabled);
    Object.keys(KEY_TO_CLASS).forEach(function (key) {
      classList.toggle(KEY_TO_CLASS[key], !disabled && !!options[key]);
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
