// The service worker's precache list is hand-maintained, because the project has
// no build step to generate one. That makes exactly one mistake possible and
// likely: add a module, forget to list it, and the game silently stops working
// offline for everyone who already installed it -- while working perfectly for
// you, because you are online. This test is the guard against that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function walk(dir, out = []) {
    for (const name of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
        else out.push(rel);
    }
    return out;
}

const precache = (() => {
    const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
    const body = sw.slice(sw.indexOf('const PRECACHE = ['), sw.indexOf('];', sw.indexOf('const PRECACHE = [')));
    return [...body.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]);
})();

test('every shipped file is precached', () => {
    const shipped = [
        'index.html',
        'manifest.webmanifest',
        'vendor/ogl.min.js',
        ...walk('src'),
        ...walk('icons'),
    ];
    const missing = shipped.filter((f) => !precache.includes(f));
    assert.deepEqual(missing, [], `not in sw.js PRECACHE: ${missing.join(', ')}`);
});

test('nothing precached has gone missing', () => {
    const gone = precache.filter((f) => f !== '' && !statSync(join(ROOT, f), { throwIfNoEntry: false }));
    assert.deepEqual(gone, [], `listed in sw.js but not on disk: ${gone.join(', ')}`);
});

test('the scope root is precached, so a bare visit works offline', () => {
    assert.ok(precache.includes(''), "PRECACHE must contain './'");
});
