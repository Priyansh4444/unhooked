/**
 * Hide controls: trusted, declarative rules per site. Route classifiers are conservative and
 * unknown routes fail open, so profiles, direct posts, search and messages stay reachable.
 */
import { SITE_HOSTS } from "./hosts.ts";
import { YOUTUBE_OPTION_KEYS, type YouTubeOptionKey } from "./youtube/options.ts";

/** "*" is for sidebar-only selectors that never cover the page's primary content. */
export type Route =
  | "home"
  | "discovery"
  | "shorts"
  | "detail"
  | "search"
  | "messages"
  | "profile"
  | "live"
  | "other"
  | "*";

export interface Feature {
  id: string;
  label: string;
  description: string;
  /** Part of the Balanced preset. */
  balanced: boolean;
  rules: { routes: readonly Route[]; selectors: readonly string[] }[];
}

export type ControlSiteId =
  | "youtube"
  | "x"
  | "reddit"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "linkedin"
  | "threads";

/** A page "Skip the feeds" can send you to instead of a feed. `{user}` is the signed-in account. */
export interface RedirectChoice {
  label: string;
  path: string;
}

/** The stronger option: leave the site's feeds before they load, for a page you choose. */
export interface Redirect {
  /** Routes that are skipped, and the popup's sentence saying so. */
  routes: readonly Route[];
  skips: string;
  /** Where to go; the first is the default. Users can also type their own path. */
  choices: readonly RedirectChoice[];
}

export interface ControlSite {
  id: ControlSiteId;
  label: string;
  hosts: readonly string[];
  features: Feature[];
  redirect: Redirect;
  classify(url: URL): Route;
}

const YOUTUBE_LABELS: Record<YouTubeOptionKey, string> = {
  hideHomeFeed: "Hide home feed",
  hideRelatedSidebar: "Hide recommended videos",
  hideLiveChat: "Hide live chat",
  hidePlaylistSidebar: "Hide playlist sidebar",
  hideFundraiser: "Hide fundraiser",
  hideEndScreenFeed: "Hide end screen feed",
  hideEndScreenCards: "Hide end screen cards",
  hideShorts: "Hide Shorts",
  hideComments: "Hide comments",
  hideCommentAvatars: "Hide comment profile photos",
  hideMixes: "Hide mixes",
  hideMerchTicketsOffers: "Hide merch, tickets, offers",
  hideVideoActionsBar: "Hide video buttons",
  hideChannelRow: "Hide channel row",
  hideDescription: "Hide description",
  hideNotificationBell: "Hide notifications",
  hideInaptSearchResults: "Hide unrelated search results",
  hideTrendingNav: "Hide Explore navigation",
  hideMoreFromYoutube: "Hide More from YouTube",
  hideSubscriptionsNav: "Hide subscriptions navigation",
  disableAutoplay: "Disable autoplay",
  disableAnnotations: "Disable annotations",
};

const YOUTUBE_DESCRIPTIONS: Partial<Record<YouTubeOptionKey, string>> = {
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
  disableAutoplay:
    "Switch the player autoplay control off when it appears. Turning this option off leaves the player setting as it is.",
  disableAnnotations: "Hide legacy card teasers and player branding overlays.",
};

const YOUTUBE_BALANCED: readonly YouTubeOptionKey[] = [
  "hideHomeFeed",
  "hideRelatedSidebar",
  "hideShorts",
  "hideEndScreenFeed",
  "disableAutoplay",
];

const feature = (
  id: string,
  label: string,
  description: string,
  routes: readonly Route[],
  selectors: readonly string[],
  balanced: boolean,
): Feature => ({ id, label, description, balanced, rules: [{ routes, selectors }] });

const HOME = ["home"] as const;
const DISCOVERY = ["discovery"] as const;
const ANYWHERE = ["*"] as const;

const path = (url: URL): string => url.pathname.replace(/\/+$/, "") || "/";

const CLASSIFIERS: Record<ControlSiteId, (p: string) => Route | undefined> = {
  youtube(p) {
    if (p === "/") return "home";
    if (/^\/shorts(\/|$)/.test(p)) return "shorts";
    if (/^\/(feed\/(trending|explore)|gaming)$/.test(p)) return "discovery";
    if (p === "/watch") return "detail";
    if (p === "/results") return "search";
  },
  x(p) {
    if (p === "/home" || p === "/") return "home";
    if (/^\/explore(\/|$)/.test(p)) return "discovery";
    if (p === "/search") return "search";
    if (/^\/(messages|i\/chat)(\/|$)/.test(p)) return "messages";
    if (/^\/[^/]+\/status\/[^/]+$/.test(p)) return "detail";
    if (
      /^\/[^/]+$/.test(p) &&
      !/^\/(settings|notifications|compose|i|login|logout|signup)$/.test(p)
    )
      return "profile";
  },
  reddit(p) {
    // Front page, r/popular, and r/all, including their sort tabs (/best, /r/all/new, ...).
    if (p === "/" || /^(\/r\/(popular|all))?(\/(best|hot|new|top|rising))?$/.test(p)) return "home";
    if (/\/comments\//.test(p)) return "detail";
    if (/^\/(message|chat)(\/|$)/.test(p)) return "messages";
    if (p === "/search" || /^\/r\/[^/]+\/search$/.test(p)) return "search";
    if (/^\/(r|user|u)\/[^/]+$/.test(p)) return "profile";
  },
  instagram(p) {
    if (p === "/") return "home";
    if (p === "/explore") return "discovery";
    // The Reels tab rewrites its URL to /reels/<id>/ while scrolling; shared links use /reel/<id>/.
    if (p === "/reels" || p === "/reel" || /^\/reels\/[^/]+$/.test(p)) return "shorts";
    if (/^\/reel\/[^/]+$/.test(p)) return "detail";
    if (/^\/direct(\/|$)/.test(p)) return "messages";
    if (/^\/(p|tv)\/[^/]+$/.test(p)) return "detail";
    if (/^\/[^/]+$/.test(p) && !/^\/(accounts|about|legal|stories)$/.test(p)) return "profile";
  },
  tiktok(p) {
    if (p === "/" || p === "/foryou" || p === "/following") return "home";
    if (p === "/explore") return "discovery";
    if (p === "/live") return "live";
    if (p === "/search") return "search";
    if (/^\/messages(\/|$)/.test(p)) return "messages";
    if (/^\/@[^/]+\/video\/[^/]+$/.test(p)) return "detail";
    if (/^\/@[^/]+$/.test(p)) return "profile";
  },
  facebook(p) {
    if (p === "/" || p === "/home.php") return "home";
    if (p === "/reel" || p === "/reels") return "shorts";
    if (/^\/messages(\/|$)/.test(p)) return "messages";
    if (/^\/search(\/|$)/.test(p)) return "search";
    if (p === "/watch" || p === "/gaming") return "discovery";
    if (/\/(posts|videos|permalink)\//.test(p) || p === "/permalink.php" || p === "/photo.php")
      return "detail";
    if (p === "/profile.php" || p.startsWith("/people/")) return "profile";
  },
  linkedin(p) {
    if (p === "/" || p === "/feed") return "home";
    if (/^\/messaging(\/|$)/.test(p)) return "messages";
    if (/^\/search(\/|$)/.test(p)) return "search";
    if (/^\/in\/[^/]+$/.test(p)) return "profile";
    if (p.startsWith("/feed/update/") || p.startsWith("/posts/")) return "detail";
  },
  threads(p) {
    if (p === "/" || p === "/following" || p === "/for_you") return "home";
    if (p === "/search") return "search";
    if (/^\/messages(\/|$)/.test(p)) return "messages";
    if (/^\/@[^/]+\/post\/[^/]+$/.test(p)) return "detail";
    if (/^\/@[^/]+$/.test(p)) return "profile";
  },
};

const REDIRECTS: Record<ControlSiteId, Redirect> = {
  youtube: {
    routes: ["home", "discovery"],
    skips: "Home and Explore send you to the page below; Shorts open in the normal player.",
    choices: [
      { label: "Subscriptions", path: "/feed/subscriptions" },
      { label: "Watch later", path: "/playlist?list=WL" },
      { label: "History", path: "/feed/history" },
    ],
  },
  x: {
    routes: ["home", "discovery"],
    skips: "Home and Explore send you to the page below.",
    choices: [
      { label: "Notifications", path: "/notifications" },
      { label: "Bookmarks", path: "/i/bookmarks" },
      { label: "Messages", path: "/messages" },
    ],
  },
  reddit: {
    routes: ["home"],
    skips: "Home, Popular and All send you to the page below.",
    choices: [
      { label: "Saved", path: "/user/me/saved/" },
      { label: "Inbox", path: "/message/inbox/" },
    ],
  },
  instagram: {
    routes: ["home", "discovery", "shorts"],
    skips: "Home, Explore and Reels send you to the page below.",
    choices: [
      { label: "Messages", path: "/direct/inbox/" },
      { label: "Saved", path: "/{user}/saved/" },
      { label: "Your profile", path: "/{user}/" },
    ],
  },
  tiktok: {
    routes: ["home", "discovery", "live"],
    skips: "For You, Following, Explore and Live send you to the page below.",
    choices: [{ label: "Messages", path: "/messages" }],
  },
  facebook: {
    routes: ["home", "shorts", "discovery"],
    skips: "Home, Reels and Watch send you to the page below.",
    choices: [
      { label: "Notifications", path: "/notifications" },
      { label: "Saved", path: "/saved/" },
      { label: "Messages", path: "/messages/" },
    ],
  },
  linkedin: {
    routes: ["home"],
    skips: "The home feed sends you to the page below.",
    choices: [
      { label: "Notifications", path: "/notifications/" },
      { label: "Messaging", path: "/messaging/" },
      { label: "Jobs", path: "/jobs/" },
    ],
  },
  threads: {
    routes: ["home"],
    skips: "For You and Following send you to the page below.",
    choices: [
      { label: "Activity", path: "/activity" },
      { label: "Saved", path: "/saved" },
    ],
  },
};

const site = (id: ControlSiteId, label: string, features: Feature[]): ControlSite => ({
  id,
  label,
  hosts: SITE_HOSTS[id],
  features,
  redirect: REDIRECTS[id],
  classify: (url) => CLASSIFIERS[id](path(url)) ?? "other",
});

export const CONTROL_SITES: readonly ControlSite[] = [
  // YouTube's rules live in youtube/controls.css; the registry only describes its options.
  site(
    "youtube",
    "YouTube",
    YOUTUBE_OPTION_KEYS.map((id) => ({
      id,
      label: YOUTUBE_LABELS[id],
      description:
        YOUTUBE_DESCRIPTIONS[id] ?? `${YOUTUBE_LABELS[id]} on supported YouTube layouts.`,
      balanced: YOUTUBE_BALANCED.includes(id),
      rules: [],
    })),
  ),
  site("x", "X / Twitter", [
    feature(
      "hideHomeFeed",
      "Hide home timeline",
      "Hide For you and Following on Home. Profiles, search, and posts stay accessible.",
      HOME,
      [
        '[data-testid="primaryColumn"] [aria-label^="Timeline:"]',
        '[data-testid="primaryColumn"] [data-testid="cellInnerDiv"]',
      ],
      true,
    ),
    feature(
      "hideExplore",
      "Hide Explore feed",
      "Hide the Explore timeline; search remains available.",
      DISCOVERY,
      [
        '[data-testid="primaryColumn"] [aria-label^="Timeline:"]',
        '[data-testid="primaryColumn"] [data-testid="trend"]',
      ],
      true,
    ),
    {
      id: "hideRecommendations",
      label: "Hide sidebar distractions",
      description: "Hide news, trends, live events and suggested accounts in the sidebar.",
      balanced: true,
      rules: [
        {
          routes: ANYWHERE,
          selectors: [
            '[data-testid="sidebarColumn"] [aria-label^="Timeline:"]',
            '[data-testid="sidebarColumn"] section:has([data-testid="trend"])',
            '[data-testid="sidebarColumn"] div:has(> [data-testid^="news_sidebar"])',
            // Live on X: a broadcast card tracked like an ad.
            '[data-testid="sidebarColumn"] div:has(> [data-testid="placementTracking"])',
            '[data-testid="sidebarColumn"] aside',
          ],
        },
        // X keeps adding sidebar modules (Today's News, live sports scores, Live on X), so keep
        // only the first block, the search box, as Control Panel for Twitter does. Search keeps
        // its filters and a post its "Relevant people", so those routes only lose the above.
        {
          routes: ["home", "discovery", "profile", "other"],
          selectors: [
            '[data-testid="sidebarColumn"] > div > div > div > div > div > div:not(:first-child)',
          ],
        },
      ],
    },
  ]),
  site("reddit", "Reddit", [
    feature(
      "hideHomeFeed",
      "Hide home & popular feeds",
      "Hide Home, Popular, and All. Subreddits and comment threads stay accessible.",
      HOME,
      ["shreddit-feed", ".sitetable.linklisting", '[data-testid="post-container"]'],
      true,
    ),
    {
      id: "hideRecommendations",
      label: "Hide recommendation panels",
      description: "Hide recent posts and recommended communities in sidebars.",
      balanced: true,
      rules: [
        {
          routes: ANYWHERE,
          selectors: [
            '[data-testid="right-sidebar"]',
            "reddit-recent-pages",
            "community-recommendations",
            ".side .spacer:has(.premium-banner-outer)",
          ],
        },
        // The 2025 layout puts all of Home's sidebar in one container. On a subreddit or a
        // thread the same column holds the community's About and rules, so only Home loses it.
        { routes: HOME, selectors: ["#right-sidebar-container"] },
      ],
    },
  ]),
  // Measured on the signed-in desktop site (2026): no test ids, so rules anchor on the few
  // stable things there are: <main>, <article>, data-pagelet and the app's own link targets.
  site("instagram", "Instagram", [
    feature(
      "hideHomeFeed",
      "Hide home feed",
      "Hide posts on Home. Profiles, individual posts, saved posts and messages stay accessible.",
      HOME,
      // With no posts showing, Instagram keeps spinning for more.
      ["main article", 'main [role="progressbar"]'],
      true,
    ),
    feature(
      "hideExplore",
      "Hide Explore grid",
      "Hide the discovery grid on Explore; its search box stays.",
      DISCOVERY,
      ['main > div > div:has(a[href^="/p/"], a[href^="/reel/"])'],
      true,
    ),
    feature(
      "hideSuggestions",
      "Hide suggestions sidebar",
      "Hide the column beside the Home feed: suggested accounts and its links.",
      HOME,
      ['main > div > div:has(a[href="/explore/people/"])'],
      true,
    ),
    feature(
      "hideStories",
      "Hide stories tray",
      "Hide the stories tray on Home.",
      HOME,
      ['div:has(> [data-pagelet="story_tray"])', '[data-pagelet="story_tray"]'],
      false,
    ),
    feature(
      "hideReels",
      "Hide Reels feed",
      "Hide the Reels viewer on Reels routes, and stop its videos.",
      ["shorts"],
      ["main"],
      false,
    ),
    feature(
      "hideNavLinks",
      "Hide Reels & Explore links",
      "Take the doors to the endless feeds out of the navigation.",
      ANYWHERE,
      ['a[href="/reels/"]:not(main a)', 'a[href="/explore/"]:not(main a)'],
      true,
    ),
    feature(
      "hideNavigation",
      "Hide navigation",
      "Hide the whole navigation column. Pair it with Skip the feeds to land on your saved posts.",
      ANYWHERE,
      // The column that holds the app's own links, and not the page's content.
      ['div:has(a[href="/reels/"]):has(a[href^="/direct/inbox"]):not(:has(main))'],
      false,
    ),
  ]),
  site("tiktok", "TikTok", [
    feature(
      "hideHomeFeed",
      "Hide For You & Following",
      "Hide the home video feed. Creator profiles and direct videos stay accessible.",
      HOME,
      [
        '[data-e2e="recommend-list-item-container"]',
        '[data-e2e="feed-video"]',
        '[data-e2e="following-item"]',
        "#main-content-homepage",
      ],
      true,
    ),
    feature(
      "hideExplore",
      "Hide Explore feed",
      "Hide video recommendations on Explore.",
      DISCOVERY,
      ['[data-e2e="explore-item"]', "#main-content-explore_page"],
      true,
    ),
    feature(
      "hideSuggestions",
      "Hide suggested accounts",
      "Hide suggested accounts in the navigation sidebar.",
      ANYWHERE,
      ['[data-e2e="suggest-accounts"]'],
      true,
    ),
    feature(
      "hideLive",
      "Hide Live feed",
      "Hide the Live directory on the Live route.",
      ["live"],
      [
        '[data-e2e="live-container"]',
        "#main-content-live",
        // 2025 layout: the content column is the one holding the category tabs.
        '#tiktok-live-main-container-id div:has(> div > div > [data-e2e="discover-nav-category-tab"])',
      ],
      false,
    ),
  ]),
  site("facebook", "Facebook", [
    feature(
      "hideHomeFeed",
      "Hide home feed",
      "Hide posts on Home. Groups, profiles, messages, and direct posts stay accessible.",
      HOME,
      ['[role="feed"]'],
      true,
    ),
    feature(
      "hideSuggestions",
      "Hide right sidebar",
      "Hide the Home sidebar, including suggested contacts and sponsored panels.",
      HOME,
      ['[role="complementary"]'],
      true,
    ),
    feature(
      "hideStories",
      "Hide stories tray",
      "Hide the stories tray on Home.",
      HOME,
      ['[aria-label="Stories"]', '[data-pagelet="Stories"]'],
      false,
    ),
    feature(
      "hideReels",
      "Hide Reels feed",
      "Hide the main viewer on Reels routes.",
      ["shorts"],
      ['[role="main"]'],
      false,
    ),
  ]),
  site("linkedin", "LinkedIn", [
    feature(
      "hideHomeFeed",
      "Hide home feed",
      "Hide the feed on Home. Jobs, profiles, messages, and direct posts stay accessible.",
      HOME,
      [".scaffold-finite-scroll", '[data-testid="main-feed"]'],
      true,
    ),
    feature(
      "hideNews",
      "Hide news & recommendations",
      "Hide news and account recommendations in the feed sidebar.",
      HOME,
      [".scaffold-layout__aside", '[data-testid="news-module"]'],
      true,
    ),
  ]),
  site("threads", "Threads", [
    feature(
      "hideHomeFeed",
      "Hide For You & Following",
      "Hide the Home timeline. Profiles, search, messages, and direct posts stay accessible.",
      HOME,
      [
        '[role="feed"]',
        '[data-testid="feed"]',
        '[data-pressable-container="true"]:has(a[href*="/post/"])',
      ],
      true,
    ),
    feature(
      "hideSuggestions",
      "Hide suggested accounts",
      "Hide suggested-account panels on Home.",
      HOME,
      ['[data-testid="suggested-users"]', "aside"],
      true,
    ),
  ]),
];

export const controlSiteById = (id: string): ControlSite | undefined =>
  CONTROL_SITES.find((s) => s.id === id);

export const controlSiteForHost = (host: string): ControlSite | undefined =>
  CONTROL_SITES.find((s) => s.hosts.includes(host.toLowerCase()));

export const featureClass = (siteId: string, featureId: string): string =>
  `uh-social-${siteId}-${featureId}`;

/** Route- and feature-gated CSS for one site; inert until the matching <html> state is set. */
export const compileSiteCss = (s: ControlSite): string =>
  s.features
    .flatMap((f) =>
      f.rules.flatMap((rule) =>
        rule.routes.map((route) => {
          const scope =
            `html[data-uh-site="${s.id}"]` +
            (route === "*" ? "" : `[data-uh-route="${route}"]`) +
            `.${featureClass(s.id, f.id)}`;
          return `${rule.selectors.map((selector) => `${scope} ${selector}`).join(",\n")} { display: none !important; }`;
        }),
      ),
    )
    .join("\n");
