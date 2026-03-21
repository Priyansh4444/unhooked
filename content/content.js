(function () {
  "use strict";

  const KEY_TO_CLASS = {
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

  const allClasses = Object.values(KEY_TO_CLASS);
  const host = location.hostname;
  const isMobile = host === "m.youtube.com";
  const isEmbed =
    location.pathname.startsWith("/embed/") ||
    document.documentElement.matches("html.embed");

  function applyOptionClasses(options) {
    const root = document.documentElement;
    for (const cls of allClasses) root.classList.remove(cls);
    root.classList.toggle("uh-mobile", isMobile);
    root.classList.toggle("uh-embed", isEmbed);

    if (options.extensionDisabled) {
      root.classList.add("uh-extension-disabled");
      return;
    }
    root.classList.remove("uh-extension-disabled");

    for (const key of UNHOOKED_OPTION_KEYS) {
      if (key === "extensionDisabled") continue;
      if (options[key] && KEY_TO_CLASS[key]) {
        root.classList.add(KEY_TO_CLASS[key]);
      }
    }
  }

  function loadAndApply() {
    const api = chrome.storage?.local;
    if (!api) return;
    api.get([UNHOOKED_STORAGE_KEY], (data) => {
      const opts = mergeUnhookedOptions(data[UNHOOKED_STORAGE_KEY]);
      applyOptionClasses(opts);
      if (!opts.extensionDisabled && opts.disableAutoplay) scheduleAutoplayOff();
    });
  }

  let autoplayTimer = null;
  function scheduleAutoplayOff() {
    if (autoplayTimer) return;
    autoplayTimer = window.setInterval(tryTurnOffAutoplay, 800);
    window.setTimeout(() => {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }, 120000);
  }

  function tryTurnOffAutoplay() {
    const btn = document.querySelector(".ytp-autonav-toggle-button");
    if (!btn) return;
    const on =
      btn.getAttribute("aria-checked") === "true" ||
      btn.classList.contains("ytp-autonav-toggle-button-checked");
    if (on) btn.click();
  }

  loadAndApply();

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !changes[UNHOOKED_STORAGE_KEY]) return;
    const next = mergeUnhookedOptions(changes[UNHOOKED_STORAGE_KEY].newValue);
    applyOptionClasses(next);
    if (!next.extensionDisabled && next.disableAutoplay) scheduleAutoplayOff();
  });

  document.addEventListener("yt-navigate-finish", loadAndApply);
})();
