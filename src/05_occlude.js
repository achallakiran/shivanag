/* Shivanag — see-through blocks: voxels that sit between the camera and the snake dissolve (dithered) so the snake stays visible */
class OccPlugin extends B.MaterialPluginBase {
  constructor(material) {
    super(material, 'Occ', 250, { OCC: false });
    this.a = new B.Vector4(0, 0, 0, 1.3); this.b = new B.Vector4(0, 0, 0, 1.3);
    this._on = true;
    this._enable(true);
  }
  get on() { return this._on; }
  set on(v) { this._on = v; this.markAllDefinesAsDirty(); }
  getClassName() { return 'OccPlugin'; }
  prepareDefines(defines) { defines.OCC = this._on; }
  getUniforms() {
    return {
      ubo: [{ name: 'occA', size: 4, type: 'vec4' }, { name: 'occB', size: 4, type: 'vec4' }],
      fragment: 'uniform vec4 occA;\nuniform vec4 occB;\n',
    };
  }
  bindForSubMesh(ub) {
    if (!this._on) return;
    ub.updateFloat4('occA', this.a.x, this.a.y, this.a.z, this.a.w, '');
    ub.updateFloat4('occB', this.b.x, this.b.y, this.b.z, this.b.w, '');
  }
  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef OCC
{
  vec3 occCam = vEyePosition.xyz;
  float occFade = 0.0;
  for (int k = 0; k < 2; k++) {
    vec4 T4 = (k == 0) ? occA : occB;
    vec3 d = T4.xyz - occCam; float L = length(d); vec3 dir = d / L;
    vec3 v = vPositionW - occCam; float t = dot(v, dir);
    float perp = length(v - dir * t);
    float inFront = step(t, L - 0.8);
    float above = step(T4.y - 0.25, vPositionW.y);
    float f = (1.0 - smoothstep(T4.w * 0.55, T4.w, perp)) * inFront * above;
    occFade = max(occFade, f);
  }
  if (occFade > 0.01) {
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (ign < occFade * 0.95) discard;
  }
}
#endif
`,
    };
  }
}
