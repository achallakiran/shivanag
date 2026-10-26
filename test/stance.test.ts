import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { BACK, FRONT, READY, REVERSE, STANCE_COUNT, STANCE_NAMES, STEP, SWEEP, createStance, stepStance, targetPose } from '../src/sim/stance';
import { solvePose } from '../src/sim/skeleton';

const c = DEFAULT_CONFIG.stance;
const body = DEFAULT_CONFIG.body;
const dt = 1 / DEFAULT_CONFIG.sim.stepHz;
const pose = (g: number, rh = true) => solvePose({ stance: targetPose(g, c, rh), alpha: 0, yaw: 0, rightHanded: rh, baseZ: -8.84 }, body);

test('there are six stances, each with a name', () => {
  assert.equal(STANCE_COUNT, 6);
  assert.deepEqual([...STANCE_NAMES], ['Ready', 'Back foot', 'Front foot', 'Sweep', 'Reverse sweep', 'Step up and hit']);
});

test('the body takes the selected stance, and any stance can be replaced by another before the swing', () => {
  const st = createStance(c, true);
  stepStance(st, FRONT, dt, c, true);
  assert.equal(st.gate, FRONT);
  stepStance(st, SWEEP, dt, c, true);
  assert.equal(st.gate, SWEEP, 'changed its mind');
  stepStance(st, READY, dt, c, true);
  assert.equal(st.gate, READY);
  stepStance(st, 99, dt, c, true);
  assert.equal(st.gate, READY, 'nonsense selections are ignored');
});

test('a locked swing keeps the feet planted: the stance cannot change', () => {
  const st = createStance(c, true);
  stepStance(st, FRONT, dt, c, true);
  stepStance(st, BACK, dt, c, true, true);
  assert.equal(st.gate, FRONT);
});

test('stance change takes real time, bounded by the foot speed', () => {
  const st = createStance(c, true);
  const t = targetPose(STEP, c, true);
  const dist = Math.hypot(t.ffx - st.pose.ffx, t.ffz - st.pose.ffz);
  let ticks = 0;
  while (ticks < 240 * 5) {
    stepStance(st, STEP, dt, c, true);
    ticks++;
    if (Math.abs(st.pose.ffz - t.ffz) < 1e-9 && Math.abs(st.pose.ffx - t.ffx) < 1e-9 && Math.abs(st.pose.drop - t.drop) < 1e-9 && Math.abs(st.pose.lean - t.lean) < 1e-9 && Math.abs(st.pose.hy - t.hy) < 1e-9) break;
  }
  const seconds = ticks * dt;
  assert.ok(seconds >= dist / c.footSpeed - 0.02, `arrived too fast: ${seconds}s for ${dist}m`);
  assert.ok(seconds < 3, `too slow ${seconds}s`);
});

test('a foot never moves faster than footSpeed, and lifts while it travels', () => {
  const st = createStance(c, true);
  let maxLift = 0;
  for (let i = 0; i < 480; i++) {
    const x = st.pose.ffx;
    const z = st.pose.ffz;
    stepStance(st, STEP, dt, c, true);
    assert.ok(Math.hypot(st.pose.ffx - x, st.pose.ffz - z) <= c.footSpeed * dt + 1e-12);
    maxLift = Math.max(maxLift, st.pose.ffLift);
  }
  assert.ok(maxLift > 0.02);
  assert.ok(st.pose.ffLift < 1e-9, 'foot is down again on arrival');
});

test('the hands, chest turn and backlift also move at limited speeds', () => {
  const st = createStance(c, true);
  let prev = { ...st.pose };
  for (let i = 0; i < 240; i++) {
    stepStance(st, BACK, dt, c, true);
    assert.ok(Math.abs(st.pose.open - prev.open) <= c.turnSpeed * dt + 1e-12);
    assert.ok(Math.abs(st.pose.blBack - prev.blBack) <= c.turnSpeed * 2.5 * dt + 1e-12);
    assert.ok(Math.abs(st.pose.hy - prev.hy) <= c.handSpeed * dt + 1e-12);
    prev = { ...st.pose };
  }
});

test('left-handers are the mirror image of right-handers', () => {
  for (let g = 0; g < STANCE_COUNT; g++) {
    const lh = targetPose(g, c, false);
    const rh = targetPose(g, c, true);
    assert.ok(Math.abs(lh.ffx + rh.ffx) < 1e-9 && Math.abs(lh.bfx + rh.bfx) < 1e-9, `feet x, ${STANCE_NAMES[g]}`);
    assert.equal(lh.ffz, rh.ffz);
    assert.equal(lh.blBack, rh.blBack);
  }
});

test('stances are authored the way cricketers play them', () => {
  const ready = pose(READY);
  const side = (n: string, p = ready) => p[n as 'pelvis'];
  void side;
  const f = (g: number) => pose(g);
  // feet: ready is shoulder width and roughly square to the crease
  const spread = Math.abs(ready.ankleL[0] - ready.ankleR[0]);
  assert.ok(spread > 0.35 && spread < 0.6, `ready feet ${spread}`);
  assert.ok(Math.abs(ready.ankleL[2] - ready.ankleR[2]) < 0.3);
  // back foot: rear foot goes back and across, weight back, upright; front foot stays near the crease
  assert.ok(f(BACK).ankleR[2] < ready.ankleR[2] - 0.3);
  assert.ok(f(BACK).ankleL[2] < ready.ankleL[2] + 0.2);
  assert.ok(f(BACK).head[1] >= f(FRONT).head[1]);
  // front foot: long stride toward the bowler with the head forward of the back foot
  assert.ok(f(FRONT).ankleL[2] > ready.ankleL[2] + 0.4);
  assert.ok(f(FRONT).head[2] > f(FRONT).ankleR[2]);
  // sweep: low, front foot forward, back foot behind with the hips well down
  assert.ok(f(SWEEP).pelvis[1] < ready.pelvis[1] - 0.25);
  assert.ok(f(SWEEP).ankleL[2] > ready.ankleL[2] + 0.3);
  assert.ok(f(SWEEP).ankleR[2] < f(SWEEP).ankleL[2] - 0.4);
  // reverse sweep: as low as the sweep but turned further toward the bowler
  assert.ok(Math.abs(f(REVERSE).pelvis[1] - f(SWEEP).pelvis[1]) < 0.1);
  assert.ok(targetPose(REVERSE, c, true).open > targetPose(SWEEP, c, true).open + 0.3);
  // step up: the longest stride
  assert.ok(f(STEP).ankleL[2] > f(FRONT).ankleL[2] + 0.4);
});

test('the backlift raises the bat: hands above the hips, bat tilted back, blade above the head height of the hands', () => {
  for (const g of [READY, BACK, FRONT, STEP]) {
    const p = pose(g);
    assert.ok(p.batGrip[1] > p.pelvis[1] - 0.1, `hands near or above the hips, ${STANCE_NAMES[g]}`);
    assert.ok(p.batToe[1] > p.batGrip[1] + 0.3 || g === READY, `toe up, ${STANCE_NAMES[g]}`);
    // the blade is behind the hands (toward the keeper) when the backlift is back
    assert.ok(p.batToe[2] <= p.batGrip[2] + 1e-9);
  }
  // the back-foot backlift is higher than the ready one
  assert.ok(pose(BACK).batToe[1] > pose(READY).batToe[1]);
});

test('backlift: grounded behind the toes while waiting, lifted high and back once the ball is coming', () => {
  const g = targetPose(READY, c, true, false);
  const l = targetPose(READY, c, true, true);
  const gp = solvePose({ stance: g, alpha: 0, yaw: 0, rightHanded: true, baseZ: -8.84 }, body);
  const lp = solvePose({ stance: l, alpha: 0, yaw: 0, rightHanded: true, baseZ: -8.84 }, body);
  assert.ok(gp.batToe[1] < 0.15, 'grounded toe near the floor');
  assert.ok(lp.batToe[1] > 0.7, 'lifted toe well above the knee');
  assert.ok(lp.batToe[2] < lp.batTop[2] - 0.1 || Math.abs(lp.batToe[0] - lp.batTop[0]) > 0.1, 'lifted bat leans back/out');
});
