// Ghost recording.
//
// Positions, NOT inputs. An input timeline is 5x smaller, but it binds every
// saved ghost to the exact physics build that produced it -- so a tuning pass
// silently invalidates every stored ghost and every share code in the wild, and
// engine differences in Math.sin/cos desync replays across browsers.
// 1.8KB per run is irrelevant against a 60KB budget; correctness is not.

const HZ = 10;
export const SAMPLE_DT = 1 / HZ;

const X_MIN = -3, X_RANGE = 6;      // lane x is [-2,2]; margin for the visual lerp
const Y_MAX = 3.2;

export function createRecorder() {
    return { t: 0, bytes: [], done: false };
}

/** Call every sim step with the interpolated visual position. */
export function recordSample(rec, dt, x, y, ducking) {
    if (rec.done) return;
    rec.t += dt;
    while (rec.t >= SAMPLE_DT) {
        rec.t -= SAMPLE_DT;
        const qx = Math.max(0, Math.min(255, Math.round(((x - X_MIN) / X_RANGE) * 255)));
        const qy = Math.max(0, Math.min(255, Math.round((y / Y_MAX) * 255)));
        rec.bytes.push(qx, qy, ducking ? 1 : 0);
        if (rec.bytes.length > 3 * HZ * 900) rec.done = true; // 15 min cap
    }
}

export function finishRecording(rec) {
    return Uint8Array.from(rec.bytes);
}

/** Ghost playback, interpolated between 10Hz samples so it moves smoothly. */
export function createGhost(bytes) {
    const n = bytes ? bytes.length / 3 : 0;
    return {
        bytes, n, t: 0,
        get finished() { return this.t >= (this.n - 1) * SAMPLE_DT; },
        reset() { this.t = 0; },
        advance(dt) { this.t += dt; },
        sample(out) {
            if (!this.n) return null;
            const f = Math.min(this.t / SAMPLE_DT, this.n - 1);
            const i = Math.floor(f);
            const a = Math.min(i, this.n - 1), b = Math.min(i + 1, this.n - 1);
            const u = f - i;
            const ax = bytes[a * 3], ay = bytes[a * 3 + 1];
            const bx = bytes[b * 3], by = bytes[b * 3 + 1];
            out.x = X_MIN + ((ax + (bx - ax) * u) / 255) * X_RANGE;
            out.y = ((ay + (by - ay) * u) / 255) * Y_MAX;
            out.ducking = bytes[a * 3 + 2] === 1;
            return out;
        },
    };
}

// --- share codes -------------------------------------------------------------
// [magic, version, seed(4), score(3), ...ghost] -> base64url.
// Degrades gracefully: a truncated code still yields the right track, just no ghost.

const MAGIC = 0xd1, VERSION = 1;

const b64 = {
    enc: (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => {
        const t = s.replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(t + '==='.slice((t.length + 3) % 4));
        return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    },
};

export function encodeShare(seed, score, ghost) {
    const head = new Uint8Array(9);
    head[0] = MAGIC; head[1] = VERSION;
    new DataView(head.buffer).setUint32(2, seed >>> 0);
    head[6] = (score >> 16) & 255; head[7] = (score >> 8) & 255; head[8] = score & 255;
    const out = new Uint8Array(head.length + (ghost ? ghost.length : 0));
    out.set(head);
    if (ghost) out.set(ghost, head.length);
    return b64.enc(out);
}

export function decodeShare(str) {
    try {
        const u8 = b64.dec(str);
        if (u8.length < 9 || u8[0] !== MAGIC || u8[1] !== VERSION) return null;
        const seed = new DataView(u8.buffer, u8.byteOffset).getUint32(2);
        const score = (u8[6] << 16) | (u8[7] << 8) | u8[8];
        // Trim any partial trailing sample rather than rejecting the whole code.
        const gLen = Math.floor((u8.length - 9) / 3) * 3;
        return { seed, score, ghost: gLen > 0 ? u8.slice(9, 9 + gLen) : null };
    } catch {
        return null;
    }
}

// --- persistence -------------------------------------------------------------
// localStorage THROWS outright in some contexts (private windows, blocked site
// data) rather than returning empty, so every access is guarded.

const KEY = 'dino3d.best.v1';

export function loadBest() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        return { score: o.s | 0, seed: o.d | 0, ghost: o.g ? b64.dec(o.g) : null };
    } catch { return null; }
}

export function saveBest(score, seed, ghost) {
    try {
        localStorage.setItem(KEY, JSON.stringify({
            s: score | 0, d: seed | 0, g: ghost ? b64.enc(ghost) : null,
        }));
        return true;
    } catch { return false; }
}
