import type { FocusSite } from "./sites.ts";

/**
 * Messages between the focus content scripts and the background.
 *
 * The background owns *whether* focus mode is on (per tab or globally); content scripts own
 * *how* it looks on the page. Content scripts pull state with GET/TOGGLE and the background
 * pushes it with SET.
 */
export const FOCUS_ACTION = Object.freeze({
  GET: "focus/get",
  TOGGLE: "focus/toggle",
  SET: "focus/set",
});

export interface FocusRequest {
  action: typeof FOCUS_ACTION.GET | typeof FOCUS_ACTION.TOGGLE;
  site: FocusSite;
  /** Set by the popup, which is not a tab itself; content scripts use their sender tab. */
  tabId?: number;
}

export interface FocusPush {
  action: typeof FOCUS_ACTION.SET;
  site: FocusSite;
  enabled: boolean;
}

export interface FocusReply {
  enabled: boolean;
}
