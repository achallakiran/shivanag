import type { GameConfig } from '../config/defaults';
import { BACK, FRONT, READY, SIT, STEP } from './stance';
import type { Vec } from './skeleton';

// The bat is a rod swung about the shoulders in a "swing plane". The plane is the vertical plane
// through the shot direction (yaw). `alpha` is the rod's angle in that plane:
//   0 = backlift (up and back), 90 = back/horizontal, 180 = pointing down and forward (contact),
//   270 = forward/horizontal, 360 = back at the top.
// The thumb's circle on the right stick drives alpha directly.

export const BAT_TOTAL = 0.96; // top of handle to toe
export const BAT_HANDLE = 0.3; // handle length; the blade runs from here to the toe
export const HAND_TO_TOP = 0.165; // top of handle is this far behind the hands

export interface BatFrame {
  hands: Vec; // bottom hand / grip point
  top: Vec; // top of the handle
  d: Vec; // unit vector, handle toward toe
  t: Vec; // unit vector, the direction the blade moves as alpha increases (its leading face normal)
  w: Vec; // unit vector across the blade (its width)
}

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec): Vec => {
  const l = Math.sqrt(dot(a, a)) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// Shot direction of the swing plane, in radians toward the off side, from the stance and the line stick.
export function planeYaw(gate: number, line: number, c: GameConfig['swing']): number {
  switch (gate) {
    case BACK:
      return c.yawBack + c.gainBack * line;
    case SIT:
      return c.yawSit + c.gainSit * line;
    case FRONT:
      return c.yawFront + c.gainFront * line;
    case STEP:
      return c.yawStep + c.gainStep * line;
    case READY:
    default:
      return c.yawReady + c.gainReady * line;
  }
}

// Bat pose for a given shoulder centre. `rest` is the hands' resting offset from the shoulders (backlift
// hands); `armLen` is how far the hands reach along the rod when the arms are extended.
export function batFrame(shoulder: Vec, rest: Vec, alpha: number, yaw: number, rightHanded: boolean, armLen: number): BatFrame {
  const f = rightHanded ? -1 : 1; // X sign of "toward the off side"
  const fh: Vec = [f * Math.sin(yaw), 0, Math.cos(yaw)]; // horizontal, the direction of the shot
  const a = unit(add([0, 0.93, 0], mul(fh, -0.36))); // backlift direction: up and back
  const b = unit(add(fh, mul(a, -dot(a, fh)))); // forward, perpendicular to a within the plane
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const d = unit(add(mul(a, ca), mul(b, -sa)));
  const t = unit(add(mul(a, -sa), mul(b, -ca)));
  const w = unit(cross(d, t));
  // Arms fold in the backlift and reach out along the rod as the swing comes through.
  const e = 0.5 * (1 - ca);
  const reach = add(mul(rest, 1 - e), mul(d, armLen * e));
  let hands = add(shoulder, reach);
  let top = add(hands, mul(d, -HAND_TO_TOP));
  // The toe never goes below the ground: the hands ride up instead.
  const toeY = top[1] + d[1] * BAT_TOTAL;
  if (toeY < 0.02) {
    const lift = 0.02 - toeY;
    hands = add(hands, [0, lift, 0]);
    top = add(top, [0, lift, 0]);
  }
  return { hands, top, d, t, w };
}

export const batToe = (fr: BatFrame): Vec => add(fr.top, mul(fr.d, BAT_TOTAL));
export const batPoint = (fr: BatFrame, s: number): Vec => add(fr.top, mul(fr.d, s));
