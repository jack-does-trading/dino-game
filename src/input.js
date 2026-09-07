// Input -> intent.
//
// left/right/jump are EDGE triggered and queued, because the sim may step more
// than once in a frame and a press must be consumed by exactly one step -- never
// dropped, never applied twice. duck is a held state.

export function createInput(target = window) {
    const q = { left: 0, right: 0, jump: 0 };
    let duck = false;
    let anyPress = 0;

    const press = (k) => { q[k]++; anyPress++; };

    const KEYS = {
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
        ArrowDown: 'duck', KeyS: 'duck',
    };

    function onKeyDown(e) {
        const a = KEYS[e.code];
        if (!a) { anyPress++; return; }
        e.preventDefault();
        if (a === 'duck') { duck = true; anyPress++; }
        else if (!e.repeat) press(a);
    }
    function onKeyUp(e) {
        if (KEYS[e.code] === 'duck') duck = false;
    }

    // --- touch: swipe to strafe, tap to jump, swipe down to duck -------------
    let tx = 0, ty = 0, tt = 0, moved = false;
    const SWIPE = 28;
    function onTouchStart(e) {
        const t = e.changedTouches[0];
        tx = t.clientX; ty = t.clientY; tt = performance.now(); moved = false;
        anyPress++;
    }
    function onTouchMove(e) {
        if (moved) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - tx, dy = t.clientY - ty;
        if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
            press(dx > 0 ? 'right' : 'left'); moved = true;
        } else if (dy > SWIPE) {
            duck = true; moved = true;
        } else if (-dy > SWIPE) {
            press('jump'); moved = true;
        }
        e.preventDefault();
    }
    function onTouchEnd() {
        if (!moved && performance.now() - tt < 250) press('jump');
        duck = false;
    }

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    const el = target.document ? target.document.body : target;
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    const out = { left: false, right: false, jump: false, duck: false };

    return {
        /** Consume one queued press of each kind. Call once per sim step. */
        take() {
            out.left = q.left > 0; if (out.left) q.left--;
            out.right = q.right > 0; if (out.right) q.right--;
            out.jump = q.jump > 0; if (out.jump) q.jump--;
            out.duck = duck;
            return out;
        },
        /** Did anything at all get pressed since the last check? */
        takeAny() { const a = anyPress > 0; anyPress = 0; return a; },
        clear() { q.left = q.right = q.jump = 0; anyPress = 0; },
    };
}
