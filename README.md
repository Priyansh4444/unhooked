# Unhooked

Open-source browser extension that hides distracting parts of **YouTube** (recommendations, Shorts, comments, end screens, and more). Inspired by the idea behind “distraction-free YouTube” extensions; **not affiliated with YouTube or Google**.

## Install (development)

### Chrome / Edge / Brave

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this folder (`unhooked-opensource`).

### Firefox

Firefox uses Manifest V3 with slightly different packaging. This repo currently ships a **Chromium MV3** manifest. For Firefox you can try [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) after adjusting `manifest.json` per Mozilla docs, or track a follow-up `manifest.firefox.json`.

## Usage

1. Pin the extension if the toolbar icon is hidden.
2. Open YouTube, click **Unhooked**, and enable the toggles you want.
3. Refresh the tab if something looks stale after a YouTube UI update.

## Permissions

- **storage** — save your toggle settings locally.
- **Host access** — `youtube.com`, `m.youtube.com`, and `youtube-nocookie.com` only, to inject hide rules on the site and in embeds.

## Limitations

- YouTube changes the DOM often; some selectors may need updates over time.
- **Autoplay off** clicks the in-player autonav control when it appears (best effort, not guaranteed on every layout).
- Hiding “home feed” targets the main grid on the home page; other tabs (Subscriptions, etc.) are unchanged.
- **Hide recommended / related column** hides only the related-videos UI (not the whole right column), so **live chat replay** can stay visible. If chat still does not appear, try turning off other sidebar-related options or refresh after a YouTube UI update.

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
