/* Shivanag — camera rig (M0): four presets blended by a dolly-zoom trick, 90-degree snap rotation */
const PRESETS = [
  { id: 'iso', label: 'Isometric', yaw: 45, pitch: 35.26, fov: 6, size: 24 },
  { id: 'three', label: '3/4 View', yaw: 28, pitch: 52, fov: 22, size: 17 },
  { id: 'steep', label: 'Steep', yaw: 18, pitch: 72, fov: 26, size: 19 },
  { id: 'dyn', label: 'Dynamic', yaw: 28, pitch: 50, fov: 24, size: 19, dynamic: true },
];

class CamRig {
  constructor(scene, engine, bounds) {
    this.engine = engine; this.bounds = bounds;
    this.cam = new B.FreeCamera('cam', new B.Vector3(0, 20, -20), scene);
    this.cam.minZ = 1; this.cam.maxZ = 400; this.cam.inertia = 0;
    scene.activeCamera = this.cam;
    this.preset = 1; this.yawStep = 0; this.zoom = 1;
    this.cur = null; this.target = new B.Vector3(bounds.W / 2, 2, bounds.D / 2);
    this.first = true;
  }
  setPreset(i) { this.preset = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length; }
  rotate(dir) { this.yawStep += dir; }
  get yawLogical() { return rad(PRESETS[this.preset].yaw) + this.yawStep * Math.PI / 2; }

  // screen-space input (ux right, uy up) -> grid axis [dx,dz] relative to the camera
  worldDir(ux, uy) {
    const th = 0.12; // tiny bias so exact diagonals resolve consistently
    const sx = ux * Math.cos(th) - uy * Math.sin(th), sy = ux * Math.sin(th) + uy * Math.cos(th);
    const y = this.yawLogical;
    const fx = -Math.sin(y), fz = -Math.cos(y);   // camera forward on the ground
    const rx = -Math.cos(y), rz = Math.sin(y);    // camera right (left-handed: up x forward)
    const wx = fx * sy + rx * sx, wz = fz * sy + rz * sx;
    return Math.abs(wx) > Math.abs(wz) ? [Math.sign(wx), 0] : [0, Math.sign(wz)];
  }

  update(dt, head, moving) {
    const P = PRESETS[this.preset];
    let tp = P.pitch, ts = P.size;
    if (P.dynamic) { tp += moving ? 7 : -4; ts *= moving ? 1.04 : .9; }
    const want = { yaw: this.yawLogical, pitch: rad(tp), fov: rad(P.fov), size: ts * this.zoom };
    if (!this.cur) this.cur = Object.assign({}, want);
    const k = this.first ? 1 : 1 - Math.exp(-dt * 5);
    for (const key in want) this.cur[key] += (want[key] - this.cur[key]) * k;
    const kt = this.first ? 1 : 1 - Math.exp(-dt * 4.5);
    const b = this.bounds;
    const tx = clamp(head.x, 9, b.W - 9), tz = clamp(head.z, 9, b.D - 9);
    this.target.x += (tx - this.target.x) * kt;
    this.target.z += (tz - this.target.z) * kt;
    this.target.y += ((2.2 + (head.y - 2) * .6) - this.target.y) * kt;
    this.first = false;

    const asp = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    const f = asp < 1.15 ? Math.pow(1.15 / asp, .62) : 1;
    const size = this.cur.size * f;
    const dist = (size / 2) / Math.tan(this.cur.fov / 2);
    const hd = dist * Math.cos(this.cur.pitch);
    const c = this.cam;
    c.fov = this.cur.fov;
    c.minZ = Math.max(.5, dist - 70); c.maxZ = dist + 90;
    c.position.set(this.target.x + hd * Math.sin(this.cur.yaw), this.target.y + dist * Math.sin(this.cur.pitch), this.target.z + hd * Math.cos(this.cur.yaw));
    c.setTarget(this.target);
  }
}
