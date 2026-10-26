import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { InputFrame } from '../src/input/types';
import { createStance, FRONT } from '../src/sim/stance';
import { createSwing, stepSwing, swipeYaw, swingWindow, IDLE, SWINGING, type SwingState } from '../src/sim/swing';

const c = DEFAULT_CONFIG.swing;
const dt = 1 / DEFAULT_CONFIG.sim.stepHz;
const swipeFrame = (n: number, dx: number, dy: number, sp: number): InputFrame => ({ sel: 0, n, dx, dy, sp });
const idle = (n: number): InputFrame => swipeFrame(n, 0, 0, 0);
const stance = () => createStance(DEFAULT_CONFIG.stance, true);

function run(sw: SwingState, f: InputFrame, seconds: number, rh = true) {
  const st = stance();
  const n = Math.round(seconds / dt);
  let peak = 0;
  let passedContact = false;
  for (let i = 0; i < n; i++) {
    stepSwing(sw, f, st, dt, c, rh);
    peak = Math.max(peak, sw.omega);
    if (sw.alpha >= Math.PI) passedContact = true;
  }
  return { peak, passedContact };
}

test('swipe direction becomes shot direction: up is straight, left is the off side for a right-hander', () => {
  assert.ok(Math.abs(swipeYaw(0, -1, true)) < 1e-9);
  assert.ok(Math.abs(swipeYaw(-1, 0, true) - Math.PI / 2) < 1e-9, 'left = off side');
  assert.ok(Math.abs(swipeYaw(1, 0, true) + Math.PI / 2) < 1e-9, 'right = leg side');
  assert.ok(Math.abs(swipeYaw(1, 0, false) - Math.PI / 2) < 1e-9, 'left-hander is mirrored');
  assert.ok(Math.abs(Math.abs(swipeYaw(0, 1, true)) - Math.PI) < 1e-9, 'down is behind');
  assert.ok(swipeYaw(-0.5, -0.87, true) > 0 && swipeYaw(-0.5, -0.87, true) < 1, 'up and left is a cover drive');
});

test('a swipe launches exactly one swing, and the same swipe number does nothing twice', () => {
  const sw = createSwing();
  run(sw, idle(0), 0.1);
  assert.equal(sw.phase, IDLE);
  const st = stance();
  stepSwing(sw, swipeFrame(1, 0, -1, 2), st, dt, c, true);
  assert.equal(sw.phase, SWINGING);
  run(sw, swipeFrame(1, 0, -1, 2), 3);
  assert.equal(sw.phase, IDLE, 'finished, and the held swipe did not relaunch');
  assert.equal(sw.alpha, 0);
  stepSwing(sw, swipeFrame(2, 0, -1, 2), st, dt, c, true);
  assert.equal(sw.phase, SWINGING, 'a new swipe number swings again');
});

test('a swipe in the middle of a swing is ignored', () => {
  const sw = createSwing();
  const st = stance();
  stepSwing(sw, swipeFrame(1, 0, -1, 2), st, dt, c, true);
  for (let i = 0; i < 30; i++) stepSwing(sw, swipeFrame(1, 0, -1, 2), st, dt, c, true);
  const psi = sw.psi;
  stepSwing(sw, swipeFrame(2, -1, 0, 3), st, dt, c, true);
  assert.equal(sw.psi, psi);
});

test('swipe speed sets the bat speed and how far the follow-through goes', () => {
  const slow = createSwing();
  const fast = createSwing();
  const a = run(slow, swipeFrame(1, 0, -1, c.swipeSlow * 0.5), 0.5);
  const b = run(fast, swipeFrame(1, 0, -1, c.swipeFast * 2), 0.5);
  assert.ok(a.peak <= c.minOmega + 1e-6 && a.peak > c.minOmega * 0.7, `defence peak ${a.peak}`);
  assert.ok(b.peak <= c.maxOmega + 1e-6 && b.peak > c.maxOmega * 0.95, `power peak ${b.peak}`);
  assert.ok(slow.end < fast.end - 0.5, 'a full-power swing follows through much further');
  assert.ok(a.passedContact && b.passedContact, 'both swings reach the contact angle');
  assert.ok(fast.eps > slow.eps + 0.3, 'a faster swipe tilts the face further up');
  assert.ok(fast.power > 0.99 && slow.power === 0);
});

test('the swing stops at the end of its follow-through, holds, then returns to the backlift slowly', () => {
  const sw = createSwing();
  const st = stance();
  stepSwing(sw, swipeFrame(1, 0, -1, c.swipeFast), st, dt, c, true);
  let t = 0;
  let maxAlpha = 0;
  let lockedAtMid = 0;
  while (sw.phase !== IDLE && t < 6) {
    stepSwing(sw, swipeFrame(1, 0, -1, c.swipeFast), st, dt, c, true);
    t += dt;
    if (sw.phase === 1 || sw.phase === 2) maxAlpha = Math.max(maxAlpha, sw.alpha);
    if (Math.abs(sw.alpha - Math.PI) < 0.05) lockedAtMid = sw.locked;
    assert.ok(Math.abs(sw.omega) <= c.maxOmega + 1e-6);
  }
  assert.ok(Math.abs(maxAlpha - sw.end) < 0.05, `stops at the follow-through angle: ${maxAlpha} vs ${sw.end}`);
  assert.equal(lockedAtMid, 1, 'feet planted during the swing');
  assert.equal(sw.locked, 0);
  assert.ok(t > 0.5 && t < 5, `whole swing and recovery took ${t}s`);
});

test('the swing plane and wrist roll fade in from the backlift and out at the end', () => {
  assert.equal(swingWindow(0), 0);
  assert.equal(swingWindow(2 * Math.PI), 0);
  assert.ok(swingWindow(Math.PI) > 0.99);
  const sw = createSwing();
  const st = stance();
  stepSwing(sw, swipeFrame(1, -1, 0, 2), st, dt, c, true); // a square cut
  assert.ok(Math.abs(sw.yaw) < 1e-3, 'no sideways jump on the first step');
  let atContact = 0;
  for (let i = 0; i < 480 && sw.phase !== IDLE; i++) {
    stepSwing(sw, swipeFrame(1, -1, 0, 2), st, dt, c, true);
    if (sw.alpha >= Math.PI && !atContact) atContact = sw.yaw;
  }
  assert.ok(Math.abs(atContact - Math.PI / 2) < 0.05, `yaw at contact ${atContact}`);
  assert.equal(sw.yaw, 0);
});

test('face roll puts the face between the swing and the bowler: half the shot angle', () => {
  const sw = createSwing();
  stepSwing(sw, swipeFrame(1, -1, 0, 2), stance(), dt, c, true);
  assert.ok(Math.abs(Math.abs(sw.rollFull) - Math.PI / 4) < 1e-9);
  const lh = createSwing();
  stepSwing(lh, swipeFrame(1, 1, 0, 2), stance(), dt, c, false);
  assert.ok(Math.abs(lh.rollFull + sw.rollFull) < 1e-9, 'left-hander rolls the other way');
});

test('stance lofted bias: step up lifts the face more than front foot at the same speed', () => {
  const a = createSwing();
  const b = createSwing();
  const f = createStance(DEFAULT_CONFIG.stance, true);
  const s = createStance(DEFAULT_CONFIG.stance, true);
  f.gate = FRONT;
  s.gate = 5;
  stepSwing(a, swipeFrame(1, 0, -1, 2), f, dt, c, true);
  stepSwing(b, swipeFrame(1, 0, -1, 2), s, dt, c, true);
  assert.ok(b.eps > a.eps);
});
