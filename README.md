# Dino 3D

Chrome's offline error page, which turns into a 3D endless runner when you press
space.

It opens as the real "No internet" page — not a lookalike. The layout is built
from Chromium's own stylesheets, and the dinosaur standing in the sprite's slot
is already the 3D model, framed into the exact 44×47 rect the sprite would
occupy. Press space and it starts running flat, the way the original does; a
beat later the camera swings around behind it and the canyon opens up.

No build step, no assets, no network. All geometry is generated in JavaScript at
boot and all art is palette plus shader maths, so the whole thing is about
**48 KB gzipped** including the WebGL library.

## Play

    npm run serve
    # open http://localhost:8000

A static server is required because ES modules will not load over `file://`.

**Controls** — ←/→ or A/D to change lane, ↑/W/space to jump, ↓/S to duck,
M to mute. On touch: swipe to strafe, tap to jump, swipe down to duck.

One hit and you are out, and any key restarts immediately.

## Sharing a run

The URL fragment carries the run:

| fragment | effect |
|---|---|
| `#s=<seed>` | play that exact track |
| `#c=<code>` | play someone's track *and* race their ghost |

"copy challenge link" on the death screen produces a `#c=` link containing the
seed, the score and a 10 Hz recording of the run (~1.8 KB per minute, base64url).
The recipient races your ghost on your track with a directly comparable score.
Truncate the code and it still yields the right track, just without the ghost.

Your best run is kept in `localStorage`, and you race it whenever the seed
matches.

## Installing it, and actually playing offline

An offline page that needs a connection to load is only half the joke, so the
whole app is precached by a service worker on first visit. After you have opened
it once it runs with the network completely gone -- verified by killing the
server and reloading, not just by reading the code.

Chrome and Edge offer an install button in the address bar; on iOS it is Share →
Add to Home Screen. Installed, it launches standalone from the home screen or
dock with no browser chrome, which is the most convincing version of the gag.

Two things worth knowing if you change the code:

- **Bump `VERSION` in `sw.js` when you deploy.** There is no build step hashing
  filenames, so that constant is the only signal an installed copy has that it
  is stale. Forget it and returning players keep the old build.
- **Add new files to `PRECACHE` in `sw.js`.** `tests/precache.test.mjs` fails if
  you don't. That failure mode is nasty otherwise: the game keeps working for
  you, because you are online, and silently stops working offline for everyone
  who already installed it.

During development the worker will happily serve you a stale copy of your own
edits. DevTools → Application → Service Workers → "Bypass for network", or clear
it from the console:

    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);

The icons are not drawn by hand -- they are the dino's side-on silhouette,
rasterized from the same box list `src/render/meshes.js` builds the model from,
so they cannot drift from the game:

    python3 tools/make-icons.py

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

    npm test

`src/sim/` imports nothing from rendering, audio or the DOM and runs headless in
Node, which is what makes that test possible.

## The intro is checked, not eyeballed

`reference/` holds Chromium's real error page, assembled from upstream sources
(`chrome://network-error/` cannot be screenshotted). `tools/layout-diff.sh`
compares every element's rect and computed style between the two across 22
viewports and both colour schemes:

    npm run serve &
    tools/layout-diff.sh
    SCHEME=light tools/layout-diff.sh

16 of 22 sizes match exactly. The other 6 differ only in the fixed action bar's
width, by the classic scrollbar the reference loses when its document scrolls —
0 on platforms with overlay scrollbars.

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
    reference/            Chromium's page, for the layout diff
    tools/                vendoring, dev server, layout diff, icons

## Regenerating the WebGL bundle

`ogl` ships ES module sources only, with no prebuilt dist, so it is bundled once
and committed:

    npm install && npm run vendor

You only need this to change which ogl modules are included.

## Licence note

Files under `reference/neterror/` are Chromium's, BSD-licensed, and are there for
verification only. Nothing under `src/` or `index.html` loads them.
