import type { ToggleState } from "../shared/settings.ts";
import { ext } from "../shared/ext-api.ts";
import { FOCUS_SITES, type FocusSite, type PersistenceMode } from "./sites.ts";

/**
 * Where "is focus mode on?" lives:
 *  - "global" mode: one `{ enabled }` value in storage.local, shared by every tab and restart.
 *  - "tab" mode: per tab, also in storage.local so it survives the background being suspended
 *    (MV3 service workers and Safari/Firefox event pages are killed when idle). Tab ids are
 *    meaningless after a browser restart, so `resetTabStates` wipes them on startup.
 *    (storage.session would be tidier but its promise API isn't dependable across browsers.)
 */

const TAB_STATE_KEY = "focus_tab_state";

type TabStates = Record<string, Partial<Record<FocusSite, boolean>>>;

const readTabStates = async (): Promise<TabStates> => {
  const result = await ext.storage.local.get(TAB_STATE_KEY);
  return (result[TAB_STATE_KEY] as TabStates | undefined) ?? {};
};

const writeTabStates = (states: TabStates): Promise<void> =>
  ext.storage.local.set({ [TAB_STATE_KEY]: states });

// Read-modify-write on tab states must not interleave.
let writeQueue: Promise<unknown> = Promise.resolve();
const serialized = <T>(job: () => Promise<T>): Promise<T> => {
  const run = writeQueue.then(job, job);
  writeQueue = run.catch(() => {});
  return run;
};

export const getPersistenceMode = async (site: FocusSite): Promise<PersistenceMode> => {
  const { persistenceKey, defaultMode } = FOCUS_SITES[site];
  const result = await ext.storage.local.get(persistenceKey);
  return result[persistenceKey] === "global" || result[persistenceKey] === "tab"
    ? (result[persistenceKey] as PersistenceMode)
    : defaultMode;
};

export const isFocusEnabled = async (site: FocusSite, tabId: number): Promise<boolean> => {
  if ((await getPersistenceMode(site)) === "global") {
    const { stateKey } = FOCUS_SITES[site];
    const result = await ext.storage.local.get(stateKey);
    return Boolean((result[stateKey] as ToggleState | undefined)?.enabled);
  }
  return Boolean((await readTabStates())[tabId]?.[site]);
};

export const setFocusEnabled = async (
  site: FocusSite,
  tabId: number,
  enabled: boolean,
): Promise<void> => {
  if ((await getPersistenceMode(site)) === "global") {
    await ext.storage.local.set({ [FOCUS_SITES[site].stateKey]: { enabled } });
    return;
  }
  await serialized(async () => {
    const states = await readTabStates();
    states[tabId] = { ...states[tabId], [site]: enabled };
    await writeTabStates(states);
  });
};

export const forgetTab = (tabId: number): Promise<void> =>
  serialized(async () => {
    const states = await readTabStates();
    if (!(String(tabId) in states)) return;
    delete states[tabId];
    await writeTabStates(states);
  });

export const resetTabStates = (): Promise<void> => ext.storage.local.remove(TAB_STATE_KEY);
