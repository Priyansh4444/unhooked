/**
 * Maps option keys (except extensionDisabled) to <html> class names.
 * Loaded after shared/options.js, before content/content.js.
 */
(function (root) {
  "use strict";

  root.UNHOOKED_KEY_TO_CLASS = {
    hideRelatedSidebar: "uh-hide-related-sidebar",
    hideLiveChat: "uh-hide-live-chat",
    hidePlaylistSidebar: "uh-hide-playlist-sidebar",
    hideFundraiser: "uh-hide-fundraiser",
    hideComments: "uh-hide-comments",
    hideCommentAvatars: "uh-hide-comment-avatars",
    hideVideoActionsBar: "uh-hide-video-actions-bar",
    hideChannelRow: "uh-hide-channel-row",
    hideDescription: "uh-hide-description",
    hideNotificationBell: "uh-hide-notification-bell",
    hideShorts: "uh-hide-shorts",
    hideHomeFeed: "uh-hide-home-feed",
    hideTrendingNav: "uh-hide-trending-nav",
    hideEndScreenFeed: "uh-hide-end-screen-feed",
    hideEndScreenCards: "uh-hide-end-screen-cards",
    disableAutoplay: "uh-disable-autoplay",
    hideMerchTicketsOffers: "uh-hide-merch-tickets-offers",
    hideInaptSearchResults: "uh-hide-inapt-search",
    hideMixes: "uh-hide-mixes",
    hideMoreFromYoutube: "uh-hide-more-from-youtube",
    hideSubscriptionsNav: "uh-hide-subscriptions-nav",
    disableAnnotations: "uh-disable-annotations"
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
