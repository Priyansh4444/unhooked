/** What goes inside the hover card, per kind of link. Pure DOM building; hovercard.ts owns the rest. */

import type { LinkMeta } from "../links.ts";
import { ICON_PLAY, iconForKind } from "./icons.ts";

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
  icon.innerHTML = iconForKind(meta.kind);
  return h("div", "uh-hovercard__site", icon, meta.siteName || hostOf(meta.url));
}

function footer(meta: LinkMeta): HTMLElement {
  const open = h("a", "uh-hovercard__open", "Open ↗");
  open.href = meta.url;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  return h("div", "uh-hovercard__foot", h("span", "uh-hovercard__host", hostOf(meta.url)), open);
}

/** YouTube: thumbnail with a play button; a click swaps in the real embedded player. */
function videoMedia(meta: LinkMeta): HTMLElement | null {
  const thumb =
    meta.image ?? (meta.youtubeId && `https://i.ytimg.com/vi/${meta.youtubeId}/hqdefault.jpg`);
  if (!isHttp(thumb || undefined) || !meta.youtubeId) return null;
  const id = meta.youtubeId;

  const media = h("div", "uh-hovercard__media uh-hovercard__media--video");
  const play = h("button", "uh-hovercard__play");
  play.type = "button";
  play.setAttribute("aria-label", "Play video");
  play.innerHTML = ICON_PLAY;
  media.append(image(thumb as string), play);
  play.addEventListener("click", (event) => {
    event.preventDefault();
    const frame = h("iframe", "uh-hovercard__frame");
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    media.replaceChildren(frame);
  });
  return media;
}

function pictureMedia(meta: LinkMeta): HTMLElement | null {
  if (!isHttp(meta.image)) return null;
  const media = h("div", "uh-hovercard__media");
  media.append(image(meta.image, () => media.remove()));
  return media;
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

/** The card for every kind of link: preview image, site, title, author, description, facts. */
export function renderLink(inner: HTMLElement, meta: LinkMeta): void {
  const description = meta.description && meta.description !== meta.url ? meta.description : "";
  // An X post's "title" is the post itself: read it as text under its author, not as a headline.
  const post = meta.kind === "twitter" && !!meta.twitterStatusId;
  const title = post
    ? h("div", "uh-hovercard__tweet-text", meta.textSnippet || meta.title)
    : // A profile's title is the person's name, which the author row already shows.
      meta.title !== meta.authorName && h("div", "uh-hovercard__title", meta.title || meta.url);
  const author = authorRow(meta);
  inner.replaceChildren(
    ...[
      (meta.kind === "youtube" && videoMedia(meta)) || pictureMedia(meta),
      h(
        "div",
        "uh-hovercard__body",
        siteRow(meta),
        ...(post ? [author, title] : [title, author]),
        description && h("div", "uh-hovercard__desc", description),
        chipRow(meta.chips),
        footer(meta),
      ),
    ].filter((node): node is HTMLElement => node !== null),
  );
}
