/**
 * Option keys (booleans). extensionDisabled = master power off (no hides on YouTube).
 * Attached to globalThis for popup + content scripts (classic script shared scope).
 */
(function (root) {
  "use strict";

  var KEYS = [
    "extensionDisabled",
    "hideHomeFeed",
    "hideRelatedSidebar",
    "hideLiveChat",
    "hidePlaylistSidebar",
    "hideFundraiser",
    "hideEndScreenFeed",
    "hideEndScreenCards",
    "hideShorts",
    "hideComments",
    "hideCommentAvatars",
    "hideMixes",
    "hideMerchTicketsOffers",
    "hideVideoActionsBar",
    "hideChannelRow",
    "hideDescription",
    "hideNotificationBell",
    "hideInaptSearchResults",
    "hideTrendingNav",
    "hideMoreFromYoutube",
    "hideSubscriptionsNav",
    "disableAutoplay",
    "disableAnnotations"
  ];

  root.UNHOOKED_OPTION_KEYS = KEYS;
  root.UNHOOKED_STORAGE_KEY = "unhookedOptions";
  root.UNHOOKED_POPUP_THEME_KEY = "unhookedPopupTheme";

  root.defaultUnhookedOptions = function defaultUnhookedOptions() {
    var o = {};
    for (var i = 0; i < KEYS.length; i++) o[KEYS[i]] = false;
    return o;
  };

  root.mergeUnhookedOptions = function mergeUnhookedOptions(stored) {
    var base = root.defaultUnhookedOptions();
    if (!stored || typeof stored !== "object") return base;

    var s = {};
    for (var k in stored) {
      if (Object.prototype.hasOwnProperty.call(stored, k)) s[k] = stored[k];
    }

    if (s.hideEndScreen === true) {
      s.hideEndScreenFeed = true;
      s.hideEndScreenCards = true;
    }
    if (s.hideMerchShelf === true) s.hideMerchTicketsOffers = true;
    if (s.hideSearchMovieOffers === true) s.hideInaptSearchResults = true;

    delete s.hideEndScreen;
    delete s.hideMerchShelf;
    delete s.hideSearchMovieOffers;

    for (var j = 0; j < KEYS.length; j++) {
      var key = KEYS[j];
      if (typeof s[key] === "boolean") base[key] = s[key];
    }
    return base;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
