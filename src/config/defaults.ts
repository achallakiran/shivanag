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
  // Circle swing (right stick). The thumb's angle around the stick is the bat's angle in its swing plane:
  // up is the backlift, and the circle runs up, side, down (contact), other side, up. Angles in radians.
  swing: {
    engage: number; // stick deflection (0..1) that starts tracking the thumb
    release: number; // deflection below which the thumb counts as released
    direction: number; // +1 or -1: which way round the circle is the forward swing (right-hander: +1 is counter-clockwise)
    maxOmega: number; // fastest the bat can rotate, rad/s
    response: number; // how quickly the bat catches up with the thumb, 1/s
    recoverOmega: number; // rad/s back to the backlift after release
    yawReady: number; // shot direction of the swing plane per stance, toward the off side, plus gain from the line stick
    gainReady: number;
    yawBack: number;
    gainBack: number;
    yawSit: number;
    gainSit: number;
    yawFront: number;
    gainFront: number;
    yawStep: number;
    gainStep: number;
  };
  // Bat and contact. Distances along the bat are metres from the top of the handle.
  bat: {
    sweetSpot: number;
    sweetWidth: number;
    acorSweet: number; // coefficient of restitution at the sweet spot (bat-ball, including bat inertia)
    acorEdge: number; // away from it
    friction: number; // ball on bat face
    halfWidth: number; // contact half width of the blade (a real blade is 0.054; wider is more forgiving)
    halfThick: number;
    edgeTilt: number; // how far the contact normal tilts at the very edge, radians
  };
  // Stances (tap-to-select buttons). Distances in metres, speeds in m/s (or rad/s for turns).
  stance: {
    footSpeed: number;
    hipSpeed: number;
    leanSpeed: number;
    weightSpeed: number;
    backStep: number;
    sitReach: number;
    sitDrop: number;
    frontStride: number;
    stepOut: number;
    turnSpeed: number; // chest turn and backlift, rad/s
    handSpeed: number; // hands, m/s
  };
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
  input: { stickRadiusPx: 100, deadZone: 0.08, smoothing: 0.5, leftZoneFraction: 0.5, edgeMarginPx: 20 },
  swing: { engage: 0.35, release: 0.25, direction: 1, maxOmega: 20, response: 40, recoverOmega: 4, yawReady: 0, gainReady: 0.5, yawBack: 0, gainBack: 1.3, yawSit: -1.1, gainSit: 0.5, yawFront: 0, gainFront: 0.6, yawStep: 0, gainStep: 0.5 },
  bat: { sweetSpot: 0.8, sweetWidth: 0.1, acorSweet: 0.3, acorEdge: 0.1, friction: 0.35, halfWidth: 0.09, halfThick: 0.035, edgeTilt: 1 },
  stance: { footSpeed: 3.2, hipSpeed: 1.4, leanSpeed: 1, weightSpeed: 2.5, backStep: 0.4, sitReach: 0.55, sitDrop: 0.4, frontStride: 0.65, stepOut: 1.4, turnSpeed: 3, handSpeed: 1.2 },
  body: { height: 1.8, stanceWidth: 0.45, crouch: 0.1, lean: 0.12, guardOffset: 0.3, open: 0.6 },
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
  'swing.engage': [0.1, 0.8],
  'swing.release': [0.05, 0.7],
  'swing.direction': [-1, 1],
  'swing.maxOmega': [4, 40],
  'swing.response': [5, 200],
  'swing.recoverOmega': [0.5, 20],
  'swing.yawReady': [-1.6, 1.6],
  'swing.gainReady': [0, 2],
  'swing.yawBack': [-1.6, 1.6],
  'swing.gainBack': [0, 2],
  'swing.yawSit': [-1.6, 1.6],
  'swing.gainSit': [0, 2],
  'swing.yawFront': [-1.6, 1.6],
  'swing.gainFront': [0, 2],
  'swing.yawStep': [-1.6, 1.6],
  'swing.gainStep': [0, 2],
  'bat.sweetSpot': [0.4, 0.96],
  'bat.sweetWidth': [0.02, 0.3],
  'bat.acorSweet': [0.05, 0.6],
  'bat.acorEdge': [0, 0.5],
  'bat.friction': [0, 1],
  'bat.halfWidth': [0.03, 0.3],
  'bat.halfThick': [0.02, 0.1],
  'bat.edgeTilt': [0, 1.4],
  'stance.footSpeed': [0.5, 10],
  'stance.hipSpeed': [0.2, 5],
  'stance.leanSpeed': [0.2, 5],
  'stance.weightSpeed': [0.3, 10],
  'stance.backStep': [0, 0.8],
  'stance.sitReach': [0, 1.2],
  'stance.sitDrop': [0, 0.6],
  'stance.frontStride': [0, 1.2],
  'stance.stepOut': [0, 2.5],
  'stance.turnSpeed': [0.5, 12],
  'stance.handSpeed': [0.2, 6],
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
