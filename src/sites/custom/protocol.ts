/** Popup and picker → page: outline what a control or wand removal covers, or stop. */
export const PREVIEW_ACTION = "uh/preview";

export interface PreviewRequest {
  action: typeof PREVIEW_ACTION;
  /** A hide control's id on the page's site. */
  feature?: string;
  /** A wand removal's selector. */
  selector?: string;
  label?: string;
  /** Stop outlining. */
  clear?: boolean;
}
