# Publishing Unhooked

This extension is **Manifest V3** and Chromium-first. **Brave** is Chromium-based: users install from the **Chrome Web Store** (or load unpacked). There is **no separate Brave store**.

---

## Before you ship

1. **Version** — bump `"version"` in [`manifest.json`](../manifest.json) (semver: `major.minor.build`).
2. **Icons** — the store expects icons; add `icons` in `manifest.json` (e.g. 16, 48, 128 PNG). Without them, listing review may still pass but the UI looks broken.
3. **Privacy policy** — host permissions on YouTube usually require a **public privacy policy URL** (what data you collect: here, only local `storage` for settings — state that clearly).
4. **Zip the extension** — zip **the extension root** (files like `manifest.json`, `popup/`, `content/`, `shared/` at the **top level** of the zip, not a nested parent folder).

```bash
# From repo root (adjust paths if needed)
zip -r unhooked.zip manifest.json popup content shared LICENSE
```

5. **QA** — run through the manual checklist in the main [README](../README.md).

---

## Google Chrome (Chrome Web Store)

1. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole/) (one-time registration fee).
2. **New item** → upload `unhooked.zip`.
3. Fill in **store listing**: description, screenshots (1280×800 or 640×400), category, language.
4. **Privacy** tab: link your privacy policy; explain **single purpose** (modify YouTube UI) and **permission justification** (`storage`, `host_permissions` for youtube.com / m.youtube.com / youtube-nocookie.com).
5. Submit for review. Review can take from hours to several days.

Official: [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish).

---

## Brave

- **Same listing as Chrome** — Brave can install extensions from the [Chrome Web Store](https://chrome.google.com/webstore). You do **not** publish twice for Brave.
- Users who want your exact build can still use **Load unpacked** in `brave://extensions`.

---

## Mozilla Firefox (Add-ons / AMO)

Firefox supports MV3, but rules and manifest details can differ from Chrome (e.g. `browser_specific_settings.gecko`, `strict_min_version`, optional `background` service worker differences).

1. Create [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/) account.
2. **Submit a New Add-on** → upload a zip of the extension.
3. If the reviewer flags Chrome-only APIs, add a `browser_specific_settings` block and test with `web-ext` (see [Extension Workshop](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)).
4. Source code: if you minify or bundle, you may need to attach readable source per [Mozilla policy](https://extensionworkshop.com/documentation/publish/source-code-submission/).

This repo ships one `manifest.json`; you may need a small Firefox-specific manifest tweak after first review — plan a follow-up commit if AMO requests changes.

Official: [Distributing your extension](https://extensionworkshop.com/documentation/publish/).

---

## Microsoft Edge (optional)

Edge uses the same MV3 model. You can publish to [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) with the **same zip** (sometimes after minor manifest notes). Many developers ship Chrome first, then Edge.

---

## Ongoing updates

1. Bump `manifest.json` version.
2. Re-zip and upload a **new package** in each store’s dashboard.
3. Keep the privacy policy and permission text in sync if behavior changes.
