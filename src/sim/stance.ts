import type { GameConfig } from '../config/defaults';

// Stances. The player taps a stance button (and may change their mind until the swing starts). Each stance is an
// authored full-body posture: feet, hip drop, torso lean, weight, chest turn, hands and the bat's backlift. The body
// then moves toward the target at limited speeds, so choosing a stance late means the feet have not arrived.
// Coordinates are the view frame relative to the batter's guard: X screen-right, Z toward the bowler.
// Written in "off-side" terms (positive x = toward the off side) and mirrored for left-handers.

export const READY = 0;
export const BACK = 1;
export const FRONT = 2;
export const SWEEP = 3;
export const REVERSE = 4;
export const STEP = 5;
export const SIT = SWEEP; // old name
export const STANCE_NAMES = ['Ready', 'Back foot', 'Front foot', 'Sweep', 'Reverse sweep', 'Step up and hit'] as const;
export const STANCE_COUNT = STANCE_NAMES.length;

export type StanceCfg = GameConfig['stance'];

export interface StancePose {
  ffx: number; // front foot (the foot nearer the bowler), relative to the guard
  ffz: number;
  bfx: number; // back foot
  bfz: number;
  ffLift: number; // foot height above the ground while it is moving
  bfLift: number;
  drop: number; // extra hip drop, metres
  pitch: number; // torso hinge forward from the hips toward the bowler, radians
  wf: number; // weight on the front foot, 0..1
  line: number; // reserved (swing direction offset); zero until swipes arrive
  open: number; // chest turn toward the bowler, radians, added to body.open (0 = side-on)
  hip: number; // pelvis turn from side-on toward the bowler, radians (pi/2 = square to the bowler)
  toeF: number; // front foot direction, radians from side-on (pi/2 = pointing at the bowler)
  toeB: number; // back foot direction, same convention
  hx: number; // hands at rest, from the shoulder centre, in batter axes: toward the off side,
  hy: number; //   up (negative is below the shoulders, scaled by body height),
  hz: number; //   and toward the bowler
  blBack: number; // backlift: bat tilt from vertical, radians (0 upright, about 2.6 grounded)
  blSide: number; // backlift: azimuth of the tilt, radians (0 toward the keeper, pi/2 toward the off side)
}

export interface StanceState {
  gate: number; // the stance the body is heading for
  pose: StancePose;
  prev: StancePose; // previous tick, for render interpolation only
}

export const clonePose = (p: StancePose): StancePose => ({ ...p });

export function createStance(c: StanceCfg, rightHanded: boolean): StanceState {
  const pose = targetPose(READY, c, rightHanded);
  return { gate: READY, pose, prev: clonePose(pose) };
}

// Where the feet and body want to be. Values are written for a right-hander as (toward the off side, toward the bowler).
// Each stance sets: feet, hip drop, torso hinge (pitch), weight, the chest turn (open), the pelvis turn (hip), the
// direction each foot points (toeF/toeB), the hands, and the backlift (tilt blBack and azimuth blSide of the bat).
export function targetPose(gate: number, c: StanceCfg, rightHanded: boolean, lifted = true): StancePose {
  const f = rightHanded ? -1 : 1; // X = f * (distance toward the off side)
  let ff: [number, number] = [0.2, 0.12];
  let bf: [number, number] = [-0.2, -0.05];
  let drop = 0;
  let pitch = 0.7;
  let wf = 0.5;
  let open = -0.15;
  let hip = 1.05;
  let toeF = 1.0;
  let toeB = 0.9;
  let hands: [number, number, number] = [0.0, -0.45, 0.12];
  let blBack = 0.95; // tilt of the lifted bat from vertical
  let blSide = 1.0; // azimuth of that tilt: 0 back toward the keeper, pi/2 toward the off side (gully)
  let bfLift = 0;
  switch (gate) {
    case BACK: // back and across: rear foot goes back toward off stump, weight on it, upright, bat high
      ff = [0.2, -0.02];
      bf = [-0.02, -c.backStep];
      pitch = 0.3;
      wf = 0.2;
      open = -0.3;
      hip = 0.9;
      toeF = 1.0;
      toeB = 0.4;
      hands = [0.05, -0.36, 0.1];
      blBack = 0.55;
      blSide = 0.85;
      break;
    case FRONT: // stride to the pitch of the ball, head over the knee, bat comes down straight
      ff = [0.22, c.frontStride];
      bf = [-0.24, -0.04];
      drop = 0.1;
      pitch = 0.75;
      wf = 0.78;
      open = -0.25;
      hip = 1.1;
      toeF = 1.25;
      toeB = 0.6;
      hands = [0.1, -0.42, 0.3];
      blBack = 0.6;
      blSide = 1.0;
      bfLift = 0.03;
      break;
    case SWEEP: // front foot forward and the back knee down; low and square-on, bat back low
      ff = [0.1, c.sitReach];
      bf = [-0.45, -0.1];
      drop = c.sitDrop;
      pitch = 0.85;
      wf = 0.62;
      open = 0.2;
      hip = 1.2;
      hands = [0.14, -0.36, 0.3];
      blBack = 1.3;
      blSide = 0.4;
      break;
    case REVERSE: // as the sweep, but turned more toward the bowler, bat held out front and low
      ff = [0.3, c.sitReach * 0.9];
      bf = [-0.35, -0.12];
      drop = c.sitDrop;
      pitch = 0.8;
      wf = 0.6;
      open = 0.55;
      hip = 1.45;
      hands = [0.14, -0.34, 0.3];
      blBack = 1.1;
      blSide = 1.2;
      break;
    case STEP: // down the pitch: long stride, back heel up, bat high
      ff = [0.1, c.stepOut];
      bf = [-0.15, c.stepOut * 0.4];
      drop = 0.1;
      pitch = 0.7;
      wf = 0.7;
      open = -0.25;
      hands = [0.08, -0.34, 0.2];
      blBack = 0.45;
      blSide = 0.8;
      bfLift = 0.05;
      break;
    default: // READY: feet shoulder-width along the crease, knees soft, weight even, bat behind and outside the feet
  }
  if (!lifted) {
    // Grounded: the bat rests on the ground out to the off side by the toes, the hands low in front of the thighs.
    blBack = 2.45;
    blSide = 1.45;
    hands = [hands[0] + 0.07, Math.min(hands[1], -0.52), hands[2] - 0.07];
  }
  return {
    ffx: f * ff[0], ffz: ff[1], bfx: f * bf[0], bfz: bf[1], ffLift: 0, bfLift, drop, pitch, wf, line: 0, open, hip, toeF, toeB,
    hx: hands[0], hy: hands[1], hz: hands[2], blBack, blSide,
  };
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

// One tick: take the stance the player has selected, then move the body toward it at limited speeds.
// While `locked` (a swing is under way) the feet stay planted: the stance cannot change.
export function stepStance(st: StanceState, sel: number, dt: number, c: StanceCfg, rightHanded: boolean, locked = false, lifted = true): void {
  Object.assign(st.prev, st.pose);
  if (!locked && sel >= 0 && sel < STANCE_COUNT) st.gate = sel;
  const t = targetPose(st.gate, c, rightHanded, lifted);
  const p = st.pose;
  moveFoot(p, 'ff', t.ffx, t.ffz, c.footSpeed, dt, 0.15);
  moveFoot(p, 'bf', t.bfx, t.bfz, c.footSpeed, dt, 0.15);
  p.drop = approach(p.drop, t.drop, c.hipSpeed * dt);
  p.pitch = approach(p.pitch, t.pitch, c.leanSpeed * dt);
  p.hip = approach(p.hip, t.hip, c.turnSpeed * dt);
  p.toeF = approach(p.toeF, t.toeF, c.turnSpeed * dt);
  p.toeB = approach(p.toeB, t.toeB, c.turnSpeed * dt);
  p.wf = approach(p.wf, t.wf, c.weightSpeed * dt);
  p.open = approach(p.open, t.open, c.turnSpeed * dt);
  p.blBack = approach(p.blBack, t.blBack, c.turnSpeed * 2.5 * dt);
  p.blSide = approach(p.blSide, t.blSide, c.turnSpeed * 2.5 * dt);
  p.hx = approach(p.hx, t.hx, c.handSpeed * dt);
  p.hy = approach(p.hy, t.hy, c.handSpeed * dt);
  p.hz = approach(p.hz, t.hz, c.handSpeed * dt);
  p.line = 0;
}

export function lerpPose(a: StancePose, b: StancePose, k: number): StancePose {
  const l = (x: number, y: number) => x + (y - x) * k;
  return {
    ffx: l(a.ffx, b.ffx), ffz: l(a.ffz, b.ffz), bfx: l(a.bfx, b.bfx), bfz: l(a.bfz, b.bfz), ffLift: l(a.ffLift, b.ffLift), bfLift: l(a.bfLift, b.bfLift),
    drop: l(a.drop, b.drop), pitch: l(a.pitch, b.pitch), wf: l(a.wf, b.wf), line: l(a.line, b.line), open: l(a.open, b.open),
    hip: l(a.hip, b.hip), toeF: l(a.toeF, b.toeF), toeB: l(a.toeB, b.toeB),
    hx: l(a.hx, b.hx), hy: l(a.hy, b.hy), hz: l(a.hz, b.hz), blBack: l(a.blBack, b.blBack), blSide: l(a.blSide, b.blSide),
  };
}
