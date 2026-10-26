import { DEFAULT_CONFIG, type GameConfig } from '../config/defaults';
import { BAT_Z, STUMPS_Z } from '../sim/field';
import { createBall, launchBall, stepBall, type BallState } from '../sim/ball';
import { RELEASE_Y, RELEASE_Z, solveDelivery } from '../sim/machine';
import { resolveHit, runsFor, windowsFor, type HitResult } from './rules';

export const BALLS_PER_OVER = 6;
export const CONTACT_Z = BAT_Z + 0.75; // where the bat meets the ball (sim frame)
export const SWING_DEFAULT = 0.18; // seconds from swipe to contact when not snapped
export const WAIT_SEC = 1.6;
export const CUE_SEC = 1.0;
export const RESULT_SEC = 2.4;
const BOUNDARY = 62;
const DT = 1 / 240;

// Easy over: slow and straight, speeding up a little.
const SPEEDS = [70, 70, 74, 74, 78, 82];
const LINES = [0.0, 0.15, -0.2, 0.3, -0.1, 0.1];
const LENGTHS = [4.3, 4.8, 3.6, 5.3, 4.2, 6.2];

export type Phase = 'wait' | 'cue' | 'flight' | 'result' | 'over';

export interface Swing {
  start: number;
  toContact: number;
  stance: number;
  dir: number; // degrees, for the body
  result: HitResult;
  hitTime: number;
  applied: boolean;
}

export class Match {
  ball: BallState = createBall();
  phase: Phase = 'wait';
  timer = WAIT_SEC;
  t = 0;
  index = 0; // balls delivered so far
  runs = 0;
  wickets = 0;
  stance = 0;
  swing: Swing | null = null;
  message = '';
  detail = '';
  messageAt = -10;
  hitFlag = 0; // counts hits, for sounds/effects
  history: string[] = [];
  private plan = { speed: 70, x: 0, len: 4 };
  private arrival = 0; // absolute time the ball reaches the bat
  private predLen = 0;
  private predHeight = 0;
  private predX = 0;
  private resolved = false;

  constructor(private cfg: GameConfig = DEFAULT_CONFIG) {}

  restart(): void {
    this.ball = createBall();
    this.phase = 'wait';
    this.timer = WAIT_SEC;
    this.index = 0;
    this.runs = 0;
    this.wickets = 0;
    this.swing = null;
    this.message = '';
    this.detail = '';
    this.history = [];
  }

  setStance(i: number): void {
    if (!this.swing || this.phase !== 'flight') this.stance = i; // only a swing in flight locks the stance
  }

  private say(m: string, d = ''): void {
    this.message = m;
    this.detail = d;
    this.messageAt = this.t;
  }

  // dx, dy: unit swipe direction on screen (dy down); sp: swipe speed in screen heights per second.
  swipe(dx: number, dy: number, sp: number): void {
    if (this.swing || this.phase === 'result' || this.phase === 'over') return;
    const dir = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (this.phase !== 'flight') {
      this.swing = { start: this.t, toContact: SWING_DEFAULT, stance: this.stance, dir, result: { hit: false, grade: 'miss', text: 'Too early', quality: 0, vel: [0, 0, 0] }, hitTime: -1, applied: true };
      this.say('Too early', 'swing when the ball is on its way');
      return;
    }
    const tc = this.t + SWING_DEFAULT;
    const e = this.arrival - tc;
    const w = windowsFor(this.index - 1);
    const result = resolveHit({ e, w, stance: this.stance, length: this.predLen, height: this.predHeight, lateral: this.predX, dx, dy, speed: sp });
    let toContact = SWING_DEFAULT;
    let hitTime = -1;
    if (result.hit) {
      hitTime = this.arrival;
      if (Math.abs(e) <= w.good) toContact = Math.max(0.06, this.arrival - this.t); // the bat meets the ball on time
    }
    this.swing = { start: this.t, toContact, stance: this.stance, dir, result, hitTime, applied: false };
    if (!result.hit) this.say(result.text);
  }

  private plane(): void {
    // fly a copy of the delivery to the bat to learn when and where it arrives and where it pitches
    const b = createBall();
    const [x, y, z] = [this.ball.x, this.ball.y, this.ball.z];
    launchBall(b, [x, y, z], [this.ball.vx, this.ball.vy, this.ball.vz]);
    let t = 0;
    for (let i = 0; i < 2400 && b.z > CONTACT_Z && b.active; i++, t += DT) stepBall(b, this.cfg.ball, DT);
    this.arrival = this.t + t;
    this.predLen = b.bounces > 0 ? b.bz - STUMPS_Z : 99;
    this.predHeight = b.y;
    this.predX = b.x;
  }

  private finish(text: string, detail: string, runs: number, wicket: boolean): void {
    this.runs += runs;
    if (wicket) this.wickets++;
    this.history.push(wicket ? 'W' : runs === 0 ? '.' : String(runs));
    this.say(text, detail);
    this.phase = 'result';
    this.timer = RESULT_SEC;
  }

  step(dt = DT): void {
    this.t += dt;
    switch (this.phase) {
      case 'wait':
        if ((this.timer -= dt) <= 0) {
          const i = this.index % BALLS_PER_OVER;
          this.plan = { speed: SPEEDS[i]!, x: LINES[i]!, len: LENGTHS[i]! };
          this.phase = 'cue';
          this.timer = CUE_SEC;
          this.swing = null;
          this.resolved = false;
          this.ball = createBall();
          this.say('');
        }
        break;
      case 'cue':
        if ((this.timer -= dt) <= 0) {
          const v = solveDelivery(this.plan.speed / 3.6, this.plan.x, STUMPS_Z + this.plan.len, this.cfg.ball, DT);
          launchBall(this.ball, [0, RELEASE_Y, RELEASE_Z], v);
          this.index++;
          this.phase = 'flight';
          this.plane();
        }
        break;
      case 'flight':
        this.flight(dt);
        break;
      case 'result':
        if ((this.timer -= dt) <= 0) {
          if (this.index >= BALLS_PER_OVER) {
            this.phase = 'over';
            this.say('Over complete', `${this.runs} runs, ${this.wickets} wicket${this.wickets === 1 ? '' : 's'}`);
          } else {
            this.phase = 'wait';
            this.timer = WAIT_SEC;
          }
        }
        // keep a hit ball rolling for the replay of its path
        if (this.ball.active) stepBall(this.ball, this.cfg.ball, dt);
        break;
      default:
    }
    // a swing in progress: apply the hit at the moment of contact
    const s = this.swing;
    if (s && !s.applied && this.phase === 'flight' && this.t >= s.hitTime) {
      s.applied = true;
      const b = this.ball;
      b.vx = s.result.vel[0];
      b.vy = s.result.vel[1];
      b.vz = s.result.vel[2];
      b.hit = 1;
      b.maxY = b.y;
      this.hitFlag++;
      this.say(s.result.text);
    }
  }

  private flight(dt: number): void {
    const b = this.ball;
    stepBall(b, this.cfg.ball, dt);
    if (!b.hit) {
      if (b.z <= STUMPS_Z) {
        const swung = this.swing && !this.swing.result.hit;
        if (Math.abs(b.x) < 0.15 && b.y < 0.78) this.finish('BOWLED!', 'the stumps are broken', 0, true);
        else this.finish(swung ? 'Missed' : 'Dot ball', swung ? this.swing!.result.text : 'left alone', 0, false);
        b.active = 0;
      }
      return;
    }
    if (this.resolved) return;
    const d = Math.hypot(b.x, b.z);
    if (d >= BOUNDARY) {
      this.resolved = true;
      if (b.postBounces === 0) this.finish('SIX!', this.swing!.result.text, 6, false);
      else this.finish('FOUR!', this.swing!.result.text, 4, false);
      b.active = 0;
    } else if (b.postBounces >= 1 && b.maxY > 7 && Math.hypot(b.pbx, b.pbz) < 42) {
      this.resolved = true;
      this.finish('CAUGHT!', 'in the deep', 0, true);
    } else if (!b.active) {
      this.resolved = true;
      const r = runsFor(d);
      this.finish(r === 0 ? 'Dot ball' : r === 1 ? 'Single' : `${r} runs`, this.swing!.result.text, r, false);
    }
  }
}
