/**
 * The page selectors behind each YouTube option, read from controls.css itself so a preview of
 * "what this hides" can never drift from what actually gets hidden.
 */
import controlsCss from "./controls.css" with { type: "text" };
import { OPTION_CLASSES, type YouTubeOptionKey } from "./options.ts";

export interface OptionSelector {
  /** Other <html> classes the rule needs (uh-mobile, uh-embed). */
  requires: string[];
  selector: string;
}

/** Split on commas that are not inside parentheses (`:has(a, b)`). */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

export function parseOptionSelectors(css: string): Map<string, OptionSelector[]> {
  const byClass = new Map<string, OptionSelector[]>();
  const optionClasses = new Set(Object.values(OPTION_CLASSES));
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").split("}");
  for (const rule of rules) {
    const head = rule.split("{")[0];
    if (!head) continue;
    for (const raw of splitTopLevel(head.replace(/\s+/g, " "))) {
      const match = /^html:not\(\.uh-extension-disabled\)((?:\.uh-[a-z-]+)+)\s+(.+)$/.exec(raw);
      if (!match) continue;
      const classes = match[1]!.split(".").filter(Boolean);
      const option = classes.find((c) => optionClasses.has(c));
      if (!option) continue;
      const entry = { requires: classes.filter((c) => c !== option), selector: match[2]! };
      byClass.set(option, [...(byClass.get(option) ?? []), entry]);
    }
  }
  return byClass;
}

let parsed: Map<string, OptionSelector[]> | null = null;

/** Selectors that apply on this page for one option (given the <html> classes present). */
export function selectorsForOption(key: YouTubeOptionKey, html: Element): string[] {
  parsed ??= parseOptionSelectors(controlsCss);
  return (parsed.get(OPTION_CLASSES[key]) ?? [])
    .filter((entry) => entry.requires.every((c) => html.classList.contains(c)))
    .map((entry) => entry.selector);
}

export { controlsCss };
