import type { GameConfig } from '../config/defaults';
import type { InputFrame } from '../input/types';
import type { StanceState } from './stance';
import { BACK, REVERSE, STEP, SWEEP } from './stance';

export type SwingCfg = GameConfig['swing'];
const TWO_PI = Math.PI * 2;

// A swipe launches one swing. Its direction sets the shot direction (yaw, from straight toward the off side),
// its speed sets the bat speed from a dead-bat defence to full power, and the faster it is the more the face
// tilts up at contact (which is what lifts the ball). The bat then runs the swing on its own: speed up,
// pass the bottom of the arc (alpha = pi, contact), carry on into the follow-through, hold, and come back.
export const IDLE = 0;
export const SWINGING = 1;
export const HOLD = 2;
export const RECOVER = 3;

export interface SwingState {
  alpha: number; // bat angle in its swing plane, radians (0 = backlift)
  prevAlpha: number; // for render interpolation and bat velocity
  omega: number; // rad/s
  phase: number;
  seen: number; // the last swipe number handled
  psi: number; // shot direction of this swing, toward the off side
  peak: number; // bat speed this swing builds up to, rad/s
  end: number; // bat angle where the follow-through stops
  eps: number; // face tilt at contact
  rollFull: number; // wrist roll of this swing (full value; fades in and out with the swing)
  hold: number; // seconds left holding the follow-through
  power: number; // 0 (defence) .. 1 (full power), for display
  yaw: number; // plane direction at this moment
  prevYaw: number;
  roll: number; // wrist roll at this moment
  locked: number; // 1 while a swing is under way (feet stay planted)
}

export function createSwing(): SwingState {
  return { alpha: 0, prevAlpha: 0, omega: 0, phase: IDLE, seen: 0, psi: 0, peak: 0, end: 0, eps: 0, rollFull: 0, hold: 0, power: 0, yaw: 0, prevYaw: 0, roll: 0, locked: 0 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (x: number) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};

// Face tilt at contact: a little more for stances whose shots are lofted, a little less for punches and cuts.
const FACE_BIAS: Record<number, number> = { [BACK]: -0.08, [SWEEP]: 0.05, [REVERSE]: 0.05, [STEP]: 0.15 };

// Swipe direction (unit, screen terms: dx right, dy down) to the shot direction in radians from straight toward the off side.
export function swipeYaw(dx: number, dy: number, rightHanded: boolean): number {
  const vx = dx; // screen right is +X in the view frame
  const vz = -dy; // screen up is toward the bowler
  const off = rightHanded ? -vx : vx;
  return Math.atan2(off, vz);
}

// Window that keeps the plane direction and the roll out of the way at the backlift and the end of the recovery.
const ramp = 1.2;
export function swingWindow(alpha: number): number {
  const a = clamp(alpha, 0, TWO_PI);
  return smooth(a / ramp) * (1 - smooth((a - (TWO_PI - ramp)) / ramp));
}

export function stepSwing(sw: SwingState, f: InputFrame, stance: StanceState, dt: number, c: SwingCfg, rightHanded: boolean): void {
  if (sw.phase === IDLE && sw.alpha !== 0) {
    sw.alpha = 0;
    sw.omega = 0;
  }
  sw.prevAlpha = sw.alpha;
  sw.prevYaw = sw.yaw;

  if (f.n !== sw.seen) {
    sw.seen = f.n;
    const len = Math.hypot(f.dx, f.dy);
    if (sw.phase === IDLE && len > 1e-6) {
      const sn = clamp((f.sp - c.swipeSlow) / Math.max(1e-6, c.swipeFast - c.swipeSlow), 0, 1);
      sw.psi = swipeYaw(f.dx / len, f.dy / len, rightHanded);
      sw.power = sn;
      sw.peak = c.minOmega + (c.maxOmega - c.minOmega) * sn;
      sw.end = Math.PI + c.followDef + (c.followMax - c.followDef) * sn;
      sw.eps = c.faceLow + (c.faceHigh - c.faceLow) * sn + (FACE_BIAS[stance.gate] ?? 0);
      sw.rollFull = (rightHanded ? -1 : 1) * (sw.psi / 2);
      sw.phase = SWINGING;
      sw.omega = 0;
    }
  }

  if (sw.phase === SWINGING) {
    const stopDist = (sw.omega * sw.omega) / (2 * c.decel);
    if (sw.end - sw.alpha <= stopDist) sw.omega = Math.max(0, sw.omega - c.decel * dt);
    else sw.omega = Math.min(sw.peak, sw.omega + c.accel * dt);
    sw.alpha += sw.omega * dt;
    if (sw.alpha >= sw.end || sw.omega <= 1e-6) {
      sw.alpha = Math.min(sw.alpha, sw.end);
      sw.omega = 0;
      sw.phase = HOLD;
      sw.hold = c.hold;
    }
  } else if (sw.phase === HOLD) {
    sw.hold -= dt;
    if (sw.hold <= 0) sw.phase = RECOVER;
  } else if (sw.phase === RECOVER) {
    // on round to the backlift, slowly
    const rest = TWO_PI;
    const left = rest - sw.alpha;
    const step = Math.min(left, c.recoverOmega * dt);
    sw.alpha += step;
    sw.omega = step / dt;
    if (rest - sw.alpha < 1e-9) {
      sw.alpha = rest;
      sw.omega = 0;
      sw.phase = IDLE;
    }
  }

  const win = sw.phase === IDLE ? 0 : swingWindow(sw.alpha);
  sw.yaw = sw.psi * win;
  sw.roll = sw.rollFull * win;
  sw.locked = sw.phase === IDLE ? 0 : 1;
}
