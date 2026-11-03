/** The film script asks the background for a picture of the tab: only it may take one. */
export const FILM_CAPTURE = "unhooked/film-capture";
/** A post's film button asks for film mode, which isn't loaded until it's wanted. */
export const FILM_START = "unhooked/film-start";
/** Access was just granted: take the picture that was asked for. */
export const FILM_SHOOT = "unhooked/film-shoot";
/** What a browser needs before an extension may capture a tab it wasn't just invoked on. */
export const SCREENSHOT_ACCESS = { origins: ["<all_urls>"] };

export interface CaptureReply {
  /** A PNG as a data URL. */
  image?: string;
  error?: string;
  /** Not allowed yet; a window has opened to ask. */
  asking?: boolean;
}
