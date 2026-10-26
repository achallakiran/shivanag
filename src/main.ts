import { Engine } from '@babylonjs/core/Engines/engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createStage, frame } from './voxel/stage';
import { createBatsman, type PoseData } from './voxel/rig';
import { lerpPose, READY_GROUNDED, STANCES } from './voxel/poses';
import { registerServiceWorker } from './pwa/register';

// Phase 1 viewer: the voxel batsman in each stance. Tap a stance to blend into it; drag to look around.
const CAMERAS = [
  { name: 'Bowler end', pos: [0.1, 1.7, 9] as [number, number, number], fill: 0.8 },
  { name: 'Side', pos: [-6, 1.2, 0] as [number, number, number], fill: 0.8 },
  { name: 'Behind', pos: [0, 1.6, -6] as [number, number, number], fill: 0.8 },
  { name: 'Three-quarter', pos: [-3.5, 1.5, 4.5] as [number, number, number], fill: 0.8 },
];

function main(): void {
  const app = window.__APP__ ?? { version: 'dev', build: 'dev' };
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const engine = new Engine(canvas, true, { stencil: false, alpha: false, powerPreference: 'high-performance' }, false);
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
  window.addEventListener('resize', () => engine.resize());
  const stage = createStage(engine);
  const man = createBatsman(stage.scene, stage.voxelMat);

  let from: PoseData = READY_GROUNDED;
  let to: PoseData = STANCES[0]!.pose;
  let t = 1;
  let grounded = false; // Ready with the bat on the ground
  let selected = 0;
  let camIx = 0;
  let orbit = 0; // radians around the batsman, from dragging
  let lift = 0;
  const target: [number, number, number] = [0, 0.85, 0];
  const place = () => {
    const c = CAMERAS[camIx]!;
    const base = new Vector3(c.pos[0] - target[0], 0, c.pos[2] - target[2]);
    const r = Math.hypot(base.x, base.z);
    const a = Math.atan2(base.x, base.z) + orbit;
    frame(stage.cam, [target[0] + Math.sin(a) * r, c.pos[1] + lift, target[2] + Math.cos(a) * r], target, c.fill);
  };

  const row = document.createElement('div');
  row.style.cssText = 'position:fixed;left:8px;top:8px;display:flex;flex-direction:column;gap:6px;z-index:5';
  const style = (b: HTMLElement, on: boolean) => {
    b.style.cssText = `font:600 14px system-ui;padding:9px 12px;border-radius:10px;border:1px solid #fff6;color:#fff;background:${on ? '#2e7d32' : '#0008'};text-align:left;min-width:128px`;
  };
  const buttons: HTMLButtonElement[] = [];
  const choose = (i: number) => {
    if (i === selected && i === 0) grounded = !grounded;
    selected = i;
    from = lastPose;
    to = i === 0 && grounded ? READY_GROUNDED : STANCES[i]!.pose;
    t = 0;
    buttons.forEach((b, k) => {
      style(b, k === i);
      b.textContent = k === 0 ? (grounded && i === 0 ? 'Ready (bat down)' : 'Ready (bat up)') : STANCES[k]!.name;
    });
  };
  STANCES.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.onclick = () => choose(i);
    buttons.push(b);
    row.appendChild(b);
  });
  const cam = document.createElement('button');
  style(cam, false);
  cam.textContent = `Camera: ${CAMERAS[0]!.name}`;
  cam.onclick = () => {
    camIx = (camIx + 1) % CAMERAS.length;
    orbit = 0;
    cam.textContent = `Camera: ${CAMERAS[camIx]!.name}`;
  };
  row.appendChild(cam);
  ui.appendChild(row);
  const ver = document.createElement('div');
  ver.style.cssText = 'position:fixed;right:8px;bottom:6px;color:#fff9;font:11px ui-monospace,monospace';
  ver.textContent = `v${app.version} (${app.build}) - pose viewer`;
  ui.appendChild(ver);

  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit -= (e.clientX - drag.x) * 0.008;
    lift = Math.max(-0.8, Math.min(2, lift - (e.clientY - drag.y) * 0.01));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', () => { drag = null; });

  let lastPose = to;
  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t = Math.min(1, t + dt / 0.4);
    const k = t * t * (3 - 2 * t);
    lastPose = lerpPose(from, to, k);
    man.apply(lastPose);
    place();
    stage.scene.render();
  });
  choose(0);
  registerServiceWorker({
    onUpdateReady: (apply) => {
      const b = document.createElement('button');
      b.textContent = 'New version ready: tap to update';
      b.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);font:600 14px system-ui;padding:10px 14px;border-radius:10px;border:0;background:#f9a825;color:#000;z-index:9';
      b.onclick = () => apply();
      ui.appendChild(b);
    },
  });
}

main();
