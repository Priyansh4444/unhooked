/**
 * Every storage.local key and its default. Hide-control preferences are scalar keys built by
 * shared/preferences.ts (`unhooked.site.<site>.<feature>`), so they are not listed here.
 */

export const STORAGE_KEYS = Object.freeze({
  /** Global pause: every page change the extension makes stops until resumed. */
  PAUSED: "unhooked.paused",
  /** Saved YouTube options from the upstream Unhook-style extension (read-only fallback). */
  LEGACY_YOUTUBE_OPTIONS: "unhookedOptions",
  /** Keyboard shortcut that starts the wand on a supported site (shared/shortcut.ts format). */
  WAND_SHORTCUT: "unhooked.wandShortcut",
  /** Excalidraw's site switch: hide the toolbars, leaving the canvas. */
  EXCALIDRAW_CANVAS_ONLY: "excalidraw_canvas_only",
  TWITTER_WIDTH: "twitter_width",
  TWITTER_FONT_SIZE: "twitter_font_size",
  TWITTER_USE_DEFAULT_FONT: "twitter_use_default_font",
  TWITTER_CENTER_TIMELINE: "twitter_center_timeline",
  TWITCH_LINK_PILLS: "twitch_link_pills",
  TWITCH_URL_LOG_ENABLED: "twitch_url_log_enabled",
  TWITCH_URL_LOG: "twitch_url_log",
  TWITCH_HOVER_DELAY_MS: "twitch_hover_delay_ms",
});

export const DEFAULTS = Object.freeze({
  EXCALIDRAW_CANVAS_ONLY: false,
  TWITTER_WIDTH: 80,
  TWITTER_FONT_SIZE: 15,
  TWITTER_USE_DEFAULT_FONT: true,
  TWITTER_CENTER_TIMELINE: false,
  TWITCH_LINK_PILLS: true,
  TWITCH_URL_LOG_ENABLED: true,
  TWITCH_HOVER_DELAY_MS: 180,
});
