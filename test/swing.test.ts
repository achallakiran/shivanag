import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { InputFrame } from '../src/input/types';
import { createStance, FRONT, READY, BACK } from '../src/sim/stance';
import { createSwing, stepSwing, thumbAngle } from '../src/sim/swing';
import { planeYaw } from '../src/sim/bat';

const c = DEFAULT_CONFIG.swing;
const dt = 1 / DEFAULT_CONFIG.sim.stepHz;
const frame = (rx: number, ry: number, ra: 0 | 1 = 1): InputFrame => ({ lx: 0, ly: 0, la: 0, rx, ry, ra });
const stance = () => createStance(DEFAULT_CONFIG.stance, true);

// thumb at angle `a` around the circle for a right-hander: up, left, down, right (counter-clockwise)
const thumb = (a: number, m = 1): InputFrame => frame(-Math.sin(a) * m, Math.cos(a) * m);

test('thumb angle: the forward circle is up, left, down, right for a right-hander; mirrored for a left-hander', () => {
  assert.ok(Math.abs(thumbAngle(0, 1, true, 1)) < 1e-9);
  assert.ok(Math.abs(thumbAngle(-1, 0, true, 1) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(Math.abs(thumbAngle(0, -1, true, 1)) - Math.PI) < 1e-9);
  assert.ok(Math.abs(thumbAngle(1, 0, false, 1) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(thumbAngle(1, 0, true, -1) - Math.PI / 2) < 1e-9);
});

test('the bat rests in the backlift and ignores a thumb that is not out far enough', () => {
  const sw = createSwing();
  const st = stance();
  for (let i = 0; i < 240; i++) stepSwing(sw, thumb(2, 0.2), st, dt, c, true);
  assert.equal(sw.alpha, 0);
  assert.equal(sw.engaged, 0);
});

test('the bat follows the thumb round the circle but never faster than maxOmega', () => {
  const sw = createSwing();
  const st = stance();
  let maxW = 0;
  let reached = 0;
  let midLocked = 0;
  // thumb spins a full circle in 0.15 s (far faster than the bat can follow)
  const ticks = Math.round(0.15 / dt);
  for (let i = 0; i < ticks * 4; i++) {
    const a = Math.min(1, i / ticks) * Math.PI * 2;
    stepSwing(sw, thumb(a), st, dt, c, true);
    maxW = Math.max(maxW, Math.abs(sw.omega));
    reached = Math.max(reached, sw.alpha);
    if (i === Math.round(ticks * 0.5)) midLocked = sw.locked;
  }
  assert.ok(maxW <= c.maxOmega + 1e-9, `omega ${maxW}`);
  assert.ok(sw.alpha > 5.5 && sw.alpha < 6.5, `alpha ${sw.alpha}`);
  assert.equal(midLocked, 1, 'feet are locked while the bat is away from the backlift');
});

test('a slow thumb moves the bat at the same speed (bat speed comes from thumb speed)', () => {
  const run = (seconds: number) => {
    const sw = createSwing();
    const st = stance();
    const n = Math.round(seconds / dt);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      stepSwing(sw, thumb((i / n) * Math.PI), st, dt, c, true);
      peak = Math.max(peak, sw.omega);
    }
    return peak;
  };
  const slow = run(1);
  const fast = run(0.3);
  assert.ok(fast > slow * 2.5, `fast ${fast} slow ${slow}`);
  assert.ok(slow < 6, `slow ${slow}`);
});

test('stopping the thumb mid-arc holds the bat (a defensive stroke)', () => {
  const sw = createSwing();
  const st = stance();
  const n = Math.round(0.25 / dt);
  for (let i = 0; i < n; i++) stepSwing(sw, thumb((i / n) * Math.PI), st, dt, c, true);
  for (let i = 0; i < 240; i++) stepSwing(sw, thumb(Math.PI), st, dt, c, true);
  assert.ok(Math.abs(sw.alpha - Math.PI) < 0.02, `alpha ${sw.alpha}`);
  assert.ok(Math.abs(sw.omega) < 0.05);
});

test('release carries the bat on round to the backlift, slowly', () => {
  const sw = createSwing();
  const st = stance();
  const n = Math.round(0.3 / dt);
  for (let i = 0; i < n; i++) stepSwing(sw, thumb((i / n) * Math.PI * 1.5), st, dt, c, true);
  // thumb lifted at three-quarters of the way round: the bat finishes the circle
  let ticks = 0;
  while ((sw.alpha !== 0 || sw.locked) && ticks < 240 * 5) {
    stepSwing(sw, frame(0, 0, 0), st, dt, c, true);
    ticks++;
  }
  assert.ok(sw.alpha === 0, `back at the backlift, alpha ${sw.alpha}`);
  assert.ok(ticks * dt > 0.1, 'it takes real time');
  assert.equal(sw.locked, 0);
});

test('left-handers use the mirrored thumb circle', () => {
  const a = createSwing();
  const b = createSwing();
  const st = stance();
  const n = Math.round(0.3 / dt);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI;
    stepSwing(a, thumb(ang), st, dt, c, true);
    stepSwing(b, frame(Math.sin(ang), Math.cos(ang)), st, dt, c, false);
  }
  assert.ok(Math.abs(a.alpha - b.alpha) < 1e-9);
});

test('the swing plane follows the stance and the line', () => {
  assert.equal(planeYaw(FRONT, 0, c), c.yawFront);
  assert.ok(planeYaw(FRONT, 1, c) > planeYaw(FRONT, -1, c));
  assert.ok(planeYaw(BACK, 1, c) > 0.8 && planeYaw(BACK, -1, c) < -0.8, 'back foot can cut or pull');
  assert.equal(planeYaw(READY, 0, c), c.yawReady);
});
