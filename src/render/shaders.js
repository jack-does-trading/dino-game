// GLSL 300 es. WebGL2 is required for instancing and for dFdx/dFdy in core.

// --- shared fragment tail ----------------------------------------------------
// Flat shading WITHOUT a normal attribute: the screen-space derivative of world
// position gives the face plane directly, so all geometry ships positions only.
// Halves vertex data and removes normal generation from the mesh builders.
const LIGHTING = /* glsl */ `
vec3 flatNormal(vec3 wp) {
    return normalize(cross(dFdx(wp), dFdy(wp)));
}
vec3 shade(vec3 albedo, vec3 wp, vec3 sun, vec3 camPos, vec3 fogColor, float fogDensity) {
    vec3 n = flatNormal(wp);
    float d = max(dot(n, normalize(sun)), 0.0);
    // Headlight fill. The runner is always viewed from behind, so any sun that
    // lights the world leaves the player permanently in shadow -- the dino and
    // the obstacles you must read at speed both render nearly black without this.
    float fill = max(dot(n, normalize(camPos - wp)), 0.0);
    vec3 c = albedo * (0.30 + 0.62 * d + 0.36 * fill);
    float dist = length(wp - camPos);
    float f = 1.0 - exp(-pow(dist * fogDensity, 2.0));
    return mix(c, fogColor, clamp(f, 0.0, 1.0));
}`;

// Cheap value noise, used only for the canyon silhouette. Cosmetic -- nothing
// here needs to agree with the sim.
const NOISE = /* glsl */ `
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}
float vnoise(float x) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), f);
}
float wallHeight(float wz, float side, float amp) {
    float n = vnoise(wz * 0.055 + side * 31.0) * 0.62
            + vnoise(wz * 0.170 + side * 11.0) * 0.27
            + vnoise(wz * 0.300 + side *  7.0) * 0.11;
    return 1.2 + n * amp;
}`;

// --- corridor ----------------------------------------------------------------
// One static mesh. It never changes: the world scrolls by feeding uTrackZ into
// the noise, so the canyon reshapes itself forever at zero CPU cost.
// One draw call, forever.
export const corridorVert = /* glsl */ `#version 300 es
in vec3 position;
in float aWallT;   // 0 = ground, 1 = wall crest
in float aSide;    // -1 left, +1 right, 0 ground

uniform mat4 modelViewMatrix, projectionMatrix;
uniform float uTrackZ;
uniform float uWallAmp;

out vec3 vWorld;
out float vWallT;
out float vLocalX;
out float vTrackZ;
${NOISE}
void main() {
    vec3 p = position;
    float wz = p.z + uTrackZ;
    p.y += aWallT * wallHeight(wz, aSide, uWallAmp);

    vWallT = aWallT;
    vLocalX = position.x;
    vTrackZ = wz;
    vWorld = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const corridorFrag = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in float vWallT;
in float vLocalX;
in float vTrackZ;

uniform vec3 uSun, uCamPos, uFogColor, uGroundColor, uWallColor, uLaneColor;
uniform float uFogDensity;
// uFlat 1 = unlit albedo (the flat error page); uMarks fades the road markings in.
uniform float uFlat, uMarks;

out vec4 FragColor;
${LIGHTING}
void main() {
    vec3 albedo = mix(uGroundColor, uWallColor, smoothstep(0.05, 0.65, vWallT));

    // Road markings stop at the shoulder. wallT alone is not enough: it stays 0
    // across the 1-unit ramp up to the canyon foot, so the rungs used to climb it.
    float road = 1.0 - smoothstep(3.40, 3.62, abs(vLocalX));
    if (vWallT < 0.02 && road > 0.0) {
        // Lane boundaries. Without these you cannot tell which lane you are in,
        // which matters far more than it sounds at speed.
        float b = min(abs(abs(vLocalX) - 1.0), abs(abs(vLocalX) - 3.0));
        albedo = mix(albedo, uLaneColor, (1.0 - smoothstep(0.0, 0.075, b)) * 0.55 * road * uMarks);

        // Transverse rungs -- the main source of perceived speed.
        float rung = smoothstep(0.86, 0.995, fract(vTrackZ * 0.25));
        albedo = mix(albedo, uLaneColor, rung * 0.20 * road * uMarks);
    }
    vec3 lit = shade(albedo, vWorld, uSun, uCamPos, uFogColor, uFogDensity);
    FragColor = vec4(mix(lit, albedo, uFlat), 1.0);
}`;

// --- instanced obstacles -----------------------------------------------------
// Every obstacle in the world in ONE draw call.
export const obstacleVert = /* glsl */ `#version 300 es
in vec3 position;
in vec3 aOffset;
in vec3 aScale;
in vec3 aColor;

uniform mat4 modelViewMatrix, projectionMatrix;

out vec3 vWorld;
out vec3 vColor;
void main() {
    vec3 p = position * aScale + aOffset;
    vWorld = p;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const objectFrag = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vColor;

uniform vec3 uSun, uCamPos, uFogColor;
uniform float uFogDensity;
uniform float uAlpha;

out vec4 FragColor;
${LIGHTING}
void main() {
    FragColor = vec4(shade(vColor, vWorld, uSun, uCamPos, uFogColor, uFogDensity), uAlpha);
}`;

// --- simple (dino parts) -----------------------------------------------------
export const objectVert = /* glsl */ `#version 300 es
in vec3 position;
uniform mat4 modelViewMatrix, projectionMatrix, modelMatrix;
uniform vec3 uColor;
out vec3 vWorld;
out vec3 vColor;
void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vColor = uColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// --- sky ---------------------------------------------------------------------
// Fullscreen triangle, drawn first with depth writes off.
export const skyVert = /* glsl */ `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

export const skyFrag = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uSkyTop, uSkyBottom;
out vec4 FragColor;
void main() {
    FragColor = vec4(mix(uSkyBottom, uSkyTop, pow(vUv.y, 0.85)), 1.0);
}`;
