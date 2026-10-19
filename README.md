# Unhooked

Take the hooks out of the sites you use. Unhooked hides feeds and recommendations on **YouTube, X / Twitter, Reddit, Instagram, TikTok, Facebook, LinkedIn and Threads**, adds one-key **focus modes** for YouTube, X and Excalidraw, and turns links in **Twitch chat** into compact pills with previews. It runs on Chrome (and other Chromium browsers) and Firefox.

Unhooked is the successor to [Dissatisfied](https://github.com/Priyansh4444/Dissatisfied): its focus modes, shortcuts and Twitch link pills live here now, next to Unhooked's per-site controls. It started as a fork of [Havockeyan/UnhookYoutube-opensource](https://github.com/Havockeyan/UnhookYoutube-opensource) (MIT), an independent Unhook-style extension. It is **not** the commercial Unhook extension and is not affiliated with Unhook or any site it supports.

## Install

```sh
bun install
bun run build:chrome     # → dist/
bun run build:firefox    # → dist-firefox/
```

- **Chrome, Brave, Edge:** open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select `dist/`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and select any file in `dist-firefox/`.
- **Safari** builds (`bun run build:safari`) but has not been tested.

`bun run package` writes release ZIPs for every browser to `dist/unhooked-<browser>-<version>.zip`.

## Using it

Click the toolbar icon. The popup opens on the site of your current tab; the list on the left shows every site and how many of its controls are on.

**Hide controls** (the eight feed sites). Every control starts off.

- **Balanced** hides each site's feeds and recommendations, leaving stories and Reels controls off. On YouTube it hides Home, related videos, Shorts and end-screen suggestions, and turns autoplay off.
- **Focus** turns every control on; **Show all** turns them all off. The underlined preset is the one matching your current choices.
- The switch beside the site's name turns its controls off without forgetting them. **Reset site** turns every control off and the site back on.
- **Pick on page** is a magic wand for anything the controls don't cover. Point at the page: a red box shows exactly what a click would remove, with how many elements like it are on the page. Click to hide it; it stays hidden on that site from then on. **↑**/**↓** widen to the surrounding part or narrow back, **S** switches between this one and every element like it, **Z** undoes, **Esc** finishes. Wand removals are listed in the popup with a **Bring back** button. The wand also has a keyboard shortcut, **Alt+Shift+W** (⌥⇧W on a Mac) unless you change it: click the shortcut next to the wand button, press the keys you want (holding Ctrl, Alt or ⌘, so it can't fire while you type), or Backspace to turn it off. Press it on a supported site to start the wand, and again to stop.
- **Pick on a sketch** opens the picker: a dot-matrix sketch of the site's pages (YouTube's Home, Watch and Search, X's Home and Explore, and so on). Click a part to hide it on the real site, and click it again to bring it back. Dim parts, such as navigation and the video player, always stay. The picker and the switches change the same settings, so either one shows what the other did.
- **Hovering a switch shows it on the page.** In the popup or the picker, hovering any switch that changes the page outlines what it covers in the open site tab, the same way the wand does: single controls, groups such as YouTube's "Hide video sidebar", the site's main switch, **Focus this tab** and X's focus options, and wand removals. The popup's footer explains what the hovered control does.

**Focus modes** hide everything but the content you came for, in the current tab:

| Site       | What focus hides                                          | On the page    | From anywhere                 |
| ---------- | --------------------------------------------------------- | -------------- | ----------------------------- |
| YouTube    | Header and recommendations; the player fills the window   | `` ` ``        | Ctrl+Shift+Y (⌘⇧Y, Alt+Shift+Y on Firefox) |
| X          | Sidebar, header, chat and Grok drawers; centered timeline | Ctrl/⌘+B       | Ctrl+Shift+X (⌘⇧X, Alt+Shift+X on Firefox) |
| Excalidraw | Toolbars and menus, leaving the canvas                    | Ctrl/⌘+B       | —                             |

YouTube focus only applies on watch pages in theater mode: Home, search and Shorts are never touched, and leaving theater (`t`) or the video puts the page back. The badge on the toolbar icon says **ON** while focus is showing. **Remember focus** chooses between **This tab** (each tab starts without it) and **All tabs**. X's focus has its own timeline width, text size and what-to-hide settings. You can also switch focus from the popup, or change the browser shortcuts in your browser's extension shortcut settings.

**Twitch chat links** become pills with a short label (`YT · Me at the zoo`, `owner/repo`, `@user`), and hovering one opens a preview card. The popup can turn pills off, set the hover delay, and show the last 25 links posted in chat; that log stays on your device and can be cleared.

**Pause all** (bottom left) stops everything the extension does to pages, on every site, until you press **Resume**. Your choices are kept.

## Supported controls

| Site        | Controls                                                                                                                                                                                                                                                                  | Feed hiding applies on                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| YouTube     | Home, related sidebar, live chat, playlists, fundraiser, end-screen feed and cards, Shorts, comments and avatars, mixes, merch/tickets/offers, video buttons, channel row, description, notifications, unrelated search shelves, Explore/subscriptions/service links, autoplay, annotations | Desktop, mobile, and embedded players on any site |
| X / Twitter | Home timeline, Explore, sidebar trends and suggestions                                                                                                                                                                                                                    | `/home`; Explore and its tabs; sidebar everywhere               |
| Reddit      | Home, Popular and All feeds, recommendation panels                                                                                                                                                                                                                        | `/`, `/r/popular`, `/r/all` and their sort tabs; panels everywhere |
| Instagram   | Home posts, Explore grid, suggested accounts, stories tray, Reels feed                                                                                                                                                                                                    | `/`; Explore; the Reels tab (`/reels/…`)                        |
| TikTok      | For You and Following, Explore, suggested accounts, Live directory                                                                                                                                                                                                       | `/`, `/foryou`, `/following`; Explore; Live; suggestions everywhere |
| Facebook    | Home feed, right sidebar, stories tray, Reels viewer                                                                                                                                                                                                                     | `/`, `/home.php`; `/reel`, `/reels`                             |
| LinkedIn    | Home feed, news and recommendations                                                                                                                                                                                                                                       | `/`, `/feed`                                                    |
| Threads     | For You and Following, suggested accounts                                                                                                                                                                                                                                 | `/`, `/following`, `/for_you`                                   |

Profiles, direct posts and videos (including shared `/reel/…` links), search, messages, communities and job pages always stay visible, and so does any page the extension doesn't recognise. Hiding is CSS only: newly loaded posts are covered, nothing is removed from the page, and turning a control off restores it immediately.

## Privacy and permissions

Settings, focus state and the Twitch link log live in your browser's local extension storage. There is no account, server or analytics.

- **Hide controls and focus modes** never touch the network.
- **Twitch link pills** look up links that appear in chat, while pills are on: oEmbed endpoints on youtube.com, reddit.com, vimeo.com, open.spotify.com and publish.x.com, the GitHub API, and pages on github.com, imgur.com and lakebed.app. Thumbnails load from i.ytimg.com, and playing a YouTube preview loads youtube-nocookie.com's player. Nothing is sent to us. Turn pills off to stop these lookups.

Permissions: `storage` for settings; `tabs` for the per-tab badge, per-tab focus state and opening the popup on your current site; `scripting` to start the wand when you press **Pick on the page**, and to start focus mode in tabs that were open before the extension was installed or updated. Wand removals are CSS selectors stored with your other settings. Host access covers exactly the supported sites and the Twitch lookup hosts above, never all sites.

Settings are independent keys (`unhooked.site.x.hideHomeFeed`, for example), so changing one site never overwrites another. Saved options from the original YouTube extension (`unhookedOptions`) are still read; anything you change here takes precedence.

## Development

Requires [Bun](https://bun.sh).

```sh
bun run dev           # unminified Chrome build in dist/, rebuilt on every change
bun run check         # typecheck, lint, format
bun test              # unit tests
bun run e2e chrome    # end-to-end suites (CHROME_PATH=…; see CONTRIBUTING.md)
bun run e2e firefox   # the same suites in Firefox (FIREFOX_PATH=…)
bun scripts/live-login.ts && bun e2e/live.mjs   # every control against the real, signed-in sites
```

End-to-end tests load the real extension into a browser. Suites against stubbed pages (`smoke`, `social`, `youtube-controls`, `popup`, `picker`, `twitter`, `twitch`) need no network; `youtube*`, `excalidraw` and `twitch-cards` use the live sites, deliberately, because markup changes there are what break the extension. **Stubbed pages are not signed-in coverage:** Instagram, Facebook, LinkedIn, Threads and signed-in X layouts need checking by hand before claiming complete live support. If a layout changes and something stays visible, pause the site and report the URL and the element's selector.

The code map, how a site is added, and how the parts talk to each other are in [CONTRIBUTING.md](CONTRIBUTING.md); packaging for the stores is in [docs/PUBLISHING.md](docs/PUBLISHING.md).

## License

[MIT](LICENSE). Upstream copyright is retained. Code from Dissatisfied was released into the public domain by its author.
