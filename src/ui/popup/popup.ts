/**
 * The popup: a rail of every site with its live state, and the selected site's settings.
 * It opens on the site of the current tab. Storage is the source of truth; every control
 * writes one key (or one preset's keys) and re-renders from storage events.
 */
import { FOCUS_ACTION, type FocusReply, type FocusRequest } from "../../focus/protocol.ts";
import {
  FOCUS_SITES,
  FOCUS_TARGETS,
  X_FOCUS_TARGETS,
  type FocusSite,
  type PersistenceMode,
} from "../../focus/sites.ts";
import { formatShortcut, shortcutFromEvent, wandShortcut } from "../../shared/shortcut.ts";
import { ext } from "../../shared/ext-api.ts";
import {
  PRESETS,
  customKey,
  customRules,
  featurePatch,
  isPaused,
  matchingPreset,
  mergeChanges,
  presetPatch,
  redirectToPatch,
  renameRule,
  resolveSettings,
  type Preset,
  type RawStorage,
  type SiteSettings,
} from "../../shared/preferences.ts";
import { DEFAULTS, STORAGE_KEYS, type TwitterFocusControls } from "../../shared/settings.ts";
import {
  SITE_HOSTS,
  originPattern,
  siteForUrl,
  wandSiteFor,
  type SiteId,
} from "../../sites/hosts.ts";
import { CONTROL_SITES, controlSiteById, type ControlSite } from "../../sites/registry.ts";
import { TWITCH_ACTIONS, type ChatUrlEntry } from "../../sites/twitch/protocol.ts";
import { PREVIEW_ACTION, type PreviewRequest } from "../../sites/custom/protocol.ts";

const YOUTUBE_GROUPS: Record<string, string[]> = {
  bulkVideoSidebar: ["hideRelatedSidebar", "hideLiveChat", "hidePlaylistSidebar", "hideFundraiser"],
  bulkVideoInfo: ["hideVideoActionsBar", "hideChannelRow", "hideDescription"],
  bulkTopHeader: ["hideNotificationBell"],
};
/** "page": the current tab's site when Unhooked has no controls for it; the wand still works. */
type Selection = SiteId | "page";
const RAIL: { id: Selection; label: string }[] = [
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
let selected: Selection = "youtube";
let activeTab: { id: number; site: SiteId | undefined; host: string | null } | null = null;
/** Whether focus mode is on in the current tab (for its site, whichever site is selected). */
let focusOn = false;
let shortcuts: Record<string, string> = {};

const isFocusSite = (id: Selection): id is FocusSite => id in FOCUS_SITES;
const shortHost = (id: SiteId) => SITE_HOSTS[id][0].replace(/^www\./, "");
const railLabel = (id: Selection) => RAIL.find((s) => s.id === id)!.label;
/** Whether the selected site is the one open in this tab (so the page can be acted on). */
const isHere = () =>
  !!activeTab &&
  (selected === "page" ? !activeTab.site && !!activeTab.host : activeTab.site === selected);
/** Where the selected site's wand removals are stored. */
const wandKey = () =>
  selected === "page" ? wandSiteFor(activeTab?.host ?? "") : (selected as string);
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
    } else if (id === "page") {
      const removed = customRules(raw, wandKey()).length;
      meta = removed ? String(removed) : "";
      state = removed ? "on" : "idle";
      spoken = removed ? `${removed} removed with the wand` : "";
    }
    input.checked = id === selected;
    $(`meta-${id}`).textContent = meta;
    item.dataset.state = state;
    input.setAttribute("aria-label", [railLabel(id), spoken].filter(Boolean).join(", "));
  }
  document.body.classList.toggle("is-paused", paused);
}

function renderHeader(control: ControlSite | undefined, paused: boolean): void {
  const label = railLabel(selected);
  $("siteName").textContent = label;
  const enabled = $<HTMLInputElement>("siteEnabled");
  enabled.hidden = selected === "excalidraw" || selected === "page";
  if (control) {
    const state = resolveSettings(raw, control);
    enabled.checked = state.enabled;
    enabled.setAttribute("aria-label", `Hide controls on ${label}`);
    $("siteState").textContent =
      `${state.enabled ? "Active on" : "Off on"} ${shortHost(control.id)}`;
    const match = matchingPreset(selected, state);
    for (const preset of PRESETS) {
      $(`preset-${preset}`).setAttribute("aria-pressed", String(preset === match));
    }
  } else if (selected === "twitch") {
    const pills = raw[STORAGE_KEYS.TWITCH_LINK_PILLS] !== false;
    enabled.checked = pills;
    enabled.setAttribute("aria-label", "Link pills in Twitch chat");
    $("siteState").textContent = pills ? "Chat links become pills" : "Chat links stay plain";
  } else if (selected === "page") {
    $("siteState").textContent = customRules(raw, wandKey()).length
      ? "Your removals stay hidden here"
      : "No controls here, but the wand works";
  } else {
    $("siteState").textContent = "Focus mode for the canvas";
  }
  $("presets").hidden = !control;
  $("openPicker").hidden = !control;
  renderShortcut();
  // The wand works on the page in this tab, so it needs this tab to be on the selected site.
  const here = isHere();
  $<HTMLButtonElement>("openWand").disabled = !here;
  $("openWand").title = here
    ? "Point at anything on the page and click to hide it"
    : `Open ${label} in this tab to pick on the page`;
  $("resetAll").hidden = !control && selected !== "page";
  $("resetAll").textContent = selected === "page" ? "Forget site" : "Reset site";
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
    : `Open ${railLabel(site)} in this tab to use it.`;
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

// ---- the wand shortcut: shown beside the wand, click to record a new one ------------------------

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
let recording = false;

function renderShortcut(): void {
  const chip = $<HTMLButtonElement>("wandShortcut");
  const shortcut = wandShortcut(raw[STORAGE_KEYS.WAND_SHORTCUT]);
  chip.classList.toggle("is-recording", recording);
  chip.textContent = recording ? "Press keys" : formatShortcut(shortcut, MAC) || "Set key";
  chip.setAttribute(
    "aria-label",
    recording
      ? "Recording the wand shortcut: press the keys, Backspace to remove it, Esc to cancel"
      : shortcut
        ? `Wand shortcut ${formatShortcut(shortcut)}. Change it`
        : "Set a wand shortcut",
  );
  chip.title = "Press this on a supported site to start the wand. Click to change it.";
}

function stopRecording(): void {
  recording = false;
  renderShortcut();
}

function bindShortcut(): void {
  const chip = $<HTMLButtonElement>("wandShortcut");
  chip.addEventListener("click", () => {
    recording = !recording;
    renderShortcut();
  });
  chip.addEventListener("blur", stopRecording);
  addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") return stopRecording();
      if (event.key === "Backspace" || event.key === "Delete") {
        recording = false;
        return void write({ [STORAGE_KEYS.WAND_SHORTCUT]: "" }, "Wand shortcut removed");
      }
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) {
        if (!/^(Control|Alt|Shift|Meta)$/.test(event.key))
          status("Hold Ctrl, Alt or ⌘ with the key, so it can't fire while you type", true);
        return;
      }
      recording = false;
      void write(
        { [STORAGE_KEYS.WAND_SHORTCUT]: shortcut },
        `Wand shortcut: ${formatShortcut(shortcut, MAC)}`,
      );
    },
    true,
  );
}

function renderCustom(): void {
  const rules = customRules(raw, wandKey());
  $("customSection").hidden = !rules.length;
  const list = $("customList");
  // Don't rebuild under someone typing a name.
  if (list.contains(document.activeElement) && document.activeElement?.matches("input")) return;
  list.replaceChildren(
    ...rules.map((rule) => {
      const item = document.createElement("li");
      item.className = "row";
      item.dataset.selector = rule.selector;
      item.dataset.label = rule.label;
      const copy = document.createElement("span");
      copy.className = "feature-copy";
      // The name is editable in place: click it, type, Enter.
      const title = document.createElement("input");
      title.type = "text";
      title.className = "rule-name";
      title.value = rule.label;
      title.placeholder = rule.original ?? rule.label;
      title.maxLength = 80;
      title.spellcheck = false;
      title.setAttribute("aria-label", `Name for ${rule.label}`);
      title.title = "Rename";
      const small = document.createElement("small");
      small.textContent = rule.selector;
      small.className = "selector";
      copy.append(title, small);
      const back = document.createElement("button");
      back.type = "button";
      back.className = "bring-back";
      back.textContent = "Bring back";
      back.setAttribute("aria-label", `Bring back ${rule.label}`);
      item.append(copy, back);
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
  renderSkip(control);
  renderCustom();
}

// ---- skip the feeds: leave a site's feed pages for one the user picked ------------------------

let editingPath = false;

function renderSkip(control: ControlSite | undefined): void {
  $("skipSection").hidden = !control;
  if (!control) return;
  const state = resolveSettings(raw, control);
  $<HTMLInputElement>("skipToggle").checked = state.redirect;
  $("skipHint").textContent = control.redirect.skips;
  const choices = $("skipChoices");
  if (choices.dataset.site !== control.id) {
    choices.replaceChildren(
      ...[...control.redirect.choices, { label: "Other", path: "" }].map(({ label, path }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.path = path;
        return button;
      }),
    );
    choices.dataset.site = control.id;
    editingPath = false;
  }
  const known = control.redirect.choices.some((c) => c.path === state.redirectTo);
  for (const button of choices.querySelectorAll<HTMLButtonElement>("button")) {
    const pressed = button.dataset.path
      ? button.dataset.path === state.redirectTo
      : !known || editingPath;
    button.setAttribute("aria-pressed", String(pressed && !(editingPath && button.dataset.path)));
  }
  const form = $("skipPathForm");
  form.hidden = known && !editingPath;
  const input = $<HTMLInputElement>("skipPath");
  if (document.activeElement !== input) input.value = known ? "" : state.redirectTo;
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

function buildRailItem(id: Selection, label: string): HTMLElement {
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
  return item;
}

function buildRail(): void {
  for (const { id, label } of RAIL) buildRailItem(id, label);
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

// ---- hover: preview on the page, and the row's description in the footer --------------------

let previewing = "";

/** Outline on the page what a control or wand removal covers (only in this tab, on its site). */
function preview(target: Omit<PreviewRequest, "action"> | null): void {
  const key = target ? JSON.stringify(target) : "";
  if (key === previewing || !activeTab || !isHere()) return;
  previewing = key;
  const message: PreviewRequest = target
    ? { action: PREVIEW_ACTION, ...target }
    : { action: PREVIEW_ACTION, clear: true };
  ext.tabs.sendMessage(activeTab.id, message).catch(() => {});
}

function previewTarget(row: Element): Omit<PreviewRequest, "action"> | null {
  const selector = (row as HTMLElement).dataset.selector;
  if (selector) return { selector, label: (row as HTMLElement).dataset.label };
  const input = row.querySelector<HTMLInputElement>("input.uh-switch");
  const title = row
    .querySelector(".row-label, .feature-copy strong")
    ?.firstChild?.textContent?.trim();
  // Group switches (YouTube's "Hide video sidebar") cover every control in the group.
  if (input && YOUTUBE_GROUPS[input.id])
    return { features: YOUTUBE_GROUPS[input.id], label: title };
  // Focus mode and its X options hide parts of the page too.
  if (input?.id === "focusToggle" && isFocusSite(selected))
    return { selectors: [...FOCUS_TARGETS[selected]], label: "Focus mode hides" };
  if (input?.dataset.xControl)
    return { selectors: [...(X_FOCUS_TARGETS[input.dataset.xControl] ?? [])], label: title };
  const control = controlSiteById(selected);
  const feature =
    input?.dataset.feature ?? (control?.features.some((f) => f.id === input?.id) ? input?.id : "");
  if (!feature) return null;
  const label = control?.features
    .find((f) => f.id === feature)
    ?.label.replace(/^(Hide|Disable) /, "");
  return { feature, label };
}

function bindHover(): void {
  const enter = (event: Event) => {
    const row = (event.target as HTMLElement).closest(".row");
    if (!row) return;
    const hint = row.querySelector(
      ".feature-hint, .feature-copy small:not(.selector)",
    )?.textContent;
    $("hint").textContent = hint ?? "";
    document.body.classList.toggle("is-hinting", Boolean(hint));
    preview(previewTarget(row));
  };
  const leave = (event: Event) => {
    const to = (event as MouseEvent).relatedTarget as Node | null;
    if (to && $("main").contains(to) && (to as Element).closest?.(".row")) return;
    document.body.classList.remove("is-hinting");
    preview(null);
  };
  // The site switch previews everything it currently hides on the page.
  const siteSwitch = $("siteEnabled");
  siteSwitch.addEventListener("mouseenter", () => {
    const control = controlSiteById(selected);
    if (!control) return;
    const on = Object.entries(resolveSettings(raw, control).features)
      .filter(([, value]) => value)
      .map(([id]) => id);
    if (on.length) preview({ features: on, label: `Everything ${control.label} controls hide` });
  });
  siteSwitch.addEventListener("mouseleave", () => preview(null));
  const main = document.querySelector("main")!;
  main.id = "main";
  main.addEventListener("mouseover", enter);
  main.addEventListener("focusin", enter);
  main.addEventListener("mouseleave", leave);
  main.addEventListener("focusout", leave);
  addEventListener("blur", () => preview(null));
}

function bind(): void {
  $("sitePicker").addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name !== "site") return;
    selected = target.value as Selection;
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
  $("openWand").addEventListener("click", async () => {
    if (!activeTab) return;
    const files = ["sites/wand/content.js"];
    if (selected === "page" && activeTab.host) {
      // On a site Unhooked doesn't cover, removals only stay removed if it may run there. Asked
      // first thing in the click: browsers only show the prompt for a user's gesture.
      const granted = await ext.permissions
        .request({ origins: [originPattern(activeTab.host)] })
        .catch(() => false);
      if (!granted) return status("Allow Unhooked on this site to keep what you remove", true);
      // The background registers the removals script for later visits; this visit gets it now.
      files.unshift("sites/custom/content.js");
    }
    try {
      for (const file of files) {
        if (ext.scripting)
          await ext.scripting.executeScript({ target: { tabId: activeTab.id }, files: [file] });
        else
          await (
            ext.tabs as unknown as { executeScript: (id: number, d: object) => Promise<unknown> }
          ).executeScript(activeTab.id, { file });
      }
      window.close();
    } catch (error) {
      status(`Could not start the wand. ${(error as Error).message}`, true);
    }
  });
  const ruleOf = (el: Element) => el.closest<HTMLElement>("[data-selector]")?.dataset.selector;
  $("customList").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest(".bring-back");
    const selector = button && ruleOf(button);
    if (!selector) return;
    void write(
      {
        [customKey(wandKey())]: customRules(raw, wandKey()).filter((r) => r.selector !== selector),
      },
      "Brought back",
    );
    preview(null);
  });
  // Renaming a removal: saved on Enter or when the field loses focus; Esc puts it back.
  $("customList").addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const selector = input.matches(".rule-name") && ruleOf(input);
    if (!selector) return;
    void write(
      { [customKey(wandKey())]: renameRule(customRules(raw, wandKey()), selector, input.value) },
      "Renamed",
    );
  });
  $("customList").addEventListener("keydown", (event: KeyboardEvent) => {
    const input = event.target as HTMLInputElement;
    if (!input.matches(".rule-name")) return;
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") {
      event.preventDefault();
      input.value = input.closest<HTMLElement>("[data-label]")?.dataset.label ?? input.value;
      input.blur();
    }
  });

  // Skip the feeds
  $("skipToggle").addEventListener("change", (event) => {
    const on = (event.target as HTMLInputElement).checked;
    void write(
      featurePatch(selected, "redirect", on),
      on ? `${railLabel(selected)} feeds are skipped` : "Feeds are no longer skipped",
    );
  });
  $("skipChoices").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (!button.dataset.path) {
      editingPath = true;
      render();
      $("skipPath").focus();
      return;
    }
    editingPath = false;
    void write(redirectToPatch(selected, button.dataset.path), `Feeds go to ${button.textContent}`);
  });
  $("skipPathForm").addEventListener("submit", (event) => {
    event.preventDefault();
    let path = $<HTMLInputElement>("skipPath").value.trim();
    // A pasted address on the same site is fine; keep its path.
    try {
      const url = new URL(path);
      if (siteForUrl(url.href) === selected) path = url.pathname + url.search;
    } catch {}
    try {
      const patch = redirectToPatch(selected, path);
      editingPath = false;
      void write(patch, `Feeds go to ${path}`);
    } catch {
      status("Use a path on this site, starting with /", true);
    }
  });
  bindHover();
  bindShortcut();
  $("openPicker").addEventListener("click", () => {
    void ext.tabs.create({ url: ext.runtime.getURL(`ui/picker/index.html#${selected}`) });
    window.close();
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
      const label = railLabel(selected);
      void write(
        presetPatch(selected, button.dataset.preset as Preset),
        `${button.textContent} applied to ${label}`,
      );
    });
  }
  $("resetAll").addEventListener("click", async () => {
    if (selected === "page") {
      // Forget a site the wand was used on: its removals, and Unhooked's access to it.
      const host = activeTab?.host;
      await write({ [customKey(wandKey())]: [] }, `${railLabel("page")} forgotten`);
      await ext.storage.local.remove(customKey(wandKey())).catch(() => {});
      if (host) await ext.permissions.remove({ origins: [originPattern(host)] }).catch(() => {});
      return;
    }
    void write(
      { ...presetPatch(selected, "clear"), ...featurePatch(selected, "enabled", true) },
      `${railLabel(selected)} reset`,
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
    let host: string | null = null;
    try {
      const url = new URL(tab.url ?? "");
      if (/^https?:$/.test(url.protocol)) host = url.hostname;
    } catch {}
    activeTab = { id: tab.id, site: siteForUrl(tab.url), host };
    if (activeTab.site && RAIL.some((s) => s.id === activeTab!.site)) selected = activeTab.site;
    else if (!activeTab.site && host) {
      // Any other website: the wand still works there, so it gets a place in the rail.
      RAIL.push({ id: "page", label: host.replace(/^www\./, "") });
      buildRailItem("page", railLabel("page")).classList.add("site-page");
      selected = "page";
    }
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
  status("Saved in this browser");
}

void init();
