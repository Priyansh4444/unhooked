# Unhooked

Choose which distractions to hide on **YouTube, X / Twitter, Reddit, Instagram, TikTok, Facebook, LinkedIn, and Threads**. This Chromium Manifest V3 extension has per-site switches, explicit presets, a global pause button, and local preferences.

This project is a fork of [Havockeyan/UnhookYoutube-opensource](https://github.com/Havockeyan/UnhookYoutube-opensource), an MIT-licensed independent alternative inspired by Unhook, at commit `fec15f3`. It is **not a fork of the commercial Unhook extension** and is not affiliated with Unhook or any supported platform. This fork lives at [Priyansh4444/unhooked](https://github.com/Priyansh4444/unhooked). See [LICENSE](LICENSE) and [the architecture notes](docs/ARCHITECTURE.md).

## Install locally

1. Clone or download this repository.
2. Open `chrome://extensions`, `brave://extensions`, or `edge://extensions`.
3. Enable **Developer mode**, select **Load unpacked**, and choose the repository folder containing `manifest.json`.
4. Pin Unhooked in your browser toolbar. Reload social-media tabs that were already open before installation or an extension update.

A ready-to-load release directory and zip can be generated with `npm run package`. Load the generated extension directory or extract the zip first. No build is required to load this repository. Firefox has not been validated and is not a supported release target yet.

## Choose your controls

Open the toolbar popup, choose a site, and turn on the controls you want. **Every hide starts off** on a fresh install. The site picker works regardless of the current tab.

- **Balanced** turns on the site's feed and recommendation controls, leaving optional stories/Reels controls off. On YouTube it hides Home, related videos, Shorts, and end-screen suggestions, and disables autoplay.
- **Focus** turns every available control on for that site.
- **Show everything** and **Reset this site** turn that site's controls off.
- **Enable controls on this site** suspends one site's controls without losing the selected options.
- The header power button **pauses all sites**. Resume restores the chosen controls.
- The theme button cycles system, dark, and light.

Presets and reset change only the selected site's feature preferences. They never change global pause, site enable, theme, or another site's choices. The footer reports successful saves and storage errors.

## Supported controls and routes

| Site | Controls | Feed suppression applies to |
| --- | --- | --- |
| YouTube | All original detailed controls: Home, related sidebar, live chat, playlists, fundraiser, end-screen feed/cards, Shorts, comments/avatars, mixes, merch/tickets/offers, player actions, channel row, description, notifications, unrelated search shelves, Explore/subscriptions/service links, autoplay, annotations | Existing desktop/mobile/embed YouTube engine |
| X / Twitter | Home timeline, Explore timeline, sidebar trends and suggested accounts | `/`, `/home`; Explore control on `/explore` |
| Reddit | Home/Popular/All feed, recommendation panels | `/`, `/r/popular`, `/r/all` |
| Instagram | Home posts, Explore grid, suggested accounts, stories tray, Reels viewer | `/`; separate Explore and Reels routes |
| TikTok | For You/Following feed, Explore feed, suggested accounts, Live directory | `/`, `/foryou`, `/following`; separate `/explore` and `/live` |
| Facebook | Home feed, right sidebar, stories tray, Reels viewer | `/`, `/home.php`; separate `/reel` and `/reels` |
| LinkedIn | Home feed, sidebar news/recommendations | `/`, `/feed` |
| Threads | For You/Following feed, suggested accounts | `/`, `/following`, `/for_you` |

New social feed controls preserve profiles, direct posts/videos, search, messages, communities/groups, and job pages. Ancillary panels may be hidden on explicitly supported routes. Unknown routes leave primary content visible. Both `threads.com` and legacy `threads.net` are included, along with X's `twitter.com` alias and Reddit's `old`, `new`, and `sh` hosts. Exact hosts are listed in [manifest.json](manifest.json); arbitrary subdomains and mobile Facebook are not included.

YouTube's established rules are preserved, including mobile and privacy-enhanced embeds. Its **Hide subscriptions** option hides the guide link, not the subscriptions page. Autoplay uses the player's own toggle on a best-effort basis; disabling the option or pausing stops polling immediately and never turns autoplay back on automatically. Player layouts may differ.

## Privacy and settings

Preferences live in `chrome.storage.local` on your device. The extension has no account, server, analytics, remote selectors, or network requests. It requests `storage` plus access to the explicitly supported website hosts to apply its content scripts. It does not request all-site access, browsing history, tabs, cookies, or a background worker.

Preferences use independent boolean storage keys (`unhooked.site.x.hideHomeFeed`, for example), so a toggle cannot overwrite another site's settings. Existing YouTube `unhookedOptions` values and aliases are read as fallbacks. Explicit new values, including `false`, take precedence. This migration is read-only: downgrading to the old extension does not include edits made through the new scalar preferences.

## Development and verification

Requires Node.js 22.12+.

```sh
npm install
npm test
npm run test:browser
npm run format:check
npm run package
```

Unit tests cover legacy migration, boolean validation, exact host ownership, route protection, preset isolation, storage races, lifecycle cleanup, autoplay cancellation, and manifest/asset parity. Browser tests load the actual unpacked extension in Chromium and exercise the popup, real storage events, generated CSS, dynamic content, SPA routes, and reversible pause/site switches against representative fixtures.

**Fixture coverage is not live login coverage.** Platform layouts change frequently; representative HTML fixtures prove the layouts recorded in the tests, not every current production variant or localization. Instagram, Facebook, LinkedIn, Threads, and other login-dependent layouts require verification in a signed-in browser before claiming complete live support. An unsupported or changed selector can leave content visible; pause or disable the site if a layout behaves unexpectedly. Report the URL, platform layout, and relevant DOM selector when a rule needs maintenance.

Run manual checks on each signed-in platform for home → profile → direct post → search → messages → home, plus discovery routes. Check newly loaded feed cards, pause/resume, per-site disable, and keyboard access to popup controls. YouTube also needs watch/live/playlist/end-screen/mobile/embed checks. Publication steps are in [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Extending a platform

Add exact hosts, conservative route classification, feature labels/descriptions, and scoped CSS selectors to [shared/sites.js](shared/sites.js), then update manifest matches and fixture coverage. A single reversible controller handles all social platforms; it never removes site DOM nodes or writes preferences. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[MIT](LICENSE). Original copyright and license are retained.
