// Fixed-step loop. Physics advances in whole steps of 1/stepHz seconds, so
// results depend on the step count and the inputs per step, never on frame timing.
export interface LoopOptions {
  stepHz: number;
  maxStepsPerFrame: number;
  step: (tick: number, dt: number) => void;
  render: (alpha: number) => void;
}

export class FixedLoop {
  tick = 0; // steps executed so far
  fps = 0;
  stepsPerSec = 0;

  private acc = 0; // accumulated time in step units, 0..1 between frames
  private last = -1;
  private rafId = 0;
  private running = false;
  private statStart = 0;
  private statFrames = 0;
  private statSteps = 0;

  constructor(private o: LoopOptions) {}

  get dt(): number {
    return 1 / this.o.stepHz;
  }

  // Advances by `elapsedSec` of wall time. Returns the number of steps run.
  advance(elapsedSec: number): number {
    this.acc += Math.max(0, elapsedSec) * this.o.stepHz;
    let n = 0;
    const dt = this.dt;
    while (this.acc >= 1 && n < this.o.maxStepsPerFrame) {
      this.o.step(this.tick, dt);
      this.tick++;
      this.acc -= 1;
      n++;
    }
    if (this.acc >= 1) this.acc = 0; // fell too far behind: drop the backlog
    return n;
  }

  get alpha(): number {
    return this.acc;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    const frame = (t: number) => {
      if (!this.running) return;
      if (this.last >= 0) {
        const elapsed = Math.min((t - this.last) / 1000, 0.25);
        this.statSteps += this.advance(elapsed);
        this.statFrames++;
      }
      this.last = t;
      if (this.statStart === 0) this.statStart = t;
      const span = t - this.statStart;
      if (span >= 500) {
        this.fps = (this.statFrames * 1000) / span;
        this.stepsPerSec = (this.statSteps * 1000) / span;
        this.statStart = t;
        this.statFrames = 0;
        this.statSteps = 0;
      }
      this.o.render(this.acc);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
