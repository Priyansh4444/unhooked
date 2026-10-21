/** Popup and picker → page: outline what a control or wand removal covers, or stop. */
export const PREVIEW_ACTION = "uh/preview";

/** Page → background: the wand shortcut was pressed; inject the wand into the sender's tab. */
export const WAND_ACTION = "uh/wand";

export interface PreviewRequest {
  action: typeof PREVIEW_ACTION;
  /** A hide control's id on the page's site. */
  feature?: string;
  /** Several controls at once (a group switch). */
  features?: string[];
  /** A wand removal's selector. */
  selector?: string;
  /** Raw selectors (what focus mode and its options hide). */
  selectors?: string[];
  label?: string;
  /** Stop outlining. */
  clear?: boolean;
}
