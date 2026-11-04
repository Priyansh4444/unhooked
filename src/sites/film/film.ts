/**
 * Film mode: started by the popup, its shortcut, or the film button on a post.
 *
 *   S       copy a picture: the window, or the framed post on its backdrop
 *   Shift+S save it as a file instead
 *   click   on X, frame a post: it moves to the centre of the screen, slightly rounded
 *   A       show or hide a framed post's buttons
 *   Esc     back to the page, then out of film mode
 *
 * A framed post is real elements, not a picture: a copy on a stage above the page, laid out at
 * its enlarged size, so the browser draws its text and pictures sharp and it can be filmed as is.
 * X rebuilds its timeline as you scroll, so nothing of X's is moved or changed. Injecting the
 * script again while it runs turns it off. Other scripts in the page share the one running.
 */
import { ext } from "../../shared/ext-api.ts";
import { isEditableTarget } from "../../shared/keys.ts";
import { Overlay } from "../../shared/overlay.ts";
import { FRAME_WIDTH, cropBox, fitScale, sharperImage, shotName, type Box } from "./frame.ts";
import { FILM_CAPTURE, FILM_SHOOT, type CaptureReply } from "./protocol.ts";

export interface Film {
  stop(): void;
  /** Frames a post. `alone`: film mode was only started for this, so leaving the post ends it. */
  frame(post: HTMLElement, alone?: boolean): void;
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
/** How close to the bottom of the window the pointer brings the bar back. */
const BAR_ZONE_PX = 120;
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const PAGE_BANNER = canFrame
  ? `<b>Film mode</b>&nbsp; click a post to frame it &nbsp; <kbd>S</kbd> copy picture &nbsp; <kbd>⇧S</kbd> save &nbsp; <kbd>Esc</kbd> done`
  : `<b>Film mode</b>&nbsp; <kbd>S</kbd> copy picture &nbsp; <kbd>⇧S</kbd> save &nbsp; <kbd>Esc</kbd> done`;
const FRAMED_BANNER = `<b>Framed</b>&nbsp; <kbd>S</kbd> copy picture &nbsp; <kbd>⇧S</kbd> save &nbsp; <kbd>A</kbd> buttons &nbsp; <kbd>Esc</kbd> back`;

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
  copy.style.cursor = "auto";
  copy.style.userSelect = "text";
  for (const el of copy.querySelectorAll(
    '[data-testid="caret"], [aria-label="Grok actions"], .uh-film-slot',
  ))
    (el as HTMLElement).style.display = "none";
  // On a post's own page, the sort menu and "View quotes" sit below the actions.
  let below: Element | null = copy.querySelector('[role="group"]');
  while (below && below !== copy) {
    for (let next = below.nextElementSibling; next; next = next.nextElementSibling)
      (next as HTMLElement).style.display = "none";
    below = below.parentElement;
  }
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

/**
 * The transform that puts the laid-out card back over the post it came from, lined up by their
 * tops, since the copy can be shorter than the post without the controls below its actions.
 */
function flightFrom(card: HTMLElement, from: DOMRect): string {
  const end = card.getBoundingClientRect();
  const zoom = canZoom() ? Number(card.style.getPropertyValue("zoom")) || 1 : 1;
  const scale = from.width / end.width;
  const topAfterScale = end.top + (end.height * (1 - scale)) / 2;
  // Inside a zoomed element a transform's lengths are zoomed as well.
  const x = (from.left + from.width / 2 - (end.left + end.width / 2)) / zoom;
  const y = (from.top - topAfterScale) / zoom;
  return `translate(${x}px,${y}px) scale(${canZoom() ? scale : 1})`;
}

/** X's rule under each post would sit right along the frame's bottom edge. */
function clearBottomRule(copy: HTMLElement): void {
  const bottom = copy.getBoundingClientRect().bottom;
  const clear = (el: HTMLElement) => {
    if (getComputedStyle(el).borderBottomWidth !== "0px") el.style.borderBottomWidth = "0";
    for (const child of el.children) {
      if (child instanceof HTMLElement && child.getBoundingClientRect().bottom > bottom - 3) {
        clear(child);
      }
    }
  };
  clear(copy);
}

function start(): Film {
  const overlay = new Overlay();
  overlay.host.dataset.film = "on";
  overlay.closeWith(() => (stage ? unframe() : stop()));
  overlay.banner(PAGE_BANNER);
  let stage: Stage | null = null;
  let hovered: HTMLElement | null = null;
  let toast: ReturnType<typeof setTimeout> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let shooting = false;
  let alone = false;

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
    // Too long for the screen even at a readable size: it scrolls from its top.
    const tall = card.getBoundingClientRect().height > innerHeight * 0.92;
    const root = card.parentElement;
    if (root) {
      root.style.overflowY = tall ? "auto" : "hidden";
      root.style.placeItems = tall ? "start center" : "center";
      card.style.marginBlock = tall ? `${48 / scale}px` : "";
    }
    return scale;
  };

  /** With nothing going on, the toolbar and pointer leave the frame. */
  const rest = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (toast) return; // a message's own timer rests again when it's done
      overlay.banner(null);
      if (stage) stage.root.style.cursor = "none";
    }, IDLE_MS);
  };
  /** The pointer comes back wherever it moves; the bar only near the edge it lives on, or on a key. */
  const wake = (y?: number) => {
    if (stage) stage.root.style.cursor = "";
    if (!toast && (y === undefined || y > innerHeight - BAR_ZONE_PX)) overlay.banner(banner());
    rest();
  };

  const frame = (post: HTMLElement) => {
    const from = post.getBoundingClientRect();
    const root = css(
      document.createElement("div"),
      "position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;overflow:hidden;" +
        "overscroll-behavior:contain",
    );
    root.id = "uh-film-stage";
    const backdrop = css(
      document.createElement("div"),
      "position:fixed;inset:0;background:radial-gradient(circle at 50% 42%,#26262b,#101012 72%)",
    );
    const card = css(
      document.createElement("div"),
      `position:relative;box-sizing:border-box;width:${Math.min(from.width, FRAME_WIDTH)}px;overflow:hidden;` +
        `border-radius:${RADIUS}px;background:${pageBackground()};` +
        "box-shadow:0 0 0 1px rgb(255 255 255 / .1),0 28px 90px rgb(0 0 0 / .6)",
    );
    const copy = copyOf(post);
    const sharp = sharpen(copy);
    card.append(copy);
    root.append(backdrop, card);
    document.body.append(root);
    clearBottomRule(copy);
    // Nothing scrolls behind the stage, so the post is where it started when the stage closes.
    root.addEventListener(
      "wheel",
      (event) => {
        if (root.scrollHeight <= root.clientHeight) event.preventDefault();
      },
      { passive: false },
    );

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
    rest();
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
    if (alone) {
      alone = false;
      void back.finished.then(stop, stop);
    }
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

  /** A picture of the window, or of the framed post, without the film mode toolbar in it. */
  const takePicture = async (): Promise<Blob | "asking"> => {
    overlay.host.style.display = "none";
    let reply: CaptureReply | undefined;
    try {
      // Wait for the sharp pictures, and for any still being drawn.
      await stage?.sharp;
      await Promise.all(
        [...(stage?.card.querySelectorAll("img") ?? [])].map((img) => img.decode().catch(() => {})),
      );
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      reply = (await ext.runtime.sendMessage({ action: FILM_CAPTURE })) as CaptureReply;
    } catch {
    } finally {
      overlay.host.style.display = "";
    }
    if (reply?.asking) return "asking";
    if (!reply?.image) throw new Error("no picture");
    return crop(reply.image, stage && stage.card.getBoundingClientRect());
  };

  const saveFile = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = shotName(location.hostname);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const shoot = async (asFile = false) => {
    if (shooting) return;
    shooting = true;
    const picture = takePicture();
    // Started now, while this is still the key press: a browser only allows the clipboard for one.
    const onlyBlob = picture.then((result) => {
      if (result === "asking") throw new Error("asking");
      return result;
    });
    const copied = asFile
      ? Promise.resolve(false)
      : Promise.resolve()
          .then(() => navigator.clipboard.write([new ClipboardItem({ "image/png": onlyBlob })]))
          .then(
            () => true,
            () => false,
          );
    const [result, didCopy] = await Promise.all([picture.catch(() => null), copied]);
    shooting = false;
    if (result === "asking")
      return say(`<b>One question first.</b> Your answer is in the new window.`);
    if (!result) return say(`<b>That didn't work.</b> Try again.`);
    flash();
    overlay.host.dataset.shots = String(Number(overlay.host.dataset.shots ?? 0) + 1);
    overlay.host.dataset.copied = String(didCopy);
    if (didCopy)
      return say(`<b>Copied.</b>&nbsp; Paste it anywhere. &nbsp; <kbd>⇧S</kbd> saves a file`);
    saveFile(result);
    say(
      asFile
        ? `<b>Saved</b>&nbsp; to your downloads`
        : `<b>Saved to your downloads</b>&nbsp; The clipboard wasn't available.`,
    );
  };

  /** Finds in the real post what `el` is in its copy: the copy has the same shape. */
  const inRealPost = (el: Element, copy: Element, post: Element): HTMLElement | null => {
    const path: number[] = [];
    for (let node = el; node !== copy; node = node.parentElement!) {
      path.unshift([...node.parentElement!.children].indexOf(node));
    }
    let real: Element | undefined = post;
    for (const index of path) real = real?.children[index];
    return real instanceof HTMLElement ? real : null;
  };

  /** A click inside a framed post: selecting text stays selecting, and controls do what they do. */
  const interact = (event: MouseEvent, framed: Stage) => {
    const target = event.target as Element;
    const copy = framed.card.firstElementChild!;
    const control = target.closest<HTMLElement>('button, [role="button"]');
    if (control && copy.contains(control)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const real = inRealPost(control, copy, framed.post);
      if (!real) return;
      // These change the post where it is, so the frame stays and shows the result. Anything else
      // opens X's own reply box or menu, which belongs to the page, so the frame gets out of the way.
      if (/^(un)?(like)$|^(remove)?[bB]ookmark$/.test(control.dataset.testid ?? "")) {
        real.click();
        setTimeout(() => refreshActions(framed), 350);
      } else {
        unframe();
        real.click();
      }
      return;
    }
    // Links open in a new tab, leaving the frame where it is.
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (link) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      event.stopImmediatePropagation();
      return;
    }
    // Text, pictures and so on: nothing to do but let the browser select.
    event.stopImmediatePropagation();
  };

  const refreshActions = (framed: Stage) => {
    if (stage !== framed) return;
    const shown = framed.card.querySelector<HTMLElement>('article [role="group"]');
    const real = framed.post.querySelector('[role="group"]');
    if (!shown || !real) return;
    const fresh = real.cloneNode(true) as HTMLElement;
    fresh.style.display = shown.style.display;
    for (const el of fresh.querySelectorAll<HTMLElement>(".uh-film-slot"))
      el.style.display = "none";
    shown.replaceWith(fresh);
  };

  const postAt = (event: { clientX: number; clientY: number }) =>
    canFrame && !stage
      ? (document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(POST) ??
        null)
      : null;

  const onMove = (event: PointerEvent) => {
    wake(event.clientY);
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
    const target = event.target as Node;
    if (overlay.owns(target)) return; // the bar's close button
    if (stage?.root.contains(target)) {
      if (stage.card.contains(target)) return interact(event, stage);
      // The backdrop: back to the page.
      event.preventDefault();
      event.stopImmediatePropagation();
      return unframe();
    }
    const post = postAt(event);
    if (!post) return; // the rest of the page keeps working
    event.preventDefault();
    event.stopImmediatePropagation();
    hovered = null;
    frame(post);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey || isEditableTarget(event.target)) return;
    wake();
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (stage) unframe();
      else stop();
    } else if (key === "s") void shoot(event.shiftKey);
    else if (key === "a" && stage) toggleButtons();
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onMessage = (message: { action?: string }) => {
    // Just allowed from the other window, so this isn't a key press the clipboard would accept.
    if (message?.action === FILM_SHOOT) void shoot();
  };
  ext.runtime.onMessage.addListener(onMessage);
  rest();
  addEventListener("pointermove", onMove, { capture: true, passive: true });
  addEventListener("scroll", onScroll, { capture: true, passive: true });
  addEventListener("click", onClick, true);
  addEventListener("keydown", onKey, true);

  function stop() {
    ext.runtime.onMessage.removeListener(onMessage);
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

  return {
    stop,
    frame(post, on = false) {
      if (stage) return;
      alone = on;
      hovered = null;
      frame(post);
    },
  };
}

export const filmIfRunning = (): Film | undefined => registry.__unhookedFilm;

export function filmMode(): Film {
  registry.__unhookedFilm ??= start();
  return registry.__unhookedFilm;
}
