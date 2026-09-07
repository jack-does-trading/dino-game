// Chunk generation. Pure function of (seed, chunkIndex) -- no floats, no
// transcendentals, no dependence on visit order. This is the guarantee that
// seeded runs and share codes rest on.

import { chunkSeed, rng } from '../rng.js';
import { CHUNK_LEN, SLOT_DZ } from './consts.js';
import { BY_TIER, INTRO_TEMPLATES, passableLanes } from './templates.js';

/** Tier weights ramp with distance: easy patterns thin out, hard ones appear ~chunk 20. */
function tierWeights(ci) {
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    return [
        clamp(100 - ci * 3, 5, 100),
        clamp(ci * 2, 0, 60),
        clamp((ci - 20) * 2, 0, 60),
    ];
}

function pickTier(r, ci) {
    const w = tierWeights(ci);
    let n = r.int(w[0] + w[1] + w[2]);
    for (let t = 0; t < 3; t++) {
        if (n < w[t]) return t;
        n -= w[t];
    }
    return 0;
}

/**
 * Build one chunk. Chunk 0 is deliberately empty so every run starts with a
 * moment to orient before the first obstacle.
 */
/** Empty chunks at the start of every run -- see generateChunk. */
export const OPEN_CHUNKS = 2;

export function generateChunk(seed, ci, flat = false) {
    const baseZ = ci * CHUNK_LEN;
    // The opening chunks are empty by design. The 2D->3D transition takes 2.6s,
    // which at SPEED_BASE is ~36 units -- so a single 24-unit chunk would put the
    // first obstacle inside the camera swing, where the player cannot read the
    // track yet. Two chunks put it at z=52, clear of the swing with a beat to
    // spare. Anything that changes RUN2D_S or SWING_S should revisit this.
    if (ci < OPEN_CHUNKS) return { index: ci, baseZ, template: null, slots: [[], [], []], obstacles: [] };

    const r = rng(chunkSeed(seed, ci));
    const pool = flat ? INTRO_TEMPLATES : BY_TIER[ci <= OPEN_CHUNKS + 2 ? 0 : pickTier(r, ci)];
    const template = pool[r.int(pool.length)];

    const obstacles = [];
    for (let s = 0; s < template.slots.length; s++) {
        for (const [type, lane] of template.slots[s]) {
            obstacles.push({ type, lane, z: baseZ + SLOT_DZ[s] });
        }
    }
    return { index: ci, baseZ, template, slots: template.slots, obstacles };
}

/** Every slot of a generated chunk must leave at least one way through. */
export function chunkIsSolvable(chunk) {
    return chunk.slots.every((slot) => slot.length === 0 || passableLanes(slot) !== null);
}

/**
 * Rolling window of live chunks. Chunks are pure functions of their index, so
 * this is just a cache -- dropping and regenerating one is always safe.
 */
export class Track {
    constructor(seed, ahead = 6, behind = 2, flat = false) {
        this.seed = seed | 0;
        this.ahead = ahead;
        this.behind = behind;
        this.flat = flat;
        this.chunks = new Map();
        this.update(0);
    }

    update(playerZ) {
        const ci = Math.floor(playerZ / CHUNK_LEN);
        const lo = ci - this.behind;
        const hi = ci + this.ahead;
        for (let i = lo; i <= hi; i++) {
            if (i >= 0 && !this.chunks.has(i)) this.chunks.set(i, generateChunk(this.seed, i, this.flat));
        }
        for (const k of this.chunks.keys()) {
            if (k < lo || k > hi) this.chunks.delete(k);
        }
        this.lo = lo;
        this.hi = hi;
    }

    /** Obstacles within +/- range of z. Only ever a handful. */
    near(z, range, out) {
        out.length = 0;
        const c0 = Math.floor((z - range) / CHUNK_LEN);
        const c1 = Math.floor((z + range) / CHUNK_LEN);
        for (let i = c0; i <= c1; i++) {
            const c = this.chunks.get(i);
            if (!c) continue;
            for (const o of c.obstacles) {
                if (o.z >= z - range && o.z <= z + range) out.push(o);
            }
        }
        return out;
    }
}
