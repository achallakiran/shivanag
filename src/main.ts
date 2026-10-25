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
import { createSimState, hashSim, makeSimCfg, replayRecording, stepSim, type SimCfg } from './sim/sim';
import { PHASE_CUE, PHASE_FLIGHT } from './sim/machine';
import { Sound } from './ui/sound';
import { STANCE_NAMES } from './sim/stance';
import { shotText } from './ui/shotText';
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

  const world = createWorld(engine, cfg);
  // View options (camera, skeleton overlay, handedness) are remembered between sessions.
  const saveView = () => store.set('view', JSON.stringify(world.view()));
  try {
    const v = JSON.parse(store.get('view') ?? '{}') as Record<string, unknown>;
    world.setView({
      camera: typeof v.camera === 'number' ? v.camera : 0,
      skeleton: typeof v.skeleton === 'boolean' ? v.skeleton : true,
      rightHanded: typeof v.rightHanded === 'boolean' ? v.rightHanded : true,
      guide: typeof v.guide === 'boolean' ? v.guide : true,
    });
  } catch {
    /* bad saved value: keep defaults */
  }
  const simCfg: SimCfg = makeSimCfg(cfg, world.view().rightHanded);
  const sound = new Sound();
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  const sticks = new DualSticks(canvas, () => cfg.input);
  const recorder = new InputRecorder(cfg.sim.stepHz);
  const sim = createSimState(cfg.stance, simCfg.rightHanded);

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
      const replayed = hashSim(replayRecording(recorder.toRecording(), simCfg, ticks));
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
    cycleCamera() {
      world.setView({ camera: world.view().camera + 1 });
      saveView();
      return `Camera: ${world.cameraLabel()}`;
    },
    toggleGuide() {
      const on = !world.view().guide;
      world.setView({ guide: on });
      saveView();
      return on ? 'Aim guide shown' : 'Aim guide hidden';
    },
    toggleSkeleton() {
      const on = !world.view().skeleton;
      world.setView({ skeleton: on });
      saveView();
      return on ? 'Skeleton shown' : 'Skeleton hidden';
    },
    toggleHanded() {
      // The machine's line depends on handedness, so a change restarts the session cleanly.
      const rh = !world.view().rightHanded;
      world.setView({ rightHanded: rh });
      saveView();
      reload();
      return rh ? 'Right-handed. Reloading...' : 'Left-handed. Reloading...';
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
  let lastPhase = -1;
  let lastBounces = 0;
  const loop: FixedLoop = new FixedLoop({
    stepHz: cfg.sim.stepHz,
    maxStepsPerFrame: cfg.sim.maxStepsPerFrame,
    step: (tick, dt) => {
      const f = sticks.sample();
      recorder.push(tick, f);
      stepSim(sim, f, dt, simCfg);
    },
    render: (alpha) => {
      world.update(sim, alpha);
      world.scene.render();
      const m = sim.machine;
      if (m.phase !== lastPhase) {
        if (m.phase === PHASE_CUE) sound.beep(660, 0.12);
        if (m.phase === PHASE_FLIGHT) sound.beep(180, 0.09, 0.25, 'square');
        lastPhase = m.phase;
      }
      if (sim.ball.bounces !== lastBounces) {
        if (sim.ball.bounces > lastBounces) sound.beep(110, 0.07, 0.2, 'triangle');
        lastBounces = sim.ball.bounces;
      }
      if (m.phase === PHASE_CUE) overlay.setCue('BALL COMING', 'rgba(200,120,0,.85)');
      else if (m.phase === PHASE_FLIGHT && sim.ball.active) overlay.setCue('IN FLIGHT', 'rgba(150,30,30,.85)');
      else overlay.setCue('READY', 'rgba(0,0,0,.5)');
      const bl = sim.ball;
      if (m.count > 0) {
        const pitched = bl.bounces > 0 ? `${(bl.bz + 10.06).toFixed(1)} m` : '-';
        const atBat = bl.crossed ? `  at crease: ${(bl.crossSpeed * 3.6).toFixed(0)} km/h, height ${bl.crossY.toFixed(2)} m` : '';
        overlay.setInfo(`Ball ${m.count}: ${m.speedKmh.toFixed(0)} km/h, pitched ${pitched} from stumps${atBat}`);
      }
      const v = sticks.visual();
      overlay.setSticks(v.left, v.right);
      overlay.setDial(v.right, sim.swing.alpha, (simCfg.rightHanded ? 1 : -1) * (cfg.swing.direction >= 0 ? 1 : -1));
      overlay.setShot(shotText(sim.shot, cfg.bat.sweetSpot, cfg.bat.halfWidth));
      overlay.setGates(v.left, sim.stance.gate, STANCE_NAMES[sim.stance.gate]!, cfg.stance.gateRest);
      const now = performance.now();
      if (now - hudAt > 120) {
        hudAt = now;
        const online = navigator.onLine ? 'online' : 'offline';
        overlay.setHud(
          `v${app.version} (${app.build})  ${online}\nfps ${loop.fps.toFixed(0)}  steps/s ${loop.stepsPerSec.toFixed(0)}  tick ${loop.tick}\nstance ${STANCE_NAMES[sim.stance.gate]}  bat ${(sim.swing.alpha * 57.3).toFixed(0)} deg\nstate ${hashSim(sim)}`,
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
