(function () {
  "use strict";

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
  }

  function save() {
    chrome.storage.local.set({ [UNHOOKED_STORAGE_KEY]: readForm() });
  }

  function init() {
    chrome.storage.local.get([UNHOOKED_STORAGE_KEY], (data) => {
      writeForm(mergeUnhookedOptions(data[UNHOOKED_STORAGE_KEY]));
    });

    for (const k of UNHOOKED_OPTION_KEYS) {
      const el = document.getElementById(k);
      if (el) el.addEventListener("change", save);
    }

    document.getElementById("resetAll")?.addEventListener("click", () => {
      const fresh = defaultUnhookedOptions();
      writeForm(fresh);
      chrome.storage.local.set({ [UNHOOKED_STORAGE_KEY]: fresh });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
