(function () {
  "use strict";
  const THEMES = ["system", "dark", "light"];
  const GROUPS = { bulkVideoSidebar: ["hideRelatedSidebar", "hideLiveChat", "hidePlaylistSidebar", "hideFundraiser"], bulkVideoInfo: ["hideVideoActionsBar", "hideChannelRow", "hideDescription"], bulkTopHeader: ["hideNotificationBell"] };
  let raw = {}, pending = {}, loaded = false, selected = "youtube";
  const $ = (id) => document.getElementById(id);
  function status(message, error) {
    $("saveStatus").textContent = message;
    $("saveStatus").classList.toggle("error", !!error);
    $("saveStatus").setAttribute("role", error ? "alert" : "status");
  }
  function theme() {
    const mode = THEMES.includes(raw[UNHOOKED_POPUP_THEME_KEY]) ? raw[UNHOOKED_POPUP_THEME_KEY] : "system";
    if (mode === "system") delete document.documentElement.dataset.popupTheme;
    else document.documentElement.dataset.popupTheme = mode;
    $("btnTheme").title = "Theme: " + mode;
    $("btnTheme").setAttribute("aria-label", "Theme: " + mode + ". Change theme");
  }
  function render() {
    if (!loaded) return;
    const site = unhookedSiteById(selected), state = unhookedResolveSettings(raw, site);
    $("extensionDisabled").checked = state.paused;
    $("btnPower").classList.toggle("off", state.paused);
    $("btnPower").setAttribute("aria-pressed", String(!state.paused));
    $("btnPower").setAttribute("aria-label", state.paused ? "Resume on all sites" : "Pause on all sites");
    $("btnPower").title = state.paused ? "Resume on all sites" : "Pause on all sites";
    $("pausedNote").hidden = !state.paused;
    $("siteEnabled").checked = state.enabled;
    $("siteState").textContent = state.paused ? "Paused globally" : state.enabled ? "Enabled" : "Site off";
    $("siteState").classList.toggle("inactive", state.paused || !state.enabled);
    $("activeCount").textContent = Object.values(state.features).filter(Boolean).length + " on";
    $("youtubeControls").hidden = selected !== "youtube";
    $("socialControls").hidden = selected === "youtube";
    if (selected === "youtube") {
      site.features.forEach((feature) => { $(feature.id).checked = state.features[feature.id]; });
      Object.entries(GROUPS).forEach(([id, keys]) => {
        const values = keys.map((key) => state.features[key]);
        $(id).checked = values.every(Boolean);
        $(id).indeterminate = values.some(Boolean) && !values.every(Boolean);
      });
    } else {
      const container = $("socialControls");
      if (container.dataset.site !== selected) {
        container.replaceChildren(); container.dataset.site = selected;
        site.features.forEach((feature) => {
          const row = document.createElement("label"); row.className = "row social-row";
          const input = document.createElement("input"); input.type = "checkbox"; input.className = "uh-switch";
          input.id = "social-" + feature.id; input.dataset.feature = feature.id;
          const text = document.createElement("span"); text.className = "feature-copy";
          const label = document.createElement("strong"); label.textContent = feature.label;
          const desc = document.createElement("small"); desc.textContent = feature.description;
          text.append(label, desc); row.append(input, text); container.append(row);
        });
      }
      site.features.forEach((feature) => { $("social-" + feature.id).checked = state.features[feature.id]; });
    }
    theme();
  }
  function write(patch, message) {
    if (!loaded) return;
    status("Saving…");
    chrome.storage.local.set(patch, () => {
      if (chrome.runtime.lastError) { status("Could not save. " + chrome.runtime.lastError.message, true); render(); return; }
      Object.assign(raw, patch); render(); status(message || "Saved in this browser");
    });
  }
  function init() {
    const controls = Array.from(document.querySelectorAll("input, select, button"));
    controls.forEach((el) => { el.disabled = true; });
    UNHOOKED_SITES.forEach((site) => {
      const option = document.createElement("option"); option.value = site.id; option.textContent = site.label; $("sitePicker").append(option);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (loaded) { unhookedMergeChanges(raw, changes); render(); }
      else Object.keys(changes).forEach((key) => { pending[key] = changes[key].newValue; });
    });
    chrome.storage.local.get(null, (data) => {
      if (chrome.runtime.lastError) { status("Could not load preferences. Reopen the popup to retry.", true); return; }
      raw = data || {};
      Object.keys(pending).forEach((key) => { if (pending[key] === undefined) delete raw[key]; else raw[key] = pending[key]; });
      loaded = true; controls.forEach((el) => { el.disabled = false; }); render(); status("Preferences stay in this browser");
    });
    $("sitePicker").addEventListener("change", (e) => { selected = e.target.value; render(); status("Editing " + unhookedSiteById(selected).label); });
    $("siteEnabled").addEventListener("change", (e) => write(unhookedFeaturePatch(selected, "enabled", e.target.checked)));
    $("btnPower").addEventListener("click", () => write({ [UNHOOKED_PAUSED_KEY]: !unhookedResolveSettings(raw, unhookedSiteById(selected)).paused }));
    $("extensionDisabled").addEventListener("change", (e) => write({ [UNHOOKED_PAUSED_KEY]: e.target.checked }));
    $("btnTheme").addEventListener("click", () => {
      const current = THEMES.includes(raw[UNHOOKED_POPUP_THEME_KEY]) ? raw[UNHOOKED_POPUP_THEME_KEY] : "system";
      write({ [UNHOOKED_POPUP_THEME_KEY]: THEMES[(THEMES.indexOf(current) + 1) % THEMES.length] });
    });
    unhookedSiteById("youtube").features.forEach((feature) => {
      const input = $(feature.id);
      const hint = document.createElement("small"); hint.className = "feature-hint";
      hint.id = "hint-" + feature.id; hint.textContent = feature.description;
      input.closest("label").querySelector(".row-label").append(hint);
      input.setAttribute("aria-describedby", hint.id);
      $(feature.id).addEventListener("change", (e) => write(unhookedFeaturePatch("youtube", feature.id, e.target.checked)));
    });
    Object.entries(GROUPS).forEach(([id, keys]) => $(id).addEventListener("change", (e) => {
      const patch = {}; keys.forEach((key) => Object.assign(patch, unhookedFeaturePatch("youtube", key, e.target.checked))); write(patch);
    }));
    $("socialControls").addEventListener("change", (e) => {
      if (e.target.dataset.feature) write(unhookedFeaturePatch(selected, e.target.dataset.feature, e.target.checked));
    });
    document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
      write(unhookedPresetPatch(selected, button.dataset.preset), button.querySelector("strong").textContent + " applied to " + unhookedSiteById(selected).label);
    }));
    $("resetAll").addEventListener("click", () => write(unhookedPresetPatch(selected, "clear"), "Controls reset for " + unhookedSiteById(selected).label));
    document.querySelectorAll(".collapse-btn").forEach((button) => button.addEventListener("click", () => {
      const group = button.closest(".group"), collapsed = group.classList.toggle("collapsed");
      button.setAttribute("aria-expanded", String(!collapsed)); button.textContent = collapsed ? "+" : "−";
    }));
  }
  document.addEventListener("DOMContentLoaded", init);
})();
