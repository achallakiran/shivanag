/* Shivanag — guards (M4a): voxel soldiers on fixed patrol routes, deterministic fixed-step movement,
   a 90-degree vision cone cast on the voxel grid (walls and foliage block it, shadows shorten it), drawn on the floor */
const GCFG = { susp: .25, fill: 1.0, decay: .2, shout: 24, melee: 2.8, rMin: 2.8, rMax: 13, windup: .8, flight: .42, cool: 1.0, hitR: 1.1, search: 14, lose: 6, alertStep: .27, searchStep: .38, biteReach: 4.6, sleepFor: 120, step: .5, wait: .8, range: 14, darkRange: 5.5, halfAng: Math.PI * .33, hear: 9, eye: 3.2, darkBelow: .35, sun: [.5, .8, .35] };

// light value per cell, computed once: sun (blocked by tall things) + lit torches
function buildLightMap(L) {
  const w = L.world, map = new Float32Array(L.W * L.D);
  const sx = -GCFG.sun[0], sz = -GCFG.sun[2]; // direction the shadows fall
  for (let z = 0; z < L.D; z++) for (let x = 0; x < L.W; x++) {
    let v = .6;
    // shadow: any tall solid up-sun of this cell shades it
    for (let k = 1; k <= 10; k++) {
      const px = Math.round(x - sx * k * .7), pz = Math.round(z - sz * k * .7);
      let blocked = false;
      for (let y = 3; y <= 14; y++) { const m = w.get(px, y, pz); if (m !== 0 && m !== M.WATER && m !== M.BARS && m !== M.LEAF && m !== M.LEAF2 && m !== M.POLE) { if (y - 2 >= k * 0.55) blocked = true; } }
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
    this.state = 'patrol'; this.aw = 0; this.last = null; this.unseen = 0; this.atk = null; this.cd = 0; this.stepDur = GCFG.step; this.repath = 0; this.scan = 0; this.hold = false; this.home = route.map(r => r.slice());
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
    // attack telegraph marker + thrown bhala
    this.marker = B.MeshBuilder.CreateDisc('mk', { radius: GCFG.hitR, tessellation: 24 }, sc); this.marker.rotation.x = Math.PI / 2; this.marker.isPickable = false;
    const mm = new B.StandardMaterial('mkm', sc); mm.diffuseColor = B.Color3.Black(); mm.emissiveColor = new B.Color3(1, .15, .1); mm.disableLighting = true; mm.alpha = .5; mm.backFaceCulling = false; mm.disableDepthWrite = true; mm.zOffset = -3;
    this.marker.material = mm; this.marker.setEnabled(false); this.marker.alphaIndex = 10;
    this.spear = new B.TransformNode('spear', sc); this.spear.setEnabled(false);
    { const sh = B.MeshBuilder.CreateBox('sp', { width: .1, height: .1, depth: 2.4 }, sc); sh.parent = this.spear; sh.material = wood; sh.isPickable = false;
      const tp = B.MeshBuilder.CreateBox('spt', { width: .18, height: .18, depth: .5 }, sc); tp.parent = this.spear; tp.position.z = 1.3; tp.material = steel; tp.isPickable = false; }
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

  update(dt, time, snake, mgr) {
    if (this.state === 'asleep') { this._sleepAnim(dt); return; }
    this.acc += dt;
    while (this.acc >= this.stepDur) { this.acc -= this.stepDur; this._tick(); }
    const k = this.t < 1 ? Math.min(1, this.acc / this.stepDur) : 1;
    this._place(this.moving ? k : 1);
    const dh = angDiff(this.heading, Math.atan2(this.face[0], this.face[1]));
    this.heading += dh * (1 - Math.exp(-dt * 12));
    this.root.rotation.y = this.heading;
    this.walkPh += dt * (this.moving ? (this.state === 'alert' ? 13 : 9) : 0);
    const sw = this.moving ? Math.sin(this.walkPh) * .5 : 0;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armR.rotation.x = this.moving ? -sw * .4 : 0;
    this.root.position.y += this.moving ? Math.abs(Math.sin(this.walkPh)) * .04 : 0;
    this._brain(dt, snake, mgr);
  }

  get moving() { return this.t < 1; }

  _tick() {
    this.t = 1; this.from = this.to;
    if (this.hold) return;
    if (this.timer > 0) { this.timer -= this.stepDur; if (this.timer <= 0) this.timer = 0; return; }
    if (!this.path.length) {
      if (this.state === 'patrol') { this.timer = GCFG.wait; this._nextLeg(); }
      return;
    }
    const n = this.path.shift();
    this.face = [Math.sign(n.x - this.cell.x), Math.sign(n.z - this.cell.z)];
    this.cell = { x: n.x, z: n.z, top: 2 };
    this.from = this.to; this.to = { x: n.x + .5, z: n.z + .5, y: 2 }; this.t = 0;
    if (!this.path.length && this.state === 'patrol') this.timer = GCFG.wait;
    this._updateCone(false);
  }

  _faceTo(x, z) {
    const dx = x - (this.cell.x + .5), dz = z - (this.cell.z + .5), l = Math.hypot(dx, dz) || 1;
    this.face = [dx / l, dz / l]; this._updateCone(false);
  }

  // how hidden the snake is from foliage (1 = fully visible)
  _hide(snake) {
    const w = this.w, cx = Math.floor(snake.head.x), cz = Math.floor(snake.head.z), y = Math.round(snake.head.y);
    let n = 0, own = false;
    for (let dy = 0; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const m = w.get(cx + dx, y + dy, cz + dz); if (m === M.LEAF || m === M.LEAF2) { n++; if (!dx && !dz) own = true; }
    }
    const moving = snake.moving || !!snake.wish;
    if (own || n >= 5) return moving ? .4 : .15;
    return 1;
  }

  // sees the snake right now? cone + line of sight + look-up limit
  _sees(snake) {
    const hx = Math.floor(snake.head.x), hz = Math.floor(snake.head.z), hy = snake.head.y;
    { const dx = snake.head.x - (this.cell.x + .5), dz = snake.head.z - (this.cell.z + .5), dd = Math.hypot(dx, dz), fl = Math.hypot(this.face[0], this.face[1]) || 1;
      if (dd <= 1.6 && Math.abs(hy - this.cell.top) <= 3 && (dx * this.face[0] + dz * this.face[1]) / (fl * (dd || 1)) > -.25) return true; } // right next to him (but not directly behind)
    const q = this.cone.find(c => c.x === hx && c.z === hz && Math.abs(c.top - hy) <= 12);
    if (!q) return false;
    const ex = this.cell.x + .5, ey = this.cell.top + GCFG.eye, ez = this.cell.z + .5;
    const d = Math.hypot(snake.head.x - ex, snake.head.z - ez), up = hy + .35 - ey;
    if (up > 2 && Math.atan2(up, d) > .61) return false; // too far above his line of sight
    return !sightBlocked(this.w, ex, ey, ez, snake.head.x, hy + .35, snake.head.z);
  }

  _setState(st) { this.state = st; this.hold = false; this.repath = 0; if (st === 'patrol' || st === 'susp') this.stepDur = GCFG.step; else if (st === 'search') this.stepDur = GCFG.searchStep; }

  // pick a few spots around where the snake was last known, to sweep one by one
  _searchPoints(cx, cz) {
    const pts = []; for (let i = 0; i < 40 && pts.length < 4; i++) {
      const a = Math.random() * 6.283, r = 3 + Math.random() * 7, x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
      if (x > 0 && z > 0 && x < this.L.W - 1 && z < this.L.D - 1 && this._walkable(x, z, 2)) pts.push({ x, z });
    }
    return pts;
  }

  _goToward(tx, tz) {
    this.path = this._bfsToward(this.cell, Math.floor(tx), Math.floor(tz));
  }

  _bfsToward(a, tx, tz) {
    const W = this.L.W, D = this.L.D, key = (x, z) => x + z * W;
    const prev = new Map([[key(a.x, a.z), null]]), q = [[a.x, a.z]];
    let best = [a.x, a.z], bd = Math.abs(a.x - tx) + Math.abs(a.z - tz);
    for (let h = 0; h < q.length && q.length < 900; h++) {
      const [x, z] = q[h];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D || prev.has(key(nx, nz))) continue;
        if (!this._walkable(nx, nz, 2)) continue;
        prev.set(key(nx, nz), [x, z]); q.push([nx, nz]);
        const d = Math.abs(nx - tx) + Math.abs(nz - tz); if (d < bd) { bd = d; best = [nx, nz]; }
      }
    }
    const out = []; let cur = best;
    while (cur && !(cur[0] === a.x && cur[1] === a.z)) { out.push({ x: cur[0], z: cur[1] }); cur = prev.get(key(cur[0], cur[1])); }
    return out.reverse();
  }

  _brain(dt, snake, mgr) {
    const seen = this._sees(snake);
    if (seen !== this.sees) { this.sees = seen; this._drawCone(); }
    this.cd = Math.max(0, this.cd - dt);
    const ex = this.cell.x + .5, ez = this.cell.z + .5;
    const dist = Math.hypot(snake.head.x - ex, snake.head.z - ez);
    // awareness
    if (seen) {
      const lit = this.light[Math.floor(snake.head.x) + Math.floor(snake.head.z) * this.L.W] < GCFG.darkBelow ? .5 : 1;
      const near = 1 + Math.max(0, (GCFG.range - dist) / GCFG.range);
      this.aw = Math.min(1, this.aw + dt * GCFG.fill * near * lit * this._hide(snake));
      this.last = { x: snake.head.x, z: snake.head.z }; this.unseen = 0;
    } else {
      this.unseen += dt;
      // noise: a moving snake close by is heard even when not seen (foliage muffles nothing, Wait is silent)
      if ((this.state === 'patrol' || this.state === 'susp' || this.state === 'search') && (snake.moving || snake.wish) && dist <= GCFG.hear && Math.abs(snake.head.y - this.cell.top) <= 6) {
        this.aw = Math.min(.99, this.aw + dt * .35 * (1 + (GCFG.hear - dist) / GCFG.hear)); this.last = { x: snake.head.x, z: snake.head.z };
      } else if (this.state === 'patrol' || this.state === 'susp') this.aw = Math.max(0, this.aw - dt * GCFG.decay);
      if (this.state === 'search' && this.aw >= .99 && this.last) { this._setState('alert'); this.aw = 1; }
    }
    switch (this.state) {
      case 'patrol':
        if (this.aw >= GCFG.susp) { this._setState('susp'); this.hold = true; this.path = []; }
        break;
      case 'susp':
        this.hold = true;
        if (this.last) { this.scan -= dt; if (this.scan <= 0) { this._faceTo(this.last.x, this.last.z); this.scan = .3; } }
        if (this.aw >= 1) { this._setState('alert'); mgr.shout(this); }
        else if (this.aw < .1) { this._setState('patrol'); this.path = []; this._nextLeg(); }
        break;
      case 'alert': this._alert(dt, snake, mgr, seen, dist); break;
      case 'search':
        if (seen && this.aw >= .6) { this._setState('alert'); break; }
        if (!this.path.length && !this.moving && this.searchPts && this.searchPts.length) {
          this.hold = true; this.scan -= dt; if (this.scan <= 0) { const q = this.searchPts.shift(); this._goToward(q.x, q.z); this.scan = .9; this.hold = false; }
        } else if (!this.path.length && !this.moving) {
          this.timer = 0; this.scan -= dt; this.hold = true;
          if (this.scan <= 0) { this.scan = 1.2; const f = this.face; this.face = [-f[1], f[0]]; this._updateCone(false); }
          this.searchT -= dt;
          if (this.searchT <= 0) { this._setState('patrol'); this.aw = .25; this.path = []; this.wp = Math.max(0, this.wp - 1); this._nextLeg(); }
        } else this.hold = false;
        break;
    }
    this._attackVis(dt, snake, mgr);
  }

  _alert(dt, snake, mgr, seen, dist) {
    this.stepDur = GCFG.alertStep; this.aw = 1;
    const dy = snake.head.y - this.cell.top;
    if (!this.atk) {
      // start an attack if in range
      if (this.cd <= 0 && seen) {
        let kind = null;
        if (dist <= GCFG.melee && dy <= 4) kind = 'melee';
        else if (dist >= GCFG.rMin && dist <= GCFG.rMax) kind = 'ranged';
        if (kind) {
          this.atk = { kind, t: 0, w: GCFG.windup * (.75 + Math.random() * .55), phase: 'wind', tx: snake.head.x, tz: snake.head.z, ty: snake.head.y };
          this.hold = true; this.path = []; this._faceTo(snake.head.x, snake.head.z);
          this.marker.setEnabled(true); this.marker.position.set(snake.head.x, snake.head.y + .05, snake.head.z);
        }
      }
      if (!this.atk) {
        this.hold = false;
        this.repath -= dt;
        if ((this.repath <= 0 || !this.path.length) && this.last) { this._goToward(this.last.x, this.last.z); this.repath = .6; }
        if (!seen && this.unseen > GCFG.lose) { this._setState('search'); this.aw = .6; this.searchT = GCFG.search; this.scan = .6; this.searchPts = this.last ? this._searchPoints(this.last.x, this.last.z) : []; if (this.last) this._goToward(this.last.x, this.last.z); }
      }
    }
    if (seen === false && !this.atk) { /* keep chasing last known position */ }
  }

  _attackVis(dt, snake, mgr) {
    const a = this.atk; if (!a) { this.armR.rotation.x = this.moving ? this.armR.rotation.x : 0; if (this.marker.isEnabled()) this.marker.setEnabled(false); return; }
    a.t += dt;
    if (a.phase === 'wind') {
      this.armR.rotation.x = -2.6;
      if (a.t >= a.w) {
        if (a.kind === 'melee') { this.armR.rotation.x = -.2; if (!a.slipped && mgr.hitCheck(a.tx, a.tz, a.ty, snake)) mgr.damage(this); a.phase = 'rec'; a.t = 0; this.marker.setEnabled(false); }
        else { a.phase = 'fly'; a.t = 0; this.armR.rotation.x = -.2; this.spear.setEnabled(true); a.sx = this.cell.x + .5; a.sz = this.cell.z + .5; a.sy = this.cell.top + 2.4; }
      }
    } else if (a.phase === 'fly') {
      const k = Math.min(1, a.t / GCFG.flight);
      const x = lerp(a.sx, a.tx, k), z = lerp(a.sz, a.tz, k), y = lerp(a.sy, a.ty + .4, k) + Math.sin(k * Math.PI) * 1.2;
      this.spear.position.set(x, y, z); this.spear.rotation.y = Math.atan2(a.tx - a.sx, a.tz - a.sz);
      this.spear.rotation.x = -(Math.atan2((a.ty + .4) - a.sy, Math.hypot(a.tx - a.sx, a.tz - a.sz)) - (k - .5) * .9);
      if (k >= 1) { this.spear.setEnabled(false); if (!a.slipped && mgr.hitCheck(a.tx, a.tz, a.ty, snake)) mgr.damage(this); a.phase = 'rec'; a.t = 0; this.marker.setEnabled(false); }
    } else if (a.phase === 'rec') {
      if (a.t >= .5) { this.atk = null; this.cd = GCFG.cool; this.hold = false; this.armR.rotation.x = 0; }
    }
  }

  // put to sleep (bite or counter): lies down, stops seeing, stays asleep for the level
  sleep() {
    this.sleepT = 0; this.state = 'asleep'; this.atk = null; this.hold = true; this.path = []; this.aw = 0; this.sees = false;
    this.spear.setEnabled(false); this.marker.setEnabled(false); this.coneMesh.setEnabled(false); this.armR.rotation.x = 0; this.legL.rotation.x = 0; this.legR.rotation.x = 0;
    if (!this.stars) {
      this.stars = []; const sm = new B.StandardMaterial('stm', this.scene); sm.disableLighting = true; sm.emissiveColor = new B.Color3(1, .88, .35); sm.diffuseColor = B.Color3.Black(); sm.backFaceCulling = false;
      const P = [0, 0, 0], I = []; for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 + Math.PI / 2, r = k % 2 ? .22 : .5; P.push(Math.cos(a) * r, Math.sin(a) * r, 0); I.push(0, 1 + k, 1 + (k + 1) % 10); }
      const vd = new B.VertexData(); vd.positions = P; vd.indices = I; vd.normals = P.map((_, i) => i % 3 === 2 ? 1 : 0);
      for (let i = 0; i < 3; i++) { const m = new B.Mesh('star', this.scene); vd.applyToMesh(m); m.material = sm; m.isPickable = false; m.billboardMode = B.Mesh.BILLBOARDMODE_ALL; this.stars.push(m); } }
    for (const m of this.stars) m.setEnabled(true);
  }

  // topple over with a hop, then dizzy stars circle the head
  _sleepAnim(dt) {
    this.sleepT += dt; if (this.sleepT >= GCFG.sleepFor) { this._wake(); return; } const k = Math.min(1, this.sleepT / .55), e = 1 - Math.pow(1 - k, 3);
    this.root.rotation.x = -Math.PI / 2 * e;
    this.root.position.y = this.cell.top + .7 * e + Math.sin(Math.PI * Math.min(1, k * 1.4)) * .9;
    this.root.position.x = this.cell.x + .5; this.root.position.z = this.cell.z + .5;
    const f = this.face, hl = Math.hypot(f[0], f[1]) || 1;
    const fade = Math.max(0, Math.min(1, (2.6 - this.sleepT) / .8)); // dizzy stars for ~2s, then only the Zzz stays
    for (let i = 0; i < this.stars.length; i++) {
      const a = this.sleepT * 3.2 + i * 2.094, m = this.stars[i];
      m.setEnabled(fade > 0);
      m.position.set(this.cell.x + .5 + f[0] / hl * 3.1 * e + Math.cos(a) * .9, this.cell.top + 1.3 + Math.sin(this.sleepT * 4 + i * 2) * .15, this.cell.z + .5 + f[1] / hl * 3.1 * e + Math.sin(a) * .9);
      m.scaling.setAll((.8 + .25 * Math.sin(this.sleepT * 9 + i * 2)) * fade);
    }
  }

  _wake() {
    this.root.rotation.x = 0; this.coneMesh.setEnabled(true); for (const m of this.stars) m.setEnabled(false);
    this.state = 'patrol'; this.aw = 0; this.atk = null; this.hold = false; this.cd = 1; this.path = []; this.sees = false; this.timer = 0; this.stepDur = GCFG.step;
    this.from = { x: this.cell.x + .5, z: this.cell.z + .5, y: 2 }; this.to = this.from; this.t = 1; this.acc = 0; this.last = null;
    this._nextLeg(); this._updateCone(true);
  }

  get sleepLeft() { return this.state === 'asleep' ? Math.max(0, 1 - this.sleepT / GCFG.sleepFor) : 0; }

  reset() {
    this.root.rotation.x = 0; this.coneMesh.setEnabled(true); if (this.stars) for (const m of this.stars) m.setEnabled(false);
    this.cell = { x: this.home[0][0], z: this.home[0][1], top: 2 };
    this.from = { x: this.cell.x + .5, z: this.cell.z + .5, y: 2 }; this.to = this.from; this.t = 1; this.acc = 0;
    this.route = this.home.map(r => r.slice()); this.wp = 0; this.path = []; this.state = 'patrol'; this.aw = 0; this.atk = null; this.cd = 0; this.hold = false;
    this.stepDur = GCFG.step; this.sees = false; this.timer = 0; this.last = null; this.unseen = 0; this.searchPts = null;
    this.spear.setEnabled(false); this.marker.setEnabled(false); this.armR.rotation.x = 0;
    this._nextLeg(); this._updateCone(true);
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

}

function buildGuards(scene, L) {
  const light = buildLightMap(L), cell = (x, z) => [(L.I0W - 1 - x) * L.S + L.OX, z * L.S + L.OZ]; // route points are written in courtyard map space
  const routes = [
    { color: 0xb23a3a, pts: [[15, 19], [15, 26], [17, 26], [17, 19]] },                       // south loop over the bridge
    { color: 0x3a5ab2, pts: [[12, 12], [12, 16], [14, 19], [19, 19], [20, 14], [20, 11], [16, 9]] }, // circles the shrine
  ];
  const outer = { color: 0x3a9a5a, pts: [[14, L.D - L.OZ + 2], [L.W - 15, L.D - L.OZ + 2]] }; // patrols the outer south lane
  const guards = routes.map(r => new Guard(scene, L, light, r.pts.map(p => cell(p[0], p[1])), { color: r.color }));
  guards.push(new Guard(scene, L, light, outer.pts, { color: outer.color }));
  // a garrison: many more patrols, scattered over the courtyard on deterministic loops (never near the snake's start)
  { const g0 = guards[0], W = L.W, D = L.D, sp = L.spawnCells[0]; let seed = 20261027; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const taken = guards.map(g => [g.cell.x, g.cell.z]), palette = [0xb2703a, 0x7a3ab2, 0x3ab2a8, 0xb2a23a, 0xb23a8a, 0x5a8a3a, 0x8a5a3a, 0x3a7ab2];
    const reach = (sx, sz) => { const key = (x, z) => x + z * W, seen = new Set([key(sx, sz)]), q = [[sx, sz, 0]], out = [];
      for (let h = 0; h < q.length && q.length < 1400; h++) { const [x, z, d] = q[h]; out.push([x, z, d]);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= D - 1 || seen.has(key(nx, nz))) continue; if (!g0._walkable(nx, nz, 2)) continue; seen.add(key(nx, nz)); q.push([nx, nz, d + 1]); } }
      return out; };
    let made = 0, tries = 0;
    while (made < 11 && tries++ < 400) {
      const sx = 2 + Math.floor(rnd() * (W - 4)), sz = 2 + Math.floor(rnd() * (D - 4));
      if (!g0._walkable(sx, sz, 2)) continue;
      if (Math.hypot(sx - sp.x, sz - sp.z) < 20 || taken.some(t => Math.hypot(t[0] - sx, t[1] - sz) < 9)) continue;
      const R = reach(sx, sz); if (R.length < 60) continue;
      const far = R.filter(c => c[2] >= 6 && c[2] <= 26 && Math.hypot(c[0] - sp.x, c[1] - sp.z) > 14); if (far.length < 6) continue;
      const pts = [[sx, sz]]; for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) { const c = far[Math.floor(rnd() * far.length)]; pts.push([c[0], c[1]]); }
      guards.push(new Guard(scene, L, light, pts, { color: palette[made % palette.length] })); taken.push([sx, sz]); made++;
    }
    // ambush patrols: guards whose route walks right under a tree limb, so the Drop can be used
    const wd = L.world, limbs = []; for (let x = 1; x < W - 1; x++) for (let z = 1; z < D - 1; z++) { for (let y = 4; y < 22; y++) if (wd.get(x, y, z) === M.BRANCH) { if (g0._walkable(x, z, 2)) limbs.push([x, z]); break; } }
    L.limbCells = limbs;
    const used = []; let amb = 0;
    for (let tries = 0; tries < 200 && amb < 4 && limbs.length; tries++) {
      const A = limbs[Math.floor(rnd() * limbs.length)];
      if (Math.hypot(A[0] - sp.x, A[1] - sp.z) < 12 || used.some(u => Math.hypot(u[0] - A[0], u[1] - A[1]) < 14)) continue;
      const R = reach(A[0], A[1]).filter(c => c[2] >= 5 && c[2] <= 11); if (R.length < 6) continue;
      const E1 = R[Math.floor(rnd() * R.length)], E2 = R[Math.floor(rnd() * R.length)];
      guards.push(new Guard(scene, L, light, [[E1[0], E1[1]], [A[0], A[1]], [E2[0], E2[1]], [A[0], A[1]]], { color: 0x2f7a4f })); used.push(A); amb++;
    } }
  // faint rings on the ground under every limb: they brighten when a guard stands in the drop cell
  const dm = new B.StandardMaterial('dropdim', scene), db = new B.StandardMaterial('dropbright', scene);
  for (const [m, a] of [[dm, .22], [db, .9]]) { m.disableLighting = true; m.emissiveColor = new B.Color3(1, .8, .3); m.diffuseColor = B.Color3.Black(); m.alpha = a; m.disableDepthWrite = true; }
  const marks = (L.limbCells || []).map(c => { const d = B.MeshBuilder.CreateTorus('dropring', { diameter: 1.1, thickness: .09, tessellation: 24 }, scene); d.position.set(c[0] + .5, 2.06, c[1] + .5); d.material = dm; d.isPickable = false; return { m: d, x: c[0] + .5, z: c[1] + .5, on: false }; });
  const mgr = {
    list: guards, light, hearts: 3, invuln: 0, lost: 0, events: [], rings: [],
    timers: [], windowG: null, drop: null, shotT: 0, snakeScale: 1, meter: 0, slow: 0, dip: 0, escCd: 0, dashT: 0, window: false, bite: null,
    hitCheck(tx, tz, ty, snake) { return Math.hypot(snake.head.x - tx, snake.head.z - tz) <= GCFG.hitR + .35 && Math.abs(snake.head.y - ty) <= 3 && this.invuln <= 0; },
    damage(g) { if (this.invuln > 0 || this.hearts <= 0) return; this.hearts--; this.invuln = 1.4; this.events.push({ t: 'hit', hearts: this.hearts }); if (this.hearts <= 0) this.events.push({ t: 'lost' }); },
    shout(g) {
      this.events.push({ t: 'shout', x: g.cell.x + .5, z: g.cell.z + .5 });
      const r = B.MeshBuilder.CreateTorus('ring', { diameter: 1, thickness: .06, tessellation: 32 }, scene); r.isPickable = false;
      const rm = new B.StandardMaterial('ringm', scene); rm.emissiveColor = new B.Color3(1, .85, .3); rm.diffuseColor = B.Color3.Black(); rm.disableLighting = true; rm.alpha = .9; rm.disableDepthWrite = true; r.material = rm;
      r.position.set(g.cell.x + .5, g.cell.top + 2.6, g.cell.z + .5); this.rings.push({ m: r, t: 0 });
      for (const o of guards) if (o !== g && (o.state === 'patrol' || o.state === 'susp' || o.state === 'search') && Math.hypot(o.cell.x - g.cell.x, o.cell.z - g.cell.z) <= GCFG.shout) {
        o.last = g.last ? { x: g.last.x, z: g.last.z } : null; o.aw = 1; o.unseen = 0; o._setState('alert');
      }
    },
    // real-time bookkeeping; returns the time scale the world should run at (the snake always runs at full speed)
    tick(dt, snake) {
      this.slow = Math.max(0, this.slow - dt); this.dip = Math.max(0, this.dip - dt); this.escCd = Math.max(0, this.escCd - dt);
      if (this.dashT > 0) { this.dashT -= dt; if (this.dashT <= 0) snake.speedMul = 1; }
      for (let i = this.timers.length - 1; i >= 0; i--) { const q = this.timers[i]; q.t -= dt * this.snakeScale; if (q.t <= 0) { this.timers.splice(i, 1); q.fn(); } }
      this.shotT = Math.max(0, this.shotT - dt); this.snakeScale = this.shotT > 0 ? .3 : 1;
      this.windowG = this._slipGuard(snake); this.window = this.windowG !== null;
      this.drop = this._dropTarget(snake); this.bite = this.drop || this._biteTarget(snake);
      return this.shotT > 0 || this.dip > 0 ? .2 : this.slow > 0 ? .3 : this.window ? .75 : 1;
    },
    addMeter(v) { this.meter = Math.min(1, this.meter + v); },
    _slipGuard(snake) {
      for (const g of guards) {
        const a = g.atk; if (!a || a.slipped || g.state === 'asleep') continue;
        const open = a.kind === 'melee' ? (a.phase === 'wind' && a.t >= a.w - .26) : ((a.phase === 'wind' && a.t >= a.w - .16) || (a.phase === 'fly' && GCFG.flight - a.t <= .26));
        if (open && Math.hypot(snake.head.x - a.tx, snake.head.z - a.tz) <= GCFG.hitR + .35 && Math.abs(snake.head.y - a.ty) <= 3) return g;
      }
      return null;
    },
    // a guard standing right under the snake (perched on a limb, clinging high up, or on a pillar cap)
    _dropTarget(snake) {
      let best = null, bd = 1e9; const w = snake.world;
      for (const g of guards) {
        if (g.state === 'asleep') continue;
        const dx = g.cell.x + .5 - snake.head.x, dz = g.cell.z + .5 - snake.head.z, dh = Math.hypot(dx, dz), up = snake.head.y - g.cell.top;
        if (dh > 1.7 || up < 2 || up > 18) continue;
        let clear = true; for (let y = g.cell.top + 3; y < Math.floor(snake.head.y) - 1; y++) { const m = w.get(g.cell.x, y, g.cell.z); if (m !== 0 && m !== M.LEAF && m !== M.LEAF2 && m !== M.BRANCH && m !== M.POLE) { clear = false; break; } }
        if (clear && dh < bd) { bd = dh; best = g; }
      }
      return best;
    },
    // auto-aim: the nearest guard within reach that the snake can see (any facing, asleep ones excluded); unaware guards win ties
    _biteTarget(snake) {
      let best = null, bd = 1e9;
      for (const g of guards) {
        if (g.state === 'asleep') continue;
        const dx = g.cell.x + .5 - snake.head.x, dz = g.cell.z + .5 - snake.head.z, d = Math.hypot(dx, dz);
        if (d > GCFG.biteReach || Math.abs(snake.head.y - g.cell.top) > 3) continue;
        if (d > 1.8 && sightBlocked(g.w, snake.head.x, snake.head.y + .5, snake.head.z, g.cell.x + .5, g.cell.top + 1.2, g.cell.z + .5)) continue;
        const score = d + (g.state === 'alert' ? 1.5 : 0);
        if (score < bd) { bd = score; best = g; }
      }
      return best;
    },
    startShot(snake, g) { // close-up slow-motion cinematic of a takedown
      const gx = g.cell.x + .5, gz = g.cell.z + .5;
      this.shotT = 1.5; this.dip = Math.max(this.dip, 1.5);
      this.events.push({ t: 'shot', x: (snake.head.x + gx) / 2, y: g.cell.top + 1.7 + Math.min(4, Math.max(0, snake.head.y - g.cell.top - 3) * .35), z: (snake.head.z + gz) / 2, dx: gx - snake.head.x, dz: gz - snake.head.z });
    },
    // the roll always goes to the snake's SIDE (left or right of where it faces): away from the threat when there is one
    _rollDir(snake, g, want) {
      const w = snake.world, c = snake.cell, ok = (d) => !snake.climb && w.surface(c.x + d[0], c.z + d[1], c.top) !== null;
      const hx = Math.sin(snake.heading), hz = Math.cos(snake.heading);
      const side = Math.abs(hx) > Math.abs(hz) ? [0, 1] : [1, 0];           // perpendicular grid axis to the facing
      let tx = null, tz = null;
      if (g) { tx = g.cell.x + .5 - snake.head.x; tz = g.cell.z + .5 - snake.head.z; }
      else { let bd = 1e9; for (const o of guards) { if (o.state === 'asleep') continue; const dx = o.cell.x + .5 - snake.head.x, dz = o.cell.z + .5 - snake.head.z, d = Math.hypot(dx, dz); if (d < bd && d < 14) { bd = d; tx = dx; tz = dz; } } }
      let pick = side;
      if (want && want[0] * side[0] + want[1] * side[1] !== 0) pick = [want[0] * side[0], want[1] * side[1]];   // a held sideways direction wins
      else if (tx !== null) pick = (side[0] * tx + side[1] * tz) > 0 ? [-side[0], -side[1]] : side;             // otherwise away from the threat
      const other = [-pick[0], -pick[1]];
      for (const d of [pick, other]) if (ok(d)) return { d, moves: true };
      return { d: pick, moves: false };
    },
    // Attack: bite a guard who hasn't noticed the snake
    attack(snake) {
      if (snake.actv) return false;
      const dg = this._dropTarget(snake);
      if (dg) { // DROP: leap from the branch onto the guard below
        snake.dropTo(dg.cell.x, dg.cell.z, dg.cell.top); this.invuln = Math.max(this.invuln, 1.5); this.startShot(snake, dg);
        this.timers.push({ t: .5, fn: () => { if (dg.state === 'asleep') return; dg.sleep(); this.addMeter(.2); this.events.push({ t: 'bite' }); } });
        return true;
      }
      const g = this._biteTarget(snake);
      if (!g) { const h = snake.heading; snake.act('strike', Math.sin(h), Math.cos(h), 1.6); return false; } // a lunge at thin air, so the button always responds
      const dx = g.cell.x + .5 - snake.head.x, dz = g.cell.z + .5 - snake.head.z, d = Math.hypot(dx, dz);
      snake.act('strike', dx, dz, Math.min(4.2, Math.max(.8, d - .5))); this.invuln = Math.max(this.invuln, 1.5);
      this.startShot(snake, g);
      this.timers.push({ t: .13, fn: () => { if (g.state === 'asleep') return; g.sleep(); this.addMeter(.15); this.events.push({ t: 'bite' }); } });
      return true;
    },
    // Escape: curl into a wheel and roll sideways. Timed right (just before a hit) it becomes a counter-attack.
    escape(snake) {
      if (snake.actv) return null;
      const g = this._slipGuard(snake), want = snake.wish ? [snake.wish[0], snake.wish[1]] : null;
      if (g) {
        const a = g.atk; a.slipped = true; this.invuln = Math.max(this.invuln, 2);
        const r = this._rollDir(snake, g, null);
        snake.act('roll', r.d[0], r.d[1], 0, r.moves ? 1 : 0); this.events.push({ t: 'dodge' });
        if (a.kind === 'melee') {
          this.timers.push({ t: .5, fn: () => {
            if (g.state === 'asleep') return;
            const gx = g.cell.x + .5 - snake.head.x, gz = g.cell.z + .5 - snake.head.z, gd = Math.hypot(gx, gz) || 1;
            snake.act('strike', gx, gz, Math.min(3, Math.max(.8, gd - .5))); this.startShot(snake, g);
            this.timers.push({ t: .13, fn: () => { g.sleep(); this.addMeter(.35); this.events.push({ t: 'counter' }); } });
          } });
        } else { g.cd += 1.2; this.addMeter(.2); }
        return 'counter';
      }
      const r = this._rollDir(snake, null, want); let res = 'roll';
      if (this.meter >= 1 && this.slow <= 0) { this.slow = 3; this.meter = 0; this.events.push({ t: 'slow' }); res = 'slow'; }
      snake.act('roll', r.d[0], r.d[1], 0, r.moves ? 2 : 0); this.invuln = Math.max(this.invuln, .7);
      return res;
    },
    update(dt, time, snake) {
      this.invuln = Math.max(0, this.invuln - dt);
      for (const k of marks) { const on = guards.some(g => g.state !== 'asleep' && Math.hypot(g.pos.x - k.x, g.pos.z - k.z) < .9); if (on !== k.on) { k.on = on; k.m.material = on ? db : dm; } }
      if (this.slow <= 0 && guards.some(g => g.state === 'alert' || g.state === 'search') && !guards.some(g => g.sees)) this.addMeter(.03 * dt);
      for (const g of guards) g.update(dt, time, snake, this);
      for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; const k = r.t / .9; r.m.scaling.set(1 + k * 14, 1 + k * 14, 1 + k * 14); r.m.rotation.x = Math.PI / 2; r.m.material.alpha = Math.max(0, .9 * (1 - k)); if (k >= 1) { r.m.dispose(); this.rings.splice(i, 1); } }
    },
    reset() { this.hearts = 3; this.invuln = 0; this.meter = 0; this.slow = 0; this.dip = 0; this.escCd = 0; this.dashT = 0; this.timers = []; this.shotT = 0; this.snakeScale = 1; for (const g of guards) g.reset(); },
  };
  return mgr;
}
