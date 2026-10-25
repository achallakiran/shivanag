import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { BACK, FRONT, READY, SIT, STEP, createStance, targetPose } from '../src/sim/stance';
import { JOINTS, JOINT_NAMES, bodyDims, dist, solvePose, twoBone, type PoseInput } from '../src/sim/skeleton';

const stanceOf = (g: number, rh = true) => targetPose(g, 0, DEFAULT_CONFIG.stance, rh);
const base: PoseInput = { stance: createStance(DEFAULT_CONFIG.stance, true).pose, alpha: 0, yaw: 0, rightHanded: true, baseZ: -8.84 };
const body = DEFAULT_CONFIG.body;
const D = bodyDims(body);

test('every joint is in the tree and starts with full freedom', () => {
  assert.equal(JOINTS.length, JOINT_NAMES.length);
  for (const j of JOINTS) {
    assert.ok(j.parent === null || JOINT_NAMES.includes(j.parent));
    for (const ax of ['x', 'y', 'z'] as const) assert.deepEqual(j.limits[ax], [-180, 180]);
  }
});

test('two-bone IK keeps bone lengths, even when the target is out of reach', () => {
  for (const t of [[0.3, 0.2, 0.4], [3, 3, 3], [0, -0.1, 0.0001], [0.01, 0.01, 0.01]] as const) {
    const { mid, end } = twoBone([0, 1, 0], [t[0], t[1], t[2]], 0.46, 0.45, [1, 0, 0]);
    assert.ok(Math.abs(dist([0, 1, 0], mid) - 0.46) < 1e-6);
    assert.ok(Math.abs(dist(mid, end) - 0.45) < 1e-6);
  }
});

test('stance: feet on the ground, head about 1.7 m up, limbs keep their lengths', () => {
  for (const rh of [true, false]) {
    const p = solvePose({ ...base, stance: stanceOf(READY, rh), rightHanded: rh }, body);
    assert.ok(Math.abs(p.ankleL[1] - D.ankle) < 1e-9 && Math.abs(p.ankleR[1] - D.ankle) < 1e-9);
    assert.ok(p.head[1] > 1.45 && p.head[1] < 1.8, `head ${p.head[1]}`);
    assert.ok(Math.abs(dist(p.hipL, p.kneeL) - D.thigh) < 1e-6);
    assert.ok(Math.abs(dist(p.kneeR, p.ankleR) - D.shin) < 1e-6);
    assert.ok(Math.abs(dist(p.shoulderL, p.elbowL) - D.upperArm) < 1e-6);
    assert.ok(Math.abs(dist(p.elbowR, p.wristR) - D.foreArm) < 1e-6);
    assert.ok(Math.abs(dist(p.batTop, p.batToe) - D.batTotal) < 1e-6);
  }
});

test('left-hander is the mirror image of the right-hander', () => {
  const a = solvePose(base, body);
  const b = solvePose({ ...base, stance: stanceOf(READY, false), rightHanded: false }, body);
  // Mirror about the pitch axis (X = 0). The left-hander's right side is the one toward the bowler,
  // so each paired joint matches the opposite-named joint of the right-hander.
  const swap = (n: string) => (n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n) as (typeof JOINT_NAMES)[number];
  for (const n of JOINT_NAMES) {
    const m = b[swap(n)];
    assert.ok(Math.abs(a[n][1] - m[1]) < 1e-9, `${n} y`);
    assert.ok(Math.abs(a[n][2] - m[2]) < 1e-9, `${n} z`);
    assert.ok(Math.abs(a[n][0] + m[0]) < 1e-9, `${n} x`);
  }
});

test('the bat angle moves the bat, the bat stays a rigid 0.96 m rod, above the ground', () => {
  const rest = solvePose(base, body);
  for (const g of [BACK, READY, SIT, FRONT, STEP]) {
    for (let a = 0; a <= 6.4; a += 0.2) {
      const p = solvePose({ ...base, stance: stanceOf(g), alpha: a }, body);
      assert.ok(Math.abs(dist(p.batTop, p.batToe) - D.batTotal) < 1e-6);
      assert.ok(p.batToe[1] >= 0.019, `toe ${p.batToe[1]} at gate ${g} alpha ${a}`);
      assert.ok(p.batTop[1] >= 0 || a > 0, 'top of handle above ground');
    }
  }
  assert.ok(dist(solvePose({ ...base, alpha: 3.14 }, body).batToe, rest.batToe) > 0.8);
});

test('every stance keeps limb lengths, keeps both feet on or above the ground and the head above the hips', () => {
  for (const rh of [true, false]) {
    for (const g of [BACK, READY, SIT, FRONT, STEP]) {
      const p = solvePose({ ...base, stance: stanceOf(g, rh), rightHanded: rh }, body);
      assert.ok(Math.abs(dist(p.hipL, p.kneeL) - D.thigh) < 1e-6 && Math.abs(dist(p.kneeL, p.ankleL) - D.shin) < 1e-6, `left leg, gate ${g}`);
      assert.ok(Math.abs(dist(p.hipR, p.kneeR) - D.thigh) < 1e-6 && Math.abs(dist(p.kneeR, p.ankleR) - D.shin) < 1e-6, `right leg, gate ${g}`);
      assert.ok(p.ankleL[1] >= D.ankle - 1e-9 && p.ankleR[1] >= D.ankle - 1e-9);
      assert.ok(p.head[1] > p.pelvis[1] + 0.5, `head above pelvis, gate ${g}`);
      // the legs reach their feet without being pulled short
      assert.ok(dist(p.hipL, p.ankleL) <= D.thigh + D.shin + 1e-6 && dist(p.hipR, p.ankleR) <= D.thigh + D.shin + 1e-6);
    }
  }
});

test('stances differ the way cricketers expect', () => {
  const at = (g: number) => solvePose({ ...base, stance: stanceOf(g), rightHanded: true }, body);
  const ready = at(READY);
  assert.ok(at(STEP).ankleL[2] > at(FRONT).ankleL[2] && at(FRONT).ankleL[2] > ready.ankleL[2], 'front foot goes further forward');
  assert.ok(at(BACK).ankleR[2] < ready.ankleR[2], 'back foot goes back');
  assert.ok(at(SIT).pelvis[1] < ready.pelvis[1] - 0.25, 'sit is low');
  assert.ok(at(STEP).pelvis[1] <= ready.pelvis[1]);
  assert.ok(at(BACK).head[1] > at(FRONT).head[1] - 0.05, 'back foot is more upright');
});
