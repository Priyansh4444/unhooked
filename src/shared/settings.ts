/**
 * Every storage.local key and its default. Hide-control preferences are scalar keys built by
 * shared/preferences.ts (`unhooked.site.<site>.<feature>`), so they are not listed here.
 */

export interface ToggleState {
  enabled: boolean;
}

export interface TwitterFocusControls {
  hideSidebarColumn: boolean;
  hideChatDrawer: boolean;
  hideGrokDrawer: boolean;
  hideHeader: boolean;
  centerTimeline: boolean;
}

export const STORAGE_KEYS = Object.freeze({
  /** Global pause: every page change the extension makes stops until resumed. */
  PAUSED: "unhooked.paused",
  /** Saved YouTube options from the upstream Unhook-style extension (read-only fallback). */
  LEGACY_YOUTUBE_OPTIONS: "unhookedOptions",
  POPUP_THEME: "unhookedPopupTheme",
  YOUTUBE_PERSISTENCE_MODE: "youtube_persistence_mode",
  TWITTER_PERSISTENCE_MODE: "twitter_persistence_mode",
  EXCALIDRAW_PERSISTENCE_MODE: "excalidraw_persistence_mode",
  YOUTUBE_STATE: "youtube_state",
  TWITTER_STATE: "twitter_state",
  EXCALIDRAW_STATE: "excalidraw_state",
  TWITTER_WIDTH: "twitter_width",
  TWITTER_FONT_SIZE: "twitter_font_size",
  TWITTER_USE_DEFAULT_FONT: "twitter_use_default_font",
  TWITTER_FOCUS_CONTROLS: "twitter_focus_controls",
  TWITCH_LINK_PILLS: "twitch_link_pills",
  TWITCH_URL_LOG_ENABLED: "twitch_url_log_enabled",
  TWITCH_URL_LOG: "twitch_url_log",
  TWITCH_HOVER_DELAY_MS: "twitch_hover_delay_ms",
});

export const DEFAULTS = Object.freeze({
  YOUTUBE_PERSISTENCE_MODE: "tab" as const,
  TWITTER_PERSISTENCE_MODE: "tab" as const,
  EXCALIDRAW_PERSISTENCE_MODE: "tab" as const,
  YOUTUBE_STATE: { enabled: false } as ToggleState,
  TWITTER_STATE: { enabled: false } as ToggleState,
  EXCALIDRAW_STATE: { enabled: false } as ToggleState,
  TWITTER_WIDTH: 80,
  TWITTER_FONT_SIZE: 15,
  TWITTER_USE_DEFAULT_FONT: true,
  TWITTER_FOCUS_CONTROLS: {
    hideSidebarColumn: true,
    hideChatDrawer: true,
    hideGrokDrawer: true,
    hideHeader: true,
    centerTimeline: true,
  } as TwitterFocusControls,
  TWITCH_LINK_PILLS: true,
  TWITCH_URL_LOG_ENABLED: true,
  TWITCH_HOVER_DELAY_MS: 180,
});
