# Unhooked

Open-source browser extension that hides distracting parts of **YouTube** (recommendations, Shorts, comments, end screens, and more). Inspired by the idea behind “distraction-free YouTube” extensions; **not affiliated with YouTube or Google**.

## Install (development)

### Chrome / Edge / Brave

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this folder (`unhooked-opensource`).

### Firefox

Firefox uses Manifest V3 with slightly different packaging. This repo currently ships a **Chromium MV3** manifest. For Firefox you can try [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) after adjusting `manifest.json` per Mozilla docs, or track a follow-up `manifest.firefox.json`.

### Publishing to Chrome, Brave, Firefox

**Brave** uses the same extensions as Chrome — publish once on the **Chrome Web Store**; Brave users install from there (there is no separate Brave store). Step-by-step for Chrome Web Store, AMO (Firefox), zips, icons, and privacy policy: see [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Usage

1. Pin the extension if the toolbar icon is hidden.
2. Open YouTube, click **Unhooked**, and enable the toggles you want.
3. Use the **power** control in the popup header to pause the extension entirely (no CSS hides applied).
4. **Theme** cycles system → dark → light (stored separately from YouTube options).
5. Refresh the tab if something looks stale after a YouTube UI update.

### Options (Unhook-style parity)

Grouped toggles match the commercial Unhook layout where possible: **video sidebar** (recommended, live chat, playlist, fundraiser), **end screen feed** vs **end screen cards**, **comments** (+ profile photos), **video info** (buttons, channel, description), **top header** (notifications), **inapt search** clutter, **explore/trending**, **more from YouTube** (guide links like Premium, Music, Studio), **subscriptions** (guide link only — not your subscriptions feed page), **mixes**, **merch/tickets/offers**, **autoplay**, **annotations/cards teaser**.

Edit the **Donate / Request feature / Support** URLs in [`popup/popup.html`](popup/popup.html) (`#linkDonate`, etc.) to point at your own links.

## Permissions

- **storage** — save your toggle settings locally.
- **Host access** — `youtube.com`, `m.youtube.com`, and `youtube-nocookie.com` only, to inject hide rules on the site and in embeds.

## Limitations

- YouTube changes the DOM often; some selectors may need updates over time.
- **Autoplay off** clicks the in-player autonav control when it appears (best effort, not guaranteed on every layout).
- Hiding “home feed” targets the main grid on the home page; other tabs are unchanged unless you enable a matching rule.
- **Hide subscriptions** removes the **Subscriptions** item from the **guide** only; it does not alter `/feed/subscriptions` content when you navigate there directly.
- **More from YouTube** hides common guide links (Premium, Music, Kids, Studio, etc.); adjust selectors in [`content/styles.css`](content/styles.css) if YouTube changes URLs.
- **Disable annotations** mostly targets legacy card teasers / branding; true in-video annotations are largely gone on YouTube.
- **Hide recommended / related column** hides only the related-videos UI (not the whole right column), so **live chat replay** can stay visible. If chat still does not appear, try turning off other sidebar-related options or refresh after a YouTube UI update.

## Automated tests

From the repo root (requires [Node.js](https://nodejs.org/) 18+):

```bash
npm install
npm test
npm run test:coverage   # optional; see note below
```

The suite includes **70** cases: options merge/migration, mapping ↔ option parity, `unhookedApplyOptionClasses` behavior (VM + mock DOM), `styles.css` ↔ mapping parity, `manifest.json` + on-disk assets, `popup.html` IDs, and content-script wiring.

**Coverage note:** shared scripts run inside `vm.runInContext` (same as in the browser), so V8 does not attribute line hits to those files — the coverage report is informational, not a full line metric.

CI runs `npm test` on every push and pull request (see `.github/workflows/ci.yml`).

## Manual QA checklist

- [ ] Watch page: related column, comments, description, channel row, actions.
- [ ] Live stream: chat hidden when enabled.
- [ ] Home: grid hidden when enabled.
- [ ] Shorts entry in guide and Shorts shelves on home/search.
- [ ] End screen overlay after video ends.
- [ ] `m.youtube.com` watch + home (mobile layout).
- [ ] Embedded player on another site (`youtube-nocookie` / `youtube` iframe).

## License

[MIT](LICENSE)
