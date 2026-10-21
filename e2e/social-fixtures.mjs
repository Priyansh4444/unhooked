// Representative desktop layouts, intentionally independent of the selector registry.
// These exercise the extension's behavior; they are not substitutes for logged-in live QA.
export const fixtures = [
  {
    id: "x",
    url: "https://x.com/home",
    profile: "/someone",
    detail: "/someone/status/123",
    search: "/search?q=focus",
    messages: "/messages",
    html: `<div data-testid="primaryColumn"><section role="region" aria-label="Timeline: Your Home Timeline"><div data-testid="cellInnerDiv"><article id="feed">A recommended post</article></div></section></div><div data-testid="sidebarColumn"><aside id="suggestions">Who to follow</aside><div data-testid="trend" id="trends">Trending</div></div>`,
    sidebarAnywhere: "hideRecommendations",
    features: { hideRecommendations: ["suggestions", "trends"] },
  },
  {
    id: "reddit",
    url: "https://www.reddit.com/",
    profile: "/r/programming/",
    detail: "/r/programming/comments/123/topic/",
    search: "/search/?q=focus",
    messages: "/message/inbox/",
    // The 2025 layout (measured on reddit.com): one right-hand container that holds recent
    // posts on Home and a community's About box on subreddits and threads.
    html: `<shreddit-feed><shreddit-post><article id="feed">A front-page post</article></shreddit-post></shreddit-feed><div id="right-sidebar-container"><reddit-recent-pages id="suggestions">Recent posts</reddit-recent-pages><div id="about">About this community</div></div>`,
    sidebarAnywhere: "hideRecommendations",
    features: { hideRecommendations: ["suggestions", "right-sidebar-container"] },
    detailKeeps: ["about"],
  },
  {
    id: "instagram",
    url: "https://www.instagram.com/",
    profile: "/someone/",
    detail: "/p/ABC123/",
    search: "/accounts/edit/",
    messages: "/direct/inbox/",
    html: `<main><div role="feed"><article id="feed">A home post</article></div><aside id="suggestions">Suggested accounts</aside><div role="menu" aria-label="Stories" id="stories">Stories</div></main>`,
    features: { hideSuggestions: ["suggestions"], hideStories: ["stories"] },
  },
  {
    id: "tiktok",
    url: "https://www.tiktok.com/foryou",
    profile: "/@someone",
    detail: "/@someone/video/123",
    search: "/search?q=focus",
    messages: "/messages",
    html: `<div id="main-content-homepage"><div data-e2e="recommend-list-item-container"><article id="feed">A For You video</article></div></div><aside data-e2e="suggest-accounts" id="suggestions">Suggested accounts</aside>`,
    sidebarAnywhere: "hideSuggestions",
    features: { hideSuggestions: ["suggestions"] },
  },
  {
    id: "facebook",
    url: "https://www.facebook.com/",
    profile: "/profile.php?id=123",
    detail: "/someone/posts/123",
    search: "/search/top?q=focus",
    messages: "/messages/t/123",
    html: `<div role="feed"><article id="feed">A home post</article></div><div role="complementary" id="suggestions">Sponsored and contacts</div><div data-pagelet="Stories" id="stories">Stories</div>`,
    features: { hideSuggestions: ["suggestions"], hideStories: ["stories"] },
  },
  {
    id: "linkedin",
    url: "https://www.linkedin.com/feed/",
    profile: "/in/someone/",
    detail: "/feed/update/urn:li:activity:123/",
    search: "/search/results/all/?keywords=focus",
    messages: "/messaging/thread/123/",
    html: `<div class="scaffold-finite-scroll"><article id="feed">A feed update</article></div><aside class="scaffold-layout__aside" id="news">LinkedIn News</aside>`,
    features: { hideNews: ["news"] },
  },
  {
    id: "threads",
    url: "https://www.threads.com/",
    profile: "/@someone",
    detail: "/@someone/post/ABC123",
    search: "/search?q=focus",
    messages: "/messages",
    html: `<div role="feed"><div data-pressable-container="true"><article id="feed"><a href="/@someone/post/ABC123">A home post</a></article></div></div><aside id="suggestions">Suggested accounts</aside>`,
    features: { hideSuggestions: ["suggestions"] },
  },
];

export const discoveryFixtures = [
  {
    id: "x",
    origin: "https://x.com",
    path: "/explore",
    feature: "hideExplore",
    html: '<div data-testid="primaryColumn"><section role="region" aria-label="Timeline: Explore"><article id="discovery">Explore trends</article></section></div>',
  },
  {
    id: "instagram",
    origin: "https://www.instagram.com",
    path: "/explore/",
    feature: "hideExplore",
    html: '<main><div><article id="discovery">Explore photos</article></div></main>',
  },
  {
    id: "x",
    origin: "https://x.com",
    path: "/explore/tabs/trending",
    feature: "hideExplore",
    html: '<div data-testid="primaryColumn"><section role="region" aria-label="Timeline: Explore"><article id="discovery">Trending tab</article></section></div>',
  },
  {
    id: "reddit",
    origin: "https://www.reddit.com",
    path: "/r/popular/hot/",
    feature: "hideHomeFeed",
    html: '<shreddit-feed><article id="discovery">Popular, sorted by hot</article></shreddit-feed>',
  },
  {
    id: "instagram",
    origin: "https://www.instagram.com",
    path: "/reels/C1abc/",
    feature: "hideReels",
    html: '<main><article id="discovery">Reels viewer after scrolling</article></main>',
  },
  {
    id: "instagram",
    origin: "https://www.instagram.com",
    path: "/reels/",
    feature: "hideReels",
    html: '<main><article id="discovery">Reels viewer</article></main>',
  },
  {
    id: "tiktok",
    origin: "https://www.tiktok.com",
    path: "/explore",
    feature: "hideExplore",
    html: '<div id="main-content-explore_page"><article data-e2e="explore-item" id="discovery">Explore videos</article></div>',
  },
  {
    id: "tiktok",
    origin: "https://www.tiktok.com",
    path: "/live",
    feature: "hideLive",
    // The 2025 layout (measured on tiktok.com/live): no stable ids beyond the main container
    // and the category tabs' data-e2e hook.
    html: '<main id="tiktok-live-main-container-id"><div id="live-nav">Discover LIVE</div><div><div class="relative"><div><a data-e2e="discover-nav-category-tab">For You</a></div></div><article id="discovery">Live stream</article></div></main>',
  },
  {
    id: "facebook",
    origin: "https://www.facebook.com",
    path: "/reels/",
    feature: "hideReels",
    html: '<div role="main"><article id="discovery">Reels viewer</article></div>',
  },
];

export function fixturePage(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Social fixture</title><style>body{font:16px system-ui;margin:24px}header,nav,article,aside,[role=feed],shreddit-feed{display:block;padding:16px}#navigation{background:#eef4f1}#feed{min-height:80px}</style></head><body><header id="navigation"><nav><a href="/search">Search</a> <a href="/messages">Messages</a> <a href="/someone">Profile</a></nav></header>${body}<div id="unrelated">Unrelated content stays visible</div></body></html>`;
}
