import { ext } from "../shared/ext-api.ts";
import { FOCUS_ACTION, type FocusPush, type FocusReply, type FocusRequest } from "./protocol.ts";
import { FOCUS_SITES, type FocusSite } from "./sites.ts";
import { isEditableTarget } from "../shared/keys.ts";
import { isPaused } from "../shared/preferences.ts";
import { STORAGE_KEYS } from "../shared/settings.ts";

/** Why `apply` is running. `state` only fires when `enabled` actually changed. */
type ApplyReason = "state" | "navigate" | "settings";

/**
 * Everything site-specific about a focus mode. The runtime decides *when* focus mode should be
 * on; the adapter only knows how to make the page match.
 */
export interface FocusAdapter {
  site: FocusSite;
  /** Make the page reflect `enabled`. Must be idempotent: it also runs after every navigation. */
  apply(enabled: boolean, reason: ApplyReason): void | Promise<void>;
  isShortcut(event: KeyboardEvent): boolean;
  /** Document events after which the page may need re-applying (e.g. YouTube's `yt-navigate-finish`). */
  navigationEvents?: readonly string[];
  /** For SPAs without such an event: re-apply when `location.href` changes. */
  watchUrlChanges?: boolean;
  /** Storage keys that affect how focus mode looks; changes re-apply while enabled. */
  settingKeys?: readonly string[];
}

export interface FocusController {
  isEnabled(): boolean;
  toggle(): Promise<void>;
}

// Shared across injections into the same isolated world, so the background re-injecting a content
// script that the manifest already injected cannot stack a second set of listeners.
const instances = ((
  globalThis as { __unhookedFocus?: Map<FocusSite, FocusController> }
).__unhookedFocus ??= new Map());

const isExtensionAlive = (): boolean => {
  try {
    return Boolean(ext.runtime?.id);
  } catch {
    return false;
  }
};

export const startFocusSite = (adapter: FocusAdapter): FocusController => {
  const existing = instances.get(adapter.site);
  if (existing) return existing;

  const config = FOCUS_SITES[adapter.site];
  let enabled = false;
  // The global pause hides focus mode without forgetting it.
  let paused = false;
  let lastApplied: boolean | null = null;
  let queue: Promise<void> = Promise.resolve();

  // Serialised so async applies (e.g. waiting for the YouTube player) never overtake each other.
  const sync = (reason: ApplyReason): void => {
    const target = enabled && !paused;
    if (reason === "state" && lastApplied === target) return;
    lastApplied = target;
    queue = queue
      .then(() => adapter.apply(target, reason))
      .catch((error) => console.error(`[unhooked] ${adapter.site} apply failed`, error));
  };

  const request = async (action: FocusRequest["action"]): Promise<FocusReply | undefined> => {
    if (!isExtensionAlive()) return undefined;
    try {
      const message: FocusRequest = { action, site: adapter.site };
      return (await ext.runtime.sendMessage(message)) as FocusReply | undefined;
    } catch {
      return undefined; // background unreachable; keep whatever we had
    }
  };

  const pull = async (): Promise<void> => {
    const [reply, stored] = await Promise.all([
      request(FOCUS_ACTION.GET),
      ext.storage.local
        .get([STORAGE_KEYS.PAUSED, STORAGE_KEYS.LEGACY_YOUTUBE_OPTIONS])
        .catch(() => undefined),
    ]);
    if (reply) enabled = Boolean(reply.enabled);
    if (stored) paused = isPaused(stored);
    sync("state");
  };

  const toggle = async (): Promise<void> => {
    const reply = await request(FOCUS_ACTION.TOGGLE);
    // WHY: shortcut reliability beats strict persistence; if the background is gone, flip locally.
    enabled = reply ? Boolean(reply.enabled) : !enabled;
    sync("state");
  };

  const controller: FocusController = { isEnabled: () => enabled, toggle };
  instances.set(adapter.site, controller);

  ext.runtime.onMessage.addListener((message: Partial<FocusPush>, _sender, sendResponse) => {
    if (message?.action !== FOCUS_ACTION.SET || message.site !== adapter.site) return false;
    enabled = Boolean(message.enabled);
    sync("state");
    sendResponse({ ok: true });
    return false;
  });

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !isExtensionAlive()) return;
    // Global state, the persistence mode or the pause changed: this tab may need to differ now.
    if (
      changes[config.stateKey] ||
      changes[config.persistenceKey] ||
      changes[STORAGE_KEYS.PAUSED] ||
      changes[STORAGE_KEYS.LEGACY_YOUTUBE_OPTIONS]
    ) {
      void pull();
    } else if (enabled && adapter.settingKeys?.some((key) => changes[key])) {
      sync("settings");
    }
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (isEditableTarget(event.target) || !adapter.isShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void toggle();
    },
    true,
  );

  for (const name of adapter.navigationEvents ?? []) {
    document.addEventListener(name, () => sync("navigate"));
  }

  if (adapter.watchUrlChanges) {
    let lastUrl = location.href;
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        sync("navigate");
      });
    }).observe(document.documentElement, { subtree: true, childList: true });
  }

  void pull();
  return controller;
};
