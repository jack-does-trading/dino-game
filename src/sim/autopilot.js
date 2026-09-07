// A greedy autopilot. Two jobs: it drives the attract-mode demo, and it is the
// engine of the solvability fuzz test.
//
// Static template checking only proves the LAYOUT has a gap. This bot proves the
// gap is actually reachable given real jump arcs, duck timing and speed -- it
// validates generation and physics together, which is the thing that matters.

import { BAR, ROCK, PILLAR, LANES } from './consts.js';

// A slot counts as "still live" until we are fully past its collision box
// (halfD 0.5 + player halfD 0.4 = 0.9). Releasing it any earlier lets the bot
// strafe sideways into an obstacle it is still overlapping.
const PASSED = 1.0;

/** Nearest slot (group of obstacles sharing a z) not yet cleared. */
function nextSlot(s) {
    const buf = [];
    s.track.near(s.z + s.speed * 0.5, s.speed * 0.6 + PASSED, buf);
    let best = Infinity;
    for (const o of buf) if (o.z > s.z - PASSED && o.z < best) best = o.z;
    if (best === Infinity) return null;
    return { z: best, obstacles: buf.filter((o) => Math.abs(o.z - best) < 0.01) };
}

export function botInput(s) {
    const input = { left: false, right: false, jump: false, duck: false };
    const p = s.player;
    const slot = nextSlot(s);
    if (!slot) return input;

    const hasBar = slot.obstacles.some((o) => o.type === BAR);
    const blocked = new Set(slot.obstacles.filter((o) => o.type === PILLAR).map((o) => o.lane));
    const rocks = new Set(slot.obstacles.filter((o) => o.type === ROCK).map((o) => o.lane));

    // Prefer a lane needing no action at all, then one needing only a jump.
    let target = -1;
    for (let d = 0; d < LANES && target < 0; d++) {
        for (const l of [p.lane - d, p.lane + d]) {
            if (l < 0 || l >= LANES) continue;
            if (!blocked.has(l) && !rocks.has(l)) { target = l; break; }
        }
    }
    if (target < 0) {
        for (let d = 0; d < LANES && target < 0; d++) {
            for (const l of [p.lane - d, p.lane + d]) {
                if (l < 0 || l >= LANES) continue;
                if (!blocked.has(l)) { target = l; break; }
            }
        }
    }
    if (target < 0) target = p.lane; // unsolvable slot -- the test will catch it

    if (target < p.lane) input.left = true;
    else if (target > p.lane) input.right = true;

    const tTo = (slot.z - s.z) / s.speed;
    if (hasBar && tTo < 0.30) input.duck = true;
    if (rocks.has(target) && p.grounded && tTo <= 0.22) input.jump = true;

    return input;
}
