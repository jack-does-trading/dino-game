// One-time vendoring step. Produces vendor/ogl.min.js from the ogl npm package,
// tree-shaken down to the handful of modules this game actually uses.
//
// The output is COMMITTED. The game itself has no build step -- it runs as static
// files. Re-run this only when bumping the ogl version.
//
//   node tools/vendor-ogl.mjs

import { build } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const ENTRY = 'tools/.ogl-entry.js';

// Only what we use. Everything else in ogl (loaders, post, text, curves, raycast,
// shadows, textures) stays out of the bundle.
writeFileSync(
    ENTRY,
    `export { Renderer } from '../node_modules/ogl/src/core/Renderer.js';
export { Camera } from '../node_modules/ogl/src/core/Camera.js';
export { Transform } from '../node_modules/ogl/src/core/Transform.js';
export { Geometry } from '../node_modules/ogl/src/core/Geometry.js';
export { Program } from '../node_modules/ogl/src/core/Program.js';
export { Mesh } from '../node_modules/ogl/src/core/Mesh.js';
export { Vec2 } from '../node_modules/ogl/src/math/Vec2.js';
export { Vec3 } from '../node_modules/ogl/src/math/Vec3.js';
export { Mat4 } from '../node_modules/ogl/src/math/Mat4.js';
`
);

const result = await build({
    entryPoints: [ENTRY],
    outfile: 'vendor/ogl.min.js',
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2020',
    legalComments: 'none',
});

unlinkSync(ENTRY);

if (result.errors.length) {
    console.error(result.errors);
    process.exit(1);
}

const raw = readFileSync('vendor/ogl.min.js');
const version = JSON.parse(readFileSync('node_modules/ogl/package.json', 'utf8')).version;

console.log(`vendor/ogl.min.js  <-  ogl@${version}`);
console.log(`  minified: ${(statSync('vendor/ogl.min.js').size / 1024).toFixed(1)} KB`);
console.log(`  gzipped:  ${(gzipSync(raw).length / 1024).toFixed(1)} KB`);
