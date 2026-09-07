// Shared world constants. Sim-side only -- no rendering units here.

export const LANES = 3;
export const LANE_W = 2.0;              // world units between lane centres
// Lane 0 is the LEFT lane on screen, so x must count DOWN with the lane index.
// The gameplay camera sits behind the dino looking down +z with +y up, and in a
// right-handed frame that makes screen-right the -x direction -- counting up
// here silently mirrors the world, so pressing right sends you left.
export const laneX = (i) => (1 - i) * LANE_W;

export const CHUNK_LEN = 24;            // world units per chunk
export const SLOT_DZ = [4, 12, 20];     // obstacle slots within a chunk, 8 apart

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

// Jump tuned for ~0.45s airtime, ~1.40u apex (clears a 1.0u rock with margin).
// airtime = 2v/g = 24.8/55 = 0.451s   apex = v^2/2g = 1.398u
export const GRAVITY = 55;
export const JUMP_V = 12.4;
export const FASTFALL_G = 140;          // holding duck in the air drops you hard

export const PLAYER_H = 1.6;
export const PLAYER_DUCK_H = 0.8;
export const PLAYER_HALF_W = 0.4;
export const PLAYER_HALF_D = 0.4;

export const DUCK_MIN_TICKS = 12;       // so a tap still ducks you under a bar

export const COYOTE_TICKS = 5;          // grace after leaving the ground
export const BUFFER_TICKS = 8;          // grace for pressing jump slightly early

// Speed ramps to 2.2x over 90s then plateaus -- past that, required reaction time
// drops below human limits and outcomes stop being skill-determined. Further
// difficulty comes from pattern complexity instead.
export const SPEED_BASE = 14;
export const SPEED_MAX_MULT = 2.2;
export const SPEED_RAMP_S = 90;

export const NEAR_MISS_DIST = 0.85;     // lateral/vertical clearance counted as a near miss

// Obstacle types
export const ROCK = 0;                  // low, one lane, jump over it
export const PILLAR = 1;                // tall, one lane, must strafe around
export const BAR = 2;                   // full width, hangs low, must duck

// [halfW, yMin, yMax, halfD] per type. BAR's halfW covers all three lanes.
// Heights are capped below CAM_Y (see renderer): the camera flies over every
// obstacle, and anything taller sweeps through the lens and blanks the screen.
// A bar must still sit above a ducking player (0.8) and below a standing one (1.6).
export const OBSTACLE_BOX = [
    [0.55, 0.0, 1.00, 0.5],
    [0.55, 0.0, 2.90, 0.5],
    [LANE_W * 1.5 + 0.55, 1.15, 2.80, 0.5],
];

export const speedAt = (elapsed) =>
    SPEED_BASE * (1 + (SPEED_MAX_MULT - 1) * Math.min(1, elapsed / SPEED_RAMP_S));
