# Contributing

Before opening a pull request, run `bun run check` (typecheck, lint, format) and `bun test`, and if you touched behaviour, the end-to-end suites (see [Tests](#tests)).

## Getting started

```sh
bun install
bun run dev            # unminified Chrome build in dist/, rebuilt on every change
```

Load `dist/` as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked). For Firefox, `bun run build:firefox` and load `dist-firefox/` from `about:debugging`. (Plain `bun build.ts` watches forever; use the `build:*` scripts for one-off builds.)

## Map of the code

```
src/
  background.ts            entry: install defaults, wires up focus + Twitch
  sites/
    hosts.ts               every site's hosts: manifests, registries and the popup read this
    registry.ts            hide controls: per-site features, route classifiers, generated CSS
    social/content.ts      hide controls for X, Reddit, Instagram, TikTok, Facebook, LinkedIn, Threads
    youtube/               content.ts (controls in every frame + focus in the top frame),
                           options.ts + controls.css (hide controls), focus.ts + focus.css
    x/ excalidraw/         focus modes: content.ts + style.css
    twitch/                chat link pills, hover cards, URL log
      links.ts               URL -> kind + pill label (pure, used by both sides)
      chat/                  page side: observer, pills, hover card
      background/            lookups (providers.ts), cache, URL log
  focus/                   shared machinery for focus modes
    sites.ts                 registry: storage keys + shortcut command per site
    background.ts            toggles, badges, shortcuts, per-tab/global state
    state.ts                 where "is focus on?" is stored
    runtime.ts               content-script side: startFocusSite(adapter)
  shared/
    ext-api.ts             the one browser API object (`browser` or `chrome`)
    settings.ts            storage keys and defaults
    preferences.ts         hide-control preferences: scalar keys, presets, pause, legacy fallback
    page-runtime.ts        content lifecycle for hide controls: storage sync, SPA routes, self-healing
    keys.ts                shortcut matching
  ui/
    shared/                theme.css (dark tokens, fonts, switch) and the bundled fonts with licences
    popup/                 the toolbar popup
    picker/                the click-to-hide page; sketches.ts maps each drawn part to a control
build.ts, build/manifest.ts   bundling, and the one source for every browser's manifest
e2e/                       end-to-end tests (Chrome + Firefox)
```

Each folder under `sites/` with a `content.ts` is bundled to `dist/sites/<name>/content.js`, and its stylesheets are attached by the manifest (`BUNDLES` in `build/manifest.ts`). Code talks to the browser only through `ext`, so nothing is polyfilled. Bundles are wrapped in their own scope: scripts injected into one page share an isolated world (on x.com the social and focus scripts both run), and minified top-level names would otherwise collide.

## How hide controls work

**The popup writes preferences; content scripts only read them.** Each preference is its own storage key (`unhooked.site.<site>.<feature>`), so writes never overwrite each other. `shared/preferences.ts` resolves them, including the global pause and the read-only fallback to the original YouTube extension's `unhookedOptions`.

- Rules are CSS gated on `<html>` state: `data-uh-site`, `data-uh-route` (from the site's route classifier) and one class per feature. New posts are covered by CSS; turning a control off restores the page without touching its nodes.
- Route classifiers are conservative. Feed rules apply only on routes a classifier recognises; anything else is `other`, which nothing hides. Sidebar-only rules use the `*` route and apply everywhere.
- `shared/page-runtime.ts` keeps the page in sync: a storage snapshot with early changes buffered, a cheap URL poll (isolated worlds can't see the page's `pushState`), back/forward-cache stop and start, and an observer on `<html>` that restores state when a site resets its classes or drops the injected stylesheet. Renders write only what changed, so the observer can't loop.
- YouTube keeps its long-standing class-per-option stylesheet (`controls.css`) and runs in every frame, so embedded players on other sites get the controls too.

### Add a hide-control site

1. `sites/hosts.ts`: add its hosts. 2. `sites/registry.ts`: add a route classifier and its features (conservative selectors; feed rules on `home`, sidebar-only rules on `*`). 3. Add the site to `SOCIAL_SITES` in `build/manifest.ts`. 4. Draw it in `ui/picker/sketches.ts`, from measurements (below); a unit test fails until every feature appears in a sketch. 5. Add a fixture to `e2e/social-fixtures.mjs`.

### Keep sketches and selectors true to the sites

Sites change their markup. `scripts/measure-layout.ts` loads a page and prints where each selector sits (in pixels of a 1440px window) and how many elements it matches:

```sh
CHROME_PATH=/path/to/chromium bun scripts/measure-layout.ts https://www.reddit.com/r/popular/ \
  'feed=shreddit-feed' 'sidebar=#right-sidebar-container'
```

Use it to place parts in `ui/picker/sketches.ts` (boxes are `[x, y, width, height]` in those pixels) and to catch hide selectors that match nothing. Mark a view `basis: "measured"` only when it was measured; pages behind a login are `"structure"`, and the picker says so.

## How focus modes work

**The background owns _whether_ focus mode is on (per tab or global); the content script owns _how_ the page looks.**

- `focus/runtime.ts`: `startFocusSite(adapter)` pulls the state, reacts to pushes, storage changes, the global pause and SPA navigation, and handles the keyboard shortcut. A site only implements `apply(enabled)`.
- Prefer CSS gated on a class (and on the site's own markers) over script cleanup. YouTube's `focus.css` is active only on `html.uh-focus-youtube` + `ytd-app[is-watch-page]` + `[theater]`, so navigating away or leaving theater needs no code.
- The popup toggles focus with an explicit `tabId`; content scripts use their sender tab.

### Add a focus site

1. `sites/hosts.ts`: add its hosts. 2. `focus/sites.ts`: add an entry (storage keys, optional manifest command) and its storage keys in `shared/settings.ts`. 3. `sites/<name>/content.ts` calling `startFocusSite`, plus `style.css`. 4. Add it to `BUNDLES` and `content_scripts` in `build/manifest.ts`, and to the popup's `RAIL` and `FOCUS_COPY`.

## How Twitch link pills work

`chat/observer.ts` watches the chat and turns links into pills (`chat/pill.ts`) and/or logs them; pills and the log are independent settings, and both stop while paused. Hovering a pill opens one shared card (`chat/hovercard.ts`, content in `chat/card-views.ts`). Details come from the background (`background/resolve.ts`), which asks a **provider** per site.

### Add a link provider

In `sites/twitch/background/providers.ts`: write `(link, base) => Promise<LinkMeta>`, register it in `PROVIDERS` by link kind, and add its host to `LOOKUP_HOSTS` in `sites/hosts.ts` (that becomes the manifests' host permissions). New kinds of link (label, icon) go in `links.ts` and `chat/icons.ts`. Update the network list in the README's privacy section.

## Tests

`bun test` runs the unit tests (preferences, registry and routes, YouTube options, the page runtime through a fake environment, Twitch link parsing, and a production build check).

`e2e/` drives a real browser with the built extension, the same tests in Chrome and Firefox. A special "e2e" build (`dist-e2e-<browser>`) is the real code plus a tiny bridge (`e2e/extension/`) so tests can read and write extension storage and badges; everything else goes through pages like a user would.

```sh
# one-time: browsers (Chrome must be a build that still allows --load-extension, e.g. Chromium)
bunx @puppeteer/browsers install chromium@latest
bunx @puppeteer/browsers install firefox@stable

CHROME_PATH=/path/to/chromium bun run e2e chrome
FIREFOX_PATH=/path/to/firefox bun run e2e firefox
bun e2e/run.mjs chrome social popup        # only some suites
MINIFY=1 bun e2e/run.mjs chrome            # the minified bundle, as shipped
```

Suites `smoke`, `social`, `youtube-controls`, `popup`, `picker`, `twitter` and `twitch` run against stubbed pages and need no network (`popup` and `picker` are Chrome only: Firefox won't let automation open extension pages). `twitch-cards`, `excalidraw` and the `youtube*` suites use the live sites deliberately, so they need network and can fail when a site changes.

## Releasing

Bump `version` in `package.json` (the manifests read it). `bun run package` builds every browser and writes reproducible ZIPs to `dist/`; `bun run package:firefox:review` includes the source for add-on review. See [docs/PUBLISHING.md](docs/PUBLISHING.md).
