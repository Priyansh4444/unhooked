import { describe, expect, it } from "bun:test";
import { CONTROL_SITES } from "../../sites/registry.ts";
import { SKETCH_WIDTH, SKETCHES } from "./sketches.ts";

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

  it("keep every part inside its window", () => {
    for (const views of Object.values(SKETCHES))
      for (const view of views)
        for (const { label, box } of view.parts) {
          const [x, y, w, h] = box;
          const where = `${view.path} ${label}`;
          expect(x >= 0 && w > 0 && x + w <= SKETCH_WIDTH, where).toBe(true);
          expect(y >= 0 && h > 0 && y + h <= view.height, where).toBe(true);
        }
  });

  it("give every control part a target big enough to click", () => {
    for (const views of Object.values(SKETCHES))
      for (const view of views)
        for (const { label, box, feature } of view.parts)
          if (feature) expect(box[2] >= 40 && box[3] >= 40, `${view.path} ${label}`).toBe(true);
  });

  it("use unique view ids per site", () => {
    for (const views of Object.values(SKETCHES))
      expect(new Set(views.map((v) => v.id)).size).toBe(views.length);
  });
});
