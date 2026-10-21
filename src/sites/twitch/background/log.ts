import { ext } from "../../../shared/ext-api.ts";
import { STORAGE_KEYS } from "../../../shared/settings.ts";
import type { ChatUrlEntry } from "../protocol.ts";

/** A short "what was just linked" list, not an archive. */
const LOG_MAX = 25;
const FLUSH_DELAY_MS = 800;

let entries: ChatUrlEntry[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const load = async (): Promise<ChatUrlEntry[]> => {
  if (entries) return entries;
  const stored = (await ext.storage.local.get(STORAGE_KEYS.TWITCH_URL_LOG))[
    STORAGE_KEYS.TWITCH_URL_LOG
  ];
  entries = Array.isArray(stored) ? stored.slice(-LOG_MAX) : [];
  return entries;
};

const save = async (): Promise<void> => {
  flushTimer = null;
  await ext.storage.local.set({ [STORAGE_KEYS.TWITCH_URL_LOG]: await load() });
};

export async function logUrl(entry: ChatUrlEntry): Promise<void> {
  if (!entry?.url) return;
  // A link posted again moves to the top instead of filling the log with copies.
  entries = [...(await load()).filter((e) => e.url !== entry.url), entry].slice(-LOG_MAX);
  flushTimer ??= setTimeout(() => void save(), FLUSH_DELAY_MS);
}

/** Newest first. */
export async function readLog(): Promise<ChatUrlEntry[]> {
  const log = await load();
  if (flushTimer) {
    clearTimeout(flushTimer);
    await save();
  }
  return [...log].reverse();
}

export async function clearLog(): Promise<void> {
  entries = [];
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  await save();
}
