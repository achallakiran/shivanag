import type { GameConfig } from '../config/defaults';
import type { InputFrame } from '../input/types';
import { InputReplayer, type Recording } from '../input/recorder';

// Phase 0 toy simulation. Its job is to prove that recorded input replays to
// exactly the same state. It uses only + - * / and min/max/hypot-free math so
// the result does not depend on a platform's trig functions.
export interface SimState {
  tick: number;
  px: number; // player position: x sideways, pz along the pitch
  pz: number;
  vx: number;
  vz: number;
  bx: number; // bat offset from the left-stick body
  by: number;
  // previous values, for render interpolation only (not part of the hash)
  ppx: number;
  ppz: number;
  pbx: number;
  pby: number;
}

export function createSimState(): SimState {
  return { tick: 0, px: 0, pz: 0, vx: 0, vz: 0, bx: 0, by: 0, ppx: 0, ppz: 0, pbx: 0, pby: 0 };
}

type ToyCfg = GameConfig['toy'];

const approach = (cur: number, target: number, maxDelta: number) => {
  const d = target - cur;
  if (d > maxDelta) return cur + maxDelta;
  if (d < -maxDelta) return cur - maxDelta;
  return target;
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function stepSim(s: SimState, f: InputFrame, dt: number, c: ToyCfg): void {
  s.ppx = s.px;
  s.ppz = s.pz;
  s.pbx = s.bx;
  s.pby = s.by;

  // Left stick: feet. Speed is capped and acceleration is limited, so the body has momentum.
  const maxDv = c.footAccel * dt;
  s.vx = approach(s.vx, f.lx * c.footMaxSpeed, maxDv);
  s.vz = approach(s.vz, f.ly * c.footMaxSpeed, maxDv);
  s.px = clamp(s.px + s.vx * dt, -3, 3);
  s.pz = clamp(s.pz + s.vz * dt, -2, 2);

  // Right stick: bat. First-order follow toward the stick position.
  const k = Math.min(1, c.batResponse * dt);
  s.bx += (f.rx * c.batReach - s.bx) * k;
  s.by += (f.ry * c.batReach - s.by) * k;

  s.tick++;
}

// FNV-1a over the bytes of the core state. Same inputs give the same string.
export function hashSim(s: SimState): string {
  const buf = new DataView(new ArrayBuffer(8 * 6 + 4));
  buf.setFloat64(0, s.px, true);
  buf.setFloat64(8, s.pz, true);
  buf.setFloat64(16, s.vx, true);
  buf.setFloat64(24, s.vz, true);
  buf.setFloat64(32, s.bx, true);
  buf.setFloat64(40, s.by, true);
  buf.setUint32(48, s.tick, true);
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.byteLength; i++) {
    h ^= buf.getUint8(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Re-runs a recording from a fresh state for `ticks` steps and returns the final state.
export function replayRecording(rec: Recording, toy: ToyCfg, ticks: number): SimState {
  const s = createSimState();
  const player = new InputReplayer(rec);
  const dt = 1 / rec.stepHz;
  for (let t = 0; t < ticks; t++) stepSim(s, player.frameAt(t), dt, toy);
  return s;
}
