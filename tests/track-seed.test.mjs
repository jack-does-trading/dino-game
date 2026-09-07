import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateChunk, Track } from '../src/sim/track.js';
import { chunkSeed, rng } from '../src/rng.js';

const layout = (seed, ci) =>
    JSON.stringify(generateChunk(seed, ci).obstacles);

test('same seed yields an identical layout', () => {
    for (const seed of [1, 42, 7777, 0x7fffffff]) {
        for (let ci = 0; ci < 30; ci++) {
            assert.equal(layout(seed, ci), layout(seed, ci));
        }
    }
});

test('different seeds diverge', () => {
    const a = [...Array(30)].map((_, i) => layout(1, i)).join('|');
    const b = [...Array(30)].map((_, i) => layout(2, i)).join('|');
    assert.notEqual(a, b);
});

// The whole point of deriving from (seed, chunkIndex) rather than advancing a
// stream: chunk 40 must be the same whether you played there or jumped straight
// to it. Without this, share codes break the moment anything changes how far
// ahead the track streams.
test('chunk content does not depend on visit order', () => {
    const direct = layout(999, 40);

    const t = new Track(999);
    for (let z = 0; z < 40 * 24; z += 13) t.update(z);
    t.update(40 * 24);
    assert.equal(JSON.stringify(t.chunks.get(40).obstacles), direct);
});

test('rng is integer-only and reproducible', () => {
    const draw = (s) => { const r = rng(chunkSeed(s, 3)); return [...Array(8)].map(() => r.u32()); };
    assert.deepEqual(draw(5), draw(5));
    for (const v of draw(5)) {
        assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff, `${v} is not a uint32`);
    }
});
