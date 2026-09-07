import { Renderer, Camera, Transform, Geometry, Program, Mesh } from '../../vendor/ogl.min.js';
import {
    corridorVert, corridorFrag, obstacleVert, objectFrag, skyVert, skyFrag,
} from './shaders.js';
import { buildCorridor, buildDino, boxPositions, CORRIDOR_FAR, DINO_TOP } from './meshes.js';
import { createBiomeState, biomeAt, blendMono } from './biomes.js';
import { OBSTACLE_BOX, BAR, laneX, SPEED_BASE, SPEED_MAX_MULT } from '../sim/consts.js';

const MAX_INSTANCES = 192;
const TINT = [
    [1.10, 1.02, 0.86],  // ROCK   -- warm, jumpable
    [0.86, 0.92, 1.12],  // PILLAR -- cool, reads as "cannot jump this"
    [1.28, 0.74, 0.70],  // BAR    -- hostile red-shift, the one that kills you
];

// The camera lives on an arc around the dino. The 2D intro and the 3D game are
// just two points on it, so "animate from the original into 3D" is one lerp of
// this pose -- a 90-degree swing from side-on to behind-the-back, with the long
// lens opening up as it goes.
//
// angle: 0 = behind the dino, -PI/2 = side-on from its left (the original's view)
// sway:  how much the camera reacts to lane changes and jumps (0 in 2D)
// Eye level with the dino + a long lens = the ground collapses to a line and the
// perspective flattens, which is what sells it as the original 2D game.
// `ahead` aims down-track, pushing the dino to the left third of frame as it sits
// in the original.
// Eye level with the dino, far back on a long lens: the ground collapses to a
// line and the perspective flattens, which is what sells it as the original.
// `ahead` aims slightly down-track so the dino sits left of centre as it does in
// the original, with obstacles entering from the right edge. `lookY` sits well
// below the dino, pushing it into the upper third so the error-page text has
// room underneath it.
const POSE_2D = { angle: -Math.PI / 2, dist: 60, height: 1.30, fov: 10.5, lookY: -1.70, ahead: 3.4, sway: 0 };
const POSE_3D = { angle: 0, dist: 8.5, height: 4.05, fov: 58, lookY: 1.35, ahead: 14, sway: 1 };

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

export function createRenderer(canvas) {
    const renderer = new Renderer({
        canvas, antialias: true, alpha: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
    const gl = renderer.gl;
    if (!renderer.isWebgl2) throw new Error('WebGL2 required');

    const camera = new Camera(gl, { fov: 58, near: 0.1, far: CORRIDOR_FAR + 40 });
    const scene = new Transform();
    const biome = createBiomeState();

    // --- sky: fullscreen triangle, no depth ---------------------------------
    const skyProgram = new Program(gl, {
        vertex: skyVert, fragment: skyFrag,
        depthTest: false, depthWrite: false, cullFace: null,
        uniforms: {
            uSkyTop: { value: biome.skyTop },
            uSkyBottom: { value: biome.skyBottom },
        },
    });
    const sky = new Mesh(gl, {
        geometry: new Geometry(gl, {
            position: { size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3]) },
        }),
        program: skyProgram,
    });

    // --- corridor: one mesh, one draw call, forever -------------------------
    const corridorProgram = new Program(gl, {
        vertex: corridorVert, fragment: corridorFrag,
        uniforms: {
            uTrackZ: { value: 0 },
            uWallAmp: { value: 5 },
            uFlat: { value: 1 },
            uMarks: { value: 0 },
            uSun: { value: biome.sun },
            uCamPos: { value: new Float32Array(3) },
            uFogColor: { value: biome.fog },
            uFogDensity: { value: 0.018 },
            uGroundColor: { value: biome.ground },
            uWallColor: { value: biome.wall },
            uLaneColor: { value: biome.lane },
        },
    });
    new Mesh(gl, { geometry: buildCorridor(gl), program: corridorProgram }).setParent(scene);

    // --- obstacles: every one of them in a single instanced draw call -------
    const offsets = new Float32Array(MAX_INSTANCES * 3);
    const scales = new Float32Array(MAX_INSTANCES * 3);
    const colors = new Float32Array(MAX_INSTANCES * 3);
    const obstacleGeo = new Geometry(gl, {
        position: { size: 3, data: boxPositions(0.5, 1, 0.5) },
        aOffset: { size: 3, data: offsets, instanced: 1, usage: gl.DYNAMIC_DRAW },
        aScale: { size: 3, data: scales, instanced: 1, usage: gl.DYNAMIC_DRAW },
        aColor: { size: 3, data: colors, instanced: 1, usage: gl.DYNAMIC_DRAW },
    });
    const obstacleProgram = new Program(gl, {
        vertex: obstacleVert, fragment: objectFrag,
        uniforms: {
            uSun: { value: biome.sun },
            uCamPos: { value: new Float32Array(3) },
            uFogColor: { value: biome.fog },
            uFogDensity: { value: 0.018 },
            uAlpha: { value: 1 },
        },
    });
    const obstacleMesh = new Mesh(gl, { geometry: obstacleGeo, program: obstacleProgram });
    obstacleMesh.setParent(scene);

    const dino = buildDino(gl);
    dino.root.setParent(scene);

    // Translucent second dino for ghost racing. Same builder, so it costs one
    // extra line and zero extra geometry code.
    const ghost = buildDino(gl, { alpha: 0.4 });
    ghost.root.setParent(scene);
    ghost.root.visible = false;

    const shared = [corridorProgram, obstacleProgram, ...dino.programs, ...ghost.programs];

    // --- camera rig state (persisted across frames) -------------------------
    const rig = { x: 0, roll: 0, fov: 58, fovBonus: 0, shake: 0, dinoX: 0, runPhase: 0, marks: 0 };
    const scratch = [];

    // Screen rect (CSS px) the dino must occupy in the flat intro. The error page
    // is laid out by the real Chrome stylesheet, so instead of moving the page to
    // wherever the model happens to project, we bend the projection so the model
    // lands exactly in the runner canvas's 44x47 box. Released as `mix` rises.
    const fit = { on: false, x: 0, y: 0, w: 44, h: 47 };
    function setFit(x, y, w, h) { fit.on = true; fit.x = x; fit.y = y; fit.w = w; fit.h = h; }

    // Size from the viewport, NOT canvas.clientWidth. ogl's constructor calls
    // setSize(300, 150) and writes INLINE style.width/height, which beats the
    // stylesheet -- so clientWidth reads back 300 forever and the canvas latches
    // at its default size. Reading the viewport breaks the feedback loop.
    function resize() {
        const w = window.innerWidth || canvas.clientWidth || 800;
        const h = window.innerHeight || canvas.clientHeight || 600;
        renderer.setSize(w, h);
        camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    }

    /** Adaptive resolution: give up pixels before giving up frames. */
    let quality = 1;
    function setQuality(q) {
        if (q === quality) return;
        quality = q;
        renderer.dpr = Math.min(window.devicePixelRatio || 1, 2) * q;
        resize();
    }

    function render(sim, dt, time, ghostPose, mix = 1, running = true) {
        const p = sim.player;

        biomeAt(sim.z, biome);
        // Palette crosses over early; the canyon only grows once we are inside it.
        blendMono(biome, 1 - smoothstep(0.10, 0.85, mix), 1 - smoothstep(0.55, 1.0, mix));
        corridorProgram.uniforms.uTrackZ.value = sim.z;
        corridorProgram.uniforms.uWallAmp.value = biome.wallAmp;
        // Unlit while the error page is up, so ground and sky are one flat colour
        // and there is nothing to see but the dino.
        corridorProgram.uniforms.uFlat.value = 1 - smoothstep(0.0, 0.35, mix);
        // The ground line arrives with the run, exactly as it does in the original.
        rig.marks += ((running ? 1 : 0) - rig.marks) * (1 - Math.exp(-dt * 4));
        corridorProgram.uniforms.uMarks.value = rig.marks;
        dino.setColor(biome.dino);
        for (const prog of shared) prog.uniforms.uFogDensity.value = biome.fogDensity;

        // --- camera: pose on the 2D<->3D arc, then lag and bank ---------------
        // `mix` is 0 in the flat intro and 1 in full 3D. Everything the camera
        // does interpolates along it, so the transition is genuinely continuous
        // rather than a cut between two cameras.
        // Distance collapses BEFORE the angle swings, so the camera flies in to the
        // corridor first and only then arcs around behind the dino. Swinging at
        // full distance would drag it through the canyon walls.
        const eDist = smoothstep(0.00, 0.55, mix);
        const eAngle = smoothstep(0.22, 1.00, mix);
        const e = smoothstep(0.10, 0.95, mix);

        const angle = lerp(POSE_2D.angle, POSE_3D.angle, eAngle);
        const dist = lerp(POSE_2D.dist, POSE_3D.dist, eDist);
        const height = lerp(POSE_2D.height, POSE_3D.height, e);
        const lookY = lerp(POSE_2D.lookY, POSE_3D.lookY, e);
        const ahead = lerp(POSE_2D.ahead, POSE_3D.ahead, e);
        const sway = lerp(POSE_2D.sway, POSE_3D.sway, smoothstep(0.55, 1, mix));
        const baseFov = lerp(POSE_2D.fov, POSE_3D.fov, eDist);

        const targetX = laneX(p.lane) * sway;
        const kCam = 1 - Math.exp(-dt * 9);
        const lag = targetX - rig.x;
        rig.x += lag * kCam;
        rig.roll += (lag * -0.085 - rig.roll) * (1 - Math.exp(-dt * 10));

        // FOV widens with speed -- one uniform, enormous perceived-speed effect.
        // Only the speed BONUS is eased: `baseFov` is already smooth in `mix`, and
        // easing it too added a second, slower transition that fought the swing
        // and left the intro sitting at the wrong focal length.
        const sp = (sim.speed - SPEED_BASE) / (SPEED_BASE * (SPEED_MAX_MULT - 1));
        rig.fovBonus += (sp * 14 * sway - rig.fovBonus) * (1 - Math.exp(-dt * 3));
        rig.fov = baseFov + rig.fovBonus;

        rig.shake = Math.max(0, rig.shake - dt * 3.2);
        const sh = rig.shake * rig.shake;
        const jx = Math.sin(time * 97.0) * sh * 0.5;
        const jy = Math.sin(time * 131.0) * sh * 0.4;

        const cx = Math.sin(angle) * dist + rig.x * 0.55 + jx;
        const cy = height + p.y * 0.30 * sway + jy;
        const cz = -Math.cos(angle) * dist;
        const tx = rig.x * 0.30;
        const ty = lookY + p.y * 0.45 * sway;
        const tz = ahead;

        camera.position.set(cx, cy, cz);
        // Aim by Euler directly: ogl's default order is YXZ, i.e. yaw->pitch->roll,
        // so roll composes cleanly. camera.lookAt() would overwrite the bank.
        let fx = tx - cx, fy = ty - cy, fz = tz - cz;
        const fl = Math.hypot(fx, fy, fz);
        fx /= fl; fy /= fl; fz /= fl;
        camera.rotation.set(Math.asin(fy), Math.atan2(-fx, -fz), rig.roll);
        camera.perspective({ fov: rig.fov });
        camera.updateMatrixWorld();
        applyFit(fit.on ? 1 - smoothstep(0.0, 0.30, mix) : 0);

        const cp = camera.position;
        for (const prog of shared) prog.uniforms.uCamPos.value.set([cp.x, cp.y, cp.z]);

        // --- obstacles -------------------------------------------------------
        sim.track.near(sim.z + CORRIDOR_FAR * 0.5, CORRIDOR_FAR * 0.5 + 30, scratch);
        let n = 0;
        for (const o of scratch) {
            if (n >= MAX_INSTANCES) break;
            const dz = o.z - sim.z;
            if (dz < -dist - 3 || dz > CORRIDOR_FAR) continue;
            const [halfW, yMin, yMax] = OBSTACLE_BOX[o.type];
            const halfD = OBSTACLE_BOX[o.type][3];
            const i = n * 3;
            offsets[i] = o.type === BAR ? 0 : laneX(o.lane);
            offsets[i + 1] = yMin;
            offsets[i + 2] = dz;
            scales[i] = halfW * 2;
            scales[i + 1] = yMax - yMin;
            scales[i + 2] = halfD * 2;
            // Tints fade in with the 3D world; at mix 0 they are neutral, or the
            // "monochrome" error page renders its obstacles warm tan.
            const t = TINT[o.type];
            colors[i] = Math.min(1, biome.obs[0] * lerp(1, t[0], mix));
            colors[i + 1] = Math.min(1, biome.obs[1] * lerp(1, t[1], mix));
            colors[i + 2] = Math.min(1, biome.obs[2] * lerp(1, t[2], mix));
            n++;
        }
        obstacleGeo.attributes.aOffset.needsUpdate = true;
        obstacleGeo.attributes.aScale.needsUpdate = true;
        obstacleGeo.attributes.aColor.needsUpdate = true;
        obstacleGeo.setInstancedCount(n);

        // --- dino ------------------------------------------------------------
        rig.dinoX += (laneX(p.lane) * sway - rig.dinoX) * (1 - Math.exp(-dt * 18));
        dino.root.position.set(rig.dinoX, p.y, 0);
        dino.root.rotation.z = (laneX(p.lane) * sway - rig.dinoX) * -0.22;

        const duck = p.ducking ? 1 : 0;
        dino.root.scale.set(1, p.ducking ? 0.62 : 1, 1);
        dino.root.rotation.x = duck * 0.35;

        if (p.grounded) {
            if (running) rig.runPhase += dt * sim.speed * 0.85;
            const sw = Math.sin(rig.runPhase);
            dino.legL.rotation.x = sw * 0.85;
            dino.legR.rotation.x = -sw * 0.85;
        } else {
            dino.legL.rotation.x += (0.55 - dino.legL.rotation.x) * 0.2;
            dino.legR.rotation.x += (-0.35 - dino.legR.rotation.x) * 0.2;
        }

        // --- ghost ------------------------------------------------------------
        ghost.root.visible = !!ghostPose;
        if (ghostPose) {
            ghost.setColor(biome.lane);
            ghost.root.position.set(ghostPose.x, ghostPose.y, 0.6);
            ghost.root.scale.set(1, ghostPose.ducking ? 0.62 : 1, 1);
            ghost.root.rotation.x = ghostPose.ducking ? 0.35 : 0;
            ghost.legL.rotation.x = dino.legL.rotation.x;
            ghost.legR.rotation.x = dino.legR.rotation.x;
        }

        renderer.render({ scene: sky, camera, clear: true });
        renderer.render({ scene, camera, clear: false });
    }

    /**
     * Bend the projection so the dino's screen box matches `fit`, then relax it
     * back to identity as `k` falls to 0. Only clip-space x/y are touched -- a
     * uniform scale plus a translate -- so nothing about the camera, the depth
     * buffer or the world changes; it is purely how the frustum is framed.
     *
     * perspective() rebuilds projectionMatrix every frame, so this never
     * accumulates across frames.
     */
    const ndc = { x: 0, y: 0 };
    function ndcOf(y) {
        const m = camera.projectionViewMatrix;
        const w = m[7] * y + m[15];
        ndc.x = (m[4] * y + m[12]) / w;
        ndc.y = (m[5] * y + m[13]) / w;
        return ndc;
    }
    function applyFit(k) {
        if (k <= 0.001) return;
        const W = window.innerWidth, H = window.innerHeight;
        const wantFeetX = ((fit.x + fit.w * 0.5) / W) * 2 - 1;
        const wantFeetY = 1 - ((fit.y + fit.h) / H) * 2;
        const wantHeadY = 1 - (fit.y / H) * 2;

        const f = ndcOf(0), fx = f.x, fy = f.y;
        const hy = ndcOf(DINO_TOP).y;
        const span = hy - fy;
        if (!(Math.abs(span) > 1e-6)) return;

        let sc = (wantHeadY - wantFeetY) / span;
        if (!isFinite(sc) || sc <= 0) return;
        let tx = wantFeetX - sc * fx;
        let ty = wantFeetY - sc * fy;
        sc = 1 + (sc - 1) * k; tx *= k; ty *= k;

        // P' = A . P, where A scales clip x/y by `sc` and translates by (tx, ty).
        // Column-major: element (row r, col c) is m[c * 4 + r].
        const m = camera.projectionMatrix;
        for (let c = 0; c < 4; c++) {
            const w = m[c * 4 + 3];
            m[c * 4 + 0] = sc * m[c * 4 + 0] + tx * w;
            m[c * 4 + 1] = sc * m[c * 4 + 1] + ty * w;
        }
        camera.updateMatrixWorld();
    }

    return {
        renderer, camera, resize, setQuality, render, biome, setFit,
        /** The dino's smoothed visual x -- this is what the ghost records. */
        get dinoX() { return rig.dinoX; },
        shake: (amount) => { rig.shake = Math.min(1.6, rig.shake + amount); },
        reset: () => { rig.x = rig.dinoX = rig.roll = rig.shake = rig.fovBonus = rig.marks = 0; },
    };
}
