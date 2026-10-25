import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { makeRng } from '../src/core/rng';
import { InputRecorder, InputReplayer, type Recording } from '../src/input/recorder';
import type { InputFrame } from '../src/input/types';
import { createSimState, hashSim, replayRecording, stepSim } from '../src/sim/sim';

const cfg = DEFAULT_CONFIG;
const dt = 1 / cfg.sim.stepHz;

// A made-up thumb session: sticks held for random stretches, then released.
function session(seed: number, ticks: number): InputFrame[] {
  const rnd = makeRng(seed);
  const out: InputFrame[] = [];
  let f: InputFrame = { lx: 0, ly: 0, la: 0, rx: 0, ry: 0, ra: 0 };
  for (let t = 0; t < ticks; t++) {
    if (rnd() < 0.02) {
      const l = rnd() < 0.7;
      const r = rnd() < 0.7;
      f = {
        lx: l ? rnd() * 2 - 1 : 0,
        ly: l ? rnd() * 2 - 1 : 0,
        la: l ? 1 : 0,
        rx: r ? rnd() * 2 - 1 : 0,
        ry: r ? rnd() * 2 - 1 : 0,
        ra: r ? 1 : 0,
      };
    }
    out.push(f);
  }
  return out;
}

function runLive(frames: InputFrame[]): { hash: string; rec: Recording } {
  const s = createSimState();
  const r = new InputRecorder(cfg.sim.stepHz);
  frames.forEach((f, t) => {
    r.push(t, f);
    stepSim(s, f, dt, cfg.toy);
  });
  return { hash: hashSim(s), rec: r.toRecording() };
}

test('same input gives the same state, run twice', () => {
  const frames = session(1, 5000);
  assert.equal(runLive(frames).hash, runLive(frames).hash);
});

test('different input gives a different state', () => {
  assert.notEqual(runLive(session(1, 5000)).hash, runLive(session(2, 5000)).hash);
});

test('replaying a recording reproduces the live state exactly', () => {
  const frames = session(7, 20_000);
  const { hash, rec } = runLive(frames);
  assert.equal(hashSim(replayRecording(rec, cfg.toy, frames.length)), hash);
});

test('a recording survives a JSON round trip bit-for-bit', () => {
  const frames = session(9, 10_000);
  const { hash, rec } = runLive(frames);
  const back = JSON.parse(JSON.stringify(rec)) as Recording;
  assert.equal(hashSim(replayRecording(back, cfg.toy, frames.length)), hash);
});

test('recorder stores only changes and the replayer holds the last frame', () => {
  const rec = new InputRecorder(240);
  const a: InputFrame = { lx: 0.5, ly: 0, la: 1, rx: 0, ry: 0, ra: 0 };
  for (let t = 0; t < 100; t++) rec.push(t, a);
  const r = rec.toRecording();
  assert.equal(r.frames.length, 1);
  assert.equal(r.ticks, 100);
  const p = new InputReplayer(r);
  assert.equal(p.frameAt(0).lx, 0.5);
  assert.equal(p.frameAt(99).lx, 0.5);
});

test('recorder flags truncation when over its cap', () => {
  const rec = new InputRecorder(240, 3);
  for (let t = 0; t < 10; t++) rec.push(t, { lx: t, ly: 0, la: 1, rx: 0, ry: 0, ra: 0 });
  assert.equal(rec.truncated, true);
  assert.equal(rec.toRecording().frames.length, 3);
});

test('body has momentum: velocity cannot jump', () => {
  const s = createSimState();
  stepSim(s, { lx: 1, ly: 0, la: 1, rx: 0, ry: 0, ra: 0 }, dt, cfg.toy);
  assert.ok(s.vx > 0 && s.vx <= cfg.toy.footAccel * dt + 1e-12);
  // after a full second of stick-left, speed is capped
  for (let i = 0; i < 240; i++) stepSim(s, { lx: -1, ly: 0, la: 1, rx: 0, ry: 0, ra: 0 }, dt, cfg.toy);
  assert.ok(Math.abs(s.vx) <= cfg.toy.footMaxSpeed + 1e-9);
});

test('rng is repeatable', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});
