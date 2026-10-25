import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedLoop } from '../src/core/loop';

function make(stepHz = 240, maxSteps = 16) {
  const ticks: number[] = [];
  const loop = new FixedLoop({ stepHz, maxStepsPerFrame: maxSteps, step: (t) => ticks.push(t), render: () => {} });
  return { loop, ticks };
}

test('runs the right number of steps for elapsed time', () => {
  const { loop, ticks } = make();
  const n = loop.advance(0.05); // 12 steps at 240 Hz
  assert.equal(n, 12);
  assert.deepEqual(ticks, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(loop.tick, 12);
});

test('keeps leftover time between frames', () => {
  const { loop } = make(240);
  assert.equal(loop.advance(0.002), 0); // 0.48 of a step
  assert.equal(loop.advance(0.003), 1); // 0.48 + 0.72 = 1.2 steps
  assert.ok(loop.alpha > 0.1 && loop.alpha < 0.3);
});

test('total steps are the same however a second is split into frames (within one step)', () => {
  const b = make().loop;
  for (let i = 0; i < 60; i++) b.advance(1 / 60);
  const c = make().loop;
  for (let i = 0; i < 100; i++) c.advance(0.01);
  const d = make().loop;
  for (let i = 0; i < 240; i++) d.advance(1 / 240);
  for (const l of [b, c, d]) assert.ok(Math.abs(l.tick - 240) <= 1, `tick ${l.tick}`);
});

test('caps steps per frame and drops the backlog', () => {
  const { loop } = make(240, 16);
  assert.equal(loop.advance(5), 16);
  assert.equal(loop.alpha, 0);
  assert.equal(loop.advance(0), 0);
});

test('negative elapsed time does nothing', () => {
  const { loop } = make();
  assert.equal(loop.advance(-1), 0);
});
