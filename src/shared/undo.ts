/** Taking back a storage write: remember what its keys held, and put exactly that back. */
import { ext } from "./ext-api.ts";
import type { RawStorage } from "./preferences.ts";

export const snapshot = (raw: RawStorage, patch: RawStorage): RawStorage =>
  Object.fromEntries(Object.keys(patch).map((key) => [key, raw[key]]));

export async function restore(before: RawStorage): Promise<void> {
  const entries = Object.entries(before);
  await ext.storage.local.remove(entries.filter(([, v]) => v === undefined).map(([k]) => k));
  await ext.storage.local.set(Object.fromEntries(entries.filter(([, v]) => v !== undefined)));
}
