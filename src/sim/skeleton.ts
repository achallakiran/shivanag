import type { GameConfig } from '../config/defaults';
import type { StancePose } from './stance';
import { batFrame, BAT_HANDLE, BAT_TOTAL, type BatFrame } from './bat';

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

export type Pose = Record<JointName, Vec> & {
  batFace: Vec;
  batFlat: Vec;
  // horizontal directions each body part faces (for drawing): chest, pelvis, head and the two feet
  faceChest: Vec; facePelvis: Vec; faceHead: Vec; faceFootL: Vec; faceFootR: Vec;
};

export interface PoseInput {
  stance: StancePose; // feet, hip drop, lean and weight from the stance model
  alpha: number; // bat angle in its swing plane (see bat.ts)
  yaw: number; // shot direction of the swing plane, toward the off side
  eps?: number; // face tilt at contact
  roll?: number; // wrist roll
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

// Direction a body part faces in the view frame. `op` is its turn from side-on (facing the off side) toward the bowler:
// 0 faces the off side, pi/2 faces the bowler.
export function facingVec(rightHanded: boolean, op: number): Vec {
  return [(rightHanded ? -1 : 1) * Math.cos(op), 0, Math.sin(op)];
}
// The horizontal direction toward the batter's own left (the side nearer the bowler when side-on) for that facing.
const lateralVec = (rightHanded: boolean, op: number): Vec => [(rightHanded ? 1 : -1) * Math.sin(op), 0, Math.cos(op)];

// Everything that depends only on the stance. Separate turns for the feet, pelvis, chest and head, a hinge at the hips,
// and the hands' resting offset from the shoulders.
export interface Torso {
  ankleL: Vec; ankleR: Vec; toeL: Vec; toeR: Vec;
  pelvis: Vec; hipL: Vec; hipR: Vec; spine: Vec; neck: Vec; head: Vec;
  shoulderL: Vec; shoulderR: Vec; mid: Vec;
  restHands: Vec; // hands' resting offset from the shoulder centre
  faceChest: Vec; facePelvis: Vec; faceFootL: Vec; faceFootR: Vec;
  wL: number; D: BodyDims;
  armLen: number;
}

export function torso(st: StancePose, body: GameConfig['body'], rh: boolean, baseZ: number): Torso {
  const D = bodyDims(body);
  const f = rh ? -1 : 1; // X sign of "toward the off side"
  const wL = rh ? 1 : -1; // sign of the batter's own left shoulder along the lateral vector
  const baseX = -f * body.guardOffset; // stands on the leg side of the stumps
  const opC = body.open + st.open; // chest
  const opP = st.hip; // pelvis
  const faceChest = facingVec(rh, opC);
  const facePelvis = facingVec(rh, opP);
  const wc = lateralVec(rh, opC);
  const wp = lateralVec(rh, opP);

  const front: Vec = [baseX + st.ffx, D.ankle + st.ffLift, baseZ + st.ffz];
  const back: Vec = [baseX + st.bfx, D.ankle + st.bfLift, baseZ + st.bfz];
  // The front foot is the batter's left foot for a right-hander and the right foot for a left-hander.
  const ankleL = wL > 0 ? front : back;
  const ankleR = wL > 0 ? back : front;
  const faceFootL = facingVec(rh, wL > 0 ? st.toeF : st.toeB);
  const faceFootR = facingVec(rh, wL > 0 ? st.toeB : st.toeF);
  const toeL = add(ankleL, add(mul(faceFootL, 0.2 * D.scale), [0, -D.ankle + 0.03, 0]));
  const toeR = add(ankleR, add(mul(faceFootR, 0.2 * D.scale), [0, -D.ankle + 0.03, 0]));

  const px = back[0] + (front[0] - back[0]) * st.wf;
  const pz = back[2] + (front[2] - back[2]) * st.wf;
  const legMax = D.thigh + D.shin;
  const wanted = legMax * 0.95 + D.ankle - body.crouch - st.drop;
  const hipAt = (foot: Vec, side: number): number => {
    const hx = px + wp[0] * side * D.hipHalf;
    const hz = pz + wp[2] * side * D.hipHalf;
    const dx = foot[0] - hx;
    const dz = foot[2] - hz;
    return foot[1] + Math.sqrt(Math.max(0.04, (legMax * 0.985) ** 2 - dx * dx - dz * dz));
  };
  const hipH = Math.min(wanted, hipAt(ankleL, wL), hipAt(ankleR, -wL));
  const pelvis: Vec = [px, hipH, pz];
  const hipL = add(pelvis, mul(wp, wL * D.hipHalf));
  const hipR = add(pelvis, mul(wp, -wL * D.hipHalf));

  // The torso hinges forward at the hips toward the bowler.
  const up: Vec = [0, Math.cos(st.pitch), Math.sin(st.pitch)];
  const spine = add(pelvis, mul(up, D.torso * 0.45));
  const neck = add(pelvis, mul(up, D.torso));
  const headTop = add(neck, [0, D.neck, 0.05]);
  const head = add(headTop, [0, D.headCentre, 0.07]);
  const shoulderL = add(add(neck, [0, -0.04 * D.scale, 0]), mul(wc, wL * D.shoulderHalf));
  const shoulderR = add(add(neck, [0, -0.04 * D.scale, 0]), mul(wc, -wL * D.shoulderHalf));
  const mid = mul(add(shoulderL, shoulderR), 0.5);
  const restHands: Vec = [f * st.hx, st.hy * D.scale, st.hz];
  return { ankleL, ankleR, toeL, toeR, pelvis, hipL, hipR, spine, neck, head, shoulderL, shoulderR, mid, restHands, faceChest, facePelvis, faceFootL, faceFootR, wL, D, armLen: (D.upperArm + D.foreArm) * 0.92 };
}

// The bat for a stance, bat angle and swing plane. The sim and the renderer both use this.
export function batFor(st: StancePose, alpha: number, yaw: number, body: GameConfig['body'], rh: boolean, baseZ: number, eps?: number, roll = 0): BatFrame {
  const T = torso(st, body, rh, baseZ);
  return batFrame(T.mid, T.restHands, alpha, yaw, rh, T.armLen, st.blBack, st.blSide, eps, roll);
}

// Distance from a point to a segment, and the closest point on it.
function nearOnSegment(p: Vec, a: Vec, b: Vec): { d: number; q: Vec } {
  const ab = sub(b, a);
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / Math.max(1e-9, dot(ab, ab))));
  const q = add(a, mul(ab, t));
  return { d: dist(p, q), q };
}

// The solid parts of the body that arms and bat must stay outside: the torso, and the two thighs.
export const BODY_RADIUS = { torso: 0.16, thigh: 0.09 };
export function bodyCapsules(p: Pick<Pose, 'pelvis' | 'neck' | 'hipL' | 'kneeL' | 'hipR' | 'kneeR'>): { a: Vec; b: Vec; r: number }[] {
  return [
    { a: p.pelvis, b: p.neck, r: BODY_RADIUS.torso },
    { a: p.hipL, b: p.kneeL, r: BODY_RADIUS.thigh },
    { a: p.hipR, b: p.kneeR, r: BODY_RADIUS.thigh },
  ];
}
// How far a point sits inside the body (positive = inside by that much, accounting for `margin`), and the way out.
export function penetration(pt: Vec, caps: { a: Vec; b: Vec; r: number }[], margin = 0): { depth: number; out: Vec } {
  let best = { depth: 0, out: [0, 0, 0] as Vec };
  for (const c of caps) {
    const { d, q } = nearOnSegment(pt, c.a, c.b);
    const depth = c.r + margin - d;
    if (depth > best.depth) best = { depth, out: d > 1e-6 ? norm(sub(pt, q)) : [0, 0, 1] };
  }
  return best;
}

export function solvePose(inp: PoseInput, body: GameConfig['body']): Pose {
  const T = torso(inp.stance, body, inp.rightHanded, inp.baseZ);
  const { D, wL } = T;

  // Knees bend the way the feet point.
  const poleL = add(mul(T.faceFootL, 0.8), mul(T.facePelvis, 0.2));
  const poleR = add(mul(T.faceFootR, 0.8), mul(T.facePelvis, 0.2));
  const legL = twoBone(T.hipL, T.ankleL, D.thigh, D.shin, poleL);
  const legR = twoBone(T.hipR, T.ankleR, D.thigh, D.shin, poleR);

  const fr = batFrame(T.mid, T.restHands, inp.alpha, inp.yaw, inp.rightHanded, T.armLen, inp.stance.blBack, inp.stance.blSide, inp.eps, inp.roll ?? 0);
  const toe = add(fr.top, mul(fr.d, BAT_TOTAL));
  // Bottom hand at the grip, top hand a hand-width higher up the handle. Right-hander: left hand on top.
  const topHand = add(fr.hands, mul(fr.d, -0.12));
  const wristL = wL > 0 ? topHand : fr.hands;
  const wristR = wL > 0 ? fr.hands : topHand;

  // Elbows hang down and out from each shoulder, then are pushed clear of the torso and thighs.
  const caps = bodyCapsules({ pelvis: T.pelvis, neck: T.neck, hipL: T.hipL, kneeL: legL.mid, hipR: T.hipR, kneeR: legR.mid });
  const arm = (shoulder: Vec, wrist: Vec): { mid: Vec; end: Vec } => {
    const outward = norm([shoulder[0] - T.neck[0], 0, shoulder[2] - T.neck[2]]);
    let pole: Vec = add(add([0, -1, 0], mul(outward, 0.9)), mul(T.faceChest, -0.25));
    let r = twoBone(shoulder, wrist, D.upperArm, D.foreArm, pole);
    for (let i = 0; i < 3; i++) {
      const pen = penetration(r.mid, caps, 0.05);
      if (pen.depth < 0.005) break;
      pole = add(pole, mul(pen.out, 1.5));
      r = twoBone(shoulder, wrist, D.upperArm, D.foreArm, pole);
    }
    return r;
  };
  const armL = arm(T.shoulderL, wristL);
  const armR = arm(T.shoulderR, wristR);

  return {
    pelvis: T.pelvis, spine: T.spine, neck: T.neck, head: T.head,
    hipL: T.hipL, kneeL: legL.mid, ankleL: T.ankleL, toeL: T.toeL,
    hipR: T.hipR, kneeR: legR.mid, ankleR: T.ankleR, toeR: T.toeR,
    shoulderL: T.shoulderL, elbowL: armL.mid, wristL: armL.end,
    shoulderR: T.shoulderR, elbowR: armR.mid, wristR: armR.end,
    batTop: fr.top, batGrip: fr.hands, batToe: toe,
    batFace: fr.t, batFlat: fr.w,
    faceChest: T.faceChest, facePelvis: T.facePelvis, faceHead: [0, 0, 1], faceFootL: T.faceFootL, faceFootR: T.faceFootR,
  };
}
void BAT_HANDLE;
