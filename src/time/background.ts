/**
 * Counts time on the site in front. Every event ends in `step`: credit what has passed to the site
 * being counted, then look at what's in front now. Steps run one at a time, and the state lives in
 * IndexedDB, so the browser stopping the background between events loses nothing.
 */
import { ext } from "../shared/ext-api.ts";
import { STORAGE_KEYS } from "../shared/settings.ts";
import { commit, getIcons, getTracker, pruneOld, setIcon, setTracker } from "./store.ts";
import { TIME_FLUSH } from "./protocol.ts";
import { IDLE_SECONDS, advance, hostToCount, type FrontTab } from "./tracker.ts";

const HEARTBEAT = "unhooked-time";

let queue: Promise<unknown> = Promise.resolve();
export const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
  const turn = queue.then(work, work);
  queue = turn.catch(() => {});
  return turn;
};

const ICON_REFRESH_MS = 7 * 86_400_000;
const ICON_MOST_BYTES = 24_000;
/** Sites whose icon has been looked at since the background last started. */
const iconChecked = new Set<string>();

/** The tab's icon as data: Chromium's cache for its own, or what the browser reports otherwise. */
async function iconOf(tabUrl: string, favIconUrl: string): Promise<string | null> {
  if (favIconUrl.startsWith("data:")) return favIconUrl;
  if (!ext.runtime.getManifest().permissions?.includes("favicon")) return favIconUrl;
  const url = new URL(ext.runtime.getURL("_favicon/"));
  url.searchParams.set("pageUrl", tabUrl);
  url.searchParams.set("size", "32");
  const response = await fetch(url);
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > ICON_MOST_BYTES) return null;
  const type = response.headers.get("content-type") ?? "image/png";
  return `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`;
}

async function rememberIcon(host: string, tab: FrontTab, now: number): Promise<void> {
  if (iconChecked.has(host) || !tab.url || !tab.favIconUrl) return;
  iconChecked.add(host);
  const known = (await getIcons())[host];
  if (known && now - known.at < ICON_REFRESH_MS) return;
  const src = await iconOf(tab.url, tab.favIconUrl);
  if (src) await setIcon(host, src, now);
}

export async function frontTab(): Promise<FrontTab | null> {
  const window = await ext.windows.getLastFocused({ populate: true }).catch(() => null);
  const tab = window?.tabs?.find((candidate) => candidate.active);
  if (!window || !tab) return null;
  return {
    url: tab.url,
    favIconUrl: tab.favIconUrl,
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

/** Only while there's something to count. Otherwise the background sleeps until an event wakes it. */
async function setHeartbeat(on: boolean): Promise<void> {
  if (!ext.alarms) return;
  const running = await ext.alarms.get(HEARTBEAT);
  if (on && !running) await ext.alarms.create(HEARTBEAT, { periodInMinutes: 1 });
  if (!on && running) await ext.alarms.clear(HEARTBEAT);
}

export const step = (readFront: () => Promise<FrontTab | null> = frontTab): Promise<void> =>
  inTurn(async () => {
    const now = Date.now();
    const { enabled, ignored } = await settings();
    const tab = await readFront();
    const host = hostToCount(tab, enabled, ignored);
    const state = await getTracker();
    // A site just left out has its visit dropped rather than saved on its way out.
    const open = Object.fromEntries(
      Object.entries(state.open).filter(([name]) => !ignored.includes(name)),
    );
    const next = advance({ ...state, open }, now, host, tab?.idle === "idle" && !tab.audible);
    await commit(next.slices, next.closed);
    await setTracker(next.state);
    await setHeartbeat(Boolean(next.state.watch) || Object.keys(next.state.open).length > 0);
    // Not waited for: a missing icon never holds up or fails the counting.
    if (host && tab) void rememberIcon(host, tab, now).catch(() => {});
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
