/**
 * A highlight layer drawn over the page, in a closed shadow root so the site's CSS can't touch
 * it. The wand uses it to show what a click would delete; the popup and picker use it to show
 * which parts of the page a control covers while you hover that control.
 */

const STYLE = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
.box {
  position: fixed; top: 0; left: 0; box-sizing: border-box;
  border: 2px solid #e3170c; border-radius: 2px;
  background: repeating-linear-gradient(-45deg, rgb(227 23 12 / .2) 0 6px, rgb(227 23 12 / .07) 6px 12px);
  transition: transform 140ms cubic-bezier(.23,1,.32,1), width 140ms cubic-bezier(.23,1,.32,1),
    height 140ms cubic-bezier(.23,1,.32,1), opacity 120ms ease;
}
.box.kept { border-style: dashed; background: rgb(227 23 12 / .06); }
.chip {
  position: fixed; top: 0; left: 0; max-width: 460px; padding: 5px 9px;
  border: 1px solid #e3170c; background: #0a0a0a; color: #f2ede4;
  font: 12px/1.35 ui-monospace, "SFMono-Regular", Consolas, monospace; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  transition: transform 140ms cubic-bezier(.23,1,.32,1), opacity 120ms ease;
}
.chip b { color: #e3170c; font-weight: 600; }
.chip span { color: #8a857c; }
.banner {
  position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); padding: 8px 14px;
  border: 1px solid #3a3a3a; background: #0a0a0a; color: #d4cec4;
  font: 12px/1.4 ui-monospace, "SFMono-Regular", Consolas, monospace; white-space: nowrap;
}
.banner kbd { color: #f2ede4; font: inherit; border: 1px solid #3a3a3a; padding: 0 4px; }
.banner b { color: #e3170c; font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .box, .chip { transition: opacity 120ms ease; } }
`;

export interface Highlight {
  rects: DOMRect[];
  /** First line of the label chip; `<b>` and `<span>` are styled, everything else is text. */
  title: string;
  detail?: string;
  /** Dashed instead of hatched: "this is here, but a click won't remove it". */
  kept?: boolean;
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class Overlay {
  readonly host: HTMLElement;
  readonly #layer: HTMLElement;
  readonly #chip: HTMLElement;
  readonly #banner: HTMLElement;
  #boxes: HTMLElement[] = [];

  constructor() {
    this.host = document.createElement("unhooked-overlay");
    const root = this.host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${STYLE}</style><div class="layer"><div class="chip" hidden></div><div class="banner" hidden></div></div>`;
    this.#layer = root.querySelector(".layer")!;
    this.#chip = root.querySelector(".chip")!;
    this.#banner = root.querySelector(".banner")!;
    document.documentElement.append(this.host);
  }

  /** Is this node part of the overlay (so the wand never picks it)? */
  owns(node: Node | null): boolean {
    return node === this.host;
  }

  show({ rects, title, detail, kept = false }: Highlight): void {
    if (!this.host.isConnected) document.documentElement.append(this.host);
    while (this.#boxes.length < rects.length) {
      const box = document.createElement("div");
      box.className = "box";
      this.#layer.prepend(box);
      this.#boxes.push(box);
    }
    this.#boxes.forEach((box, i) => {
      const r = rects[i];
      box.hidden = !r;
      if (!r) return;
      box.classList.toggle("kept", kept);
      box.style.transform = `translate(${r.left}px, ${r.top}px)`;
      box.style.width = `${Math.max(r.width, 2)}px`;
      box.style.height = `${Math.max(r.height, 2)}px`;
    });
    const first = rects[0];
    this.#chip.hidden = !title;
    this.#chip.innerHTML = `${title}${detail ? ` <span>${escape(detail)}</span>` : ""}`;
    if (first) {
      // Above the element when there is room, otherwise just inside its top edge.
      const top = first.top > 34 ? first.top - 30 : Math.max(first.top + 4, 4);
      const left = Math.min(Math.max(first.left, 4), innerWidth - 300);
      this.#chip.style.transform = `translate(${left}px, ${top}px)`;
    } else {
      this.#chip.style.transform = `translate(${innerWidth / 2 - 150}px, 16px)`;
    }
  }

  banner(html: string | null): void {
    this.#banner.hidden = html === null;
    if (html !== null) this.#banner.innerHTML = html;
  }

  clear(): void {
    for (const box of this.#boxes) box.hidden = true;
    this.#chip.hidden = true;
  }

  destroy(): void {
    this.host.remove();
  }
}

export const escapeHtml = escape;
