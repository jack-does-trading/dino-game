// Lane-indexed AABB collision.
//
// Lane is a discrete integer committed the instant you press, so the horizontal
// test is an index comparison rather than a swept box -- the visual position
// lerping behind is purely cosmetic. This is deliberately forgiving: you escape
// danger the moment you press, which avoids the "I was visually clear and still
// got hit" complaint that continuous-x collision produces.

import {
    OBSTACLE_BOX, BAR, laneX,
    PLAYER_H, PLAYER_DUCK_H, PLAYER_HALF_D, NEAR_MISS_DIST,
} from './consts.js';

/** Does this obstacle occupy the player's lane at all? */
function inLane(o, lane) {
    return o.type === BAR || o.lane === lane;
}

/**
 * Returns 'hit' | 'near' | null for one obstacle.
 * 'near' means you got through with very little clearance -- used for the
 * score multiplier and the audio sting.
 */
export function testObstacle(o, lane, y, ducking, z) {
    const [, yMin, yMax, halfD] = OBSTACLE_BOX[o.type];

    const dz = Math.abs(o.z - z);
    if (dz > halfD + PLAYER_HALF_D) return null;

    const pTop = y + (ducking ? PLAYER_DUCK_H : PLAYER_H);
    const pBot = y;

    if (!inLane(o, lane)) {
        // Passing beside it. Only the immediate neighbour lane counts as close.
        if (o.type !== BAR && Math.abs(laneX(o.lane) - laneX(lane)) < 2.5) return 'near';
        return null;
    }

    const overlapsY = pTop > yMin && pBot < yMax;
    if (overlapsY) return 'hit';

    // Cleared it vertically -- how narrowly?
    const clearance = pBot >= yMax ? pBot - yMax : yMin - pTop;
    return clearance < NEAR_MISS_DIST ? 'near' : null;
}

/**
 * Sweep the player against nearby obstacles.
 * Returns { hit: bool, near: int } -- near counts distinct near-misses this tick.
 */
export function collide(obstacles, lane, y, ducking, z) {
    let hit = false;
    let near = 0;
    for (let i = 0; i < obstacles.length; i++) {
        const r = testObstacle(obstacles[i], lane, y, ducking, z);
        if (r === 'hit') hit = true;
        else if (r === 'near') near++;
    }
    return { hit, near };
}
