import { DEFAULT_CONFIG, type GameConfig } from '../config/defaults';
import type { InputFrame } from '../input/types';
import { InputReplayer, type Recording } from '../input/recorder';
import { createBall, stepBall, type BallState } from './ball';
import { createStance, stepStance, type StanceState } from './stance';
import { createMachine, stepMachine, type MachineState } from './machine';

// Phase 0 toy simulation. Its job is to prove that recorded input replays to
// exactly the same state. It uses only + - * / and min/max/hypot-free math so
// the result does not depend on a platform's trig functions.
type ToyCfg = GameConfig['toy'];

export interface SimState {
  tick: number;
  bx: number; // bat offset from the right stick (placeholder until the circle swing)
  by: number;
  pbx: number; // previous values, for render interpolation only
  pby: number;
  stance: StanceState;
  ball: BallState;
  machine: MachineState;
}

// Everything the sim reads from the config, so a replay can be given the same values.
export interface SimCfg {
  toy: ToyCfg;
  stance: GameConfig['stance'];
  ball: GameConfig['ball'];
  machine: GameConfig['machine'];
  rightHanded: boolean;
}

export function createSimState(c: GameConfig['stance'] = DEFAULT_CONFIG.stance, rightHanded = true): SimState {
  return { tick: 0, bx: 0, by: 0, pbx: 0, pby: 0, stance: createStance(c, rightHanded), ball: createBall(), machine: createMachine() };
}

export function stepSim(s: SimState, f: InputFrame, dt: number, cfg: SimCfg): void {
  const c = cfg.toy;
  s.pbx = s.bx;
  s.pby = s.by;

  // Left stick: stance gear selector. The body moves to the chosen stance at limited speeds.
  stepStance(s.stance, f.ly, f.lx, f.la, dt, cfg.stance, cfg.rightHanded);

  // Right stick: bat. First-order follow toward the stick position.
  const k = Math.min(1, c.batResponse * dt);
  s.bx += (f.rx * c.batReach - s.bx) * k;
  s.by += (f.ry * c.batReach - s.by) * k;

  stepMachine(s.machine, s.ball, cfg.machine, cfg.ball, dt, cfg.rightHanded);
  stepBall(s.ball, cfg.ball, dt);

  s.tick++;
}

// FNV-1a over the bytes of the core state. Same inputs give the same string.
export function hashSim(s: SimState): string {
  const b = s.ball;
  const m = s.machine;
  const p = s.stance.pose;
  const nums = [s.bx, s.by, s.stance.gate, p.ffx, p.ffz, p.bfx, p.bfz, p.ffLift, p.bfLift, p.drop, p.lean, p.wf, b.active, b.x, b.y, b.z, b.vx, b.vy, b.vz, b.wx, b.wy, b.wz, b.bounces, b.bx, b.bz, b.age, m.phase, m.left, m.rng, m.count, m.speedKmh, m.lineX, m.length];
  const buf = new DataView(new ArrayBuffer(8 * nums.length + 4));
  nums.forEach((v, i) => buf.setFloat64(i * 8, v, true));
  buf.setUint32(8 * nums.length, s.tick, true);
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.byteLength; i++) {
    h ^= buf.getUint8(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Re-runs a recording from a fresh state for `ticks` steps and returns the final state.
export function replayRecording(rec: Recording, cfg: SimCfg, ticks: number): SimState {
  const s = createSimState(cfg.stance, cfg.rightHanded);
  const player = new InputReplayer(rec);
  const dt = 1 / rec.stepHz;
  for (let t = 0; t < ticks; t++) stepSim(s, player.frameAt(t), dt, cfg);
  return s;
}
