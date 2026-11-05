# Performance

What Unhooked costs a page, measured on the production build in Chromium against the same browser with no extension. Figures are medians of 5 runs, or 3 on live YouTube, and vary by machine; compare them with each other rather than treating them as absolutes. The tables below come from an earlier version of the bench, so reproduce them with `CHROME_PATH=… bun run bench --live` rather than expecting the same numbers.

## Results

| Page, every control on | Measure | Without | With |
| :-- | :-- | --: | --: |
| Unrelated site | Script at load | 0 ms | 0 ms |
| | Style work at load | 0.4 ms | 0.4 ms |
| Busy X-like timeline (80 posts, 20 changing a second, for 8 s) | Script at load | 0 ms | 3 ms |
| | Script while busy | 58 ms | 106 ms |
| | Style work while busy | 28 ms | 70 ms |
| | Memory | 1.2 MB | 2.0 MB |
| Live YouTube watch page | Style work at load | 225 ms | 462 ms |

| Twitch chat, 20 messages a second, 1 in 3 with a link, on a busy page, for 10 s | Script | 105 ms | 172 ms |
| The same page with no chat | Script | 94 ms | 90 ms |

On the busy timeline, the extra 47 ms of script over 8 seconds is about 0.6% of the time.

YouTube's style work depends on what's turned on, because hiding most of a page makes the browser lay out a very different one:

| YouTube controls on | Style work at load |
| :-- | --: |
| No extension | 225 ms |
| **Balanced** | **221 ms** |
| Shorts only | 239 ms |
| Guide links only | 231 ms |
| Search results, mixes and merch | 285 ms |
| Every control | 390 to 460 ms |

Live YouTube's own numbers move by more than Balanced's difference between runs, so Balanced has no measurable cost. Script time and memory on live YouTube vary more from run to run than the extension could account for, so they aren't reported.

The background uses about 1 MB while awake. It wakes once a minute only while something is being counted, and otherwise sleeps until the browser reports an event.

## What this review changed

| Finding | Before | After |
| :-- | --: | --: |
| A `:has()` rule on the root, to give a video the width of an empty sidebar | About 400 ms of style work per YouTube page | None measurable: it reads the attributes YouTube already sets |
| Every script polled the URL 4 times a second, 12 wakeups a second on X | Polling everywhere | Only in browsers without the Navigation API |
| X's script carried the control registry and film mode | 33 KB | 7 KB; film mode loads when first used |
| Excalidraw's script carried the control registry | 20 KB | 5 KB |
| The script on every supported site carried the hover preview and YouTube's stylesheet as text | 42 KB | 23 KB; the preview loads on first hover |
| The time tracker's heartbeat ran all the time | Every minute | Only while something is being counted |
| Twitch's chat script watched every change to the whole page, and searched it on each one until it found a chat | 121 ms of script per 10 s on a page without chat | None measurable: it checks on a timer |
| Twitch's hover card blurred what was behind it, repainting with the stream under it on every frame | A blur on every video frame | A solid card |

## How small it is

| | Before | After |
| :-- | --: | --: |
| Chrome package | 244 KB | 200 KB |
| Script on X | 7.2 KB | 5.9 KB |
| Fonts, with their licences | 68 KB | 38 KB |

- **A second minifier.** Terser runs over Bun's output and takes about 9% off the scripts, and most off the small ones that run on every page.
- **Fonts hold only what the UI writes.** They're the part of the package that doesn't compress. The handwriting font is only used for a few lowercase notes, so that's all it holds.
- **One copy of each icon.** The pages use the icons the manifest ships.

## How it stays light

- **Hiding is CSS, gated on classes on `<html>`.** No script walks the page looking for things to hide, and rules only apply for controls that are on.
- **Nothing runs on other sites.** Content scripts are listed for the supported sites only, and a site the wand has been allowed on gets one small script.
- **History isn't in `storage.local`.** Every content script reads and listens to it, so a year of browsing would reach every page and wake every tab each minute. It lives in IndexedDB, where only the background and the time page see it.
- **Rare things load when used.** The wand, film mode and the hover preview aren't on the page until you ask for them.

## Keeping it that way

CI stops and asks for attention when something grows 10% past where it was. Records only move when someone updates them, so small changes add up towards that limit instead of each getting a free pass.

**Size.** `bun run size` compares every script, stylesheet, page, font and package with `build/sizes.json`, and every run lists what changed. It fails past 10%, or 512 bytes for a very small file. `bun run size:update` records the new size in a diff that shows what it cost.

**What runs.** `bun scripts/bench.ts --check` compares how many times our functions ran, and the nodes and listeners we added, with `build/bench.json`, on pages with a fixed amount of change. These repeat exactly from run to run on one browser, so they catch slow creep. They fail past 10%, or 5 for a very small count, and `bun run bench:update` records them. On an unrelated site our code must do nothing at all, and no record changes that.

**Time.** A pull request is timed against its base with `bun scripts/bench.ts --compare <ref>`, taking turns on the same machine, because times from different machines mean nothing. It fails if, measured twice, a page takes 10% more work and at least 15 ms, or 10% more style work and at least 5 ms. Identical builds differ by about 6 ms in total. Style work has its own limit because a costly selector can be lost in the noise of a page's layout. One page runs with its controls off for the same reason: every control on hides most of a page, and the browser does no style work for what's hidden.

A deliberate slow script and a deliberate costly `:has()` rule both fail these checks. Times are compared only between one commit and the next, so a run of small slowdowns that each stay under the limits gets through on time alone; the recorded counts catch the ones that run more code. The bench runs in Chromium only.

Measure with `bun run bench` before adding anything that runs on every page. In particular:

- Be careful with `:has()` on or near `<html>`: the browser re-checks it as the page changes. Prefer an attribute the site already sets.
- Importing `shared/preferences.ts` brings the whole control registry into a bundle. `shared/switches.ts` is enough for "is this on?".
