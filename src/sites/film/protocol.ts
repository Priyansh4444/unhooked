/** The film script asks the background for a picture of the tab: only it may take one. */
export const FILM_CAPTURE = "unhooked/film-capture";

export interface CaptureReply {
  /** A PNG as a data URL. */
  image?: string;
  error?: string;
}
