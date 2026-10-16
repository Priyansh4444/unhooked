/** Trusted, declarative platform rules. Unknown routes deliberately fail open. */
(function (root) {
  "use strict";
  var youtubeLabels = {
    hideHomeFeed: "Hide home feed", hideRelatedSidebar: "Hide recommended videos",
    hideLiveChat: "Hide live chat", hidePlaylistSidebar: "Hide playlist sidebar",
    hideFundraiser: "Hide fundraiser", hideEndScreenFeed: "Hide end screen feed",
    hideEndScreenCards: "Hide end screen cards", hideShorts: "Hide Shorts",
    hideComments: "Hide comments", hideCommentAvatars: "Hide comment profile photos",
    hideMixes: "Hide mixes", hideMerchTicketsOffers: "Hide merch, tickets, offers",
    hideVideoActionsBar: "Hide video buttons", hideChannelRow: "Hide channel row",
    hideDescription: "Hide description", hideNotificationBell: "Hide notifications",
    hideInaptSearchResults: "Hide unrelated search results", hideTrendingNav: "Hide Explore navigation",
    hideMoreFromYoutube: "Hide More from YouTube", hideSubscriptionsNav: "Hide subscriptions navigation",
    disableAutoplay: "Disable autoplay", disableAnnotations: "Disable annotations"
  };
  var youtubeDescriptions = {
    hideHomeFeed: "Hide recommended videos on Home; search and watch pages stay available.",
    hideRelatedSidebar: "Hide related videos beside the player, independently of live chat.",
    hidePlaylistSidebar: "Hide the playlist panel beside the player.",
    hideEndScreenFeed: "Hide the video suggestions shown when playback ends.",
    hideEndScreenCards: "Hide clickable cards over the end of the video.",
    hideCommentAvatars: "Hide profile pictures in comments while keeping the text.",
    hideShorts: "Hide Shorts links, shelves, and dedicated Shorts content.",
    hideInaptSearchResults: "Hide recommendation shelves and movie offers mixed into search results.",
    hideTrendingNav: "Hide Explore and Trending links in the navigation.",
    hideMoreFromYoutube: "Hide guide links to Premium, Music, Kids, Studio, and related services.",
    hideSubscriptionsNav: "Hide the guide link; direct subscription pages remain available.",
    disableAutoplay: "Switch the player autoplay control off when it appears. Turning this option off leaves the player setting as it is.",
    disableAnnotations: "Hide legacy card teasers and player branding overlays."
  };
  function feature(id, label, description, routes, selectors, balanced) {
    return { id: id, label: label, description: description, default: false,
      balanced: !!balanced, rules: [{ routes: routes, selectors: selectors }] };
  }
  var home = ["home"], discovery = ["discovery"], ancillary = ["home", "discovery", "profile", "detail", "search"];
  function path(url) { return url.pathname.replace(/\/+$/, "") || "/"; }
  function classify(id, url) {
    var p = path(url);
    if (id === "youtube") {
      if (p === "/") return "home";
      if (p === "/watch" || p.startsWith("/embed/")) return "detail";
      if (p.startsWith("/shorts")) return "shorts";
      if (p === "/results") return "search";
      return "other";
    }
    if (id === "x") {
      if (p === "/home" || p === "/") return "home";
      if (p === "/explore") return "discovery";
      if (p === "/search") return "search";
      if (/^\/(messages|i\/chat)(\/|$)/.test(p)) return "messages";
      if (/^\/[^/]+\/status\/[^/]+$/.test(p)) return "detail";
      if (/^\/[^/]+$/.test(p) && !/^\/(settings|notifications|compose|i|login|logout|signup)$/.test(p)) return "profile";
    }
    if (id === "reddit") {
      if (p === "/" || /^\/r\/(popular|all)$/.test(p)) return "home";
      if (/\/comments\//.test(p)) return "detail";
      if (/^\/(message|chat)(\/|$)/.test(p)) return "messages";
      if (p === "/search" || /^\/r\/[^/]+\/search$/.test(p)) return "search";
      if (/^\/(r|user|u)\/[^/]+$/.test(p)) return "profile";
    }
    if (id === "instagram") {
      if (p === "/") return "home";
      if (p === "/explore") return "discovery";
      if (/^\/reels?(\/|$)/.test(p)) return "shorts";
      if (/^\/direct(\/|$)/.test(p)) return "messages";
      if (/^\/(p|tv)\/[^/]+$/.test(p)) return "detail";
      if (/^\/[^/]+$/.test(p) && !/^\/(accounts|about|legal|stories)$/.test(p)) return "profile";
    }
    if (id === "tiktok") {
      if (p === "/" || p === "/foryou" || p === "/following") return "home";
      if (p === "/explore") return "discovery";
      if (p === "/live") return "live";
      if (p === "/search") return "search";
      if (/^\/messages(\/|$)/.test(p)) return "messages";
      if (/^\/@[^/]+\/video\/[^/]+$/.test(p)) return "detail";
      if (/^\/@[^/]+$/.test(p)) return "profile";
    }
    if (id === "facebook") {
      if (p === "/" || p === "/home.php") return "home";
      if (p === "/reel" || p === "/reels") return "shorts";
      if (/^\/messages(\/|$)/.test(p)) return "messages";
      if (/^\/search(\/|$)/.test(p)) return "search";
      if (p === "/watch" || p === "/gaming") return "discovery";
      if (/\/(posts|videos|permalink)\//.test(p) || p === "/permalink.php" || p === "/photo.php") return "detail";
      if (p === "/profile.php" || /^\/people\//.test(p)) return "profile";
    }
    if (id === "linkedin") {
      if (p === "/" || p === "/feed") return "home";
      if (/^\/messaging(\/|$)/.test(p)) return "messages";
      if (/^\/search(\/|$)/.test(p)) return "search";
      if (/^\/in\/[^/]+$/.test(p)) return "profile";
      if (/^\/feed\/update\//.test(p) || /^\/posts\//.test(p)) return "detail";
    }
    if (id === "threads") {
      if (p === "/" || p === "/following" || p === "/for_you") return "home";
      if (p === "/search") return "search";
      if (/^\/messages(\/|$)/.test(p)) return "messages";
      if (/^\/@[^/]+\/post\/[^/]+$/.test(p)) return "detail";
      if (/^\/@[^/]+$/.test(p)) return "profile";
    }
    return "other";
  }
  function site(id, label, hosts, features) {
    return { id: id, label: label, hosts: hosts, features: features,
      classify: function (url) { return classify(id, url); } };
  }
  var sites = [
    site("youtube", "YouTube", ["www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"],
      root.UNHOOKED_OPTION_KEYS.filter(function (id) { return id !== "extensionDisabled"; }).map(function (id) {
        return { id: id, label: youtubeLabels[id], description: youtubeDescriptions[id] || youtubeLabels[id] + " on supported YouTube layouts.", default: false, balanced: ["hideHomeFeed", "hideRelatedSidebar", "hideShorts", "hideEndScreenFeed", "disableAutoplay"].includes(id), rules: [] };
      })),
    site("x", "X / Twitter", ["x.com", "www.x.com", "twitter.com", "www.twitter.com"], [
      feature("hideHomeFeed", "Hide home timeline", "Hide For you and Following on Home. Profiles, search, and posts stay accessible.", home, ['[data-testid="primaryColumn"] [aria-label^="Timeline:"]', '[data-testid="primaryColumn"] [data-testid="cellInnerDiv"]'], true),
      feature("hideExplore", "Hide Explore feed", "Hide the Explore timeline; search remains available.", discovery, ['[data-testid="primaryColumn"] [aria-label^="Timeline:"]', '[data-testid="primaryColumn"] [data-testid="trend"]'], true),
      feature("hideRecommendations", "Hide sidebar distractions", "Hide trends and suggested accounts in the sidebar.", ancillary, ['[data-testid="sidebarColumn"] [aria-label^="Timeline:"]', '[data-testid="sidebarColumn"] [data-testid="trend"]', '[data-testid="sidebarColumn"] aside'], true)
    ]),
    site("reddit", "Reddit", ["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "sh.reddit.com"], [
      feature("hideHomeFeed", "Hide home & popular feeds", "Hide Home, Popular, and All. Subreddits and comment threads stay accessible.", home, ['shreddit-feed', '.sitetable.linklisting', '[data-testid="post-container"]'], true),
      feature("hideRecommendations", "Hide recommendation panels", "Hide recent and recommended communities in sidebars.", ancillary, ['[data-testid="right-sidebar"]', 'reddit-recent-pages', 'community-recommendations', '.side .spacer:has(.premium-banner-outer)'], true)
    ]),
    site("instagram", "Instagram", ["instagram.com", "www.instagram.com"], [
      feature("hideHomeFeed", "Hide home feed", "Hide posts on Home. Profiles, individual posts, and messages stay accessible.", home, ['main [role="feed"]', 'main article'], true),
      feature("hideExplore", "Hide Explore grid", "Hide the discovery grid on Explore.", discovery, ['main [role="main"]', 'main > div'], true),
      feature("hideSuggestions", "Hide suggested accounts", "Hide the suggested-account panel on Home.", home, ['[data-testid="suggested-users"]', 'main aside'], true),
      feature("hideStories", "Hide stories tray", "Hide the stories tray on Home.", home, ['[data-testid="story-tray"]', '[role="menu"][aria-label="Stories"]'], false),
      feature("hideReels", "Hide Reels feed", "Hide the Reels viewer on Reels routes.", ["shorts"], ['main'], false)
    ]),
    site("tiktok", "TikTok", ["tiktok.com", "www.tiktok.com"], [
      feature("hideHomeFeed", "Hide For You & Following", "Hide the home video feed. Creator profiles and direct videos stay accessible.", home, ['[data-e2e="recommend-list-item-container"]', '[data-e2e="feed-video"]', '[data-e2e="following-item"]', '#main-content-homepage'], true),
      feature("hideExplore", "Hide Explore feed", "Hide video recommendations on Explore.", discovery, ['[data-e2e="explore-item"]', '#main-content-explore_page'], true),
      feature("hideSuggestions", "Hide suggested accounts", "Hide suggested accounts in the navigation sidebar.", ancillary, ['[data-e2e="suggest-accounts"]'], true),
      feature("hideLive", "Hide Live feed", "Hide the Live directory on the Live route.", ["live"], ['[data-e2e="live-container"]', '#main-content-live'], false)
    ]),
    site("facebook", "Facebook", ["facebook.com", "www.facebook.com"], [
      feature("hideHomeFeed", "Hide home feed", "Hide posts on Home. Groups, profiles, messages, and direct posts stay accessible.", home, ['[role="feed"]'], true),
      feature("hideSuggestions", "Hide right sidebar", "Hide the Home sidebar, including suggested contacts and sponsored panels.", home, ['[role="complementary"]'], true),
      feature("hideStories", "Hide stories tray", "Hide the stories tray on Home.", home, ['[aria-label="Stories"]', '[data-pagelet="Stories"]'], false),
      feature("hideReels", "Hide Reels feed", "Hide the main viewer on Reels routes.", ["shorts"], ['[role="main"]'], false)
    ]),
    site("linkedin", "LinkedIn", ["linkedin.com", "www.linkedin.com"], [
      feature("hideHomeFeed", "Hide home feed", "Hide the feed on Home. Jobs, profiles, messages, and direct posts stay accessible.", home, ['.scaffold-finite-scroll', '[data-testid="main-feed"]'], true),
      feature("hideNews", "Hide news & recommendations", "Hide news and account recommendations in the feed sidebar.", home, ['.scaffold-layout__aside', '[data-testid="news-module"]'], true)
    ]),
    site("threads", "Threads", ["threads.com", "www.threads.com", "threads.net", "www.threads.net"], [
      feature("hideHomeFeed", "Hide For You & Following", "Hide the Home timeline. Profiles, search, messages, and direct posts stay accessible.", home, ['[role="feed"]', '[data-testid="feed"]', '[data-pressable-container="true"]:has(a[href*="/post/"])'], true),
      feature("hideSuggestions", "Hide suggested accounts", "Hide suggested-account panels on Home.", home, ['[data-testid="suggested-users"]', 'aside'], true)
    ])
  ];
  root.UNHOOKED_SITES = sites;
  root.unhookedSiteById = function (id) { return sites.find(function (s) { return s.id === id; }); };
  root.unhookedSiteForHost = function (host) { return sites.find(function (s) { return s.hosts.includes(host.toLowerCase()); }); };
  root.unhookedFeatureClass = function (siteId, featureId) { return "uh-social-" + siteId + "-" + featureId; };
  root.unhookedCompileSiteCSS = function (s) {
    return s.features.flatMap(function (f) { return f.rules.flatMap(function (rule) {
      return rule.routes.map(function (route) {
        return rule.selectors.map(function (selector) {
          return 'html[data-uh-site="' + s.id + '"][data-uh-route="' + route + '"].' + root.unhookedFeatureClass(s.id, f.id) + ' ' + selector;
        }).join(",\n") + " { display: none !important; }";
      });
    }); }).join("\n");
  };
})(globalThis);
