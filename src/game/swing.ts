import type { PoseData } from '../voxel/rig';
import { lerpPose, STANCES } from '../voxel/poses';

// Swing clips. Each stance has a contact pose (the bat meeting the ball) and a follow-through pose, both authored as
// data. A swing plays: stance pose -> contact (taking `toContact` seconds) -> follow-through -> hold -> back to stance.
type BatKey = PoseData['bat'];
interface Key { bat: BatKey; spine?: [number, number, number]; head?: [number, number, number]; yaw?: number; elbowOut?: number }

const bat = (pos: [number, number, number], az: number, el: number, roll = 0): BatKey => ({ pos, az, el, roll });

const CLIPS: Array<{ contact: Key; follow: Key }> = [
  // Ready: a straight, controlled drive
  { contact: { bat: bat([0.0, 0.05, 0.38], 10, -75), spine: [38, 14, 0], elbowOut: 0.3 }, follow: { bat: bat([0.05, 0.15, 0.4], -15, 40), spine: [24, 5, 0], elbowOut: 0.5 } },
  // Back foot: bat comes down across the line
  { contact: { bat: bat([0.08, 0.1, 0.36], 50, -65), spine: [28, 25, 0], elbowOut: 0.35 }, follow: { bat: bat([0.1, 0.2, 0.4], 100, 25), spine: [20, 35, 0], elbowOut: 0.5 } },
  // Front foot: long straight drive
  { contact: { bat: bat([0.02, 0.05, 0.4], 8, -80), spine: [42, 12, 0], elbowOut: 0.25 }, follow: { bat: bat([0.05, 0.15, 0.45], -20, 50), spine: [30, 4, 0], elbowOut: 0.5 } },
  // Sweep: low horizontal arc, bat travelling leg-side
  { contact: { bat: bat([0.0, 0.05, 0.42], 25, -15), spine: [45, 10, 0], elbowOut: 0.3 }, follow: { bat: bat([-0.05, 0.1, 0.4], -70, 25), spine: [35, -5, 0], elbowOut: 0.5 } },
  // Reverse sweep: the same arc the other way
  { contact: { bat: bat([0.0, 0.05, 0.42], 40, -15, 0), spine: [45, 25, 0], elbowOut: 0.3 }, follow: { bat: bat([0.05, 0.1, 0.4], 130, 25), spine: [35, 35, 0], elbowOut: 0.5 } },
  // Step up and hit: a big hit, bat through high
  { contact: { bat: bat([0.0, 0.1, 0.42], 8, -65), spine: [40, 12, 0], elbowOut: 0.25 }, follow: { bat: bat([0.0, 0.2, 0.45], -25, 65), spine: [24, 0, 0], elbowOut: 0.5 } },
];

const withKey = (base: PoseData, k: Key, dir: number): PoseData => ({
  ...base,
  bat: k.bat,
  spine: k.spine ? [k.spine[0], k.spine[1] + dir, k.spine[2]] : base.spine,
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
export function swingPose(stance: number, elapsed: number, toContact: number, dir = 0): PoseData {
  const base = STANCES[stance]!.pose;
  const clip = CLIPS[stance]!;
  const contact = withKey(base, clip.contact, dir * 0.4);
  const follow = withKey(base, clip.follow, dir * 0.6);
  if (elapsed <= 0) return base;
  if (elapsed < toContact) {
    // the bat accelerates into the ball: slow start, fast finish
    const u = clamp01(elapsed / toContact);
    return lerpPose(base, contact, u * u * 0.85 + u * 0.15);
  }
  const f = elapsed - toContact;
  if (f < FOLLOW_SEC) return lerpPose(contact, follow, ease(f / FOLLOW_SEC));
  if (f < FOLLOW_SEC + HOLD_SEC) return follow;
  return lerpPose(follow, base, ease(clamp01((f - FOLLOW_SEC - HOLD_SEC) / RECOVER_SEC)));
}
