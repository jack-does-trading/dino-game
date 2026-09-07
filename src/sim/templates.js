// Authored obstacle patterns, each solvable BY CONSTRUCTION.
//
// Why templates instead of per-lane random placement: independent random
// placement regularly produces unwinnable walls (all three lanes blocked by
// un-jumpable obstacles). That is the failure mode that actually ships, because
// manual playtesting only finds it by bad luck. Templates also give far better
// rhythm -- deliberate breathing room, then a burst.
//
// Each template has one entry per slot in SLOT_DZ. An entry is a list of
// [type, lane] pairs; BAR uses lane -1 because it spans the full width.
//
// Invariants enforced by isSolvable() and fuzzed in tests/solvability.test.mjs:
//   - a slot never mixes BAR with ROCK (you cannot duck and jump at once)
//   - a slot never has PILLARs in all three lanes
// Lane changes commit instantly and slots are 8u apart, so any lane is reachable
// from any other between slots -- solvability is therefore per-slot.

import { ROCK, PILLAR, BAR } from './consts.js';

const _ = []; // empty slot

export const TEMPLATES = [
    // --- tier 0: one decision, plenty of air ---------------------------------
    { tier: 0, slots: [[[ROCK, 1]], _, _] },
    { tier: 0, slots: [_, [[PILLAR, 0]], _] },
    { tier: 0, slots: [_, [[PILLAR, 2]], _] },
    { tier: 0, slots: [[[ROCK, 0]], _, [[ROCK, 2]]] },
    { tier: 0, slots: [_, [[BAR, -1]], _] },
    { tier: 0, slots: [_, [[PILLAR, 1]], _] },
    { tier: 0, slots: [[[PILLAR, 2]], _, [[ROCK, 1]]] },

    // --- tier 1: two decisions, some forced lanes ----------------------------
    { tier: 1, slots: [[[PILLAR, 0], [PILLAR, 1]], _, [[ROCK, 2]]] },
    { tier: 1, slots: [[[PILLAR, 1], [PILLAR, 2]], _, [[BAR, -1]]] },
    { tier: 1, slots: [[[ROCK, 0], [ROCK, 1], [ROCK, 2]], _, [[PILLAR, 0]]] },
    { tier: 1, slots: [[[BAR, -1]], [[PILLAR, 2]], [[ROCK, 1]]] },
    { tier: 1, slots: [[[PILLAR, 0]], [[PILLAR, 2]], [[PILLAR, 1]]] },
    { tier: 1, slots: [[[ROCK, 0], [ROCK, 1]], _, [[PILLAR, 2]]] },
    { tier: 1, slots: [[[BAR, -1]], _, [[BAR, -1]]] },

    // --- tier 2: three decisions, jump->duck chains --------------------------
    { tier: 2, slots: [[[PILLAR, 0], [PILLAR, 1]], [[BAR, -1]], [[PILLAR, 1], [PILLAR, 2]]] },
    { tier: 2, slots: [[[ROCK, 0], [ROCK, 1], [ROCK, 2]], [[BAR, -1]], [[PILLAR, 1]]] },
    { tier: 2, slots: [[[BAR, -1]], [[ROCK, 0], [ROCK, 1], [ROCK, 2]], [[BAR, -1]]] },
    { tier: 2, slots: [[[PILLAR, 0], [PILLAR, 2]], [[ROCK, 1]], [[PILLAR, 1]]] },
    { tier: 2, slots: [[[PILLAR, 1], [ROCK, 0]], [[BAR, -1]], [[PILLAR, 0], [PILLAR, 1]]] },
    { tier: 2, slots: [[[ROCK, 1], [PILLAR, 0]], [[PILLAR, 2], [ROCK, 1]], [[BAR, -1]]] },
    { tier: 2, slots: [[[BAR, -1]], [[PILLAR, 0], [PILLAR, 1]], [[ROCK, 2], [PILLAR, 0]]] },
];

export const BY_TIER = [0, 1, 2].map((t) => TEMPLATES.filter((x) => x.tier === t));

// The 2D intro runs a centre-lane-only track, so the side-on camera shows a
// single file of obstacles exactly like the original game. Bars still appear --
// they span all lanes, so they read correctly from the side too.
export const INTRO_TEMPLATES = [
    { tier: 0, slots: [[[ROCK, 1]], _, _] },
    { tier: 0, slots: [_, [[ROCK, 1]], _] },
    { tier: 0, slots: [[[ROCK, 1]], _, [[ROCK, 1]]] },
    { tier: 0, slots: [_, [[BAR, -1]], _] },
    { tier: 0, slots: [[[ROCK, 1]], _, [[BAR, -1]]] },
];

/**
 * Which lanes a player can get through this slot in, and how.
 * Returns null if the slot is impossible.
 */
export function passableLanes(slot) {
    const hasBar = slot.some((o) => o[0] === BAR);
    const hasRock = slot.some((o) => o[0] === ROCK);
    if (hasBar && hasRock) return null; // cannot duck and jump simultaneously

    const blocked = new Set(slot.filter((o) => o[0] === PILLAR).map((o) => o[1]));
    const open = [0, 1, 2].filter((l) => !blocked.has(l));
    return open.length ? open : null;
}

/** A template is solvable iff every one of its slots is passable. */
export function isSolvable(template) {
    return template.slots.every((slot) => passableLanes(slot) !== null);
}
