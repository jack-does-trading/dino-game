// The simulation. Headless: imports nothing from render/audio/DOM, so it runs
// under `node --test`. That is what makes the solvability fuzz possible.

import { DT, speedAt, CHUNK_LEN } from './consts.js';
import { Track } from './track.js';
import { createPlayer, stepPlayer } from './player.js';
import { collide } from './collide.js';

const NEAR_RANGE = 2.0;      // how far ahead/behind to test obstacles
const MULT_MAX = 3;
const MULT_PER_NEAR = 0.25;
const MULT_DECAY = 0.25;     // per second, back toward 1

export function createSim(seed, flat = false) {
    return {
        seed: seed | 0,
        tick: 0,
        elapsed: 0,
        z: 0,
        speed: speedAt(0),
        player: createPlayer(),
        track: new Track(seed | 0, 6, 2, flat),
        score: 0,
        mult: 1,
        nearCount: 0,
        alive: true,
        // one-tick event flags, consumed by render/audio each frame
        events: { jumped: false, landed: false, near: 0, died: false },
        _near: [],
    };
}

export const NO_INPUT = { left: false, right: false, jump: false, duck: false };

export function stepSim(s, input) {
    const ev = s.events;
    ev.jumped = ev.landed = ev.died = false;
    ev.near = 0;
    if (!s.alive) return s;

    s.tick++;
    s.elapsed = s.tick * DT;
    s.speed = speedAt(s.elapsed);
    s.z += s.speed * DT;

    const wasGrounded = s.player.grounded;
    stepPlayer(s.player, input);
    if (wasGrounded && !s.player.grounded) ev.jumped = true;
    if (!wasGrounded && s.player.grounded) ev.landed = true;

    s.track.update(s.z);
    const near = s.track.near(s.z, NEAR_RANGE, s._near);

    const { hit, near: nearHits } = collide(
        near, s.player.lane, s.player.y, s.player.ducking, s.z
    );

    if (hit) {
        s.alive = false;
        ev.died = true;
        return s;
    }

    // Count each obstacle's near-miss once, not once per tick.
    if (nearHits) {
        for (const o of near) {
            if (o._counted) continue;
            const r = collide([o], s.player.lane, s.player.y, s.player.ducking, s.z);
            if (r.near) {
                o._counted = true;
                s.nearCount++;
                ev.near++;
                s.mult = Math.min(MULT_MAX, s.mult + MULT_PER_NEAR);
            }
        }
    }
    if (s.mult > 1) s.mult = Math.max(1, s.mult - MULT_DECAY * DT);

    // Distance-primary, risk-multiplied.
    s.score += s.speed * DT * s.mult * 0.1;
    return s;
}

export const scoreOf = (s) => Math.floor(s.score);
export const chunkOf = (s) => Math.floor(s.z / CHUNK_LEN);
