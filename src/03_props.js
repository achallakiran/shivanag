/* Shivanag — props: torches, shivalinga details, king, water, particles, halos (M1) */
function makeHaloTexture(scene) {
  const S = 128;
  const t = new B.DynamicTexture('halo', S, scene, true);
  const g = t.getContext();
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(.6, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.clearRect(0, 0, S, S); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  t.hasAlpha = true; t.update(true);
  return t;
}

function makeHalo(scene, tex, size, color, alpha) {
  const p = B.MeshBuilder.CreatePlane('halo', { size }, scene);
  p.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
  const m = new B.StandardMaterial('haloMat', scene);
  m.diffuseColor = B.Color3.Black(); m.specularColor = B.Color3.Black();
  m.emissiveTexture = tex; m.opacityTexture = tex;
  m.emissiveColor = color; m.disableLighting = true;
  m.alphaMode = B.Engine.ALPHA_ADD; m.backFaceCulling = false; m.disableDepthWrite = true;
  m.alpha = alpha;
  p.material = m; p.isPickable = false; p.alphaIndex = 20;
  return p;
}

function buildProps(scene, L) {
  const P = { flames: [], lights: [], casters: [], waterMat: null, kingLight: null };
  const haloTex = makeHaloTexture(scene);
  P.haloTex = haloTex;
  const std = (hexcol, spec) => {
    const m = new B.StandardMaterial('m', scene);
    m.diffuseColor = col3(hexcol); const s = spec || .08; m.specularColor = new B.Color3(s, s, s);
    return m;
  };
  const emis = (hexcol) => {
    const m = new B.StandardMaterial('e', scene);
    m.diffuseColor = B.Color3.Black(); m.emissiveColor = col3(hexcol); m.disableLighting = true; return m;
  };

  // ---- torches ----
  const flameMat = emis(0xff9a2e), coreMat = emis(0xffe27a);
  for (const t of L.torches) {
    const outer = B.MeshBuilder.CreateSphere('flame', { diameter: 1, segments: 8 }, scene);
    outer.scaling.set(.26, .44, .26); outer.position.set(t.x, 4.38, t.z); outer.material = flameMat;
    const core = B.MeshBuilder.CreateSphere('core', { diameter: 1, segments: 6 }, scene);
    core.scaling.set(.13, .24, .13); core.position.set(t.x, 4.32, t.z); core.material = coreMat;
    const halo = makeHalo(scene, haloTex, 3.4, new B.Color3(1, .62, .26), .9);
    halo.position.set(t.x, 4.45, t.z);
    let light = null;
    if (t.light) {
      light = new B.PointLight('torch', new B.Vector3(t.x, 4.8, t.z), scene);
      light.diffuse = new B.Color3(1, .62, .27); light.specular = B.Color3.Black();
      light.intensity = 1.5; light.range = 9;
      P.lights.push(light);
    }
    P.flames.push({ outer, core, halo, light, ph: Math.random() * 10, baseI: 1.5 });
    P.casters.push(outer);
  }

  // ---- shivalinga details: rounded top + tripundra ash stripes + glow ----
  const lg = L.linga;
  const lingaMat = std(0x45424f, .25); lingaMat.specularPower = 24;
  const dome = B.MeshBuilder.CreateSphere('lingaDome', { diameter: .98, segments: 16 }, scene);
  dome.position.set(lg.x, lg.top - .05, lg.z); dome.material = lingaMat; P.casters.push(dome);
  const ashMat = new B.StandardMaterial('ash', scene);
  ashMat.diffuseColor = col3(0xf4efe2); ashMat.emissiveColor = col3(0xf4efe2).scale(.45); ashMat.specularColor = B.Color3.Black();
  [5.78, 6.2, 6.62].forEach((y, i) => {
    const s = B.MeshBuilder.CreateBox('ash', { width: 1.03, height: .1, depth: 1.03 }, scene);
    s.position.set(lg.x, y + (i === 1 ? .0 : 0), lg.z); s.material = ashMat;
  });
  const lingaHalo = makeHalo(scene, haloTex, 5.2, new B.Color3(.75, .55, .95), .55);
  lingaHalo.position.set(lg.x, lg.top - 1.2, lg.z);
  const lingaHalo2 = makeHalo(scene, haloTex, 2.4, new B.Color3(1, .9, .7), .55);
  lingaHalo2.position.set(lg.x, lg.top + .3, lg.z);
  P.lingaHalos = [lingaHalo, lingaHalo2];
  const lingaLight = new B.PointLight('lingaLight', new B.Vector3(lg.x, lg.top + .5, lg.z), scene);
  lingaLight.diffuse = new B.Color3(.72, .6, 1); lingaLight.specular = B.Color3.Black(); lingaLight.intensity = .7; lingaLight.range = 7;
  P.lights.push(lingaLight);

  // ---- king (praying, seated) ----
  const K = L.king;
  const king = new B.TransformNode('king', scene);
  king.position.set(K.x, K.y, K.z);
  const part = (mesh, x, y, z, mat) => { mesh.parent = king; mesh.position.set(x, y, z); mesh.material = mat; P.casters.push(mesh); return mesh; };
  const robe = std(0xe08a2e), robe2 = std(0xc4622a), skin = std(0xdca77a, .15), gold = std(0xf2c14e, .5), red = std(0xb4483a), dark = std(0x2a2020);
  gold.emissiveColor = col3(0xf2c14e).scale(.18);
  part(B.MeshBuilder.CreateBox('cushion', { width: 1.0, height: .12, depth: .9 }, scene), 0, .06, 0, red);
  part(B.MeshBuilder.CreateBox('lap', { width: .7, height: .24, depth: .56 }, scene), 0, .24, .02, robe2);
  part(B.MeshBuilder.CreateBox('torso', { width: .52, height: .46, depth: .34 }, scene), 0, .6, -.04, robe);
  part(B.MeshBuilder.CreateBox('sash', { width: .54, height: .1, depth: .36 }, scene), 0, .46, -.04, gold);
  part(B.MeshBuilder.CreateSphere('head', { diameter: .36, segments: 12 }, scene), 0, 1.0, -.02, skin);
  part(B.MeshBuilder.CreateBox('beard', { width: .16, height: .13, depth: .07 }, scene), 0, .86, .13, dark);
  const crown = part(B.MeshBuilder.CreateCylinder('crown', { diameterTop: .38, diameterBottom: .3, height: .2, tessellation: 7 }, scene), 0, 1.24, -.02, gold);
  part(B.MeshBuilder.CreateSphere('jewel', { diameter: .08, segments: 6 }, scene), 0, 1.3, .16, std(0xd2263c, .6));
  [-1, 1].forEach(s => {
    const arm = part(B.MeshBuilder.CreateBox('arm', { width: .12, height: .34, depth: .12 }, scene), s * .3, .62, .1, robe);
    arm.rotation.x = .9; arm.rotation.z = -s * .35;
    part(B.MeshBuilder.CreateSphere('eye', { diameter: .04, segments: 4 }, scene), s * .07, 1.03, .16, dark);
  });
  part(B.MeshBuilder.CreateSphere('hands', { diameter: .15, segments: 8 }, scene), 0, .66, .26, skin);
  P.king = king;
  const kHalo = makeHalo(scene, haloTex, 3.0, new B.Color3(1, .8, .4), .55);
  kHalo.position.set(K.x, K.y + 1.05, K.z - .35);
  P.kingHalo = kHalo;
  const kLight = new B.PointLight('kingLight', new B.Vector3(K.x, K.y + 1.6, K.z + .4), scene);
  kLight.diffuse = new B.Color3(1, .82, .5); kLight.specular = B.Color3.Black(); kLight.intensity = .6; kLight.range = 5;
  P.lights.push(kLight); P.kingLight = kLight;

  // ---- cell bars (real thin bars, not voxels) ----
  const barMat = std(0x5b4a3c, .55); barMat.specularPower = 30;
  const bz = 6.5;
  L.bars.forEach(x => {
    const bar = B.MeshBuilder.CreateCylinder('bar', { diameter: .2, height: 2.0, tessellation: 8 }, scene);
    bar.position.set(x, 3.0, bz); bar.material = barMat; P.casters.push(bar);
  });
  [2.35, 3.6].forEach(y => {
    const rail = B.MeshBuilder.CreateBox('rail', { width: 7.0, height: .14, depth: .2 }, scene);
    rail.position.set(L.W - 16.5, y, bz); rail.material = barMat; P.casters.push(rail);
  });

  // ---- water ----
  const wm = new B.StandardMaterial('water', scene);
  wm.diffuseColor = col3(0x2a7ea6); wm.alpha = .8; wm.specularColor = new B.Color3(.35, .35, .35); wm.specularPower = 70;
  wm.emissiveTexture = makeWaterTexture(scene); wm.emissiveColor = new B.Color3(.28, .42, .5);
  wm.backFaceCulling = false;
  P.waterMat = wm;

  // ---- drifting motes ----
  const ps = new B.ParticleSystem('motes', 140, scene);
  ps.particleTexture = haloTex;
  ps.emitter = new B.Vector3(lg.x, 2.4, lg.z);
  ps.minEmitBox = new B.Vector3(-9, 0, -8); ps.maxEmitBox = new B.Vector3(9, 5, 8);
  ps.color1 = new B.Color4(1, .85, .55, .8); ps.color2 = new B.Color4(1, .65, .35, .6); ps.colorDead = new B.Color4(1, .6, .3, 0);
  ps.minSize = .07; ps.maxSize = .2; ps.minLifeTime = 4; ps.maxLifeTime = 8; ps.emitRate = 16;
  ps.direction1 = new B.Vector3(-.15, .25, -.15); ps.direction2 = new B.Vector3(.15, .55, .15);
  ps.minEmitPower = .1; ps.maxEmitPower = .35; ps.gravity = new B.Vector3(0, .04, 0);
  ps.blendMode = B.ParticleSystem.BLENDMODE_ADD;
  ps.start(); P.motes = ps;

  P.update = (time) => {
    for (const f of P.flames) {
      const n = .5 + .5 * Math.sin(time * 9 + f.ph) * Math.sin(time * 5.3 + f.ph * 2);
      const s = .9 + .22 * n;
      f.outer.scaling.set(.26 * s, .44 * (.9 + .3 * n), .26 * s);
      f.core.scaling.set(.13 * s, .24 * (.9 + .3 * n), .13 * s);
      f.halo.scaling.setAll(.92 + .14 * n);
      if (f.light) f.light.intensity = f.baseI * (.88 + .22 * n);
    }
    const br = .5 + .5 * Math.sin(time * 1.3);
    P.lingaHalos[0].scaling.setAll(.95 + .08 * br);
    P.lingaHalos[1].material.alpha = .45 + .2 * br;
    P.kingHalo.scaling.setAll(.95 + .05 * Math.sin(time * 2.1));
    P.king.position.y = L.king.y + .012 * Math.sin(time * 1.7); // breathing
    P.waterMat.emissiveTexture.uOffset = time * .012;
    P.waterMat.emissiveTexture.vOffset = Math.sin(time * .3) * .02 + time * .006;
  };
  return P;
}
