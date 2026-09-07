// Player physics. Fixed timestep, 60Hz.
//
// Not required to be replay-deterministic -- ghosts record positions, not inputs
// (see the plan's Architecture section), so these numbers are free to move during
// tuning without invalidating anything already saved or shared.

import {
    DT, GRAVITY, JUMP_V, FASTFALL_G, LANES,
    DUCK_MIN_TICKS, COYOTE_TICKS, BUFFER_TICKS,
} from './consts.js';

export function createPlayer() {
    return {
        lane: 1,
        y: 0,
        vy: 0,
        grounded: true,
        ducking: false,
        duckTicks: 0,
        coyote: COYOTE_TICKS,
        jumpBuffer: 0,
    };
}

/**
 * input: { left, right, jump } are edge-triggered (true only on the tick pressed);
 * { duck } is held.
 */
export function stepPlayer(p, input) {
    // --- lateral: commits immediately, visuals catch up in the renderer -------
    if (input.left) p.lane = Math.max(0, p.lane - 1);
    if (input.right) p.lane = Math.min(LANES - 1, p.lane + 1);

    // --- jump, with coyote time and input buffering ---------------------------
    // Both are pure fairness: a press a few ticks early (still falling) or a few
    // ticks late (just walked off) still does what the player obviously meant.
    if (input.jump) p.jumpBuffer = BUFFER_TICKS;
    else if (p.jumpBuffer > 0) p.jumpBuffer--;

    if (p.grounded) p.coyote = COYOTE_TICKS;
    else if (p.coyote > 0) p.coyote--;

    if (p.jumpBuffer > 0 && p.coyote > 0) {
        p.vy = JUMP_V;
        p.grounded = false;
        p.jumpBuffer = 0;
        p.coyote = 0;
        p.ducking = false;
        p.duckTicks = 0;
    }

    // --- duck: held, but with a minimum so a tap still clears a bar -----------
    if (input.duck) {
        p.ducking = true;
        p.duckTicks = DUCK_MIN_TICKS;
    } else if (p.duckTicks > 0) {
        p.duckTicks--;
        if (p.duckTicks === 0) p.ducking = false;
    }

    // --- vertical -------------------------------------------------------------
    if (!p.grounded) {
        // Holding duck in the air fast-falls, so you can cut a jump short to get
        // under a bar. Makes duck useful mid-air instead of dead input.
        const g = p.ducking ? FASTFALL_G : GRAVITY;
        p.vy -= g * DT;
        p.y += p.vy * DT;
        if (p.y <= 0) {
            p.y = 0;
            p.vy = 0;
            p.grounded = true;
        }
    }
    return p;
}
