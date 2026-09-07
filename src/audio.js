// Procedural audio. No files -- every sound here is synthesised, which is a large
// amount of immersion for zero payload bytes.
//
// AudioContext starts suspended under autoplay policy, so nothing is built until
// the first real user gesture. This is the classic bug in browser games.

const SCALE = [0, 2, 4, 7, 9];          // pentatonic: hard to make sound wrong
const KEY_BY_BIOME = { dawn: 55, canyon: 49, storm: 46, aurora: 58 };

export function createAudio() {
    let ctx = null, master = null, wind = null, windFilter = null, windGain = null;
    let musicGain = null, nextNote = 0, step = 0, muted = false;

    function init() {
        if (ctx) return true;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();

        master = ctx.createGain();
        master.gain.value = 0.0;
        master.connect(ctx.destination);
        master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.6);

        // --- wind: filtered noise, cutoff and gain ride the speed ------------
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < len; i++) {
            lp = lp * 0.86 + (Math.random() * 2 - 1) * 0.14;  // cosmetic only
            d[i] = lp * 3.0;
        }
        wind = ctx.createBufferSource();
        wind.buffer = buf;
        wind.loop = true;
        windFilter = ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 400;
        windGain = ctx.createGain();
        windGain.gain.value = 0;
        wind.connect(windFilter).connect(windGain).connect(master);
        wind.start();

        musicGain = ctx.createGain();
        musicGain.gain.value = 0.16;
        musicGain.connect(master);

        nextNote = ctx.currentTime;
        return true;
    }

    function blip(freq, dur, type, gain, sweep = 1) {
        if (!ctx || muted) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (sweep !== 1) o.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + dur + 0.02);
    }

    /** Scheduled ahead of the clock -- setTimeout jitter must never reach audio. */
    function pumpMusic(biomeName, intensity) {
        if (!ctx || muted) return;
        const root = KEY_BY_BIOME[biomeName] || 55;
        const beat = 0.28 - intensity * 0.07;
        while (nextNote < ctx.currentTime + 0.35) {
            const deg = SCALE[step % SCALE.length];
            const oct = 12 * (1 + ((step >> 2) % 2));
            const f = root * Math.pow(2, (deg + oct) / 12);

            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'triangle';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, nextNote);
            g.gain.exponentialRampToValueAtTime(0.28 + intensity * 0.2, nextNote + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, nextNote + beat * 1.6);
            o.connect(g).connect(musicGain);
            o.start(nextNote);
            o.stop(nextNote + beat * 1.8);

            nextNote += beat;
            step++;
        }
    }

    return {
        get ready() { return !!ctx; },
        /** Call from a real user gesture. Safe to call repeatedly. */
        unlock() {
            if (!init()) return;
            if (ctx.state === 'suspended') ctx.resume();
        },
        update(sim, biomeName) {
            if (!ctx) return;
            const intensity = Math.min(1, (sim.speed - 14) / 17);
            windGain.gain.value = muted ? 0 : 0.03 + intensity * 0.20;
            windFilter.frequency.value = 320 + intensity * 900;
            if (sim.alive) pumpMusic(biomeName, intensity);
        },
        jump() { blip(300, 0.14, 'square', 0.22, 2.4); },
        land() { blip(120, 0.09, 'sine', 0.16, 0.6); },
        near() { blip(1500, 0.10, 'sine', 0.13, 1.6); },
        die() {
            blip(220, 0.55, 'sawtooth', 0.34, 0.22);
            blip(90, 0.7, 'square', 0.22, 0.4);
            if (ctx) nextNote = ctx.currentTime + 0.9;
        },
        toggleMute() {
            muted = !muted;
            if (master) master.gain.value = muted ? 0 : 0.9;
            return muted;
        },
        get muted() { return muted; },
    };
}
