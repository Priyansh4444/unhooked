/**
 * Film mode: the popup (or its shortcut) injects this into the current tab.
 *
 *   S       screenshot: the window, or the framed post on its backdrop
 *   click   on X, frame a post: it moves to the centre of the screen, slightly rounded
 *   A       show or hide a framed post's buttons
 *   Esc     back to the page, then out of film mode
 *
 * A framed post is real elements, not a picture: a copy on a stage above the page, laid out at
 * its enlarged size, so the browser draws its text and pictures sharp and it can be filmed as is.
 * X rebuilds its timeline as you scroll, so nothing of X's is moved or changed. Injecting the
 * script again while it runs turns it off.
 */
import { ext } from "../../shared/ext-api.ts";
import { isEditableTarget } from "../../shared/keys.ts";
import { Overlay } from "../../shared/overlay.ts";
import { cropBox, fitScale, sharperImage, shotName, type Box } from "./frame.ts";
import { FILM_CAPTURE, type CaptureReply } from "./protocol.ts";

interface Film {
  stop(): void;
}
interface Stage {
  root: HTMLElement;
  backdrop: HTMLElement;
  card: HTMLElement;
  /** The post it came from, hidden while its copy is up, and where it was. */
  post: HTMLElement;
  from: DOMRect;
  /** Settles once the copy's full-size pictures have arrived. */
  sharp: Promise<unknown>;
}

const registry = globalThis as { __unhookedFilm?: Film };

const POST = 'article[data-testid="tweet"]';
const canFrame = /(^|\.)(x|twitter)\.com$/.test(location.hostname);
const RADIUS = 16;
const SPRING = "cubic-bezier(.32,.72,0,1)";
/** How long the toolbar and pointer stay after the last sign of life, so a take stays clean. */
const IDLE_MS = 2600;
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const PAGE_BANNER = canFrame
  ? `<b>Film mode</b>&nbsp; click a post to frame it &nbsp; <kbd>S</kbd> screenshot &nbsp; <kbd>Esc</kbd> done`
  : `<b>Film mode</b>&nbsp; <kbd>S</kbd> screenshot &nbsp; <kbd>Esc</kbd> done`;
const FRAMED_BANNER = `<b>Framed</b>&nbsp; <kbd>S</kbd> screenshot &nbsp; <kbd>A</kbd> buttons &nbsp; <kbd>Esc</kbd> back`;

const css = (el: HTMLElement, text: string) => {
  el.style.cssText = text;
  return el;
};

/** The first background that isn't see-through, so the card matches the site's theme. */
function pageBackground(): string {
  for (const el of [document.body, document.documentElement]) {
    const { backgroundColor } = getComputedStyle(el);
    if (backgroundColor && !/^(transparent|rgba\(.*, 0\))$/.test(backgroundColor))
      return backgroundColor;
  }
  return "#000";
}

/** A copy of the post for the camera: what it shows, without the controls around it. */
function copyOf(post: HTMLElement): HTMLElement {
  const copy = post.cloneNode(true) as HTMLElement;
  copy.inert = true;
  copy.style.pointerEvents = "none";
  for (const el of copy.querySelectorAll('[data-testid="caret"], [aria-label="Grok actions"]'))
    (el as HTMLElement).style.display = "none";
  // "Pinned" and "reposted by" sit in a row of their own above the post.
  const context = copy.querySelector<HTMLElement>('[data-testid="socialContext"]');
  let row = context;
  while (
    row?.parentElement &&
    row.parentElement !== copy &&
    !row.parentElement.querySelector("time")
  )
    row = row.parentElement;
  if (row) {
    row.style.display = "none";
    copy.style.paddingTop = "12px"; // the row was also the post's top margin
  }
  // A cloned video has lost its stream, so it becomes a still of the frame on screen now.
  const playing = post.querySelectorAll("video");
  copy.querySelectorAll("video").forEach((video, index) => {
    const source = playing[index];
    if (!source?.videoWidth) return;
    const still = document.createElement("canvas");
    still.width = source.videoWidth;
    still.height = source.videoHeight;
    still.getContext("2d")?.drawImage(source, 0, 0);
    still.style.cssText = video.style.cssText;
    still.style.width = still.style.height = "100%";
    still.style.objectFit = getComputedStyle(source).objectFit;
    video.replaceWith(still);
  });
  return copy;
}

/** Swaps the copy's pictures for full-size ones, each only once it has loaded, so none go blank. */
function sharpen(copy: HTMLElement): Promise<unknown> {
  const swap = (url: string, apply: (best: string) => void) => {
    const best = sharperImage(url);
    if (best === url) return Promise.resolve();
    const loader = new Image();
    loader.src = best;
    return loader.decode().then(
      () => apply(best),
      () => {},
    );
  };
  const images = [...copy.querySelectorAll("img")].map((img) =>
    swap(img.currentSrc || img.src, (best) => {
      img.removeAttribute("srcset");
      img.src = best;
    }),
  );
  // X also paints each picture as the background of a div above its <img>.
  const painted = [...copy.querySelectorAll<HTMLElement>('[style*="background-image"]')].map(
    (el) => {
      const url = /url\("?([^")]+)"?\)/.exec(el.style.backgroundImage)?.[1];
      return url
        ? swap(url, (best) => {
            el.style.backgroundImage = `url("${best}")`;
          })
        : undefined;
    },
  );
  return Promise.all([...images, ...painted]);
}

const canZoom = () => CSS.supports("zoom", "2");

/** Enlarges by layout where the browser can, so nothing is a stretched bitmap. */
function setSize(card: HTMLElement, scale: number): void {
  if (canZoom()) {
    card.style.setProperty("zoom", String(scale));
    card.style.borderRadius = `${RADIUS / scale}px`; // zoom scales it too
  } else card.style.transform = `scale(${scale})`;
}

/** The transform that puts the laid-out card back over the post it came from. */
function flightFrom(card: HTMLElement, from: DOMRect): string {
  const end = card.getBoundingClientRect();
  const zoom = canZoom() ? Number(card.style.getPropertyValue("zoom")) || 1 : 1;
  // Inside a zoomed element a transform's lengths are zoomed as well.
  const x = (from.left + from.width / 2 - (end.left + end.width / 2)) / zoom;
  const y = (from.top + from.height / 2 - (end.top + end.height / 2)) / zoom;
  return `translate(${x}px,${y}px) scale(${canZoom() ? from.width / end.width : 1})`;
}

function start(): Film {
  const overlay = new Overlay();
  overlay.host.dataset.film = "on";
  overlay.banner(PAGE_BANNER);
  let stage: Stage | null = null;
  let hovered: HTMLElement | null = null;
  let toast: ReturnType<typeof setTimeout> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let shooting = false;

  const banner = () => (stage ? FRAMED_BANNER : PAGE_BANNER);
  const say = (html: string) => {
    overlay.banner(html);
    clearTimeout(toast);
    toast = setTimeout(() => {
      toast = undefined;
      overlay.banner(banner());
      rest();
    }, IDLE_MS);
  };

  /** The scale that fits the card as it is now, measured at its natural size. */
  const fit = (card: HTMLElement) => {
    card.style.removeProperty("zoom");
    card.style.transform = "none";
    const scale = fitScale(card.getBoundingClientRect(), {
      width: innerWidth,
      height: innerHeight,
    });
    card.style.transform = "";
    setSize(card, scale);
    return scale;
  };

  /** With nothing going on, the toolbar and pointer leave the frame. */
  const rest = () => {
    clearTimeout(idle);
    if (!stage) return;
    idle = setTimeout(() => {
      if (!stage) return;
      overlay.banner(null);
      stage.root.style.cursor = "none";
    }, IDLE_MS);
  };
  const wake = () => {
    if (!stage) return;
    stage.root.style.cursor = "";
    if (!toast) overlay.banner(FRAMED_BANNER);
    rest();
  };

  const frame = (post: HTMLElement) => {
    const from = post.getBoundingClientRect();
    const root = css(
      document.createElement("div"),
      "position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;overflow:hidden",
    );
    root.id = "uh-film-stage";
    const backdrop = css(
      document.createElement("div"),
      "position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,#26262b,#101012 72%)",
    );
    const card = css(
      document.createElement("div"),
      `position:relative;box-sizing:border-box;width:${from.width}px;overflow:hidden;` +
        `border-radius:${RADIUS}px;background:${pageBackground()};` +
        "box-shadow:0 0 0 1px rgb(255 255 255 / .1),0 28px 90px rgb(0 0 0 / .6)",
    );
    const copy = copyOf(post);
    const sharp = sharpen(copy);
    card.append(copy);
    root.append(backdrop, card);
    document.body.append(root);
    // Nothing scrolls behind the stage, so the post is where it started when the stage closes.
    root.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });

    // The card is laid out at its final size, and only the flight there is a transform.
    fit(card);
    const flight = flightFrom(card, from);
    const duration = calm() ? 0 : 460;
    card.animate([{ transform: flight }, { transform: card.style.transform || "none" }], {
      duration,
      easing: SPRING,
    });
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.7 });
    post.style.visibility = "hidden";
    stage = { root, backdrop, card, post, from, sharp };
    overlay.clear();
    overlay.banner(FRAMED_BANNER);
    rest();
  };

  const unframe = () => {
    if (!stage) return;
    const { root, backdrop, card, post, from } = stage;
    stage = null;
    overlay.banner(PAGE_BANNER);
    clearTimeout(idle);
    const duration = calm() ? 0 : 300;
    const back = card.animate(
      [{ transform: card.style.transform || "none" }, { transform: flightFrom(card, from) }],
      { duration, easing: SPRING, fill: "forwards" },
    );
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: "forwards" });
    const done = () => {
      post.style.visibility = "";
      root.remove();
    };
    void back.finished.then(done, done);
  };

  const toggleButtons = () => {
    if (!stage) return;
    const { card } = stage;
    const row = card.querySelector<HTMLElement>('article [role="group"]');
    if (!row) return;
    row.style.display = row.style.display === "none" ? "" : "none";
    fit(card);
  };

  const crop = async (image: string, box: Box | null): Promise<Blob> => {
    const picture = new Image();
    picture.src = image;
    await picture.decode();
    const view = { width: innerWidth, height: innerHeight };
    const area = box
      ? cropBox(box, view, picture.width)
      : { left: 0, top: 0, width: picture.width, height: picture.height };
    const canvas = document.createElement("canvas");
    canvas.width = area.width;
    canvas.height = area.height;
    canvas.getContext("2d")!.drawImage(picture, -area.left, -area.top);
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no image"))), "image/png"),
    );
  };

  const flash = () => {
    if (calm()) return;
    const light = css(
      document.createElement("div"),
      "position:fixed;inset:0;z-index:2147483646;background:#fff;pointer-events:none",
    );
    document.documentElement.append(light);
    const fade = light.animate([{ opacity: 0.45 }, { opacity: 0 }], {
      duration: 180,
      easing: "ease-out",
    });
    const gone = () => light.remove();
    void fade.finished.then(gone, gone);
  };

  const shoot = async () => {
    if (shooting) return;
    shooting = true;
    overlay.host.style.display = "none";
    // Wait for the sharp pictures, and for any still being drawn.
    await stage?.sharp;
    await Promise.all(
      [...(stage?.card.querySelectorAll("img") ?? [])].map((img) => img.decode().catch(() => {})),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let reply: CaptureReply | undefined;
    try {
      reply = (await ext.runtime.sendMessage({ action: FILM_CAPTURE })) as CaptureReply;
    } catch {}
    overlay.host.style.display = "";
    shooting = false;
    if (!reply?.image)
      return say(`<b>No picture.</b> Open Unhooked on this tab once more, then press S.`);
    flash();
    const blob = await crop(reply.image, stage && stage.card.getBoundingClientRect());
    const name = shotName(location.hostname);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    overlay.host.dataset.shots = String(Number(overlay.host.dataset.shots ?? 0) + 1);
    const copied = await navigator.clipboard
      ?.write([new ClipboardItem({ "image/png": blob })])
      .then(
        () => true,
        () => false,
      );
    say(`<b>${copied ? "Saved and copied" : "Saved"}</b>&nbsp; to your downloads`);
  };

  const postAt = (event: { clientX: number; clientY: number }) =>
    canFrame && !stage
      ? (document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(POST) ??
        null)
      : null;

  const onMove = (event: PointerEvent) => {
    wake();
    const post = postAt(event);
    if (post === hovered) return;
    hovered = post;
    if (post)
      overlay.show({ rects: [post.getBoundingClientRect()], title: "<b>Frame this post</b>" });
    else overlay.clear();
  };
  const onScroll = () => {
    if (hovered?.isConnected)
      overlay.show({ rects: [hovered.getBoundingClientRect()], title: "<b>Frame this post</b>" });
  };

  const onClick = (event: MouseEvent) => {
    const inside = stage?.root.contains(event.target as Node);
    const post = inside ? null : postAt(event);
    if (!inside && !post) return; // the rest of the page keeps working
    event.preventDefault();
    event.stopImmediatePropagation();
    if (inside) unframe();
    else if (post) {
      hovered = null;
      frame(post);
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey || isEditableTarget(event.target)) return;
    wake();
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (stage) unframe();
      else stop();
    } else if (key === "s") void shoot();
    else if (key === "a" && stage) toggleButtons();
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  addEventListener("pointermove", onMove, { capture: true, passive: true });
  addEventListener("scroll", onScroll, { capture: true, passive: true });
  addEventListener("click", onClick, true);
  addEventListener("keydown", onKey, true);

  function stop() {
    removeEventListener("pointermove", onMove, { capture: true });
    removeEventListener("scroll", onScroll, { capture: true });
    removeEventListener("click", onClick, true);
    removeEventListener("keydown", onKey, true);
    clearTimeout(toast);
    clearTimeout(idle);
    if (stage) {
      stage.post.style.visibility = "";
      stage.root.remove();
    }
    overlay.destroy();
    delete registry.__unhookedFilm;
  }

  return { stop };
}

if (registry.__unhookedFilm) registry.__unhookedFilm.stop();
else registry.__unhookedFilm = start();
