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
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec): Vec => {
  const l = Math.sqrt(dot(a, a)) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// Bat pose for a given shoulder centre. `rest` is the hands' resting offset from the shoulders (backlift
// hands); `armLen` is how far the hands reach along the rod when the arms are extended.
// The bat's backlift is given as a tilt `theta` from vertical (0 = straight up, pi = straight down, so the bat
// grounded at the toes is about 2.6) and an azimuth `sigma` for the direction of that tilt: 0 = straight back
// toward the keeper, pi/2 = toward the off side (gully, second slip). The sideways part of the lean fades out by
// contact, so the bat comes down straight whatever the backlift (the loop the pros show in their swing traces).
// `eps` is the face tilt at contact (radians above vertical); `roll` turns the face about the rod (wrist roll),
// letting the swing go one way and the face look another.
export function batFrame(shoulder: Vec, rest: Vec, alpha: number, yaw: number, rightHanded: boolean, armLen: number, theta = 0.5, sigma = 0, eps?: number, roll = 0): BatFrame {
  const f = rightHanded ? -1 : 1; // X sign of "toward the off side"
  const fh: Vec = [f * Math.sin(yaw), 0, Math.cos(yaw)]; // horizontal, the direction of the shot
  const off = mul(cross([0, 1, 0], fh), f); // horizontal, toward the off side, across the shot direction
  const rawA = add([0, Math.cos(theta), 0], mul(fh, -Math.sin(theta) * Math.cos(sigma)));
  const ns = Math.sqrt(dot(rawA, rawA));
  const offc = Math.sin(theta) * Math.sin(sigma);
  const a = ns > 1e-3 ? mul(rawA, 1 / ns) : ([0, 1, 0] as Vec); // backlift direction without the sideways lean
  const b = unit(add(fh, mul(a, -dot(a, fh)))); // forward, perpendicular to a within the plane
  const gamma = Math.atan2(b[1], a[1]); // how far up the face looks at contact with no adjustment
  const ca = Math.cos(alpha);
  // The face tilt at contact is set by shifting the bat's angle a little around the bottom of the swing.
  const half = Math.sin(alpha / 2);
  const ae = alpha + ((eps ?? gamma) - gamma) * half * half;
  const cb = Math.cos(ae);
  const sb = Math.sin(ae);
  const ds = unit(add(mul(a, cb), mul(b, -sb)));
  const lean = mul(off, offc * (1 + ca) / 2);
  const d = unit(add(mul(ds, ns), lean));
  let t = add(mul(a, -sb), mul(b, -cb));
  t = unit(sub(t, mul(d, dot(d, t))));
  let w = unit(cross(d, t));
  if (roll !== 0) {
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const t2 = add(mul(t, cr), mul(w, sr));
    w = add(mul(t, -sr), mul(w, cr));
    t = t2;
  }
// At contact the hands are out in front, in the shot direction, a little below the shoulders.
  const e = 0.5 * (1 - ca);
  // The hands also lean a little toward the off side, in front of the front pad, whatever the shot direction.
  const out = add(add(mul(fh, armLen * 0.8), [0, -armLen * 0.55, 0]), [f * armLen * 0.35, 0, 0]);
  const reach = add(mul(rest, 1 - e), mul(out, e));
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
