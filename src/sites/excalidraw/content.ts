/** Excalidraw's site switch: just the canvas. The look is style.css, gated on one <html> class. */
import { runPageController } from "../../shared/page-runtime.ts";
import { isPaused, siteSwitchOn } from "../../shared/switches.ts";

runPageController({
  render(raw, html) {
    html.classList.toggle("uh-canvas-only", !isPaused(raw) && siteSwitchOn(raw, "excalidraw"));
  },
});
