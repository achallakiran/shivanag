import type { GameConfig } from '../config/defaults';
import { BAT_Z, PITCH_HALF_LEN, PITCH_HALF_WIDTH } from './field';

export type BallCfg = GameConfig['ball'];

const G = 9.81;
const SUBSTEPS = 4;

export interface BallState {
  active: number; // 1 while the ball is live
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number; // spin, rad/s
  wy: number;
  wz: number;
  px: number; // previous position, for render interpolation only
  py: number;
  pz: number;
  bounces: number;
  bx: number; // where it first bounced
  bz: number;
  age: number; // seconds since release
  crossed: number; // 1 once it has passed the batting crease
  crossX: number;
  crossY: number;
  crossSpeed: number;
  hit: number; // 1 once the bat has hit it
  maxY: number; // highest point since the hit
  postBounces: number; // bounces since the hit
  pbx: number; // where it first bounced after the hit
  pbz: number;
}

export function createBall(): BallState {
  return { active: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, px: 0, py: 0, pz: 0, bounces: 0, bx: 0, bz: 0, age: 0, crossed: 0, crossX: 0, crossY: 0, crossSpeed: 0, hit: 0, maxY: 0, postBounces: 0, pbx: 0, pbz: 0 };
}

export function launchBall(b: BallState, pos: readonly [number, number, number], vel: readonly [number, number, number], spin: readonly [number, number, number] = [0, 0, 0]): void {
  b.active = 1;
  [b.x, b.y, b.z] = pos;
  [b.px, b.py, b.pz] = pos;
  [b.vx, b.vy, b.vz] = vel;
  [b.wx, b.wy, b.wz] = spin;
  b.bounces = 0;
  b.bx = b.bz = 0;
  b.age = 0;
  b.crossed = 0;
  b.crossX = b.crossY = b.crossSpeed = 0;
  b.hit = 0;
  b.maxY = 0;
  b.postBounces = 0;
  b.pbx = b.pbz = 0;
}

export const ballSpeed = (b: BallState) => Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);

const onPitch = (x: number, z: number) => Math.abs(x) < PITCH_HALF_WIDTH && Math.abs(z) < PITCH_HALF_LEN;

// Ground contact: bounce with restitution, then friction with a slip/grip split for a solid sphere.
function bounce(b: BallState, c: BallCfg): boolean {
  const pitch = onPitch(b.x, b.z);
  const e = pitch ? c.pitchE : c.grassE;
  const mu = pitch ? c.pitchMu : c.grassMu;
  const r = c.radius;
  const vn = -b.vy;
  const jn = (1 + e) * vn; // normal impulse per unit mass
  b.vy = e * vn;
  // velocity of the contact point (spin included)
  const cx = b.vx + b.wz * r;
  const cz = b.vz - b.wx * r;
  const mag = Math.sqrt(cx * cx + cz * cz);
  if (mag > 1e-9) {
    const j = Math.min(mag / 3.5, mu * jn); // 3.5 = 1 + m r^2 / I for a solid sphere
    const jx = (-cx / mag) * j;
    const jz = (-cz / mag) * j;
    b.vx += jx;
    b.vz += jz;
    b.wx += -jz / (0.4 * r);
    b.wz += jx / (0.4 * r);
  }
  if (b.vy < 0.6) b.vy = 0; // too small to hop: it rolls
  return pitch;
}

function sub(b: BallState, c: BallCfg, h: number): void {
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  const ax = -c.drag * sp * b.vx + c.magnus * (b.wy * b.vz - b.wz * b.vy);
  const ay = -G - c.drag * sp * b.vy + c.magnus * (b.wz * b.vx - b.wx * b.vz);
  const az = -c.drag * sp * b.vz + c.magnus * (b.wx * b.vy - b.wy * b.vx);
  const x0 = b.x;
  const y0 = b.y;
  const z0 = b.z;
  b.x += (b.vx + 0.5 * ax * h) * h;
  b.y += (b.vy + 0.5 * ay * h) * h;
  b.z += (b.vz + 0.5 * az * h) * h;
  b.vx += ax * h;
  b.vy += ay * h;
  b.vz += az * h;

  const r = c.radius;
  if (b.y <= r && b.vy <= 0) {
    if (y0 > r + 1e-9 && b.vy < -1e-6) {
      // came down from above: find the contact moment inside this sub-step, bounce, finish the step
      const frac = Math.min(1, Math.max(0, (y0 - r) / (y0 - b.y)));
      b.x = x0 + (b.x - x0) * frac;
      b.y = r;
      b.z = z0 + (b.z - z0) * frac;
      bounce(b, c);
      if (b.bounces === 0) {
        b.bx = b.x;
        b.bz = b.z;
      }
      b.bounces++;
      if (b.hit) {
        if (b.postBounces === 0) {
          b.pbx = b.x;
          b.pbz = b.z;
        }
        b.postBounces++;
      }
      const rest = (1 - frac) * h;
      b.x += b.vx * rest;
      b.z += b.vz * rest;
      b.y = Math.max(r, b.y + b.vy * rest);
    } else {
      // resting or rolling on the ground
      b.y = r;
      b.vy = 0;
      const pitch = onPitch(b.x, b.z);
      const dec = (pitch ? c.pitchRoll : c.grassRoll) * h;
      const hs = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
      if (hs <= dec) {
        b.vx = b.vz = 0;
      } else {
        b.vx -= (b.vx / hs) * dec;
        b.vz -= (b.vz / hs) * dec;
      }
      const damp = 1 - 3 * h;
      b.wx *= damp;
      b.wy *= damp;
      b.wz *= damp;
    }
  }
  if (!b.crossed && z0 > BAT_Z && b.z <= BAT_Z) {
    const f = (z0 - BAT_Z) / (z0 - b.z || 1);
    b.crossed = 1;
    b.crossX = x0 + (b.x - x0) * f;
    b.crossY = y0 + (b.y - y0) * f;
    b.crossSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  }
}

// Advance one sim tick (dt seconds) with 4 sub-steps. Returns nothing; inspect `active`.
// `hook` runs after every sub-step with the fraction of the tick elapsed (the bat uses it to test contact).
export function stepBall(b: BallState, c: BallCfg, dt: number, hook?: (b: BallState, frac: number) => void): void {
  b.px = b.x;
  b.py = b.y;
  b.pz = b.z;
  if (!b.active) return;
  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    sub(b, c, h);
    if (hook) hook(b, (i + 1) / SUBSTEPS);
    if (b.hit && b.y > b.maxY) b.maxY = b.y;
  }
  b.age += dt;
  const slow = b.bounces > 0 && b.y <= c.radius + 1e-6 && b.vx * b.vx + b.vz * b.vz < 0.04;
  if ((!b.hit && b.z < -30) || Math.abs(b.x) > 75 || Math.abs(b.z) > 75 || b.age > 9 || slow) b.active = 0;
}

// Flies a copy of the ball to its first bounce (used by the machine to aim).
export function firstBounce(pos: readonly [number, number, number], vel: readonly [number, number, number], c: BallCfg, dt: number): { x: number; z: number } {
  const b = createBall();
  launchBall(b, pos, vel);
  for (let i = 0; i < 600 && b.bounces === 0 && b.active; i++) stepBall(b, c, dt);
  return { x: b.bx, z: b.bz };
}
