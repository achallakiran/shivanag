import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../src/game/match';
import { gradeOf, resolveHit, windowsFor, stanceFit } from '../src/game/rules';

const priv = (m: Match) => m as unknown as { arrival: number };

// Plays an over: swipes `offset` seconds off perfect timing on every ball (null = never swings).
function playOver(offset: number | null, swipe: [number, number, number] = [0, 1, 2.5], stance = 0): Match {
  const m = new Match();
  m.setStance(stance);
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 240 * 120) {
    if (offset !== null && m.phase === 'flight' && !m.swing && priv(m).arrival - m.t <= 0.18 + offset) m.swipe(...swipe);
    if (m.phase === 'wait') m.setStance(stance);
    m.step();
  }
  return m;
}

test('an over finishes after six balls', () => {
  const m = playOver(0);
  assert.equal(m.phase, 'over');
  assert.equal(m.index, 6);
  assert.equal(m.history.length, 6);
});

test('never swinging gets bowled by straight balls and the over still ends', () => {
  const m = playOver(null);
  assert.equal(m.index, 6);
  assert.ok(m.wickets >= 1);
  assert.equal(m.runs, 0);
});

test('perfectly timed swings score runs', () => {
  const m = playOver(0, [0, 1, 3], 2);
  assert.ok(m.runs > 0, `runs ${m.runs}`);
});

test('the game is deterministic', () => {
  const a = playOver(0.03);
  const b = playOver(0.03);
  assert.deepEqual(a.history, b.history);
  assert.equal(a.runs, b.runs);
});

test('swings far too early or late miss', () => {
  for (const off of [0.5, -0.5]) {
    const m = playOver(off);
    assert.ok(m.history.every((h) => h === '.' || h === 'W'), `${off}: ${m.history.join(' ')}`);
  }
});

test('timing grades widen for the first balls and narrow later', () => {
  assert.ok(windowsFor(0).good > windowsFor(5).good);
  const w = windowsFor(0);
  assert.equal(gradeOf(0, w), 'perfect');
  assert.equal(gradeOf(0.08, w), 'good');
  assert.equal(gradeOf(0.15, w), 'mistimed');
  assert.equal(gradeOf(-0.5, w), 'miss');
});

test('a perfect hit goes where the swipe points and faster swipes hit harder', () => {
  const base = { e: 0, w: windowsFor(0), stance: 2, length: 3.5, height: 0.4, lateral: 0.1, dx: 0, dy: 1, speed: 1.2 };
  const slow = resolveHit(base);
  const fast = resolveHit({ ...base, speed: 3.5 });
  assert.ok(slow.hit && fast.hit);
  assert.ok(slow.vel[2] > 0 && Math.abs(slow.vel[0]) < 1e-6);
  assert.ok(fast.vel[2] > slow.vel[2] && fast.vel[1] > slow.vel[1]);
  const right = resolveHit({ ...base, dx: 1, dy: 0.2 });
  assert.ok(right.vel[0] > 0);
});

test('early and late are named, and wide balls are missed', () => {
  const base = { e: 0.09, w: windowsFor(0), stance: 0, length: 4, height: 0.5, lateral: 0, dx: 0, dy: 1, speed: 2 };
  assert.equal(resolveHit(base).text, 'Early');
  assert.equal(resolveHit({ ...base, e: -0.09 }).text, 'Late');
  assert.equal(resolveHit({ ...base, e: 0 }).text, 'PERFECT');
  assert.equal(resolveHit({ ...base, lateral: 1.5 }).hit, false);
});

test('stances suit different lengths', () => {
  assert.ok(stanceFit(2, 2.5, 0.3) > stanceFit(1, 2.5, 0.3));
  assert.ok(stanceFit(1, 7, 1) > stanceFit(2, 7, 1));
  assert.ok(stanceFit(3, 3, 0.3) > stanceFit(3, 3, 1.2));
});
