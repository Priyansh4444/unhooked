# Social controls

This fork starts from Havockeyan/UnhookYoutube-opensource at `fec15f3`, an MIT-licensed independent Unhook-style extension. It is not a fork of the commercial Unhook product.

The existing YouTube engine and CSS remain in place. A shared site registry owns the other platforms' exact hosts, route classifiers, feature descriptions, and scoped selectors. The popup renders those definitions; one social content controller applies them. Unknown routes leave primary content visible.

Settings use independent boolean storage keys. A toggle writes one key, and a preset writes only the selected site's feature keys. Content scripts never write preferences. Missing YouTube keys fall back to the original `unhookedOptions` object, preserving existing choices and legacy migrations; explicit new `false` values take precedence. Fresh installs start with hiding off and offer explicit presets.

CSS hides descendants through extension-owned root classes and route attributes. Disabling a feature, pausing globally, or changing routes removes its effect without removing nodes or overwriting page styles. CSS automatically covers newly rendered matching elements. Sidebar-only rules use the `*` route and apply everywhere; rules that cover primary content stay scoped to known routes.

Both content scripts share `shared/runtime.js`, which owns the storage snapshot, buffered early changes, bfcache stop/start, and SPA route checks. A lightweight URL poll observes navigation across isolated script worlds. A `MutationObserver` on `<html>` (attributes and direct children only) re-renders when a site resets root classes or drops the injected stylesheet. Renders only write changed values, so the observer cannot loop. YouTube autoplay polling stops when its setting or site is disabled or globally paused.

## Design synthesis

Three independent sketches compared a shared registry, executable per-site adapters, and optional host grants with dynamic registration. A fresh cross-judge scored preservation, module shape, route safety, settings/permissions, and verification. Both the parent and judge selected the registry. Its independent storage keys remove unrelated preference overwrites, while its declarative rules avoid duplicate lifecycle code. Adapter-style opt-in defaults, precise labels, and browser visibility checks were grafted into the selected design.

Separate adapters remain appropriate if a future feature needs imperative behavior. Optional grants were deferred because no requirement called for them, and dynamic registration would add worker, revocation, and open-tab injection races. Static content scripts name only supported hosts; there is no universal site permission, remote rule execution, or backend.

## Verification boundary

Unit tests cover settings compatibility, preset isolation, host matching, and route classification. A real unpacked Chromium extension exercises popup writes, storage change events, generated CSS, dynamic DOM, SPA routes, pause, and site disable against representative fixtures. Fixtures prove these recorded layouts, not every current login-only production layout. Platform DOM changes require ongoing selector maintenance.
