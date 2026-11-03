import { ext } from "../../../shared/ext-api.ts";
import { classifyLink, fallbackMeta, type LinkMeta } from "../links.ts";
import { TWITCH_ACTIONS, type ResolveLinkResponse } from "../protocol.ts";

const inflight = new Map<string, Promise<LinkMeta>>();

/** Ask the background about a link. Always resolves: on any failure you get the URL-derived meta. */
export function resolveLinkMeta(url: string): Promise<LinkMeta> {
  let pending = inflight.get(url);
  if (!pending) {
    const link = classifyLink(url);
    const fallback: LinkMeta = link ? fallbackMeta(link) : { kind: "generic", url, title: url };
    pending = (async () => {
      try {
        const reply = (await ext.runtime.sendMessage({
          action: TWITCH_ACTIONS.RESOLVE_LINK,
          url,
        })) as ResolveLinkResponse | undefined;
        return reply?.ok && reply.meta ? reply.meta : fallback;
      } catch {
        return fallback; // background unreachable, or the extension was reloaded
      }
    })().finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  return pending;
}
