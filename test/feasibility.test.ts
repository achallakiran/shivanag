import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type GameConfig } from '../src/config/defaults';
import { mergeConfig } from '../src/config/config';
import { EMPTY_FRAME, type InputFrame } from '../src/input/types';
import { createSimState, makeSimCfg, stepSim } from '../src/sim/sim';

const dt = 1 / DEFAULT_CONFIG.sim.stepHz;

// Scripted thumb: hold the left stick at a stance, then sweep the right thumb round the circle starting
// `delay` seconds after the ball is released, taking `dur` seconds from the top to straight down and on.
function trial(cfg: GameConfig, ly: number, lx: number, delay: number, dur: number) {
  const sim = makeSimCfg(cfg, true);
  const s = createSimState(sim.stance, true);
  let t0 = -1;
  let swingStart = -1;
  for (let i = 0; i < 240 * 9; i++) {
    if (t0 < 0 && s.ball.active) t0 = i;
    if (t0 >= 0 && swingStart < 0) swingStart = t0 + Math.round(delay / dt);
    let f: InputFrame = { ...EMPTY_FRAME, la: 1, lx, ly };
    if (swingStart >= 0 && i >= swingStart) {
      const p = Math.min(1.2, (i - swingStart) * dt / dur); // 0..1 = top to straight down
      const a = p * Math.PI;
      f = { ...f, rx: -Math.sin(a), ry: Math.cos(a), ra: 1 };
    }
    stepSim(s, f, dt, sim);
    if (s.shot.state === 1 || s.shot.state === 3) return s.shot;
    if (!s.ball.active && t0 >= 0 && i > t0 + 240) break;
  }
  return null;
}

test('a thumb that gets the timing right can hit the machine ball (not impossible)', () => {
  const cfg = mergeConfig(DEFAULT_CONFIG, { machine: { speedJitter: 0, lineJitter: 0, lengthJitter: 0 } });
  const hits: string[] = [];
  for (const [ly, lx] of [[0.55, 0], [0.7, 0], [0.9, 0], [0.4, 0], [1, 0]]) {
    for (let d = 0.2; d <= 0.9; d += 0.02) {
      for (const dur of [0.2, 0.3, 0.45]) {
        for (const lxx of [lx, 0.3, -0.3]) {
          const r = trial(cfg, ly, lxx, d, dur);
          if (r) hits.push(`ly ${ly} lx ${lxx} delay ${d.toFixed(2)} dur ${dur}`);
        }
      }
    }
  }
  console.log(`feasibility: ${hits.length} hitting scripts, e.g. ${hits.slice(0, 3).join(' | ')}`);
  assert.ok(hits.length > 0, 'no scripted swing connected with the ball');
});
