import { classifyLink, fallbackMeta, type LinkMeta } from "../links.ts";
import { isEmptyLookup, lookUp } from "./providers.ts";

const TTL_MS = 60 * 60 * 1000;
/** An empty answer (offline, rate-limited) is retried soon, not after an hour. */
const EMPTY_TTL_MS = 30 * 1000;
const CACHE_MAX = 200;

const cache = new Map<string, { meta: LinkMeta; expires: number }>();
const inflight = new Map<string, Promise<LinkMeta>>();

export async function resolveLink(url: string): Promise<LinkMeta> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.meta;
  const pending = inflight.get(url);
  if (pending) return pending;

  const link = classifyLink(url);
  if (!link) return { kind: "generic", url, title: url };

  const work = lookUp(link, fallbackMeta(link))
    .catch(() => fallbackMeta(link))
    .then((meta) => {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(url, { meta, expires: Date.now() + (isEmptyLookup(meta) ? EMPTY_TTL_MS : TTL_MS) });
      return meta;
    })
    .finally(() => inflight.delete(url));

  inflight.set(url, work);
  return work;
}
