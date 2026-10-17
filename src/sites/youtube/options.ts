/**
 * YouTube controls: one boolean per option, applied as classes on <html> that controls.css reads.
 * `extensionDisabled` is the legacy master switch from the upstream Unhook-style extension.
 */

export const YOUTUBE_OPTION_KEYS = [
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
  "disableAnnotations",
] as const;

export type YouTubeOptionKey = (typeof YOUTUBE_OPTION_KEYS)[number];
export type YouTubeOptions = Record<YouTubeOptionKey, boolean> & { extensionDisabled: boolean };

/** <html> class for each option. */
export const OPTION_CLASSES: Record<YouTubeOptionKey, string> = {
  hideHomeFeed: "uh-hide-home-feed",
  hideRelatedSidebar: "uh-hide-related-sidebar",
  hideLiveChat: "uh-hide-live-chat",
  hidePlaylistSidebar: "uh-hide-playlist-sidebar",
  hideFundraiser: "uh-hide-fundraiser",
  hideEndScreenFeed: "uh-hide-end-screen-feed",
  hideEndScreenCards: "uh-hide-end-screen-cards",
  hideShorts: "uh-hide-shorts",
  hideComments: "uh-hide-comments",
  hideCommentAvatars: "uh-hide-comment-avatars",
  hideMixes: "uh-hide-mixes",
  hideMerchTicketsOffers: "uh-hide-merch-tickets-offers",
  hideVideoActionsBar: "uh-hide-video-actions-bar",
  hideChannelRow: "uh-hide-channel-row",
  hideDescription: "uh-hide-description",
  hideNotificationBell: "uh-hide-notification-bell",
  hideInaptSearchResults: "uh-hide-inapt-search",
  hideTrendingNav: "uh-hide-trending-nav",
  hideMoreFromYoutube: "uh-hide-more-from-youtube",
  hideSubscriptionsNav: "uh-hide-subscriptions-nav",
  disableAutoplay: "uh-disable-autoplay",
  disableAnnotations: "uh-disable-annotations",
};

export const defaultYouTubeOptions = (): YouTubeOptions => {
  const options = { extensionDisabled: false } as YouTubeOptions;
  for (const key of YOUTUBE_OPTION_KEYS) options[key] = false;
  return options;
};

/** Reads the legacy `unhookedOptions` object, including renamed options from older versions. */
export function mergeLegacyOptions(stored: unknown): YouTubeOptions {
  const base = defaultYouTubeOptions();
  if (!stored || typeof stored !== "object") return base;
  const legacy: Record<string, unknown> = { ...(stored as Record<string, unknown>) };
  if (legacy.hideEndScreen === true) {
    legacy.hideEndScreenFeed = true;
    legacy.hideEndScreenCards = true;
  }
  if (legacy.hideMerchShelf === true) legacy.hideMerchTicketsOffers = true;
  if (legacy.hideSearchMovieOffers === true) legacy.hideInaptSearchResults = true;
  for (const key of [...YOUTUBE_OPTION_KEYS, "extensionDisabled"] as const) {
    if (typeof legacy[key] === "boolean") base[key] = legacy[key];
  }
  return base;
}

interface ClassTarget {
  classList: Pick<DOMTokenList, "toggle">;
}

/** Only changed classes are written, so repeated calls are safe under a MutationObserver. */
export function applyOptionClasses(
  element: ClassTarget,
  options: YouTubeOptions,
  host: { isMobile: boolean; isEmbed: boolean },
): void {
  const { classList } = element;
  const disabled = options.extensionDisabled;
  classList.toggle("uh-mobile", host.isMobile);
  classList.toggle("uh-embed", host.isEmbed);
  classList.toggle("uh-extension-disabled", disabled);
  for (const key of YOUTUBE_OPTION_KEYS) {
    classList.toggle(OPTION_CLASSES[key], !disabled && options[key]);
  }
}
