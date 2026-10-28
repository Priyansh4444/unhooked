import { LOOKUP_HOSTS, SITE_HOSTS, type SiteId } from "../src/sites/hosts.ts";
import pkg from "../package.json" with { type: "json" };

export type Target = "chrome" | "firefox" | "safari";

/** Sites whose hide controls run through the shared social content script. */
export const SOCIAL_SITES = [
  "x",
  "reddit",
  "instagram",
  "tiktok",
  "facebook",
  "linkedin",
  "threads",
] as const satisfies readonly SiteId[];

/** Content bundles (`src/sites/<name>/content.ts`) and the stylesheets each one ships. */
export const BUNDLES = {
  youtube: ["controls.css", "focus.css"],
  x: ["style.css"],
  social: [],
  excalidraw: ["style.css"],
  twitch: ["style.css"],
  // Wand removals and hover previews, on every supported site.
  custom: [],
  // Injected by the popup on demand, never listed in content_scripts.
  wand: [],
} as const;

export const ICONS = {
  "16": "icon-16.png",
  "32": "icon-32.png",
  "48": "icon-48.png",
  "128": "icon-128.png",
};

/**
 * The one description of the extension's manifest. Chrome (MV3 service worker), Firefox (MV3
 * event page) and Safari (MV2) differ in a handful of fields; those are the `target` branches.
 */
export function createManifest(target: Target, extraContentScripts: object[] = []) {
  const firefox = target === "firefox";
  const mv2 = target === "safari";

  const hostPatterns = [...Object.values(SITE_HOSTS).flat(), ...LOOKUP_HOSTS].map(
    (host) => `${firefox ? "*" : "https"}://${host}/*`,
  );
  const patterns = (...sites: SiteId[]) =>
    sites.flatMap((site) => SITE_HOSTS[site].map((host) => `*://${host}/*`));

  // CSS comes from the manifest so it applies before first paint and needs no script cleanup.
  const contentScript = (bundle: keyof typeof BUNDLES, matches: string[], run_at: string) => ({
    matches,
    ...(BUNDLES[bundle].length && { css: BUNDLES[bundle].map((css) => `sites/${bundle}/${css}`) }),
    js: [`sites/${bundle}/content.js`],
    run_at,
  });

  const shortcut = (key: string) =>
    firefox ? { default: `Alt+${key}` } : { default: `Ctrl+${key}`, mac: `Command+${key}` };

  const action = {
    default_icon: ICONS,
    default_title: "Unhooked",
    default_popup: "ui/popup/index.html",
  };

  return {
    manifest_version: mv2 ? 2 : 3,
    name: "Unhooked",
    description:
      "Hide feeds on YouTube, X, Reddit and more; focus modes for YouTube, X, Excalidraw; Twitch chat link pills.",
    version: pkg.version,
    author: "Pronsh",
    icons: ICONS,
    homepage_url: "https://github.com/Priyansh4444/unhooked",
    ...(firefox && {
      browser_specific_settings: {
        gecko: { id: "unhooked@pronsh.dev", strict_min_version: "112.0" },
      },
    }),
    permissions: mv2
      ? ["storage", "tabs", ...hostPatterns]
      : ["scripting", "storage", "tabs", ...(firefox ? ["activeTab"] : [])],
    ...(!mv2 && { host_permissions: hostPatterns }),
    // Any other site, one at a time and only when asked: the wand on a page Unhooked doesn't cover.
    ...(mv2 ? { optional_permissions: ["*://*/*"] } : { optional_host_permissions: ["*://*/*"] }),
    background: mv2
      ? { scripts: ["background.js"], persistent: false }
      : firefox
        ? { scripts: ["background.js"] }
        : { service_worker: "background.js" },
    [mv2 ? "browser_action" : "action"]: action,
    commands: {
      "toggle-youtube-style": {
        suggested_key: shortcut("Shift+Y"),
        description: "Toggle YouTube focus mode",
      },
      "toggle-twitter-style": {
        suggested_key: shortcut("Shift+X"),
        description: "Toggle X focus mode",
      },
    },
    content_scripts: [
      // Every frame, so embedded players on other sites get the YouTube controls too.
      { ...contentScript("youtube", patterns("youtube"), "document_start"), all_frames: true },
      contentScript("social", patterns(...SOCIAL_SITES), "document_start"),
      contentScript("x", patterns("x"), "document_end"),
      contentScript("excalidraw", patterns("excalidraw"), "document_start"),
      contentScript("twitch", patterns("twitch"), "document_idle"),
      contentScript("custom", patterns(...(Object.keys(SITE_HOSTS) as SiteId[])), "document_start"),
      ...extraContentScripts,
    ],
  };
}
