import type { GameConfig } from '../config/defaults';

// Stances: the left stick is a gear selector. Each stance is a full-body target (feet, hip drop,
// torso lean, weight). The body then moves toward the target at limited speeds, so choosing a
// stance late means the feet are not there yet. Coordinates are the view frame relative to the
// batter's guard: X screen-right, Z toward the bowler. All values come from config.

export const BACK = 0;
export const READY = 1;
export const SIT = 2;
export const FRONT = 3;
export const STEP = 4;
export const STANCE_NAMES = ['Back foot', 'Ready', 'Sit (sweep)', 'Front foot', 'Step out'] as const;
export const GATE_LABELS = ['BACK', 'SIT', 'FRONT', 'STEP'] as const; // shown on the stick, top to bottom

export type StanceCfg = GameConfig['stance'];

export interface StancePose {
  ffx: number; // front foot (the foot nearer the bowler), relative to the guard
  ffz: number;
  bfx: number; // back foot
  bfz: number;
  ffLift: number; // foot height above the ground while it is moving
  bfLift: number;
  drop: number; // extra hip drop, metres
  lean: number; // torso lean toward the bowler, metres at the shoulders
  wf: number; // weight on the front foot, 0..1
}

export interface StanceState {
  gate: number;
  pose: StancePose;
  prev: StancePose; // previous tick, for render interpolation only
}

export const clonePose = (p: StancePose): StancePose => ({ ...p });

export function createStance(c: StanceCfg, rightHanded: boolean): StanceState {
  const pose = targetPose(READY, 0, c, rightHanded);
  return { gate: READY, pose, prev: clonePose(pose) };
}

// Reads the stick. `ly` is positive up. Zone boundaries along "down" travel d = -ly:
//   Back | Ready | Sit | Front | Step     at  -rest, +rest, +rest+w, +rest+2w     (w = (1 - rest) / 3)
// Hysteresis keeps the current gate until the thumb is clearly past the boundary.
export function selectGate(ly: number, active: number, prev: number, c: StanceCfg): number {
  if (!active) return READY;
  const d = -ly;
  const w = (1 - c.gateRest) / 3;
  const edges = [-c.gateRest, c.gateRest, c.gateRest + w, c.gateRest + 2 * w];
  let idx = 0;
  for (let i = 0; i < edges.length; i++) {
    const eff = prev > i ? edges[i]! - c.hysteresis : edges[i]! + c.hysteresis;
    if (d >= eff) idx = i + 1;
  }
  return idx;
}

// Where the feet and body want to be. `off` is toward the off side (screen-left for a right-hander).
export function targetPose(gate: number, lineX: number, c: StanceCfg, rightHanded: boolean): StancePose {
  const f = rightHanded ? -1 : 1; // X = f * (distance toward the off side)
  let ff: [number, number];
  let bf: [number, number];
  let drop = 0;
  let lean = 0.12;
  let wf = 0.5;
  switch (gate) {
    case BACK:
      ff = [0.25, -0.05];
      bf = [-0.05, -c.backStep];
      drop = 0.05;
      lean = 0.06;
      wf = 0.2;
      break;
    case SIT:
      ff = [0.15, c.sitReach];
      bf = [-0.35, -0.2];
      drop = c.sitDrop;
      lean = 0.3;
      wf = 0.65;
      break;
    case FRONT:
      ff = [0.15, c.frontStride];
      bf = [-0.25, -0.12];
      drop = 0.1;
      lean = 0.2;
      wf = 0.75;
      break;
    case STEP:
      ff = [0.1, c.stepOut];
      bf = [-0.15, c.stepOut * 0.4];
      drop = 0.12;
      lean = 0.22;
      wf = 0.8;
      break;
    default:
      ff = [0.22, 0.1];
      bf = [-0.22, -0.1];
  }
  let ffx = f * ff[0];
  let bfx = f * bf[0];
  // The stick's horizontal travel slides the working foot sideways (across to leg, or out to off).
  if (gate === BACK) bfx += lineX * c.lineReach;
  else if (gate !== READY) ffx += lineX * c.lineReach;
  return { ffx, ffz: ff[1], bfx, bfz: bf[1], ffLift: 0, bfLift: 0, drop, lean, wf };
}

const approach = (cur: number, target: number, maxDelta: number) => {
  const d = target - cur;
  return d > maxDelta ? cur + maxDelta : d < -maxDelta ? cur - maxDelta : target;
};

function moveFoot(p: StancePose, which: 'ff' | 'bf', tx: number, tz: number, speed: number, dt: number, liftMax: number): void {
  const x = which === 'ff' ? p.ffx : p.bfx;
  const z = which === 'ff' ? p.ffz : p.bfz;
  const dx = tx - x;
  const dz = tz - z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const step = speed * dt;
  let nx = tx;
  let nz = tz;
  if (dist > step) {
    nx = x + (dx / dist) * step;
    nz = z + (dz / dist) * step;
  }
  const remaining = Math.max(0, dist - step);
  const lift = Math.min(liftMax, remaining * 0.35);
  if (which === 'ff') {
    p.ffx = nx;
    p.ffz = nz;
    p.ffLift = lift;
  } else {
    p.bfx = nx;
    p.bfz = nz;
    p.bfLift = lift;
  }
}

// One tick: pick the gate from the stick, then move the body toward that stance at limited speeds.
export function stepStance(st: StanceState, ly: number, lx: number, active: number, dt: number, c: StanceCfg, rightHanded: boolean): void {
  Object.assign(st.prev, st.pose);
  st.gate = selectGate(ly, active, st.gate, c);
  const t = targetPose(st.gate, active ? lx : 0, c, rightHanded);
  const p = st.pose;
  moveFoot(p, 'ff', t.ffx, t.ffz, c.footSpeed, dt, 0.15);
  moveFoot(p, 'bf', t.bfx, t.bfz, c.footSpeed, dt, 0.15);
  p.drop = approach(p.drop, t.drop, c.hipSpeed * dt);
  p.lean = approach(p.lean, t.lean, c.leanSpeed * dt);
  p.wf = approach(p.wf, t.wf, c.weightSpeed * dt);
}

export function lerpPose(a: StancePose, b: StancePose, k: number): StancePose {
  const l = (x: number, y: number) => x + (y - x) * k;
  return { ffx: l(a.ffx, b.ffx), ffz: l(a.ffz, b.ffz), bfx: l(a.bfx, b.bfx), bfz: l(a.bfz, b.bfz), ffLift: l(a.ffLift, b.ffLift), bfLift: l(a.bfLift, b.bfLift), drop: l(a.drop, b.drop), lean: l(a.lean, b.lean), wf: l(a.wf, b.wf) };
}
