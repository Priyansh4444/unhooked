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

/**
 * What each focus mode takes off the page, for the popup's hover preview. Mirrors the site's
 * focus stylesheet (sites/<site>/style.css or youtube/focus.css).
 */
export const FOCUS_TARGETS: Readonly<Record<FocusSite, readonly string[]>> = {
  youtube: ["ytd-watch-flexy #secondary", "#masthead-container"],
  x: [
    '[data-testid="primaryColumn"] ~ [data-testid="sidebarColumn"]',
    '[data-testid="searchColumn"]',
    '[data-testid="chat-drawer-root"]',
    '[data-testid="GrokDrawer"]',
    "header",
  ],
  excalidraw: [".layer-ui__wrapper"],
};

/** What each of X's focus options hides (sites/x/style.css). */
export const X_FOCUS_TARGETS: Readonly<Record<string, readonly string[]>> = {
  hideSidebarColumn: [
    '[data-testid="primaryColumn"] ~ [data-testid="sidebarColumn"]',
    '[data-testid="searchColumn"]',
  ],
  hideChatDrawer: ['[data-testid="chat-drawer-root"]'],
  hideGrokDrawer: ['[data-testid="GrokDrawer"]'],
  centerTimeline: ["header"],
};
