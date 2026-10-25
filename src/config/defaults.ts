// Every tuning value lives here as data. Nothing in the game hard-codes these.
export interface GameConfig {
  sim: { stepHz: number; maxStepsPerFrame: number };
  input: {
    stickRadiusPx: number; // thumb travel that equals full stick deflection
    deadZone: number; // 0..1 fraction of the radius ignored
    smoothing: number; // 0 = none, closer to 1 = heavier (fraction of previous value kept per tick)
    leftZoneFraction: number; // left stick owns this fraction of the screen width
    edgeMarginPx: number; // touches this close to a side edge are ignored (iOS back-swipe)
  };
  // Phase 0 toy values, used only to prove input -> deterministic sim -> render.
  toy: { footMaxSpeed: number; footAccel: number; batReach: number; batResponse: number };
  // Batsman body proportions and stance. Metres. Placeholder pose until the full joint model (Phase 3).
  body: { height: number; stanceWidth: number; crouch: number; lean: number; guardOffset: number; open: number };
  // Ball physics. Per-mass formulation, so there is no mass setting. Metres, seconds.
  ball: {
    radius: number;
    drag: number; // air drag: a = -drag * |v| * v  (about 0.5*rho*Cd*A/m for a cricket ball)
    magnus: number; // spin force: a = magnus * (spin x v)
    pitchE: number; // vertical bounce restitution on the pitch
    pitchMu: number; // friction coefficient on the pitch
    pitchRoll: number; // rolling slow-down on the pitch, m/s^2
    grassE: number;
    grassMu: number;
    grassRoll: number;
    visualScale: number; // drawing size multiplier only, physics keeps the real radius
  };
  // Bowling machine. Line is metres toward the batter's off side where the ball pitches;
  // length is metres from the batting stumps to the pitching point.
  machine: {
    speedKmh: number;
    line: number;
    length: number;
    speedJitter: number;
    lineJitter: number;
    lengthJitter: number;
    cue: number; // seconds of warning before each release
    pause: number; // seconds after a ball is dead before the next cue
  };
  render: { maxPixelRatio: number };
  debug: { hud: boolean };
}

export const DEFAULT_CONFIG: GameConfig = {
  sim: { stepHz: 240, maxStepsPerFrame: 16 },
  input: { stickRadiusPx: 70, deadZone: 0.08, smoothing: 0.5, leftZoneFraction: 0.5, edgeMarginPx: 20 },
  toy: { footMaxSpeed: 4, footAccel: 20, batReach: 1.2, batResponse: 30 },
  body: { height: 1.8, stanceWidth: 0.45, crouch: 0.1, lean: 0.12, guardOffset: 0.5, open: 0.6 },
  ball: { radius: 0.036, drag: 0.0061, magnus: 0.00055, pitchE: 0.56, pitchMu: 0.55, pitchRoll: 0.5, grassE: 0.35, grassMu: 0.5, grassRoll: 1.8, visualScale: 2.5 },
  machine: { speedKmh: 110, line: 0.1, length: 5.5, speedJitter: 6, lineJitter: 0.2, lengthJitter: 0.8, cue: 1, pause: 2 },
  render: { maxPixelRatio: 2 },
  debug: { hud: true },
};

// Allowed ranges for numeric settings, keyed by dotted path.
export const LIMITS: Record<string, [number, number]> = {
  'sim.stepHz': [60, 480],
  'sim.maxStepsPerFrame': [1, 64],
  'input.stickRadiusPx': [20, 200],
  'input.deadZone': [0, 0.5],
  'input.smoothing': [0, 0.95],
  'input.leftZoneFraction': [0.2, 0.8],
  'input.edgeMarginPx': [0, 60],
  'toy.footMaxSpeed': [0.5, 12],
  'toy.footAccel': [1, 100],
  'toy.batReach': [0.2, 3],
  'toy.batResponse': [1, 200],
  'body.height': [1.4, 2.1],
  'body.stanceWidth': [0.2, 0.9],
  'body.crouch': [0, 0.3],
  'body.lean': [0, 0.35],
  'body.guardOffset': [0, 1.2],
  'body.open': [0, 1.4], // radians the chest/hips are turned from side-on toward the bowler
  'ball.radius': [0.02, 0.06],
  'ball.drag': [0, 0.05],
  'ball.magnus': [0, 0.005],
  'ball.pitchE': [0.1, 0.9],
  'ball.pitchMu': [0, 1.2],
  'ball.pitchRoll': [0, 5],
  'ball.grassE': [0.05, 0.9],
  'ball.grassMu': [0, 1.2],
  'ball.grassRoll': [0, 8],
  'ball.visualScale': [1, 6],
  'machine.speedKmh': [40, 160],
  'machine.line': [-1.2, 1.2],
  'machine.length': [0, 10],
  'machine.speedJitter': [0, 30],
  'machine.lineJitter': [0, 1],
  'machine.lengthJitter': [0, 3],
  'machine.cue': [0.2, 3],
  'machine.pause': [0.5, 10],
  'render.maxPixelRatio': [1, 3],
};
