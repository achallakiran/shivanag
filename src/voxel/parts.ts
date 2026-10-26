import { C } from './palette';
import { makePart, type VoxelPart } from './mesh';

// The batsman's parts. One voxel is 5 cm. The pivot is the joint: at the top of limbs, bat and boot (they hang down from it)
// and at the bottom of the pelvis, torso and head (they grow up from it).
// +x is the batter's right, +y up, +z forward (the way the chest faces).

export const PELVIS = makePart('pelvis', [9, 3, 5], [4.5, 0, 2.5], (x, y) => (y === 2 && (x === 0 || x === 8) ? C.strap : C.white));

export const TORSO = makePart('torso', [9, 9, 5], [4.5, 0, 2.5], (x, y, z) => {
  if (y === 0) return C.dark; // belt
  if (y >= 8 && (x === 4) && z >= 3) return C.skin; // collar opening
  return x === 0 || x === 8 ? C.shade : C.shirt;
});

// Head: face at +z. Helmet over the top, a dark visor bar for the eyes and a grill bar over the chin.
export const HEAD = makePart('head', [5, 5, 5], [2.5, 0, 2.5], (x, y, z) => {
  if (y >= 4) return C.navy; // helmet top
  if (z === 4 && y === 3) return C.navy; // peak
  if (z === 4 && y === 2) return x === 1 || x === 3 ? C.dark : C.skin; // eyes
  if (z === 4 && y === 0) return C.dark; // chin bar
  if (z <= 1 && y >= 1) return C.navy; // back of the helmet
  if ((x === 0 || x === 4) && y >= 1) return C.navy; // sides
  return C.skin;
});

export const UPPER_ARM = makePart('upperArm', [2, 6, 2], [1, 6, 1], (_x, y) => (y >= 2 ? C.shirt : C.skin));
export const FORE_ARM = makePart('foreArm', [2, 6, 2], [1, 6, 1], () => C.skin);
export const GLOVE = makePart('glove', [3, 3, 3], [1.5, 3, 1.5], (_x, y) => (y === 2 ? C.strap : C.glove));

export const THIGH = makePart('thigh', [4, 8, 4], [2, 8, 2], () => C.white);
// shin: leg pad on the front (+z) side
export const SHIN = makePart('shin', [4, 8, 4], [2, 8, 2], (x, y, z) => (z === 3 ? (y % 3 === 0 ? C.strap : C.glove) : C.white));
// boot: pivot at the ankle; the toe extends forward (+z)
export const BOOT = makePart('boot', [4, 2, 6], [2, 2, 2], (_x, y, z) => (y === 0 && z > 0 ? C.dark : y === 1 && z < 3 ? C.white : C.dark));

// Bat: top of the handle at the pivot, the toe 19 voxels below (0.95 m).
export const BAT = makePart('bat', [3, 19, 2], [1.5, 19, 1], (x, y, z) => {
  const d = 18 - y; // distance down from the top of the handle
  if (d < 6) return x === 1 && z === 0 ? C.dark : 0; // handle: 1x1
  if (d < 8) return x === 1 ? C.edge : 0; // shoulder taper
  return x === 1 || z === 0 ? C.wood : C.edge; // blade, face toward +z
});

export const ALL_PARTS: VoxelPart[] = [PELVIS, TORSO, HEAD, UPPER_ARM, FORE_ARM, GLOVE, THIGH, SHIN, BOOT, BAT];

// joint geometry in metres
export const DIM = {
  hipY: 0.9, // standing hip height
  hipHalf: 0.11,
  thigh: 0.4,
  shin: 0.4,
  ankle: 0.1,
  spineAt: 0.15, // spine joint above the pelvis joint
  shoulderUp: 0.4, // shoulder height above the spine joint
  shoulderHalf: 0.25,
  headAt: 0.45,
  upperArm: 0.3,
  foreArm: 0.3,
} as const;
