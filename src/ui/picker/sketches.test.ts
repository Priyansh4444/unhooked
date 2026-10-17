import { describe, expect, it } from "bun:test";
import { CONTROL_SITES } from "../../sites/registry.ts";
import { SKETCHES } from "./sketches.ts";

describe("picker sketches", () => {
  it("draw every hide control of every site at least once", () => {
    for (const site of CONTROL_SITES) {
      const drawn = new Set(SKETCHES[site.id].flatMap((view) => view.parts.map((p) => p.feature)));
      for (const feature of site.features)
        expect(drawn.has(feature.id), `${site.id}.${feature.id}`).toBe(true);
    }
  });

  it("only name controls that exist", () => {
    for (const site of CONTROL_SITES) {
      const ids = new Set(site.features.map((f) => f.id));
      for (const view of SKETCHES[site.id])
        for (const part of view.parts)
          if (part.feature) expect(ids.has(part.feature), `${site.id}.${part.feature}`).toBe(true);
    }
  });

  it("keep every part inside its 12-column grid", () => {
    for (const views of Object.values(SKETCHES))
      for (const view of views)
        for (const { label, at } of view.parts) {
          const [row, col, rows, cols] = at;
          expect(
            row >= 1 && rows >= 1 && row + rows - 1 <= view.rows,
            `${view.path} ${label}`,
          ).toBe(true);
          expect(col >= 1 && cols >= 1 && col + cols - 1 <= 12, `${view.path} ${label}`).toBe(true);
        }
  });

  it("use unique view ids per site", () => {
    for (const views of Object.values(SKETCHES))
      expect(new Set(views.map((v) => v.id)).size).toBe(views.length);
  });
});
