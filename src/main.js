import { DT } from './sim/consts.js';
import { createSim, stepSim, scoreOf } from './sim/sim.js';
import { botInput } from './sim/autopilot.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
    createRecorder, recordSample, finishRecording, createGhost,
    encodeShare, parseSession, loadBest, saveBest,
} from './replay.js';

const canvas = document.getElementById('gl');
const offline = document.getElementById('offline');
const runnerBox = document.querySelector('.runner-container');
const hud = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    mult: document.getElementById('mult'),
    biome: document.getElementById('biome'),
    overlay: document.getElementById('overlay'),
    title: document.getElementById('title'),
    sub: document.getElementById('sub'),
    seed: document.getElementById('seed'),
    actions: document.getElementById('actions'),
    resume: document.getElementById('resume'),
    restart: document.getElementById('restart'),
    pause: document.getElementById('pausebtn'),
};

let view;
try {
    view = createRenderer(canvas);
} catch (e) {
    hud.overlay.innerHTML = `<h1>WebGL2 unavailable</h1><p>${e.message}</p>`;
    throw e;
}

const input = createInput(window);
const audio = createAudio();

// --- session -----------------------------------------------------------------
const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;
const session = parseSession(location.hash, randomSeed);

let best = loadBest();
let seed = session.seed;

// A shared run's ghost takes priority; otherwise you race your own best, but only
// on the same track -- racing a ghost from a different seed would be nonsense.
let challengeGhost = session.ghost;
let challengeScore = session.score;

// offline -> transition -> playing -> dead   (playing <-> paused)
//
// `offline` is the browser's error page: the dino standing still, side-on and
// monochrome, with the HTML laid out around it. Pressing space starts it running
// in that same flat view, and only then does the camera swing around into 3D --
// so the game visibly grows out of the error page instead of replacing it.
const RUN2D_S = 0.85;     // beat of flat 2D running before the camera moves
const SWING_S = 1.75;     // the swing itself

let state = 'offline';
let mix = 0;              // 0 = flat 2D view, 1 = full 3D
let transT = 0;
let sim = createSim(seed, true);
let recorder = createRecorder();
let ghost = null;
const ghostPose = { x: 0, y: 0, ducking: false };
let deadFor = 0;
let lastCode = '';
// Which state to hand back to on resume: pausing during the camera swing must
// not drop you into the middle of it as though it had finished.
let pausedFrom = 'playing';

function ghostForSeed(s) {
    if (challengeGhost) return createGhost(challengeGhost);
    if (best && best.seed === s && best.ghost) return createGhost(best.ghost);
    return null;
}

function start() {
    if (state === 'playing' || state === 'transition') return;
    audio.unlock();
    offline.classList.add('gone');
    // A fresh sim for the scored run. Chunk 0 is empty, so the ~1.7s before the
    // first obstacle covers the whole camera swing -- the world never has to pop.
    sim = createSim(seed);
    recorder = createRecorder();
    ghost = ghostForSeed(seed);
    if (ghost) ghost.reset();
    view.reset();
    input.clear();
    state = 'transition';
    transT = 0;
    deadFor = 0;
    hud.overlay.classList.add('hidden');
    showActions({});
    document.body.classList.add('playing');
    document.body.classList.remove('paused');
}

// Reset to the error page. Deliberately does NOT pick a seed: `#s=` and `#c=`
// have already decided it, and inventing one here silently threw those away.
function intro() {
    sim = createSim(seed, true);   // centre lane only, like the original
    ghost = null;
    mix = 0;
    transT = 0;
    view.reset();
    state = 'offline';
    document.body.classList.remove('playing', 'paused');
    offline.classList.remove('gone');
    hud.overlay.classList.add('hidden');
    showActions({});
    updateSeedLine();
}

/**
 * Hand the renderer the rect Chrome's runner canvas would draw the dino into, so
 * the 3D model lands exactly where the sprite does. The page is laid out by
 * Chrome's own stylesheet and never moves -- the camera framing is what adapts,
 * which is also what keeps the intro correct at every breakpoint.
 *
 * Runner draws the 44x47 T-rex at canvas y 93 (150 - 47 - BOTTOM_PAD) inside the
 * 44x150 .runner-container, so the container's own rect gives us the rest.
 */
const TREX_Y = 93, TREX_W = 44, TREX_H = 47;
function frameDino() {
    const r = runnerBox.getBoundingClientRect();
    view.setFit(r.left, r.top + TREX_Y, TREX_W, TREX_H);
}

function die() {
    state = 'dead';
    document.body.classList.remove('playing', 'paused');
    deadFor = 0;
    // Drain the input queue. It is only ever consumed while dead or on the error
    // page, never while you are playing -- so without this, every jump pressed
    // during the run is still banked when it ends and the retry below fires the
    // instant its gate opens: the run restarting on its own the moment it ended.
    input.clear();
    view.shake(1.4);
    audio.die();

    const score = scoreOf(sim);
    const bytes = finishRecording(recorder);
    const isBest = !best || score > best.score;
    if (isBest) {
        saveBest(score, seed, bytes);
        best = { score, seed, ghost: bytes };
    }
    lastCode = encodeShare(seed, score, bytes);

    hud.overlay.classList.remove('hidden');
    hud.title.textContent = score;
    const beat = challengeScore != null
        ? (score > challengeScore ? `beat the challenge (${challengeScore})` : `challenge: ${challengeScore}`)
        : isBest ? 'new best' : `best ${best.score}`;
    hud.sub.innerHTML = `${beat}<br><span class="go">press <b>space</b> to run again</span>`;
    showActions({ restart: true });
    updateSeedLine();
}

// --- pause -------------------------------------------------------------------
function showActions({ resume = false, restart = false }) {
    hud.resume.hidden = !resume;
    hud.restart.hidden = !restart;
    hud.actions.hidden = !(resume || restart);
}

function pause() {
    if (state !== 'playing' && state !== 'transition') return;
    pausedFrom = state;
    state = 'paused';
    document.body.classList.add('paused');
    hud.title.textContent = 'paused';
    hud.sub.innerHTML = '<span class="go">press <b>esc</b> to resume</span>';
    showActions({ resume: true, restart: true });
    hud.overlay.classList.remove('hidden');
}

function unpause() {
    if (state !== 'paused') return;
    state = pausedFrom;
    document.body.classList.remove('paused');
    hud.overlay.classList.add('hidden');
    showActions({});
    // A tap on `resume` also lands as a jump on the way through, and the clock
    // has kept running -- drop both rather than spending them on the first tick.
    input.clear();
    last = performance.now();
    acc = 0;
}

function updateSeedLine() {
    const s = seed.toString(36);
    hud.seed.innerHTML = state === 'dead'
        ? `seed <code>${s}</code> &middot; <a href="#" id="share">copy challenge link</a>`
        : `seed <code>${s}</code>`;
    const a = document.getElementById('share');
    if (a) a.onclick = (e) => {
        e.preventDefault();
        const url = `${location.origin}${location.pathname}#c=${lastCode}`;
        navigator.clipboard?.writeText(url).then(
            () => { a.textContent = 'copied!'; },
            () => { a.textContent = 'copy failed'; }
        );
    };
}

// --- install -----------------------------------------------------------------
// The point of a PWA here is that it survives losing your connection, so make
// keeping it a single click. Offered only on the death screen: the error page is
// a pixel-for-pixel copy of Chrome's, and a button on it would give the game
// away before you have played.
const installBtn = document.getElementById('install');
const installHint = document.getElementById('installhint');
let installPrompt = null;

const isInstalled = () => matchMedia('(display-mode: standalone)').matches
    || navigator.standalone === true;

addEventListener('beforeinstallprompt', (e) => {
    // Suppressing the default also keeps Chrome's own install bar from popping
    // up over the intro, which would spoil it just as effectively.
    e.preventDefault();
    installPrompt = e;
    if (!isInstalled()) installBtn.hidden = false;
});

addEventListener('appinstalled', () => {
    installPrompt = null;
    installBtn.hidden = installHint.hidden = true;
});

installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installBtn.hidden = true;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;   // the event is single use either way
});

// Any key retries, and on touch that includes tapping. Without this, tapping
// install would also restart the run out from under the prompt.
for (const el of [installBtn, installHint]) {
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
}

// Safari never fires beforeinstallprompt, so iOS gets told the manual route.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS && !isInstalled()) {
    installHint.textContent = 'keep it: share \u2192 add to home screen';
    installHint.hidden = false;
}

// --- loop --------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let frameAvg = 16;
let quality = 1;
const ev = { jumped: false, landed: false, near: 0, died: false };

let frames = 0;
function frame(now) {
    requestAnimationFrame(frame);
    frames++;

    // Clamp so a backgrounded tab that resumes does not fast-forward the sim.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;

    ev.jumped = ev.landed = ev.died = false;
    ev.near = 0;

    let steps = 0;
    while (acc >= DT && steps < 5) {
        acc -= DT;
        steps++;
        if (state === 'dead' || state === 'offline' || state === 'paused') break;   // the dino stands still

        const inp = state === 'offline' ? botInput(sim) : input.take();
        stepSim(sim, inp);

        if (state === 'playing' || state === 'transition') {
            recordSample(recorder, DT, view.dinoX, sim.player.y, sim.player.ducking);
        }
        const e = sim.events;
        ev.jumped ||= e.jumped;
        ev.landed ||= e.landed;
        ev.died ||= e.died;
        ev.near += e.near;
    }

    if (ev.jumped) audio.jump();
    if (ev.landed) audio.land();
    if (ev.near) { audio.near(); view.shake(0.18 * ev.near); }

    if (ev.died) die();

    if (state === 'transition') {
        transT += dt;
        // Hold flat for a beat so it reads as the original game first, then swing.
        mix = Math.max(0, Math.min(1, (transT - RUN2D_S) / SWING_S));
        if (mix >= 1) {
            state = 'playing';
            document.body.classList.add('playing');
        }
    } else {
        mix = state === 'offline' ? 0 : 1;
    }

    if (state === 'paused') {
        acc = 0;   // otherwise a long pause banks steps and fast-forwards on resume
    } else if (state === 'dead') {
        deadFor += dt;
        // Long enough to read the score, and to see the crash land.
        if (deadFor > 0.6 && input.takeConfirm()) start();
    } else if (state === 'offline') {
        frameDino();
        if (input.takeAny()) start();
    }

    // --- ghost ---------------------------------------------------------------
    let pose = null;
    if (ghost && (state === 'playing' || state === 'transition')) {
        ghost.advance(dt);
        pose = ghost.sample(ghostPose);
    }

    // dt 0 while paused freezes the camera smoothing, the run cycle and the
    // shake in place, so the world holds its exact frame instead of drifting.
    view.render(sim, state === 'paused' ? 0 : dt, now / 1000, pose, mix, state !== 'offline');
    audio.update(sim, view.biome.name);
    drawHud();

    // --- adaptive resolution: give up pixels before giving up frames ---------
    frameAvg += ((now - (frame.prev || now)) - frameAvg) * 0.05;
    frame.prev = now;
    const want = frameAvg > 21 ? 0.72 : frameAvg < 15 ? 1 : quality;
    if (want !== quality) { quality = want; view.setQuality(want); }
}

let hudScore = -1, hudBest = -1, hudBiome = '', hudMult = '';
function drawHud() {
    const s = scoreOf(sim);
    if (s !== hudScore) { hud.score.textContent = String(s).padStart(5, '0'); hudScore = s; }
    const b = best ? best.score : 0;
    if (b !== hudBest) { hud.best.textContent = b ? `best ${b}` : ''; hudBest = b; }
    if (view.biome.name !== hudBiome) { hud.biome.textContent = view.biome.name; hudBiome = view.biome.name; }
    const m = sim.mult > 1.02 ? `x${sim.mult.toFixed(1)}` : '';
    if (m !== hudMult) { hud.mult.textContent = m; hudMult = m; }
}

// Debug handle. Cheap, and a black canvas is otherwise very hard to interrogate.
window.__dino = {
    view,
    get state() { return state; },
    get mix() { return mix; },
    get sim() { return sim; },
    get frames() { return frames; },
};

addEventListener('resize', () => { view.resize(); if (state === 'offline') frameDino(); });
// The extension sends you here with the address you were actually trying to
// reach, so Reload retries THAT -- replacing Chrome's error page should not cost
// you the one useful thing it did. Anyone can put anything in a hash, so the
// value is parsed and restricted to http(s): without this, a crafted link could
// point Reload at `javascript:` and run whatever it liked on this origin.
const retryTarget = (() => {
    const raw = new URLSearchParams(location.hash.replace(/^#/, '')).get('retry');
    if (!raw) return null;
    try {
        const u = new URL(raw);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch { return null; }
})();
document.getElementById('reload').addEventListener('click', () => {
    if (retryTarget) location.href = retryTarget; else location.reload();
});
// Losing the tab mid-run should cost you nothing: come back to a paused game.
addEventListener('visibilitychange', () => {
    last = performance.now();
    acc = 0;
    if (document.hidden) pause();
});
addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') audio.toggleMute();
    if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (state === 'paused') unpause(); else pause();
    }
});

hud.pause.addEventListener('click', pause);
hud.resume.addEventListener('click', unpause);
hud.restart.addEventListener('click', () => {
    // From the pause screen this is a deliberate abandon, so it has to get past
    // start()'s "already running" guard rather than resuming into it.
    if (state === 'paused') state = 'dead';
    start();
});
// A tap anywhere is the touch equivalent of space, so every button has to keep
// its tap to itself or pressing it also restarts the run.
for (const el of [hud.pause, hud.resume, hud.restart]) {
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
}

view.resize();
intro();
if (session.shared) {
    const hint = document.createElement('div');
    hint.id = 'challenge';
    hint.innerHTML = `press <b>space</b> to beat ${session.score} on this track`;
    document.getElementById('err').after(hint);
}
// The page needs a real layout pass before the dino can be framed against it.
requestAnimationFrame(() => frameDino());
requestAnimationFrame(frame);
