/**
 * Schematic pages for the picker: what each site roughly looks like, and which part of it each
 * hide control removes. Parts sit on a 12-column grid; later parts draw on top of earlier ones,
 * so controls inside the player (end screens, autoplay) can overlay it.
 *
 * Parts without a `feature` are what Unhooked never hides (navigation, the player, results):
 * they are drawn dim so the sketch still reads as the real page.
 */
import type { ControlSiteId } from "../../sites/registry.ts";

/** How the inside of a part is drawn. */
export type Texture = "bar" | "grid" | "list" | "media" | "text" | "chip" | "tall";

export interface Part {
  label: string;
  /** [first row, first column, rows spanned, columns spanned] on a 12-column grid. */
  at: readonly [number, number, number, number];
  feature?: string;
  texture?: Texture;
}

export interface View {
  id: string;
  label: string;
  /** Shown in the panel's border, like a file name. */
  path: string;
  rows: number;
  parts: readonly Part[];
}

const header = (label = "Header"): Part => ({ label, at: [1, 1, 1, 12], texture: "bar" });

export const SKETCHES: Record<ControlSiteId, readonly View[]> = {
  youtube: [
    {
      id: "home",
      label: "Home",
      path: "youtube.com",
      rows: 14,
      parts: [
        header(),
        {
          label: "Notifications",
          at: [1, 10, 1, 3],
          feature: "hideNotificationBell",
          texture: "chip",
        },
        { label: "Home, You", at: [2, 1, 4, 2], texture: "list" },
        { label: "Explore", at: [6, 1, 2, 2], feature: "hideTrendingNav", texture: "list" },
        {
          label: "Subscriptions",
          at: [8, 1, 2, 2],
          feature: "hideSubscriptionsNav",
          texture: "list",
        },
        {
          label: "More from YouTube",
          at: [10, 1, 5, 2],
          feature: "hideMoreFromYoutube",
          texture: "list",
        },
        { label: "Shorts", at: [2, 3, 4, 10], feature: "hideShorts", texture: "tall" },
        { label: "Home feed", at: [6, 3, 9, 7], feature: "hideHomeFeed", texture: "grid" },
        { label: "Mixes", at: [6, 10, 9, 3], feature: "hideMixes", texture: "grid" },
      ],
    },
    {
      id: "watch",
      label: "Watch",
      path: "youtube.com/watch",
      rows: 18,
      parts: [
        header(),
        { label: "Player", at: [2, 1, 8, 8], texture: "media" },
        { label: "End screen", at: [5, 2, 3, 6], feature: "hideEndScreenFeed", texture: "grid" },
        { label: "End cards", at: [2, 6, 2, 3], feature: "hideEndScreenCards", texture: "chip" },
        { label: "Autoplay", at: [9, 1, 1, 2], feature: "disableAutoplay", texture: "chip" },
        { label: "Branding", at: [9, 7, 1, 2], feature: "disableAnnotations", texture: "chip" },
        { label: "Title", at: [10, 1, 1, 8], texture: "text" },
        { label: "Channel", at: [11, 1, 1, 4], feature: "hideChannelRow", texture: "chip" },
        { label: "Buttons", at: [11, 5, 1, 4], feature: "hideVideoActionsBar", texture: "chip" },
        { label: "Description", at: [12, 1, 2, 8], feature: "hideDescription", texture: "text" },
        {
          label: "Merch, tickets",
          at: [14, 1, 1, 4],
          feature: "hideMerchTicketsOffers",
          texture: "chip",
        },
        { label: "Fundraiser", at: [14, 5, 1, 4], feature: "hideFundraiser", texture: "chip" },
        { label: "Avatars", at: [15, 1, 4, 2], feature: "hideCommentAvatars", texture: "list" },
        { label: "Comments", at: [15, 3, 4, 6], feature: "hideComments", texture: "list" },
        { label: "Live chat", at: [2, 9, 4, 4], feature: "hideLiveChat", texture: "list" },
        { label: "Playlist", at: [6, 9, 3, 4], feature: "hidePlaylistSidebar", texture: "list" },
        { label: "Recommended", at: [9, 9, 10, 4], feature: "hideRelatedSidebar", texture: "list" },
      ],
    },
    {
      id: "search",
      label: "Search",
      path: "youtube.com/results",
      rows: 12,
      parts: [
        header("Search"),
        { label: "Guide", at: [2, 1, 11, 2], texture: "list" },
        { label: "Results", at: [2, 3, 3, 10], texture: "list" },
        {
          label: "Shelves and offers",
          at: [5, 3, 3, 10],
          feature: "hideInaptSearchResults",
          texture: "grid",
        },
        { label: "More results", at: [8, 3, 5, 10], texture: "list" },
      ],
    },
  ],
  x: [
    {
      id: "home",
      label: "Home",
      path: "x.com/home",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 14, 3], texture: "list" },
        { label: "Home timeline", at: [1, 4, 14, 6], feature: "hideHomeFeed", texture: "list" },
        { label: "Search", at: [1, 10, 1, 3], texture: "bar" },
        {
          label: "Trends, who to follow",
          at: [2, 10, 8, 3],
          feature: "hideRecommendations",
          texture: "list",
        },
      ],
    },
    {
      id: "explore",
      label: "Explore",
      path: "x.com/explore",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 14, 3], texture: "list" },
        { label: "Search", at: [1, 4, 1, 6], texture: "bar" },
        { label: "Explore", at: [2, 4, 13, 6], feature: "hideExplore", texture: "grid" },
        {
          label: "Trends, who to follow",
          at: [1, 10, 9, 3],
          feature: "hideRecommendations",
          texture: "list",
        },
      ],
    },
  ],
  reddit: [
    {
      id: "home",
      label: "Home",
      path: "reddit.com",
      rows: 14,
      parts: [
        header(),
        { label: "Communities", at: [2, 1, 13, 2], texture: "list" },
        { label: "Home & Popular", at: [2, 3, 13, 7], feature: "hideHomeFeed", texture: "list" },
        {
          label: "Recommended",
          at: [2, 10, 8, 3],
          feature: "hideRecommendations",
          texture: "list",
        },
      ],
    },
  ],
  instagram: [
    {
      id: "home",
      label: "Home",
      path: "instagram.com",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 14, 2], texture: "list" },
        { label: "Stories", at: [1, 4, 2, 6], feature: "hideStories", texture: "chip" },
        { label: "Home feed", at: [3, 4, 12, 6], feature: "hideHomeFeed", texture: "media" },
        { label: "Suggested", at: [1, 10, 8, 3], feature: "hideSuggestions", texture: "list" },
      ],
    },
    {
      id: "explore",
      label: "Explore",
      path: "instagram.com/explore",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 14, 2], texture: "list" },
        { label: "Explore grid", at: [1, 3, 14, 10], feature: "hideExplore", texture: "grid" },
      ],
    },
    {
      id: "reels",
      label: "Reels",
      path: "instagram.com/reels",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 14, 2], texture: "list" },
        { label: "Reels", at: [1, 5, 14, 4], feature: "hideReels", texture: "tall" },
      ],
    },
  ],
  tiktok: [
    {
      id: "home",
      label: "For You",
      path: "tiktok.com/foryou",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 6, 3], texture: "list" },
        {
          label: "Suggested accounts",
          at: [7, 1, 8, 3],
          feature: "hideSuggestions",
          texture: "list",
        },
        { label: "For You", at: [1, 5, 14, 5], feature: "hideHomeFeed", texture: "tall" },
      ],
    },
    {
      id: "explore",
      label: "Explore",
      path: "tiktok.com/explore",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 6, 3], texture: "list" },
        {
          label: "Suggested accounts",
          at: [7, 1, 8, 3],
          feature: "hideSuggestions",
          texture: "list",
        },
        { label: "Explore", at: [1, 4, 14, 9], feature: "hideExplore", texture: "grid" },
      ],
    },
    {
      id: "live",
      label: "Live",
      path: "tiktok.com/live",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 6, 3], texture: "list" },
        {
          label: "Suggested accounts",
          at: [7, 1, 8, 3],
          feature: "hideSuggestions",
          texture: "list",
        },
        { label: "Live", at: [1, 4, 14, 9], feature: "hideLive", texture: "media" },
      ],
    },
  ],
  facebook: [
    {
      id: "home",
      label: "Home",
      path: "facebook.com",
      rows: 14,
      parts: [
        header(),
        { label: "Shortcuts", at: [2, 1, 13, 3], texture: "list" },
        { label: "Stories", at: [2, 4, 3, 6], feature: "hideStories", texture: "tall" },
        { label: "Home feed", at: [5, 4, 10, 6], feature: "hideHomeFeed", texture: "media" },
        {
          label: "Sponsored, contacts",
          at: [2, 10, 13, 3],
          feature: "hideSuggestions",
          texture: "list",
        },
      ],
    },
    {
      id: "reels",
      label: "Reels",
      path: "facebook.com/reel",
      rows: 14,
      parts: [
        header(),
        { label: "Reels", at: [2, 5, 13, 4], feature: "hideReels", texture: "tall" },
      ],
    },
  ],
  linkedin: [
    {
      id: "home",
      label: "Home",
      path: "linkedin.com/feed",
      rows: 14,
      parts: [
        header(),
        { label: "Your profile", at: [2, 1, 5, 3], texture: "text" },
        { label: "Home feed", at: [2, 4, 13, 6], feature: "hideHomeFeed", texture: "list" },
        { label: "News", at: [2, 10, 7, 3], feature: "hideNews", texture: "list" },
      ],
    },
  ],
  threads: [
    {
      id: "home",
      label: "Home",
      path: "threads.com",
      rows: 14,
      parts: [
        { label: "Navigation", at: [1, 1, 14, 1], texture: "list" },
        {
          label: "For You & Following",
          at: [1, 4, 14, 6],
          feature: "hideHomeFeed",
          texture: "list",
        },
        {
          label: "Suggested accounts",
          at: [3, 10, 5, 3],
          feature: "hideSuggestions",
          texture: "list",
        },
      ],
    },
  ],
};
