import { startFocusSite } from "../../focus/runtime.ts";

const ROOT_CLASS = "uh-focus-excalidraw";

const isControlB = (event: KeyboardEvent): boolean => {
  const normalizedKey = event.key.toLowerCase();
  const isKeyB = event.code === "KeyB" || normalizedKey === "b";
  const hasCtrlOrCmd = event.ctrlKey || event.metaKey;
  return isKeyB && hasCtrlOrCmd && !event.shiftKey && !event.altKey;
};

// The look is pure CSS (style.css, loaded by the manifest) gated on the root class.
startFocusSite({
  site: "excalidraw",
  isShortcut: isControlB,
  apply(enabled) {
    document.documentElement.classList.toggle(ROOT_CLASS, enabled);
  },
});
