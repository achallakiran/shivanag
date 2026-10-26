import type { GameConfig } from '../config/defaults';
import { BAT_HANDLE, BAT_TOTAL, type BatFrame } from './bat';
import { BAT_Z } from './field';
import type { BallState } from './ball';
import type { Vec } from './skeleton';

// Bat and ball contact. At the sim's 4 sub-steps per tick the ball moves at most ~4 cm between tests and the
// contact slab is 2*(halfThick + radius) = 14 cm deep, so a fast ball cannot skip over the bat (a test checks this).
//
// Response: the bat is treated as much heavier than the ball, with a coefficient of restitution q that
// already includes the bat's own inertia (about 0.3 at the sweet spot, about 0.1 near the toe):
//   relative normal speed after = -q * relative normal speed before.
// Friction on the bat face acts on the ball's surface point, so sliding adds spin.

export type BatCfg = GameConfig['bat'];

export interface ShotState {
  count: number; // delivery this record belongs to
  state: number; // 0 waiting, 1 hit, 2 missed, 3 hit and finished
  speed: number; // ball exit speed, m/s
  launch: number; // degrees above horizontal
  dir: number; // degrees from straight down the ground, positive toward the off side
  s: number; // contact point along the bat, metres from the top of the handle
  lat: number; // contact point across the blade, metres from its centre line
  batSpeed: number; // bat speed at the contact point, m/s
  alphaHit: number; // bat angle at contact, degrees (180 is the bottom of the swing)
  q: number; // restitution used
  crossAlpha: number; // bat angle (degrees) when the ball passed the crease
  crossRec: number;
  carry: number; // metres from the crease to the first bounce after the hit
  end: number; // metres from the crease to where the ball ended
}

export function createShot(): ShotState {
  return { count: 0, state: 0, speed: 0, launch: 0, dir: 0, s: 0, lat: 0, batSpeed: 0, alphaHit: 0, q: 0, crossAlpha: 0, crossRec: 0, carry: 0, end: 0 };
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
const lerp = (a: Vec, b: Vec, k: number): Vec => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const RAD = 180 / Math.PI;

export interface ContactCtx {
  f0: BatFrame; // bat at the start of the tick
  f1: BatFrame; // bat at the end of the tick
  dt: number;
  bat: BatCfg;
  radius: number;
  rightHanded: boolean;
  alpha: number; // current bat angle, for the record
  shot: ShotState;
}

// Returns the per-sub-step hook for stepBall.
export function contactHook(ctx: ContactCtx): (b: BallState, frac: number) => void {
  const { bat, radius: r } = ctx;
  return (b, frac) => {
    if (b.hit || !b.active) return;
    const top = lerp(ctx.f0.top, ctx.f1.top, frac);
    const d = unit(lerp(ctx.f0.d, ctx.f1.d, frac));
    const t = unit(lerp(ctx.f0.t, ctx.f1.t, frac));
    const w = unit(lerp(ctx.f0.w, ctx.f1.w, frac));
    const rel = sub([b.x, b.y, b.z], top);
    const s = dot(rel, d);
    const n = dot(rel, t);
    const l = dot(rel, w);
    if (s < BAT_HANDLE - r * 0.5 || s > BAT_TOTAL + r * 0.7) return;
    if (Math.abs(n) >= bat.halfThick + r || Math.abs(l) >= bat.halfWidth + r * 0.7) return;

    // velocity of the bat at the ball's position along the bat, from its motion over the whole tick
    const p0 = add(ctx.f0.top, mul(ctx.f0.d, s));
    const p1 = add(ctx.f1.top, mul(ctx.f1.d, s));
    const vb = mul(sub(p1, p0), 1 / ctx.dt);
    const v: Vec = [b.vx, b.vy, b.vz];
    const sgn = n >= 0 ? 1 : -1;
    const lc = Math.max(-1, Math.min(1, l / bat.halfWidth));
    const gamma = lc * bat.edgeTilt; // rounded edges turn the contact normal outward
    const nEff = unit(add(mul(t, sgn * Math.cos(gamma)), mul(w, Math.sin(gamma))));
    const vn = dot(sub(v, vb), nEff);
    if (vn >= 0) return; // already moving apart

    const sweetOffset = (s - bat.sweetSpot) / bat.sweetWidth;
    let q = bat.acorEdge + (bat.acorSweet - bat.acorEdge) * Math.exp(-sweetOffset * sweetOffset);
    q *= 1 - 0.5 * lc * lc;
    // soft hands: a bat that is nearly still takes the sting out of the ball
    const bs = Math.sqrt(dot(vb, vb));
    q *= bat.deadBat + (1 - bat.deadBat) * Math.min(1, bs / 14);
    const jn = -(1 + q) * vn;

    // friction at the ball's surface point (spin included), solid sphere
    const rc = mul(nEff, -r);
    const vc = sub(add(v, cross([b.wx, b.wy, b.wz], rc)), vb);
    const vct = sub(vc, mul(nEff, dot(vc, nEff)));
    const mag = Math.sqrt(dot(vct, vct));
    let jt: Vec = [0, 0, 0];
    if (mag > 1e-9) jt = mul(vct, -Math.min(mag / 3.5, bat.friction * jn) / mag);

    b.vx += nEff[0] * jn + jt[0];
    b.vy += nEff[1] * jn + jt[1];
    b.vz += nEff[2] * jn + jt[2];
    const dw = mul(cross(rc, jt), 1 / (0.4 * r * r));
    b.wx += dw[0];
    b.wy += dw[1];
    b.wz += dw[2];

    // sit the ball on the bat's surface so it cannot be caught inside it
    const push = sgn * (bat.halfThick + r) - n;
    b.x += t[0] * push;
    b.y += t[1] * push;
    b.z += t[2] * push;

    b.hit = 1;
    b.maxY = b.y;
    b.postBounces = 0;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    const offSign = ctx.rightHanded ? -1 : 1;
    const k = ctx.shot;
    k.state = 1;
    k.speed = sp;
    k.launch = Math.atan2(b.vy, Math.sqrt(b.vx * b.vx + b.vz * b.vz)) * RAD;
    k.dir = Math.atan2(offSign * b.vx, -b.vz) * RAD;
    k.s = s;
    k.lat = l;
    k.batSpeed = Math.sqrt(dot(vb, vb));
    k.alphaHit = alphaDeg(ctx.alpha);
    k.q = q;
  };
}

export const alphaDeg = (alpha: number) => {
  const d = (alpha * RAD) % 360;
  return d < 0 ? d + 360 : d;
};

// Called once per tick after the ball has moved: decides miss/finish and keeps the record for the current delivery.
export function updateShot(k: ShotState, b: BallState, count: number, alpha: number): void {
  if (k.count !== count) {
    Object.assign(k, createShot());
    k.count = count;
  }
  if (b.crossed && !k.crossRec) {
    k.crossRec = 1;
    k.crossAlpha = alphaDeg(alpha);
  }
  if (k.state === 0 && !b.hit && b.crossed && b.z < BAT_Z - 1.5) k.state = 2;
  if (k.state === 1 && !b.active) {
    k.state = 3;
    k.end = Math.sqrt(b.x * b.x + (b.z - BAT_Z) * (b.z - BAT_Z));
    k.carry = b.postBounces > 0 ? Math.sqrt(b.pbx * b.pbx + (b.pbz - BAT_Z) * (b.pbz - BAT_Z)) : k.end;
  }
}
