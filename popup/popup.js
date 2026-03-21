(function () {
  "use strict";

  const KEYS_SIDEBAR = [
    "hideRelatedSidebar",
    "hideLiveChat",
    "hidePlaylistSidebar",
    "hideFundraiser"
  ];
  const KEYS_VIDEO_INFO = ["hideVideoActionsBar", "hideChannelRow", "hideDescription"];
  const KEYS_TOP_HEADER = ["hideNotificationBell"];

  const THEMES = ["system", "dark", "light"];

  function readForm() {
    const opts = defaultUnhookedOptions();
    for (const k of UNHOOKED_OPTION_KEYS) {
      const el = document.getElementById(k);
      if (el && el.type === "checkbox") opts[k] = el.checked;
    }
    return opts;
  }

  function writeForm(opts) {
    for (const k of UNHOOKED_OPTION_KEYS) {
      const el = document.getElementById(k);
      if (el && el.type === "checkbox") el.checked = !!opts[k];
    }
    syncBulkFromLeaves();
  }

  function save() {
    chrome.storage.local.set({ [UNHOOKED_STORAGE_KEY]: readForm() });
  }

  function syncBulkFromLeaves() {
    syncBulk("bulkVideoSidebar", KEYS_SIDEBAR);
    syncBulk("bulkVideoInfo", KEYS_VIDEO_INFO);
    syncBulk("bulkTopHeader", KEYS_TOP_HEADER);
  }

  function syncBulk(bulkId, keys) {
    const bulk = document.getElementById(bulkId);
    if (!bulk) return;
    const values = keys.map((k) => !!document.getElementById(k)?.checked);
    const all = values.length > 0 && values.every(Boolean);
    const none = values.every((v) => !v);
    bulk.checked = all;
    bulk.indeterminate = !all && !none;
  }

  function setKeys(keys, checked) {
    for (const k of keys) {
      const el = document.getElementById(k);
      if (el) el.checked = checked;
    }
    syncBulkFromLeaves();
    save();
  }

  function updatePowerUi() {
    const disabled = document.getElementById("extensionDisabled")?.checked ?? false;
    const btn = document.getElementById("btnPower");
    const bar = document.querySelector(".topbar");
    btn?.classList.toggle("off", disabled);
    btn?.setAttribute("aria-pressed", String(!disabled));
    bar?.classList.toggle("paused", disabled);
    btn?.setAttribute(
      "title",
      disabled ? "Extension off — click to enable" : "Extension on — click to pause"
    );
  }

  function applyPopupTheme(mode) {
    const root = document.documentElement;
    if (mode === "system") {
      delete root.dataset.popupTheme;
    } else {
      root.dataset.popupTheme = mode;
    }
    const btn = document.getElementById("btnTheme");
    if (btn) btn.title = `Theme: ${mode}`;
  }

  function init() {
    chrome.storage.local.get([UNHOOKED_STORAGE_KEY, UNHOOKED_POPUP_THEME_KEY], (data) => {
      writeForm(mergeUnhookedOptions(data[UNHOOKED_STORAGE_KEY]));
      updatePowerUi();

      const mode = THEMES.includes(data[UNHOOKED_POPUP_THEME_KEY])
        ? data[UNHOOKED_POPUP_THEME_KEY]
        : "system";
      applyPopupTheme(mode);
    });

    for (const k of UNHOOKED_OPTION_KEYS) {
      const el = document.getElementById(k);
      if (el && el.type === "checkbox") {
        el.addEventListener("change", () => {
          syncBulkFromLeaves();
          save();
          if (k === "extensionDisabled") updatePowerUi();
        });
      }
    }

    document.getElementById("bulkVideoSidebar")?.addEventListener("change", (e) => {
      if (e.target.indeterminate) return;
      setKeys(KEYS_SIDEBAR, e.target.checked);
    });

    document.getElementById("bulkVideoInfo")?.addEventListener("change", (e) => {
      if (e.target.indeterminate) return;
      setKeys(KEYS_VIDEO_INFO, e.target.checked);
    });

    document.getElementById("bulkTopHeader")?.addEventListener("change", (e) => {
      if (e.target.indeterminate) return;
      setKeys(KEYS_TOP_HEADER, e.target.checked);
    });

    document.getElementById("btnPower")?.addEventListener("click", () => {
      const cb = document.getElementById("extensionDisabled");
      if (!cb) return;
      cb.checked = !cb.checked;
      syncBulkFromLeaves();
      save();
      updatePowerUi();
    });

    document.getElementById("btnTheme")?.addEventListener("click", () => {
      chrome.storage.local.get([UNHOOKED_POPUP_THEME_KEY], (data) => {
        const cur = THEMES.includes(data[UNHOOKED_POPUP_THEME_KEY])
          ? data[UNHOOKED_POPUP_THEME_KEY]
          : "system";
        const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
        chrome.storage.local.set({ [UNHOOKED_POPUP_THEME_KEY]: next }, () => {
          applyPopupTheme(next);
        });
      });
    });

    document.querySelectorAll(".collapse-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.closest(".group");
        if (!g) return;
        g.classList.toggle("collapsed");
        const collapsed = g.classList.contains("collapsed");
        btn.setAttribute("aria-expanded", String(!collapsed));
        btn.textContent = collapsed ? "+" : "—";
      });
    });

    document.getElementById("resetAll")?.addEventListener("click", () => {
      const fresh = defaultUnhookedOptions();
      writeForm(fresh);
      chrome.storage.local.set({ [UNHOOKED_STORAGE_KEY]: fresh });
      updatePowerUi();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
