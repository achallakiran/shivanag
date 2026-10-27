/* Shivanag — main: engine, lighting, post, quality tiers, input, HUD */
(function () { try {
  const canvas = document.getElementById('c'); window.__canvasEl = canvas;
  const engine = new B.Engine(canvas, true, { stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }, true);
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(.2, .14, .22, 1);
  scene.ambientColor = new B.Color3(.3, .3, .3);
  const ip = scene.imageProcessingConfiguration;
  ip.isEnabled = true; ip.toneMappingEnabled = true; ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = .95; ip.contrast = 1.15;

  // ---- sunset backdrop ----
  const bgTex = new B.DynamicTexture('bg', { width: 8, height: 256 }, scene, false);
  { const g = bgTex.getContext(); const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#3a2a58'); gr.addColorStop(.35, '#8a4a7a'); gr.addColorStop(.7, '#d9798a'); gr.addColorStop(1, '#f2b88a');
    g.fillStyle = gr; g.fillRect(0, 0, 8, 256); bgTex.update(); }
  const bg = new B.Layer('bg', null, scene, true); bg.texture = bgTex;

  // ---- world ----
  const level = buildLevel();

  // ---- lights ----
  const hemi = new B.HemisphericLight('hemi', new B.Vector3(.2, 1, .1), scene);
  hemi.diffuse = new B.Color3(.76, .8, .97); hemi.groundColor = new B.Color3(.56, .42, .42); hemi.specular = B.Color3.Black(); hemi.intensity = .55;
  const sun = new B.DirectionalLight('sun', new B.Vector3(-.75, -1, -.45).normalize(), scene);
  sun.diffuse = new B.Color3(1, .86, .66); sun.specular = new B.Color3(.3, .24, .18); sun.intensity = 1.5;
  sun.position = new B.Vector3(level.W / 2 + 40, 50, level.D / 2 + 25);
  sun.shadowMinZ = 1; sun.shadowMaxZ = 160;

  const bevel = makeBevelTexture(scene);
  const voxMat = new B.StandardMaterial('vox', scene);
  voxMat.diffuseTexture = bevel; voxMat.specularColor = new B.Color3(.05, .05, .05);
  voxMat.backFaceCulling = false; voxMat.maxSimultaneousLights = 8;
  // see-through blocks: opt-in (lazy plugin) so a GPU that dislikes the extra shader can never break startup
  const occ = { a: new B.Vector4(), b: new B.Vector4(), on: false, p: null };
  function setOcc(v) {
    try {
      if (v && !occ.p) occ.p = new OccPlugin(voxMat);
      if (occ.p) occ.p.on = v;
      occ.on = v && !!occ.p;
      if (occ.on) setTimeout(() => { // if the GPU rejects the shader, switch it back off instead of leaving blocks broken
        try { const ef = voxMat.getEffect && voxMat.getEffect(); if (ef && ef.getCompilationError && ef.getCompilationError()) { occ.p.on = false; occ.on = false; seeBtn.textContent = 'See-through: Unsupported'; } } catch (e) { }
      }, 1200);
    } catch (e) { occ.on = false; }
    seeBtn.textContent = 'See-through: ' + (occ.on ? 'On' : 'Off');
  }
  const props = buildProps(scene, level);
  const meshes = meshWorld(level.world, scene, voxMat, props.waterMat);
  meshes.solid.freezeWorldMatrix();

  // ---- snake + camera ----
  const snake = new Snake(scene, level.world, level.spawnCells, level.spawnTop, bevel);
  const guards = buildGuards(scene, level);
  const rig = new CamRig(scene, engine, { W: level.W, D: level.D }); rig.world = level.world;
  rig.setPreset(1);

  scene.materials.forEach(m => { if (m.maxSimultaneousLights !== undefined) m.maxSimultaneousLights = 8; });

  // ---- post: tilt-shift + grade + vignette ----
  B.Effect.ShadersStore['shivPostFragmentShader'] = `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 texelSize;
    uniform float tilt;
    uniform float vig;
    void main(void){
      vec2 uv = vUV;
      vec3 c = texture2D(textureSampler, uv).rgb;
      float d = abs(uv.y - 0.5);
      float amt = smoothstep(0.26, 0.7, d) * tilt;
      if (amt > 0.002) {
        vec3 acc = c; float wsum = 1.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float a = fi * 2.399963;
          float r = sqrt((fi + 0.5) / 12.0) * amt * 5.5;
          vec2 o = vec2(cos(a), sin(a)) * r * texelSize;
          acc += texture2D(textureSampler, uv + o).rgb; wsum += 1.0;
        }
        c = acc / wsum;
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.10);
      c *= vec3(1.03, 1.0, 0.965);
      float v = smoothstep(0.98, 0.32, length((uv - 0.5) * vec2(1.0, 1.12)));
      c *= mix(1.0, v, vig);
      gl_FragColor = vec4(c, 1.0);
    }`;
  const post = new B.PostProcess('shiv', 'shivPost', ['texelSize', 'tilt', 'vig'], null, 1.0, rig.cam, B.Texture.BILINEAR_SAMPLINGMODE, engine, false);
  const pp = { tilt: 1, vig: .55 };
  post.onApply = (eff) => { eff.setFloat2('texelSize', 1 / post.width, 1 / post.height); eff.setFloat('tilt', pp.tilt); eff.setFloat('vig', pp.vig); };

  // ---- quality tiers ----
  const state = { q: 2, sg: null };
  const casters = () => [meshes.solid, ...snake.meshes, ...guards.list.flatMap(g => g.meshes), ...props.casters, ...props.king.getChildMeshes()];
  function applyQuality(q) {
    state.q = q;
    const dpr = window.devicePixelRatio || 1, cap = [1, 1.5, 2][q];
    engine.setHardwareScalingLevel(1 / Math.min(dpr, cap));
    if (state.sg) { state.sg.dispose(); state.sg = null; }
    if (q >= 1) {
      const sg = new B.ShadowGenerator(q === 2 ? 2048 : 1024, sun);
      if (engine.webGLVersion > 1) { sg.usePercentageCloserFiltering = true; sg.filteringQuality = q === 2 ? B.ShadowGenerator.QUALITY_HIGH : B.ShadowGenerator.QUALITY_LOW; }
      else sg.usePoissonSampling = true;
      sg.bias = .0012; sg.normalBias = .02; sg.darkness = .15;
      casters().forEach(m => sg.addShadowCaster(m, false));
      state.sg = sg;
    }
    meshes.solid.receiveShadows = q >= 1;
    pp.tilt = q >= 2 ? 1 : 0; pp.vig = q >= 1 ? .55 : .3;
    try { post.samples = q >= 1 ? 4 : 1; } catch (e) { }
    props.lights.forEach(l => l.setEnabled(q >= 1));
    props.motes.emitRate = [4, 10, 16][q];
    qualBtn.textContent = 'Quality: ' + ['Low', 'Medium', 'High'][q];
    try { localStorage.setItem('shivanag.q', String(q)); } catch (e) { }
  }

  // ---- HUD ----
  const $ = (id) => document.getElementById(id);
  const qualBtn = $('qual'), camBtns = Array.from(document.querySelectorAll('#cams button'));
  function setCam(i) { rig.setPreset(i); camBtns.forEach((b, k) => b.classList.toggle('on', k === rig.preset)); }
  camBtns.forEach((b, i) => b.addEventListener('click', () => { setCam(i); b.blur(); }));
  $('rotL').addEventListener('click', (e) => { rig.rotate(-1); e.target.blur(); });
  $('rotR').addEventListener('click', (e) => { rig.rotate(1); e.target.blur(); });
  const seeBtn = $('see');
  seeBtn.addEventListener('click', (e) => { setOcc(!occ.on); e.target.blur(); });
  qualBtn.addEventListener('click', (e) => { applyQuality((state.q + 1) % 3); e.target.blur(); });
  setCam(1);

  // ---- input ----
  const KEYS = { ArrowUp: [0, 1], w: [0, 1], W: [0, 1], ArrowDown: [0, -1], s: [0, -1], S: [0, -1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] };
  const held = [];
  let joy = null;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (KEYS[e.key]) { e.preventDefault(); const i = held.indexOf(e.key); if (i >= 0) held.splice(i, 1); held.push(e.key); return; }
    if (e.key === 'q' || e.key === 'Q') rig.rotate(-1);
    else if (e.key === 'e' || e.key === 'E') rig.rotate(1);
    else if (e.key >= '1' && e.key <= '4') setCam(+e.key - 1);
    else if (e.key === 'g' || e.key === 'G') applyQuality((state.q + 1) % 3);
    else if (e.key === 'f' || e.key === 'F') $('fps').classList.toggle('hide');
    else if (e.key === 't' || e.key === 'T') setOcc(!occ.on);
    else if (e.key === 'h' || e.key === 'H') $('help').classList.toggle('hide');
  });
  addEventListener('keyup', (e) => { const i = held.indexOf(e.key); if (i >= 0) held.splice(i, 1); });
  addEventListener('blur', () => { held.length = 0; joy = null; $('joy').style.display = 'none'; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); rig.zoom = clamp(rig.zoom * Math.exp(e.deltaY * .0012), .6, 1.7); }, { passive: false });
  const joyEl = $('joy'), knob = $('knob');
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, ux: 0, uy: 0 };
    joyEl.style.display = 'block'; joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; knob.style.transform = 'translate(-50%,-50%)';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!joy || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const len = Math.hypot(dx, dy), R = 60;
    if (len > R) { joy.ox += dx / len * (len - R); joy.oy += dy / len * (len - R); dx = e.clientX - joy.ox; dy = e.clientY - joy.oy; joyEl.style.left = joy.ox + 'px'; joyEl.style.top = joy.oy + 'px'; }
    knob.style.transform = `translate(calc(-50% + ${dx * .6}px), calc(-50% + ${dy * .6}px))`;
    if (Math.hypot(dx, dy) > 22) { if (Math.abs(dx) > Math.abs(dy)) { joy.ux = Math.sign(dx); joy.uy = 0; } else { joy.ux = 0; joy.uy = -Math.sign(dy); } }
    else { joy.ux = 0; joy.uy = 0; }
  });
  const endJoy = (e) => { if (joy && e.pointerId === joy.id) { joy = null; joyEl.style.display = 'none'; } };
  canvas.addEventListener('pointerup', endJoy); canvas.addEventListener('pointercancel', endJoy);

  function inputVec() {
    if (held.length) return KEYS[held[held.length - 1]];
    if (joy && (joy.ux || joy.uy)) return [joy.ux, joy.uy];
    return null;
  }


  // ---- HUD: hearts, guard awareness badges, hit flash, banner ----
  const hud = document.createElement('div'); hud.id = 'hud';
  hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;overflow:hidden';
  hud.innerHTML = '<div id="hearts" style="position:absolute;top:calc(10px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;gap:6px;font-size:30px;line-height:1;text-shadow:0 2px 6px rgba(0,0,0,.5)"></div>' +
    '<div id="flash" style="position:absolute;inset:0;background:radial-gradient(circle,rgba(255,240,200,0) 40%,rgba(255,80,60,.55));opacity:0;transition:opacity .35s"></div>' +
    '<div id="barT" style="position:absolute;left:0;right:0;top:0;height:0;background:#000"></div><div id="barB" style="position:absolute;left:0;right:0;bottom:0;height:0;background:#000"></div>' +
    '<style>@keyframes nw{0%,100%{transform:scale(1)}50%{transform:scale(1.28)}}.nw{width:46px;height:46px;margin:0 auto;border-radius:50%;background:#e5252a;border:3px solid #fff;box-shadow:0 0 18px 6px rgba(255,60,50,.9);animation:nw .28s infinite;display:flex;align-items:center;justify-content:center}.nw b{font:900 30px system-ui;color:#fff}.nt{font:900 13px system-ui;letter-spacing:.08em;color:#fff;background:#e5252a;border-radius:8px;padding:1px 7px;margin-top:3px}@keyframes zz{0%{transform:translate(0,6px) scale(.45) rotate(-8deg);opacity:0}18%{opacity:1}100%{transform:translate(26px,-40px) scale(1.2) rotate(10deg);opacity:0}}.zz{position:relative;width:46px;height:34px;margin:0 auto}.zz i{position:absolute;left:4px;bottom:0;font:italic 900 22px "Trebuchet MS",system-ui;color:#eef5ff;-webkit-text-stroke:1.5px #4a78c8;paint-order:stroke fill;text-shadow:0 0 8px rgba(120,170,255,.9),0 2px 3px rgba(0,0,0,.4);opacity:0;animation:zz 2.1s ease-out infinite}.zz i:nth-child(2){animation-delay:.7s;font-size:17px}.zz i:nth-child(3){animation-delay:1.4s;font-size:13px}</style>' +
    '<div id="slowfx" style="position:absolute;inset:0;background:radial-gradient(circle,rgba(120,180,255,0) 35%,rgba(90,150,255,.45));opacity:0;transition:opacity .3s"></div>' +
    '<div id="combat" style="position:absolute;right:calc(14px + env(safe-area-inset-right));bottom:calc(84px + env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:14px;pointer-events:none">' +
    '<button id="btnA" style="pointer-events:auto;touch-action:none;width:88px;height:88px;border-radius:50%;border:3px solid rgba(255,255,255,.7);background:#c8452b;color:#fff;font:800 15px system-ui;letter-spacing:.04em;box-shadow:0 4px 14px rgba(0,0,0,.4);opacity:.45;transition:opacity .15s,transform .1s">BITE</button>' +
    '<div id="escWrap" style="position:relative;width:80px;height:80px;border-radius:50%;padding:5px;background:conic-gradient(#7fd0ff 0deg,rgba(255,255,255,.2) 0deg)"><button id="btnE" style="pointer-events:auto;touch-action:none;width:100%;height:100%;border-radius:50%;border:2px solid rgba(255,255,255,.6);background:#2c5fa8;color:#fff;font:800 13px system-ui;letter-spacing:.04em;box-shadow:0 4px 14px rgba(0,0,0,.4)">ESCAPE</button></div></div>' +
    '<div id="banner" style="position:absolute;left:0;right:0;top:34%;text-align:center;font:800 clamp(26px,7vw,48px) system-ui;letter-spacing:.08em;color:#fff;text-shadow:0 3px 14px rgba(0,0,0,.6);opacity:0;transition:opacity .4s"></div>';
  document.body.appendChild(hud);
  const barT = hud.querySelector('#barT'), barB = hud.querySelector('#barB'), slowEl = hud.querySelector('#slowfx'), btnA = hud.querySelector('#btnA'), btnE = hud.querySelector('#btnE'), escWrap = hud.querySelector('#escWrap'), heartsEl = hud.querySelector('#hearts'), flashEl = hud.querySelector('#flash'), bannerEl = hud.querySelector('#banner');
  function drawHearts(n, shake) {
    heartsEl.innerHTML = [0, 1, 2].map(i => `<span style="color:${i < n ? '#f4c542' : 'rgba(255,255,255,.25)'};${shake && i === n ? 'transform:scale(1.4)' : ''}">&#9829;</span>`).join('');
  }
  drawHearts(3);
  const badges = guards.list.map(() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-align:center;font:800 26px system-ui;text-shadow:0 2px 5px rgba(0,0,0,.6);display:none'; d.innerHTML = '<div class="ic"></div><div style="width:46px;height:6px;border-radius:3px;background:rgba(0,0,0,.45);overflow:hidden;margin:2px auto 0"><div class="mt" style="height:100%;width:0;background:#ffc83d"></div></div>'; hud.appendChild(d); return d; });
  let bannerT = 0, hitBlink = 0, restartT = 0;
  const proj = (x, y, z) => { const v = B.Vector3.Project(new B.Vector3(x, y, z), B.Matrix.Identity(), scene.getTransformMatrix(), rig.cam.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())); return [v.x / engine.getRenderWidth() * innerWidth, v.y / engine.getRenderHeight() * innerHeight, v.z]; };
  function showBanner(t, sec) { bannerEl.textContent = t; bannerEl.style.opacity = 1; bannerT = sec; }
  const press = (el, fn) => { el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); el.style.transform = 'scale(.92)'; }); const up = () => el.style.transform = ''; el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); };
  const doAttack = () => { if (restartT <= 0) guards.attack(snake); };
  const doEscape = () => { if (restartT <= 0) { const r = guards.escape(snake); if (r === 'slow') showBanner('SLOW MOTION', .9); } };
  press(btnA, doAttack); press(btnE, doEscape);
  addEventListener('keydown', (e) => { if (e.repeat) return; if (e.code === 'Space') { e.preventDefault(); doAttack(); } else if (e.key === 'x' || e.key === 'X') doEscape(); });
  function resetStage() { snake.speedMul = 1; snake.reset(level.spawnCells, level.spawnTop); guards.reset(); drawHearts(3); showBanner('TRY AGAIN', 1.6); }
  function hudUpdate(dt) {
    for (const e of guards.events.splice(0)) {
      if (e.t === 'hit') { drawHearts(e.hearts, true); flashEl.style.opacity = 1; setTimeout(() => flashEl.style.opacity = 0, 160); hitBlink = 1.2; }
      if (e.t === 'lost') { showBanner('LOST A LIFE', 2.2); restartT = 2.2; }
      if (e.t === 'shout') showBanner('GUARDS ALERTED!', .9);
      if (e.t === 'counter') showBanner('COUNTER!', 1.1);
      if (e.t === 'dodge') showBanner('DODGE!', .6);
      if (e.t === 'shot') rig.startShot(e.x, e.y, e.z, e.dx, e.dz, 1.5);
    }
    if (restartT > 0) { restartT -= dt; if (restartT <= 0) resetStage(); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.style.opacity = 0; }
    if (hitBlink > 0) { hitBlink -= dt; const vis = Math.floor(hitBlink * 12) % 2 === 0 || hitBlink <= 0; for (const m of snake.meshes) m.isVisible = vis; if (hitBlink <= 0) for (const m of snake.meshes) m.isVisible = true; }
    slowEl.style.opacity = guards.slow > 0 ? 1 : 0;
    barT.style.height = barB.style.height = (rig.shotW * 11).toFixed(2) + '%';
    btnA.style.opacity = 1; btnA.style.boxShadow = guards.bite ? '0 0 22px 6px rgba(255,200,80,.8)' : '0 4px 14px rgba(0,0,0,.4)';
    { const full = guards.meter >= 1, deg = (guards.slow > 0 ? guards.slow / 3 : guards.meter) * 360;
      escWrap.style.background = `conic-gradient(${full || guards.slow > 0 ? '#ffe27a' : '#7fd0ff'} ${deg}deg, rgba(255,255,255,.2) ${deg}deg)`;
      btnE.style.background = guards.window ? '#e23b3b' : '#2c5fa8'; btnE.style.boxShadow = guards.window ? '0 0 26px 8px rgba(255,80,60,.9)' : full ? '0 0 20px 5px rgba(255,226,122,.8)' : '0 4px 14px rgba(0,0,0,.4)';
      btnE.style.opacity = 1; }
    guards.list.forEach((g, i) => {
      const b = badges[i], show = g.state === 'asleep' || g.aw > .03 || g.state === 'alert' || g.state === 'search';
      if (!show) { b.style.display = 'none'; return; }
      const p = proj(g.pos.x, g.pos.y + 3.9, g.pos.z); if (p[2] > 1 || p[2] < 0) { b.style.display = 'none'; return; }
      b.style.display = 'block'; b.style.left = p[0] + 'px'; b.style.top = p[1] + 'px';
      const ik = g.state === 'asleep' ? 'z' : guards.windowG === g ? 'n' : g.state === 'alert' ? 'a' : g.state === 'search' || g.state === 'susp' ? 'q' : ''; if (b._k !== ik) { b._k = ik; b.querySelector('.ic').innerHTML = { z: '<div class="zz"><i>Z</i><i>z</i><i>z</i></div>', a: '<span style="color:#ff7a3a;font-size:19px">!</span>', n: '<div class="nw"><b>!</b></div><div class="nt">ESCAPE!</div>', q: '<span style="color:#ffc83d">?</span>', '': '' }[ik]; }
      const mt = b.querySelector('.mt'); const sl = g.state === 'asleep'; mt.style.width = Math.round((sl ? g.sleepLeft : Math.min(1, g.aw)) * 100) + '%'; mt.style.background = sl ? '#6fa8ff' : g.aw >= 1 ? '#ff4b3a' : '#ffc83d';
    });
  }

  // ---- main loop ----
  let time = 0, frames = 0, autoChecked = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(.05, engine.getDeltaTime() / 1000);
    time += dt;
    const v = inputVec();
    snake.wish = v && restartT <= 0 ? rig.worldDir(v[0], v[1]) : null;
    const ts = guards.tick(dt, snake);
    snake.update(dt * guards.snakeScale, time);
    rig.update(dt, snake.head, snake.moving || !!snake.wish);
    props.update(time);
    if (restartT <= 0) guards.update(dt * ts, time, snake); hudUpdate(dt);
    { const h = snake.head, q = snake.seg[2].position; if (occ.p) { occ.p.a.set(h.x, h.y + .4, h.z, 1.35); occ.p.b.set(q.x, q.y, q.z, 1.35); } }
    scene.render();
    if (++frames % 20 === 0) $('fps').textContent = engine.getFps().toFixed(0) + ' fps';
    // auto-downgrade on slow devices (once per few seconds, never below Low)
    if (time - autoChecked > 4 && time > 4 && !window.__noAuto) {
      autoChecked = time;
      if (engine.getFps() < 32 && state.q > 0) applyQuality(state.q - 1);
    }
  });
  addEventListener('resize', () => engine.resize());

  // initial quality: remembered, else by device
  let q0 = 2;
  try { const s = localStorage.getItem('shivanag.q'); if (s !== null) q0 = +s; else if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) q0 = 1; } catch (e) { }
  applyQuality(q0);

  // title card
  setTimeout(() => { if (!window.__failed) $('title').classList.add('gone'); }, 3200);
  $('title').addEventListener('click', () => $('title').classList.add('gone'));
  window.__game = { resetStage, guards, occ, scene, engine, snake, rig, level, applyQuality, setCam, state, meshes, props, post };
  window.__ready = true;
} catch (err) { window.__showErr && window.__showErr((err && err.message) || String(err)); console.error(err); } })();
