import type { GameConfig } from '../config/defaults';
import type { InputFrame } from '../input/types';
import type { StanceState } from './stance';
import { planeYaw } from './bat';

export type SwingCfg = GameConfig['swing'];
const TWO_PI = Math.PI * 2;

export interface SwingState {
  alpha: number; // bat angle in its swing plane, radians (0 = backlift)
  prevAlpha: number; // for render interpolation and bat velocity
  omega: number; // rad/s
  theta: number; // the thumb's angle, unwrapped, so a full circle keeps counting
  lastAng: number;
  engaged: number; // 1 while the thumb is out far enough to steer the bat
  yaw: number; // shot direction of the swing plane, toward the off side
  prevYaw: number;
  locked: number; // 1 while a swing is under way (feet stay planted)
}

export function createSwing(): SwingState {
  return { alpha: 0, prevAlpha: 0, omega: 0, theta: 0, lastAng: 0, engaged: 0, yaw: 0, prevYaw: 0, locked: 0 };
}

const wrapPi = (a: number) => a - TWO_PI * Math.round(a / TWO_PI);

// Thumb angle around the stick, 0 = up. The forward swing runs counter-clockwise for a right-hander
// (up, left, down, right) and the mirror image for a left-hander. `direction` flips it.
export function thumbAngle(rx: number, ry: number, rightHanded: boolean, direction: number): number {
  const s = (rightHanded ? 1 : -1) * (direction >= 0 ? 1 : -1);
  return Math.atan2(-rx * s, ry);
}

export function stepSwing(sw: SwingState, f: InputFrame, stance: StanceState, dt: number, c: SwingCfg, rightHanded: boolean): void {
  // keep alpha near zero at rest so the numbers never grow
  if (!sw.engaged && Math.abs(sw.omega) < 1e-9) {
    const k = Math.round(sw.alpha / TWO_PI);
    if (k !== 0) {
      sw.alpha -= k * TWO_PI;
      sw.theta -= k * TWO_PI;
    }
  }
  sw.prevAlpha = sw.alpha;
  sw.prevYaw = sw.yaw;

  const m = Math.sqrt(f.rx * f.rx + f.ry * f.ry);
  const ang = thumbAngle(f.rx, f.ry, rightHanded, c.direction);
  if (f.ra && !sw.engaged && m >= c.engage) {
    sw.engaged = 1;
    sw.lastAng = ang;
    sw.theta = ang + TWO_PI * Math.round((sw.alpha - ang) / TWO_PI);
  } else if (sw.engaged && (!f.ra || m < c.release)) {
    sw.engaged = 0;
  }

  let cmd: number;
  if (sw.engaged) {
    sw.theta += wrapPi(ang - sw.lastAng);
    sw.lastAng = ang;
    cmd = Math.max(-c.maxOmega, Math.min(c.maxOmega, (sw.theta - sw.alpha) * c.response));
  } else {
    // released: swing on round to the backlift (or back, whichever is nearer), slowly
    const rest = TWO_PI * Math.round(sw.alpha / TWO_PI);
    const toRest = rest - sw.alpha;
    cmd = Math.max(-c.recoverOmega, Math.min(c.recoverOmega, toRest * c.response));
    if (Math.abs(toRest) < 1e-4 && Math.abs(sw.omega) < 1e-3) {
      sw.alpha = rest;
      sw.omega = 0;
      cmd = 0;
    }
  }
  const k = Math.min(1, c.response * dt);
  sw.omega += (cmd - sw.omega) * k;
  if (Math.abs(sw.omega) < 1e-9) sw.omega = 0;
  sw.alpha += sw.omega * dt;

  sw.yaw = planeYaw(stance.gate, stance.pose.line, c);
  const restNear = Math.abs(sw.alpha - TWO_PI * Math.round(sw.alpha / TWO_PI));
  sw.locked = restNear > 0.2 ? 1 : 0;
}
