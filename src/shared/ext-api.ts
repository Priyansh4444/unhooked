/**
 * The WebExtension API object for the current browser.
 *
 * `browser` (Firefox, Safari) is promise-based; Chrome only has `chrome`, which is promise-based
 * under MV3. Always go through `ext` rather than the globals, so no polyfill is needed.
 */
export const ext: typeof chrome = ((globalThis as unknown as { browser?: typeof chrome }).browser ??
  (globalThis as unknown as { chrome?: typeof chrome }).chrome)!;

/** `action` (MV3) or `browserAction` (Safari MV2). */
export const getActionApi = (): typeof chrome.action =>
  ext.action ?? (ext as unknown as { browserAction: typeof chrome.action }).browserAction;
