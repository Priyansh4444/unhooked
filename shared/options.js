/**
 * Option keys (booleans). extensionDisabled = master power off (no hides on YouTube).
 */
const UNHOOKED_OPTION_KEYS = [
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

const UNHOOKED_STORAGE_KEY = "unhookedOptions";
const UNHOOKED_POPUP_THEME_KEY = "unhookedPopupTheme";

function defaultUnhookedOptions() {
  const o = {};
  for (const k of UNHOOKED_OPTION_KEYS) o[k] = false;
  return o;
}

function mergeUnhookedOptions(stored) {
  const base = defaultUnhookedOptions();
  if (!stored || typeof stored !== "object") return base;

  const s = { ...stored };

  if (s.hideEndScreen === true) {
    s.hideEndScreenFeed = true;
    s.hideEndScreenCards = true;
  }
  if (s.hideMerchShelf === true) s.hideMerchTicketsOffers = true;
  if (s.hideSearchMovieOffers === true) s.hideInaptSearchResults = true;

  delete s.hideEndScreen;
  delete s.hideMerchShelf;
  delete s.hideSearchMovieOffers;

  for (const k of UNHOOKED_OPTION_KEYS) {
    if (typeof s[k] === "boolean") base[k] = s[k];
  }
  return base;
}
