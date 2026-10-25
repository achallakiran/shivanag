import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { createWorld } from '../src/render/world';
import { createSimState, stepSim } from '../src/sim/sim';
import { DEFAULT_CONFIG } from '../src/config/defaults';

// Smoke tests only: they build the scene and render frames on a headless engine.
// They cannot prove WebGL output looks right (see tools/preview.mjs for that), but they
// catch missing imports and bad setup.
test('scene builds and renders frames headless', () => {
  const engine = new NullEngine();
  const world = createWorld(engine, DEFAULT_CONFIG.body);
  const s = createSimState();
  for (let i = 0; i < 30; i++) {
    stepSim(s, { lx: 1, ly: 0.5, la: 1, rx: -0.5, ry: 1, ra: 1 }, 1 / 240, DEFAULT_CONFIG.toy);
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
  const world = createWorld(engine, DEFAULT_CONFIG.body);
  const s = createSimState();
  s.px = s.ppx = 2;
  world.update(s, 1);
  assert.ok(Math.abs(world.pose().pelvis[0] - 2.5) < 1e-9); // right-hander stands 0.5 m to the leg side
  for (const rh of [true, false]) {
    for (let c = 0; c < 7; c++) {
      world.setView({ camera: c, rightHanded: rh, skeleton: c % 2 === 0 });
      world.update(s, 1);
      world.scene.render();
    }
  }
  assert.equal(world.setView({ camera: 8 }).camera, 1);
  world.scene.dispose();
  engine.dispose();
});
