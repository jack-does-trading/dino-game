// Guards the two ways "the controls are wrong" has actually happened here:
// pressing right sending you left, and the run restarting on its own.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInput } from '../src/input.js';
import { laneX, LANES } from '../src/sim/consts.js';

/** A stand-in for `window` that lets us fire events without a DOM. */
function fakeTarget() {
    const handlers = {};
    const el = {
        addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
        fire(type, ev = {}) { for (const fn of handlers[type] || []) fn({ preventDefault() {}, ...ev }); },
    };
    // createInput binds touch to `target.document.body`; give it back itself so
    // both keyboard and touch land on the same fake.
    el.document = { body: el };
    return el;
}
const key = (t, code) => t.fire('keydown', { code });

// --- orientation -------------------------------------------------------------
// The gameplay camera sits behind the dino looking down +z with +y up, which in
// a right-handed frame makes screen-right the -x direction. So world x must
// DECREASE as the lane index increases, or the whole world renders mirrored and
// pressing right visibly moves you left.
test('lane index increases to the right on screen', () => {
    const xs = [...Array(LANES)].map((_, i) => laneX(i));
    for (let i = 1; i < xs.length; i++) {
        assert.ok(xs[i] < xs[i - 1], `lane ${i} must sit right of lane ${i - 1} (x must decrease)`);
    }
    assert.equal(laneX(1), 0, 'the centre lane is the origin');
});

test('lanes are symmetric about the centre', () => {
    assert.equal(laneX(0), -laneX(2));
});

// --- restart -----------------------------------------------------------------
test('restart takes space, enter or a tap -- not any key', () => {
    const t = fakeTarget();
    const input = createInput(t);

    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyX']) {
        key(t, code);
    }
    assert.equal(input.takeConfirm(), false, 'movement keys must not restart the run');

    key(t, 'Space');
    assert.equal(input.takeConfirm(), true);
    assert.equal(input.takeConfirm(), false, 'consumed exactly once');

    key(t, 'Enter');
    assert.equal(input.takeConfirm(), true);
});

// The bug this exists for: `takeAny`/`takeConfirm` are only drained while dead or
// on the error page, never while you are playing. Without the clear() in die(),
// every jump pressed during the run was still counted when it ended and the run
// restarted the instant the gate opened.
test('clear() drops presses banked during a run', () => {
    const t = fakeTarget();
    const input = createInput(t);

    for (let i = 0; i < 20; i++) key(t, 'Space');   // a run's worth of jumping
    input.clear();

    assert.equal(input.takeConfirm(), false, 'a finished run must not restart itself');
    assert.equal(input.takeAny(), false);
    const held = input.take();
    assert.equal(held.jump, false, 'and the jumps must not fire into the next run');
});

test('meta keys are not "any key"', () => {
    const t = fakeTarget();
    const input = createInput(t);
    for (const code of ['Escape', 'KeyP', 'KeyM']) key(t, code);
    assert.equal(input.takeAny(), false, 'pausing or muting must not also restart');
    assert.equal(input.takeConfirm(), false);

    key(t, 'KeyX');
    assert.equal(input.takeAny(), true, 'but an ordinary key still counts');
});

test('arrow keys map to the matching direction', () => {
    const t = fakeTarget();
    const input = createInput(t);

    key(t, 'ArrowRight');
    let inp = input.take();
    assert.equal(inp.right, true);
    assert.equal(inp.left, false);

    key(t, 'ArrowLeft');
    inp = input.take();
    assert.equal(inp.left, true);
    assert.equal(inp.right, false);
});
