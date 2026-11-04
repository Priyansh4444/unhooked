# Performance

What Unhooked costs a page, measured on the production build in Chromium against the same browser with no extension. Reproduce it with `CHROME_PATH=… bun scripts/perf.ts`. Figures are medians of 5 runs, or 3 on live YouTube, and vary by machine; compare them with each other rather than treating them as absolutes.

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

## How it stays light

- **Hiding is CSS, gated on classes on `<html>`.** No script walks the page looking for things to hide, and rules only apply for controls that are on.
- **Nothing runs on other sites.** Content scripts are listed for the supported sites only, and a site the wand has been allowed on gets one small script.
- **History isn't in `storage.local`.** Every content script reads and listens to it, so a year of browsing would reach every page and wake every tab each minute. It lives in IndexedDB, where only the background and the time page see it.
- **Rare things load when used.** The wand, film mode and the hover preview aren't on the page until you ask for them.

## Keeping it that way

Measure with `scripts/perf.ts` before adding anything that runs on every page. In particular:

- Be careful with `:has()` on or near `<html>`: the browser re-checks it as the page changes. Prefer an attribute the site already sets.
- Importing `shared/preferences.ts` brings the whole control registry into a bundle. `shared/switches.ts` is enough for "is this on?".
