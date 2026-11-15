// Düzlemsel yansıma (y = sabit düzlem) + ıslak zemin malzemesi yaması.
// Aynalı kamera hesabı three.js Reflector'ünden (MIT) uyarlanmıştır; yansıma dokusu mip'li üretilir,
// böylece nemli asfaltta bulanık, su birikintisinde keskin yansıma elde edilir.
import * as THREE from 'three';

export class PlanarReflection {
  constructor(renderer, { y = 0, scale = 0.5, clipBias = 0.003 } = {}) {
    this.r = renderer; this.y = y; this.scale = scale; this.clipBias = clipBias;
    this.cam = new THREE.PerspectiveCamera();
    this.matrix = new THREE.Matrix4();
    this.hidden = [];           // yansıma çizilirken gizlenecek nesneler (aynanın kendisi)
    this.uniforms = { tReflect: { value: null }, uReflMatrix: { value: this.matrix }, uReflOn: { value: 0 } };
    this.enabled = scale > 0;
  }

  ensure(w, h) {
    const W = Math.max(64, Math.round(w * this.scale)), H = Math.max(64, Math.round(h * this.scale));
    if (this.rt && this.rt.width === W && this.rt.height === H) return;
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: 0,
    });
    this.uniforms.tReflect.value = this.rt.texture;
  }

  render(scene, camera, w, h) {
    if (!this.enabled) { this.uniforms.uReflOn.value = 0; return; }
    this.ensure(w, h);
    const normal = new THREE.Vector3(0, 1, 0);
    const P = new THREE.Vector3(0, this.y, 0);
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y < this.y + 0.01) { this.uniforms.uReflOn.value = 0; return; }
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const view = P.clone().sub(camPos);
    view.reflect(normal).negate().add(P);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = P.clone().sub(look); target.reflect(normal).negate().add(P);
    const rc = this.cam;
    rc.position.copy(view);
    rc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    rc.lookAt(target);
    rc.far = camera.far; rc.near = camera.near;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    rc.matrixWorldInverse.copy(rc.matrixWorld).invert();
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    // eğik kırpma düzlemi: düzlemin altındakiler yansımaya girmesin
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, P).applyMatrix4(rc.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rc.projectionMatrix, e = pm.elements, q = new THREE.Vector4();
    q.x = (Math.sign(clip.x) + e[8]) / e[0];
    q.y = (Math.sign(clip.y) + e[9]) / e[5];
    q.z = -1; q.w = (1 + e[10]) / e[14];
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - this.clipBias; e[14] = clip.w;
    rc.projectionMatrixInverse.copy(pm).invert();

    for (const o of this.hidden) o.visible = false;
    const prevRT = this.r.getRenderTarget(), prevShadow = this.r.shadowMap.autoUpdate, prevAuto = this.r.autoClear;
    this.r.shadowMap.autoUpdate = false; this.r.autoClear = true;
    const fog = scene.fog;
    this.r.setRenderTarget(this.rt);
    this.r.state.buffers.depth.setMask(true);
    this.r.render(scene, rc);
    this.r.setRenderTarget(prevRT);
    this.r.shadowMap.autoUpdate = prevShadow; this.r.autoClear = prevAuto;
    scene.fog = fog;
    for (const o of this.hidden) o.visible = true;
    this.uniforms.uReflOn.value = 1;
  }
}

// ---- ıslak zemin: MeshStandardMaterial yaması
// opts: { wet (0..1 genel nem), puddle (0..1 birikinti miktarı), rain (0..1 halkalar), puddleScale, darken }
export function makeWet(mat, refl, shared, opts = {}) {
  const o = { wet: 0.7, puddle: 0.9, puddleScale: 0.09, darken: 0.55, ...opts };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, refl.uniforms, shared, {
      uWet: { value: o.wet }, uPuddle: { value: o.puddle }, uPScale: { value: o.puddleScale }, uDarken: { value: o.darken },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform sampler2D tReflect; uniform mat4 uReflMatrix; uniform float uReflOn;
uniform float uTime, uRain, uWet, uPuddle, uPScale, uDarken;
float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh(i), wh(i + vec2(1, 0)), u.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), u.x), u.y); }
float wfbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * wn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// yağmur damlası halkaları: hücre başına rastgele fazlı genişleyen halka; xz düzleminde normal sapması döndürür
vec2 ripple(vec2 p, float t){
  vec2 acc = vec2(0.0);
  for (int L = 0; L < 2; L++) {
    vec2 q = p * (L == 0 ? 2.6 : 3.7) + float(L) * 13.7;
    vec2 id = floor(q), f = fract(q) - 0.5;
    float h = wh(id + float(L) * 3.1);
    vec2 c = (vec2(wh(id + 7.3), wh(id + 1.9)) - 0.5) * 0.5;
    float life = fract(t * (0.9 + 0.6 * h) + h);
    vec2 dv = f - c; float d = length(dv);
    float r = life * 0.42;
    float ring = exp(-pow((d - r) * 34.0, 2.0)) * (1.0 - life) * (1.0 - life);
    acc += (dv / max(d, 1e-4)) * ring;
  }
  return acc;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float wMaskN = wfbm(vWPos.xz * uPScale + 3.1);
float wPuddle = smoothstep(0.44, 0.49, wMaskN + (wn(vWPos.xz * 1.7) - 0.5) * 0.06) * uPuddle;
float wDamp = clamp(uWet * (0.65 + 0.35 * smoothstep(0.35, 0.6, wMaskN)), 0.0, 1.0);
diffuseColor.rgb *= mix(1.0, uDarken, wDamp * 0.75);
diffuseColor.rgb *= mix(1.0, 0.18, wPuddle);   // su filmi: zemin neredeyse siyah, görüntüyü yansıma taşır`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.2), wDamp);
roughnessFactor = mix(roughnessFactor, 0.015, wPuddle);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, wPuddle * 0.92));
vec2 wRip = ripple(vWPos.xz, uTime) * uRain * (0.25 + 0.75 * wPuddle);
normal = normalize(normal + (viewMatrix * vec4(wRip.x, 0.0, wRip.y, 0.0)).xyz * 0.5);`)
      .replace('#include <opaque_fragment>', `
if (uReflOn > 0.5) {
  vec4 rp = uReflMatrix * vec4(vWPos, 1.0);
  vec2 ruv = rp.xy / rp.w;
  vec3 nV = normal;
  vec2 dist = (transpose(mat3(viewMatrix)) * nV).xz * mix(0.03, 0.004, wPuddle) + wRip * 0.012;
  float lod = mix(3.5, 0.0, wPuddle);
  // ıslak yolda yansımalar dikey uzar: ekran-y boyunca çok örnekli bulanıklık
  float streak = mix(0.035, 0.006, wPuddle);
  vec3 refl = vec3(0.0); float wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    float w = 1.0 - abs(float(i)) / 4.0;
    refl += textureLod(tReflect, ruv + dist + vec2(0.0, float(i) * streak), lod).rgb * w; wsum += w;
  }
  refl /= wsum;
  float NdV = clamp(dot(normalize(nV), normalize(vViewPosition)), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  // birikintide su aynası: grazing açıda neredeyse tam yansıma, dik bakışta da belirgin
float k = mix(fres * wDamp * 0.8, max(fres, 0.42), wPuddle);
  outgoingLight = mix(outgoingLight, refl, clamp(k, 0.0, 1.0));
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'wet' + (opts.key || '');
  return mat;
}
