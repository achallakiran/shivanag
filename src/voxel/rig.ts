import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { buildMesh } from './mesh';
import { BAT, BOOT, DIM, FORE_ARM, GLOVE, HEAD, PELVIS, SHIN, THIGH, TORSO, UPPER_ARM } from './parts';

// A pose is plain data. Angles are in degrees:
//   pitch is positive forward (flexion), yaw is positive toward the batter's right (the off side for a right-hander),
//   roll is the raw side rotation (for legs positive swings the foot toward the batter's right; for the spine and head
//   positive tilts the top toward the batter's left).
// The root yaw turns the whole body: 0 faces the bowler, 90 faces the off side (side-on).
export type Euler3 = [number, number, number]; // [pitch, yaw, roll]
export interface PoseData {
  root: { x: number; z: number; yaw: number }; // metres from the guard, degrees
  pelvis: Euler3;
  spine: Euler3;
  head: Euler3;
  hipL: Euler3;
  hipR: Euler3;
  kneeL: number; // flexion, degrees
  kneeR: number;
  ankleL: number; // toes up, degrees
  ankleR: number;
  // bat: top of the handle in the root frame (metres: x toward the batter's right, y up, z forward), the direction the toe
  // points (azimuth from forward toward the right, elevation above horizontal; -90 is straight down), and the roll of the
  // blade about its length (0 = face toward the bowler)
  bat: { pos: [number, number, number]; az: number; el: number; roll: number };
  elbowOut: number; // 0 elbows hang straight down, 1 they wing out
  kneeDown?: 'L' | 'R'; // that knee rests on the ground (sweeps); the body is lowered to it instead of to the feet
}

const D2R = Math.PI / 180;

export interface Joints {
  head: Vector3; pelvis: Vector3;
  shoulderL: Vector3; shoulderR: Vector3; elbowL: Vector3; elbowR: Vector3; wristL: Vector3; wristR: Vector3;
  kneeL: Vector3; kneeR: Vector3; ankleL: Vector3; ankleR: Vector3;
  batTop: Vector3; batToe: Vector3;
  gripError: number; // how far the hands are from the handle (m); 0 when the arms reach
}

export interface Batsman {
  root: TransformNode;
  meshes: Mesh[];
  apply(p: PoseData): Joints;
  setVisible(v: boolean): void;
}

// Parts that point up from their joint (pelvis, spine, head) tip forward with a positive rotation about x; parts that hang
// down from their joint (thighs) swing forward with a negative one. Both take a positive pitch to mean "forward".
const eulerUp = (n: TransformNode, e: Euler3) => {
  n.rotation.set(e[0] * D2R, e[1] * D2R, e[2] * D2R);
};
const eulerDown = (n: TransformNode, e: Euler3) => {
  n.rotation.set(-e[0] * D2R, e[1] * D2R, e[2] * D2R);
};

// Orient a node so that its local -Y axis points along `dir`.
function aim(n: TransformNode, dir: Vector3, hint: Vector3): void {
  const y = dir.scale(-1).normalize();
  let x = Vector3.Cross(hint, y);
  if (x.lengthSquared() < 1e-6) x = Vector3.Cross(new Vector3(0, 0, 1), y);
  x.normalize();
  const z = Vector3.Cross(x, y).normalize();
  const m = Matrix.FromValues(x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1);
  n.rotationQuaternion = Quaternion.FromRotationMatrix(m);
}

function twoBone(root: Vector3, target: Vector3, l1: number, l2: number, pole: Vector3): { mid: Vector3; end: Vector3; short: number } {
  const full = target.subtract(root);
  const reach = full.length();
  const dir = reach > 1e-9 ? full.scale(1 / reach) : new Vector3(0, -1, 0);
  const d = Math.min(Math.max(reach, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let side = pole.subtract(dir.scale(Vector3.Dot(pole, dir)));
  if (side.lengthSquared() < 1e-9) side = new Vector3(0, 0, 1);
  side.normalize();
  return { mid: root.add(dir.scale(a)).add(side.scale(h)), end: root.add(dir.scale(d)), short: Math.max(0, reach - d) };
}

export function createBatsman(scene: Scene, material: Material): Batsman {
  const meshes: Mesh[] = [];
  const node = (name: string, parent: TransformNode | null, x = 0, y = 0, z = 0) => {
    const n = new TransformNode(name, scene);
    if (parent) n.parent = parent;
    n.position.set(x, y, z);
    return n;
  };
  const attach = (part: Parameters<typeof buildMesh>[0], parent: TransformNode) => {
    const m = buildMesh(part, scene, material);
    m.parent = parent;
    meshes.push(m);
    return m;
  };

  const root = node('batsman', null);
  const pelvisN = node('pelvis', root);
  attach(PELVIS, pelvisN);
  const spineN = node('spine', pelvisN, 0, DIM.spineAt, 0);
  attach(TORSO, spineN);
  const headN = node('head', spineN, 0, DIM.headAt, 0);
  attach(HEAD, headN);

  const leg = (side: 'L' | 'R') => {
    const s = side === 'L' ? -1 : 1;
    const hip = node(`hip${side}`, pelvisN, s * DIM.hipHalf, 0, 0);
    attach(THIGH, hip);
    const knee = node(`knee${side}`, hip, 0, -DIM.thigh, 0);
    attach(SHIN, knee);
    const ankle = node(`ankle${side}`, knee, 0, -DIM.shin, 0);
    attach(BOOT, ankle);
    return { hip, knee, ankle };
  };
  const legL = leg('L');
  const legR = leg('R');

  const batN = node('bat', root);
  attach(BAT, batN);

  // arms are placed in world space by the solver
  const arm = (side: 'L' | 'R') => {
    const sh = node(`shoulder${side}`, null);
    attach(UPPER_ARM, sh);
    const el = node(`elbow${side}`, null);
    attach(FORE_ARM, el);
    const wr = node(`wrist${side}`, null);
    attach(GLOVE, wr);
    return { sh, el, wr };
  };
  const armL = arm('L');
  const armR = arm('R');

  const toWorld = (n: TransformNode, local: Vector3) => Vector3.TransformCoordinates(local, n.getWorldMatrix());
  const FOOT_PTS = [new Vector3(0, -0.1, 0), new Vector3(0, -0.1, 0.3), new Vector3(-0.06, -0.1, 0.1), new Vector3(0.06, -0.1, 0.1)];

  function apply(p: PoseData): Joints {
    root.position.set(p.root.x, 0, p.root.z);
    root.rotation.set(0, p.root.yaw * D2R, 0);
    eulerUp(pelvisN, p.pelvis);
    eulerUp(spineN, p.spine);
    eulerUp(headN, p.head);
    eulerDown(legL.hip, p.hipL);
    eulerDown(legR.hip, p.hipR);
    legL.knee.rotation.set(p.kneeL * D2R, 0, 0);
    legR.knee.rotation.set(p.kneeR * D2R, 0, 0);

    batN.position.set(p.bat.pos[0], p.bat.pos[1], p.bat.pos[2]);
    const ce = Math.cos(p.bat.el * D2R);
    const toeDir = new Vector3(ce * Math.sin(p.bat.az * D2R), Math.sin(p.bat.el * D2R), ce * Math.cos(p.bat.az * D2R));
    aim(batN, toeDir, new Vector3(0, 0, -1));
    if (p.bat.roll) batN.rotationQuaternion = batN.rotationQuaternion!.multiply(Quaternion.RotationAxis(new Vector3(0, 1, 0), p.bat.roll * D2R));

    // the feet stay flat whatever the thigh and shin do, pointing the way the leg is turned; `ankle` raises the toes
    root.computeWorldMatrix(true);
    for (const n of [pelvisN, legL.hip, legL.knee, legR.hip, legR.knee]) n.computeWorldMatrix(true);
    const level = (ankle: TransformNode, knee: TransformNode, toesUp: number) => {
      const f = Vector3.TransformNormal(new Vector3(0, 0, 1), knee.getWorldMatrix());
      const yaw = Math.atan2(f.x, f.z);
      const desired = Matrix.RotationYawPitchRoll(yaw, -toesUp * D2R, 0);
      const local = desired.multiply(Matrix.Invert(knee.getWorldMatrix().getRotationMatrix()));
      ankle.rotationQuaternion = Quaternion.FromRotationMatrix(local);
    };
    level(legL.ankle, legL.knee, p.ankleL);
    level(legR.ankle, legR.knee, p.ankleR);

    // plant the lower foot on the ground
    root.computeWorldMatrix(true);
    for (const n of [pelvisN, spineN, headN, legL.hip, legL.knee, legL.ankle, legR.hip, legR.knee, legR.ankle, batN]) n.computeWorldMatrix(true);
    let low = Infinity;
    if (p.kneeDown) low = toWorld(p.kneeDown === 'L' ? legL.knee : legR.knee, Vector3.Zero()).y - 0.09;
    else for (const a of [legL.ankle, legR.ankle]) for (const f of FOOT_PTS) low = Math.min(low, toWorld(a, f).y);
    root.position.y = -low;
    root.computeWorldMatrix(true);
    for (const n of [pelvisN, spineN, headN, legL.hip, legL.knee, legL.ankle, legR.hip, legR.knee, legR.ankle, batN]) n.computeWorldMatrix(true);

    // arms: both hands on the handle (the batter's left hand on top)
    const shL = toWorld(spineN, new Vector3(-DIM.shoulderHalf, DIM.shoulderUp, 0));
    const shR = toWorld(spineN, new Vector3(DIM.shoulderHalf, DIM.shoulderUp, 0));
    const top = toWorld(batN, new Vector3(0, -0.1, 0));
    const bottom = toWorld(batN, new Vector3(0, -0.24, 0));
    const right = Vector3.TransformNormal(new Vector3(1, 0, 0), spineN.getWorldMatrix()).normalize();
    const fwd = Vector3.TransformNormal(new Vector3(0, 0, 1), spineN.getWorldMatrix()).normalize();
    const mk = (sh: Vector3, wrist: Vector3, outward: Vector3) => {
      const pole = new Vector3(0, -1, 0).add(outward.scale(p.elbowOut * 1.4)).add(fwd.scale(-0.15));
      return twoBone(sh, wrist, DIM.upperArm, DIM.foreArm, pole);
    };
    const aL = mk(shL, top, right.scale(-1));
    const aR = mk(shR, bottom, right);
    const place = (a: typeof armL, sh: Vector3, r: { mid: Vector3; end: Vector3 }) => {
      a.sh.position.copyFrom(sh);
      aim(a.sh, r.mid.subtract(sh), fwd);
      a.el.position.copyFrom(r.mid);
      aim(a.el, r.end.subtract(r.mid), fwd);
      a.wr.position.copyFrom(r.end);
      aim(a.wr, r.end.subtract(r.mid), fwd);
    };
    place(armL, shL, aL);
    place(armR, shR, aR);

    return {
      head: toWorld(headN, new Vector3(0, 0.12, 0)), pelvis: toWorld(pelvisN, new Vector3(0, 0, 0)),
      shoulderL: shL, shoulderR: shR, elbowL: aL.mid, elbowR: aR.mid, wristL: aL.end, wristR: aR.end,
      kneeL: toWorld(legL.knee, Vector3.Zero()), kneeR: toWorld(legR.knee, Vector3.Zero()),
      ankleL: toWorld(legL.ankle, Vector3.Zero()), ankleR: toWorld(legR.ankle, Vector3.Zero()),
      batTop: toWorld(batN, Vector3.Zero()), batToe: toWorld(batN, new Vector3(0, -0.95, 0)),
      gripError: aL.short + aR.short,
    };
  }

  return { root, meshes, apply, setVisible: (v) => { for (const m of meshes) m.setEnabled(v); } };
}
