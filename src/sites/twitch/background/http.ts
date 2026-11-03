const TIMEOUT_MS = 3500;

/** GET with a timeout. Resolves null on any failure; 429/5xx/network blips get one retry. */
async function request(url: string, init: RequestInit, retries = 1): Promise<Response | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: abort.signal, credentials: "omit" });
    if (res.ok) return res;
    // other 4xx are real answers (private, deleted, not found)
    return retries > 0 && (res.status === 429 || res.status >= 500)
      ? request(url, init, retries - 1)
      : null;
  } catch {
    return retries > 0 ? request(url, init, retries - 1) : null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  const res = await request(url, { ...init, headers: { Accept: "application/json" } });
  return (await res?.json().catch(() => null)) ?? null;
}

const HTML_MAX = 2_000_000;
const OG_TAGS = ["og:title", "og:description", "og:image"];

/**
 * Enough of a page to read its tags. Some pages put them deep in the body (YouTube channels:
 * ~800KB in), so read as it arrives and stop once all three went by, or at HTML_MAX.
 */
export async function fetchHtml(url: string): Promise<string | null> {
  const res = await request(url, { headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!res || !/html/i.test(res.headers.get("content-type") ?? "")) return null;
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, HTML_MAX);

  const decoder = new TextDecoder();
  const seen = new Set<string>();
  let html = "";
  try {
    while (html.length < HTML_MAX && seen.size < OG_TAGS.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const from = Math.max(0, html.length - 64); // a tag may straddle two chunks
      html += decoder.decode(value, { stream: true });
      const fresh = html.slice(from);
      for (const tag of OG_TAGS) if (fresh.includes(`"${tag}"`)) seen.add(tag);
    }
  } finally {
    void reader.cancel().catch(() => {}); // stop downloading the rest
  }
  return html.slice(0, HTML_MAX);
}

/** Single GET status check with a timeout and no retry: null means the network failed. */
export async function fetchStatus(url: string): Promise<number | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: abort.signal, credentials: "omit" });
    await res.arrayBuffer().catch(() => null); // drain so the socket can be reused
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
