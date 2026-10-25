import type { GameConfig } from '../config/defaults';
import type { StancePose } from './stance';

// Batsman skeleton, pure math (no rendering library). Phase 0.1 placeholder pose:
// feet, hips, spine, head, shoulders, elbows, wrists and the bat are solved from the
// sim state with two-bone IK. Every joint is already named and listed in JOINTS with
// its parent and its rotation limits, so the full joint-driven model can replace the
// solver later without renaming anything.
//
// Frame ("view frame"): X is screen-right as seen from the bowler's end, Y is up,
// Z is toward the bowler (the camera behind the bowler looks along -Z).
// Right-handers face screen-left (their off side); left-handers are the mirror image.

export type Vec = [number, number, number];

export const JOINT_NAMES = [
  'pelvis', 'spine', 'neck', 'head',
  'hipL', 'kneeL', 'ankleL', 'toeL',
  'hipR', 'kneeR', 'ankleR', 'toeR',
  'shoulderL', 'elbowL', 'wristL',
  'shoulderR', 'elbowR', 'wristR',
  'batTop', 'batGrip', 'batToe',
] as const;
export type JointName = (typeof JOINT_NAMES)[number];

// Skeleton tree. Limits are degrees [min, max] per axis; the defaults deliberately give
// every joint its full range ("full freedom first"). They are data, to be tightened from
// gameplay feedback; the placeholder solver does not enforce them yet.
export interface JointDef {
  name: JointName;
  parent: JointName | null;
  limits: { x: [number, number]; y: [number, number]; z: [number, number] };
}
const FREE: JointDef['limits'] = { x: [-180, 180], y: [-180, 180], z: [-180, 180] };
const parentOf: Record<JointName, JointName | null> = {
  pelvis: null, spine: 'pelvis', neck: 'spine', head: 'neck',
  hipL: 'pelvis', kneeL: 'hipL', ankleL: 'kneeL', toeL: 'ankleL',
  hipR: 'pelvis', kneeR: 'hipR', ankleR: 'kneeR', toeR: 'ankleR',
  shoulderL: 'neck', elbowL: 'shoulderL', wristL: 'elbowL',
  shoulderR: 'neck', elbowR: 'shoulderR', wristR: 'elbowR',
  batTop: 'wristL', batGrip: 'batTop', batToe: 'batGrip',
};
export const JOINTS: JointDef[] = JOINT_NAMES.map((name) => ({ name, parent: parentOf[name], limits: { ...FREE } }));

export type Pose = Record<JointName, Vec>;

export interface PoseInput {
  stance: StancePose; // feet, hip drop, lean and weight from the stance model
  bx: number; // bat stick offset, metres-ish from the sim
  by: number;
  rightHanded: boolean;
  baseZ: number; // batting crease Z
}

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec) => Math.sqrt(dot(a, a));
const norm = (a: Vec): Vec => {
  const l = len(a);
  return l < 1e-9 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
export const dist = (a: Vec, b: Vec) => len(sub(a, b));

// Two-bone IK. Returns the middle joint and the end point actually reached
// (the target is pulled in if it is out of reach, so bone lengths never change).
export function twoBone(root: Vec, target: Vec, l1: number, l2: number, pole: Vec): { mid: Vec; end: Vec } {
  const full = sub(target, root);
  const dir = norm(full);
  const d = Math.min(Math.max(len(full), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let side = sub(pole, mul(dir, dot(pole, dir)));
  if (len(side) < 1e-6) side = [0, 0, 1];
  side = norm(side);
  return { mid: add(add(root, mul(dir, a)), mul(side, h)), end: add(root, mul(dir, d)) };
}

export interface BodyDims {
  thigh: number;
  shin: number;
  upperArm: number;
  foreArm: number;
  shoulderHalf: number;
  hipHalf: number;
  torso: number; // pelvis to neck base
  neck: number;
  headCentre: number; // neck top to head centre
  ankle: number; // ankle height above ground
  batTotal: number;
  batHandle: number;
  scale: number;
}

export function bodyDims(body: GameConfig['body']): BodyDims {
  const k = body.height / 1.8;
  return {
    thigh: 0.46 * k, shin: 0.45 * k, upperArm: 0.31 * k, foreArm: 0.29 * k,
    shoulderHalf: 0.2 * k, hipHalf: 0.1 * k, torso: 0.52 * k, neck: 0.08 * k,
    headCentre: 0.14 * k, ankle: 0.08 * k, batTotal: 0.96, batHandle: 0.3, scale: k,
  };
}

// Chest-facing direction in the view frame. `open` turns a side-on stance toward the bowler.
export function facingVec(rightHanded: boolean, open: number): Vec {
  return [(rightHanded ? -1 : 1) * Math.cos(open), 0, Math.sin(open)];
}

export function solvePose(inp: PoseInput, body: GameConfig['body']): Pose {
  const D = bodyDims(body);
  const rh = inp.rightHanded;
  // f: sign of the chest-facing direction along X. Right-handers face screen-left.
  const f = rh ? -1 : 1;
  // "L" is the batter's own left. For a right-hander the left side is toward the bowler (+Z).
  const wL = rh ? 1 : -1;
  const baseX = -f * body.guardOffset; // stands on the leg side of the stumps
  const baseZ = inp.baseZ;
  const st = inp.stance;
  // local (u forward along chest, w across the shoulders toward the bowler, y up) -> view frame
  const fv = facingVec(rh, body.open);
  const wv: Vec = [-f * Math.sin(body.open), 0, Math.cos(body.open)];
  const L = (u: number, y: number, w: number): Vec => [fv[0] * u + wv[0] * w, y, fv[2] * u + wv[2] * w]; // offset only

  // The front foot (nearer the bowler) is the batter's left for a right-hander, right for a left-hander.
  const front: Vec = [baseX + st.ffx, D.ankle + st.ffLift, baseZ + st.ffz];
  const back: Vec = [baseX + st.bfx, D.ankle + st.bfLift, baseZ + st.bfz];
  const ankleL = wL > 0 ? front : back;
  const ankleR = wL > 0 ? back : front;
  const toeL = add(ankleL, L(0.2 * D.scale, -D.ankle + 0.03, 0));
  const toeR = add(ankleR, L(0.2 * D.scale, -D.ankle + 0.03, 0));

  // Pelvis sits between the feet, shifted toward the foot carrying the weight.
  const px = back[0] + (front[0] - back[0]) * st.wf;
  const pz = back[2] + (front[2] - back[2]) * st.wf;
  const legMax = D.thigh + D.shin;
  const wanted = legMax * 0.93 + D.ankle - body.crouch - st.drop;
  // Wide strides pull the hips down so the legs never have to stretch.
  const hipAt = (foot: Vec, side: number): number => {
    const hx = px + wv[0] * side * D.hipHalf;
    const hz = pz + wv[2] * side * D.hipHalf;
    const dx = foot[0] - hx;
    const dz = foot[2] - hz;
    return foot[1] + Math.sqrt(Math.max(0.04, (legMax * 0.985) ** 2 - dx * dx - dz * dz));
  };
  const hipH = Math.min(wanted, hipAt(ankleL, wL), hipAt(ankleR, -wL));
  const pelvis: Vec = [px, hipH, pz];
  const hipL = add(pelvis, L(0, 0, wL * D.hipHalf));
  const hipR = add(pelvis, L(0, 0, -wL * D.hipHalf));

  // Torso leans toward the bowler (and a little forward along the chest), as a batter does.
  const lean = st.lean;
  const spine = add(pelvis, L(0.02, D.torso * 0.45, lean * 0.4));
  const neck = add(pelvis, L(0.03, D.torso, lean));
  const headTop = add(neck, [0, D.neck, 0.02]);
  const head = add(headTop, L(0.0, D.headCentre, 0.04));
  const shoulderL = add(neck, L(0, -0.04 * D.scale, wL * D.shoulderHalf));
  const shoulderR = add(neck, L(0, -0.04 * D.scale, -wL * D.shoulderHalf));

  const legPole: Vec = fv;
  const legL = twoBone(hipL, ankleL, D.thigh, D.shin, add(legPole, L(0, 0, wL * 0.3)));
  const legR = twoBone(hipR, ankleR, D.thigh, D.shin, add(legPole, L(0, 0, -wL * 0.3)));

    const mid = mul(add(shoulderL, shoulderR), 0.5);
  // Rest is the backlift: hands at chest height, bat raised behind the body, toe up and back toward slip.
  const grip0 = add(mid, L(0.1, -0.38 * D.scale, 0.12));
  const toe0 = add(grip0, L(0.18, 0.78, -0.32));
  // The right stick moves the bat toe; the hands follow part of the way.
  const toeTarget: Vec = add(toe0, [inp.bx * 0.9, inp.by * 0.9, 0]);
  let grip = add(grip0, [inp.bx * 0.35, inp.by * 0.35, 0]);
  const rel = sub(grip, mid);
  const reach = (D.upperArm + D.foreArm) * 0.92;
  if (len(rel) > reach) grip = add(mid, mul(norm(rel), reach));
  const axis = norm(sub(toeTarget, grip)); // handle toward blade
  const batTop = sub(grip, mul(axis, D.batHandle * 0.55));
  const batToe = add(batTop, mul(axis, D.batTotal));
  // Bottom hand at the grip, top hand a hand-width higher. Right-hander: left hand on top.
  const topHand = sub(grip, mul(axis, 0.12));
  const wristL = wL > 0 ? topHand : grip;
  const wristR = wL > 0 ? grip : topHand;

  const armPoleL: Vec = add([0, -1, 0], L(0, 0, wL * 0.6));
  const armPoleR: Vec = add([0, -1, 0], L(0, 0, -wL * 0.6));
  const armL = twoBone(shoulderL, wristL, D.upperArm, D.foreArm, armPoleL);
  const armR = twoBone(shoulderR, wristR, D.upperArm, D.foreArm, armPoleR);

  return {
    pelvis, spine, neck, head,
    hipL, kneeL: legL.mid, ankleL, toeL,
    hipR, kneeR: legR.mid, ankleR, toeR,
    shoulderL, elbowL: armL.mid, wristL: armL.end,
    shoulderR, elbowR: armR.mid, wristR: armR.end,
    batTop, batGrip: grip, batToe,
  };
}
