import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TEMPLATES, isSolvable } from '../src/sim/templates.js';
import { generateChunk, chunkIsSolvable } from '../src/sim/track.js';
import { createSim, stepSim, chunkOf } from '../src/sim/sim.js';
import { botInput } from '../src/sim/autopilot.js';

test('every authored template is solvable', () => {
    for (let i = 0; i < TEMPLATES.length; i++) {
        assert.ok(isSolvable(TEMPLATES[i]), `template ${i} has an impassable slot`);
    }
});

test('generated chunks are solvable across 5000 seeds', () => {
    for (let seed = 1; seed <= 5000; seed++) {
        for (let ci = 0; ci < 12; ci++) {
            const c = generateChunk(seed, ci);
            assert.ok(chunkIsSolvable(c), `seed ${seed} chunk ${ci} is impassable`);
        }
    }
});

// The one that matters: not "is there a gap" but "can a player actually get
// through it", including jump arcs, duck timing and the junction between one
// template's exit and the next one's entry.
test('a bot survives 150 chunks on 400 seeds', () => {
    const failures = [];
    for (let seed = 1; seed <= 400; seed++) {
        const s = createSim(seed);
        let guard = 0;
        while (s.alive && chunkOf(s) < 150 && guard++ < 200000) stepSim(s, botInput(s));
        if (!s.alive) failures.push({ seed, chunk: chunkOf(s), z: +s.z.toFixed(1) });
    }
    assert.deepEqual(failures, [], `bot died on ${failures.length}/400 seeds`);
});
