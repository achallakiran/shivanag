import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type GameConfig } from '../src/config/defaults';
import { mergeConfig } from '../src/config/config';
import { EMPTY_FRAME, type InputFrame } from '../src/input/types';
import { createSimState, makeSimCfg, stepSim } from '../src/sim/sim';

const dt = 1 / DEFAULT_CONFIG.sim.stepHz;

// Scripted thumb: hold the left stick at a stance, then sweep the right thumb round the circle starting
// `delay` seconds after the ball is released, taking `dur` seconds from the top to straight down and on.
function trial(cfg: GameConfig, sel: number, delay: number, dur: number) {
  const sim = makeSimCfg(cfg, true);
  const s = createSimState(sim.stance, true);
  let t0 = -1;
  let swingStart = -1;
  for (let i = 0; i < 240 * 9; i++) {
    if (t0 < 0 && s.ball.active) t0 = i;
    if (t0 >= 0 && swingStart < 0) swingStart = t0 + Math.round(delay / dt);
    let f: InputFrame = { ...EMPTY_FRAME, sel };
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
  const hits: string[] = [];
  // The swing plane runs through the shoulders in the shot direction, so a straight swing meets a ball that
  // arrives on that line. Try a few lines of delivery.
  for (const line of [-0.45, -0.3, -0.15, 0, 0.15]) {
    const cfg = mergeConfig(DEFAULT_CONFIG, { machine: { line, speedJitter: 0, lineJitter: 0, lengthJitter: 0 } });
    for (const sel of [1, 2, 5]) {
      for (let d = 0.2; d <= 0.9; d += 0.03) {
        for (const dur of [0.2, 0.3, 0.45]) {
          const r = trial(cfg, sel, d, dur);
          if (r) hits.push(`line ${line} stance ${sel} delay ${d.toFixed(2)} dur ${dur}`);
        }
      }
    }
  }
  console.log(`feasibility: ${hits.length} hitting scripts, e.g. ${hits.slice(0, 3).join(' | ')}`);
  assert.ok(hits.length > 0, 'no scripted swing connected with the ball');
});
