/** What goes inside the hover card, per kind of link. Pure DOM building; hovercard.ts owns the rest. */

import { ext } from "../../../shared/ext-api.ts";
import type { LinkMeta } from "../links.ts";
import { TWITCH_ACTIONS } from "../protocol.ts";
import { ICON_PLAY } from "./icons.ts";
import { fillGlyph } from "./site-glyph.ts";

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const child of children) if (child) el.append(child);
  return el;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const isHttp = (value?: string): value is string => Boolean(value && /^https?:\/\//i.test(value));

// ---- building blocks -------------------------------------------------------------------------

function image(src: string, onError?: () => void): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => onError?.(), { once: true });
  return img;
}

function avatar(src?: string): HTMLElement | null {
  if (!isHttp(src)) return null;
  const img = image(src, () => img.remove());
  img.className = "uh-hovercard__avatar";
  return img;
}

function authorRow(meta: LinkMeta): HTMLElement | null {
  if (!meta.authorName && !meta.authorHandle) return null;
  return h(
    "div",
    "uh-hovercard__author",
    avatar(meta.authorAvatar),
    h(
      "div",
      "uh-hovercard__who",
      meta.authorName && h("span", "uh-hovercard__name", meta.authorName),
      meta.authorHandle && h("span", "uh-hovercard__handle", `@${meta.authorHandle}`),
    ),
  );
}

const chipRow = (chips?: string[]): HTMLElement | null =>
  chips?.length
    ? h("div", "uh-hovercard__chips", ...chips.map((c) => h("span", "uh-chip", c)))
    : null;

function siteRow(meta: LinkMeta): HTMLElement {
  const icon = h("span", "uh-hovercard__site-icon");
  fillGlyph(icon, meta.kind, hostOf(meta.url));
  // X's logo is its name, and the word beside it would only read "X X".
  const name = meta.kind === "twitter" ? "" : meta.siteName || hostOf(meta.url);
  return h("div", "uh-hovercard__site", icon, name);
}

function footer(meta: LinkMeta): HTMLElement {
  const open = h("a", "uh-hovercard__open", "Open ↗");
  open.href = meta.url;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  return h("div", "uh-hovercard__foot", h("span", "uh-hovercard__host", hostOf(meta.url)), open);
}

function playButton(label: string, onPlay: () => void): HTMLButtonElement {
  const play = h("button", "uh-hovercard__play");
  play.type = "button";
  play.setAttribute("aria-label", label);
  play.innerHTML = ICON_PLAY;
  play.addEventListener("click", (event) => {
    event.preventDefault();
    onPlay();
  });
  return play;
}

/** YouTube: thumbnail with a play button; a click swaps in the real embedded player. */
function videoMedia(meta: LinkMeta): HTMLElement | null {
  const small = meta.youtubeId && `https://i.ytimg.com/vi/${meta.youtubeId}/hqdefault.jpg`;
  const known = meta.image ?? small;
  if (!isHttp(known || undefined) || !meta.youtubeId) return null;
  const id = meta.youtubeId;

  const media = h("div", "uh-hovercard__media uh-hovercard__media--video");
  // The largest still YouTube has, sharp on a high-density screen. A video without one gets a
  // 120px grey placeholder that loads like any picture, so the size is what tells them apart.
  const thumb = image(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, () => {
    thumb.src = known as string;
  });
  thumb.addEventListener(
    "load",
    () => {
      if (thumb.naturalWidth <= 120) thumb.src = known as string;
    },
    { once: true },
  );
  media.append(
    thumb,
    playButton("Play video", () => {
      const frame = h("iframe", "uh-hovercard__frame");
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      media.replaceChildren(frame);
    }),
  );
  return media;
}

function pictureMedia(meta: LinkMeta): HTMLElement | null {
  if (!isHttp(meta.image)) return null;
  const media = h("div", "uh-hovercard__media");
  media.append(image(meta.image, () => media.remove()));
  return media;
}

/** An X post's video, played right there on a click, or its pictures. */
function postMedia(meta: LinkMeta): HTMLElement | null {
  if (meta.video && isHttp(meta.video.src) && isHttp(meta.video.poster)) {
    const { poster, src } = meta.video;
    const media = h("div", "uh-hovercard__media uh-hovercard__media--post");
    media.append(
      image(poster),
      playButton("Play video", () => {
        const video = h("video", "uh-hovercard__frame");
        video.src = src;
        video.poster = poster;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        media.replaceChildren(video);
      }),
    );
    return media;
  }
  const photos = (meta.photos ?? []).filter(isHttp);
  if (!photos.length) return null;
  const grid = h("div", `uh-hovercard__photos uh-hovercard__photos--${photos.length}`);
  for (const photo of photos) {
    const cell = h("div", "uh-hovercard__photo");
    cell.append(image(photo, () => cell.remove()));
    grid.append(cell);
  }
  return grid;
}

function quotedPost(meta: LinkMeta): HTMLElement | null {
  const quote = meta.quote;
  if (!quote) return null;
  return h(
    "div",
    "uh-hovercard__quote",
    h(
      "div",
      "uh-hovercard__author",
      avatar(quote.avatar),
      h(
        "div",
        "uh-hovercard__who",
        h("span", "uh-hovercard__name", quote.name),
        h("span", "uh-hovercard__handle", `@${quote.handle}`),
      ),
    ),
    h("div", "uh-hovercard__tweet-text", quote.text),
  );
}

// ---- views -----------------------------------------------------------------------------------

export function renderSkeleton(inner: HTMLElement): void {
  inner.replaceChildren(
    h(
      "div",
      "uh-hovercard__body",
      h("div", "uh-skel uh-skel--site"),
      h("div", "uh-skel uh-skel--title"),
      h("div", "uh-skel uh-skel--line"),
    ),
  );
}

function askButton(): HTMLElement {
  const ask = h("button", "uh-hovercard__ask", "Show previews for every link");
  ask.type = "button";
  ask.addEventListener("click", () => {
    void ext.runtime.sendMessage({ action: TWITCH_ACTIONS.ASK_PREVIEWS }).catch(() => {});
  });
  return ask;
}

/**
 * The card for every kind of link, read like an embed on Discord: where it's from, what it is, who
 * made it, then what it shows. An X post's "title" is the post itself, so it reads as text.
 */
export function renderLink(inner: HTMLElement, meta: LinkMeta): void {
  const post = meta.kind === "twitter" && !!meta.twitterStatusId;
  const description = meta.description && meta.description !== meta.url ? meta.description : "";
  // A profile's title is the person's name or handle, which the author row already shows.
  const named =
    !post &&
    meta.title !== meta.authorName &&
    !(meta.authorHandle && meta.title === `@${meta.authorHandle}`);
  const title = h("a", "uh-hovercard__title", meta.title || meta.url);
  title.href = meta.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  const media = post
    ? postMedia(meta)
    : (meta.kind === "youtube" && videoMedia(meta)) || pictureMedia(meta);
  inner.replaceChildren(
    h(
      "div",
      "uh-hovercard__body",
      siteRow(meta),
      named && title,
      authorRow(meta),
      post && meta.replyTo && h("div", "uh-hovercard__reply", `Replying to @${meta.replyTo}`),
      post && h("div", "uh-hovercard__tweet-text", meta.textSnippet || meta.title),
      description && h("div", "uh-hovercard__desc", description),
      media,
      post && quotedPost(meta),
      chipRow(meta.chips),
      meta.canAsk && askButton(),
      footer(meta),
    ),
  );
}
