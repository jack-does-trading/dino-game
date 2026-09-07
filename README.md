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

    index.html          shell + Chrome's error page, inline CSS
    vendor/ogl.min.js   committed WebGL bundle (ogl, 14 KB gzipped)
    src/sim/            headless game logic — no imports out
    src/render/         ogl setup, procedural geometry, shaders, biomes
    src/audio.js        WebAudio synthesis, no files
    src/replay.js       ghost recording, share codes
    reference/          Chromium's page, for the layout diff
    tools/              vendoring, dev server, layout diff

## Regenerating the WebGL bundle

`ogl` ships ES module sources only, with no prebuilt dist, so it is bundled once
and committed:

    npm install && npm run vendor

You only need this to change which ogl modules are included.

## Licence note

Files under `reference/neterror/` are Chromium's, BSD-licensed, and are there for
verification only. Nothing under `src/` or `index.html` loads them.
