/** Inline SVGs for chat pills (currentColor, ~14px). Stroke ~1.85 like t3 chips. */

import type { LinkKind } from "../links.ts";

const ICON_YOUTUBE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.5C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none"/></svg>`;

const ICON_TWITTER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>`;

const ICON_LINK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

const ICON_GITHUB = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.73.08-.72.08-.72 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.42.36.79 1.08.79 2.18 0 1.57-.01 2.84-.01 3.23 0 .31.21.68.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.74 18.27.5 12 .5z"/></svg>`;

const ICON_REDDIT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.26 6.1a1.44 1.44 0 0 1 1.44 1.44c0 .6-.36 1.1-.88 1.32a5.95 5.95 0 0 1-1.02 3.3 6.4 6.4 0 0 1-5.8 3.34 6.4 6.4 0 0 1-5.8-3.34 5.95 5.95 0 0 1-1.02-3.3 1.44 1.44 0 1 1 1.84-1.7c.5-.2 1.04-.34 1.6-.4L9.8 6.2a.6.6 0 0 1 .7-.36l3.28.72c.34-.42.86-.7 1.45-.7a1.72 1.72 0 0 1 1.72 1.72c0 .2-.04.4-.1.57l1.41.75zm-8.4 3.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm4.28 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm-4.3 3.55c.58.58 1.9.86 2.96.86s2.38-.28 2.96-.86a.4.4 0 0 1 .56.56c-.78.78-2.3 1.14-3.52 1.14s-2.74-.36-3.52-1.14a.4.4 0 1 1 .56-.56z"/></svg>`;

const ICON_MUSIC = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

export const ICON_PLAY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"/></svg>`;

const ICON_IMAGE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>`;

const ICONS: Partial<Record<LinkKind, string>> = {
  youtube: ICON_YOUTUBE,
  twitter: ICON_TWITTER,
  github: ICON_GITHUB,
  reddit: ICON_REDDIT,
  imgur: ICON_IMAGE,
  spotify: ICON_MUSIC,
  soundcloud: ICON_MUSIC,
  vimeo: ICON_PLAY,
  tiktok: ICON_PLAY,
  kick: ICON_PLAY,
  twitch: ICON_PLAY,
};

export const iconForKind = (kind: LinkKind): string => ICONS[kind] ?? ICON_LINK;
