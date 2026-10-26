import type { PoseData } from './rig';

// Authored poses for a right-hander. The root is the hip point; positions are metres from the guard, angles degrees.
// See rig.ts for the conventions. A pose is a snapshot; the game blends between poses and plays clips made of poses.
const merge = (base: PoseData, o: Partial<PoseData>): PoseData => ({ ...base, ...o });

export const READY_GROUNDED: PoseData = {
  root: { x: 0, z: 0, yaw: 25 },
  pelvis: [10, 0, 0],
  spine: [30, 22, 0],
  head: [-36, -47, 0],
  hipL: [50, -20, -9],
  hipR: [44, -20, 9],
  kneeL: 70,
  kneeR: 68,
  ankleL: 0,
  ankleR: 0,
  bat: { pos: [0.06, 0.08, 0.3], az: 125, el: -60, roll: 0 },
  elbowOut: 0.3,
};

// Bat lifted: up and back toward the slips, hands low by the hip.
export const READY_LIFTED: PoseData = merge(READY_GROUNDED, {
  bat: { pos: [0.0, 0.0, 0.3], az: 150, el: 55, roll: 0 },
  elbowOut: 0.5,
});

// Back foot: the rear foot goes back and across, weight back, more side-on and upright, bat high.
export const BACK: PoseData = merge(READY_LIFTED, {
  root: { x: 0, z: -0.15, yaw: 50 },
  pelvis: [4, 0, 0],
  spine: [14, 14, 0],
  head: [-16, -64, 0],
  hipL: [34, -30, -7],
  hipR: [-8, -30, 6],
  kneeL: 44,
  kneeR: 28,
  bat: { pos: [0.0, 0.08, 0.28], az: 165, el: 68, roll: 0 },
});

// Front foot: a long stride toward the pitch of the ball, head over the front knee, bat coming down straight.
export const FRONT: PoseData = merge(READY_LIFTED, {
  root: { x: 0, z: 0.35, yaw: 30 },
  pelvis: [12, 0, 0],
  spine: [32, 20, 0],
  head: [-40, -50, 0],
  hipL: [60, -20, -6],
  hipR: [-20, -20, 7],
  kneeL: 60,
  kneeR: 34,
  ankleR: -25,
  bat: { pos: [0.02, 0.06, 0.34], az: 25, el: -35, roll: 0 },
});

// Sweep: the front foot well forward, the back knee down; low and square-on, bat back and low.
export const SWEEP: PoseData = merge(READY_LIFTED, {
  root: { x: 0, z: 0.5, yaw: 40 },
  pelvis: [14, 0, 0],
  spine: [34, 16, 0],
  head: [-44, -56, 0],
  hipL: [104, -15, -5],
  hipR: [8, -15, 6],
  kneeL: 90,
  kneeR: 100,
  ankleR: -20,
  kneeDown: 'R',
  bat: { pos: [0.02, 0.0, 0.32], az: 150, el: 5, roll: 0 },
});

// Reverse sweep: as the sweep but turned more toward the bowler, bat held out in front.
export const REVERSE: PoseData = merge(SWEEP, {
  root: { x: 0, z: 0.5, yaw: 10 },
  spine: [34, 22, 0],
  head: [-44, -32, 0],
  bat: { pos: [0.0, 0.0, 0.3], az: 25, el: -10, roll: 0 },
});

// Step up and hit: down the pitch, long stride, back heel up, bat high.
export const STEP: PoseData = merge(READY_LIFTED, {
  root: { x: 0, z: 0.65, yaw: 25 },
  pelvis: [8, 0, 0],
  spine: [26, 20, 0],
  head: [-30, -45, 0],
  hipL: [58, -20, -6],
  hipR: [-28, -20, 7],
  kneeL: 42,
  kneeR: 30,
  ankleR: -35,
  bat: { pos: [0.0, 0.05, 0.3], az: 160, el: 62, roll: 0 },
});

export const POSES = { READY_GROUNDED, READY_LIFTED, BACK, FRONT, SWEEP, REVERSE, STEP };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
// Blend between two poses (t from 0 to 1). The ground-contact choice switches halfway.
export function lerpPose(a: PoseData, b: PoseData, t: number): PoseData {
  return {
    root: { x: mix(a.root.x, b.root.x, t), z: mix(a.root.z, b.root.z, t), yaw: mix(a.root.yaw, b.root.yaw, t) },
    pelvis: mix3(a.pelvis, b.pelvis, t), spine: mix3(a.spine, b.spine, t), head: mix3(a.head, b.head, t),
    hipL: mix3(a.hipL, b.hipL, t), hipR: mix3(a.hipR, b.hipR, t),
    kneeL: mix(a.kneeL, b.kneeL, t), kneeR: mix(a.kneeR, b.kneeR, t), ankleL: mix(a.ankleL, b.ankleL, t), ankleR: mix(a.ankleR, b.ankleR, t),
    bat: { pos: mix3(a.bat.pos, b.bat.pos, t), az: mix(a.bat.az, b.bat.az, t), el: mix(a.bat.el, b.bat.el, t), roll: mix(a.bat.roll, b.bat.roll, t) },
    elbowOut: mix(a.elbowOut, b.elbowOut, t),
    ...((t < 0.5 ? a.kneeDown : b.kneeDown) ? { kneeDown: (t < 0.5 ? a.kneeDown : b.kneeDown)! } : {}),
  };
}

// The five stances plus Ready, in button order. Ready holds the bat grounded until a ball is on its way.
export const STANCES = [
  { name: 'Ready', pose: READY_LIFTED },
  { name: 'Back foot', pose: BACK },
  { name: 'Front foot', pose: FRONT },
  { name: 'Sweep', pose: SWEEP },
  { name: 'Reverse sweep', pose: REVERSE },
  { name: 'Step up and hit', pose: STEP },
] as const;
