(function () {
  "use strict";
  const THEMES = ["system", "dark", "light"];
  const GROUPS = {
    bulkVideoSidebar: [
      "hideRelatedSidebar",
      "hideLiveChat",
      "hidePlaylistSidebar",
      "hideFundraiser"
    ],
    bulkVideoInfo: ["hideVideoActionsBar", "hideChannelRow", "hideDescription"],
    bulkTopHeader: ["hideNotificationBell"]
  };
  let raw = {},
    pending = {},
    loaded = false,
    selected = "youtube";
  const PRESETS = ["balanced", "focused", "clear"];
  const $ = (id) => document.getElementById(id);
  const countOn = (state) => Object.values(state.features).filter(Boolean).length;
  function status(message, error) {
    $("saveStatus").textContent = message;
    $("saveStatus").classList.toggle("error", !!error);
    $("saveStatus").setAttribute("role", error ? "alert" : "status");
  }
  function theme() {
    const mode = THEMES.includes(raw[UNHOOKED_POPUP_THEME_KEY])
      ? raw[UNHOOKED_POPUP_THEME_KEY]
      : "system";
    if (mode === "system") delete document.documentElement.dataset.popupTheme;
    else document.documentElement.dataset.popupTheme = mode;
    $("btnTheme").title = "Theme: " + mode;
    $("btnTheme").setAttribute("aria-label", "Theme: " + mode + ". Change theme");
  }
  function render() {
    if (!loaded) return;
    const site = unhookedSiteById(selected),
      state = unhookedResolveSettings(raw, site);
    $("btnPower").setAttribute("aria-pressed", String(state.paused));
    $("powerLabel").textContent = state.paused ? "Resume" : "Pause all";
    $("pausedNote").hidden = !state.paused;
    document.body.classList.toggle("is-paused", state.paused);
    UNHOOKED_SITES.forEach((s) => {
      const input = $("site-" + s.id),
        summary = unhookedResolveSettings(raw, s),
        on = countOn(summary);
      input.checked = s.id === selected;
      $("meta-" + s.id).textContent = summary.enabled ? String(on) : "off";
      input.setAttribute(
        "aria-label",
        s.label + ", " + (summary.enabled ? on + " of " + s.features.length + " on" : "off")
      );
      input.closest(".site").dataset.state = !summary.enabled ? "off" : on ? "on" : "idle";
    });
    $("siteName").textContent = site.label;
    $("siteEnabled").checked = state.enabled;
    $("siteEnabled").setAttribute("aria-label", "Controls on " + site.label);
    $("siteState").textContent =
      (state.enabled ? "Active on " : "Off on ") + site.hosts[0].replace(/^www\./, "");
    // Mark one preset that matches the current choices; on some sites two presets coincide.
    const matching = PRESETS.find((preset) => {
      const patch = unhookedPresetPatch(selected, preset);
      return site.features.every(
        (f) => patch[unhookedPreferenceKey(selected, f.id)] === state.features[f.id]
      );
    });
    PRESETS.forEach((preset) => {
      $("preset-" + preset).setAttribute("aria-pressed", String(preset === matching));
    });
    $("youtubeControls").hidden = selected !== "youtube";
    $("socialControls").hidden = selected === "youtube";
    if (selected === "youtube") {
      site.features.forEach((feature) => {
        $(feature.id).checked = state.features[feature.id];
      });
      Object.entries(GROUPS).forEach(([id, keys]) => {
        const values = keys.map((key) => state.features[key]);
        $(id).checked = values.every(Boolean);
        $(id).indeterminate = values.some(Boolean) && !values.every(Boolean);
      });
    } else {
      const container = $("socialControls");
      if (container.dataset.site !== selected) {
        container.replaceChildren();
        container.dataset.site = selected;
        site.features.forEach((feature) => {
          const row = document.createElement("label");
          row.className = "row";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.className = "uh-switch";
          input.id = "social-" + feature.id;
          input.dataset.feature = feature.id;
          const text = document.createElement("span");
          text.className = "feature-copy";
          const label = document.createElement("strong");
          label.textContent = feature.label;
          const desc = document.createElement("small");
          desc.textContent = feature.description;
          text.append(label, desc);
          row.append(text, input);
          container.append(row);
        });
      }
      site.features.forEach((feature) => {
        $("social-" + feature.id).checked = state.features[feature.id];
      });
    }
    theme();
  }
  function write(patch, message) {
    if (!loaded) return;
    status("Saving…");
    chrome.storage.local.set(patch, () => {
      if (chrome.runtime.lastError) {
        status("Could not save. " + chrome.runtime.lastError.message, true);
        render();
        return;
      }
      Object.assign(raw, patch);
      render();
      status(message || "Saved");
    });
  }
  function init() {
    UNHOOKED_SITES.forEach((site) => {
      const item = document.createElement("label"),
        input = document.createElement("input"),
        name = document.createElement("span"),
        meta = document.createElement("span");
      item.className = "site";
      input.type = "radio";
      input.name = "site";
      input.value = site.id;
      input.id = "site-" + site.id;
      name.className = "site-name";
      name.textContent = site.label;
      meta.className = "site-meta";
      meta.setAttribute("aria-hidden", "true");
      meta.id = "meta-" + site.id;
      item.append(input, name, meta);
      $("sitePicker").append(item);
    });
    document.querySelectorAll("[data-preset]").forEach((button) => {
      button.id = "preset-" + button.dataset.preset;
    });
    const controls = Array.from(document.querySelectorAll("input, button"));
    controls.forEach((el) => {
      el.disabled = true;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (loaded) {
        unhookedMergeChanges(raw, changes);
        render();
      } else
        Object.keys(changes).forEach((key) => {
          pending[key] = changes[key].newValue;
        });
    });
    chrome.storage.local.get(null, (data) => {
      if (chrome.runtime.lastError) {
        status("Could not load preferences. Reopen the popup to retry.", true);
        return;
      }
      raw = data || {};
      Object.keys(pending).forEach((key) => {
        if (pending[key] === undefined) delete raw[key];
        else raw[key] = pending[key];
      });
      loaded = true;
      controls.forEach((el) => {
        el.disabled = false;
      });
      render();
      status("Choices stay in this browser");
    });
    $("sitePicker").addEventListener("change", (e) => {
      if (e.target.name !== "site") return;
      selected = e.target.value;
      render();
    });
    $("siteEnabled").addEventListener("change", (e) =>
      write(unhookedFeaturePatch(selected, "enabled", e.target.checked))
    );
    $("btnPower").addEventListener("click", () =>
      write({
        [UNHOOKED_PAUSED_KEY]: !unhookedResolveSettings(raw, unhookedSiteById(selected)).paused
      })
    );
    $("btnResume").addEventListener("click", () =>
      write({ [UNHOOKED_PAUSED_KEY]: false }, "Resumed on every site")
    );
    $("btnTheme").addEventListener("click", () => {
      const current = THEMES.includes(raw[UNHOOKED_POPUP_THEME_KEY])
        ? raw[UNHOOKED_POPUP_THEME_KEY]
        : "system";
      write({ [UNHOOKED_POPUP_THEME_KEY]: THEMES[(THEMES.indexOf(current) + 1) % THEMES.length] });
    });
    unhookedSiteById("youtube").features.forEach((feature) => {
      const input = $(feature.id);
      const hint = document.createElement("small");
      hint.className = "feature-hint";
      hint.id = "hint-" + feature.id;
      hint.textContent = feature.description;
      input.closest("label").querySelector(".row-label").append(hint);
      input.setAttribute("aria-describedby", hint.id);
      $(feature.id).addEventListener("change", (e) =>
        write(unhookedFeaturePatch("youtube", feature.id, e.target.checked))
      );
    });
    Object.entries(GROUPS).forEach(([id, keys]) =>
      $(id).addEventListener("change", (e) => {
        const patch = {};
        keys.forEach((key) =>
          Object.assign(patch, unhookedFeaturePatch("youtube", key, e.target.checked))
        );
        write(patch);
      })
    );
    $("socialControls").addEventListener("change", (e) => {
      if (e.target.dataset.feature)
        write(unhookedFeaturePatch(selected, e.target.dataset.feature, e.target.checked));
    });
    document.querySelectorAll("[data-preset]").forEach((button) =>
      button.addEventListener("click", () => {
        write(
          unhookedPresetPatch(selected, button.dataset.preset),
          button.textContent + " applied to " + unhookedSiteById(selected).label
        );
      })
    );
    $("resetAll").addEventListener("click", () =>
      write(
        Object.assign(
          unhookedPresetPatch(selected, "clear"),
          unhookedFeaturePatch(selected, "enabled", true)
        ),
        unhookedSiteById(selected).label + " reset"
      )
    );
    document.querySelectorAll(".collapse-btn").forEach((button) =>
      button.addEventListener("click", () => {
        const group = button.closest(".group"),
          collapsed = group.classList.toggle("collapsed");
        button.setAttribute("aria-expanded", String(!collapsed));
        button.setAttribute("aria-label", collapsed ? "Expand section" : "Collapse section");
      })
    );
  }
  document.addEventListener("DOMContentLoaded", init);
})();
