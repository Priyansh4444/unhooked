import { describe, expect, it } from "bun:test";
import { areaPath, curveSegments, smoothPath, valueAt } from "./curve.ts";

describe("smooth lines", () => {
  const xs = [0, 10, 20, 30, 40, 50, 60];
  it.each([
    ["a spike", [0, 0, 100, 0, 0, 0, 0]],
    ["a cliff", [100, 100, 100, 0, 0, 0, 0]],
    ["steps", [0, 10, 10, 90, 90, 95, 100]],
    ["noise", [5, 80, 3, 77, 1, 99, 0]],
  ])("never leave the range between two points: %s", (_, ys) => {
    for (const s of curveSegments(xs, ys)) {
      const low = Math.min(s.y0, s.y1) - 1e-9;
      const high = Math.max(s.y0, s.y1) + 1e-9;
      for (const y of [s.c1y, s.c2y]) {
        expect(y).toBeGreaterThanOrEqual(low);
        expect(y).toBeLessThanOrEqual(high);
      }
    }
  });
  it("go through every point", () => {
    const ys = [5, 80, 3, 77, 1, 99, 0];
    const segments = curveSegments(xs, ys);
    segments.forEach((s, i) => {
      expect(s.y0).toBe(ys[i]!);
      expect(s.y1).toBe(ys[i + 1]!);
    });
  });
  it("are flat at a peak, so it doesn't look higher than it was", () => {
    const [first, second] = curveSegments([0, 10, 20], [0, 100, 0]);
    expect(first!.c2y).toBe(100);
    expect(second!.c1y).toBe(100);
  });
  it("handle a single point and none", () => {
    expect(smoothPath([], [])).toBe("");
    expect(smoothPath([5], [7])).toBe("M5 7");
    expect(areaPath([5], [7], 100)).toBe("");
  });
  it("close down to the baseline for the fill", () => {
    expect(areaPath([0, 10], [5, 5], 20)).toEndWith("L10 20L0 20Z");
  });
  it("can be read at any x, for morphing", () => {
    expect(valueAt([0, 10], [0, 100], 5)).toBe(50);
    expect(valueAt([0, 10], [0, 100], -1)).toBe(0);
    expect(valueAt([0, 10], [0, 100], 99)).toBe(100);
  });
});
