/**
 * The switches every content script checks, apart from shared/preferences.ts, which brings the
 * whole control registry with it. A script that only needs "is this on?" stays a few kilobytes.
 */
import { mergeLegacyOptions } from "../sites/youtube/options.ts";
import { STORAGE_KEYS } from "./settings.ts";

export type RawStorage = Record<string, unknown>;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

export const isPaused = (raw: RawStorage): boolean =>
  bool(
    raw[STORAGE_KEYS.PAUSED],
    mergeLegacyOptions(raw[STORAGE_KEYS.LEGACY_YOUTUBE_OPTIONS]).extensionDisabled,
  );

/** The switch beside each site's name. Most sites start on; Excalidraw hides its own tools. */
function siteSwitchKey(siteId: string): string {
  if (siteId === "twitch") return STORAGE_KEYS.TWITCH_LINK_PILLS;
  if (siteId === "excalidraw") return STORAGE_KEYS.EXCALIDRAW_CANVAS_ONLY;
  return `unhooked.site.${siteId}.enabled`;
}

export const siteSwitchOn = (raw: RawStorage, siteId: string): boolean =>
  bool(raw[siteSwitchKey(siteId)], siteId !== "excalidraw");

export const siteSwitchPatch = (raw: RawStorage, siteId: string): RawStorage => ({
  [siteSwitchKey(siteId)]: !siteSwitchOn(raw, siteId),
});

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
