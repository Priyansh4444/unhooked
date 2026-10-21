/**
 * Turns an element the wand picked into a CSS selector that will still find it after a reload.
 * Prefers what sites keep stable (ids, test hooks, custom element names, ARIA labels) over
 * generated class names, which change on every deploy. Produces two candidates: one for every
 * element like this one, and one for this element only.
 */

/** Test hooks and accessible names, best first. */
const STABLE_ATTRIBUTES = [
  "data-testid",
  "data-e2e",
  "data-test-id",
  "data-test",
  "aria-label",
  "role",
];

/** Looks hand-written: no build hashes, long digit runs or CSS-in-JS prefixes. */
export function isStableToken(token: string): boolean {
  if (!token || token.length > 40) return false;
  if (/\d{4,}/.test(token)) return false;
  if (/[0-9a-f]{6,}/i.test(token) && /\d/.test(token)) return false;
  if (/^(css|sc|jsx|tiktok|emotion|styled|x)[-_][a-z0-9]{3,}$/i.test(token)) return false;
  if (/^[a-z]{1,3}[A-Z0-9][a-zA-Z0-9]{4,}$/.test(token)) return false; // e.g. "eqg5fwt3", "xD8sk2"
  if (/^_[a-z0-9]{4,}$/i.test(token)) return false;
  return true;
}

export const cssEscape = (value: string): string =>
  typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

const attr = (name: string, value: string) => `[${name}="${value.replace(/["\\]/g, "\\$&")}"]`;

/** One element's own part of a selector, without position. */
export function stepFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  for (const name of STABLE_ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (value && value.length <= 60 && (name !== "role" || el.classList.length === 0))
      return `${tag}${attr(name, value)}`;
  }
  const classes = [...el.classList].filter(isStableToken).slice(0, 2);
  return tag + classes.map((c) => `.${cssEscape(c)}`).join("");
}

export interface Candidates {
  /** Every element shaped like this one (may be just one). */
  all: string;
  /** This element only. */
  one: string;
}

export function selectorsFor(el: Element, doc: Document = el.ownerDocument): Candidates {
  const steps: string[] = [];
  const positioned: string[] = [];
  for (
    let node: Element | null = el;
    node && node !== doc.documentElement;
    node = node.parentElement
  ) {
    if (
      node.id &&
      isStableToken(node.id) &&
      doc.querySelectorAll(`#${cssEscape(node.id)}`).length === 1
    ) {
      steps.unshift(`#${cssEscape(node.id)}`);
      positioned.unshift(`#${cssEscape(node.id)}`);
      break;
    }
    const step = stepFor(node);
    steps.unshift(step);
    const parent = node.parentElement;
    const twins = parent ? [...parent.children].filter((c) => c.matches(step)) : [];
    positioned.unshift(twins.length > 1 ? `${step}:nth-of-type(${indexOfType(node) + 1})` : step);
    // A custom element (YouTube's ytd-*, Reddit's shreddit-*) or a test hook anchors the path.
    const anchored = node.tagName.includes("-") || /\[(data-|aria-label)/.test(step);
    if (anchored && steps.length >= 1 && doc.querySelectorAll(steps.join(" > ")).length <= 50)
      break;
    if (node === doc.body) break;
  }
  const all = steps.join(" > ");
  let one = positioned.join(" > ");
  // Fall back to the positioned path from the body if the short one is still ambiguous.
  if (doc.querySelectorAll(one).length !== 1) one = fullPath(el, doc);
  return { all, one };
}

function indexOfType(el: Element): number {
  let index = 0;
  for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling)
    if (sib.tagName === el.tagName) index++;
  return index;
}

function fullPath(el: Element, doc: Document): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== doc.body; node = node.parentElement)
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${indexOfType(node) + 1})`);
  return ["body", ...parts].join(" > ");
}

/** A short human name for what was picked: its label, heading, or element type. */
export function describe(el: Element): string {
  const clip = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 48);
  const label = el.getAttribute("aria-label") || el.getAttribute("title");
  if (label) return clip(label);
  const heading = el.querySelector("h1, h2, h3, [role=heading]");
  if (heading?.textContent?.trim()) return clip(heading.textContent);
  const tag = el.tagName.toLowerCase();
  if (tag.includes("-"))
    return tag
      .replace(/^(ytd|ytm|yt|shreddit|reddit|tp-yt)-/, "")
      .replace(/-renderer$/, "")
      .replace(/-/g, " ");
  const text = el.textContent ? clip(el.textContent) : "";
  return text || tag;
}

/** Wrappers too small to be "a part of the page" on their own (images, icons, text runs). */
const FRAGMENT_TAGS =
  /^(yt-image|yt-icon|yt-formatted-string|yt-core-image|yt-img-shadow|yt-touch-feedback-shape|yt-attributed-string|tp-yt-paper-[a-z-]+|svg|path|img|picture|source|span|b|i|em|strong|use)$/;

/**
 * What a person pointing at the page most likely means: the nearest component around the
 * pointer (a custom element, an element with a test hook, an article or list item) that is big
 * enough to be a part and smaller than most of the window. Returns the chain from the pointed
 * element up to it, so ↓ can step back down.
 */
export function meaningfulTarget(el: Element, viewport = { width: 1440, height: 900 }): Element[] {
  const chain: Element[] = [];
  const maxArea = viewport.width * viewport.height * 0.8;
  for (
    let node: Element | null = el, depth = 0;
    node && depth < 10;
    node = node.parentElement, depth++
  ) {
    if (node === document.body || node === document.documentElement) break;
    chain.push(node);
    const tag = node.tagName.toLowerCase();
    const r = node.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > maxArea) break;
    const component =
      (tag.includes("-") && !FRAGMENT_TAGS.test(tag)) ||
      node.matches(
        "article, aside, section, li, nav, [data-testid], [data-e2e], [role=article], [role=listitem]",
      );
    if (component && r.width >= 60 && r.height >= 40) return chain;
  }
  return [el];
}
