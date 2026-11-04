/** The arithmetic of framing a post and cropping its picture. Pure, so it is unit-tested. */

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MOST_ENLARGED = 1.5;
/** A post taller than the screen stops shrinking here, and scrolls instead of turning to dust. */
const SMALLEST_READABLE = 0.9;
/** Posts are laid out at this width at most, however wide the page's column is. */
export const FRAME_WIDTH = 600;

/** How much to scale a post so it fills the screen with room around it, never past readable. */
export const fitScale = (post: Size, view: Size): number =>
  Math.min(
    MOST_ENLARGED,
    Math.max(SMALLEST_READABLE, (view.height * 0.84) / post.height),
    (view.width * 0.88) / post.width,
  );

/** The screenshot's crop in image pixels: the box and a margin of backdrop, inside the image. */
export function cropBox(box: Box, view: Size, imageWidth: number, margin = 56): Box {
  const ratio = imageWidth / view.width;
  const left = Math.max(0, box.left - margin);
  const top = Math.max(0, box.top - margin);
  const right = Math.min(view.width, box.left + box.width + margin);
  const bottom = Math.min(view.height, box.top + box.height + margin);
  return {
    left: Math.round(left * ratio),
    top: Math.round(top * ratio),
    width: Math.round((right - left) * ratio),
    height: Math.round((bottom - top) * ratio),
  };
}

/**
 * The same picture at its best size. X's timeline loads small copies: `name=small` on media and
 * link cards, and `_normal` on profile pictures. Anything else comes back unchanged.
 */
export function sharperImage(url: string): string {
  if (!url.startsWith("https://pbs.twimg.com/")) return url;
  return url
    .replace(/([?&]name=)[^&]*/, "$1large")
    .replace(/(\/profile_images\/.*)_(normal|bigger|mini|x96)(\.[a-z]+)$/i, "$1_400x400$3");
}

/** `x.com-2026-11-02-20-15-09.png`: sorts by time, and is safe on every file system. */
export function shotName(host: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())];
  const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())];
  return `${host.replace(/^www\./, "")}-${[...date, ...time].join("-")}.png`;
}
