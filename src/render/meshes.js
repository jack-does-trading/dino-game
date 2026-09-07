// Procedural geometry. Nothing is loaded -- every vertex in the game is
// generated here at boot, which is what keeps the payload at zero asset bytes.
//
// All builders emit POSITIONS ONLY. Normals are derived per-fragment from
// screen-space derivatives (see shaders.js), so there is no normal data anywhere.

import { Geometry, Mesh, Transform, Program } from '../../vendor/ogl.min.js';
import { objectVert, objectFrag } from './shaders.js';

export const CORRIDOR_NEAR = -26;
export const CORRIDOR_FAR = 150;
const STEP = 1.5;   // coarse on purpose: the facets are the art direction

/**
 * The corridor: ground plus canyon walls, as one strip of cross-sections.
 * Static in model space -- the walls are displaced in the vertex shader from
 * noise sampled at (z + uTrackZ), so the silhouette translates toward the camera
 * as the track scrolls without a single byte moving on the CPU.
 */
export function buildCorridor(gl) {
    // [x, y, wallT, side]
    const profile = [
        [-9.0, 0.00, 1, -1],
        [-4.6, 0.55, 0, -1],
        [-3.6, 0.00, 0, 0],
        [3.6, 0.00, 0, 0],
        [4.6, 0.55, 0, 1],
        [9.0, 0.00, 1, 1],
    ];
    const rows = Math.round((CORRIDOR_FAR - CORRIDOR_NEAR) / STEP) + 1;
    const cols = profile.length;

    const position = new Float32Array(rows * cols * 3);
    const aWallT = new Float32Array(rows * cols);
    const aSide = new Float32Array(rows * cols);

    let v = 0;
    for (let r = 0; r < rows; r++) {
        const z = CORRIDOR_NEAR + r * STEP;
        for (let c = 0; c < cols; c++) {
            const [x, y, w, s] = profile[c];
            position[v * 3] = x;
            position[v * 3 + 1] = y;
            position[v * 3 + 2] = z;
            aWallT[v] = w;
            aSide[v] = s;
            v++;
        }
    }

    const index = new Uint32Array((rows - 1) * (cols - 1) * 6);
    let i = 0;
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c;
            const b = a + 1;
            const d = a + cols;
            const e = d + 1;
            index[i++] = a; index[i++] = d; index[i++] = b;
            index[i++] = b; index[i++] = d; index[i++] = e;
        }
    }

    return new Geometry(gl, {
        position: { size: 3, data: position },
        aWallT: { size: 1, data: aWallT },
        aSide: { size: 1, data: aSide },
        index: { data: index },
    });
}

/** Unit box, origin at the centre of its base so instance scaling grows upward. */
export function boxPositions(hw = 0.5, h = 1, hd = 0.5, cx = 0, cy = 0, cz = 0) {
    const x0 = cx - hw, x1 = cx + hw;
    const y0 = cy, y1 = cy + h;
    const z0 = cz - hd, z1 = cz + hd;
    // 6 faces x 2 tris x 3 verts, non-indexed so every face is genuinely flat
    const q = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
    return new Float32Array([
        ...q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]), // front
        ...q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]), // back
        ...q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]), // left
        ...q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]), // right
        ...q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]), // top
        ...q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]), // bottom
    ]);
}

/** Merge several boxes into one position buffer -- one draw call per dino part group. */
function mergeBoxes(boxes) {
    const parts = boxes.map((b) => boxPositions(...b));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

function partMesh(gl, program, boxes) {
    return new Mesh(gl, {
        geometry: new Geometry(gl, { position: { size: 3, data: mergeBoxes(boxes) } }),
        program,
    });
}

/** The dino's visual top in world units -- what the 2D intro frames against. */
export const DINO_TOP = 1.53;

/**
 * The dino. ~15 boxes across 4 parts, animated by a Transform hierarchy driven by
 * sin(t) -- no skinning, no bones, no animation data.
 * Returns { root, legL, legR, torso, setColor } so main.js can pose it.
 */
export function buildDino(gl, { color = [0.42, 0.78, 0.45], alpha = 1 } = {}) {
    const mkProgram = () => new Program(gl, {
        vertex: objectVert,
        fragment: objectFrag,
        transparent: alpha < 1,
        depthWrite: alpha >= 1,
        uniforms: {
            uColor: { value: new Float32Array(color) },
            uAlpha: { value: alpha },
            uSun: { value: new Float32Array(3) },
            uCamPos: { value: new Float32Array(3) },
            uFogColor: { value: new Float32Array(3) },
            uFogDensity: { value: 0.018 },
        },
    });

    const body = mkProgram();
    const limb = mkProgram();

    const root = new Transform();

    // torso + head + tail + arms, all in one merged mesh.
    // Proportioned off the Chrome sprite's side-on read: a heavy skull with a
    // jutting snout, a neck visibly thinner than the chest, and a three-segment
    // tail that meets the chest and tapers back. Seen from behind it is mostly
    // chest and skull, so the chest is the widest box and the neck the narrowest.
    // [halfW, height, halfD, cx, cy, cz]   -- cy is the box's BASE, +z is forward
    const torso = partMesh(gl, body, [
        [0.30, 0.60, 0.30, 0, 0.44, 0.06],      // chest
        [0.19, 0.30, 0.14, 0, 0.96, 0.14],      // neck -- deliberately narrow
        [0.27, 0.34, 0.22, 0, 1.16, 0.22],      // skull
        [0.23, 0.13, 0.16, 0, 1.06, 0.50],      // snout, juts out under the brow
        [0.09, 0.09, 0.09, -0.19, 1.44, 0.16],  // brow L
        [0.09, 0.09, 0.09, 0.19, 1.44, 0.16],   // brow R
        [0.08, 0.14, 0.08, -0.27, 0.66, 0.20],  // arm L
        [0.08, 0.14, 0.08, 0.27, 0.66, 0.20],   // arm R
        [0.20, 0.26, 0.22, 0, 0.52, -0.30],     // tail base, meeting the chest
        [0.13, 0.16, 0.20, 0, 0.56, -0.66],     // tail tip
    ]);
    torso.setParent(root);

    // Hip pivot at the bottom of the chest; the leg reaches exactly to y = 0, so
    // the dino stands ON the ground instead of hovering above it.
    const mkLeg = (x) => {
        const pivot = new Transform();
        pivot.position.set(x, 0.46, 0);
        pivot.setParent(root);
        const m = partMesh(gl, limb, [
            [0.12, 0.30, 0.14, 0, -0.30, -0.02],  // thigh: y 0.16..0.46
            [0.10, 0.10, 0.11, 0, -0.40, 0.02],   // shin:  y 0.06..0.16
            [0.14, 0.06, 0.19, 0, -0.46, 0.10],   // foot:  y 0.00..0.06
        ]);
        m.setParent(pivot);
        return pivot;
    };

    return {
        root,
        legL: mkLeg(-0.19),
        legR: mkLeg(0.19),
        programs: [body, limb],
        setColor(c) {
            body.uniforms.uColor.value.set(c);
            limb.uniforms.uColor.value.set(c);
        },
    };
}
