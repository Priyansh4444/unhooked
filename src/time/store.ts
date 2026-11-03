/**
 * Time on sites, in IndexedDB rather than storage.local: every content script reads and listens to
 * storage.local, and a year of browsing shouldn't reach every page, or wake every tab each minute.
 * One record per day, so a write touches a few hundred bytes.
 */
import { EMPTY_STATE, dateKey, type Session, type Slice, type TrackerState } from "./tracker.ts";

/** Seconds per site, per hour of the day. */
export interface DayRecord {
  date: string;
  hosts: Record<string, Record<number, number>>;
  /** Visits that started this day. Only since sessions were added; older days have none. */
  sessions?: Session[];
}

const KEEP_DAYS = 400;
const DAYS = "days";
const STATE = "state";
const TRACKER = "tracker";

let opened: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("unhooked-time", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DAYS, { keyPath: "date" });
      request.result.createObjectStore(STATE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opened;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

const read = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export async function commit(slices: Slice[], sessions: Session[]): Promise<void> {
  if (!slices.length && !sessions.length) return;
  const tx = (await open()).transaction(DAYS, "readwrite");
  const days = tx.objectStore(DAYS);
  const dates = new Set([
    ...slices.map((slice) => slice.date),
    ...sessions.map((session) => dateKey(session.start)),
  ]);
  for (const date of dates) {
    const record: DayRecord = (await read(days.get(date))) ?? { date, hosts: {} };
    for (const { host, hour, seconds } of slices.filter((slice) => slice.date === date)) {
      const hours = (record.hosts[host] ??= {});
      hours[hour] = Math.max(0, (hours[hour] ?? 0) + seconds);
    }
    const started = sessions.filter((session) => dateKey(session.start) === date);
    if (started.length) record.sessions = [...(record.sessions ?? []), ...started];
    days.put(record);
  }
  await done(tx);
}

export async function allDays(): Promise<DayRecord[]> {
  const db = await open();
  return read(db.transaction(DAYS).objectStore(DAYS).getAll() as IDBRequest<DayRecord[]>);
}

export async function putDays(records: DayRecord[]): Promise<void> {
  const tx = (await open()).transaction(DAYS, "readwrite");
  for (const record of records) tx.objectStore(DAYS).put(record);
  await done(tx);
}

export async function eraseAll(): Promise<void> {
  const tx = (await open()).transaction([DAYS, STATE], "readwrite");
  tx.objectStore(DAYS).clear();
  tx.objectStore(STATE).put(EMPTY_STATE, TRACKER);
  await done(tx);
}

/** Removes one site's history. What was removed comes back, so it can be put back. */
export async function forgetHost(host: string): Promise<DayRecord[]> {
  const records = await allDays();
  const touched = records.filter(
    (record) => record.hosts[host] || record.sessions?.some((session) => session.host === host),
  );
  const removed = touched.map((record) => ({
    date: record.date,
    hosts: record.hosts[host] ? { [host]: record.hosts[host]! } : {},
    sessions: record.sessions?.filter((session) => session.host === host) ?? [],
  }));
  await putDays(
    touched.map((record) => {
      const { [host]: _gone, ...hosts } = record.hosts;
      return {
        date: record.date,
        hosts,
        sessions: record.sessions?.filter((session) => session.host !== host) ?? [],
      };
    }),
  );
  return removed;
}

export async function restoreHost(removed: DayRecord[]): Promise<void> {
  const records = new Map((await allDays()).map((record) => [record.date, record]));
  await putDays(
    removed.map((part) => {
      const record = records.get(part.date);
      return {
        date: part.date,
        hosts: { ...record?.hosts, ...part.hosts },
        sessions: [...(record?.sessions ?? []), ...(part.sessions ?? [])],
      };
    }),
  );
}

export async function pruneOld(now: number): Promise<void> {
  const oldest = dateKey(now - KEEP_DAYS * 86_400_000);
  const tx = (await open()).transaction(DAYS, "readwrite");
  tx.objectStore(DAYS).delete(IDBKeyRange.upperBound(oldest, true));
  await done(tx);
}

/** What's being counted. Kept here, because the background can be stopped at any moment. */
export async function getTracker(): Promise<TrackerState> {
  const db = await open();
  const state = await read(db.transaction(STATE).objectStore(STATE).get(TRACKER));
  return (state as TrackerState | undefined) ?? EMPTY_STATE;
}

export async function setTracker(state: TrackerState): Promise<void> {
  const tx = (await open()).transaction(STATE, "readwrite");
  tx.objectStore(STATE).put(state, TRACKER);
  await done(tx);
}
