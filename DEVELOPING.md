# Developing

No build step, no assets, no network. All geometry is generated in JavaScript at
boot and all art is palette plus shader maths, so the whole thing is about
**50 KB gzipped** including the WebGL library.

    npm run serve      # http://localhost:8000
    npm test

A static server is required because ES modules will not load over `file://`.

> The service worker will happily serve you a stale copy of your own edits.
> DevTools → Application → Service Workers → *Bypass for network*, or from the
> console:
>
>     for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
>     for (const k of await caches.keys()) await caches.delete(k);

## Deploying

The game is static files served from the repository root — GitHub Pages needs no
workflow, no build, no configuration beyond being switched on.

**Bump `VERSION` in `sw.js` every time you deploy.** There is no build step
hashing filenames, so that constant is the only signal an installed copy has that
it is stale. Forget it and returning players keep the old build indefinitely. No
test can catch this one.

## Layout

    index.html            shell + Chrome's error page, inline CSS
    sw.js                 service worker — precache, offline
    manifest.webmanifest  PWA metadata
    icons/                generated from the 3D model
    vendor/ogl.min.js     committed WebGL bundle (ogl, 14 KB gzipped)
    src/sim/              headless game logic — no imports out
    src/render/           ogl setup, procedural geometry, shaders, biomes
    src/audio.js          WebAudio synthesis, no files
    src/replay.js         ghost recording, share codes, URL parsing
    reference/            Chromium's real error page, for the layout diff
    tools/                vendoring, dev server, layout diff, icons

## How it holds together

The two things that could break are handled separately, because they need
different guarantees:

- **Track generation is deterministic** — a pure integer hash of
  `(seed, chunkIndex)`. No floats, no `Math.sin`; ECMAScript does not require
  correctly-rounded transcendentals, so those differ across engines. This is what
  makes seeds and share codes work. `Math.random` is banned in `src/sim/`.
- **Ghosts are recorded positions, not inputs.** Replaying inputs would bind
  every saved ghost to the exact physics build that produced it, so tuning the
  jump would silently invalidate every share code already in the wild.

Tracks come from ~20 authored templates, each solvable by construction, because
independent per-lane placement regularly generates unwinnable walls. A fuzz test
drives a bot through 150 chunks across 400 seeds to prove generation and physics
are solvable *together*.

`src/sim/` imports nothing from rendering, audio or the DOM and runs headless in
Node, which is what makes that test possible.

## What the tests are actually for

Each of these guards a failure that is invisible while developing:

| suite | catches |
|---|---|
| `solvability` | a seed that generates an unwinnable wall — found only by bad luck in manual play |
| `track-seed` | a seed that stops reproducing its track, which silently breaks every share code |
| `session` | `#s=` / `#c=` being parsed and then ignored (this has happened) |
| `precache` | a new module missing from `sw.js`, which breaks the game *only* for people already offline |

## The intro is checked, not eyeballed

The first screen is not a lookalike of Chrome's offline page — it is built from
Chromium's own `interstitial_core.css`, `interstitial_common.css` and
`neterror.css`, so it reflows at Chrome's breakpoints rather than ones invented
here. The dino standing in the sprite's slot is already the 3D model: the
renderer bends clip-space x/y so it lands in the exact 44×47 rect Chrome's
`Runner` draws the sprite into, and releases that fit as the camera swings.

`reference/` holds Chromium's page assembled from upstream sources, because
`chrome://network-error/` cannot be screenshotted. `tools/layout-diff.sh`
compares every element's rect and computed style between the two:

    npm run serve &
    tools/layout-diff.sh
    SCHEME=light tools/layout-diff.sh

16 of 22 viewports match exactly. The other 6 differ only in the fixed action
bar's width, by the classic scrollbar the reference loses when its document
scrolls — 0 on platforms with overlay scrollbars.

## Regenerating things

    python3 tools/make-icons.py      # icons, from the model's own box list
    npm install && npm run vendor    # vendor/ogl.min.js

`ogl` ships ES module sources only, with no prebuilt dist, so it is bundled once
and committed. You only need that second command to change which ogl modules are
included.

## Licence note

Files under `reference/neterror/` are Chromium's, BSD-licensed, and are there for
verification only. Nothing under `src/` or `index.html` loads them.
