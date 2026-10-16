/** Pure scalar preferences; only popup code writes storage. */
(function (root) {
  "use strict";
  root.UNHOOKED_PAUSED_KEY = "unhooked.paused";
  root.unhookedPreferenceKey = function (siteId, featureId) {
    var site = root.unhookedSiteById(siteId);
    if (!site || (featureId !== "enabled" && !site.features.some(function (f) { return f.id === featureId; }))) throw new Error("Unknown preference");
    return "unhooked.site." + siteId + "." + featureId;
  };
  function bool(value, fallback) { return typeof value === "boolean" ? value : fallback; }
  root.unhookedResolveSettings = function (raw, site) {
    raw = raw || {};
    var legacy = root.mergeUnhookedOptions(raw[root.UNHOOKED_STORAGE_KEY]);
    var features = {};
    site.features.forEach(function (f) {
      features[f.id] = bool(raw[root.unhookedPreferenceKey(site.id, f.id)], site.id === "youtube" ? legacy[f.id] : false);
    });
    return { paused: bool(raw[root.UNHOOKED_PAUSED_KEY], legacy.extensionDisabled),
      enabled: bool(raw[root.unhookedPreferenceKey(site.id, "enabled")], true), features: features };
  };
  root.unhookedYouTubeOptions = function (raw) {
    var state = root.unhookedResolveSettings(raw, root.unhookedSiteById("youtube"));
    return Object.assign({ extensionDisabled: state.paused || !state.enabled }, state.features);
  };
  root.unhookedFeaturePatch = function (siteId, featureId, value) {
    if (typeof value !== "boolean") throw new TypeError("Preference must be boolean");
    return { [root.unhookedPreferenceKey(siteId, featureId)]: value };
  };
  root.unhookedPresetPatch = function (siteId, preset) {
    var site = root.unhookedSiteById(siteId);
    if (!site || !["balanced", "focused", "clear"].includes(preset)) throw new Error("Unknown preset");
    var patch = {};
    site.features.forEach(function (f) {
      patch[root.unhookedPreferenceKey(siteId, f.id)] = preset === "focused" || (preset === "balanced" && f.balanced);
    });
    return patch;
  };
  root.unhookedMergeChanges = function (raw, changes) {
    Object.keys(changes).forEach(function (key) {
      if (typeof changes[key].newValue === "undefined") delete raw[key];
      else raw[key] = changes[key].newValue;
    });
    return raw;
  };
})(globalThis);
