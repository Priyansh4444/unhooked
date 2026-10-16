# Packaging and publishing

Unhooked targets Chromium Manifest V3. Chrome, Brave, and Edge can load the repository directly through **Load unpacked**. Firefox has not been validated for this fork.

## Produce a reviewable package

From the repository root, with Node.js 22.12+:

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
npm run format:check
npm run package
```

The packaging script validates manifest assets and produces a minimal release directory and zip under `dist/`. The zip root contains `manifest.json`, extension scripts/styles, icons, and the MIT license; it excludes tests, dependencies, development scripts, and repository metadata. Extract the zip and load its directory through `chrome://extensions` to verify the actual package.

To run the same browser journeys against the packaged directory:

```sh
UNHOOKED_EXTENSION_PATH=dist/unhooked npm run test:browser
```

## Validate before submitting

Check each supported platform in a signed-in browser, including profiles, direct content, search, messages, dynamically inserted cards, SPA navigation, pause/resume, per-site disable, presets, popup keyboard navigation, theme, and persistence. Representative automated fixtures do not establish current live login coverage. Test YouTube desktop, mobile, live chat, playlists, end screens, and embeds separately.

The release should identify itself as an independent Unhook-style extension, preserve upstream MIT attribution, and avoid implying affiliation with the commercial Unhook product or supported social platforms. Use screenshots of the actual extension and describe the specific controls available on each site.

## Store submission

Use the relevant developer dashboard for Chrome Web Store or Microsoft Edge Add-ons. Brave users can install the Chrome listing. Prepare a listing description, icons/screenshots, support URL, and a public privacy-policy URL. Follow the current dashboard requirements and platform review process; this repository does not submit or publish automatically.

The extension's single purpose is to let people hide distracting interface elements on the listed social websites. Permission explanations should match the actual manifest: `storage` saves local settings; the exact supported hosts allow content scripts to apply local CSS and the YouTube autoplay control. The extension has no remote service, telemetry, or account, and does not send browsing data elsewhere. Keep those statements accurate if future behavior changes.

For an update, bump the manifest version, rerun validation and packaging, manually inspect the generated package, and upload it through the store dashboard. Document platform selector changes and any new permissions in release notes.
