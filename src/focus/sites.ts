import { DEFAULTS, STORAGE_KEYS } from "../shared/settings.ts";
import { hostBelongsTo, type SiteId } from "../sites/hosts.ts";

export type FocusSite = Extract<SiteId, "youtube" | "x" | "excalidraw">;
export type PersistenceMode = "tab" | "global";

export interface FocusSiteConfig {
  /** Manifest command (browser-level shortcut) that toggles this site, if it has one. */
  command?: string;
  /** Storage key holding the `{ enabled }` state when the mode is "global". */
  stateKey: string;
  persistenceKey: string;
  defaultMode: PersistenceMode;
}

/** Adding a focus site: an entry here, a `sites/<name>/content.ts` calling `startFocusSite`, and its hosts. */
export const FOCUS_SITES: Readonly<Record<FocusSite, FocusSiteConfig>> = {
  youtube: {
    command: "toggle-youtube-style",
    stateKey: STORAGE_KEYS.YOUTUBE_STATE,
    persistenceKey: STORAGE_KEYS.YOUTUBE_PERSISTENCE_MODE,
    defaultMode: DEFAULTS.YOUTUBE_PERSISTENCE_MODE,
  },
  x: {
    command: "toggle-twitter-style",
    stateKey: STORAGE_KEYS.TWITTER_STATE,
    persistenceKey: STORAGE_KEYS.TWITTER_PERSISTENCE_MODE,
    defaultMode: DEFAULTS.TWITTER_PERSISTENCE_MODE,
  },
  excalidraw: {
    stateKey: STORAGE_KEYS.EXCALIDRAW_STATE,
    persistenceKey: STORAGE_KEYS.EXCALIDRAW_PERSISTENCE_MODE,
    defaultMode: DEFAULTS.EXCALIDRAW_PERSISTENCE_MODE,
  },
};

export const FOCUS_SITE_IDS = Object.keys(FOCUS_SITES) as FocusSite[];

export const siteMatchesUrl = (site: FocusSite, url: string): boolean => hostBelongsTo(site, url);

export const findFocusSiteByUrl = (url: string | undefined): FocusSite | null =>
  (url && FOCUS_SITE_IDS.find((site) => siteMatchesUrl(site, url))) || null;
