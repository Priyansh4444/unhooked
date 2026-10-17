/**
 * The popup: a rail of every site with its live state, and the selected site's settings.
 * It opens on the site of the current tab. Storage is the source of truth; every control
 * writes one key (or one preset's keys) and re-renders from storage events.
 */
import { FOCUS_ACTION, type FocusReply, type FocusRequest } from "../../focus/protocol.ts";
import { FOCUS_SITES, type FocusSite, type PersistenceMode } from "../../focus/sites.ts";
import { ext } from "../../shared/ext-api.ts";
import {
  PRESETS,
  featurePatch,
  isPaused,
  matchingPreset,
  mergeChanges,
  presetPatch,
  resolveSettings,
  type Preset,
  type RawStorage,
  type SiteSettings,
} from "../../shared/preferences.ts";
import { DEFAULTS, STORAGE_KEYS, type TwitterFocusControls } from "../../shared/settings.ts";
import { SITE_HOSTS, siteForUrl, type SiteId } from "../../sites/hosts.ts";
import { CONTROL_SITES, controlSiteById, type ControlSite } from "../../sites/registry.ts";
import { TWITCH_ACTIONS, type ChatUrlEntry } from "../../sites/twitch/protocol.ts";

const THEMES = ["system", "dark", "light"] as const;
const YOUTUBE_GROUPS: Record<string, string[]> = {
  bulkVideoSidebar: ["hideRelatedSidebar", "hideLiveChat", "hidePlaylistSidebar", "hideFundraiser"],
  bulkVideoInfo: ["hideVideoActionsBar", "hideChannelRow", "hideDescription"],
  bulkTopHeader: ["hideNotificationBell"],
};
const RAIL: { id: SiteId; label: string }[] = [
  ...CONTROL_SITES.map(({ id, label }) => ({ id, label })),
  { id: "twitch", label: "Twitch" },
  { id: "excalidraw", label: "Excalidraw" },
];
const FOCUS_COPY: Record<FocusSite, { page: string; command?: string; does: string }> = {
  youtube: {
    page: "`",
    command: "toggle-youtube-style",
    does: "Theater player, no recommendations or header.",
  },
  x: {
    page: "Ctrl/⌘ B",
    command: "toggle-twitter-style",
    does: "One centered timeline without the sidebar, header and drawers.",
  },
  excalidraw: { page: "Ctrl/⌘ B", does: "Just the canvas, without the toolbars." },
};
const X_CONTROLS: [keyof TwitterFocusControls, string, string][] = [
  ["hideSidebarColumn", "Hide right sidebar", "Trends and suggestions."],
  ["hideChatDrawer", "Hide chat drawer", "The direct-message drawer."],
  ["hideGrokDrawer", "Hide Grok drawer", "The Grok side panel."],
  ["centerTimeline", "Center timeline", "Also hides the top header."],
];

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

let raw: RawStorage = {};
let pending: RawStorage = {};
let loaded = false;
let selected: SiteId = "youtube";
let activeTab: { id: number; site: SiteId | undefined } | null = null;
/** Whether focus mode is on in the current tab (for its site, whichever site is selected). */
let focusOn = false;
let shortcuts: Record<string, string> = {};

const isFocusSite = (id: SiteId): id is FocusSite => id in FOCUS_SITES;
const shortHost = (id: SiteId) => SITE_HOSTS[id][0].replace(/^www\./, "");
const countOn = (state: SiteSettings) => Object.values(state.features).filter(Boolean).length;

function status(message: string, error = false): void {
  const el = $("saveStatus");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.setAttribute("role", error ? "alert" : "status");
}

async function write(patch: RawStorage, message = "Saved"): Promise<void> {
  if (!loaded) return;
  status("Saving…");
  try {
    await ext.storage.local.set(patch);
    Object.assign(raw, patch);
    render();
    status(message);
  } catch (error) {
    status(`Could not save. ${(error as Error).message}`, true);
    render();
  }
}

// ---- focus mode (owned by the background, per tab or global) -----------------------------------

async function focusRequest(action: FocusRequest["action"], site: FocusSite): Promise<boolean> {
  if (!activeTab || activeTab.site !== site) return false;
  const request: FocusRequest = { action, site, tabId: activeTab.id };
  const reply = (await ext.runtime.sendMessage(request).catch(() => undefined)) as
    | FocusReply
    | undefined;
  return Boolean(reply?.enabled);
}

/** Re-reads focus in the current tab and, for Twitch, flushes the pending link log. */
async function refreshSelected(): Promise<void> {
  if (selected === "twitch") {
    await ext.runtime.sendMessage({ action: TWITCH_ACTIONS.GET_URL_LOG }).catch(() => {});
  }
  const site = activeTab?.site;
  focusOn = site && isFocusSite(site) ? await focusRequest(FOCUS_ACTION.GET, site) : false;
  render();
}

const memoryMode = (site: FocusSite): PersistenceMode => {
  const { persistenceKey, defaultMode } = FOCUS_SITES[site];
  const value = raw[persistenceKey];
  return value === "global" || value === "tab" ? value : defaultMode;
};

function shortcutLine(site: FocusSite): string {
  const { page, command } = FOCUS_COPY[site];
  const browserKey = command ? shortcuts[command] : "";
  return browserKey
    ? `Press ${page} on the page, or ${browserKey} from anywhere in the browser.`
    : `Press ${page} on the page.`;
}

// ---- rendering ----------------------------------------------------------------------------------

function renderRail(paused: boolean): void {
  for (const { id } of RAIL) {
    const input = $<HTMLInputElement>(`site-${id}`);
    const item = input.closest<HTMLElement>(".site")!;
    const control = controlSiteById(id);
    let meta = "";
    let state: "on" | "off" | "idle" = "idle";
    let spoken = "";
    if (control) {
      const settings = resolveSettings(raw, control);
      const on = countOn(settings);
      meta = settings.enabled ? String(on) : "off";
      state = !settings.enabled ? "off" : on ? "on" : "idle";
      spoken = settings.enabled ? `${on} of ${control.features.length} on` : "off";
    } else if (id === "twitch") {
      const pills = raw[STORAGE_KEYS.TWITCH_LINK_PILLS] !== false;
      meta = pills ? "on" : "off";
      state = pills ? "on" : "off";
      spoken = `link pills ${meta}`;
    } else if (id === "excalidraw" && activeTab?.site === "excalidraw" && focusOn) {
      meta = "on";
      state = "on";
      spoken = "focus on";
    }
    input.checked = id === selected;
    $(`meta-${id}`).textContent = meta;
    item.dataset.state = state;
    input.setAttribute(
      "aria-label",
      [RAIL.find((s) => s.id === id)!.label, spoken].filter(Boolean).join(", "),
    );
  }
  document.body.classList.toggle("is-paused", paused);
}

function renderHeader(control: ControlSite | undefined, paused: boolean): void {
  const label = RAIL.find((s) => s.id === selected)!.label;
  $("siteName").textContent = label;
  const enabled = $<HTMLInputElement>("siteEnabled");
  enabled.hidden = selected === "excalidraw";
  if (control) {
    const state = resolveSettings(raw, control);
    enabled.checked = state.enabled;
    enabled.setAttribute("aria-label", `Hide controls on ${label}`);
    $("siteState").textContent = `${state.enabled ? "Active on" : "Off on"} ${shortHost(selected)}`;
    const match = matchingPreset(selected, state);
    for (const preset of PRESETS) {
      $(`preset-${preset}`).setAttribute("aria-pressed", String(preset === match));
    }
  } else if (selected === "twitch") {
    const pills = raw[STORAGE_KEYS.TWITCH_LINK_PILLS] !== false;
    enabled.checked = pills;
    enabled.setAttribute("aria-label", "Link pills in Twitch chat");
    $("siteState").textContent = pills ? "Chat links become pills" : "Chat links stay plain";
  } else {
    $("siteState").textContent = "Focus mode for the canvas";
  }
  $("presets").hidden = !control;
  $("resetAll").hidden = !control;
  $("pausedNote").hidden = !paused;
  $("btnPower").setAttribute("aria-pressed", String(paused));
  $("powerLabel").textContent = paused ? "Resume" : "Pause all";
}

function renderFocus(): void {
  const section = $("focusSection");
  section.hidden = !isFocusSite(selected);
  if (!isFocusSite(selected)) return;
  const site = selected;
  const here = activeTab?.site === site;
  const toggle = $<HTMLInputElement>("focusToggle");
  toggle.disabled = !here;
  toggle.checked = here && focusOn;
  $("focusHint").textContent = here
    ? FOCUS_COPY[site].does
    : `Open ${RAIL.find((s) => s.id === site)!.label} in this tab to use it.`;
  const mode = memoryMode(site);
  for (const button of section.querySelectorAll<HTMLButtonElement>("[data-memory]")) {
    button.setAttribute("aria-pressed", String(button.dataset.memory === mode));
  }
  $("memoryHint").textContent =
    mode === "global" ? "On in every tab until you turn it off." : "Each tab starts without it.";
  $("shortcutLine").textContent = shortcutLine(site);

  $("xFocusSettings").hidden = site !== "x";
  if (site !== "x") return;
  const width = Number(raw[STORAGE_KEYS.TWITTER_WIDTH] ?? DEFAULTS.TWITTER_WIDTH);
  $<HTMLInputElement>("xWidth").value = String(width);
  $("xWidthValue").textContent = `${width}%`;
  const custom = raw[STORAGE_KEYS.TWITTER_USE_DEFAULT_FONT] === false;
  $<HTMLInputElement>("xCustomFont").checked = custom;
  $("xFontRow").hidden = !custom;
  const font = Number(raw[STORAGE_KEYS.TWITTER_FONT_SIZE] ?? DEFAULTS.TWITTER_FONT_SIZE);
  $<HTMLInputElement>("xFont").value = String(font);
  $("xFontValue").textContent = `${font}px`;
  const controls = xControls();
  for (const [key] of X_CONTROLS) $<HTMLInputElement>(`x-${key}`).checked = controls[key];
}

function renderControls(control: ControlSite | undefined): void {
  $("controlsSection").hidden = !control;
  if (!control) return;
  const state = resolveSettings(raw, control);
  $("controlsHeading").textContent = isFocusSite(selected) ? "Hide" : "Hide on this site";
  $("youtubeControls").hidden = selected !== "youtube";
  $("socialControls").hidden = selected === "youtube";
  if (selected === "youtube") {
    for (const feature of control.features) {
      $<HTMLInputElement>(feature.id).checked = Boolean(state.features[feature.id]);
    }
    for (const [id, keys] of Object.entries(YOUTUBE_GROUPS)) {
      const values = keys.map((key) => Boolean(state.features[key]));
      const box = $<HTMLInputElement>(id);
      box.checked = values.every(Boolean);
      box.indeterminate = values.some(Boolean) && !values.every(Boolean);
    }
    return;
  }
  const container = $("socialControls");
  if (container.dataset.site !== selected) {
    container.replaceChildren(
      ...control.features.map((feature) =>
        switchRow(`social-${feature.id}`, feature.label, feature.description, {
          feature: feature.id,
        }),
      ),
    );
    container.dataset.site = selected;
  }
  for (const feature of control.features) {
    $<HTMLInputElement>(`social-${feature.id}`).checked = Boolean(state.features[feature.id]);
  }
}

function renderTwitch(): void {
  $("twitchSection").hidden = selected !== "twitch";
  if (selected !== "twitch") return;
  $<HTMLInputElement>("twitchLog").checked = raw[STORAGE_KEYS.TWITCH_URL_LOG_ENABLED] !== false;
  const delay = Number(raw[STORAGE_KEYS.TWITCH_HOVER_DELAY_MS] ?? DEFAULTS.TWITCH_HOVER_DELAY_MS);
  $<HTMLInputElement>("twitchDelay").value = String(delay);
  $("twitchDelayValue").textContent = `${delay}ms`;
  const log = raw[STORAGE_KEYS.TWITCH_URL_LOG];
  renderLog(Array.isArray(log) ? ([...log].reverse() as ChatUrlEntry[]) : []);
}

function renderLog(entries: ChatUrlEntry[]): void {
  const list = $("twitchLogList");
  $("twitchLogClear").hidden = entries.length === 0;
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "log-empty";
    empty.textContent = "Links posted in Twitch chat show up here.";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = entry.label || entry.url;
      const meta = document.createElement("small");
      meta.textContent = [entry.hostname, entry.channel && `in ${entry.channel}`]
        .filter(Boolean)
        .join(" ");
      item.append(link, meta);
      return item;
    }),
  );
}

function render(): void {
  if (!loaded) return;
  const paused = isPaused(raw);
  const control = controlSiteById(selected);
  renderRail(paused);
  renderHeader(control, paused);
  renderFocus();
  renderControls(control);
  renderTwitch();
  const theme = THEMES.find((t) => t === raw[STORAGE_KEYS.POPUP_THEME]) ?? "system";
  if (theme === "system") delete document.documentElement.dataset.popupTheme;
  else document.documentElement.dataset.popupTheme = theme;
  $("btnTheme").title = `Theme: ${theme}`;
  $("btnTheme").setAttribute("aria-label", `Theme: ${theme}. Change theme`);
}

// ---- building --------------------------------------------------------------------------------

function switchRow(id: string, label: string, hint: string, data: Record<string, string> = {}) {
  const row = document.createElement("label");
  row.className = "row";
  const copy = document.createElement("span");
  copy.className = "feature-copy";
  const title = document.createElement("strong");
  title.textContent = label;
  const small = document.createElement("small");
  small.textContent = hint;
  copy.append(title, small);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "uh-switch";
  input.id = id;
  Object.assign(input.dataset, data);
  row.append(copy, input);
  return row;
}

function xControls(): TwitterFocusControls {
  const stored = raw[STORAGE_KEYS.TWITTER_FOCUS_CONTROLS];
  return {
    ...DEFAULTS.TWITTER_FOCUS_CONTROLS,
    ...(stored && typeof stored === "object" ? (stored as Partial<TwitterFocusControls>) : {}),
  };
}

function buildRail(): void {
  for (const { id, label } of RAIL) {
    const item = document.createElement("label");
    item.className = "site";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "site";
    input.value = id;
    input.id = `site-${id}`;
    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = label;
    const meta = document.createElement("span");
    meta.className = "site-meta";
    meta.id = `meta-${id}`;
    meta.setAttribute("aria-hidden", "true");
    item.append(input, name, meta);
    $("sitePicker").append(item);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
    button.id = `preset-${button.dataset.preset}`;
  }
  $("xFocusControls").append(
    ...X_CONTROLS.map(([key, label, hint]) =>
      switchRow(`x-${key}`, label, hint, { xControl: key }),
    ),
  );
  // YouTube's static rows get their descriptions from the registry.
  for (const feature of controlSiteById("youtube")!.features) {
    const input = $<HTMLInputElement>(feature.id);
    const hint = document.createElement("small");
    hint.className = "feature-hint";
    hint.id = `hint-${feature.id}`;
    hint.textContent = feature.description;
    input.closest("label")!.querySelector(".row-label")!.append(hint);
    input.setAttribute("aria-describedby", hint.id);
  }
}

function bind(): void {
  $("sitePicker").addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name !== "site") return;
    selected = target.value as SiteId;
    render();
    void refreshSelected();
  });
  $("siteEnabled").addEventListener("change", (event) => {
    const checked = (event.target as HTMLInputElement).checked;
    if (selected === "twitch") void write({ [STORAGE_KEYS.TWITCH_LINK_PILLS]: checked });
    else void write(featurePatch(selected, "enabled", checked));
  });
  const setPaused = (value: boolean) =>
    write({ [STORAGE_KEYS.PAUSED]: value }, value ? "Paused on every site" : "Resumed");
  $("btnPower").addEventListener("click", () => void setPaused(!isPaused(raw)));
  $("btnResume").addEventListener("click", () => void setPaused(false));
  $("btnTheme").addEventListener("click", () => {
    const current = THEMES.find((t) => t === raw[STORAGE_KEYS.POPUP_THEME]) ?? "system";
    void write({
      [STORAGE_KEYS.POPUP_THEME]: THEMES[(THEMES.indexOf(current) + 1) % THEMES.length],
    });
  });

  for (const feature of controlSiteById("youtube")!.features) {
    $(feature.id).addEventListener("change", (event) => {
      void write(featurePatch("youtube", feature.id, (event.target as HTMLInputElement).checked));
    });
  }
  for (const [id, keys] of Object.entries(YOUTUBE_GROUPS)) {
    $(id).addEventListener("change", (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      void write(Object.assign({}, ...keys.map((key) => featurePatch("youtube", key, checked))));
    });
  }
  $("socialControls").addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.feature)
      void write(featurePatch(selected, target.dataset.feature, target.checked));
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
    button.addEventListener("click", () => {
      const label = RAIL.find((s) => s.id === selected)!.label;
      void write(
        presetPatch(selected, button.dataset.preset as Preset),
        `${button.textContent} applied to ${label}`,
      );
    });
  }
  $("resetAll").addEventListener("click", () => {
    void write(
      { ...presetPatch(selected, "clear"), ...featurePatch(selected, "enabled", true) },
      `${RAIL.find((s) => s.id === selected)!.label} reset`,
    );
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>(".collapse-btn")) {
    button.addEventListener("click", () => {
      const collapsed = button.closest(".group")!.classList.toggle("collapsed");
      button.setAttribute("aria-expanded", String(!collapsed));
      button.setAttribute("aria-label", collapsed ? "Expand section" : "Collapse section");
    });
  }

  // Focus mode
  $("focusToggle").addEventListener("change", async () => {
    if (!isFocusSite(selected)) return;
    focusOn = await focusRequest(FOCUS_ACTION.TOGGLE, selected);
    render();
    status(focusOn ? "Focus on in this tab" : "Focus off in this tab");
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-memory]")) {
    button.addEventListener("click", () => {
      if (!isFocusSite(selected)) return;
      void write({ [FOCUS_SITES[selected].persistenceKey]: button.dataset.memory });
    });
  }
  const slider = (id: string, key: string) =>
    $(id).addEventListener("input", (event) => {
      void write({ [key]: Number((event.target as HTMLInputElement).value) });
    });
  slider("xWidth", STORAGE_KEYS.TWITTER_WIDTH);
  slider("xFont", STORAGE_KEYS.TWITTER_FONT_SIZE);
  slider("twitchDelay", STORAGE_KEYS.TWITCH_HOVER_DELAY_MS);
  $("xCustomFont").addEventListener("change", (event) => {
    void write({
      [STORAGE_KEYS.TWITTER_USE_DEFAULT_FONT]: !(event.target as HTMLInputElement).checked,
    });
  });
  $("xFocusControls").addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    const key = target.dataset.xControl as keyof TwitterFocusControls | undefined;
    if (key)
      void write({
        [STORAGE_KEYS.TWITTER_FOCUS_CONTROLS]: { ...xControls(), [key]: target.checked },
      });
  });

  // Twitch
  $("twitchLog").addEventListener("change", (event) => {
    void write({
      [STORAGE_KEYS.TWITCH_URL_LOG_ENABLED]: (event.target as HTMLInputElement).checked,
    });
  });
  $("twitchLogClear").addEventListener("click", async () => {
    await ext.runtime.sendMessage({ action: TWITCH_ACTIONS.CLEAR_URL_LOG }).catch(() => {});
    status("Link log cleared");
  });
}

async function init(): Promise<void> {
  buildRail();
  const controls = [
    ...document.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button"),
  ];
  for (const el of controls) el.disabled = true;
  bind();

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (loaded) {
      mergeChanges(raw, changes);
      render();
      // A new focus memory mode or global state can change what the current tab shows.
      const site = activeTab?.site;
      if (
        site &&
        isFocusSite(site) &&
        (FOCUS_SITES[site].persistenceKey in changes || FOCUS_SITES[site].stateKey in changes)
      )
        void refreshSelected();
    } else for (const [key, change] of Object.entries(changes)) pending[key] = change.newValue;
  });

  const [tabs, commands] = await Promise.all([
    ext.tabs.query({ active: true, currentWindow: true }).catch(() => []),
    ext.commands?.getAll().catch(() => []) ?? [],
  ]);
  let tab: chrome.tabs.Tab | undefined = tabs[0];
  // Opened as a page instead of a popup, the popup is its own active tab; `?tab=<id>` names the
  // tab to act on instead (the e2e suite drives the popup this way).
  if (tab?.url?.startsWith(location.origin)) {
    const id = Number(new URLSearchParams(location.search).get("tab"));
    tab = id ? await ext.tabs.get(id).catch(() => undefined) : undefined;
  }
  if (tab && typeof tab.id === "number") {
    activeTab = { id: tab.id, site: siteForUrl(tab.url) };
    if (activeTab.site && RAIL.some((s) => s.id === activeTab!.site)) selected = activeTab.site;
  }
  shortcuts = Object.fromEntries(
    (commands as chrome.commands.Command[])
      .filter((command) => command.name && command.shortcut)
      .map((command) => [command.name!, command.shortcut!]),
  );

  try {
    raw = (await ext.storage.local.get(null)) as RawStorage;
  } catch {
    status("Could not load preferences. Reopen the popup to retry.", true);
    return;
  }
  mergeChanges(
    raw,
    Object.fromEntries(Object.entries(pending).map(([key, value]) => [key, { newValue: value }])),
  );
  loaded = true;
  for (const el of controls) el.disabled = false;
  render();
  await refreshSelected();
  status("Choices stay in this browser");
}

void init();
