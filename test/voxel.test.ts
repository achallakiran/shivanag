import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { createStage } from '../src/voxel/stage';
import { createBatsman } from '../src/voxel/rig';
import { ALL_PARTS } from '../src/voxel/parts';
import { buildVoxelData } from '../src/voxel/mesh';
import { POSES, STANCES, lerpPose, READY_GROUNDED, READY_LIFTED, SWEEP } from '../src/voxel/poses';

const engine = new NullEngine();
const stage = createStage(engine);
const man = createBatsman(stage.scene, stage.voxelMat);
const finite = (v: { x: number; y: number; z: number }) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

test('every voxel part builds a closed, non-empty mesh', () => {
  for (const p of ALL_PARTS) {
    const d = buildVoxelData(p);
    assert.ok(d.indices.length > 0, p.name);
    assert.equal(d.positions.length / 3, d.colors.length / 4, p.name);
    assert.ok(d.indices.every((i) => i < d.positions.length / 3), p.name);
  }
});

test('every pose is finite, has the head at a sensible height, and the hands stay on the bat', () => {
  for (const [name, pose] of Object.entries(POSES)) {
    const j = man.apply(pose);
    for (const [k, v] of Object.entries(j)) if (typeof v !== 'number') assert.ok(finite(v as never), `${name} ${k}`);
    assert.ok(j.head.y > 0.8 && j.head.y < 1.8, `${name} head height ${j.head.y}`);
    assert.ok(j.gripError < 0.07, `${name}: hands miss the handle by ${j.gripError}`);
    assert.ok(j.batToe.y > -0.03, `${name}: the bat is not underground`);
  }
});

test('feet are on the ground (the lower foot, or the resting knee)', () => {
  const bad: string[] = [];
  for (const [name, pose] of Object.entries(POSES)) {
    const j = man.apply(pose);
    if (pose.kneeDown) {
      if (Math.min(j.kneeL.y, j.kneeR.y) > 0.2) bad.push(`${name} knee not down`);
    } else if (pose.ankleL === 0 && pose.ankleR === 0) {
      // both feet flat: the two ankles are level
      if (Math.abs(j.ankleL.y - j.ankleR.y) > 0.06) bad.push(`${name} ankles ${j.ankleL.y.toFixed(2)} vs ${j.ankleR.y.toFixed(2)}`);
    } else if (Math.min(j.ankleL.y, j.ankleR.y) > 0.13) bad.push(`${name} no foot on the ground`);
    // the planted foot is always within a hand's breadth of the ground, and the other is not buried
    if (Math.min(j.ankleL.y, j.ankleR.y) < 0.07) bad.push(`${name} foot buried`);
  }
  assert.deepEqual(bad, []);
});

test('the front foot of a front-foot shot is well ahead of the back foot, and the ready stance is crouched', () => {
  const ready = man.apply(READY_LIFTED);
  assert.ok(ready.pelvis.y < 0.9 && ready.pelvis.y > 0.7, `hip height ${ready.pelvis.y}`);
  const front = man.apply(POSES.FRONT);
  assert.ok(front.ankleL.z - front.ankleR.z > 0.5, 'long stride');
  const sweep = man.apply(SWEEP);
  assert.ok(sweep.pelvis.y < 0.6, 'sweep is low');
});

test('pose blending hits both ends and stays finite', () => {
  const a = READY_GROUNDED;
  const b = SWEEP;
  assert.equal(lerpPose(a, b, 0).kneeR, a.kneeR);
  assert.equal(lerpPose(a, b, 1).kneeR, b.kneeR);
  for (let i = 0; i <= 10; i++) {
    const j = man.apply(lerpPose(a, b, i / 10));
    assert.ok(finite(j.head) && finite(j.wristL), `t=${i / 10}`);
  }
  assert.equal(STANCES.length, 6);
});

test('the lifted bat is behind and above the hands, the grounded bat is down by the toes', () => {
  const lifted = man.apply(READY_LIFTED);
  assert.ok(lifted.batToe.y > lifted.batTop.y + 0.4, 'toe up');
  assert.ok(lifted.batToe.z < lifted.batTop.z - 0.1, 'toe back toward the keeper');
  const down = man.apply(READY_GROUNDED);
  assert.ok(down.batToe.y < 0.1, 'toe on the ground');
});

import { clearance } from '../src/voxel/clearance';
import { swingPose, SWING_TOTAL } from '../src/game/swing';

test('the bat and hands never pass through the body: every stance and every frame of every swing', () => {
  const bad: string[] = [];
  const check = (label: string, pose: Parameters<typeof man.apply>[0]) => {
    const j = man.apply(pose);
    if (j.gripError > 0.03) bad.push(`${label}: hands off the handle by ${j.gripError.toFixed(3)}`);
    const g = clearance(j)[0]!;
    if (g.gap < -0.01) bad.push(`${label}: ${g.what} ${(g.gap * 100).toFixed(1)}cm`);
  };
  STANCES.forEach((s, i) => {
    check(`${s.name} stance`, s.pose);
    for (const toContact of [0.06, 0.18, 0.28]) {
      for (let t = 0; t <= toContact + SWING_TOTAL; t += 0.02) check(`${s.name} swing(${toContact}) t=${t.toFixed(2)}`, swingPose(i, t, toContact, 0));
    }
    for (const dir of [-80, 80]) for (let t = 0; t <= 0.2 + SWING_TOTAL; t += 0.05) check(`${s.name} dir ${dir} t=${t.toFixed(2)}`, swingPose(i, t, 0.2, dir));
  });
  assert.deepEqual(bad.slice(0, 12), []);
});

test('every shot starts from the same backlift and returns to it', () => {
  const ready = STANCES[0]!.pose;
  STANCES.forEach((_, i) => {
    assert.deepEqual(swingPose(i, 0, 0.2), ready);
    const end = swingPose(i, 5, 0.2);
    assert.ok(Math.abs(end.root.z - ready.root.z) < 1e-6 && Math.abs(end.root.yaw - ready.root.yaw) < 1e-6);
    assert.ok(end.bat.pos.every((v, k) => Math.abs(v - ready.bat.pos[k]!) < 1e-6) && Math.abs(end.bat.az - ready.bat.az) < 1e-6);
  });
});
