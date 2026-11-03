/**
 * Smooth lines that stay honest. A plain spline overshoots: it dips below zero after a quiet day
 * and peaks above the busiest one. Monotone interpolation (Fritsch-Carlson) never leaves the range
 * between two neighbouring points, so a curve only ever shows values the data has.
 */

export interface Segment {
  x0: number;
  y0: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x1: number;
  y1: number;
}

export function curveSegments(xs: readonly number[], ys: readonly number[]): Segment[] {
  const n = xs.length;
  if (n < 2) return [];
  const widths: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const width = xs[i + 1]! - xs[i]!;
    widths.push(width);
    slopes.push(width ? (ys[i + 1]! - ys[i]!) / width : 0);
  }
  // A flat tangent at every peak and valley, and the harmonic mean of the slopes between them.
  const tangents = xs.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === n - 1) return slopes[n - 2]!;
    const before = slopes[i - 1]!;
    const after = slopes[i]!;
    if (before * after <= 0) return 0;
    const w1 = 2 * widths[i]! + widths[i - 1]!;
    const w2 = widths[i]! + 2 * widths[i - 1]!;
    return (w1 + w2) / (w1 / before + w2 / after);
  });
  return widths.map((width, i) => ({
    x0: xs[i]!,
    y0: ys[i]!,
    c1x: xs[i]! + width / 3,
    c1y: ys[i]! + (tangents[i]! * width) / 3,
    c2x: xs[i + 1]! - width / 3,
    c2y: ys[i + 1]! - (tangents[i + 1]! * width) / 3,
    x1: xs[i + 1]!,
    y1: ys[i + 1]!,
  }));
}

const round = (value: number) => Math.round(value * 100) / 100;

/** An SVG path through the points; a canvas can draw the same string with Path2D. */
export function smoothPath(xs: readonly number[], ys: readonly number[]): string {
  if (!xs.length) return "";
  const parts = [`M${round(xs[0]!)} ${round(ys[0]!)}`];
  for (const s of curveSegments(xs, ys)) {
    parts.push(
      `C${round(s.c1x)} ${round(s.c1y)} ${round(s.c2x)} ${round(s.c2y)} ${round(s.x1)} ${round(s.y1)}`,
    );
  }
  return parts.join("");
}

/** The same line, closed down to the baseline, for the gradient under it. */
export function areaPath(xs: readonly number[], ys: readonly number[], baseline: number): string {
  if (xs.length < 2) return "";
  return `${smoothPath(xs, ys)}L${round(xs.at(-1)!)} ${round(baseline)}L${round(xs[0]!)} ${round(baseline)}Z`;
}

/** Where a line drawn through these points is at `x`, for morphing one line into another. */
export function valueAt(xs: readonly number[], ys: readonly number[], x: number): number {
  if (!xs.length) return 0;
  if (x <= xs[0]!) return ys[0]!;
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]!) {
      const span = xs[i]! - xs[i - 1]!;
      return span ? ys[i - 1]! + ((ys[i]! - ys[i - 1]!) * (x - xs[i - 1]!)) / span : ys[i]!;
    }
  }
  return ys.at(-1)!;
}
