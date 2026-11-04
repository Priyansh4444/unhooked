/**
 * Pure URL logic for chat links: which site is it, what should the pill say?
 * No DOM, no extension APIs, so both the content script and the background import it.
 */

export type LinkKind =
  | "youtube"
  | "twitter"
  | "reddit"
  | "github"
  | "wikipedia"
  | "tiktok"
  | "spotify"
  | "soundcloud"
  | "vimeo"
  | "kick"
  | "twitch"
  | "imgur"
  | "generic";

export interface ClassifiedLink {
  url: string;
  kind: LinkKind;
  /** Host without `www.`. */
  hostname: string;
  /** Short pill label derived from the URL alone. */
  label: string;
  youtubeId?: string;
  twitterStatusId?: string;
  /** Whether a network lookup would improve the pill label. */
  enrichable: boolean;
}

/** What a lookup (or the fallback) knows about a link; drives the hover card. */
export interface LinkMeta {
  kind: LinkKind;
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  youtubeId?: string;
  twitterStatusId?: string;
  /** Post text, for pill labels. */
  textSnippet?: string;
  /** Who made it: post author, channel, repo owner. */
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  /** Short facts for the hover card ("★ 1.2K", "TypeScript"). */
  chips?: string[];
  /** An X post's own pictures, up to four. */
  photos?: string[];
  /** An X post's video: its still, and the file to play on a click. */
  video?: { poster: string; src: string };
  /** The post an X post quotes. */
  quote?: { name: string; handle: string; avatar?: string; text: string };
  /** The account an X post replies to. */
  replyTo?: string;
  /** The colour a page calls its own, for the bar down the card's side. */
  accent?: string;
  /** Reading this page needs access the user could give. */
  canAsk?: boolean;
}

/** The field each lookup always fills when it worked; missing means it failed (offline, rate-limited). */
const FILLED_ON_SUCCESS: Partial<Record<LinkKind, keyof LinkMeta>> = {
  youtube: "textSnippet",
  twitter: "authorName",
  reddit: "textSnippet",
  vimeo: "textSnippet",
  spotify: "textSnippet",
  github: "chips",
};

/** A failed lookup is cached briefly so it gets retried (see resolve.ts). */
export const isEmptyLookup = (meta: LinkMeta): boolean => {
  const field = FILLED_ON_SUCCESS[meta.kind];
  if (!field) return false;
  const value = meta[field];
  return Array.isArray(value) ? value.length === 0 : !value;
};

/** Addresses on this computer or network, which a stranger's chat link has no business reaching. */
export function isPublicHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, ""); // "localhost." is localhost
  if (name === "localhost" || name.includes(":") || name.startsWith("[")) return false;
  if (/\.(local|localhost|internal|lan|home|intranet)$/.test(name)) return false;
  const ip = name.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ip) return name.includes(".");
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

// ---- small helpers ---------------------------------------------------------------------------

export const tryParseUrl = (raw: string, base?: string): URL | null => {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
};

const hostOf = (url: URL): string => url.hostname.toLowerCase().replace(/^www\./, "");
const segments = (url: URL): string[] => url.pathname.split("/").filter(Boolean);
const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment.replace(/\+/g, " "));
  } catch {
    return segment;
  }
};

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const firstWords = (text: string, maxWords: number, maxChars: number): string =>
  truncate(text.replace(/\s+/g, " ").trim().split(" ").slice(0, maxWords).join(" "), maxChars);

/** 1234 -> "1.2K". */
export const compactNumber = (n: number): string => {
  if (n < 1000) return String(n);
  const [value, unit] = n < 1_000_000 ? [n / 1000, "K"] : [n / 1_000_000, "M"];
  return `${value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, "")}${unit}`;
};

// ---- which site is it? -----------------------------------------------------------------------

const KIND_HOSTS: Record<Exclude<LinkKind, "generic" | "wikipedia">, string[]> = {
  youtube: ["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"],
  twitter: [
    "twitter.com",
    "mobile.twitter.com",
    "x.com",
    "mobile.x.com",
    "fxtwitter.com",
    "vxtwitter.com",
    "fixupx.com",
    "fixvx.com",
    "twittpr.com",
  ],
  reddit: ["reddit.com", "old.reddit.com", "new.reddit.com", "redd.it"],
  github: ["github.com", "gist.github.com"],
  tiktok: ["tiktok.com", "vm.tiktok.com"],
  spotify: ["open.spotify.com", "spotify.com", "play.spotify.com"],
  soundcloud: ["soundcloud.com", "on.soundcloud.com"],
  vimeo: ["vimeo.com", "player.vimeo.com"],
  kick: ["kick.com"],
  imgur: ["imgur.com", "i.imgur.com"],
  twitch: ["twitch.tv", "m.twitch.tv", "clips.twitch.tv"],
};

const kindOf = (url: URL): LinkKind => {
  const host = hostOf(url);
  if (host.endsWith("wikipedia.org")) return "wikipedia";
  for (const [kind, hosts] of Object.entries(KIND_HOSTS)) {
    if (hosts.includes(host)) return kind as LinkKind;
  }
  return "generic";
};

/** CDN / asset hosts: never a link worth a pill. */
const IGNORED_HOST_SUFFIXES = [
  "ttvnw.net",
  "jtvnw.net",
  "twitchcdn.net",
  "cloudfront.net",
  "googleapis.com",
  "gstatic.com",
];

/** Shorteners: pill them, but never look them up. */
const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "rb.gy",
  "bl.ink",
]);

// ---- ids pulled out of URLs ------------------------------------------------------------------

const ID = /^[\w-]{6,}$/;

const extractYouTubeId = (url: URL): string | undefined => {
  const first = segments(url)[0];
  const candidate =
    hostOf(url) === "youtu.be"
      ? first
      : url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1];
  return candidate && ID.test(candidate) ? candidate : undefined;
};

/** Posts, and X Articles, which are posts underneath. */
export const extractTwitterStatusId = (url: URL): string | undefined =>
  url.pathname.match(/\/(?:status(?:es)?|article)\/(\d+)/)?.[1];

const NOT_A_HANDLE = new Set(
  "i intent share search home explore notifications messages settings compose hashtag jobs tos privacy about login signup logout account download premium verified grok".split(
    " ",
  ),
);

/** The account a link is on, including its tabs: x.com/{user}/media, /with_replies, /followers. */
export const twitterProfileHandle = (url: URL): string | undefined => {
  const [user, second] = segments(url);
  const handle = (name: string | null | undefined) =>
    name && /^@?\w{1,15}$/.test(name) ? name.replace(/^@/, "") : undefined;
  if (!user || NOT_A_HANDLE.has(user.toLowerCase())) {
    return user === "intent" && second === "follow"
      ? handle(url.searchParams.get("screen_name"))
      : undefined;
  }
  return extractTwitterStatusId(url) ? undefined : handle(user);
};

/**
 * What the links X keeps no public record of are. Their card can only say what the address says,
 * so it says that plainly and offers the way in.
 */
export const twitterPageName = (url: URL): string | undefined => {
  const [first, second, third] = segments(url);
  if (first === "hashtag" && second) return `#${decode(second)}`;
  if (first === "search") {
    const query = url.searchParams.get("q");
    return query ? `Search: ${query}` : "Search on X";
  }
  if (first === "explore") return "Explore on X";
  if (first === "home") return "Home on X";
  if (first === "notifications") return "Notifications on X";
  if (first === "messages") return "Messages on X";
  if (first === "compose" || (first === "intent" && (second === "post" || second === "tweet")))
    return url.searchParams.get("text")
      ? `Draft: ${url.searchParams.get("text")}`
      : "New post on X";
  if (first === "intent" && second === "user") return "Account on X";
  if (first !== "i") return third === "lists" || second === "lists" ? "List on X" : undefined;
  const pages: Record<string, string> = {
    lists: "List on X",
    spaces: "Space on X",
    broadcasts: "Broadcast on X",
    communities: "Community on X",
    moments: "Moment on X",
    events: "Event on X",
    topics: "Topic on X",
    grok: "Grok on X",
    bookmarks: "Bookmarks on X",
    chat: "Messages on X",
    trends: "Trends on X",
  };
  return second ? pages[second] : undefined;
};

/** `x.com/{user}` or `x.com/{user}/status/...`; undefined for routes like /home or /search. */
export const extractTwitterUsername = (url: URL): string | undefined => {
  const [user, second] = segments(url);
  if (!user || NOT_A_HANDLE.has(user.toLowerCase())) return undefined;
  return second === undefined || second === "status" || second === "statuses"
    ? user.replace(/^@/, "")
    : undefined;
};

/** Direct image for imgur links we can preview without any lookup. */
export const imgurImageUrl = (href: string): string | undefined => {
  const url = tryParseUrl(href);
  const [first, second] = url ? segments(url) : [];
  if (!first || second || ["a", "gallery", "t", "user", "r"].includes(first)) return undefined;
  const id = first.replace(/\.\w{2,5}$/, "");
  return /^[A-Za-z0-9]{5,10}$/.test(id) ? `https://i.imgur.com/${id}.jpg` : undefined;
};

// ---- pill labels (from the URL alone) --------------------------------------------------------

type Labeler = (url: URL, parts: string[]) => string | undefined;

/** "just-chatting" -> "just chatting". */
const words = (segment: string): string => decode(segment).replace(/[-_]+/g, " ").trim();

const SPOTIFY_TYPES = new Set(["track", "album", "playlist", "artist", "episode", "show"]);

/** YouTube pages about a channel or a playlist rather than one video (looked up by page tags). */
export const youtubePage = (url: URL): "channel" | "playlist" | null => {
  const [first] = segments(url);
  if (first?.startsWith("@") || first === "channel" || first === "c" || first === "user") {
    return "channel";
  }
  return first === "playlist" ? "playlist" : null;
};

const LABELS: Partial<Record<LinkKind, Labeler>> = {
  youtube: (url, parts) => {
    const id = extractYouTubeId(url);
    if (id) {
      const what =
        parts[0] === "shorts"
          ? "Short"
          : parts[0] === "live"
            ? "Live"
            : hostOf(url) === "music.youtube.com"
              ? "YT Music"
              : "YouTube";
      return `${what} · ${truncate(id, 11)}`;
    }
    const [first, second] = parts;
    if (first?.startsWith("@")) return truncate(decode(first), 24);
    if ((first === "c" || first === "user") && second) return truncate(decode(second), 24);
    if (first === "channel") return "YouTube channel";
    if (first === "playlist") return "YouTube playlist";
    if (first === "post") return "YouTube post";
    if (first === "results") {
      const query = url.searchParams.get("search_query");
      return query ? truncate(`YouTube search: ${query}`, 34) : "YouTube search";
    }
    return "YouTube";
  },
  twitter: (url, parts) => {
    const user = extractTwitterUsername(url);
    if (user) return `@${truncate(user, 16)}`;
    const [first, second] = parts;
    if (second === "article" || (first === "i" && second === "article")) return "Article on X";
    if (extractTwitterStatusId(url)) return "Post on X"; // x.com/i/status/...
    const page = twitterPageName(url);
    if (page) return truncate(page, 30);
    // x.com/{user}/likes, /media, /with_replies ... still name the account
    const handle = twitterProfileHandle(url);
    return handle ? `@${truncate(handle, 16)}` : "X";
  },
  reddit: (url, parts) => {
    if (hostOf(url) === "redd.it") return "Reddit post";
    const [kind, name, comments, , slug] = parts;
    if (kind?.toLowerCase() === "r" && name) {
      return comments === "comments" && slug
        ? truncate(`r/${name} · ${firstWords(words(slug), 4, 28)}`, 40)
        : `r/${truncate(name, 20)}`;
    }
    return /^u(ser)?$/i.test(kind ?? "") && name ? `u/${truncate(name, 18)}` : "Reddit";
  },
  github: (url, parts) => {
    if (hostOf(url) === "gist.github.com") {
      return parts[0] ? truncate(`gist · ${parts[0]}`, 28) : "GitHub Gist";
    }
    const [owner, repo, section, id, ...path] = parts;
    if (!owner) return "GitHub";
    // GitHub's own top-level pages are not accounts.
    if (owner === "orgs" && repo) return truncate(repo, 24);
    if (owner === "topics" && repo) return truncate(`GitHub topic: ${repo}`, 32);
    if (owner === "sponsors" && repo) return truncate(`Sponsor @${repo}`, 28);
    if (GITHUB_PAGES.has(owner)) return "GitHub";
    if (!repo) return truncate(owner, 24);
    const name = (max: number) => truncate(`${owner}/${repo}`, max);
    // The number is the point of a thread link: shorten the repo, never the number.
    if (THREADS.has(section ?? "") && /^\d+$/.test(id ?? "")) return `${name(26)}#${id}`;
    if (section === "commit" && id) return `${name(22)}@${id.slice(0, 7)}`;
    // blob|tree/<branch>/<path>: the file or folder is what was shared
    if ((section === "blob" || section === "tree") && path.length) {
      const file = decode(path[path.length - 1]!) + (section === "tree" ? "/" : "");
      return `${name(18)} · ${truncate(file, 20)}`;
    }
    if (section === "releases" && id === "tag" && path[0]) {
      return `${name(20)} · ${truncate(decode(path[0]), 16)}`;
    }
    if (section && REPO_TABS.has(section)) return `${name(22)} · ${section}`;
    return name(32);
  },
  wikipedia: (_url, parts) =>
    parts[0] === "wiki" && parts[1] ? truncate(words(parts[1]), 34) : "Wikipedia",
  tiktok: (_url, parts) => truncate(parts.find((p) => p.startsWith("@")) ?? "TikTok", 20),
  spotify: (_url, parts) => {
    const [type] = parts.filter((p) => !p.startsWith("intl-")); // /intl-de/track/...
    return type && SPOTIFY_TYPES.has(type) ? `Spotify ${type}` : "Spotify";
  },
  soundcloud: (_url, parts) =>
    parts[1]
      ? truncate(`${parts[0]}/${words(parts[1])}`, 32)
      : parts[0]
        ? truncate(parts[0], 22)
        : "SoundCloud",
  vimeo: (_url, parts) => {
    const id = parts.find((p) => /^\d+$/.test(p));
    return id ? `Vimeo · ${id}` : "Vimeo";
  },
  kick: (_url, parts) => {
    const [channel, section] = parts;
    if (!channel || ["video", "categories", "search"].includes(channel.toLowerCase()))
      return "Kick";
    if (section === "videos") return truncate(`${channel} · VOD`, 24);
    if (section === "clips") return truncate(`${channel} · clip`, 24);
    return truncate(channel, 20);
  },
  twitch: (url, parts) => {
    if (hostOf(url) === "clips.twitch.tv" && parts[0]) return truncate(`Clip · ${parts[0]}`, 28);
    if (parts[1] === "clip" && parts[2]) return truncate(`Clip · ${parts[0]}`, 28);
    if (parts[0] === "videos" && parts[1]) return `VOD · ${truncate(parts[1], 12)}`;
    if (parts[0] === "directory" && parts[1] === "category" && parts[2]) {
      return truncate(`Twitch · ${words(parts[2])}`, 30);
    }
    const reserved = ["directory", "downloads", "settings", "p", "popout"];
    return parts[0] && !reserved.includes(parts[0]) ? truncate(parts[0], 18) : "Twitch";
  },
  imgur: (_url, parts) => {
    if (parts[0] === "a" || parts[0] === "gallery") {
      return `Imgur · ${truncate(parts[1] ?? "album", 16)}`;
    }
    return parts[0] ? `Imgur · ${truncate(parts[0].replace(/\.\w{2,5}$/, ""), 16)}` : "Imgur";
  },
};

const THREADS = new Set(["pull", "issues", "discussions"]);
const REPO_TABS = new Set([
  "issues",
  "pulls",
  "discussions",
  "releases",
  "actions",
  "wiki",
  "compare",
]);
const GITHUB_PAGES = new Set([
  "settings",
  "notifications",
  "pulls",
  "issues",
  "marketplace",
  "explore",
]);

/** Well-known sites without a kind of their own: a name reads better than a host. */
const SITE_NAMES: Record<string, string> = {
  "news.ycombinator.com": "Hacker News",
  "stackoverflow.com": "Stack Overflow",
  "npmjs.com": "npm",
  "discord.gg": "Discord",
  "discord.com": "Discord",
  "amazon.com": "Amazon",
  "drive.google.com": "Google Drive",
};
const GOOGLE_DOCS: Record<string, string> = {
  document: "Google Doc",
  spreadsheets: "Google Sheet",
  presentation: "Google Slides",
  forms: "Google Form",
};

/** Path segments that say nothing about the page: actions, routes and opaque ids. */
const NOISE =
  /^(edit|view|preview|share|embed|item|index(\.\w+)?|d|p|s|u|dp|gp|questions|package|invite)$/i;
const isNoise = (segment: string): boolean =>
  NOISE.test(segment) ||
  /^\d+$/.test(segment) ||
  // ids like 1AbCdEfGhIjKlMnOp or B0ABCDEF12: long, no dashes, letters mixed with digits
  (segment.length >= 8 &&
    /^[A-Za-z0-9_]+$/.test(segment) &&
    /\d/.test(segment) &&
    /[A-Za-z]/.test(segment));

/** Any other site: its name (or whole host: subdomains matter) plus the most telling path part. */
const genericLabel = (url: URL, parts: string[]): string => {
  const host = hostOf(url);
  if (host === "docs.google.com") return GOOGLE_DOCS[parts[0] ?? ""] ?? "Google Docs";
  const meaningful = [...parts].reverse().find((p) => !isNoise(p));
  const tail = meaningful ? words(meaningful) : "";
  const site = SITE_NAMES[host];
  if (site) return tail ? truncate(`${site} · ${tail}`, 34) : site;
  const withTail = tail ? `${host}/${tail}` : host;
  return withTail.length <= 34 ? withTail : truncate(host, 34);
};

const pillLabelFor = (url: URL, kind: LinkKind): string =>
  LABELS[kind]?.(url, segments(url)) ?? genericLabel(url, segments(url));

/** Label once a lookup has answered; kinds with no good title just keep the URL-derived label. */
export const enrichedPillLabelFromMeta = (meta: LinkMeta): string => {
  const url = tryParseUrl(meta.url);
  const fromUrl = url ? pillLabelFor(url, meta.kind) : "";
  const title = (meta.textSnippet || meta.title || "").trim();
  // A title that is just the URL-derived label means the lookup found nothing: not a real title.
  const usable =
    title.length > 1 &&
    title !== fromUrl &&
    title !== meta.url &&
    title !== meta.siteName &&
    !/^https?:\/\//i.test(title);

  if (meta.kind === "twitter") {
    // A profile is who someone says they are, so its pill says that too.
    const profile = url && !meta.twitterStatusId ? twitterProfileHandle(url) : undefined;
    if (profile && meta.description) {
      return truncate(`@${profile} · ${firstWords(meta.description, 6, 34)}`, 42);
    }
    const user = url && extractTwitterUsername(url);
    const text =
      usable && !/^@?\w+$/.test(title) && title !== "Post on X" ? firstWords(title, 5, 34) : "";
    if (user && text) return truncate(`@${user} · ${text}`, 42);
    return user ? `@${truncate(user, 16)}` : text || fromUrl || "X";
  }
  if (usable && meta.kind === "youtube") {
    const page = url && youtubePage(url);
    if (page === "channel") return truncate(title, 30);
    if (page === "playlist") return truncate(`Playlist · ${firstWords(title, 5, 30)}`, 40);
    // The icon says it's YouTube. A Short is worth saying, since it's a different kind of thing.
    const short = url?.pathname.startsWith("/shorts/");
    return short ? truncate(`Short · ${firstWords(title, 6, 36)}`, 40) : firstWords(title, 6, 36);
  }
  if (usable && (meta.kind === "reddit" || meta.kind === "vimeo" || meta.kind === "spotify")) {
    return firstWords(title, 6, 36);
  }
  return fromUrl || meta.siteName || meta.url;
};

// ---- classify --------------------------------------------------------------------------------

export const classifyLink = (href: string, pageBase?: string): ClassifiedLink | null => {
  const url = tryParseUrl(href, pageBase);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
  const host = hostOf(url);
  if (IGNORED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return null;
  // Twitch's own front page is site chrome, not a shared link.
  if ((host === "twitch.tv" || host === "m.twitch.tv") && url.pathname === "/") return null;

  const kind = kindOf(url);
  // One address for one post, whichever mirror or old name it was shared under.
  if (kind === "twitter") url.hostname = "x.com";
  const youtubeId = kind === "youtube" ? extractYouTubeId(url) : undefined;
  const twitterStatusId = kind === "twitter" ? extractTwitterStatusId(url) : undefined;
  // Only kinds whose label gets better with a title are looked up just for the pill.
  const enrichable =
    !SHORTENER_HOSTS.has(host) &&
    ((kind === "youtube" &&
      (!!youtubeId || url.pathname.startsWith("/channel/") || youtubePage(url) === "playlist")) ||
      (kind === "twitter" && (!!twitterStatusId || !!twitterProfileHandle(url))) ||
      (kind === "spotify" && pillLabelFor(url, kind) !== "Spotify") ||
      kind === "reddit" ||
      kind === "vimeo");

  return {
    url: url.href,
    kind,
    hostname: kind === "twitter" ? "x.com" : host,
    label: pillLabelFor(url, kind),
    youtubeId,
    twitterStatusId,
    enrichable,
  };
};

/** What we show for a link when no lookup is possible (or it failed). */
export const fallbackMeta = (link: ClassifiedLink): LinkMeta => ({
  kind: link.kind,
  url: link.url,
  title: link.label,
  siteName: link.kind === "twitter" ? "X" : link.hostname,
  youtubeId: link.youtubeId,
  twitterStatusId: link.twitterStatusId,
  image: link.kind === "imgur" ? imgurImageUrl(link.url) : undefined,
});
