import { Engine } from '@babylonjs/core/Engines/engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { createStage, frame } from './voxel/stage';
import { createBatsman, type PoseData } from './voxel/rig';
import { lerpPose, STANCES } from './voxel/poses';
import { swingPose, SWING_TOTAL } from './game/swing';
import { Match, BALLS_PER_OVER } from './game/match';
import { FixedLoop } from './core/loop';
import { SwipeInput } from './input/swipe';
import { DEFAULT_CONFIG } from './config/defaults';
import { Sound } from './ui/sound';
import { CAMS, type V3 } from './game/cameras';
import { registerServiceWorker } from './pwa/register';

const OFFSET = 8.64; // sim z -> stage z (the batter stands at the stage origin)
let camIx = 0;
try {
  const saved = Number(localStorage.getItem('cam'));
  if (Number.isInteger(saved) && saved >= 0 && saved < CAMS.length) camIx = saved;
} catch { /* storage is optional */ }

function main(): void {
  const app = window.__APP__ ?? { version: 'dev', build: 'dev' };
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const engine = new Engine(canvas, true, { stencil: false, alpha: false, powerPreference: 'high-performance' }, false);
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
  window.addEventListener('resize', () => engine.resize());
  const stage = createStage(engine);
  const man = createBatsman(stage.scene, stage.voxelMat);
  const match = new Match();
  const sound = new Sound();

  // ball and its shadow
  const flat = (r: number, g: number, b: number) => {
    const m = new StandardMaterial('m', stage.scene);
    m.disableLighting = true;
    m.emissiveColor = new Color3(r, g, b);
    m.diffuseColor = new Color3(0, 0, 0);
    return m;
  };
  const ballMesh = CreateSphere('ball', { diameter: 0.24, segments: 8 }, stage.scene);
  ballMesh.material = flat(0.9, 0.1, 0.1);
  const shadow = CreateDisc('shadow', { radius: 0.12, tessellation: 12 }, stage.scene);
  shadow.rotation.x = Math.PI / 2;
  shadow.material = flat(0.08, 0.3, 0.12);
  ballMesh.isVisible = shadow.isVisible = false;

  // HUD
  const el = (css: string, parent: HTMLElement = ui) => {
    const d = document.createElement('div');
    d.style.cssText = css;
    parent.appendChild(d);
    return d;
  };
  const score = el('position:fixed;top:8px;left:50%;transform:translateX(-50%);color:#fff;font:700 20px system-ui;text-shadow:0 1px 4px #000;text-align:center;pointer-events:none');
  const big = el('position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);color:#fff;font:800 44px system-ui;text-shadow:0 2px 8px #000;text-align:center;pointer-events:none;white-space:nowrap');
  const small = el('position:fixed;top:calc(30% + 36px);left:50%;transform:translateX(-50%);color:#fff;font:600 16px system-ui;text-shadow:0 1px 4px #000;pointer-events:none;white-space:nowrap');
  const help = el('position:fixed;bottom:10px;left:50%;transform:translateX(-50%);color:#fffd;font:600 14px system-ui;text-shadow:0 1px 4px #000;pointer-events:none;text-align:center');
  help.textContent = 'Pick a shot, then swipe when the ball arrives. Swipe down = straight. Faster swipe = harder shot.';
  const ver = el('position:fixed;right:8px;bottom:6px;color:#fff9;font:11px ui-monospace,monospace;pointer-events:none');
  ver.textContent = `v${app.version} (${app.build})`;
  const again = document.createElement('button');
  again.textContent = 'Play again';
  again.style.cssText = 'position:fixed;top:55%;left:50%;transform:translateX(-50%);font:700 20px system-ui;padding:14px 26px;border-radius:12px;border:0;background:#2e7d32;color:#fff;display:none;z-index:6';
  again.onclick = () => match.restart();
  ui.appendChild(again);

  const col = el('position:fixed;left:8px;top:8px;display:flex;flex-direction:column;gap:6px;z-index:5');
  const buttons: HTMLButtonElement[] = STANCES.map((s, i) => {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.onclick = () => {
      sound.unlock();
      match.setStance(match.stance === i && i !== 0 ? 0 : i);
    };
    col.appendChild(b);
    return b;
  });
  const camBtn = document.createElement('button');
  camBtn.onclick = () => {
    camIx = (camIx + 1) % CAMS.length;
    try { localStorage.setItem('cam', String(camIx)); } catch { /* optional */ }
    const c = CAMS[camIx]!;
    camT = [...c.target];
    camFill = c.fill;
  };
  col.appendChild(camBtn);
  const paintButtons = () =>
    camBtn.textContent = `Camera: ${CAMS[camIx]!.name}`;
    camBtn.style.cssText = 'font:600 14px system-ui;padding:9px 12px;border-radius:10px;border:1px solid #fff6;color:#fff;background:#1565c0;text-align:left;min-width:132px';
    buttons.forEach((b, k) => {
      b.style.cssText = `font:600 14px system-ui;padding:9px 12px;border-radius:10px;border:1px solid #fff6;color:#fff;background:${k === match.stance ? '#2e7d32' : '#0008'};text-align:left;min-width:132px`;
    });

  // swipe input on the canvas
  const swipe = new SwipeInput(canvas, () => DEFAULT_CONFIG.input);
  canvas.addEventListener('pointerdown', () => sound.unlock());
  let seen = 0;

  let cur: PoseData = STANCES[0]!.pose;
  let camT: V3 = [...CAMS[camIx]!.target];
  let camFill = CAMS[camIx]!.fill;
  let hits = 0;

  const loop = new FixedLoop({
    stepHz: 240,
    maxStepsPerFrame: 12,
    step: () => {
      if (swipe.n !== seen) {
        seen = swipe.n;
        match.swipe(swipe.dx, swipe.dy, swipe.sp);
      }
      match.step(1 / 240);
      if (match.hitFlag !== hits) {
        hits = match.hitFlag;
        const g = match.swing?.result.grade;
        sound.beep(g === 'perfect' ? 900 : 600, 0.09, 0.25, 'square');
      }
    },
    render: () => undefined,
  });

  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    loop.advance(dt);

    // batsman
    const s = match.swing;
    const elapsed = s ? match.t - s.start : -1;
    const target = STANCES[0]!.pose; // always waiting in the backlift; the chosen shot is played during the swing
    if (s && elapsed < s.toContact + SWING_TOTAL) {
      cur = swingPose(s.stance, elapsed, s.toContact, -s.dir);
    } else {
      cur = lerpPose(cur, target, 1 - Math.exp(-dt * 10));
    }
    man.apply(cur);

    // ball
    const b = match.ball;
    const show = match.phase === 'cue' || ((match.phase === 'flight' || match.phase === 'result') && b.active === 1);
    ballMesh.isVisible = shadow.isVisible = show;
    if (show) {
      const pulse = match.phase === 'cue' ? 1 + 0.35 * Math.sin(match.t * 14) : 1;
      const [x, y, z] = match.phase === 'cue' ? [0, 2.15, 9.26] : [b.x, b.y, b.z];
      ballMesh.position.set(-x, y, z + OFFSET);
      ballMesh.scaling.setAll(pulse * CAMS[camIx]!.ball);
      shadow.scaling.setAll(CAMS[camIx]!.ball);
      shadow.position.set(-x, 0.03, z + OFFSET);
    }

    // camera: the chosen view, and a wider pan to follow a struck ball
    const cv = CAMS[camIx]!;
    const follow = b.hit === 1 && b.active === 1 && match.phase !== 'wait';
    const want: V3 = follow ? [-b.x, Math.max(0.5, b.y * 0.7), b.z + OFFSET] : cv.target;
    const k = 1 - Math.exp(-dt * (follow ? 4 : 3));
    camT = [camT[0] + (want[0] - camT[0]) * k, camT[1] + (want[1] - camT[1]) * k, camT[2] + (want[2] - camT[2]) * k];
    camFill += ((follow ? Math.min(cv.fill, 0.12) : cv.fill) - camFill) * k;
    if (cv.fov) {
      stage.cam.position.set(cv.pos[0], cv.pos[1], cv.pos[2]);
      stage.cam.setTarget(new Vector3(camT[0], camT[1], camT[2]));
      stage.cam.fov = (cv.fov * Math.PI) / 180;
    } else frame(stage.cam, cv.pos, camT, camFill);

    // HUD
    score.textContent = `${match.runs}/${match.wickets}   ball ${Math.min(match.index + (match.phase === 'wait' || match.phase === 'cue' ? 1 : 0), BALLS_PER_OVER)}/${BALLS_PER_OVER}   ${match.history.join(' ')}`;
    const age = match.t - match.messageAt;
    const op = match.phase === 'over' ? 1 : age < 1.6 ? 1 : Math.max(0, 1 - (age - 1.6) / 0.6);
    big.textContent = match.message;
    small.textContent = match.detail;
    big.style.opacity = small.style.opacity = String(op);
    again.style.display = match.phase === 'over' ? 'block' : 'none';
    help.style.display = match.index === 0 ? 'block' : 'none';
    paintButtons();
    stage.scene.render();
  });

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
