/**
 * One function per site that can say more about a link than its URL does. Each gets the
 * URL-derived `fallbackMeta` to build on and may only use hosts listed in `LOOKUP_HOSTS`
 * (sites/hosts.ts).
 * To support a new site: write a provider here, register it in `PROVIDERS`, and add its host
 * to `LOOKUP_HOSTS`.
 */

import {
  classifyLink,
  compactNumber,
  extractTwitterUsername,
  fallbackMeta,
  imgurImageUrl,
  isPublicHost,
  twitterPageName,
  twitterProfileHandle,
  tryParseUrl,
  youtubePage,
  type ClassifiedLink,
  type LinkKind,
  type LinkMeta,
} from "../links.ts";
import { ext } from "../../../shared/ext-api.ts";
import { STORAGE_KEYS } from "../../../shared/settings.ts";
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

const mayRead = async (host: string): Promise<boolean> => {
  if (canReadPage(host)) return true;
  const key = STORAGE_KEYS.TWITCH_LINK_PREVIEWS;
  if ((await ext.storage.local.get(key))[key] !== true) return false;
  return (
    (await ext.permissions?.contains({ origins: [`*://${host}/*`] }).catch(() => false)) ?? false
  );
};

/** Title / description / image from the page's own <meta og:*> tags. */
const openGraph: Provider = async (link, base) => {
  if (!isPublicHost(link.hostname)) return base;
  if (!(await mayRead(link.hostname))) return { ...base, canAsk: true };
  const html = await fetchHtml(link.url, isPublicHost);
  if (!html) return base;
  const og = parseOpenGraph(html, link.url);
  return {
    ...base,
    title: og.title || base.title,
    description: og.description || base.description,
    image: og.image || base.image,
    siteName: og.siteName || base.siteName,
    accent: og.themeColor,
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

// ---- X / Twitter -----------------------------------------------------------------------------
// Posts come from the service X's own embeds read, which needs no account and carries the media
// and quoted post; publish.x.com's oEmbed is the fallback. Profiles carry public tags on their page.
// Nothing public describes Spaces, lists or communities, so those keep the card their address gives.

interface XUser {
  name?: string;
  screen_name?: string;
  profile_image_url_https?: string;
}

interface XVariant {
  type?: string;
  content_type?: string;
  bitrate?: number;
  src?: string;
  url?: string;
}

interface XMedia {
  type?: string;
  media_url_https?: string;
  video_info?: { variants?: XVariant[] };
}

export interface XTweet {
  __typename?: string;
  text?: string;
  display_text_range?: [number, number];
  entities?: { urls?: { url?: string; display_url?: string }[] };
  user?: XUser;
  favorite_count?: number;
  conversation_count?: number;
  created_at?: string;
  in_reply_to_screen_name?: string;
  mediaDetails?: XMedia[];
  photos?: { url?: string }[];
  video?: { poster?: string; variants?: XVariant[] };
  quoted_tweet?: XTweet;
  note_tweet?: unknown;
  article?: {
    title?: string;
    preview_text?: string;
    cover_media?: { media_info?: { original_img_url?: string } };
  };
  card?: { binding_values?: Record<string, { string_value?: string }> };
}

/** The value X's own embed code sends with a request for a post. */
export const tweetToken = (id: string): string =>
  ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");

const sharperAvatar = (src?: string): string | undefined => src?.replace("_normal.", "_bigger.");

/** The words someone wrote: without the trailing media link, and with links spelled out. */
function tweetText(tweet: XTweet): string {
  const [from, to] = tweet.display_text_range ?? [0, Infinity];
  let text = Array.from(tweet.text ?? "")
    .slice(from, to)
    .join("");
  for (const link of tweet.entities?.urls ?? [])
    if (link.url && link.display_url) text = text.replaceAll(link.url, link.display_url);
  return decodeEntities(text).trim();
}

const MOST_VIDEO_BITRATE = 2_500_000;

function tweetVideo(tweet: XTweet): LinkMeta["video"] {
  const media = tweet.mediaDetails?.find((m) => m.type === "video" || m.type === "animated_gif");
  const variants = media?.video_info?.variants ?? tweet.video?.variants ?? [];
  const files = variants
    .filter((v) => (v.content_type ?? v.type) === "video/mp4")
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  // Sharp in a card this size, and quick to start. The largest can be 4K at 8 Mbps.
  const best = files.find((v) => (v.bitrate ?? 0) <= MOST_VIDEO_BITRATE) ?? files.at(-1);
  const src = best?.url ?? best?.src;
  const poster = media?.media_url_https ?? tweet.video?.poster;
  return src && poster ? { poster, src } : undefined;
}

function tweetPoll(tweet: XTweet): string | undefined {
  const values = tweet.card?.binding_values;
  if (!values?.choice1_label) return undefined;
  const choices: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const label = values[`choice${i}_label`]?.string_value;
    if (label) choices.push(label);
  }
  return choices.length ? `Poll: ${choices.join(" · ")}` : undefined;
}

/** A post as a card. Null when there's nothing to show: gone, private, or age-restricted. */
export function metaFromTweet(tweet: XTweet | null, base: LinkMeta): LinkMeta | null {
  if (!tweet || tweet.__typename === "TweetTombstone" || !tweet.user?.screen_name) return null;
  const article = tweet.article;
  const written = tweetText(tweet);
  const text = article?.title ?? written;
  const video = tweetVideo(tweet);
  const photos = video
    ? undefined
    : (tweet.photos ?? [])
        .map((photo) => photo.url)
        .filter((url): url is string => !!url)
        .slice(0, 4);
  const quoted = tweet.quoted_tweet?.user?.screen_name ? tweet.quoted_tweet : undefined;
  const cover = article?.cover_media?.media_info?.original_img_url;
  const when = tweet.created_at ? new Date(tweet.created_at) : null;
  return {
    ...base,
    title: text.slice(0, 160) || `A post by @${tweet.user.screen_name}`,
    siteName: "X",
    textSnippet: text,
    description: article?.preview_text ?? tweetPoll(tweet),
    authorName: tweet.user.name || tweet.user.screen_name,
    authorHandle: tweet.user.screen_name,
    authorAvatar: sharperAvatar(tweet.user.profile_image_url_https),
    replyTo: tweet.in_reply_to_screen_name,
    video,
    photos: cover ? [cover] : photos?.length ? photos : undefined,
    quote: quoted && {
      name: quoted.user?.name || quoted.user!.screen_name!,
      handle: quoted.user!.screen_name!,
      avatar: sharperAvatar(quoted.user?.profile_image_url_https),
      text: tweetText(quoted),
    },
    chips: [
      tweet.favorite_count ? `♥ ${compactNumber(tweet.favorite_count)}` : "",
      tweet.conversation_count ? `↩ ${compactNumber(tweet.conversation_count)}` : "",
      when && !Number.isNaN(when.getTime())
        ? when.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })
        : "",
      tweet.note_tweet ? "Long post" : "",
    ].filter(Boolean),
  };
}

async function twitterProfile(handle: string, base: LinkMeta): Promise<LinkMeta> {
  const html = await fetchHtml(`https://x.com/${handle}`);
  const og = html ? parseOpenGraph(html, "https://x.com/") : null;
  const name = og?.title?.match(/^(.*?) \(@/)?.[1];
  return {
    ...base,
    title: `@${handle}`,
    siteName: "X",
    authorName: name || undefined,
    authorHandle: handle,
    authorAvatar: og?.image,
    description: name ? og?.description : undefined,
  };
}

interface XOEmbed {
  author_name?: string;
  html?: string;
}

const twitter: Provider = async (link, base) => {
  const url = tryParseUrl(link.url);
  if (!link.twitterStatusId) {
    const page = url && twitterPageName(url);
    if (page) {
      return {
        ...base,
        title: page,
        siteName: "X",
        description: "X doesn't share more about this publicly.",
      };
    }
    const profile = url && twitterProfileHandle(url);
    return profile ? twitterProfile(profile, base) : base;
  }
  const id = link.twitterStatusId;
  const post = await fetchJson<XTweet>(
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${tweetToken(id)}`,
  );
  const card = metaFromTweet(post, base);
  if (card) return card;
  const endpoint = `https://publish.x.com/oembed?url=${encodeURIComponent(link.url)}`;
  const data = await fetchJson<XOEmbed>(endpoint);
  const paragraph = data?.html?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const text = decodeEntities(paragraph.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
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

/** Where a page's refresh tag sends a browser. Any other `url=` on a page is just part of it. */
export const refreshTarget = (html: string): string | undefined =>
  html
    .match(/<meta\b[^>]*\bhttp-equiv=["']?refresh\b[^>]*>/i)?.[0]
    .match(/\burl=([^"'>\s]+)/i)?.[1];

/** X's link shortener says where it goes in the page it returns to a browser. */
async function unshorten(url: string): Promise<ClassifiedLink | null> {
  const html = await fetchHtml(url, isPublicHost);
  const target = html && refreshTarget(html);
  return target ? classifyLink(decodeEntities(target)) : null;
}

/** Look a link up. Kinds without a provider fall back to Open Graph (where permitted). */
export async function lookUp(link: ClassifiedLink, base: LinkMeta): Promise<LinkMeta> {
  const target = link.hostname === "t.co" ? await unshorten(link.url) : null;
  if (target) return lookUp(target, fallbackMeta(target));
  return (PROVIDERS[link.kind] ?? openGraph)(link, base);
}
