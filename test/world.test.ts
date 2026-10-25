import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { createWorld } from '../src/render/world';
import { createSimState, stepSim } from '../src/sim/sim';
import { DEFAULT_CONFIG } from '../src/config/defaults';

// Smoke test only: builds the scene and renders frames on a headless engine.
// It cannot prove WebGL output looks right, but it catches missing imports and bad setup.
test('scene builds and renders frames headless', () => {
  const engine = new NullEngine();
  const world = createWorld(engine);
  const s = createSimState();
  for (let i = 0; i < 30; i++) {
    stepSim(s, { lx: 1, ly: 0.5, la: 1, rx: -0.5, ry: 1, ra: 1 }, 1 / 240, DEFAULT_CONFIG.toy);
    world.update(s, 0.5);
    world.scene.render();
  }
  assert.ok(world.scene.meshes.length >= 8);
  world.scene.dispose();
  engine.dispose();
});

test('player marker follows the sim', () => {
  const engine = new NullEngine();
  const world = createWorld(engine);
  const s = createSimState();
  s.px = s.ppx = 2;
  world.update(s, 1);
  const player = world.scene.getMeshByName('player');
  assert.ok(player);
  assert.equal(player!.position.x, 2);
  world.scene.dispose();
  engine.dispose();
});
