import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { BAT_Z, STUMPS_Z } from '../src/sim/field';
import { ballSpeed, createBall, launchBall, stepBall } from '../src/sim/ball';
import { createMachine, solveDelivery, stepMachine, PHASE_FLIGHT, RELEASE_Y, RELEASE_Z } from '../src/sim/machine';

const c = DEFAULT_CONFIG.ball;
const dt = 1 / DEFAULT_CONFIG.sim.stepHz;

function fly(pos: [number, number, number], vel: [number, number, number], spin: [number, number, number] = [0, 0, 0], maxTicks = 3000) {
  const b = createBall();
  launchBall(b, pos, vel, spin);
  for (let i = 0; i < maxTicks && b.active; i++) stepBall(b, c, dt);
  return b;
}

test('a dropped ball falls with gravity and bounces lower each time', () => {
  const b = createBall();
  launchBall(b, [0, 1, 0], [0, 0, 0]);
  let peak1 = 0;
  let peak2 = 0;
  for (let i = 0; i < 2400; i++) {
    stepBall(b, c, dt);
    if (b.bounces === 1) peak1 = Math.max(peak1, b.y);
    if (b.bounces === 2) peak2 = Math.max(peak2, b.y);
  }
  assert.ok(b.bounces >= 2);
  // pitch restitution 0.56: rebound height about e^2 of the drop, plus the ball radius
  assert.ok(peak1 > 0.3 && peak1 < 0.38, `first rebound ${peak1}`);
  assert.ok(peak2 < peak1);
});

test('no energy appears out of nowhere through a bounce', () => {
  const b = createBall();
  launchBall(b, [0, 1.5, 6], [0, -2, -30], [0, 0, 0]);
  const e = (x: typeof b) => 0.5 * (x.vx ** 2 + x.vy ** 2 + x.vz ** 2) + 9.81 * x.y + 0.5 * 0.4 * c.radius ** 2 * (x.wx ** 2 + x.wy ** 2 + x.wz ** 2);
  const before = e(b);
  while (b.bounces === 0) stepBall(b, c, dt);
  assert.ok(e(b) < before, `${e(b)} vs ${before}`);
});

test('a fast ball cannot pass through the ground', () => {
  for (const speed of [20, 40, 60]) {
    const b = createBall();
    launchBall(b, [0, 0.5, 5], [0, -speed, -speed]);
    for (let i = 0; i < 400; i++) {
      stepBall(b, c, dt);
      assert.ok(b.y >= c.radius - 1e-9, `y ${b.y} at speed ${speed}`);
    }
  }
});

test('fast ball slides through the bounce and keeps most of its pace; spin matters for slow steep balls', () => {
  const pace = (vz: number, vy: number, wx: number) => {
    const b = createBall();
    launchBall(b, [0, 1, 5], [0, vy, vz], [wx, 0, 0]);
    while (b.bounces === 0) stepBall(b, c, dt);
    stepBall(b, c, dt);
    return Math.abs(b.vz);
  };
  const fast = pace(-35, -6, 0);
  assert.ok(fast > 25 && fast < 33, `pace after bounce ${fast}`);
  // slow, steep ball (spinner): the contact point grips, so spin direction changes the pace.
  // Travelling along -z, topspin is negative wx and backspin is positive wx.
  const flat = pace(-18, -8, 0);
  assert.ok(pace(-18, -8, -150) > flat, 'topspin keeps pace');
  assert.ok(pace(-18, -8, 150) < flat, 'backspin checks');
});

test('ball on the grass rolls to a stop', () => {
  const b = createBall();
  launchBall(b, [30, 0.04, 0], [-0, 0, 12]);
  b.x = 30;
  for (let i = 0; i < 240 * 20 && b.active; i++) stepBall(b, c, dt);
  assert.equal(b.active, 0);
  assert.ok(b.z > 12 && b.z < 60, `rolled to ${b.z}`);
});

test('crossing the batting crease is recorded', () => {
  const v = solveDelivery(110 / 3.6, 0, STUMPS_Z + 5.5, c, dt);
  const b = fly([0, RELEASE_Y, RELEASE_Z], v);
  assert.equal(b.crossed, 1);
  assert.ok(b.crossY > 0 && b.crossY < 2.5, `height at crease ${b.crossY}`);
  assert.ok(b.crossSpeed < 110 / 3.6);
});

test('machine hits its target: line, length and speed', () => {
  for (const [kmh, len, x] of [[80, 3, 0.2], [110, 5.5, -0.1], [130, 7, 0], [140, 1.2, 0.3], [145, 8.5, -0.2]] as const) {
    const v = solveDelivery(kmh / 3.6, x, STUMPS_Z + len, c, dt);
    const sp = Math.hypot(v[0], v[1], v[2]);
    assert.ok(Math.abs(sp * 3.6 - kmh) < 0.01, 'release speed');
    const b = createBall();
    launchBall(b, [0, RELEASE_Y, RELEASE_Z], v);
    while (b.bounces === 0 && b.active) stepBall(b, c, dt);
    assert.ok(Math.abs(b.bx - x) < 0.03, `line ${b.bx} vs ${x} (${kmh} km/h, ${len} m)`);
    assert.ok(Math.abs(b.bz - (STUMPS_Z + len)) < 0.03, `length ${b.bz} vs ${STUMPS_Z + len}`);
  }
});

test('a 110 km/h ball reaches the batter in about 0.6 s, a bouncer rises, a yorker stays low', () => {
  const good = fly([0, RELEASE_Y, RELEASE_Z], solveDelivery(110 / 3.6, 0, STUMPS_Z + 5.5, c, dt));
  assert.ok(good.crossed && good.age > 0.4);
  const yorker = fly([0, RELEASE_Y, RELEASE_Z], solveDelivery(130 / 3.6, 0, STUMPS_Z + 0.9, c, dt));
  const bouncer = fly([0, RELEASE_Y, RELEASE_Z], solveDelivery(135 / 3.6, 0, STUMPS_Z + 9, c, dt));
  assert.ok(yorker.crossY < 0.3, `yorker ${yorker.crossY}`);
  assert.ok(bouncer.crossY > 0.5, `bouncer ${bouncer.crossY}`);
  assert.ok(bouncer.crossY > good.crossY);
});

test('machine cycle: waits, cues, releases, waits for the ball to die, repeats', () => {
  const m = createMachine(7);
  const b = createBall();
  const seen: number[] = [];
  let released = 0;
  for (let i = 0; i < 240 * 30; i++) {
    stepMachine(m, b, DEFAULT_CONFIG.machine, c, dt, true);
    stepBall(b, c, dt);
    if (seen[seen.length - 1] !== m.phase) seen.push(m.phase);
    if (m.phase === PHASE_FLIGHT && m.count > released) {
      released = m.count;
      assert.ok(b.active);
    }
  }
  assert.ok(released >= 4, `balls released ${released}`);
  assert.deepEqual(seen.slice(0, 4), [0, 1, 2, 0]);
});

test('right-handers get the ball toward screen-left (off side), left-handers the mirror', () => {
  const cfg = { ...DEFAULT_CONFIG.machine, lineJitter: 0, lengthJitter: 0, speedJitter: 0, line: 0.3 };
  for (const rh of [true, false]) {
    const m = createMachine(1);
    const b = createBall();
    for (let i = 0; i < 240 * 5 && m.count === 0; i++) stepMachine(m, b, cfg, c, dt, rh);
    assert.equal(Math.sign(m.lineX), rh ? -1 : 1);
  }
});

test('ball speed helper', () => {
  const b = createBall();
  launchBall(b, [0, 1, 0], [3, 4, 0]);
  assert.equal(ballSpeed(b), 5);
  void BAT_Z;
});
