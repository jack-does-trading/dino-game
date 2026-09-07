// Service worker: makes the game genuinely playable with no connection.
//
// The joke only really lands if an offline page works offline, so the whole app
// is precached on first visit. Everything here is relative to the worker's own
// URL, which is what lets the same files work at a domain root and under a
// GitHub Pages project path like /dino-3d/ without changing anything.
//
// BUMP `VERSION` WHEN YOU DEPLOY. There is no build step to hash filenames for
// us, so this constant is the only thing that tells an installed copy that it is
// stale. tests/precache.test.mjs keeps PRECACHE itself honest.
const VERSION = 'v3';
const CACHE = `dino3d-${VERSION}`;

const PRECACHE = [
    './',
    './index.html',
    './manifest.webmanifest',
    './vendor/ogl.min.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './src/audio.js',
    './src/input.js',
    './src/main.js',
    './src/replay.js',
    './src/rng.js',
    './src/render/biomes.js',
    './src/render/meshes.js',
    './src/render/renderer.js',
    './src/render/shaders.js',
    './src/sim/autopilot.js',
    './src/sim/collide.js',
    './src/sim/consts.js',
    './src/sim/player.js',
    './src/sim/sim.js',
    './src/sim/templates.js',
    './src/sim/track.js',
];

self.addEventListener('install', (e) => {
    // reload: 'reload' bypasses the HTTP cache, so installing never bakes in a
    // stale copy the browser happened to be holding.
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== location.origin) return;

    // Cache first. Instant load is the point of the whole project, and a network
    // race would give that up to save one reload's staleness.
    e.respondWith(
        caches.match(req).then((hit) => hit || fetch(req).catch(() => {
            // Offline, and this exact URL was never cached. Answering with
            // index.html here looks right and is broken: its relative module
            // URLs would resolve against *this* path rather than the scope, so
            // the page renders and the game never boots. Redirect to the root
            // the precache actually covers instead. Fragments never reach a
            // service worker, so `#c=` share links are unaffected either way.
            if (req.mode === 'navigate' && req.url !== self.registration.scope) {
                return Response.redirect(self.registration.scope, 302);
            }
            return Response.error();
        }))
    );
});
