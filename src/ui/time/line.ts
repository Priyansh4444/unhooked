/**
 * A smooth line with a gradient under it. Changing the data morphs the line already on screen into
 * the new one, whatever the two lengths, and a new change can take over mid-flight. The pointer
 * only has to find the x: the nearest point lights up, and the arrow keys do the same.
 */
import { areaPath, smoothPath, valueAt } from "./curve.ts";

export interface LinePoint {
  label: string;
  title: string;
  value: number;
  /** Shown in the tooltip, and above the point in `counts` mode. */
  text: string;
  /** The point that's happening now: drawn in red. */
  current?: boolean;
  /** Hasn't happened yet: keeps its place on the axis, with no line to it. */
  future?: boolean;
}

export interface Tick {
  value: number;
  label: string;
}

interface Options {
  /** Room for the labels of a value axis. */
  axis?: boolean;
  /** Few points worth marking: a dot and a number on each. */
  counts?: boolean;
  /** What the whole chart is, for a screen reader. */
  summary: (points: LinePoint[]) => string;
  onPoint: (point: LinePoint | null, x: number, y: number) => void;
}

const SVG = "http://www.w3.org/2000/svg";
const MORPH_MS = 620;
let nextId = 0;

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t: number) => 1 - (1 - t) ** 4;
const make = <K extends keyof SVGElementTagNameMap>(tag: K, className = "") => {
  const el = document.createElementNS(SVG, tag);
  if (className) el.setAttribute("class", className);
  return el;
};

export class LineChart {
  readonly #root: HTMLElement;
  readonly #options: Options;
  readonly #area = make("path", "line-area");
  readonly #line = make("path", "line-stroke");
  readonly #hair = make("line", "line-hair");
  readonly #hover = make("circle", "line-dot line-hover");
  readonly #end = make("circle", "line-dot line-end");
  readonly #grid = make("g", "line-grid");
  readonly #dots = make("g");
  readonly #x = document.createElement("div");
  readonly #labels = document.createElement("div");
  readonly #stroke = make("linearGradient");

  #points: LinePoint[] = [];
  /** Across the plot, 0 to 1, for the points with a line. */
  #fracX: number[] = [];
  /** Up the plot, 0 to 1. What's drawn now, which the next change starts from. */
  #fracY: number[] = [];
  #frame = 0;
  #active: number | null = null;
  #entered = false;
  #gridTop = 0;
  #gridTicks: Tick[] = [];

  constructor(root: HTMLElement, options: Options) {
    this.#root = root;
    this.#options = options;
    root.classList.add("line-chart");
    root.tabIndex = 0;
    root.setAttribute("role", "img");

    const id = `line-${nextId++}`;
    const svg = make("svg");
    svg.setAttribute("aria-hidden", "true");
    const defs = make("defs");
    const fill = make("linearGradient");
    fill.id = `${id}-fill`;
    fill.setAttribute("x1", "0");
    fill.setAttribute("x2", "0");
    fill.setAttribute("y1", "0");
    fill.setAttribute("y2", "1");
    for (const [offset, className] of [
      ["0", "stop-top"],
      ["0.55", "stop-middle"],
      ["1", "stop-bottom"],
    ] as const) {
      const stop = make("stop", className);
      stop.setAttribute("offset", offset);
      fill.append(stop);
    }
    this.#stroke.id = `${id}-stroke`;
    this.#stroke.setAttribute("x1", "0");
    this.#stroke.setAttribute("x2", "1");
    defs.append(fill, this.#stroke);
    this.#area.setAttribute("fill", `url(#${id}-fill)`);
    this.#line.setAttribute("stroke", `url(#${id}-stroke)`);
    for (const circle of [this.#hover, this.#end]) circle.setAttribute("r", "4");
    this.#hover.style.opacity = "0";
    this.#hair.style.opacity = "0";
    svg.append(
      defs,
      this.#grid,
      this.#area,
      this.#line,
      this.#hair,
      this.#dots,
      this.#end,
      this.#hover,
    );

    this.#x.className = "line-x";
    this.#labels.className = "line-labels";
    root.append(svg, this.#x, this.#labels);

    root.addEventListener("pointermove", (event) => this.#pointAt(event.clientX));
    root.addEventListener("pointerleave", () => this.#setActive(null));
    root.addEventListener("focus", () => {
      if (this.#active === null) this.#setActive(this.#fracX.length - 1);
    });
    root.addEventListener("blur", () => this.#setActive(null));
    root.addEventListener("keydown", (event) => this.#key(event));
    new ResizeObserver(() => this.#layout()).observe(root);
  }

  update(points: LinePoint[], top: number, ticks: Tick[] = []): void {
    const lengthChanged = points.length !== this.#points.length;
    this.#points = points;
    const plotted = points.filter((point) => !point.future);
    const slots = Math.max(points.length - 1, 1);
    const toX = plotted.map((_, i) => (points.length > 1 ? i / slots : 0.5));
    const toY = plotted.map((point) => (top ? point.value / top : 0));
    const fromX = this.#fracX;
    const fromY = this.#fracY;
    this.#root.dataset.count = String(points.length);
    this.#root.dataset.plotted = String(plotted.length);
    this.#root.setAttribute("aria-label", this.#options.summary(points));
    this.#setTicks(ticks, top);
    if (lengthChanged) this.#setXLabels();
    this.#setStrokeEnd(plotted.at(-1)?.current ?? false);
    this.#fracX = toX;
    if (this.#active !== null && this.#active >= toX.length) this.#setActive(null);

    cancelAnimationFrame(this.#frame);
    const first = !this.#entered;
    this.#entered = true;
    // Where each new point is on the line that's up now, so nothing jumps.
    const start = toX.map((x) => (fromX.length ? valueAt(fromX, fromY, x) : 0));
    if (calm()) {
      this.#draw(toY);
      return;
    }
    const began = performance.now();
    const tick = (now: number) => {
      const elapsed = now - began;
      const current = toY.map((y, i) => {
        // On the first draw it rises left to right; later it all moves together.
        const delay = first ? (i / Math.max(toY.length - 1, 1)) * 260 : 0;
        const t = Math.min(1, Math.max(0, (elapsed - delay) / MORPH_MS));
        return start[i]! + (y - start[i]!) * easeOut(t);
      });
      this.#draw(current);
      if (elapsed < MORPH_MS + (first ? 260 : 0)) this.#frame = requestAnimationFrame(tick);
      else this.#draw(toY);
    };
    this.#frame = requestAnimationFrame(tick);
  }

  #size() {
    const width = this.#root.clientWidth;
    const height = this.#root.clientHeight;
    return {
      left: this.#options.axis ? 40 : 14,
      right: width - 14,
      top: this.#options.counts ? 26 : 12,
      bottom: height - 26,
    };
  }

  #xOf(frac: number): number {
    const { left, right } = this.#size();
    return left + (right - left) * frac;
  }

  #yOf(frac: number): number {
    const { top, bottom } = this.#size();
    return bottom - (bottom - top) * frac;
  }

  #draw(fracY: number[]): void {
    this.#fracY = fracY;
    const xs = this.#fracX.map((frac) => this.#xOf(frac));
    const ys = fracY.map((frac) => this.#yOf(frac));
    const { bottom } = this.#size();
    this.#line.setAttribute("d", xs.length > 1 ? smoothPath(xs, ys) : "");
    this.#area.setAttribute("d", areaPath(xs, ys, bottom));

    const last = this.#points.filter((point) => !point.future).at(-1);
    const showEnd = Boolean(last?.current) || xs.length === 1;
    this.#end.style.display = showEnd && xs.length ? "" : "none";
    if (xs.length) {
      this.#end.setAttribute("cx", String(xs.at(-1)));
      this.#end.setAttribute("cy", String(ys.at(-1)));
      this.#end.classList.toggle("is-now", Boolean(last?.current));
    }
    if (this.#options.counts) this.#drawCounts(xs, ys);
    if (this.#active !== null) this.#placeActive();
  }

  #drawCounts(xs: number[], ys: number[]): void {
    while (this.#dots.children.length < xs.length) {
      const dot = make("circle", "line-dot");
      dot.setAttribute("r", "4");
      this.#dots.append(dot);
    }
    while (this.#labels.children.length < xs.length) {
      const label = document.createElement("span");
      label.className = "count";
      this.#labels.append(label);
    }
    xs.forEach((x, i) => {
      const dot = this.#dots.children[i]!;
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(ys[i]));
      const label = this.#labels.children[i] as HTMLElement;
      const point = this.#points[i]!;
      label.textContent = point.value ? String(point.value) : "";
      label.style.transform = `translate(calc(${x}px - 50%), ${ys[i]! - 24}px)`;
    });
  }

  #setTicks(ticks: Tick[], top: number): void {
    const { left, right } = this.#size();
    const wanted = this.#options.axis
      ? [{ value: 0, label: "0" }, ...ticks]
      : [{ value: 0, label: "" }];
    while (this.#grid.children.length < wanted.length) {
      const group = make("g");
      const line = make("line");
      const text = make("text");
      group.append(line, text);
      this.#grid.append(group);
    }
    [...this.#grid.children].forEach((child, i) => {
      const group = child as SVGGElement;
      const tick = wanted[i];
      group.style.opacity = tick ? "1" : "0";
      if (!tick) return;
      group.style.transform = `translateY(${this.#yOf(top ? tick.value / top : 0)}px)`;
      const line = group.children[0] as SVGLineElement;
      line.setAttribute("x1", String(left));
      line.setAttribute("x2", String(right));
      const text = group.children[1] as SVGTextElement;
      text.setAttribute("x", "0");
      text.setAttribute("y", "3.5");
      text.textContent = tick.label;
    });
    this.#gridTop = top;
    this.#gridTicks = ticks;
  }

  #setXLabels(): void {
    const count = this.#points.length;
    this.#x.replaceChildren(
      ...this.#points.flatMap((point, i) => {
        if (!point.label) return [];
        const label = document.createElement("span");
        label.textContent = point.label;
        label.dataset.frac = String(count > 1 ? i / (count - 1) : 0.5);
        return [label];
      }),
    );
    this.#placeXLabels();
  }

  #placeXLabels(): void {
    for (const child of this.#x.children) {
      const label = child as HTMLElement;
      const frac = Number(label.dataset.frac);
      // The ends stay inside the chart rather than hanging off it.
      const shift = frac === 0 ? "0%" : frac === 1 ? "-100%" : "-50%";
      const nudge = frac === 1 ? 8 : frac === 0 ? -8 : 0;
      label.style.transform = `translateX(${this.#xOf(frac) + nudge}px) translateX(${shift})`;
    }
  }

  #setStrokeEnd(isNow: boolean): void {
    // One colour, turning white only in the last moment before the present.
    const stops: [string, string][] = isNow
      ? [
          ["0", "stop-line"],
          ["0.95", "stop-line"],
          ["1", "stop-now"],
        ]
      : [
          ["0", "stop-line"],
          ["1", "stop-line"],
        ];
    this.#stroke.replaceChildren(
      ...stops.map(([offset, className]) => {
        const stop = make("stop", className);
        stop.setAttribute("offset", offset);
        return stop;
      }),
    );
  }

  #layout(): void {
    if (!this.#points.length) return;
    this.#setTicks(this.#gridTicks, this.#gridTop);
    this.#placeXLabels();
    this.#draw(this.#fracY);
  }

  #pointAt(clientX: number): void {
    if (!this.#fracX.length) return;
    const box = this.#root.getBoundingClientRect();
    const x = clientX - box.left;
    let nearest = 0;
    let best = Infinity;
    this.#fracX.forEach((frac, i) => {
      const distance = Math.abs(this.#xOf(frac) - x);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    this.#setActive(nearest);
  }

  #key(event: KeyboardEvent): void {
    const count = this.#fracX.length;
    if (!count) return;
    const at = this.#active ?? count - 1;
    const steps: Record<string, number> = {
      ArrowLeft: at - 1,
      ArrowRight: at + 1,
      Home: 0,
      End: count - 1,
    };
    const next = steps[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.#setActive(Math.min(count - 1, Math.max(0, next)));
  }

  #setActive(index: number | null): void {
    this.#active = index;
    const on = index !== null;
    this.#hair.style.opacity = on ? "1" : "0";
    this.#hover.style.opacity = on ? "1" : "0";
    if (on) this.#placeActive();
    else this.#options.onPoint(null, 0, 0);
  }

  #placeActive(): void {
    const index = this.#active;
    if (index === null || index >= this.#fracX.length) return;
    const x = this.#xOf(this.#fracX[index]!);
    const y = this.#yOf(this.#fracY[index] ?? 0);
    const { top, bottom } = this.#size();
    this.#hair.setAttribute("x1", String(x));
    this.#hair.setAttribute("x2", String(x));
    this.#hair.setAttribute("y1", String(top));
    this.#hair.setAttribute("y2", String(bottom));
    this.#hover.setAttribute("cx", String(x));
    this.#hover.setAttribute("cy", String(y));
    const point = this.#points[index];
    const box = this.#root.getBoundingClientRect();
    if (point) this.#options.onPoint(point, box.left + x, box.top + y);
  }
}
