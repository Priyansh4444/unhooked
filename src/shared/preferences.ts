/**
 * Hide-control preferences: independent scalar storage keys, so unrelated writes can't overwrite
 * each other. Only the popup writes them; content scripts read them.
 */
import { controlSiteById, type ControlSite } from "../sites/registry.ts";
import { mergeLegacyOptions, type YouTubeOptions } from "../sites/youtube/options.ts";
import { STORAGE_KEYS } from "./settings.ts";

export type RawStorage = Record<string, unknown>;
export type Preset = "balanced" | "focused" | "clear";
export const PRESETS: readonly Preset[] = ["balanced", "focused", "clear"];

export interface SiteSettings {
  paused: boolean;
  enabled: boolean;
  features: Record<string, boolean>;
  /** Skip the feeds: leave the site's feed pages for `redirectTo`. */
  redirect: boolean;
  redirectTo: string;
}

/** Keys that are about the whole site rather than one control. */
const SITE_KEYS = ["enabled", "redirect", "redirectTo"];

export function preferenceKey(siteId: string, featureId: string): string {
  const site = controlSiteById(siteId);
  if (!site || (!SITE_KEYS.includes(featureId) && !site.features.some((f) => f.id === featureId)))
    throw new Error(`Unknown preference ${siteId}.${featureId}`);
  return `unhooked.site.${siteId}.${featureId}`;
}

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

/** Missing YouTube keys fall back to the legacy `unhookedOptions` object; explicit values win. */
export function resolveSettings(raw: RawStorage, site: ControlSite): SiteSettings {
  const legacy = mergeLegacyOptions(raw[STORAGE_KEYS.LEGACY_YOUTUBE_OPTIONS]);
  const features: Record<string, boolean> = {};
  for (const f of site.features) {
    features[f.id] = bool(
      raw[preferenceKey(site.id, f.id)],
      site.id === "youtube" ? legacy[f.id as keyof YouTubeOptions] : false,
    );
  }
  const redirectTo = raw[preferenceKey(site.id, "redirectTo")];
  return {
    paused: isPaused(raw),
    enabled: bool(raw[preferenceKey(site.id, "enabled")], true),
    features,
    redirect: bool(raw[preferenceKey(site.id, "redirect")], false),
    redirectTo:
      typeof redirectTo === "string" && isSitePath(redirectTo)
        ? redirectTo
        : site.redirect.choices[0]!.path,
  };
}

/** A path on the same site ("/feed/subscriptions"), never another origin ("//evil.example"). */
export const isSitePath = (path: string): boolean =>
  /^\/(?![/\\])/.test(path) && path.length < 300 && !/\s/.test(path);

export const isPaused = (raw: RawStorage): boolean =>
  bool(
    raw[STORAGE_KEYS.PAUSED],
    mergeLegacyOptions(raw[STORAGE_KEYS.LEGACY_YOUTUBE_OPTIONS]).extensionDisabled,
  );

export function youTubeOptions(raw: RawStorage): YouTubeOptions {
  const state = resolveSettings(raw, controlSiteById("youtube")!);
  return {
    ...(state.features as Omit<YouTubeOptions, "extensionDisabled">),
    extensionDisabled: state.paused || !state.enabled,
  };
}

export function featurePatch(siteId: string, featureId: string, value: boolean): RawStorage {
  if (typeof value !== "boolean") throw new TypeError("Preference must be boolean");
  return { [preferenceKey(siteId, featureId)]: value };
}

export function redirectToPatch(siteId: string, path: string): RawStorage {
  if (!isSitePath(path)) throw new TypeError("Redirect target must be a path on the same site");
  return { [preferenceKey(siteId, "redirectTo")]: path };
}

export function presetPatch(siteId: string, preset: Preset): RawStorage {
  const site = controlSiteById(siteId);
  if (!site || !PRESETS.includes(preset)) throw new Error(`Unknown preset ${siteId}.${preset}`);
  return Object.fromEntries(
    site.features.map((f) => [
      preferenceKey(siteId, f.id),
      preset === "focused" || (preset === "balanced" && f.balanced),
    ]),
  );
}

/** The first preset whose patch matches the current choices (two can coincide on small sites). */
export function matchingPreset(siteId: string, state: SiteSettings): Preset | undefined {
  const site = controlSiteById(siteId)!;
  return PRESETS.find((preset) => {
    const patch = presetPatch(siteId, preset);
    return site.features.every((f) => patch[preferenceKey(siteId, f.id)] === state.features[f.id]);
  });
}

/** Applies a storage.onChanged payload, including removals, to a raw snapshot. */
export function mergeChanges(
  raw: RawStorage,
  changes: Record<string, { newValue?: unknown }>,
): RawStorage {
  for (const [key, change] of Object.entries(changes)) {
    if (change.newValue === undefined) delete raw[key];
    else raw[key] = change.newValue;
  }
  return raw;
}

// ---- wand removals ----------------------------------------------------------------------------

/** Something the wand removed: a selector found by clicking the page, and what it was called. */
export interface CustomRule {
  selector: string;
  label: string;
  at: number;
  /** What the wand called it, kept once the user renames it. */
  original?: string;
}

export const customKey = (siteId: string): string => `unhooked.custom.${siteId}`;

/** The site's wand removals, ignoring anything malformed in storage. `siteId` may be `web:<host>`. */
export function customRules(raw: RawStorage, siteId: string): CustomRule[] {
  const list = raw[customKey(siteId)];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (rule): rule is CustomRule =>
      !!rule &&
      typeof rule.selector === "string" &&
      rule.selector.length > 0 &&
      rule.selector.length < 600,
  );
}

/** The removals with one renamed; an empty name goes back to what the wand called it. */
export function renameRule(rules: CustomRule[], selector: string, label: string): CustomRule[] {
  return rules.map((rule) =>
    rule.selector === selector
      ? {
          ...rule,
          label: label.trim().slice(0, 80) || rule.original || rule.label,
          original: rule.original ?? rule.label,
        }
      : rule,
  );
}
