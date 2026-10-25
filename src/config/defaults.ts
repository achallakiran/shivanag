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
  render: { maxPixelRatio: number };
  debug: { hud: boolean };
}

export const DEFAULT_CONFIG: GameConfig = {
  sim: { stepHz: 240, maxStepsPerFrame: 16 },
  input: { stickRadiusPx: 70, deadZone: 0.08, smoothing: 0.5, leftZoneFraction: 0.5, edgeMarginPx: 20 },
  toy: { footMaxSpeed: 4, footAccel: 20, batReach: 1.2, batResponse: 30 },
  body: { height: 1.8, stanceWidth: 0.45, crouch: 0.1, lean: 0.12, guardOffset: 0.5, open: 0.6 },
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
  'render.maxPixelRatio': [1, 3],
};
