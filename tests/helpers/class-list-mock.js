/**
 * Minimal DOMTokenList mock for unhookedApplyOptionClasses tests.
 */
export function createElementWithClassMock() {
  const classes = new Set();

  const classList = {
    add(c) {
      classes.add(c);
    },
    remove(c) {
      classes.delete(c);
    },
    toggle(c, force) {
      if (force === true) {
        classes.add(c);
        return true;
      }
      if (force === false) {
        classes.delete(c);
        return false;
      }
      if (classes.has(c)) {
        classes.delete(c);
        return false;
      }
      classes.add(c);
      return true;
    },
    /** @returns {string[]} */
    snapshot() {
      return [...classes].sort();
    }
  };

  return { classList, _classes: classes };
}
