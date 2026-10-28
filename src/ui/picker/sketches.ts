/**
 * Schematic pages for the picker: where each part of a site really sits, and which hide control
 * removes it. Boxes are in pixels of a 1440px-wide desktop window. Later parts draw on top of
 * earlier ones, so controls inside the player (end screens, autoplay) can overlay it.
 *
 * Parts without a `feature` are what Unhooked never hides (navigation, the player, results):
 * they are drawn dim so the sketch still reads as the real page.
 *
 * `basis` says where a layout comes from. "measured" views were taken from the live site with
 * getBoundingClientRect (October 2026, logged out where the page renders that way). "structure"
 * views are behind a login: they follow the columns the hide rules target and the widths those
 * sites use, but could not be measured without an account.
 */
import type { ControlSiteId } from "../../sites/registry.ts";

/** How the inside of a part is drawn. */
export type Texture = "bar" | "grid" | "list" | "media" | "text" | "chip" | "tall";

export interface Part {
  label: string;
  /** [x, y, width, height] in pixels of a 1440px-wide window. */
  box: readonly [number, number, number, number];
  feature?: string;
  texture?: Texture;
}

export interface View {
  id: string;
  label: string;
  /** Shown in the panel's border, like a file name. */
  path: string;
  height: number;
  basis: "measured" | "structure";
  parts: readonly Part[];
}

export const SKETCH_WIDTH = 1440;

export const SKETCHES: Record<ControlSiteId, readonly View[]> = {
  youtube: [
    {
      // Masthead, 240px guide and chip bar measured; logged out the feed is empty, so the
      // signed-in feed follows ytd-rich-grid (four columns at this width, a Shorts shelf as the
      // second row, mixes as cards).
      id: "home",
      label: "Home",
      path: "youtube.com",
      height: 960,
      basis: "structure",
      parts: [
        { label: "Header", box: [0, 0, 1440, 56], texture: "bar" },
        {
          label: "Notifications",
          box: [1320, 8, 44, 40],
          feature: "hideNotificationBell",
          texture: "chip",
        },
        { label: "Home, Shorts", box: [12, 64, 216, 80], texture: "list" },
        {
          label: "Subscriptions",
          box: [12, 148, 216, 40],
          feature: "hideSubscriptionsNav",
          texture: "list",
        },
        { label: "You, history", box: [12, 204, 216, 196], texture: "list" },
        { label: "Your channels", box: [12, 416, 216, 168], texture: "list" },
        { label: "Trending", box: [12, 600, 216, 40], feature: "hideTrendingNav", texture: "list" },
        { label: "Explore", box: [12, 644, 216, 100], texture: "list" },
        {
          label: "More from YouTube",
          box: [12, 760, 216, 176],
          feature: "hideMoreFromYoutube",
          texture: "list",
        },
        { label: "Topic chips", box: [264, 56, 1152, 56], texture: "bar" },
        {
          label: "Home feed",
          box: [264, 124, 1152, 836],
          feature: "hideHomeFeed",
          texture: "grid",
        },
        { label: "Mix", box: [856, 124, 280, 300], feature: "hideMixes", texture: "media" },
        { label: "Shorts", box: [264, 448, 1152, 440], feature: "hideShorts", texture: "tall" },
      ],
    },
    {
      // Measured on a 16:9 video in a playlist and on a livestream.
      id: "watch",
      label: "Watch",
      path: "youtube.com/watch",
      height: 1260,
      basis: "measured",
      parts: [
        { label: "Header", box: [0, 0, 1440, 56], texture: "bar" },
        { label: "Player", box: [16, 68, 996, 560], texture: "media" },
        {
          label: "End cards",
          box: [700, 92, 288, 150],
          feature: "hideEndScreenCards",
          texture: "chip",
        },
        {
          label: "End screen",
          box: [120, 250, 788, 250],
          feature: "hideEndScreenFeed",
          texture: "grid",
        },
        {
          label: "Branding",
          box: [944, 512, 56, 56],
          feature: "disableAnnotations",
          texture: "chip",
        },
        {
          label: "Autoplay",
          box: [716, 580, 110, 40],
          feature: "disableAutoplay",
          texture: "chip",
        },
        { label: "Title", box: [16, 640, 996, 28], texture: "text" },
        { label: "Channel", box: [16, 676, 274, 42], feature: "hideChannelRow", texture: "chip" },
        {
          label: "Like, share, save",
          box: [322, 676, 690, 42],
          feature: "hideVideoActionsBar",
          texture: "chip",
        },
        {
          label: "Description",
          box: [16, 730, 996, 104],
          feature: "hideDescription",
          texture: "text",
        },
        {
          label: "Merch, tickets",
          box: [16, 846, 490, 96],
          feature: "hideMerchTicketsOffers",
          texture: "chip",
        },
        {
          label: "Fundraiser",
          box: [522, 846, 490, 96],
          feature: "hideFundraiser",
          texture: "chip",
        },
        { label: "Comments", box: [16, 958, 996, 290], feature: "hideComments", texture: "list" },
        {
          label: "Avatars",
          box: [16, 1010, 48, 230],
          feature: "hideCommentAvatars",
          texture: "list",
        },
        { label: "Live chat", box: [1028, 68, 396, 330], feature: "hideLiveChat", texture: "list" },
        {
          label: "Playlist",
          box: [1028, 410, 396, 300],
          feature: "hidePlaylistSidebar",
          texture: "list",
        },
        {
          label: "Recommended",
          box: [1028, 722, 396, 526],
          feature: "hideRelatedSidebar",
          texture: "list",
        },
      ],
    },
    {
      id: "search",
      label: "Search",
      path: "youtube.com/results",
      height: 1000,
      basis: "measured",
      parts: [
        { label: "Header", box: [0, 0, 1440, 56], texture: "bar" },
        { label: "Guide", box: [0, 56, 240, 944], texture: "list" },
        { label: "Filters", box: [264, 56, 1152, 56], texture: "bar" },
        { label: "Results", box: [264, 124, 1152, 420], texture: "list" },
        {
          label: "Shelves and offers",
          box: [264, 556, 1152, 220],
          feature: "hideInaptSearchResults",
          texture: "grid",
        },
        { label: "More results", box: [264, 788, 1152, 212], texture: "list" },
      ],
    },
  ],
  x: [
    {
      // Column geometry measured logged out (600px timeline, 350px sidebar); the signed-in
      // header, composer and sidebar boxes follow X's primaryColumn/sidebarColumn markup.
      id: "home",
      label: "Home",
      path: "x.com/home",
      height: 900,
      basis: "structure",
      parts: [
        { label: "Navigation", box: [88, 0, 270, 900], texture: "list" },
        { label: "For you, Following", box: [358, 0, 600, 53], texture: "bar" },
        { label: "Post composer", box: [358, 53, 600, 110], texture: "text" },
        {
          label: "Home timeline",
          box: [358, 163, 600, 737],
          feature: "hideHomeFeed",
          texture: "list",
        },
        { label: "Search", box: [1004, 4, 350, 44], texture: "bar" },
        {
          label: "Premium, trends, who to follow",
          box: [1004, 64, 350, 760],
          feature: "hideRecommendations",
          texture: "list",
        },
      ],
    },
    {
      id: "explore",
      label: "Explore",
      path: "x.com/explore",
      height: 900,
      basis: "structure",
      parts: [
        { label: "Navigation", box: [88, 0, 270, 900], texture: "list" },
        { label: "Search", box: [358, 0, 600, 53], texture: "bar" },
        { label: "For You, Trending, News", box: [358, 53, 600, 53], texture: "bar" },
        { label: "Explore", box: [358, 106, 600, 794], feature: "hideExplore", texture: "grid" },
        {
          label: "Who to follow",
          box: [1004, 12, 350, 520],
          feature: "hideRecommendations",
          texture: "list",
        },
      ],
    },
  ],
  reddit: [
    {
      // Measured on reddit.com/r/popular.
      id: "home",
      label: "Home",
      path: "reddit.com",
      height: 1000,
      basis: "measured",
      parts: [
        { label: "Header", box: [0, 0, 1440, 57], texture: "bar" },
        { label: "Navigation", box: [0, 57, 315, 943], texture: "list" },
        { label: "Sort", box: [342, 64, 732, 41], texture: "bar" },
        {
          label: "Home & Popular",
          box: [342, 105, 732, 895],
          feature: "hideHomeFeed",
          texture: "list",
        },
        {
          label: "Recent posts",
          box: [1098, 72, 316, 728],
          feature: "hideRecommendations",
          texture: "list",
        },
      ],
    },
  ],
  instagram: [
    {
      // Measured signed in (2026, 1440px): a 72px icon column, the 630px feed with the stories
      // tray above it, and the suggestions column on the right.
      id: "home",
      label: "Home",
      path: "instagram.com",
      height: 1000,
      basis: "measured",
      parts: [
        { label: "Navigation", box: [0, 0, 72, 1000], feature: "hideNavigation", texture: "list" },
        {
          label: "Reels & Explore links",
          box: [4, 324, 64, 176],
          feature: "hideNavLinks",
          texture: "chip",
        },
        { label: "Stories", box: [214, 16, 630, 124], feature: "hideStories", texture: "chip" },
        {
          label: "Home feed",
          box: [294, 164, 470, 836],
          feature: "hideHomeFeed",
          texture: "media",
        },
        {
          label: "Suggestions",
          box: [908, 36, 319, 500],
          feature: "hideSuggestions",
          texture: "list",
        },
      ],
    },
    {
      id: "explore",
      label: "Explore",
      path: "instagram.com/explore",
      height: 1000,
      basis: "measured",
      parts: [
        { label: "Navigation", box: [0, 0, 72, 1000], feature: "hideNavigation", texture: "list" },
        { label: "Search", box: [422, 24, 597, 40], texture: "text" },
        {
          label: "Explore grid",
          box: [187, 88, 1066, 912],
          feature: "hideExplore",
          texture: "grid",
        },
      ],
    },
    {
      id: "reels",
      label: "Reels",
      path: "instagram.com/reels",
      height: 1000,
      basis: "structure",
      parts: [
        { label: "Navigation", box: [0, 0, 72, 1000], feature: "hideNavigation", texture: "list" },
        { label: "Reels", box: [500, 24, 560, 952], feature: "hideReels", texture: "tall" },
      ],
    },
  ],
  tiktok: [
    {
      // Measured logged out: 240px navigation, a 545px video with its action column.
      id: "home",
      label: "For You",
      path: "tiktok.com/foryou",
      height: 1000,
      basis: "measured",
      parts: [
        { label: "Navigation", box: [0, 0, 240, 540], texture: "list" },
        {
          label: "Following accounts",
          box: [0, 556, 240, 420],
          feature: "hideSuggestions",
          texture: "list",
        },
        { label: "For You", box: [452, 16, 612, 968], feature: "hideHomeFeed", texture: "tall" },
        { label: "Coins, app, log in", box: [1030, 24, 386, 48], texture: "bar" },
      ],
    },
    {
      id: "explore",
      label: "Explore",
      path: "tiktok.com/explore",
      height: 1000,
      basis: "measured",
      parts: [
        { label: "Navigation", box: [0, 0, 240, 540], texture: "list" },
        {
          label: "Following accounts",
          box: [0, 556, 240, 420],
          feature: "hideSuggestions",
          texture: "list",
        },
        { label: "Categories", box: [272, 0, 1136, 86], texture: "bar" },
        { label: "Explore", box: [272, 86, 1136, 914], feature: "hideExplore", texture: "grid" },
      ],
    },
    {
      id: "live",
      label: "Live",
      path: "tiktok.com/live",
      height: 1000,
      basis: "measured",
      parts: [
        { label: "LIVE navigation", box: [0, 0, 240, 500], texture: "list" },
        { label: "Live", box: [264, 16, 1152, 984], feature: "hideLive", texture: "media" },
      ],
    },
  ],
  facebook: [
    {
      // Facebook needs a login. Header, 360px shortcuts, a 680px feed with stories at its top,
      // and the right-hand column follow its desktop layout.
      id: "home",
      label: "Home",
      path: "facebook.com",
      height: 900,
      basis: "structure",
      parts: [
        { label: "Header", box: [0, 0, 1440, 56], texture: "bar" },
        { label: "Shortcuts", box: [0, 56, 360, 844], texture: "list" },
        { label: "Stories", box: [380, 72, 680, 240], feature: "hideStories", texture: "tall" },
        { label: "What's on your mind", box: [380, 328, 680, 110], texture: "text" },
        {
          label: "Home feed",
          box: [380, 454, 680, 446],
          feature: "hideHomeFeed",
          texture: "media",
        },
        {
          label: "Sponsored, contacts",
          box: [1080, 56, 360, 844],
          feature: "hideSuggestions",
          texture: "list",
        },
      ],
    },
    {
      id: "reels",
      label: "Reels",
      path: "facebook.com/reel",
      height: 900,
      basis: "structure",
      parts: [
        { label: "Header", box: [0, 0, 1440, 56], texture: "bar" },
        { label: "Reels", box: [520, 72, 400, 812], feature: "hideReels", texture: "tall" },
      ],
    },
  ],
  linkedin: [
    {
      // LinkedIn needs a login. Its scaffold: a 52px header and a 1128px three-column layout
      // (profile card, feed, the .scaffold-layout__aside the news control hides).
      id: "home",
      label: "Home",
      path: "linkedin.com/feed",
      height: 900,
      basis: "structure",
      parts: [
        { label: "Header", box: [0, 0, 1440, 52], texture: "bar" },
        { label: "Your profile", box: [156, 76, 225, 290], texture: "text" },
        { label: "Start a post", box: [405, 76, 555, 110], texture: "text" },
        { label: "Home feed", box: [405, 198, 555, 702], feature: "hideHomeFeed", texture: "list" },
        { label: "News, puzzles", box: [984, 76, 300, 420], feature: "hideNews", texture: "list" },
      ],
    },
  ],
  threads: [
    {
      // Navigation and feed measured logged out; suggested accounts appear as a carousel
      // inside the feed when signed in.
      id: "home",
      label: "Home",
      path: "threads.com",
      height: 1000,
      basis: "measured",
      parts: [
        { label: "Navigation", box: [0, 0, 230, 1000], texture: "list" },
        { label: "Home", box: [259, 16, 638, 44], texture: "bar" },
        {
          label: "For You & Following",
          box: [259, 72, 638, 928],
          feature: "hideHomeFeed",
          texture: "list",
        },
        {
          label: "Suggested accounts",
          box: [275, 520, 606, 180],
          feature: "hideSuggestions",
          texture: "tall",
        },
      ],
    },
  ],
};
