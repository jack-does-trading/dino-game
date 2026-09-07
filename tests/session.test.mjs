// `#s=` and `#c=` are the whole sharing story, and both are parsed from
// untrusted text at boot. This suite exists because `#s=` silently stopped
// working once: the seed was parsed correctly and then overwritten before the
// first frame, so the URL looked honoured and wasn't.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSession, encodeShare, createRecorder, recordSample, finishRecording } from '../src/replay.js';

const never = () => { throw new Error('should not have needed a random seed'); };
const fixed = () => 12345;

test('#s= is honoured, base 36', () => {
    assert.equal(parseSession('#s=zk9q2', never).seed, parseInt('zk9q2', 36));
    assert.equal(parseSession('s=zk9q2', never).seed, parseInt('zk9q2', 36));
});

test('a seed round-trips through the form the UI prints', () => {
    for (const seed of [0, 1, 59732282, 0xffffffff]) {
        assert.equal(parseSession(`#s=${seed.toString(36)}`, never).seed, seed);
    }
});

test('seed 0 is a real seed, not a falsy fallback', () => {
    assert.equal(parseSession('#s=0', never).seed, 0);
});

test('no fragment, or an unparseable one, falls back to random', () => {
    assert.equal(parseSession('', fixed).seed, 12345);
    assert.equal(parseSession('#', fixed).seed, 12345);
    assert.equal(parseSession('#s=', fixed).seed, 12345);
    assert.equal(parseSession('#s=!!!', fixed).seed, 12345);
});

test('#c= carries seed, score and ghost, and wins over #s=', () => {
    const rec = createRecorder();
    for (let i = 0; i < 40; i++) recordSample(rec, 1 / 60, i * 0.05 - 1, 0.5, false);
    const code = encodeShare(777, 4242, finishRecording(rec));

    const s = parseSession(`#c=${code}&s=zk9q2`, never);
    assert.equal(s.seed, 777);
    assert.equal(s.score, 4242);
    assert.equal(s.shared, true);
    assert.ok(s.ghost && s.ghost.length > 0);
});

test('a corrupt #c= degrades to a normal run instead of throwing', () => {
    const s = parseSession('#c=not-a-real-code', fixed);
    assert.equal(s.shared, false);
    assert.equal(s.seed, 12345);
    assert.equal(s.ghost, null);
});
