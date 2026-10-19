/**
 * User-set keyboard shortcuts, stored as "Ctrl+Alt+Shift+Meta+<KeyboardEvent.code>" so they follow
 * the key's position, not the character it types on a given layout. An empty string means none.
 */

export const DEFAULT_WAND_SHORTCUT = "Alt+Shift+KeyW";

interface KeyLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$|^(CapsLock|Fn|FnLock)$/;
const ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;

/** The shortcut an event spells, or null if it is only modifiers or would collide with typing. */
export function shortcutFromEvent(event: KeyLike): string | null {
  if (!event.code || MODIFIER_CODES.test(event.code)) return null;
  const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(event.code);
  // Without Ctrl, Alt or Meta, a shortcut would fire while typing (Shift alone types capitals).
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !functionKey) return null;
  const parts = [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Meta",
  ].filter(Boolean);
  return [...parts, event.code].join("+");
}

export function matchesShortcut(event: KeyLike, shortcut: string): boolean {
  return Boolean(shortcut) && shortcutFromEvent(event) === normalize(shortcut);
}

/** Accepts stored values in any modifier order. */
function normalize(shortcut: string): string {
  const parts = shortcut.split("+");
  const code = parts.pop() ?? "";
  const mods = ORDER.filter((m) => parts.includes(m));
  return [...mods, code].join("+");
}

const KEY_NAMES: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Escape: "Esc",
  Backspace: "Backspace",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const keyName = (code: string): string =>
  KEY_NAMES[code] ??
  code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Numpad/, "Num ");

/** "Alt+Shift+W", or "⌥⇧W" on a Mac. */
export function formatShortcut(shortcut: string, mac = false): string {
  if (!shortcut) return "";
  const parts = normalize(shortcut).split("+");
  const key = keyName(parts.pop()!);
  if (mac) {
    const symbols: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" };
    return parts.map((p) => symbols[p]).join("") + key;
  }
  return [...parts, key].join("+");
}

/** The stored shortcut, the default when never set, or "" when the user turned it off. */
export function wandShortcut(stored: unknown): string {
  return typeof stored === "string" ? stored : DEFAULT_WAND_SHORTCUT;
}
