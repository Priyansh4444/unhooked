# Packaging and publishing

Unhooked ships to Chromium browsers (Manifest V3 service worker) and Firefox (Manifest V3 event page). A Safari (Manifest V2) build is generated but untested.

## Produce the packages

```sh
bun install
bun run check
bun test
CHROME_PATH=/path/to/chromium MINIFY=1 bun run e2e chrome
FIREFOX_PATH=/path/to/firefox MINIFY=1 bun run e2e firefox
bun run package
```

`bun run package` writes `dist/chrome/`, `dist/firefox/`, `dist/safari/` and a reproducible ZIP for each (`dist/unhooked-<browser>-<version>.zip`: sorted entries, fixed timestamps). Each contains only the manifest, bundled scripts and styles, the popup and icons. Load the unpacked directory once before uploading to check the actual package. For Firefox review, `bun run package:firefox:review` adds the source tree.

## Validate before submitting

Check each supported site in a signed-in browser: home, profiles, direct posts, search, messages, newly loaded posts, SPA navigation, pause and resume, turning a site off, presets, and popup keyboard navigation. Check focus mode on YouTube (watch page, theater, leaving theater, Home), X and Excalidraw, with both **This tab** and **All tabs** memory, and the badge. Check Twitch pills and preview cards in a live chat. Stubbed e2e pages do not establish signed-in coverage.

The listing should present Unhooked as an independent Unhook-style extension, keep the upstream MIT attribution, and not imply affiliation with the commercial Unhook product or any supported site. Use screenshots of the real popup.

## Store submission

Use the Chrome Web Store, Microsoft Edge Add-ons, or addons.mozilla.org dashboards (Brave installs from the Chrome listing). Prepare a description, screenshots, a support URL and a public privacy policy; this repository does not publish automatically.

Permission justifications must match the manifest:

- `storage`: settings, focus state and the Twitch link log, stored locally.
- `tabs`: the per-tab badge, per-tab focus state, and opening the popup on the current site.
- `scripting`: starting focus mode in tabs opened before the extension was installed or updated.
- Host access: exactly the supported sites (to apply local CSS and focus mode) and the Twitch link lookup hosts listed in the README. The lookups only run for links in Twitch chat while link pills are on.

There is no remote service, telemetry or account. Keep these statements accurate if behaviour changes, and list new permissions or lookup hosts in the release notes.
