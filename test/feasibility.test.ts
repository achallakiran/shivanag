import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type GameConfig } from '../src/config/defaults';
import { mergeConfig } from '../src/config/config';
import type { InputFrame } from '../src/input/types';
import { createSimState, makeSimCfg, stepSim } from '../src/sim/sim';

const dt = 1 / DEFAULT_CONFIG.sim.stepHz;

// Scripted player: hold a stance, then swipe `delay` seconds after the ball is released, in direction `ang`
// (radians from straight up the screen, positive toward screen-left = the off side for a right-hander) at speed `sp`.
function trial(cfg: GameConfig, sel: number, delay: number, ang: number, sp: number) {
  const sim = makeSimCfg(cfg, true);
  const s = createSimState(sim.stance, true);
  let t0 = -1;
  for (let i = 0; i < 240 * 9; i++) {
    if (t0 < 0 && s.ball.active) t0 = i;
    const swung = t0 >= 0 && i >= t0 + Math.round(delay / dt);
    const f: InputFrame = swung ? { sel, n: 1, dx: -Math.sin(ang), dy: -Math.cos(ang), sp } : { sel, n: 0, dx: 0, dy: 0, sp: 0 };
    stepSim(s, f, dt, sim);
    if (s.shot.state === 1 || s.shot.state === 3) return { ...s.shot };
    if (!s.ball.active && t0 >= 0 && i > t0 + 240) break;
  }
  return null;
}

test('a well-timed swipe can hit the machine ball, defend it, or drive it hard', () => {
  const cfg = mergeConfig(DEFAULT_CONFIG, { machine: { speedJitter: 0, lineJitter: 0, lengthJitter: 0 } });
  const classes: Record<string, { sp: number; speeds: number[]; launches: number[]; alphas: number[] }> = {
    defence: { sp: 0.3, speeds: [], launches: [], alphas: [] },
    drive: { sp: 1.8, speeds: [], launches: [], alphas: [] },
    power: { sp: 3.8, speeds: [], launches: [], alphas: [] },
  };
  for (const sel of [1, 2, 5]) {
    for (const ang of [0, 0.15, -0.15, 0.3]) {
      for (let d = 0.1; d <= 0.9; d += 0.04) {
        for (const k of Object.values(classes)) {
          const r = trial(cfg, sel, d, ang, k.sp);
          if (r) {
            k.speeds.push(r.speed);
            k.launches.push(r.launch);
            k.alphas.push(r.alphaHit);
          }
        }
      }
    }
  }
  const max = (a: number[]) => Math.max(...a);
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
  for (const [name, k] of Object.entries(classes)) {
    const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
    console.log(`bat angle at contact ${name}: ${[0.1, 0.5, 0.9].map((p) => (k.alphas.length ? q(k.alphas, p)!.toFixed(0) : '-')).join(' / ')} deg`);
    console.log(`launch quartiles ${name}: ${[0.1, 0.25, 0.5, 0.75, 0.9].map((p) => (k.launches.length ? q(k.launches, p)!.toFixed(0) : '-')).join(' / ')}`);
    console.log(`feasibility ${name}: ${k.speeds.length} hits, median exit ${k.speeds.length ? (med(k.speeds) * 3.6).toFixed(0) : '-'} km/h, max ${k.speeds.length ? (max(k.speeds) * 3.6).toFixed(0) : '-'}, median launch ${k.launches.length ? med(k.launches).toFixed(0) : '-'} deg`);
  }
  for (const [name, k] of Object.entries(classes)) assert.ok(k.speeds.length > 0, `no ${name} swipe connected`);
  const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]!;
  assert.ok(pct(classes.power!.speeds, 0.9) > med(classes.defence!.speeds) * 1.8, 'a well-timed hard swipe sends the ball much faster than a defensive one');
  assert.ok(max(classes.power!.speeds) > 22, 'full power can reach 80 km/h or more');
  assert.ok(pct(classes.power!.launches, 0.9) > 20, 'a hard swipe can lift the ball');
  assert.ok(med(classes.defence!.launches) < 15, 'a defensive swipe keeps it down');
});
