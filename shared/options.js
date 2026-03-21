/**
 * Default options (all off). Keys map to CSS classes on document.documentElement.
 */
const UNHOOKED_OPTION_KEYS = [
  "hideRelatedSidebar",
  "hideLiveChat",
  "hidePlaylistSidebar",
  "hideComments",
  "hideCommentAvatars",
  "hideVideoActionsBar",
  "hideChannelRow",
  "hideDescription",
  "hideNotificationBell",
  "hideShorts",
  "hideHomeFeed",
  "hideTrendingNav",
  "hideEndScreen",
  "disableAutoplay",
  "hideMerchShelf",
  "hideSearchMovieOffers"
];

const UNHOOKED_STORAGE_KEY = "unhookedOptions";

function defaultUnhookedOptions() {
  const o = {};
  for (const k of UNHOOKED_OPTION_KEYS) o[k] = false;
  return o;
}

function mergeUnhookedOptions(stored) {
  const base = defaultUnhookedOptions();
  if (!stored || typeof stored !== "object") return base;
  for (const k of UNHOOKED_OPTION_KEYS) {
    if (typeof stored[k] === "boolean") base[k] = stored[k];
  }
  return base;
}
