import { Engine } from '@babylonjs/core/Engines/engine';
import { Store } from './core/storage';
import { FixedLoop } from './core/loop';
import {
  exportSettings,
  importSettings,
  loadConfig,
  mergeConfig,
  patchFromPath,
  resetConfig,
  saveConfig,
} from './config/config';
import { DualSticks } from './input/sticks';
import { InputRecorder } from './input/recorder';
import { createSimState, hashSim, replayRecording, stepSim } from './sim/sim';
import { createWorld } from './render/world';
import { Overlay } from './ui/overlay';
import { downloadText } from './ui/download';
import { registerServiceWorker, type PwaHandle } from './pwa/register';

function blockGestures(canvas: HTMLElement): void {
  // iOS Safari pinch/zoom gesture events, double-tap zoom, long-press menu.
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.target === canvas) e.preventDefault();
    },
    { passive: false },
  );
}

// Audit of everything the page has loaded from any other site. The game must
// work offline, so this should always read "none".
function externalRequests(): string {
  try {
    const hosts = new Set<string>();
    for (const e of performance.getEntriesByType('resource')) {
      const u = new URL(e.name, location.href);
      if (u.origin !== location.origin && (u.protocol === 'http:' || u.protocol === 'https:')) hosts.add(u.host);
    }
    return hosts.size === 0 ? 'none' : `${hosts.size} (${[...hosts].join(', ')})`;
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  const app = window.__APP__ ?? { version: 'dev', build: 'dev' };
  const store = new Store();
  let cfg = loadConfig(store);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  blockGestures(canvas);

  const engine = new Engine(canvas, true, { stencil: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }, false);
  const applyScale = () => engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, cfg.render.maxPixelRatio));
  applyScale();
  const resize = () => {
    applyScale();
    engine.resize();
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  const world = createWorld(engine);
  const sticks = new DualSticks(canvas, () => cfg.input);
  const recorder = new InputRecorder(cfg.sim.stepHz);
  const sim = createSimState();

  let persisted = 'unknown';
  try {
    const p = await navigator.storage?.persist?.();
    persisted = p === undefined ? 'unsupported' : p ? 'granted' : 'not granted';
  } catch {
    persisted = 'unsupported';
  }

  let pwa: PwaHandle | null = null;
  const reload = () => setTimeout(() => location.reload(), 200);

  const overlay: Overlay = new Overlay(ui, app, {
    async checkUpdate() {
      if (!pwa) return 'Offline install is not active (needs https).';
      await pwa.check();
      return 'Checked. If a newer build exists, an update banner appears.';
    },
    verifyReplay() {
      if (recorder.truncated) return 'Input log hit its size cap, so replay cannot be verified.';
      const ticks = loop.tick;
      const live = hashSim(sim);
      const replayed = hashSim(replayRecording(recorder.toRecording(), cfg.toy, ticks));
      return replayed === live
        ? `Replay matches: ${ticks} steps, state ${live}`
        : `MISMATCH after ${ticks} steps: live ${live}, replay ${replayed}`;
    },
    exportLog() {
      const rec = recorder.toRecording();
      downloadText(`voxel-cricket-input-${app.version}-${rec.ticks}.json`, JSON.stringify({ app, config: cfg, recording: rec }));
      return `Exported ${rec.frames.length} input changes over ${rec.ticks} steps.`;
    },
    exportSettings() {
      downloadText(`voxel-cricket-settings-${app.version}.json`, exportSettings(cfg));
      return 'Settings exported.';
    },
    importSettings(text) {
      try {
        cfg = importSettings(text);
        saveConfig(store, cfg);
        reload();
        return 'Settings imported. Reloading...';
      } catch (e) {
        return `Import failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    resetSettings() {
      resetConfig(store);
      reload();
      return 'Settings reset. Reloading...';
    },
    toggleHud() {
      cfg = mergeConfig(cfg, patchFromPath('debug.hud', !cfg.debug.hud));
      saveConfig(store, cfg);
      return cfg.debug.hud ? 'HUD on.' : 'HUD off.';
    },
    setSetting(path, value) {
      cfg = mergeConfig(cfg, patchFromPath(path, value));
      saveConfig(store, cfg);
      reload();
      return `${path} set. Reloading...`;
    },
    status() {
      const sw = pwa ? pwa.state() : 'not started';
      return {
        offline: sw === 'offline-ready' ? 'ready (works with no network)' : sw,
        storage: store.persistent ? 'saved on this device' : 'memory only (will not persist)',
        persisted,
        external: externalRequests(),
      };
    },
  }, () => cfg);

  if (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    pwa = registerServiceWorker({ onUpdateReady: (apply) => overlay.showUpdate(apply) });
  }

  let hudAt = 0;
  const loop: FixedLoop = new FixedLoop({
    stepHz: cfg.sim.stepHz,
    maxStepsPerFrame: cfg.sim.maxStepsPerFrame,
    step: (tick, dt) => {
      const f = sticks.sample();
      recorder.push(tick, f);
      stepSim(sim, f, dt, cfg.toy);
    },
    render: (alpha) => {
      world.update(sim, alpha);
      world.scene.render();
      const v = sticks.visual();
      overlay.setSticks(v.left, v.right);
      const now = performance.now();
      if (now - hudAt > 120) {
        hudAt = now;
        const online = navigator.onLine ? 'online' : 'offline';
        overlay.setHud(
          `v${app.version} (${app.build})  ${online}\nfps ${loop.fps.toFixed(0)}  steps/s ${loop.stepsPerSec.toFixed(0)}  tick ${loop.tick}\nsim (${sim.px.toFixed(2)}, ${sim.pz.toFixed(2)}) bat (${sim.bx.toFixed(2)}, ${sim.by.toFixed(2)})\nstate ${hashSim(sim)}`,
          cfg.debug.hud,
        );
      }
    },
  });
  loop.start();
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  if (window.__showError) window.__showError(`Startup failed: ${msg}`);
  else console.error(msg);
});
