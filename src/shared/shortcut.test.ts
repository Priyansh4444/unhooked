import { describe, expect, it } from "bun:test";
import {
  DEFAULT_WAND_SHORTCUT,
  formatShortcut,
  matchesShortcut,
  shortcutFromEvent,
  wandShortcut,
} from "./shortcut.ts";

const key = (
  code: string,
  mods: Partial<Record<"ctrl" | "alt" | "shift" | "meta", boolean>> = {},
) => ({
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

describe("shortcuts", () => {
  it("records keys by position, modifiers in a fixed order", () => {
    expect(shortcutFromEvent(key("KeyW", { shift: true, alt: true }))).toBe("Alt+Shift+KeyW");
    expect(shortcutFromEvent(key("KeyK", { meta: true, ctrl: true }))).toBe("Ctrl+Meta+KeyK");
    expect(shortcutFromEvent(key("F8"))).toBe("F8");
  });

  it("refuses shortcuts that would fire while typing, and bare modifiers", () => {
    expect(shortcutFromEvent(key("KeyW"))).toBeNull();
    expect(shortcutFromEvent(key("KeyW", { shift: true }))).toBeNull();
    expect(shortcutFromEvent(key("ShiftLeft", { shift: true }))).toBeNull();
    expect(shortcutFromEvent(key("AltRight", { alt: true }))).toBeNull();
  });

  it("matches regardless of how the stored value orders its modifiers", () => {
    expect(matchesShortcut(key("KeyW", { alt: true, shift: true }), "Shift+Alt+KeyW")).toBe(true);
    expect(matchesShortcut(key("KeyW", { alt: true }), "Alt+Shift+KeyW")).toBe(false);
    expect(matchesShortcut(key("KeyW", { alt: true, shift: true }), "")).toBe(false);
  });

  it("formats for people, with Mac symbols on a Mac", () => {
    expect(formatShortcut("Alt+Shift+KeyW")).toBe("Alt+Shift+W");
    expect(formatShortcut("Alt+Shift+KeyW", true)).toBe("⌥⇧W");
    expect(formatShortcut("Ctrl+Backquote")).toBe("Ctrl+`");
    expect(formatShortcut("Ctrl+Digit1")).toBe("Ctrl+1");
    expect(formatShortcut("")).toBe("");
  });

  it("defaults until the user sets one, and stays off once cleared", () => {
    expect(wandShortcut(undefined)).toBe(DEFAULT_WAND_SHORTCUT);
    expect(wandShortcut("Ctrl+KeyK")).toBe("Ctrl+KeyK");
    expect(wandShortcut("")).toBe("");
  });
});
