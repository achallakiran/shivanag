// Tiny generated sounds (no audio files, so nothing to download). Browsers only allow audio
// after a touch, so the context is created on the first tap.
export class Sound {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) this.ctx = new Ctor();
      }
      void this.ctx?.resume();
    } catch {
      this.ctx = null;
    }
  }

  beep(freq: number, seconds: number, volume = 0.15, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + seconds + 0.02);
    } catch {
      /* audio is optional */
    }
  }
}
