import { DEFAULT_CONFIG, type GameConfig } from '../config/defaults';
import type { InputFrame } from '../input/types';
import { InputReplayer, type Recording } from '../input/recorder';
import { createBall, stepBall, type BallState } from './ball';
import { createStance, stepStance, type StanceState } from './stance';
import { createMachine, stepMachine, type MachineState } from './machine';
import { createSwing, stepSwing, type SwingState } from './swing';
import { contactHook, createShot, updateShot, type ShotState } from './contact';
import { batFor } from './skeleton';
import { planeYaw } from './bat';
import { BAT_Z } from './field';

// The simulation: everything that must replay exactly from recorded input. No rendering here.
export interface SimState {
  tick: number;
  stance: StanceState;
  swing: SwingState;
  shot: ShotState;
  ball: BallState;
  machine: MachineState;
}

// Everything the sim reads from the config, so a replay can be given the same values.
export interface SimCfg {
  stance: GameConfig['stance'];
  swing: GameConfig['swing'];
  bat: GameConfig['bat'];
  body: GameConfig['body'];
  ball: GameConfig['ball'];
  machine: GameConfig['machine'];
  rightHanded: boolean;
}

export const makeSimCfg = (c: GameConfig, rightHanded: boolean): SimCfg => ({ stance: c.stance, swing: c.swing, bat: c.bat, body: c.body, ball: c.ball, machine: c.machine, rightHanded });

export function createSimState(c: GameConfig['stance'] = DEFAULT_CONFIG.stance, rightHanded = true): SimState {
  return { tick: 0, stance: createStance(c, rightHanded), swing: createSwing(), shot: createShot(), ball: createBall(), machine: createMachine() };
}

export function stepSim(s: SimState, f: InputFrame, dt: number, cfg: SimCfg): void {
  const rh = cfg.rightHanded;
  // Stance buttons choose the stance (locked while a swing is under way); the swing input is a placeholder until swipes.
  stepSwing(s.swing, f, s.stance, dt, cfg.swing, rh);
  stepStance(s.stance, f.sel, dt, cfg.stance, rh, s.swing.locked === 1);
  // the swing plane follows the stance as it settles
  s.swing.yaw = planeYaw(s.stance.gate, s.stance.pose.line, cfg.swing);

  stepMachine(s.machine, s.ball, cfg.machine, cfg.ball, dt, rh);

  // bat at the start and end of this tick, then the ball moves with contact tested every sub-step
  const f0 = batFor(s.stance.prev, s.swing.prevAlpha, s.swing.prevYaw, cfg.body, rh, BAT_Z);
  const f1 = batFor(s.stance.pose, s.swing.alpha, s.swing.yaw, cfg.body, rh, BAT_Z);
  const hook = contactHook({ f0, f1, dt, bat: cfg.bat, radius: cfg.ball.radius, rightHanded: rh, alpha: s.swing.alpha, shot: s.shot });
  stepBall(s.ball, cfg.ball, dt, hook);
  updateShot(s.shot, s.ball, s.machine.count, s.swing.alpha);

  s.tick++;
}

// FNV-1a over the bytes of the core state. Same inputs give the same string.
export function hashSim(s: SimState): string {
  const b = s.ball;
  const m = s.machine;
  const p = s.stance.pose;
  const sw = s.swing;
  const k = s.shot;
  const nums = [sw.alpha, sw.omega, sw.theta, sw.engaged, sw.yaw, s.stance.gate, p.open, p.hx, p.hy, p.hz, p.blBack, p.blSide, p.line, p.ffx, p.ffz, p.bfx, p.bfz, p.ffLift, p.bfLift, p.drop, p.lean, p.wf, b.active, b.x, b.y, b.z, b.vx, b.vy, b.vz, b.wx, b.wy, b.wz, b.bounces, b.bx, b.bz, b.age, m.phase, m.left, m.rng, m.count, m.speedKmh, m.lineX, m.length, b.hit, b.maxY, k.state, k.speed, k.launch, k.dir, k.s, k.lat];
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
