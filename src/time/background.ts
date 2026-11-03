/**
 * Counts time on the site in front. Every event ends in `step`: credit what has passed to the site
 * being counted, then look at what's in front now. Steps run one at a time, and the state lives in
 * IndexedDB, so the browser stopping the background between events loses nothing.
 */
import { ext } from "../shared/ext-api.ts";
import { STORAGE_KEYS } from "../shared/settings.ts";
import { addSlices, getWatch, pruneOld, setWatch } from "./store.ts";
import { TIME_FLUSH } from "./protocol.ts";
import { hostToCount, slicesOf, type FrontTab } from "./tracker.ts";

const HEARTBEAT = "unhooked-time";
const IDLE_SECONDS = 60;

let queue: Promise<unknown> = Promise.resolve();
const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
  const turn = queue.then(work, work);
  queue = turn.catch(() => {});
  return turn;
};

async function frontTab(): Promise<FrontTab | null> {
  const window = await ext.windows.getLastFocused({ populate: true }).catch(() => null);
  const tab = window?.tabs?.find((candidate) => candidate.active);
  if (!window || !tab) return null;
  return {
    url: tab.url,
    focused: Boolean(window.focused),
    incognito: Boolean(tab.incognito),
    audible: Boolean(tab.audible),
    idle: ((await ext.idle?.queryState(IDLE_SECONDS).catch(() => "active")) ??
      "active") as FrontTab["idle"],
  };
}

async function settings(): Promise<{ enabled: boolean; ignored: string[] }> {
  const raw = await ext.storage.local.get([STORAGE_KEYS.TIME_TRACKING, STORAGE_KEYS.TIME_IGNORED]);
  const ignored = raw[STORAGE_KEYS.TIME_IGNORED];
  return {
    enabled: raw[STORAGE_KEYS.TIME_TRACKING] !== false,
    ignored: Array.isArray(ignored) ? (ignored as string[]) : [],
  };
}

export const step = (): Promise<void> =>
  inTurn(async () => {
    const now = Date.now();
    const watch = await getWatch();
    if (watch) await addSlices(slicesOf(watch, now));
    const { enabled, ignored } = await settings();
    const host = hostToCount(await frontTab(), enabled, ignored);
    await setWatch(host ? { host, since: now } : null);
  });

export function initTimeTracker(): void {
  const onEvent = () => void step().catch(() => {});
  ext.tabs.onActivated.addListener(onEvent);
  ext.tabs.onRemoved.addListener(onEvent);
  ext.tabs.onUpdated.addListener((_id, change) => {
    if (change.url !== undefined || change.audible !== undefined) onEvent();
  });
  ext.windows.onFocusChanged.addListener(onEvent);
  ext.idle?.setDetectionInterval(IDLE_SECONDS);
  ext.idle?.onStateChanged.addListener(onEvent);
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEYS.TIME_TRACKING] || changes[STORAGE_KEYS.TIME_IGNORED]) onEvent();
  });
  ext.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT) onEvent();
  });
  const start = () => {
    void ext.alarms?.create(HEARTBEAT, { periodInMinutes: 1 });
    void pruneOld(Date.now()).catch(() => {});
    onEvent();
  };
  ext.runtime.onStartup.addListener(start);
  ext.runtime.onInstalled.addListener(start);
  // A page showing the numbers asks for the latest before it reads them.
  ext.runtime.onMessage.addListener((message: { action?: string }, _sender, sendResponse) => {
    if (message?.action !== TIME_FLUSH) return false;
    step().then(
      () => sendResponse(true),
      () => sendResponse(false),
    );
    return true;
  });
  onEvent();
}
