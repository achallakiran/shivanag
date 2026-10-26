import type { GameConfig } from '../config/defaults';
import type { InputFrame } from './types';

type InputCfg = GameConfig['input'];

// One swipe = one swing. The swing starts the moment the finger has travelled `swipeMinPx`; its direction is the
// way the finger has gone so far, and its speed is how fast it got there, in screen heights per second.
// After that the rest of the touch is ignored, so one touch is one swing.
export class SwipeInput {
  n = 0;
  dx = 0;
  dy = 0;
  sp = 0;
  private id: number | null = null;
  private sx = 0;
  private sy = 0;
  private st = 0;
  private fired = false;
  private cleanup: Array<() => void> = [];
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;

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
    if (this.id !== null) return;
    this.id = e.pointerId;
    this.sx = this.lastX = e.clientX;
    this.sy = this.lastY = e.clientY;
    this.st = this.lastT = e.timeStamp;
    this.fired = false;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* some browsers throw for synthetic pointers */
    }
    e.preventDefault();
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    if (this.fired) return;
    const c = this.cfg();
    const dx = e.clientX - this.sx;
    const dy = e.clientY - this.sy;
    const dist = Math.hypot(dx, dy);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastT = e.timeStamp;
    if (dist < c.swipeMinPx) return;
    this.fire(dx, dy, dist, e.timeStamp - this.st);
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.id) return;
    // a very quick flick can end before a move event reports enough travel
    if (!this.fired) {
      const dx = e.clientX - this.sx;
      const dy = e.clientY - this.sy;
      const dist = Math.hypot(dx, dy);
      if (dist >= this.cfg().swipeMinPx * 0.6) this.fire(dx, dy, dist, e.timeStamp - this.st);
    }
    this.id = null;
  }

  private fire(dx: number, dy: number, dist: number, ms: number): void {
    this.fired = true;
    const h = Math.max(1, this.el.getBoundingClientRect().height);
    this.dx = dx / dist;
    this.dy = dy / dist;
    this.sp = dist / Math.max(12, ms) * 1000 / h;
    this.n++;
  }

  frame(sel: number): InputFrame {
    return { sel, n: this.n, dx: this.dx, dy: this.dy, sp: this.sp };
  }

  dispose(): void {
    for (const f of this.cleanup) f();
    this.cleanup = [];
  }
}
