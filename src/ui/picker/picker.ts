/**
 * The picker: a sketch of each site where you click the parts you want gone. It writes the same
 * preference keys as the popup's switches, so the two stay in sync through storage events.
 */
import { ext } from "../../shared/ext-api.ts";
import {
  featurePatch,
  isPaused,
  mergeChanges,
  presetPatch,
  resolveSettings,
  type RawStorage,
} from "../../shared/preferences.ts";
import { STORAGE_KEYS } from "../../shared/settings.ts";
import { CONTROL_SITES, controlSiteById, type ControlSite } from "../../sites/registry.ts";
import { siteForUrl } from "../../sites/hosts.ts";
import { PREVIEW_ACTION, type PreviewRequest } from "../../sites/custom/protocol.ts";
import { SKETCH_WIDTH, SKETCHES, type Part } from "./sketches.ts";

const HINT_KEY = "unhooked.picker.hinted";
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

let raw: RawStorage = {};
let loaded = false;
let site: ControlSite = CONTROL_SITES[0]!;
const viewBySite = new Map<string, string>();

const featureLabel = (id: string) => site.features.find((f) => f.id === id)?.label ?? id;

function status(message: string, error = false): void {
  $("saveStatus").textContent = message;
  $("saveStatus").classList.toggle("error", error);
}

async function write(patch: RawStorage, message: string): Promise<void> {
  try {
    await ext.storage.local.set(patch);
    Object.assign(raw, patch);
    render();
    status(message);
  } catch (error) {
    status(`Could not save. ${(error as Error).message}`, true);
  }
}

function currentView() {
  const views = SKETCHES[site.id];
  return views.find((v) => v.id === viewBySite.get(site.id)) ?? views[0]!;
}

// ---- rendering -----------------------------------------------------------------------------------

function renderSites(): void {
  const list = $("sites");
  if (!list.childElementCount) {
    list.append(
      ...CONTROL_SITES.map((s) => {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#${s.id}`;
        link.dataset.site = s.id;
        const name = document.createElement("span");
        name.textContent = s.label;
        const count = document.createElement("span");
        count.className = "count";
        link.append(name, count);
        item.append(link);
        return item;
      }),
    );
  }
  for (const link of list.querySelectorAll<HTMLAnchorElement>("a")) {
    const s = controlSiteById(link.dataset.site!)!;
    const state = resolveSettings(raw, s);
    const on = Object.values(state.features).filter(Boolean).length;
    link.querySelector(".count")!.textContent = state.enabled ? String(on) : "off";
    if (s.id === site.id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function renderViews(): void {
  const views = SKETCHES[site.id];
  const view = currentView();
  const tabs = $("views");
  tabs.hidden = views.length < 2;
  if (tabs.dataset.site !== site.id) {
    tabs.replaceChildren(
      ...views.map((v) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.role = "tab";
        tab.dataset.view = v.id;
        tab.textContent = v.label;
        return tab;
      }),
    );
    tabs.dataset.site = site.id;
  }
  for (const tab of tabs.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    tab.setAttribute("aria-selected", String(tab.dataset.view === view.id));
  }
  $("siteTitle").textContent = site.label;
  $("framePath").textContent = view.path;
}

function partElement(part: Part, height: number): HTMLElement {
  const [x, y, w, h] = part.box;
  const el = document.createElement(part.feature ? "button" : "div");
  el.className = "part";
  el.dataset.texture = part.texture ?? "bar";
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  Object.assign(el.style, {
    left: pct(x, SKETCH_WIDTH),
    top: pct(y, height),
    width: pct(w, SKETCH_WIDTH),
    height: pct(h, height),
  });
  // Too small for a label (a bell, a watermark): the name moves to the tooltip.
  if (w < 120 || h < 36) el.classList.add("small");
  if (w < 80) el.classList.add("tiny");
  el.title = part.label;
  const label = document.createElement("span");
  label.className = "part-label";
  label.textContent = part.label;
  el.append(label);
  if (part.feature) {
    (el as HTMLButtonElement).type = "button";
    el.dataset.feature = part.feature;
    el.setAttribute("aria-label", featureLabel(part.feature));
    const gone = document.createElement("span");
    gone.className = "gone";
    gone.setAttribute("aria-hidden", "true");
    gone.textContent = "gone";
    el.append(gone);
  } else {
    el.classList.add("kept");
    el.title = `${part.label}: Unhooked always keeps this`;
  }
  return el;
}

function renderCanvas(): void {
  const view = currentView();
  const canvas = $("canvas");
  const key = `${site.id}/${view.id}`;
  if (canvas.dataset.view !== key) {
    canvas.style.aspectRatio = `${SKETCH_WIDTH} / ${view.height}`;
    canvas.replaceChildren(...view.parts.map((part) => partElement(part, view.height)));
    $("basis").textContent =
      view.basis === "measured"
        ? `Layout measured from ${view.path}`
        : `${site.label} needs a login to measure, so this follows the structure its controls target`;
    canvas.dataset.view = key;
    canvas.setAttribute("aria-label", `${site.label}, ${view.label} page`);
  }
  const state = resolveSettings(raw, site);
  for (const part of canvas.querySelectorAll<HTMLButtonElement>("[data-feature]")) {
    const hidden = Boolean(state.features[part.dataset.feature!]);
    part.setAttribute("aria-pressed", String(hidden));
    part.dataset.note = hidden ? "bring it back" : "hide this";
  }
}

function renderNotice(): void {
  const state = resolveSettings(raw, site);
  const notice = $("notice");
  if (isPaused(raw)) {
    $("noticeText").textContent =
      "Unhooked is paused, so nothing is hidden right now. Your clicks still save.";
    $("noticeAction").textContent = "Resume";
    $("noticeAction").dataset.action = "resume";
  } else if (!state.enabled) {
    $("noticeText").textContent = `Hiding is off for ${site.label}. Your clicks still save.`;
    $("noticeAction").textContent = `Turn it on`;
    $("noticeAction").dataset.action = "enable";
  }
  notice.hidden = !isPaused(raw) && state.enabled;
}

function renderReceipt(): void {
  const state = resolveSettings(raw, site);
  const hidden = site.features.filter((f) => state.features[f.id]);
  $("receipt").textContent = hidden.length
    ? `Hidden on ${site.label}: ${hidden.map((f) => f.label.replace(/^(Hide|Disable) /, "")).join(", ")}.`
    : `Nothing hidden on ${site.label} yet.`;
  $("bringBack").hidden = !hidden.length;
}

function render(): void {
  if (!loaded) return;
  renderSites();
  renderViews();
  renderCanvas();
  renderNotice();
  renderReceipt();
}

// ---- interaction -------------------------------------------------------------------------------

function selectFromHash(): void {
  site = controlSiteById(location.hash.slice(1)) ?? site;
  render();
}

/** Outline the hovered part on every open tab of this site, so the sketch points at the page. */
let previewing = "";
async function previewOnTabs(feature: string | null, label = ""): Promise<void> {
  const key = feature ? `${site.id}/${feature}` : "";
  if (key === previewing) return;
  previewing = key;
  const message: PreviewRequest = feature
    ? { action: PREVIEW_ACTION, feature, label }
    : { action: PREVIEW_ACTION, clear: true };
  const tabs = await ext.tabs.query({}).catch(() => []);
  for (const tab of tabs)
    if (typeof tab.id === "number" && siteForUrl(tab.url) === site.id)
      ext.tabs.sendMessage(tab.id, message).catch(() => {});
}

function bind(): void {
  const hover = (event: Event) => {
    const part = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-feature]");
    if (part)
      void previewOnTabs(
        part.dataset.feature!,
        part.querySelector(".part-label")?.textContent ?? "",
      );
    else void previewOnTabs(null);
  };
  $("canvas").addEventListener("mouseover", hover);
  $("canvas").addEventListener("focusin", hover);
  $("canvas").addEventListener("mouseleave", () => void previewOnTabs(null));
  $("canvas").addEventListener("focusout", () => void previewOnTabs(null));
  addEventListener("blur", () => void previewOnTabs(null));
  window.addEventListener("hashchange", selectFromHash);
  $("views").addEventListener("click", (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-view]");
    if (!tab) return;
    viewBySite.set(site.id, tab.dataset.view!);
    render();
  });
  $("canvas").addEventListener("click", (event) => {
    const part = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-feature]");
    if (!part) return;
    const feature = part.dataset.feature!;
    const hide = part.getAttribute("aria-pressed") !== "true";
    const name = featureLabel(feature).replace(/^(Hide|Disable) /, "");
    void write(featurePatch(site.id, feature, hide), hide ? `${name} hidden` : `${name} back`);
    dismissHint();
  });
  $("noticeAction").addEventListener("click", () => {
    if ($("noticeAction").dataset.action === "resume")
      void write({ [STORAGE_KEYS.PAUSED]: false }, "Resumed");
    else void write(featurePatch(site.id, "enabled", true), `${site.label} on`);
  });
  $("bringBack").addEventListener("click", () => {
    void write(presetPatch(site.id, "clear"), `Everything back on ${site.label}`);
  });
}

function dismissHint(): void {
  if (!$("handNote").classList.contains("is-shown")) return;
  $("handNote").classList.remove("is-shown");
  localStorage.setItem(HINT_KEY, "1");
}

async function init(): Promise<void> {
  bind();
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !loaded) return;
    mergeChanges(raw, changes);
    render();
  });
  try {
    raw = (await ext.storage.local.get(null)) as RawStorage;
  } catch {
    status("Could not load preferences. Reload the page to retry.", true);
    return;
  }
  loaded = true;
  site = controlSiteById(location.hash.slice(1)) ?? site;
  render();
  status("Changes apply to open tabs right away");
  if (!localStorage.getItem(HINT_KEY)) $("handNote").classList.add("is-shown");
}

void init();
