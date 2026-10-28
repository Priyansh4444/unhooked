/**
 * Sites outside Unhooked's list where the user has used the wand. The popup asks for access to
 * one site at a time; for every site granted, the background registers the removals script so
 * the removals apply from the start of every later visit. Supported sites already get it from
 * the manifest.
 */
import { ext } from "../../shared/ext-api.ts";
import { LOOKUP_HOSTS, SITE_HOSTS } from "../hosts.ts";

const SCRIPT_ID = "unhooked-wand-pages";
const BUILT_IN = new Set<string>([...Object.values(SITE_HOSTS).flat(), ...LOOKUP_HOSTS]);

/** `*://news.ycombinator.com/*` → `news.ycombinator.com`, for origins the user granted. */
export function grantedPages(origins: readonly string[]): string[] {
  return origins.filter((origin) => {
    const host = /^\*:\/\/([^/*]+)\/\*$/.exec(origin)?.[1];
    return !!host && !BUILT_IN.has(host);
  });
}

export async function syncWandPages(): Promise<void> {
  const scripting = ext.scripting;
  if (!scripting?.registerContentScripts) return; // Safari (MV2): removals apply after the wand
  const { origins = [] } = await ext.permissions.getAll();
  const matches = grantedPages(origins);
  const existing = await scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (!matches.length) {
    if (existing.length) await scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const script = {
    id: SCRIPT_ID,
    matches,
    js: ["sites/custom/content.js"],
    runAt: "document_start" as const,
    persistAcrossSessions: true,
  };
  if (existing.length) await scripting.updateContentScripts([script]);
  else await scripting.registerContentScripts([script]);
}

export function initWandPages(): void {
  const sync = () => void syncWandPages().catch(() => {});
  ext.permissions?.onAdded?.addListener(sync);
  ext.permissions?.onRemoved?.addListener(sync);
  ext.runtime.onStartup.addListener(sync);
  ext.runtime.onInstalled.addListener(sync);
}
