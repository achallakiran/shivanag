import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { createWorld } from '../src/render/world';
import { createSimState, makeSimCfg, stepSim } from '../src/sim/sim';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { EMPTY_FRAME } from '../src/input/types';

// Smoke tests only: they build the scene and render frames on a headless engine.
// They cannot prove WebGL output looks right (see tools/preview.mjs for that), but they
// catch missing imports and bad setup.
test('scene builds and renders frames headless', () => {
  const engine = new NullEngine();
  const world = createWorld(engine, DEFAULT_CONFIG);
  const s = createSimState();
  for (let i = 0; i < 30; i++) {
    stepSim(s, { sel: i % 6, n: i === 3 ? 1 : 0, dx: -0.6, dy: -0.8, sp: 2 }, 1 / 240, makeSimCfg(DEFAULT_CONFIG, true));
    world.update(s, 0.5);
    world.scene.render();
  }
  assert.ok(world.scene.meshes.length >= 60, `meshes ${world.scene.meshes.length}`);
  for (const n of ['torso', 'head', 'helmet', 'blade', 'handle', 'thighL', 'shinR', 'joint:wristL', 'bone:elbowR']) {
    assert.ok(world.scene.getMeshByName(n), `mesh ${n}`);
  }
  world.scene.dispose();
  engine.dispose();
});

test('batter follows the sim and every camera and handedness renders', () => {
  const engine = new NullEngine();
  const world = createWorld(engine, DEFAULT_CONFIG);
  const s = createSimState();
  world.update(s, 1);
  assert.ok(world.pose().pelvis[0] > 0.1 && world.pose().pelvis[0] < 0.6); // right-hander stands about 0.3 m to the leg side
  for (const rh of [true, false]) {
    for (let c = 0; c < 9; c++) {
      world.setView({ camera: c, rightHanded: rh, skeleton: c % 2 === 0 });
      world.update(s, 1);
      world.scene.render();
    }
  }
  assert.equal(world.setView({ camera: 10 }).camera, 1);
  world.scene.dispose();
  engine.dispose();
});

test('ball, shadow and bounce marker appear while a delivery is live', () => {
  const engine = new NullEngine();
  const world = createWorld(engine, DEFAULT_CONFIG);
  const s = createSimState();
  const cfg = makeSimCfg(DEFAULT_CONFIG, true);
  const idle = EMPTY_FRAME;
  assert.equal(world.scene.getMeshByName('ball')!.isEnabled(), false);
  let sawBall = false;
  let sawMark = false;
  for (let i = 0; i < 240 * 8; i++) {
    stepSim(s, idle, 1 / 240, cfg);
    world.update(s, 1);
    if (s.ball.active) sawBall = sawBall || world.scene.getMeshByName('ball')!.isEnabled();
    if (s.ball.bounces > 0) sawMark = sawMark || world.scene.getMeshByName('bounceMark')!.isEnabled();
  }
  assert.ok(sawBall && sawMark);
  world.scene.dispose();
  engine.dispose();
});
