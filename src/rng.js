// Deterministic integer PRNG.
//
// Track generation MUST be reproducible across browsers and across versions --
// share codes rest on it. So everything here is integer-only: Math.imul and
// bitwise ops are exactly specified by ECMAScript, unlike Math.sin/cos/pow which
// engines approximate differently (and V8 has changed historically).
//
// Nothing in src/sim/ may call Math.random.

/** murmur3 fmix32 -- avalanches an integer into a well-distributed 32-bit hash. */
export function mix32(h) {
    h = h | 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * Seed for a chunk. Derived from (seed, chunkIndex) rather than advanced
 * sequentially, so chunk content never depends on visit order -- you get the same
 * chunk 40 whether you reached it by playing or by jumping straight there in a test.
 */
export function chunkSeed(seed, chunkIndex) {
    return mix32((seed | 0) ^ Math.imul(chunkIndex | 0, 0x9e3779b9));
}

/** mulberry32. Small, fast, good enough distribution, exactly reproducible. */
export function rng(seed) {
    let a = seed | 0;
    const next = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return (t ^ (t >>> 14)) >>> 0;
    };
    return {
        u32: next,
        /** Uniform integer in [0, n). Integer-only, no float rounding. */
        int: (n) => next() % n,
        /** Only for cosmetic/render use -- never for track layout. */
        float: () => next() / 4294967296,
    };
}
