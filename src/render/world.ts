import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { SimState } from '../sim/sim';
import type { GameConfig } from '../config/defaults';
import { JOINTS, JOINT_NAMES, bodyDims, facingVec, solvePose, type JointName, type Pose, type Vec } from '../sim/skeleton';
import { CAMERAS, fovForFill } from './cameras';
import { DEFAULT_CONFIG } from '../config/defaults';
import { createStance, lerpPose } from '../sim/stance';

import { BAT_Z, PITCH_LEN } from '../sim/field';
import { PHASE_CUE, RELEASE_Y, RELEASE_Z } from '../sim/machine';
export { BAT_Z, PITCH_LEN };

export interface ViewState {
  camera: number; // index into CAMERAS
  skeleton: boolean;
  rightHanded: boolean;
  size: number; // player size multiplier for the framing (1 = default)
  guide: boolean; // yellow line on the ground: the direction the bat swings through for the current stance and line
}

export interface World {
  scene: Scene;
  update(s: SimState, alpha: number): void;
  setView(v: Partial<ViewState>): ViewState;
  view(): ViewState;
  pose(): Pose;
  cameraLabel(): string;
}

function mat(scene: Scene, name: string, r: number, g: number, b: number, emissive = false): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(r, g, b);
  m.specularColor = Color3.Black();
  if (emissive) {
    m.disableLighting = true;
    m.emissiveColor = new Color3(r, g, b);
  }
  m.freeze();
  return m;
}

function box(scene: Scene, name: string, w: number, h: number, d: number, x: number, y: number, z: number, m: StandardMaterial): Mesh {
  const b = CreateBox(name, { width: w, height: h, depth: d }, scene);
  b.position.set(x, y, z);
  b.material = m;
  b.freezeWorldMatrix();
  return b;
}

// view frame (X screen-right) -> Babylon world (camera behind the bowler looks along -Z, so screen-right is -X)
const toWorld = (v: Vec): Vector3 => new Vector3(-v[0], v[1], v[2]);

const _q = new Quaternion();
const _m = new Matrix();

// Stretches a unit box between two points. `face` picks which way the box's depth axis points.
function span(mesh: Mesh, a: Vec, b: Vec, w: number, d: number, face: Vec = [0, 0, 1]): void {
  const A = toWorld(a);
  const B = toWorld(b);
  const dir = B.subtract(A);
  const length = dir.length();
  mesh.position.copyFrom(A.add(B).scale(0.5));
  mesh.scaling.set(w, Math.max(length, 1e-4), d);
  if (length < 1e-6) return;
  const y = dir.scale(1 / length);
  const zref = toWorld(face);
  let x = Vector3.Cross(y, zref);
  if (x.lengthSquared() < 1e-8) x = Vector3.Cross(y, new Vector3(1, 0, 0));
  x.normalize();
  const z = Vector3.Cross(x, y);
  Matrix.FromValuesToRef(x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1, _m);
  Quaternion.FromRotationMatrixToRef(_m, _q);
  if (!mesh.rotationQuaternion) mesh.rotationQuaternion = new Quaternion();
  mesh.rotationQuaternion.copyFrom(_q);
}

interface Part {
  mesh: Mesh;
  place(p: Pose, f: Vec, k: number): void;
}

export function createWorld(engine: AbstractEngine, cfg: Pick<GameConfig, 'body' | 'ball'>): World {
  const body = cfg.body;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.75, 0.95, 1);
  scene.skipPointerMovePicking = true;
  scene.autoClearDepthAndStencil = true;
  scene.setRenderingAutoClearDepthStencil(1, true);

  const light = new HemisphericLight('sun', new Vector3(0.3, 1, -0.4), scene);
  light.intensity = 1.0;
  light.groundColor = new Color3(0.72, 0.72, 0.72);

  const cam = new FreeCamera('cam', new Vector3(0, 2.6, 13.5), scene);
  cam.minZ = 0.1;
  cam.maxZ = 400;

  const grass = mat(scene, 'grass', 0.2, 0.55, 0.25);
  const grass2 = mat(scene, 'grass2', 0.24, 0.6, 0.29);
  const clay = mat(scene, 'clay', 0.82, 0.7, 0.48);
  const wood = mat(scene, 'wood', 0.95, 0.9, 0.75);
  const line = mat(scene, 'line', 0.97, 0.97, 0.97);
  const white = mat(scene, 'white', 0.93, 0.93, 0.9);
  const shirt = mat(scene, 'shirt', 0.1, 0.3, 0.78);
  const navy = mat(scene, 'navy', 0.06, 0.12, 0.35);
  const skin = mat(scene, 'skin', 0.82, 0.58, 0.42);
  const dark = mat(scene, 'dark', 0.12, 0.12, 0.14);
  const blade = mat(scene, 'blade', 0.9, 0.72, 0.4);
  const jointMat = mat(scene, 'joint', 1, 0.25, 0.1, true);
  const boneMat = mat(scene, 'bone', 1, 0.95, 0.4, true);

  // Ground: mown stripes, pitch, creases, stumps.
  box(scene, 'outfield', 200, 0.1, 200, 0, -0.05, 0, grass);
  for (let i = -8; i <= 8; i += 2) box(scene, 'stripe', 6, 0.01, 200, i * 6, 0.003, 0, grass2);
  box(scene, 'pitch', 3.05, 0.02, PITCH_LEN + 2.44, 0, 0.011, 0, clay);
  for (const end of [-PITCH_LEN / 2, PITCH_LEN / 2]) {
    const dir = end < 0 ? 1 : -1;
    for (const dx of [-0.1143, 0, 0.1143]) box(scene, 'stump', 0.04, 0.711, 0.04, dx, 0.37, end, wood);
    box(scene, 'popping', 3.05, 0.004, 0.05, 0, 0.023, end + dir * 1.22, line);
    box(scene, 'bowling', 2.64, 0.004, 0.05, 0, 0.023, end, line);
    for (const rx of [-1.32, 1.32]) box(scene, 'return', 0.05, 0.004, 2.4, rx, 0.023, end + dir * 1.2, line);
  }

  // Batter: rigid blocks stretched between solved joints.
  const parts: Part[] = [];
  const mk = (name: string, m: StandardMaterial, place: Part['place']): Part => {
    const mesh = CreateBox(name, { size: 1 }, scene);
    mesh.material = m;
    mesh.rotationQuaternion = new Quaternion();
    const part = { mesh, place };
    parts.push(part);
    return part;
  };
  const face = (f: Vec): Vec => f;
  const seg = (n: string, m: StandardMaterial, a: JointName, b: JointName, w: number, d: number) => {
    let mesh!: Mesh;
    const part = mk(n, m, (p, f, k) => span(mesh, p[a], p[b], w * k, d * k, face(f)));
    mesh = part.mesh;
  };
  for (const s of ['L', 'R'] as const) {
    seg(`thigh${s}`, white, `hip${s}`, `knee${s}`, 0.17, 0.17);
    seg(`shin${s}`, white, `knee${s}`, `ankle${s}`, 0.14, 0.14);
    seg(`upperArm${s}`, shirt, `shoulder${s}`, `elbow${s}`, 0.1, 0.1);
    seg(`foreArm${s}`, skin, `elbow${s}`, `wrist${s}`, 0.085, 0.085);
    // glove around the wrist, boot from ankle to toe
    let glove!: Mesh;
    glove = mk(`glove${s}`, white, (p, f, k) => span(glove, p[`wrist${s}`], [p[`wrist${s}`][0], p[`wrist${s}`][1] - 0.01, p[`wrist${s}`][2]], 0.12 * k, 0.12 * k, face(f))).mesh;
    let boot!: Mesh;
    boot = mk(`boot${s}`, dark, (p, f, k) => {
      const a = p[`ankle${s}`];
      const t = p[`toe${s}`];
      span(boot, [a[0] - f[0] * 0.05 * k, a[1] - 0.03, a[2] - f[2] * 0.05 * k], [t[0], t[1] + 0.03, t[2]], 0.1 * k, 0.1 * k, [0, 1, 0]);
    }).mesh;
  }
  let pelvisBlock!: Mesh;
  pelvisBlock = mk('pelvis', white, (p, f, k) => span(pelvisBlock, p.hipL, p.hipR, 0.22 * k, 0.26 * k, face(f))).mesh;
  let torso!: Mesh;
  torso = mk('torso', shirt, (p, f, k) => span(torso, p.pelvis, [p.neck[0], p.neck[1] - 0.02, p.neck[2]], 0.38 * k, 0.24 * k, face(f))).mesh;
  let neckMesh!: Mesh;
  neckMesh = mk('neck', skin, (p, f, k) => span(neckMesh, p.neck, [p.neck[0], p.neck[1] + 0.1 * k, p.neck[2] + 0.02], 0.09 * k, 0.09 * k, face(f))).mesh;
  let headMesh!: Mesh;
  headMesh = mk('head', skin, (p, f, k) => span(headMesh, [p.head[0], p.head[1] - 0.1 * k, p.head[2]], [p.head[0], p.head[1] + 0.1 * k, p.head[2]], 0.19 * k, 0.21 * k, face(f))).mesh;
  let helmet!: Mesh;
  helmet = mk('helmet', navy, (p, f, k) => span(helmet, [p.head[0], p.head[1] + 0.0, p.head[2]], [p.head[0], p.head[1] + 0.15 * k, p.head[2]], 0.25 * k, 0.27 * k, face(f))).mesh;
  let grill!: Mesh;
  grill = mk('grill', dark, (p, f, k) => span(grill, [p.head[0], p.head[1] - 0.1 * k, p.head[2] + 0.13 * k], [p.head[0], p.head[1] + 0.02 * k, p.head[2] + 0.13 * k], 0.17 * k, 0.03 * k, [0, 0, 1])).mesh;
  let handle!: Mesh;
  handle = mk('handle', dark, (p) => {
    const ax = norm3(p.batToe, p.batTop);
    span(handle, p.batTop, [p.batTop[0] + ax[0] * 0.3, p.batTop[1] + ax[1] * 0.3, p.batTop[2] + ax[2] * 0.3], 0.04, 0.04, p.batFace);
  }).mesh;
  let bladeMesh!: Mesh;
  bladeMesh = mk('blade', blade, (p) => {
    const ax = norm3(p.batToe, p.batTop);
    span(bladeMesh, [p.batTop[0] + ax[0] * 0.3, p.batTop[1] + ax[1] * 0.3, p.batTop[2] + ax[2] * 0.3], p.batToe, 0.108, 0.07, p.batFace);
  }).mesh;

  // Skeleton overlay: a marker per joint and a thin bone to its parent, drawn on top of everything.
  const joints = new Map<JointName, Mesh>();
  const bones: { mesh: Mesh; a: JointName; b: JointName }[] = [];
  for (const j of JOINTS) {
    const s = CreateSphere(`joint:${j.name}`, { diameter: 0.07, segments: 6 }, scene);
    s.material = jointMat;
    s.renderingGroupId = 1;
    joints.set(j.name, s);
    if (j.parent) {
      const m = CreateBox(`bone:${j.name}`, { size: 1 }, scene);
      m.material = boneMat;
      m.renderingGroupId = 1;
      m.rotationQuaternion = new Quaternion();
      bones.push({ mesh: m, a: j.parent, b: j.name });
    }
  }

  // Bowling machine, ball, its shadow, bounce marker and a short trail. Visual scale only; the sim keeps the real radius.
  const ballMat = mat(scene, 'ball', 0.85, 0.08, 0.08);
  const shadowMat = mat(scene, 'shadow', 0, 0, 0);
  shadowMat.unfreeze();
  shadowMat.alpha = 0.35;
  shadowMat.freeze();
  const trailMat = mat(scene, 'trail', 1, 0.9, 0.85, true);
  const markMat = mat(scene, 'mark', 1, 0.35, 0.1, true);
  const machineBody = box(scene, 'machine', 0.5, 0.9, 0.5, 0, 0.45, RELEASE_Z + 0.6, dark);
  const machineLight = CreateSphere('machineLight', { diameter: 0.22, segments: 8 }, scene);
  machineLight.position.set(1.6, RELEASE_Y - 0.3, RELEASE_Z + 0.2); // beside the pitch so it never blocks the low broadcast camera
  const lightOff = mat(scene, 'lightOff', 0.3, 0.3, 0.3, true);
  const lightCue = mat(scene, 'lightCue', 1, 0.75, 0.1, true);
  machineLight.material = lightOff;
  void machineBody;
  const ballSize = cfg.ball.radius * 2 * cfg.ball.visualScale;
  const ballMesh = CreateSphere('ball', { diameter: ballSize, segments: 10 }, scene);
  ballMesh.material = ballMat;
  ballMesh.setEnabled(false);
  const shadow = CreateSphere('ballShadow', { diameter: ballSize * 1.1, segments: 8 }, scene);
  shadow.material = shadowMat;
  shadow.scaling.y = 0.05;
  shadow.setEnabled(false);
  const mark = CreateSphere('bounceMark', { diameter: 0.28, segments: 8 }, scene);
  mark.material = markMat;
  mark.scaling.y = 0.05;
  mark.setEnabled(false);
  const TRAIL = 48;
  const trailMeshes: Mesh[] = [];
  for (let i = 0; i < TRAIL; i++) {
    const t = CreateSphere(`trail${i}`, { diameter: ballSize * 0.45, segments: 4 }, scene);
    t.material = trailMat;
    t.setEnabled(false);
    trailMeshes.push(t);
  }
  const trail: Vec[] = [];
  let trailTick = -1;
  let lastCount = -1;

  let state: ViewState = { camera: 0, skeleton: true, rightHanded: true, guide: false, size: 1 };
  const guideMat = mat(scene, 'guide', 1, 0.9, 0.2, true);
  const guide = CreateBox('guide', { size: 1 }, scene);
  guide.material = guideMat;
  guide.rotationQuaternion = new Quaternion();
  guide.isPickable = false;
  let lastPose: Pose = solvePose({ stance: createStance(DEFAULT_CONFIG.stance, true).pose, alpha: 0, yaw: 0, rightHanded: true, baseZ: BAT_Z }, body);
  const setSkeletonVisible = (on: boolean) => {
    for (const m of joints.values()) m.setEnabled(on);
    for (const b of bones) b.mesh.setEnabled(on);
  };
  setSkeletonVisible(state.skeleton);
  const D = bodyDims(body);

  const place = (s: SimState, alpha: number) => {
    const sw = s.swing;
    const batAlpha = sw.prevAlpha + (sw.alpha - sw.prevAlpha) * alpha;
    const yaw = sw.prevYaw + (sw.yaw - sw.prevYaw) * alpha;
    const rh = state.rightHanded;
    const sp = lerpPose(s.stance.prev, s.stance.pose, alpha);
    const f = facingVec(rh, body.open + sp.open);
    const pose = solvePose({ stance: sp, alpha: batAlpha, yaw, eps: sw.eps || undefined, roll: sw.roll, rightHanded: rh, baseZ: BAT_Z }, body);
    lastPose = pose;
    for (const p of parts) p.place(pose, f, D.scale);
    if (state.skeleton) {
      for (const n of JOINT_NAMES) joints.get(n)!.position.copyFrom(toWorld(pose[n]));
      for (const b of bones) span(b.mesh, pose[b.a], pose[b.b], 0.018, 0.018, [0, 0, 1]);
    }
    // aim guide: the line the bat swings along, from the batter's feet
    guide.setEnabled(state.guide);
    if (state.guide) {
      const off = rh ? -1 : 1;
      const a: Vec = [pose.pelvis[0], 0.045, pose.pelvis[2]];
      const b: Vec = [a[0] + off * Math.sin(yaw) * 7, 0.045, a[2] + Math.cos(yaw) * 7];
      span(guide, a, b, 0.07, 0.004, [0, 1, 0]);
    }
    // ball
    const bl = s.ball;
    const bpos: Vec = [bl.px + (bl.x - bl.px) * alpha, bl.py + (bl.y - bl.py) * alpha, bl.pz + (bl.z - bl.pz) * alpha];
    if (s.machine.count !== lastCount) {
      lastCount = s.machine.count;
      trail.length = 0;
    }
    if (bl.active && s.tick % 3 === 0 && trailTick !== s.tick) {
      trailTick = s.tick;
      trail.push(bpos);
      if (trail.length > TRAIL) trail.shift();
    }
    ballMesh.setEnabled(!!bl.active);
    shadow.setEnabled(!!bl.active);
    if (bl.active) {
      ballMesh.position.copyFrom(toWorld(bpos));
      shadow.position.copyFrom(toWorld([bpos[0], 0.03, bpos[2]]));
    }
    mark.setEnabled(bl.bounces > 0);
    if (bl.bounces > 0) mark.position.copyFrom(toWorld([bl.bx, 0.03, bl.bz]));
    for (let i = 0; i < TRAIL; i++) {
      const p = trail[i];
      trailMeshes[i]!.setEnabled(!!p);
      if (p) {
        trailMeshes[i]!.position.copyFrom(toWorld(p));
        const k = 0.35 + 0.65 * ((i + TRAIL - trail.length) / TRAIL);
        trailMeshes[i]!.scaling.setAll(k);
      }
    }
    machineLight.material = s.machine.phase === PHASE_CUE ? lightCue : lightOff;
    // camera (mirrored for left-handers)
    const spec = CAMERAS[state.camera]!;
    const mx = rh ? 1 : -1;
    if (spec.follow === 'ball' && bl.active) {
      cam.position.copyFrom(toWorld([bpos[0] * 0.5, 1.8, Math.min(bpos[2] + 4.5, 12)]));
      cam.setTarget(toWorld(bpos));
      cam.fov = spec.fov;
      return;
    }
    const base = spec.follow === 'ball' ? CAMERAS[0]! : spec;
    const pos: Vec = spec.follow === 'head' ? [pose.head[0] + spec.pos[0], pose.head[1] + spec.pos[1], pose.head[2] + 0.25] : [base.pos[0] * mx, base.pos[1], base.pos[2]];
    const tgt: Vec = [base.target[0] * mx, base.target[1], base.target[2]];
    cam.position.copyFrom(toWorld(pos));
    cam.setTarget(toWorld(tgt));
    cam.fov = base.fill ? fovForFill(pos, tgt, base.fill * state.size) : base.fov;
  };

  return {
    scene,
    update: place,
    setView(v) {
      state = { ...state, ...v };
      state.camera = ((state.camera % CAMERAS.length) + CAMERAS.length) % CAMERAS.length;
      state.size = Math.max(0.6, Math.min(1.4, state.size));
      setSkeletonVisible(state.skeleton);
      return state;
    },
    view: () => state,
    pose: () => lastPose,
    cameraLabel: () => CAMERAS[state.camera]!.label,
  };
}

function norm3(to: Vec, from: Vec): Vec {
  const d: Vec = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}
