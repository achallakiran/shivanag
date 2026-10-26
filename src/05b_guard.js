/* Shivanag — guards (M4a): voxel soldiers on fixed patrol routes, deterministic fixed-step movement,
   a 90-degree vision cone cast on the voxel grid (walls and foliage block it, shadows shorten it), drawn on the floor */
const GCFG = { step: .55, wait: 1.0, range: 5, darkRange: 1.5, halfAng: Math.PI / 4, eye: 2.2, darkBelow: .35, sun: [.5, .8, .35] };

// light value per cell, computed once: sun (blocked by tall things) + lit torches
function buildLightMap(L) {
  const w = L.world, map = new Float32Array(L.W * L.D);
  const sx = -GCFG.sun[0], sz = -GCFG.sun[2]; // direction the shadows fall
  for (let z = 0; z < L.D; z++) for (let x = 0; x < L.W; x++) {
    let v = .6;
    // shadow: any tall solid up-sun of this cell shades it
    for (let k = 1; k <= 6; k++) {
      const px = Math.round(x - sx * k * .7), pz = Math.round(z - sz * k * .7);
      let blocked = false;
      for (let y = 3; y <= 4 + 2; y++) { const m = w.get(px, y, pz); if (m !== 0 && m !== M.WATER && m !== M.BARS && m !== M.LEAF && m !== M.LEAF2 && m !== M.POLE) { if (y - 2 >= k * 0.55) blocked = true; } }
      if (blocked) { v = .22; break; }
    }
    for (const t of L.torches) if (t.light) { const d = Math.hypot(x + .5 - t.x, z + .5 - t.z); if (d < 7) v += .5 * (1 - d / 7); }
    map[x + z * L.W] = Math.min(1, v);
  }
  return map;
}

// does the line from a to b pass through a sight-blocking voxel?
function sightBlocked(w, ax, ay, az, bx, by, bz) {
  const d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.max(2, Math.ceil(d / .2));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = Math.floor(ax + (bx - ax) * t), y = Math.floor(ay + (by - ay) * t), z = Math.floor(az + (bz - az) * t);
    const m = w.get(x, y, z);
    if (m !== 0 && m !== M.WATER && m !== M.BARS && m !== M.POLE) return true;
  }
  return false;
}

class Guard {
  constructor(scene, L, light, route, opts) {
    this.scene = scene; this.L = L; this.w = L.world; this.light = light; this.opts = opts || {};
    this.cell = { x: route[0][0], z: route[0][1], top: 2 };
    this.path = [];           // BFS cell path to current waypoint
    this.route = route; this.wp = 0;
    this.face = [0, 1]; this.heading = Math.atan2(this.face[0], this.face[1]);
    this.t = 1; this.from = { x: this.cell.x + .5, z: this.cell.z + .5, y: 2 }; this.to = this.from;
    this.timer = 0; this.acc = 0; this.walkPh = 0; this.sees = false; this.cone = [];
    this._build(); this._nextLeg(); this._updateCone(true);
  }

  _build() {
    const sc = this.scene, root = new B.TransformNode('guard', sc); this.root = root; root.scaling.set(2.7, 2.5, 2.7); this.meshes = [];
    const mat = (c, s) => { const m = new B.StandardMaterial('g', sc); m.diffuseColor = col3(c); const k = s || .08; m.specularColor = new B.Color3(k, k, k); return m; };
    const tun = mat(this.opts.color || 0xb23a3a), trim = mat(0xf0c14e, .4), skin = mat(0xd49a6a, .12), dark = mat(0x2d2530), wood = mat(0x8a5f38), steel = mat(0xc9ced6, .5);
    const box = (n, w, h, d, x, y, z, m, parent) => { const b = B.MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, sc); b.parent = parent || root; b.position.set(x, y, z); b.material = m; b.isPickable = false; this.meshes.push(b); return b; };
    this.legL = new B.TransformNode('lL', sc); this.legL.parent = root; this.legL.position.set(-.13, .42, 0);
    this.legR = new B.TransformNode('lR', sc); this.legR.parent = root; this.legR.position.set(.13, .42, 0);
    box('legL', .18, .42, .2, 0, -.21, 0, dark, this.legL); box('legR', .18, .42, .2, 0, -.21, 0, dark, this.legR);
    box('torso', .5, .5, .3, 0, .68, 0, tun); box('belt', .52, .08, .32, 0, .46, 0, trim);
    box('head', .3, .3, .3, 0, 1.1, 0, skin); box('beard', .22, .1, .06, 0, 1.0, .16, dark);
    box('helm', .36, .16, .36, 0, 1.3, 0, trim); box('helmTop', .1, .12, .1, 0, 1.42, 0, steel);
    [-1, 1].forEach(s => box('eye', .05, .05, .02, s * .08, 1.12, .155, dark));
    this.armR = new B.TransformNode('aR', sc); this.armR.parent = root; this.armR.position.set(.34, .86, 0);
    box('arm', .12, .4, .12, 0, -.18, 0, tun, this.armR);
    box('shaft', .06, 1.7, .06, 0, -.1, .06, wood, this.armR); box('tip', .1, .22, .1, 0, .86, .06, steel, this.armR);
    box('armL', .12, .4, .12, -.34, .68, 0, tun);
    // cone floor mesh
    this.coneMesh = new B.Mesh('cone', sc); this.coneMesh.isPickable = false; this.coneMesh.alphaIndex = 9;
    const cm = new B.StandardMaterial('coneMat', sc); cm.diffuseColor = B.Color3.Black(); cm.specularColor = B.Color3.Black(); cm.emissiveColor = B.Color3.White();
    cm.disableLighting = true; cm.backFaceCulling = false; cm.disableDepthWrite = true; cm.zOffset = -2; cm.alpha = .5;
    this.coneMesh.material = cm; this.coneMesh.hasVertexAlpha = true; this.coneMesh.useVertexColors = true;
    this._place(1);
  }

  _walkable(x, z, from) { return this.w.surface(x, z, from) === from && !this._solidAt(x, from, z); }
  _solidAt(x, y, z) { const m = this.w.get(x, y, z); return m !== 0 && m !== M.LEAF && m !== M.LEAF2; }

  // deterministic BFS between two cells on the guard's ground level
  _bfs(a, b) {
    const W = this.L.W, D = this.L.D, top = 2, key = (x, z) => x + z * W;
    const prev = new Map([[key(a.x, a.z), null]]), q = [[a.x, a.z]];
    for (let h = 0; h < q.length; h++) {
      const [x, z] = q[h]; if (x === b.x && z === b.z) break;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D || prev.has(key(nx, nz))) continue;
        if (!this._walkable(nx, nz, top)) continue;
        prev.set(key(nx, nz), [x, z]); q.push([nx, nz]);
      }
    }
    if (!prev.has(key(b.x, b.z))) return [];
    const out = []; let cur = [b.x, b.z];
    while (cur && !(cur[0] === a.x && cur[1] === a.z)) { out.push({ x: cur[0], z: cur[1] }); cur = prev.get(key(cur[0], cur[1])); }
    return out.reverse();
  }

  _nextLeg() {
    this.wp = (this.wp + 1) % this.route.length;
    const g = this.route[this.wp]; this.path = this._bfs(this.cell, { x: g[0], z: g[1] });
    if (!this.path.length) this.timer = GCFG.wait;
  }

  _place(k) {
    const p = this.from, q = this.to, t = k;
    const x = lerp(p.x, q.x, t), z = lerp(p.z, q.z, t), y = lerp(p.y, q.y, t);
    this.root.position.set(x, y, z); this.pos = { x, y, z };
  }

  update(dt, time, snake) {
    // fixed-step logic
    this.acc += dt;
    while (this.acc >= GCFG.step) { this.acc -= GCFG.step; this._tick(); }
    const k = this.t < 1 ? Math.min(1, (this.acc / GCFG.step)) : 1;
    // smooth only while moving; a tick that started a move reset acc, so use stored fraction
    this._place(this.moving ? k : 1);
    const dh = angDiff(this.heading, Math.atan2(this.face[0], this.face[1]));
    this.heading += dh * (1 - Math.exp(-dt * 10));
    this.root.rotation.y = this.heading;
    this.walkPh += dt * (this.moving ? 9 : 0);
    const sw = this.moving ? Math.sin(this.walkPh) * .5 : 0;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armR.rotation.x = this.moving ? -sw * .4 : 0;
    this.root.position.y += this.moving ? Math.abs(Math.sin(this.walkPh)) * .04 : 0;
    this._look(snake);
  }

  get moving() { return this.t < 1; }

  _tick() {
    this.t = 1; this.from = this.to;
    if (this.timer > 0) { this.timer -= GCFG.step; if (this.timer <= 0) this.timer = 0; return; }
    if (!this.path.length) { this.timer = GCFG.wait; this._nextLeg(); return; }
    const n = this.path.shift();
    this.face = [Math.sign(n.x - this.cell.x), Math.sign(n.z - this.cell.z)];
    this.cell = { x: n.x, z: n.z, top: 2 };
    this.from = this.to; this.to = { x: n.x + .5, z: n.z + .5, y: 2 }; this.t = 0;
    if (!this.path.length) this.timer = GCFG.wait;
    this._updateCone(false);
  }

  // vision cone as a set of floor cells
  _updateCone(force) {
    const w = this.w, c = this.cell, f = this.face, ex = c.x + .5, ez = c.z + .5, ey = c.top + GCFG.eye;
    const cells = [], R = GCFG.range, fl = Math.hypot(f[0], f[1]) || 1, fx = f[0] / fl, fz = f[1] / fl;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = c.x + dx, z = c.z + dz; if (x < 0 || z < 0 || x >= this.L.W || z >= this.L.D) continue;
      const d = Math.hypot(dx, dz); if (d === 0 || d > R) continue;
      if ((dx * fx + dz * fz) / d < Math.cos(GCFG.halfAng) - .001) continue;
      const lim = this.light[x + z * this.L.W] < GCFG.darkBelow ? GCFG.darkRange : R; if (d > lim) continue;
      const s = w.surface(x, z, c.top); if (s === null) continue;
      if (sightBlocked(w, ex, ey, ez, x + .5, s + .3, z + .5)) continue;
      cells.push({ x, z, top: s, dark: lim < R });
    }
    this.cone = cells; this._drawCone();
  }

  _drawCone() {
    const P = [], C = [], I = [], N = [], col = this.sees ? [1, .1, .1, .7] : [1, .55, .05, .5];
    for (const q of this.cone) {
      const b = P.length / 3, y = q.top + .035, a = q.dark ? .5 : 1;
      P.push(q.x + .04, y, q.z + .04, q.x + .96, y, q.z + .04, q.x + .96, y, q.z + .96, q.x + .04, y, q.z + .96);
      for (let k = 0; k < 4; k++) { C.push(col[0], col[1], col[2], col[3] * a); N.push(0, 1, 0); }
      I.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const vd = new B.VertexData(); vd.positions = P; vd.colors = C; vd.normals = N; vd.indices = I;
    if (!P.length) { this.coneMesh.setEnabled(false); return; }
    this.coneMesh.setEnabled(true); vd.applyToMesh(this.coneMesh, true);
  }

  // does the guard see the snake right now? (cone + line of sight)
  _look(snake) {
    let s = false;
    if (snake) {
      const hx = Math.floor(snake.head.x), hz = Math.floor(snake.head.z), hy = snake.head.y;
      const q = this.cone.find(c => c.x === hx && c.z === hz && Math.abs(c.top - hy) <= 1.6);
      if (q) s = !sightBlocked(this.w, this.cell.x + .5, this.cell.top + GCFG.eye, this.cell.z + .5, snake.head.x, hy + .35, snake.head.z);
    }
    if (s !== this.sees) { this.sees = s; this._drawCone(); }
  }
}

function buildGuards(scene, L) {
  const light = buildLightMap(L), cell = (x, z) => [L.IW - 1 - x + L.OX, z + L.OZ]; // route points are written in courtyard map space
  const routes = [
    { color: 0xb23a3a, pts: [[15, 19], [15, 26], [17, 26], [17, 19]] },                       // south loop over the bridge
    { color: 0x3a5ab2, pts: [[12, 12], [12, 16], [14, 19], [19, 19], [20, 14], [20, 11], [16, 9]] }, // circles the shrine
  ];
  const outer = { color: 0x3a9a5a, pts: [[14, L.D - L.OZ + 2], [L.W - 15, L.D - L.OZ + 2]] }; // patrols the outer south lane
  const guards = routes.map(r => new Guard(scene, L, light, r.pts.map(p => cell(p[0], p[1])), { color: r.color }));
  guards.push(new Guard(scene, L, light, outer.pts, { color: outer.color }));
  return { list: guards, light, update(dt, time, snake) { for (const g of guards) g.update(dt, time, snake); } };
}
