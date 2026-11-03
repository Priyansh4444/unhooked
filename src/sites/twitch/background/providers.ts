/**
 * One function per site that can say more about a link than its URL does. Each gets the
 * URL-derived `fallbackMeta` to build on and may only use hosts listed in `LOOKUP_HOSTS`
 * (sites/hosts.ts).
 * To support a new site: write a provider here, register it in `PROVIDERS`, and add its host
 * to `LOOKUP_HOSTS`.
 */

import {
  compactNumber,
  extractTwitterUsername,
  imgurImageUrl,
  tryParseUrl,
  youtubePage,
  type ClassifiedLink,
  type LinkKind,
  type LinkMeta,
} from "../links.ts";
import { LOOKUP_HOSTS, SITE_HOSTS } from "../../hosts.ts";
import { fetchHtml, fetchJson, fetchStatus } from "./http.ts";
import { decodeEntities, parseOpenGraph } from "./og.ts";

type Provider = (link: ClassifiedLink, base: LinkMeta) => Promise<LinkMeta>;

const pathParts = (url: string): string[] =>
  (tryParseUrl(url)?.pathname ?? "").split("/").filter(Boolean);

// ---- Open Graph (any page we hold permission for) --------------------------------------------

/** Mirrors the manifest's page + lookup permissions, so a read here never 403s on rights. */
const PAGE_HOSTS = new Set<string>([...Object.values(SITE_HOSTS).flat(), ...LOOKUP_HOSTS]);

const canReadPage = (host: string): boolean =>
  PAGE_HOSTS.has(host) || host.endsWith(".lakebed.app");

/** Title / description / image from the page's own <meta og:*> tags. */
const openGraph: Provider = async (link, base) => {
  if (!canReadPage(link.hostname)) return base;
  const html = await fetchHtml(link.url);
  if (!html) return base;
  const og = parseOpenGraph(html, link.url);
  return {
    ...base,
    title: og.title || base.title,
    description: og.description || base.description,
    image: og.image || base.image,
    siteName: og.siteName || base.siteName,
  };
};

// ---- oEmbed sites ----------------------------------------------------------------------------

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  provider_name?: string;
}

const oembed =
  (endpoint: string, defaults: Partial<LinkMeta> = {}): Provider =>
  async (link, base) => {
    const data = await fetchJson<OEmbed>(`${endpoint}${encodeURIComponent(link.url)}`);
    if (!data?.title) return { ...base, ...defaults };
    return {
      ...base,
      ...defaults,
      title: data.title,
      authorName: data.author_name,
      image: data.thumbnail_url ?? defaults.image,
      siteName: data.provider_name || defaults.siteName,
      textSnippet: data.title,
    };
  };

// Embedding-disabled videos defeat oEmbed but still serve real og tags; deleted ones serve a
// consent or error wall. Only a real title upgrades the card.
const WALL_TITLE = /before you continue|^\W*YouTube\W*$/i;

const youtube: Provider = async (link, base) => {
  const meta = await oembed("https://www.youtube.com/oembed?format=json&url=", {
    siteName: "YouTube",
    image: link.youtubeId && `https://i.ytimg.com/vi/${link.youtubeId}/hqdefault.jpg`,
  })(link, base);
  if (meta.textSnippet) return meta;
  // Channels and playlists have no oEmbed, but their pages carry name, avatar and description.
  // Read the page on www.youtube.com: bare youtube.com links aren't in our host permissions.
  const page = new URL(link.url);
  if (page.hostname === "youtube.com" || page.hostname === "m.youtube.com") {
    page.hostname = "www.youtube.com";
  }
  const html = await fetchHtml(page.href);
  const og = html ? parseOpenGraph(html, page.href) : {};
  const title = og.title?.trim();
  if (!title || WALL_TITLE.test(title)) return meta;
  if (link.youtubeId) return { ...meta, title, textSnippet: title };
  const details = { ...meta, title, textSnippet: title, description: og.description };
  // A channel's image is its avatar: show it beside the name, not as a cropped banner.
  return youtubePage(page) === "channel"
    ? { ...details, image: undefined, authorName: title, authorAvatar: og.image }
    : { ...details, image: og.image };
};

const reddit = oembed("https://www.reddit.com/oembed?url=");
const spotify = oembed("https://open.spotify.com/oembed?url=", { siteName: "Spotify" });
const vimeo = oembed("https://vimeo.com/api/oembed.json?url=");

// ---- X / Twitter (official oEmbed, like YouTube/Reddit/Vimeo) ----------------------------------
// publish.x.com answers logged-out requests with the author's name and the post's HTML; the
// mirrors are gone. Only posts have an official lookup: profiles keep their URL-derived card.

interface XOEmbed {
  author_name?: string;
  html?: string;
}

const twitter: Provider = async (link, base) => {
  if (!link.twitterStatusId) return base;
  const endpoint = `https://publish.x.com/oembed?url=${encodeURIComponent(link.url)}`;
  const data = await fetchJson<XOEmbed>(endpoint);
  const paragraph = data?.html?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const text = decodeEntities(paragraph.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  const url = tryParseUrl(link.url);
  const handle = (url && extractTwitterUsername(url)) || undefined;
  if (text) {
    return {
      ...base,
      title: text.slice(0, 160),
      siteName: "X",
      authorName: data?.author_name || undefined,
      authorHandle: handle,
      textSnippet: text,
    };
  }
  // No post text is either a blip or a gone post: a 4xx says deleted (stable, show it),
  // anything else stays a bare fallback that retries soon.
  const gone = [401, 403, 404, 410].includes((await fetchStatus(endpoint)) ?? 0);
  if (!gone) return base;
  const note = "Post not found — deleted or private.";
  return {
    ...base,
    title: "Post not found",
    textSnippet: note,
    siteName: "X",
    authorHandle: handle,
  };
};

// ---- GitHub (API for facts, Open Graph fallback) ------------------------------------------------

interface GhRepo {
  full_name?: string;
  description?: string;
  stargazers_count?: number;
  forks_count?: number;
  language?: string;
  license?: { spdx_id?: string };
  owner?: { login?: string; avatar_url?: string };
}
interface GhIssue {
  title?: string;
  state?: string;
  comments?: number;
  user?: { login?: string; avatar_url?: string };
}
interface GhDiscussion {
  title?: string;
  user?: { login?: string; avatar_url?: string };
  category?: { name?: string };
  comments?: number;
  answer_chosen_at?: string | null;
  locked?: boolean;
}
interface GhUser {
  login?: string;
  name?: string;
  bio?: string;
  followers?: number;
  public_repos?: number;
  avatar_url?: string;
}

const gh = <T>(path: string) => fetchJson<T>(`https://api.github.com/${path}`);

const github: Provider = async (link, base) => {
  const [owner, repo, section, number] = pathParts(link.url);
  if (!owner) return { ...base, siteName: "GitHub" };

  // The page's own tags still carry the description when the API doesn't answer, but never
  // take its generated social image: it's a white box that duplicates the title.
  const ogFallback = async (title: string): Promise<LinkMeta> => {
    const html = await fetchHtml(link.url);
    if (!html) return { ...base, title, siteName: "GitHub" };
    const og = parseOpenGraph(html, link.url);
    const tag = ` - ${title}`;
    let description = og.description?.trim();
    if (description?.endsWith(tag)) description = description.slice(0, -tag.length).trim();
    const image = og.image?.includes("opengraph.githubassets.com") ? undefined : og.image;
    return {
      ...base,
      title,
      description: description || undefined,
      image,
      siteName: "GitHub",
    };
  };

  if (!repo) {
    const user = await gh<GhUser>(`users/${owner}`);
    if (!user) return ogFallback(owner);
    return {
      ...base,
      title: user?.name || owner,
      description: user?.bio || undefined,
      siteName: "GitHub",
      authorName: user?.name || owner,
      authorHandle: user?.login || owner,
      authorAvatar: user?.avatar_url,
      chips: user
        ? [
            `${compactNumber(user.followers ?? 0)} followers`,
            `${compactNumber(user.public_repos ?? 0)} repos`,
          ]
        : [],
    };
  }

  const isThread = (section === "issues" || section === "pull") && /^\d+$/.test(number ?? "");

  if (isThread) {
    // The number and kind come from the URL, so the card shows them even if the API is unavailable.
    const issue = await gh<GhIssue>(`repos/${owner}/${repo}/issues/${number}`);
    if (!issue) return ogFallback(`${owner}/${repo}#${number}`);
    return {
      ...base,
      title: issue?.title || `${owner}/${repo}#${number}`,
      description: `${owner}/${repo}`,
      siteName: `GitHub · ${section === "pull" ? "Pull request" : "Issue"} #${number}`,
      authorName: issue?.user?.login,
      authorAvatar: issue?.user?.avatar_url,
      chips: issue ? [issue.state ?? "", `💬 ${issue.comments ?? 0}`].filter(Boolean) : [],
    };
  }

  if (section === "discussions" && /^\d+$/.test(number ?? "")) {
    const post = await gh<GhDiscussion>(`repos/${owner}/${repo}/discussions/${number}`);
    if (!post) return ogFallback(`${owner}/${repo}#${number}`);
    return {
      ...base,
      title: post.title || `${owner}/${repo}#${number}`,
      description: `${owner}/${repo}`,
      siteName: `GitHub · Discussion #${number}`,
      authorName: post.user?.login,
      authorAvatar: post.user?.avatar_url,
      chips: [
        post.category?.name ?? "",
        post.answer_chosen_at ? "✓ answered" : "",
        typeof post.comments === "number" ? `💬 ${post.comments}` : "",
        post.locked ? "locked" : "",
      ].filter(Boolean),
    };
  }

  const data = await gh<GhRepo>(`repos/${owner}/${repo}`);
  if (!data) return ogFallback(`${owner}/${repo}`);
  const license = data?.license?.spdx_id;
  return {
    ...base,
    title: data?.full_name || `${owner}/${repo}`,
    description: data?.description || undefined,
    siteName: "GitHub",
    authorName: data.owner?.login,
    authorHandle: data.owner?.login,
    authorAvatar: data.owner?.avatar_url,
    chips: data
      ? [
          `★ ${compactNumber(data.stargazers_count ?? 0)}`,
          `⑂ ${compactNumber(data.forks_count ?? 0)}`,
          data.language ?? "",
          license && license !== "NOASSERTION" ? license : "",
        ].filter(Boolean)
      : [],
  };
};

// ---- imgur -----------------------------------------------------------------------------------

const imgur: Provider = async (link, base) => {
  const withOg = await openGraph(link, {
    ...base,
    siteName: "Imgur",
    image: imgurImageUrl(link.url),
  });
  // imgur's generic og:title says nothing about the post.
  return /magic of the internet/i.test(withOg.title)
    ? { ...withOg, title: base.title, description: undefined }
    : withOg;
};

const PROVIDERS: Partial<Record<LinkKind, Provider>> = {
  youtube,
  twitter,
  reddit,
  vimeo,
  spotify,
  github,
  imgur,
};

/** Look a link up. Kinds without a provider fall back to Open Graph (where permitted). */
export const lookUp = (link: ClassifiedLink, base: LinkMeta): Promise<LinkMeta> =>
  (PROVIDERS[link.kind] ?? openGraph)(link, base);

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
