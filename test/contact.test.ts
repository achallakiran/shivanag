import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { BAT_TOTAL, type BatFrame } from '../src/sim/bat';
import { createBall, launchBall, stepBall } from '../src/sim/ball';
import { contactHook, createShot } from '../src/sim/contact';

const dt = 1 / DEFAULT_CONFIG.sim.stepHz;
const bat = DEFAULT_CONFIG.bat;
const r = DEFAULT_CONFIG.ball.radius;

// A bat swung in a straight line: its top at `top`, rod pointing down (-y), face normal toward +z, moving at `speed` along +z.
function swungBat(speed: number, top: [number, number, number], tick = 0): BatFrame {
  return { hands: [top[0], top[1] - 0.165, top[2] + speed * dt * tick], top: [top[0], top[1], top[2] + speed * dt * tick], d: [0, -1, 0], t: [0, 0, 1], w: [1, 0, 0] };
}

function hitAt(opts: { s?: number; lat?: number; batSpeed?: number; ballSpeed?: number; spin?: [number, number, number] }) {
  const s = opts.s ?? bat.sweetSpot;
  const lat = opts.lat ?? 0;
  const batSpeed = opts.batSpeed ?? 25;
  const ballSpeed = opts.ballSpeed ?? 30;
  const top: [number, number, number] = [-lat, 1.2, 0];
  const ball = createBall();
  // the ball travels in -z toward the bat face, aimed at depth s along the bat
  launchBall(ball, [0, 1.2 - s, 1.5], [0, 0, -ballSpeed], opts.spin ?? [0, 0, 0]);
  ball.age = 0;
  const shot = createShot();
  for (let i = 0; i < 240 && ball.active && !ball.hit; i++) {
    const f0 = swungBat(batSpeed, top, i);
    const f1 = swungBat(batSpeed, top, i + 1);
    const hook = contactHook({ f0, f1, dt, bat, radius: r, rightHanded: true, alpha: 3, shot });
    stepBall(ball, DEFAULT_CONFIG.ball, dt, hook);
  }
  return { ball, shot };
}

test('a head-on hit at the sweet spot follows q*v_in + (1+q)*V', () => {
  const { ball, shot } = hitAt({});
  assert.equal(ball.hit, 1);
  // ball moves at -30 toward a bat moving +25: relative closing speed 55; exit = bat speed + q * 55 (along +z)
  const expected = 25 + bat.acorSweet * 55;
  assert.ok(Math.abs(ball.vz - expected) < 1.5, `vz ${ball.vz} expected about ${expected}`);
  assert.ok(Math.abs(ball.vy) < 1);
  assert.ok(Math.abs(shot.s - bat.sweetSpot) < 0.05);
});

test('toe hits are much weaker than sweet-spot hits', () => {
  const sweet = hitAt({}).ball.vz;
  const toe = hitAt({ s: BAT_TOTAL - 0.02 }).ball.vz;
  const handle = hitAt({ s: 0.42 }).ball.vz;
  assert.ok(sweet > toe + 3, `sweet ${sweet} toe ${toe}`);
  assert.ok(sweet > handle + 2, `sweet ${sweet} handle ${handle}`);
});

test('a harder swing sends the ball faster, and bat speed matters more than ball speed gets back', () => {
  const slow = hitAt({ batSpeed: 10 }).ball.vz;
  const fast = hitAt({ batSpeed: 30 }).ball.vz;
  assert.ok(fast > slow + 15, `slow ${slow} fast ${fast}`);
});

test('an edge hit sends the ball off to the side', () => {
  const mid = hitAt({});
  const edge = hitAt({ lat: bat.halfWidth * 0.9 });
  assert.ok(Math.abs(mid.ball.vx) < 0.5);
  assert.ok(Math.abs(edge.ball.vx) > 3, `edge vx ${edge.ball.vx}`);
  const other = hitAt({ lat: -bat.halfWidth * 0.9 });
  assert.ok(Math.sign(other.ball.vx) === -Math.sign(edge.ball.vx), 'opposite edge deflects the opposite way');
});

test('a ball that misses the bat width passes through untouched', () => {
  const { ball } = hitAt({ lat: bat.halfWidth + 0.08 });
  assert.equal(ball.hit, 0);
});

test('hitting under the ball puts backspin on it, and the bat face grips', () => {
  // rod tilted so the face points forward-and-up: ball struck on its lower half
  const ball = createBall();
  launchBall(ball, [0, 1.2 - bat.sweetSpot, 1.0], [0, 0, -30]);
  const tilt = 0.5;
  const shot = createShot();
  const t: [number, number, number] = [0, Math.sin(tilt), Math.cos(tilt)];
  const mk = (k: number): BatFrame => ({ hands: [0, 1.0, 0], top: [0, 1.2, 25 * dt * k], d: [0, -Math.cos(tilt), Math.sin(tilt)], t, w: [1, 0, 0] });
  for (let i = 0; i < 240 && !ball.hit; i++) stepBall(ball, DEFAULT_CONFIG.ball, dt, contactHook({ f0: mk(i), f1: mk(i + 1), dt, bat, radius: r, rightHanded: true, alpha: 3, shot }));
  assert.equal(ball.hit, 1);
  assert.ok(ball.vy > 3, `goes up ${ball.vy}`);
  assert.ok(shot.launch > 5);
});

test('a ball cannot tunnel through a fast bat: every approach speed hits', () => {
  for (const batSpeed of [5, 20, 35, 45]) {
    for (const ballSpeed of [10, 30, 45]) {
      const { ball } = hitAt({ batSpeed, ballSpeed });
      assert.equal(ball.hit, 1, `bat ${batSpeed} ball ${ballSpeed}`);
    }
  }
});

test('no energy gain: the ball never leaves faster than the bat plus its own approach', () => {
  for (const s of [0.45, 0.6, 0.8, 0.9]) {
    const { ball } = hitAt({ s });
    const exit = Math.sqrt(ball.vx ** 2 + ball.vy ** 2 + ball.vz ** 2);
    assert.ok(exit <= 25 + 30 + 1e-6, `exit ${exit} at s=${s}`);
  }
});

test('a ball is only hit once', () => {
  const { ball } = hitAt({});
  const vz = ball.vz;
  const shot = createShot();
  const f = swungBat(25, [0, 1.2, 0], 0);
  stepBall(ball, DEFAULT_CONFIG.ball, dt, contactHook({ f0: f, f1: f, dt, bat, radius: r, rightHanded: true, alpha: 3, shot }));
  assert.ok(Math.abs(ball.vz - vz) < 1, 'unchanged by a second pass');
});
