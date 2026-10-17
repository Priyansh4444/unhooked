/** Messages between the Twitch content script, the background and the popup. */

import type { LinkMeta } from "./links.ts";

export const TWITCH_ACTIONS = Object.freeze({
  LOG_URL: "twitch-log-url",
  RESOLVE_LINK: "twitch-resolve-link",
  GET_URL_LOG: "twitch-get-url-log",
  CLEAR_URL_LOG: "twitch-clear-url-log",
} as const);

export interface ChatUrlEntry {
  url: string;
  hostname: string;
  kind: string;
  channel: string;
  seenAt: number;
  label?: string;
}

export interface ResolveLinkResponse {
  ok: boolean;
  meta?: LinkMeta;
}
