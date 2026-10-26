import type { PoseData } from '../voxel/rig';
import { lerpPose, STANCES } from '../voxel/poses';

// Swing clips. Each stance has a contact pose (the bat meeting the ball) and a follow-through pose, both authored as
// data. A swing plays: stance pose -> contact (taking `toContact` seconds) -> follow-through -> hold -> back to stance.
type BatKey = PoseData['bat'];
// spine is the change from the stance: [pitch, yaw] in degrees
export interface Key { bat: BatKey; spine?: [number, number]; head?: [number, number, number]; yaw?: number; elbowOut?: number }

const bat = (pos: [number, number, number], az: number, el: number, roll = 0): BatKey => ({ pos, az, el, roll });

export const CLIPS: Array<{ contact: Key; follow: Key }> = [
  // Ready: a straight, controlled drive
  { contact: { bat: bat([-0.1, 0.19, 0.35], 10, -74), spine: [10, -7], elbowOut: 0.29 }, follow: { bat: bat([-0.02, 0.25, 0.35], -16, 40), spine: [-5, -19], elbowOut: 0.52 } },
  // Back foot: bat comes down across the line
  { contact: { bat: bat([0.11, 0.23, 0.33], 49, -65), spine: [5, 4], elbowOut: 0.37 }, follow: { bat: bat([0.1, 0.2, 0.4], 100, 25), spine: [-4, 10], elbowOut: 0.5 } },
  // Front foot: long straight drive
  { contact: { bat: bat([0.07, 0.14, 0.37], 8, -80), spine: [8, -8], elbowOut: 0.21 }, follow: { bat: bat([0.05, 0.15, 0.45], -20, 50), spine: [-6, -20], elbowOut: 0.5 } },
  // Sweep: low horizontal arc, bat travelling leg-side
  { contact: { bat: bat([0.2, 0.03, 0.52], 26, -15), spine: [9, -5], elbowOut: 0.42 }, follow: { bat: bat([0.13, 0.15, 0.59], -68, 25), spine: [3, -15], elbowOut: 0.73 } },
  // Reverse sweep: the same arc the other way
  { contact: { bat: bat([0.14, 0.08, 0.48], 40, -15), spine: [10, 11], elbowOut: 0.61 }, follow: { bat: bat([0.11, 0.04, 0.45], 129, 24), spine: [3, 25], elbowOut: 0.47 } },
  // Step up and hit: a big hit, bat through high
  { contact: { bat: bat([0.03, 0.18, 0.38], 8, -65), spine: [9, -8], elbowOut: 0.26 }, follow: { bat: bat([0.01, 0.22, 0.43], -25, 65), spine: [-8, -22], elbowOut: 0.5 } },
];

export const withKey = (base: PoseData, k: Key, dir: number): PoseData => ({
  ...base,
  bat: k.bat,
  spine: k.spine ? [base.spine[0] + k.spine[0], base.spine[1] + k.spine[1] + dir, base.spine[2]] : base.spine,
  head: k.head ?? base.head,
  elbowOut: k.elbowOut ?? base.elbowOut,
});

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const FOLLOW_SEC = 0.28;
export const HOLD_SEC = 0.22;
export const RECOVER_SEC = 0.45;
export const SWING_TOTAL = FOLLOW_SEC + HOLD_SEC + RECOVER_SEC;

// The pose `elapsed` seconds after the swing began. `toContact` is how long the bat takes to reach the ball, and
// `dir` (degrees, positive = toward the leg side) turns the trunk a little toward the shot.
// The pose a fraction u (0 to 1) of the way from the backlift to contact.
export function approach(stance: number, contact: PoseData, u: number): PoseData {
  const ready = STANCES[0]!.pose;
  const shot = STANCES[stance]!.pose;
  const body = lerpPose(ready, { ...shot, bat: ready.bat, elbowOut: ready.elbowOut }, ease(clamp01(u / 0.7)));
  return lerpPose(body, contact, u * u * 0.85 + u * 0.15);
}

export function swingPose(stance: number, elapsed: number, toContact: number, dir = 0): PoseData {
  const ready = STANCES[0]!.pose; // every shot begins from the same backlift
  const shot = STANCES[stance]!.pose;
  if (elapsed <= 0) return ready;
  const clip = CLIPS[stance]!;
  const twist = Math.max(-90, Math.min(90, dir));
  const contact = withKey(shot, clip.contact, twist * 0.04);
  const follow = withKey(shot, clip.follow, twist * 0.05);
  if (elapsed < toContact) {
    // the feet and body move into the shot during the swing (done 70% of the way to contact), the bat accelerates into the ball
    return approach(stance, contact, clamp01(elapsed / toContact));
  }
  const f = elapsed - toContact;
  if (f < FOLLOW_SEC) return lerpPose(contact, follow, ease(f / FOLLOW_SEC));
  if (f < FOLLOW_SEC + HOLD_SEC) return follow;
  return lerpPose(follow, ready, ease(clamp01((f - FOLLOW_SEC - HOLD_SEC) / RECOVER_SEC)));
}
