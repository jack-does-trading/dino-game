// Biomes are pure palette. Eight colour/scalar uniforms and nothing else -- so a
// total visual transformation of the world costs ZERO bytes of payload and zero
// draw calls. This is what keeps the game interesting past minute two.
//
// Transitions are driven by DISTANCE, not elapsed time: time-based pacing would
// show a struggling player and an expert the identical sequence, whereas distance
// ties new scenery to actual progress and makes each change a visible milestone.

const B = (name, o) => ({ name, ...o });

export const BIOMES = [
    B('dawn', {
        skyTop: [0.24, 0.36, 0.62], skyBottom: [0.95, 0.68, 0.45],
        fog: [0.93, 0.72, 0.53], fogDensity: 0.0140,
        ground: [0.82, 0.66, 0.45], wall: [0.62, 0.44, 0.34], lane: [1.0, 0.93, 0.82],
        sun: [0.35, 0.62, 0.70], wallAmp: 4.5, dino: [0.45, 0.76, 0.48],
        obs: [0.46, 0.34, 0.28],
    }),
    B('canyon', {
        skyTop: [0.40, 0.18, 0.22], skyBottom: [0.92, 0.45, 0.26],
        fog: [0.80, 0.40, 0.28], fogDensity: 0.0158,
        ground: [0.72, 0.40, 0.29], wall: [0.50, 0.22, 0.20], lane: [1.0, 0.82, 0.62],
        sun: [-0.40, 0.55, 0.72], wallAmp: 7.5, dino: [0.95, 0.85, 0.45],
        obs: [0.33, 0.16, 0.16],
    }),
    B('storm', {
        skyTop: [0.13, 0.15, 0.20], skyBottom: [0.42, 0.46, 0.52],
        fog: [0.38, 0.42, 0.48], fogDensity: 0.0205,
        ground: [0.34, 0.37, 0.42], wall: [0.21, 0.23, 0.28], lane: [0.72, 0.82, 0.92],
        sun: [0.20, 0.80, 0.55], wallAmp: 8.5, dino: [0.55, 0.85, 0.95],
        obs: [0.16, 0.18, 0.22],
    }),
    B('aurora', {
        skyTop: [0.03, 0.04, 0.12], skyBottom: [0.10, 0.42, 0.40],
        fog: [0.07, 0.20, 0.26], fogDensity: 0.0182,
        ground: [0.12, 0.20, 0.30], wall: [0.08, 0.12, 0.22], lane: [0.45, 0.95, 0.80],
        sun: [-0.25, 0.70, 0.66], wallAmp: 6.0, dino: [0.60, 1.00, 0.72],
        obs: [0.05, 0.09, 0.17],
    }),
];

// The intro palette: the browser's offline error page, rendered in 3D. The WebGL
// world must match the surrounding HTML exactly or the illusion breaks, so these
// track the page's own light/dark colours (#ffffff/#202124, ink #202124/#e8eaed).
// Ground, wall and sky are the SAME colour here, and the corridor is drawn unlit
// at mix 0 -- so the intro really is a blank error page with a dino on it, not a
// dim 3D scene. `lane` is the only mark, and it is held back until you press
// space, at which point it reads as the original game's ground line.
const MONO_LIGHT = {
    skyTop: [1.00, 1.00, 1.00], skyBottom: [1.00, 1.00, 1.00],
    fog: [1.00, 1.00, 1.00], fogDensity: 0.0040,
    ground: [1.00, 1.00, 1.00], wall: [1.00, 1.00, 1.00], lane: [0.535, 0.545, 0.565],
    sun: [0.30, 0.80, 0.52], wallAmp: 0.0,
    dino: [0.36, 0.37, 0.39], obs: [0.40, 0.41, 0.43],
};
const MONO_DARK = {
    skyTop: [0.125, 0.129, 0.141], skyBottom: [0.125, 0.129, 0.141],
    fog: [0.125, 0.129, 0.141], fogDensity: 0.0040,
    ground: [0.125, 0.129, 0.141], wall: [0.125, 0.129, 0.141], lane: [0.365, 0.375, 0.395],
    sun: [0.30, 0.80, 0.52], wallAmp: 0.0,
    dino: [0.83, 0.84, 0.86], obs: [0.72, 0.73, 0.76],
};

const prefersDark = typeof matchMedia === 'function'
    && matchMedia('(prefers-color-scheme: dark)').matches;
export const MONO = prefersDark ? MONO_DARK : MONO_LIGHT;

export const BIOME_LEN = 420;   // world units per biome
const FADE = 130;               // units spent cross-fading into the next

const KEYS = ['skyTop', 'skyBottom', 'fog', 'ground', 'wall', 'lane', 'sun', 'dino', 'obs'];

/** Mutable target so the render loop never allocates. */
export function createBiomeState() {
    const s = { fogDensity: 0, wallAmp: 0 };
    for (const k of KEYS) s[k] = new Float32Array(3);
    return s;
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Resolve the palette at a given distance, writing into `out`. */
export function biomeAt(z, out) {
    const f = z / BIOME_LEN;
    const i = Math.floor(f);
    const a = BIOMES[((i % BIOMES.length) + BIOMES.length) % BIOMES.length];
    const b = BIOMES[((i + 1) % BIOMES.length + BIOMES.length) % BIOMES.length];

    // Hold the palette, then fade over the last FADE units of the band.
    const into = (f - i) * BIOME_LEN;
    const t = into < BIOME_LEN - FADE ? 0 : (into - (BIOME_LEN - FADE)) / FADE;
    const s = t * t * (3 - 2 * t); // smoothstep

    for (const k of KEYS) {
        for (let c = 0; c < 3; c++) out[k][c] = lerp(a[k][c], b[k][c], s);
    }
    out.fogDensity = lerp(a.fogDensity, b.fogDensity, s);
    out.wallAmp = lerp(a.wallAmp, b.wallAmp, s);
    out.name = s < 0.5 ? a.name : b.name;
    return out;
}

/**
 * Blend a resolved palette toward the monochrome 2D look. k=1 is fully mono.
 * `kGeom` controls the canyon walls separately, because they must stay flat until
 * the camera has moved inside the corridor -- growing them early leaves the
 * camera outside a wall, looking at its culled back face.
 */
export function blendMono(out, k, kGeom = k) {
    if (k <= 0 && kGeom <= 0) return out;
    if (k > 0) {
        for (const key of KEYS) {
            for (let c = 0; c < 3; c++) out[key][c] = lerp(out[key][c], MONO[key][c], k);
        }
        out.fogDensity = lerp(out.fogDensity, MONO.fogDensity, k);
    }
    out.wallAmp = lerp(out.wallAmp, MONO.wallAmp, kGeom);
    return out;
}
