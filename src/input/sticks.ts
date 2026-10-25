import type { GameConfig } from '../config/defaults';
import type { InputFrame } from './types';

type InputCfg = GameConfig['input'];

interface Side {
  id: number | null;
  ox: number; // where the thumb first landed (relative stick origin)
  oy: number;
  cx: number; // current thumb position
  cy: number;
  sx: number; // smoothed output
  sy: number;
}

const newSide = (): Side => ({ id: null, ox: 0, oy: 0, cx: 0, cy: 0, sx: 0, sy: 0 });

export interface StickVisual {
  active: boolean;
  ox: number;
  oy: number;
  cx: number;
  cy: number;
  radius: number;
}

// Two floating, relative sticks. Left half of the screen is the left stick,
// right half is the right stick. Each stick's origin is wherever the thumb lands.
export class DualSticks {
  private left = newSide();
  private right = newSide();
  private cleanup: Array<() => void> = [];

  constructor(
    private el: HTMLElement,
    private cfg: () => InputCfg,
  ) {
    this.listen('pointerdown', (e) => this.down(e));
    this.listen('pointermove', (e) => this.move(e));
    this.listen('pointerup', (e) => this.up(e));
    this.listen('pointercancel', (e) => this.up(e));
    this.listen('lostpointercapture', (e) => this.up(e));
  }

  private listen(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture', fn: (e: PointerEvent) => void): void {
    const h = fn as EventListener;
    this.el.addEventListener(type, h, { passive: false });
    this.cleanup.push(() => this.el.removeEventListener(type, h));
  }

  private down(e: PointerEvent): void {
    const c = this.cfg();
    const rect = this.el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < c.edgeMarginPx || x > rect.width - c.edgeMarginPx) return;
    const side = x < rect.width * c.leftZoneFraction ? this.left : this.right;
    if (side.id !== null) return;
    side.id = e.pointerId;
    side.ox = side.cx = e.clientX;
    side.oy = side.cy = e.clientY;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* some browsers throw for synthetic pointers */
    }
    e.preventDefault();
  }

  private move(e: PointerEvent): void {
    const s = this.sideFor(e.pointerId);
    if (!s) return;
    s.cx = e.clientX;
    s.cy = e.clientY;
    e.preventDefault();
  }

  private up(e: PointerEvent): void {
    const s = this.sideFor(e.pointerId);
    if (s) s.id = null;
  }

  private sideFor(id: number): Side | null {
    if (this.left.id === id) return this.left;
    if (this.right.id === id) return this.right;
    return null;
  }

  private target(s: Side, radius: number, dead: number): [number, number] {
    if (s.id === null) return [0, 0];
    const x = (s.cx - s.ox) / radius;
    const y = -(s.cy - s.oy) / radius; // screen y grows downward
    const m = Math.hypot(x, y);
    if (m < 1e-9) return [0, 0];
    const clamped = Math.min(m, 1);
    const scaled = clamped < dead ? 0 : (clamped - dead) / (1 - dead);
    return [(x / m) * scaled, (y / m) * scaled];
  }

  // Called exactly once per physics tick.
  sample(): InputFrame {
    const c = this.cfg();
    const k = c.smoothing;
    const [lx, ly] = this.target(this.left, c.stickRadiusPx, c.deadZone);
    const [rx, ry] = this.target(this.right, c.stickRadiusPx, c.deadZone);
    this.left.sx = snap(this.left.sx * k + lx * (1 - k));
    this.left.sy = snap(this.left.sy * k + ly * (1 - k));
    this.right.sx = snap(this.right.sx * k + rx * (1 - k));
    this.right.sy = snap(this.right.sy * k + ry * (1 - k));
    return {
      lx: this.left.sx,
      ly: this.left.sy,
      la: this.left.id !== null ? 1 : 0,
      rx: this.right.sx,
      ry: this.right.sy,
      ra: this.right.id !== null ? 1 : 0,
    };
  }

  visual(): { left: StickVisual; right: StickVisual } {
    const r = this.cfg().stickRadiusPx;
    const v = (s: Side): StickVisual => ({ active: s.id !== null, ox: s.ox, oy: s.oy, cx: s.cx, cy: s.cy, radius: r });
    return { left: v(this.left), right: v(this.right) };
  }

  dispose(): void {
    for (const f of this.cleanup) f();
    this.cleanup = [];
  }
}

function snap(v: number): number {
  return Math.abs(v) < 1e-6 ? 0 : v;
}
