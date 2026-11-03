export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  const isTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
  const isSelect = target.tagName === "SELECT";
  return target.isContentEditable || isTextInput || isSelect;
};
