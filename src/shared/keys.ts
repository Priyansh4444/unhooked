export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  const isTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
  const isSelect = target.tagName === "SELECT";
  return target.isContentEditable || isTextInput || isSelect;
};

export const isYouTubeBackquoteShortcut = (event: KeyboardEvent): boolean => {
  const isBackquoteKey = event.key === "`" || event.code === "Backquote";
  const hasNoModifiers = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
  return isBackquoteKey && hasNoModifiers;
};

const isTwitterControlBShortcut = (event: KeyboardEvent): boolean => {
  const normalizedKey = event.key.toLowerCase();
  const isKeyB = event.code === "KeyB" || normalizedKey === "b";
  const hasCtrlOrCmd = event.ctrlKey || event.metaKey;
  return isKeyB && hasCtrlOrCmd && !event.altKey;
};

const isTwitterOptionShiftXShortcut = (event: KeyboardEvent): boolean => {
  const normalizedKey = event.key.toLowerCase();
  const isKeyX = event.code === "KeyX" || normalizedKey === "x";
  return isKeyX && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
};

export const isTwitterToggleShortcut = (event: KeyboardEvent): boolean =>
  isTwitterControlBShortcut(event) || isTwitterOptionShiftXShortcut(event);
