import type { GameConfig } from '../config/defaults';
import { PITCH_LEN, STUMPS_Z } from './field';
import { ballSpeed, firstBounce, launchBall, stepBall, type BallState } from './ball';

export type MachineCfg = GameConfig['machine'];
export const PHASE_WAIT = 0;
export const PHASE_CUE = 1;
export const PHASE_FLIGHT = 2;

export const RELEASE_Z = PITCH_LEN / 2 - 0.8;
export const RELEASE_Y = 2.15;

export interface MachineState {
  phase: number;
  left: number; // ticks remaining in the current wait or cue
  rng: number;
  count: number; // balls released so far
  // the delivery being prepared or last released
  speedKmh: number;
  lineX: number; // pitching point, view frame X
  length: number; // metres from the batting stumps
}

export function createMachine(seed = 12345): MachineState {
  return { phase: PHASE_WAIT, left: 240, rng: seed >>> 0, count: 0, speedKmh: 0, lineX: 0, length: 0 };
}

function rnd(m: MachineState): number {
  m.rng = (m.rng + 0x6d2b79f5) >>> 0;
  let t = m.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const jitter = (m: MachineState, amount: number) => (rnd(m) * 2 - 1) * amount;

// Finds the release velocity that makes the ball pitch at (tx, tz), by flying the real
// integrator and correcting the aim point. Pure arithmetic, so it is repeatable.
export function solveDelivery(speed: number, tx: number, tz: number, ball: GameConfig['ball'], dt: number): [number, number, number] {
  const rel: [number, number, number] = [0, RELEASE_Y, RELEASE_Z];
  const velFor = (ax: number, ay: number): [number, number, number] => {
    const dx = ax - rel[0];
    const dy = ay - rel[1];
    const dz = tz - rel[2];
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return [(dx / l) * speed, (dy / l) * speed, (dz / l) * speed];
  };
  let ax = tx;
  let ay0 = 0.2;
  let ay1 = 0.5;
  let e0 = firstBounce(rel, velFor(ax, ay0), ball, dt).z - tz;
  let e1 = e0;
  for (let i = 0; i < 12; i++) {
    const l = firstBounce(rel, velFor(ax, ay1), ball, dt);
    e1 = l.z - tz;
    ax -= (l.x - tx) * 0.9;
    if (Math.abs(e1) < 0.01 && Math.abs(l.x - tx) < 0.01) break;
    const slope = (e1 - e0) / (ay1 - ay0);
    const next = Math.abs(slope) > 1e-6 ? ay1 - e1 / slope : ay1 - e1 * 0.13;
    ay0 = ay1;
    e0 = e1;
    ay1 = Math.min(Math.max(next, -3), 3);
  }
  return velFor(ax, ay1);
}

export function stepMachine(m: MachineState, ball: BallState, c: MachineCfg, ballCfg: GameConfig['ball'], dt: number, rightHanded: boolean): void {
  if (m.phase === PHASE_WAIT) {
    if (--m.left <= 0) {
      m.speedKmh = Math.max(30, c.speedKmh + jitter(m, c.speedJitter));
      const off = c.line + jitter(m, c.lineJitter);
      m.lineX = rightHanded ? -off : off; // off side is screen-left for a right-hander
      m.length = Math.max(0, c.length + jitter(m, c.lengthJitter));
      m.phase = PHASE_CUE;
      m.left = Math.max(1, Math.round(c.cue / dt));
    }
  } else if (m.phase === PHASE_CUE) {
    if (--m.left <= 0) {
      const v = solveDelivery(m.speedKmh / 3.6, m.lineX, STUMPS_Z + m.length, ballCfg, dt);
      launchBall(ball, [0, RELEASE_Y, RELEASE_Z], v);
      m.count++;
      m.phase = PHASE_FLIGHT;
    }
  } else if (!ball.active) {
    m.phase = PHASE_WAIT;
    m.left = Math.max(1, Math.round(c.pause / dt));
  }
}

export { ballSpeed, stepBall };
