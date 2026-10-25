import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { BACK, FRONT, READY, SIT, STEP, createStance, selectGate, stepStance, targetPose } from '../src/sim/stance';

const c = DEFAULT_CONFIG.stance;
const dt = 1 / DEFAULT_CONFIG.sim.stepHz;

test('stick position picks the gate: up is back foot, then ready, then sit, front, step', () => {
  assert.equal(selectGate(0.9, 1, READY, c), BACK);
  assert.equal(selectGate(0, 1, READY, c), READY);
  assert.equal(selectGate(-0.4, 1, READY, c), SIT);
  assert.equal(selectGate(-0.6, 1, READY, c), FRONT);
  assert.equal(selectGate(-0.95, 1, READY, c), STEP);
  assert.equal(selectGate(-0.95, 0, READY, c), READY, 'released thumb is ready');
});

test('hysteresis: wobbling across a boundary does not flip the gate', () => {
  const edge = c.gateRest; // Ready | Sit boundary at d = rest
  let g = READY;
  const seq: number[] = [];
  for (const d of [edge - 0.02, edge + 0.02, edge - 0.02, edge + 0.03, edge + 0.07, edge + 0.03, edge - 0.02, edge - 0.08]) {
    g = selectGate(-d, 1, g, c);
    seq.push(g);
  }
  assert.deepEqual(seq, [READY, READY, READY, READY, SIT, SIT, SIT, READY]);
});

test('every gate can be reached by sweeping the stick and in order', () => {
  let g = READY;
  const seen: number[] = [];
  for (let d = -1; d <= 1; d += 0.01) {
    g = selectGate(-d, 1, g, c);
    if (seen[seen.length - 1] !== g) seen.push(g);
  }
  assert.deepEqual(seen, [BACK, READY, SIT, FRONT, STEP]);
});

test('stance change takes real time, bounded by the foot speed', () => {
  const st = createStance(c, true);
  let ticks = 0;
  const dist = Math.hypot(targetPose(STEP, 0, c, true).ffx - st.pose.ffx, targetPose(STEP, 0, c, true).ffz - st.pose.ffz);
  while (ticks < 240 * 5) {
    stepStance(st, -1, 0, 1, dt, c, true);
    ticks++;
    const t = targetPose(STEP, 0, c, true);
    if (Math.abs(st.pose.ffz - t.ffz) < 1e-9 && Math.abs(st.pose.ffx - t.ffx) < 1e-9 && Math.abs(st.pose.drop - t.drop) < 1e-9 && Math.abs(st.pose.lean - t.lean) < 1e-9) break;
  }
  const seconds = ticks * dt;
  assert.ok(seconds >= dist / c.footSpeed - 0.02, `arrived too fast: ${seconds}s for ${dist}m`);
  assert.ok(seconds < 3, `too slow ${seconds}s`);
  assert.equal(st.gate, STEP);
});

test('a foot never moves faster than footSpeed, and lifts while it travels', () => {
  const st = createStance(c, true);
  let maxLift = 0;
  for (let i = 0; i < 480; i++) {
    const x = st.pose.ffx;
    const z = st.pose.ffz;
    stepStance(st, -0.9, 0, 1, dt, c, true);
    assert.ok(Math.hypot(st.pose.ffx - x, st.pose.ffz - z) <= c.footSpeed * dt + 1e-12);
    maxLift = Math.max(maxLift, st.pose.ffLift);
  }
  assert.ok(maxLift > 0.02);
  assert.ok(st.pose.ffLift < 1e-9, 'foot is down again on arrival');
});

test('releasing the stick returns to ready, and it also takes time', () => {
  const st = createStance(c, true);
  for (let i = 0; i < 240 * 2; i++) stepStance(st, -0.9, 0, 1, dt, c, true);
  assert.equal(st.gate, STEP);
  stepStance(st, 0, 0, 0, dt, c, true);
  assert.equal(st.gate, READY);
  assert.ok(st.pose.ffz > targetPose(READY, 0, c, true).ffz + 0.5, 'feet have not teleported back');
  for (let i = 0; i < 240 * 3; i++) stepStance(st, 0, 0, 0, dt, c, true);
  assert.ok(Math.abs(st.pose.ffz - targetPose(READY, 0, c, true).ffz) < 1e-9);
});

test('stick sideways slides the working foot; left-handers are mirrored', () => {
  const a = targetPose(FRONT, 0, c, true);
  const b = targetPose(FRONT, 1, c, true);
  assert.ok(Math.abs(b.ffx - a.ffx - c.lineReach) < 1e-9);
  assert.equal(b.bfx, a.bfx);
  const back = targetPose(BACK, 1, c, true);
  assert.ok(back.bfx > targetPose(BACK, 0, c, true).bfx);
  const lh = targetPose(SIT, 0, c, false);
  const rh = targetPose(SIT, 0, c, true);
  assert.ok(Math.abs(lh.ffx + rh.ffx) < 1e-9 && lh.ffz === rh.ffz);
});
