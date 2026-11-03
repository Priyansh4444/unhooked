/**
 * Moving settings to another browser: a small JSON file (or the same text on the clipboard). Pure,
 * so it is unit-tested; ui/transfer does the copying, saving and asking.
 *
 * A file can come from anywhere, so nothing in it is trusted: only keys Unhooked knows are read,
 * each with the type that key must have. What belongs to this browser stays out: whether it's
 * paused, the Twitch link log, and account names read from the sites.
 */
import { SITE_IDS, originPattern } from "../sites/hosts.ts";
import { controlSiteById } from "../sites/registry.ts";
import {
  customKey,
  customRules,
  isSitePath,
  type CustomRule,
  type RawStorage,
} from "./preferences.ts";
import { STORAGE_KEYS as K } from "./settings.ts";

export const FILE_FORMAT = "unhooked-settings";

const isBool = (value: unknown) => typeof value === "boolean";
const inRange = (low: number, high: number) => (value: unknown) =>
  typeof value === "number" && value >= low && value <= high;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Settings outside the per-site keys, and what each must look like. */
const FIXED_KEYS: Record<string, (value: unknown) => boolean> = {
  [K.LEGACY_YOUTUBE_OPTIONS]: isRecord,
  [K.WAND_SHORTCUT]: (value) => typeof value === "string" && value.length < 60,
  [K.EXCALIDRAW_CANVAS_ONLY]: isBool,
  [K.TIME_TRACKING]: isBool,
  [K.TIME_IGNORED]: (value) => Array.isArray(value) && value.every((v) => typeof v === "string"),
  [K.TWITTER_WIDTH]: inRange(30, 100),
  [K.TWITTER_FONT_SIZE]: inRange(13, 22),
  [K.TWITTER_USE_DEFAULT_FONT]: isBool,
  [K.TWITTER_CENTER_TIMELINE]: isBool,
  [K.TWITCH_LINK_PILLS]: isBool,
  [K.TWITCH_URL_LOG_ENABLED]: isBool,
  [K.TWITCH_HOVER_DELAY_MS]: inRange(100, 800),
};

const SITE_KEY = /^unhooked\.site\.([a-z]+)\.([A-Za-z]+)$/;
const CUSTOM_PREFIX = customKey("");
const WEB_PREFIX = "web:";
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function validSiteValue(key: string, value: unknown): boolean {
  const [, siteId = "", name = ""] = SITE_KEY.exec(key) ?? [];
  const site = controlSiteById(siteId);
  if (!site) return false;
  if (name === "redirectTo") return typeof value === "string" && isSitePath(value);
  const known =
    name === "enabled" || name === "redirect" || site.features.some((f) => f.id === name);
  return known && isBool(value);
}

const validWandSite = (id: string): boolean =>
  id.startsWith(WEB_PREFIX)
    ? HOST.test(id.slice(WEB_PREFIX.length))
    : (SITE_IDS as readonly string[]).includes(id);

/** Removals become CSS, so a selector may not close its rule or open a comment. */
const validSelector = (selector: string): boolean => !/[{}]|\/\*/.test(selector);

function cleanRules(raw: RawStorage, siteId: string): CustomRule[] {
  return customRules(raw, siteId)
    .filter((rule) => validSelector(rule.selector))
    .map(({ selector, label, at, original }) => ({
      selector,
      label: typeof label === "string" ? label.slice(0, 80) : selector.slice(0, 80),
      at: typeof at === "number" ? at : 0,
      ...(typeof original === "string" && { original: original.slice(0, 80) }),
    }));
}

/** Only the settings a file may carry. Used for both directions. */
export function transferable(raw: RawStorage): RawStorage {
  const out: RawStorage = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(CUSTOM_PREFIX)) {
      const siteId = key.slice(CUSTOM_PREFIX.length);
      const rules = validWandSite(siteId) ? cleanRules(raw, siteId) : [];
      if (rules.length) out[key] = rules;
    } else if (key in FIXED_KEYS ? FIXED_KEYS[key]!(value) : validSiteValue(key, value)) {
      out[key] = value;
    }
  }
  return out;
}

export function settingsFile(raw: RawStorage, now = new Date()): string {
  const file = {
    format: FILE_FORMAT,
    version: 1,
    savedAt: now.toISOString(),
    settings: transferable(raw),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export const fileName = (now = new Date()): string =>
  `unhooked-settings-${now.toISOString().slice(0, 10)}.json`;

/** The usable settings in a pasted or dropped file. Throws a sentence to show the user. */
export function readSettingsFile(text: string): RawStorage {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("That isn't an Unhooked settings file.");
  }
  if (!isRecord(file) || file.format !== FILE_FORMAT || !isRecord(file.settings))
    throw new Error("That isn't an Unhooked settings file.");
  if (typeof file.version !== "number" || file.version > 1)
    throw new Error("That file is from a newer Unhooked. Update this browser's copy first.");
  const settings = transferable(file.settings);
  if (!Object.keys(settings).length) throw new Error("That file has no settings in it.");
  return settings;
}

/**
 * What importing writes. The file's settings win; wand removals are combined, because a removal
 * made in this browser is still wanted after the import.
 */
export function importPatch(current: RawStorage, settings: RawStorage): RawStorage {
  const patch: RawStorage = { ...settings };
  for (const key of Object.keys(settings)) {
    if (!key.startsWith(CUSTOM_PREFIX)) continue;
    const siteId = key.slice(CUSTOM_PREFIX.length);
    const incoming = customRules(settings, siteId);
    const known = new Set(incoming.map((rule) => rule.selector));
    const kept = customRules(current, siteId).filter((rule) => !known.has(rule.selector));
    patch[key] = [...kept, ...incoming];
  }
  return patch;
}

/** Access to ask for: sites outside the built-in list need it before their removals can apply. */
export function originsToAsk(settings: RawStorage): string[] {
  return Object.keys(settings)
    .filter((key) => key.startsWith(CUSTOM_PREFIX + WEB_PREFIX))
    .map((key) => originPattern(key.slice(CUSTOM_PREFIX.length + WEB_PREFIX.length)));
}

export interface SettingsSummary {
  /** Sites with at least one control on. */
  sites: number;
  controls: number;
  skipping: number;
  removals: number;
  /** How many of those sites are outside Unhooked's list. */
  otherSites: number;
}

export function summarize(settings: RawStorage): SettingsSummary {
  const sites = new Set<string>();
  const summary: SettingsSummary = {
    sites: 0,
    controls: 0,
    skipping: 0,
    removals: 0,
    otherSites: 0,
  };
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith(CUSTOM_PREFIX)) {
      summary.removals += Array.isArray(value) ? value.length : 0;
      if (key.startsWith(CUSTOM_PREFIX + WEB_PREFIX)) summary.otherSites++;
      continue;
    }
    const [, siteId, name] = SITE_KEY.exec(key) ?? [];
    if (!siteId || value !== true) continue;
    if (name === "redirect") summary.skipping++;
    else if (name !== "enabled") {
      summary.controls++;
      sites.add(siteId);
    }
  }
  summary.sites = sites.size;
  return summary;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "6 controls on 2 sites, 3 wand removals, skipping 1 feed". */
export function describeSummary(summary: SettingsSummary): string {
  const parts = [
    summary.controls &&
      `${plural(summary.controls, "control")} on ${plural(summary.sites, "site")}`,
    summary.removals && plural(summary.removals, "wand removal"),
    summary.skipping && `feeds skipped on ${plural(summary.skipping, "site")}`,
  ].filter(Boolean);
  return parts.join(", ") || "Default choices";
}
