/** Open Graph / <title> extraction from raw HTML (pure: no DOM, no network). */

export interface OpenGraph {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(decodeEntities(href), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Reads og:* and twitter:* meta tags (falling back to <title> / meta description). */
export function parseOpenGraph(html: string, baseUrl: string): OpenGraph {
  // The whole document, not just <head>: some sites (YouTube) put their tags in the body.
  // The first occurrence wins, so a normal page still uses the ones in its head.
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !meta.has(key)) meta.set(key, decodeEntities(content).trim());
  }
  const pageTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const get = (...keys: string[]) => keys.map((k) => meta.get(k)).find(Boolean);

  return {
    title:
      get("og:title", "twitter:title") ??
      (pageTitle ? decodeEntities(pageTitle).trim() : undefined),
    description: get("og:description", "twitter:description", "description"),
    image: absolute(get("og:image", "og:image:url", "twitter:image", "twitter:image:src"), baseUrl),
    siteName: get("og:site_name"),
  };
}
