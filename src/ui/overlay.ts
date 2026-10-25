import type { GameConfig } from '../config/defaults';
import { numericSettings } from '../config/config';

export interface MenuActions {
  checkUpdate(): Promise<string>;
  verifyReplay(): string;
  exportLog(): string;
  exportSettings(): string;
  importSettings(text: string): Promise<string> | string;
  resetSettings(): string;
  toggleHud(): string;
  cycleCamera(): string;
  toggleSkeleton(): string;
  toggleGuide(): string;
  playerSize(dir: number): string;
  toggleHanded(): string;
  setSetting(path: string, value: number): string;
  status(): { offline: string; storage: string; persisted: string; external: string };
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

const BTN =
  'font:600 14px -apple-system,system-ui,sans-serif;color:#0d1f16;background:#bfe8cc;border:0;border-radius:8px;padding:10px 12px;margin:4px 4px 4px 0;';

export class Overlay {
  private hud = h(
    'pre',
    'position:absolute;left:calc(env(safe-area-inset-left) + 8px);top:calc(env(safe-area-inset-top) + 6px);margin:0;padding:4px 6px;font:11px/1.35 ui-monospace,Menlo,monospace;color:#bfe8cc;background:rgba(0,0,0,.35);border-radius:6px;white-space:pre;',
  );
  private panel = h(
    'div',
    'display:none;position:absolute;right:calc(env(safe-area-inset-right) + 8px);top:calc(env(safe-area-inset-top) + 48px);width:min(92vw,520px);max-height:calc(100% - env(safe-area-inset-top) - 64px);overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;pointer-events:auto;box-sizing:border-box;padding:12px;border-radius:12px;background:rgba(10,25,18,.95);color:#e8f3ec;font:14px/1.4 -apple-system,system-ui,sans-serif;',
  );
  private banner = h(
    'div',
    'display:none;position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 14px);pointer-events:auto;padding:8px 12px;border-radius:10px;background:#f2d27a;color:#222;font:600 14px -apple-system,system-ui,sans-serif;',
  );
  private rotate = h(
    'div',
    'display:none;position:absolute;left:0;right:0;top:50%;text-align:center;padding:10px;color:#fff;background:rgba(0,0,0,.55);font:600 16px -apple-system,system-ui,sans-serif;',
    'Rotate your phone to landscape',
  );
  private toastBox = h(
    'div',
    'display:none;position:absolute;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top) + 52px);padding:6px 12px;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font:600 14px -apple-system,system-ui,sans-serif;white-space:nowrap;',
  );
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private cue = h(
    'div',
    'position:absolute;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top) + 8px);padding:5px 14px;border-radius:14px;background:rgba(0,0,0,.5);color:#fff;font:700 14px -apple-system,system-ui,sans-serif;letter-spacing:.04em;white-space:nowrap;',
    'READY',
  );
  private info = h(
    'div',
    'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 8px);padding:4px 10px;border-radius:8px;background:rgba(0,0,0,.45);color:#e8f3ec;font:12px ui-monospace,Menlo,monospace;white-space:pre;text-align:center;',
  );
  private stanceLabel = h(
    'div',
    'position:absolute;left:calc(env(safe-area-inset-left) + 10px);bottom:calc(env(safe-area-inset-bottom) + 8px);padding:3px 9px;border-radius:8px;background:rgba(0,0,0,.45);color:#e8f3ec;font:600 13px -apple-system,system-ui,sans-serif;',
    'Ready',
  );
  private buttons: HTMLButtonElement[] = [];
  private onSelect: (i: number) => void = () => {};
  private shotCard = h(
    'div',
    'display:none;position:absolute;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top) + 44px);max-width:80vw;padding:8px 14px;border-radius:12px;background:rgba(10,25,18,.82);color:#fff;font:600 15px/1.35 -apple-system,system-ui,sans-serif;text-align:center;white-space:pre-line;',
  );
  private fileInput = h('input');
  private result = h('div', 'margin:6px 0;color:#f2d27a;white-space:pre-wrap;min-height:1.4em;');
  private open = false;

  constructor(
    private root: HTMLElement,
    private app: { version: string; build: string },
    private actions: MenuActions,
    private getCfg: () => GameConfig,
  ) {
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;';
    const menuBtn = h('button', BTN + 'position:absolute;right:calc(env(safe-area-inset-right) + 8px);top:calc(env(safe-area-inset-top) + 6px);pointer-events:auto;margin:0;', 'Menu');
    menuBtn.addEventListener('click', () => this.toggle());
    const camBtn = h('button', BTN + 'position:absolute;right:calc(env(safe-area-inset-right) + 80px);top:calc(env(safe-area-inset-top) + 6px);pointer-events:auto;margin:0;', 'Camera');
    camBtn.addEventListener('click', () => this.toast(this.actions.cycleCamera()));
    const skelBtn = h('button', BTN + 'position:absolute;right:calc(env(safe-area-inset-right) + 168px);top:calc(env(safe-area-inset-top) + 6px);pointer-events:auto;margin:0;', 'Skeleton');
    skelBtn.addEventListener('click', () => this.toast(this.actions.toggleSkeleton()));
    this.fileInput.type = 'file';
    this.fileInput.accept = 'application/json,.json';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', async () => {
      const f = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (!f) return;
      this.say(await this.actions.importSettings(await f.text()));
    });
    root.append(this.hud, this.cue, this.shotCard, this.info, this.stanceLabel, this.rotate, skelBtn, camBtn, menuBtn, this.toastBox, this.panel, this.banner, this.fileInput);
    const onResize = () => {
      this.rotate.style.display = window.innerHeight > window.innerWidth ? 'block' : 'none';
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    onResize();
  }

  setCue(text: string, color: string): void {
    if (this.cue.textContent !== text) this.cue.textContent = text;
    this.cue.style.background = color;
  }

  setInfo(text: string): void {
    if (this.info.textContent !== text) this.info.textContent = text;
    this.info.style.display = text ? 'block' : 'none';
  }

  setHud(text: string, visible: boolean): void {
    this.hud.style.display = visible ? 'block' : 'none';
    if (visible) this.hud.textContent = text;
  }

  // Stance buttons down the left edge. Tap one to choose that stance; tap it again to go back to Ready.
  // The choice can change at any time until the swing starts.
  buildStanceButtons(labels: readonly string[], onSelect: (i: number) => void): void {
    this.onSelect = onSelect;
    const col = h('div', 'position:absolute;left:calc(env(safe-area-inset-left) + 10px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px;pointer-events:none;');
    labels.forEach((t, i) => {
      if (i === 0) return; // Ready has no button
      const b = h('button', 'pointer-events:auto;touch-action:none;width:112px;height:50px;border-radius:12px;border:2px solid rgba(255,255,255,.4);background:rgba(0,0,0,.45);color:#fff;font:700 13px/1.1 -apple-system,system-ui,sans-serif;padding:2px 6px;', t);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.onSelect(i);
      });
      this.buttons[i] = b;
      col.append(b);
    });
    this.root.append(col);
  }

  setStance(sel: number, current: number, name: string): void {
    if (this.stanceLabel.textContent !== name) this.stanceLabel.textContent = name;
    this.buttons.forEach((b, i) => {
      if (!b) return;
      const on = i === sel;
      b.style.background = on ? 'rgba(242,210,122,.95)' : 'rgba(0,0,0,.45)';
      b.style.color = on ? '#222' : '#fff';
      b.style.borderColor = on ? '#fff' : i === current ? 'rgba(242,210,122,.9)' : 'rgba(255,255,255,.4)';
    });
  }

  setShot(text: string): void {
    this.shotCard.style.display = text ? 'block' : 'none';
    if (this.shotCard.textContent !== text) this.shotCard.textContent = text;
  }

  showUpdate(apply: () => void): void {
    this.banner.textContent = '';
    const t = h('span', '', 'Update available ');
    const b = h('button', BTN + 'margin:0 0 0 6px;padding:6px 10px;', 'Reload');
    b.addEventListener('click', () => apply());
    this.banner.append(t, b);
    this.banner.style.display = 'block';
  }

  private toast(msg: string): void {
    this.toastBox.textContent = msg;
    this.toastBox.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastBox.style.display = 'none'), 1800);
  }

  private say(msg: string): void {
    this.result.textContent = msg;
  }

  private toggle(): void {
    this.open = !this.open;
    this.panel.style.display = this.open ? 'block' : 'none';
    if (this.open) this.build();
  }

  private button(label: string, fn: () => Promise<string> | string | void): HTMLButtonElement {
    const b = h('button', BTN, label);
    b.addEventListener('click', async () => {
      const r = await fn();
      if (typeof r === 'string') this.say(r);
    });
    return b;
  }

  private build(): void {
    const p = this.panel;
    p.textContent = '';
    const st = this.actions.status();
    p.append(
      h('div', 'font-weight:700;font-size:16px;', `Voxel Cricket v${this.app.version} (build ${this.app.build})`),
      h('div', 'opacity:.8;margin:4px 0 8px;', `Offline: ${st.offline}\nSettings storage: ${st.storage}\nPersistent storage: ${st.persisted}\nRequests to other sites: ${st.external}`),
    );
    (p.lastChild as HTMLElement).style.whiteSpace = 'pre-line';
    const row = h('div');
    row.append(
      this.button('Check for update', () => this.actions.checkUpdate()),
      this.button('Verify replay', () => this.actions.verifyReplay()),
      this.button('Export input log', () => this.actions.exportLog()),
      this.button('Export settings', () => this.actions.exportSettings()),
      this.button('Import settings', () => this.fileInput.click()),
      this.button('Toggle HUD', () => this.actions.toggleHud()),
      this.button('Camera', () => this.actions.cycleCamera()),
      this.button('Skeleton on/off', () => this.actions.toggleSkeleton()),
      this.button('Aim guide on/off', () => this.actions.toggleGuide()),
      this.button('Player bigger', () => this.actions.playerSize(1)),
      this.button('Player smaller', () => this.actions.playerSize(-1)),
      this.button('Right/left-handed', () => this.actions.toggleHanded()),
      this.button('Reset settings', () => this.actions.resetSettings()),
      this.button('Close', () => this.toggle()),
    );
    p.append(row, this.result, h('div', 'font-weight:700;margin-top:8px;', 'Tuning (changing a value reloads the game)'));
    for (const s of numericSettings(this.getCfg())) {
      const line = h('label', 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;');
      line.append(h('span', 'font:12px ui-monospace,Menlo,monospace;', s.path));
      const input = h('input', 'width:90px;font:14px ui-monospace,Menlo,monospace;padding:6px;border-radius:6px;border:1px solid #567;background:#0d1f16;color:#e8f3ec;');
      input.type = 'number';
      input.inputMode = 'decimal';
      input.step = 'any';
      if (s.min !== undefined) input.min = String(s.min);
      if (s.max !== undefined) input.max = String(s.max);
      input.value = String(s.value);
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (Number.isFinite(v)) this.say(this.actions.setSetting(s.path, v));
      });
      line.append(input);
      p.append(line);
    }
  }
}
