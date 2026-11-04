import { ext } from "../../../shared/ext-api.ts";
import { classifyLink, fallbackMeta, isEmptyLookup, type LinkMeta } from "../links.ts";
import { TWITCH_ACTIONS, type ResolveLinkResponse } from "../protocol.ts";

const inflight = new Map<string, Promise<LinkMeta>>();
/** What's already been learned, so a card can open with its content instead of a placeholder. */
const known = new Map<string, LinkMeta>();
const MOST_KNOWN = 200;

export const knownLinkMeta = (url: string): LinkMeta | undefined => known.get(url);

function remember(url: string, meta: LinkMeta): LinkMeta {
  // It could say more after the answer, or once the failed lookup is tried again.
  if (meta.canAsk || isEmptyLookup(meta)) return meta;
  if (known.size >= MOST_KNOWN) known.delete(known.keys().next().value!);
  known.set(url, meta);
  return meta;
}

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
        return reply?.ok && reply.meta ? remember(url, reply.meta) : fallback;
      } catch {
        return fallback; // background unreachable, or the extension was reloaded
      }
    })().finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  return pending;
}
