// Özel render hattı (three.js üzerinde, elle yazılmış GLSL):
//  sahne → HDR (MSAA + derinlik dokusu)
//  → yarım çözünürlüklü doğrusal derinlik → SSAO → hacimsel güneş ışığı (gölge haritasıyla ışın yürütme)
//  → iki taraflı (bilateral) birleştirme → görüş modeli (silah) HDR'a
//  → çok kademeli bloom (Karis ortalamalı) → göz adaptasyonu + güneş görünürlüğü
//  → final: renk sapması, lens kiri, güneş parlaması, pozlama, ACES/AgX, renk derecelendirme, vinyet, hasar, gren, dither
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const COMMON = `
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

function pass(fs, uniforms, defines = {}) {
  const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMMON + fs, uniforms, defines, depthTest: false, depthWrite: false });
  return new FullScreenQuad(m);
}

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: opts.type ?? THREE.HalfFloatType, format: opts.format ?? THREE.RGBAFormat,
    minFilter: opts.nearest ? THREE.NearestFilter : THREE.LinearFilter, magFilter: opts.nearest ? THREE.NearestFilter : THREE.LinearFilter,
    depthBuffer: !!opts.depth, samples: opts.samples || 0, depthTexture: opts.depthTexture || null, generateMipmaps: false,
  });
}

// prosedürel lens kiri dokusu (parlak ışıkta beliren lekeler)
function makeDirt() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 288);
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 512, y = Math.random() * 288, r = 2 + Math.pow(Math.random(), 3) * 38;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + Math.random() * 0.22;
    gr.addColorStop(0, `rgba(255,250,240,${a})`); gr.addColorStop(0.6, `rgba(255,250,240,${a * 0.5})`); gr.addColorStop(1, 'rgba(255,250,240,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 30; i++) { g.lineWidth = 1 + Math.random() * 3; g.beginPath(); const x = Math.random() * 512, y = Math.random() * 288; g.moveTo(x, y); g.bezierCurveTo(x + 40, y + 10, x + 80, y - 20, x + 140 * Math.random(), y + 30); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

export const QUALITY = {
  low:   { scale: 0.85, msaa: 0, ao: false, vol: false, volSteps: 0, bloom: true, reflect: 0, rain: 0.4 },
  high:  { scale: 1.0, msaa: 2, ao: true, vol: true, volSteps: 20, bloom: true, reflect: 0.4, rain: 0.8 },
  ultra: { scale: 1.0, msaa: 4, ao: true, vol: true, volSteps: 32, bloom: true, reflect: 0.55, rain: 1 },
};
// piksel bütçesi (milyon): yüksek DPI ekranlarda çözünürlüğü otomatik sınırlar
const PIXEL_BUDGET = { low: 1.1e6, high: 2.4e6, ultra: 3.6e6 };

export class Pipeline {
  constructor(renderer, qualityName = 'ultra') {
    this.r = renderer;
    this.qn = qualityName;
    this.q = QUALITY[qualityName] || QUALITY.ultra;
    this.dirt = makeDirt();
    this.levels = 6;
    this.time = 0;
    this.setup();
  }

  setup() {
    const U = (v) => ({ value: v });
    this.ssao = pass(`
      uniform sampler2D tDepthHalf; uniform vec2 uTanHalf, uTexel; uniform float uRadius, uIntensity, uAspect;
      vec3 vpos(vec2 uv, float z){ return vec3((uv * 2.0 - 1.0) * uTanHalf * z, -z); }
      void main(){
        float z0 = texture2D(tDepthHalf, vUv).r;
        if (z0 > 150.0) { gl_FragColor = vec4(1.0); return; }
        vec3 P = vpos(vUv, z0);
        vec2 ox = vec2(uTexel.x, 0.0), oy = vec2(0.0, uTexel.y);
        float zl = texture2D(tDepthHalf, vUv - ox).r, zr = texture2D(tDepthHalf, vUv + ox).r;
        float zd = texture2D(tDepthHalf, vUv - oy).r, zu = texture2D(tDepthHalf, vUv + oy).r;
        vec3 dx = abs(zl - z0) < abs(zr - z0) ? P - vpos(vUv - ox, zl) : vpos(vUv + ox, zr) - P;
        vec3 dy = abs(zd - z0) < abs(zu - z0) ? P - vpos(vUv - oy, zd) : vpos(vUv + oy, zu) - P;
        vec3 n = normalize(cross(dx, dy));
        float R = uRadius * (0.55 + 0.45 * clamp(z0 / 10.0, 0.0, 1.0));
        float rUv = clamp(R / (2.0 * z0 * uTanHalf.y), 3.0 * uTexel.y, 0.15);
        float R2 = R * R, sum = 0.0;
        float rot = ign(gl_FragCoord.xy) * 6.2831853;
        for (int i = 0; i < 14; i++) {
          float a = (float(i) + 0.5) / 14.0;
          float th = a * 6.2831853 * 3.0 + rot;
          vec2 o = vec2(cos(th), sin(th)) * a * rUv; o.x /= uAspect;
          vec2 uv2 = vUv + o;
          float z2 = texture2D(tDepthHalf, uv2).r;
          vec3 v = vpos(uv2, z2) - P;
          float vv = dot(v, v), vn = dot(v, n);
          float f = max(R2 - vv, 0.0);
          sum += f * f * f * max((vn - (0.012 + 0.004 * z0)) / (vv + 0.004), 0.0);
        }
        float ao = max(0.0, 1.0 - uIntensity * sum * 5.0 / (R2 * R2 * R2 * 14.0));
        ao = mix(ao, 1.0, smoothstep(70.0, 150.0, z0));
        gl_FragColor = vec4(ao, ao, ao, 1.0);
      }`, { tDepthHalf: U(null), uTanHalf: U(new THREE.Vector2()), uTexel: U(new THREE.Vector2()), uRadius: U(0.8), uIntensity: U(0.95), uAspect: U(1) });

    // SSAO gürültüsünü derinliğe duyarlı ayrılabilir bulanıklıkla temizle
    this.aoBlur = pass(`
      uniform sampler2D tAO, tDepthHalf; uniform vec2 uDir;
      void main(){
        float z0 = texture2D(tDepthHalf, vUv).r;
        float s = 0.0, w = 0.0;
        for (int i = -4; i <= 4; i++) {
          vec2 uv = vUv + uDir * float(i);
          float z = texture2D(tDepthHalf, uv).r;
          float k = exp(-float(i * i) / 10.0) / (0.02 + abs(z - z0) / max(z0, 0.1) * 30.0);
          s += texture2D(tAO, uv).r * k; w += k;
        }
        float a = s / max(w, 1e-5);
        gl_FragColor = vec4(a, a, a, 1.0);
      }`, { tAO: U(null), tDepthHalf: U(null), uDir: U(new THREE.Vector2()) });

    this.linDepth = pass(`
      uniform sampler2D tDepth; uniform float uNear, uFar; uniform vec2 uTexel;
      float lin(float d){ return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
      void main(){
        // 2x2 bloğun en yakın derinliği (ince nesneler kaybolmasın)
        float d = min(min(texture2D(tDepth, vUv + uTexel * vec2(-0.25, -0.25)).r, texture2D(tDepth, vUv + uTexel * vec2(0.25, -0.25)).r),
                      min(texture2D(tDepth, vUv + uTexel * vec2(-0.25, 0.25)).r, texture2D(tDepth, vUv + uTexel * vec2(0.25, 0.25)).r));
        gl_FragColor = vec4(d >= 0.99999 ? 1e4 : lin(d), 0.0, 0.0, 1.0);
      }`, { tDepth: U(null), uNear: U(0.05), uFar: U(600), uTexel: U(new THREE.Vector2()) });

    this.vol = pass(`
      uniform sampler2D tDepthHalf;
      uniform highp sampler2DShadow tShadow;
      uniform mat4 uShadowMatrix, uCamWorld;
      uniform vec3 uCamPos, uSunDir, uSunRad, uAmb, uHorizon, uBoxMin, uBoxMax;
      uniform vec2 uTanHalf;
      uniform float uHasShadow, uMaxDist, uSigma, uFarHaze, uBoxDust, uHeightFall;
      float shape(float h){ return 0.28 + 0.72 * exp(-max(h, 0.0) / uHeightFall); }
      float hg(float mu, float g){ float g2 = g * g; return (1.0 - g2) / (12.566371 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5)); }
      float sunVis(vec3 p){
        vec4 sc = uShadowMatrix * vec4(p, 1.0);
        sc.xyz /= sc.w;
        if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0 || sc.z < 0.0) return 1.0;
        return texture(tShadow, vec3(sc.xy, sc.z - 0.0008));
      }
      void main(){
        float z = texture2D(tDepthHalf, vUv).r;
        vec3 vd = vec3((vUv * 2.0 - 1.0) * uTanHalf, -1.0);
        float rl = length(vd);
        vec3 rd = normalize(mat3(uCamWorld) * vd);
        bool isSky = z > 5000.0;
        float dist = isSky ? 1e5 : z * rl;
        float maxD = min(dist, isSky ? uMaxDist * 0.6 : uMaxDist);
        float mu = dot(rd, uSunDir);
        float ph = min(hg(mu, 0.76) * 0.55 + hg(mu, 0.2) * 0.45, 1.2);
        float j = ign(gl_FragCoord.xy);
        vec3 acc = vec3(0.0); float T = 1.0; float tPrev = 0.0;
        for (int i = 0; i < VOL_STEPS; i++) {
          float f = (float(i) + 1.0) / float(VOL_STEPS);
          float t1 = maxD * f * (0.3 + 0.7 * f);
          float ds = t1 - tPrev;
          vec3 p = uCamPos + rd * (tPrev + ds * j);
          float sh = uHasShadow > 0.5 ? sunVis(p) : 1.0;
          vec3 bq = step(uBoxMin, p) * step(p, uBoxMax); float inb = bq.x * bq.y * bq.z;
          float ext = uSigma * shape(p.y) * (1.0 + uBoxDust * inb);
          float Ti = exp(-ext * ds);
          float nearW = mix(2.0, 0.6, smoothstep(4.0, 80.0, tPrev + ds * j));
          vec3 src = uSunRad * (ph * sh * mix(nearW, 2.2, inb)) + uAmb * (0.45 + 0.55 * sh) * mix(1.0, 0.25, inb);
          acc += T * src * (1.0 - Ti);
          T *= Ti; tPrev = t1;
        }
        if (dist > uMaxDist) {
          float far = isSky ? 0.0 : (dist - uMaxDist);
          float h1 = uCamPos.y + rd.y * uMaxDist, h2 = uCamPos.y + rd.y * min(dist, 1500.0);
          float tau = uSigma * uFarHaze * far * 0.5 * (shape(h1) + shape(h2));
          float Tf = exp(-tau);
          vec3 hc = uHorizon + uSunRad * ph * 0.6;
          acc += T * hc * (1.0 - Tf);
          T *= Tf;
        }
        gl_FragColor = vec4(acc, T);
      }`, {
      tDepthHalf: U(null), tShadow: U(null), uShadowMatrix: U(new THREE.Matrix4()), uCamWorld: U(new THREE.Matrix4()),
      uCamPos: U(new THREE.Vector3()), uSunDir: U(new THREE.Vector3(0, 1, 0)), uSunRad: U(new THREE.Vector3()), uAmb: U(new THREE.Vector3()),
      uHorizon: U(new THREE.Vector3()), uBoxMin: U(new THREE.Vector3(1e5, 1e5, 1e5)), uBoxMax: U(new THREE.Vector3(-1e5, -1e5, -1e5)),
      uTanHalf: U(new THREE.Vector2()), uHasShadow: U(0), uMaxDist: U(120), uSigma: U(0.008), uFarHaze: U(0.6), uBoxDust: U(0), uHeightFall: U(6),
    }, { VOL_STEPS: this.q.volSteps || 1 });

    this.composite = pass(`
      uniform sampler2D tColor, tDepth, tDepthHalf, tAO, tVol;
      uniform vec2 uHalfRes; uniform float uNear, uFar, uAoOn, uVolOn, uAoStrength;
      void main(){
        vec3 col = max(texture2D(tColor, vUv).rgb, vec3(0.0));
        float d = texture2D(tDepth, vUv).r;
        float z = d >= 0.99999 ? 1e4 : (uNear * uFar) / (uFar - d * (uFar - uNear));
        vec2 hp = vUv * uHalfRes - 0.5; vec2 f = fract(hp); vec2 base = (floor(hp) + 0.5) / uHalfRes; vec2 tx = 1.0 / uHalfRes;
        float ao = 0.0; vec4 vol = vec4(0.0); float ws = 0.0;
        float zc = min(z, 400.0);
        for (int k = 0; k < 4; k++) {
          vec2 o = vec2(float(k - (k / 2) * 2), float(k / 2));
          vec2 uv = base + o * tx;
          float zh = min(texture2D(tDepthHalf, uv).r, 400.0);
          float w = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
          w = max(w / (0.02 + abs(zh - zc) / zc), 1e-5);
          ao += texture2D(tAO, uv).r * w; vol += texture2D(tVol, uv) * w; ws += w;
        }
        ao /= ws; vol /= ws;
        if (uAoOn > 0.5 && d < 0.99999) {
          // tıkanma ortam ışığına aittir: güneşle aydınlanan yerlerde söner (kirli hale olmaz)
          float lit = smoothstep(0.12, 0.9, luma(col));
          float a = mix(1.0, ao, uAoStrength * (1.0 - 0.75 * lit));
          col *= mix(vec3(a), vec3(1.0), vec3(0.0, 0.02, 0.06));
        }
        if (uVolOn > 0.5) col = col * vol.a + vol.rgb;
        gl_FragColor = vec4(col, 1.0);
      }`, { tColor: U(null), tDepth: U(null), tDepthHalf: U(null), tAO: U(null), tVol: U(null), uHalfRes: U(new THREE.Vector2()), uNear: U(0.05), uFar: U(600), uAoOn: U(0), uVolOn: U(0), uAoStrength: U(1) });

    // bloom: 13 dokunuşlu küçültme (ilk kademede Karis ortalaması) + çadır filtreli büyütme
    this.down = pass(`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst;
      vec3 s(vec2 o){ return min(max(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(0.0)), vec3(300.0)); }
      float kw(vec3 c){ return 1.0 / (1.0 + luma(c) * 0.1); }
      void main(){
        vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
        vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
        vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
        vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
        vec3 col;
        if (uFirst > 0.5) {
          vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
          float w0 = kw(g0) * 0.125, w1 = kw(g1) * 0.125, w2 = kw(g2) * 0.125, w3 = kw(g3) * 0.125, w4 = kw(g4) * 0.5;
          col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
        } else col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
        gl_FragColor = vec4(col, 1.0);
      }`, { tSrc: U(null), uTexel: U(new THREE.Vector2()), uFirst: U(0) });
    this.up = pass(`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
      void main(){
        vec2 t = uTexel * uRadius;
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += (texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb) * 2.0;
        c += texture2D(tSrc, vUv - t).rgb + texture2D(tSrc, vUv + t).rgb + texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb;
        gl_FragColor = vec4(c / 16.0, 1.0);
      }`, { tSrc: U(null), uTexel: U(new THREE.Vector2()), uRadius: U(1) });
    this.up.material.blending = THREE.AdditiveBlending;

    // göz adaptasyonu + güneşin önü kapalı mı
    this.adapt = pass(`
      uniform sampler2D tPrev, tLum, tDepth; uniform vec2 uSunUv; uniform float uSunOn, uRate, uVisRate, uAspect;
      void main(){
        float ls = 0.0, ws = 0.0;
        for (int y = 0; y < 5; y++) for (int x = 0; x < 7; x++) {
          vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(7.0, 5.0);
          float w = 1.0 - 0.75 * smoothstep(0.1, 0.55, length(uv - 0.5));
          ls += log(max(luma(texture2D(tLum, uv).rgb), 1e-4)) * w; ws += w;
        }
        float avg = clamp(exp(ls / ws), 0.002, 40.0);
        float vis = 0.0;
        for (int i = 0; i < 12; i++) {
          float r = sqrt((float(i) + 0.5) / 12.0) * 0.012; float th = float(i) * 2.39996323;
          vec2 uv = uSunUv + vec2(cos(th) / uAspect, sin(th)) * r;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) vis += 0.0;
          else vis += step(0.99999, texture2D(tDepth, uv).r);
        }
        vis = vis / 12.0 * uSunOn;
        vec4 prev = texture2D(tPrev, vec2(0.5));
        float a = mix(prev.r, avg, uRate); if (!(a > 0.0) || a > 1e4) a = avg;
        float v = mix(prev.g, vis, uVisRate); if (!(v >= 0.0)) v = vis;
        gl_FragColor = vec4(a, v, 0.0, 1.0);
      }`, { tPrev: U(null), tLum: U(null), tDepth: U(null), uSunUv: U(new THREE.Vector2()), uSunOn: U(0), uRate: U(0.05), uVisRate: U(0.2), uAspect: U(1) });

    this.final = pass(`
      uniform sampler2D tScene, tBloom, tDirt, tAdapt;
      uniform vec3 uSunCol, uShadowTint, uHighTint;
      uniform vec2 uSunUv;
      uniform float uTime, uAspect, uBloom, uDirt, uFlare, uCA, uVignette, uExposure, uKey, uAdaptAmt;
      uniform float uDamage, uLowHealth, uAds, uFlash, uSaturation, uAgxMix, uGrain, uContrast;
      const mat3 R2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
      const mat3 SRGB_TO_R2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
      vec3 agxContrast(vec3 x){ vec3 x2 = x * x; vec3 x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
      vec3 agx(vec3 c){
        const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
        const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
        c = inset * (SRGB_TO_R2020 * c);
        c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
        c = agxContrast(c);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = pow(max(c, vec3(0.0)), vec3(1.18)); c = l + (c - l) * 1.15;   // "punchy" görünüm
        c = outset * c;
        c = pow(max(c, vec3(0.0)), vec3(2.2));
        return clamp(R2020_TO_SRGB * c, 0.0, 1.0);
      }
      vec3 acesHill(vec3 c){
        const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        vec3 v = inM * (c * 1.25);
        vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return clamp(outM * (a / b), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      vec3 flare(vec2 uv, vec2 sun, float vis){
        vec2 asp = vec2(uAspect, 1.0);
        vec2 p = (uv - 0.5) * asp, s = (sun - 0.5) * asp;
        vec2 dv = p - s; float r = length(dv);
        float ang = atan(dv.y, dv.x);
        float spikes = pow(abs(cos(ang * 3.0 + 0.4)), 26.0) + 0.6 * pow(abs(cos(ang * 4.0 - 1.1)), 40.0);
        vec3 c = uSunCol * (0.018 / (r * r * 9.0 + 0.01) + 0.08 * exp(-r * 3.4) + spikes * 0.25 * exp(-r * 5.5));
        vec3 g = vec3(0.0);
        g += vec3(0.30, 0.75, 0.55) * smoothstep(0.085, 0.06, length(p + s * 0.38)) * 0.05;
        g += vec3(0.85, 0.45, 0.25) * smoothstep(0.045, 0.030, length(p + s * 0.82)) * 0.075;
        float k2 = length(p + s * 1.35); g += vec3(0.35, 0.50, 0.95) * smoothstep(0.17, 0.12, k2) * (0.4 + 0.6 * smoothstep(0.05, 0.16, k2)) * 0.04;
        g += vec3(0.80, 0.70, 0.35) * smoothstep(0.03, 0.018, length(p - s * 0.45)) * 0.06;
        g += vec3(0.45, 0.55, 0.85) * exp(-pow((length(p + s * 0.15) - 0.52) * 16.0, 2.0)) * 0.035 * smoothstep(0.1, 0.5, length(s));
        return (c + g * uSunCol * 2.4) * vis;
      }
      void main(){
        vec2 c = vUv - 0.5;
        float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) / (0.25 * (uAspect * uAspect + 1.0));
        vec4 ad = texture2D(tAdapt, vec2(0.5));
        vec2 off = c * r2 * (uCA + uDamage * 0.006);
        vec3 col = vec3(texture2D(tScene, vUv + off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - off).b);
        vec3 bloom = texture2D(tBloom, vUv).rgb;
        vec3 dirt = texture2D(tDirt, vUv).rgb;
        col = mix(col, bloom, uBloom);
        col += bloom * dirt * uDirt;
        float vis = ad.g;
        if (vis > 0.002) col += flare(vUv, uSunUv, vis) * uFlare * (1.0 + dirt * 1.5);
        // pozlama: sabit * kısmi göz adaptasyonu
        float adapt = pow(clamp(uKey / max(ad.r, 1e-4), 0.35, 2.8), uAdaptAmt);
        col *= uExposure * adapt;
        col += vec3(1.0, 0.97, 0.92) * uFlash;
        col = mix(acesHill(col), agx(col), uAgxMix);
        // renk derecelendirme (ekran-doğrusal): soğuk gölgeler, sıcak ışıklar
        float l = luma(col);
        col *= mix(uShadowTint, uHighTint, smoothstep(0.03, 0.55, l));
        col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
        col = col * 0.988 + vec3(0.006, 0.008, 0.010);
        float sat = uSaturation * (1.0 - 0.65 * uLowHealth) * (1.0 - 0.45 * uDamage);
        l = luma(col); col = mix(vec3(l), col, sat);
        float vig = uVignette + uLowHealth * 0.5 + uAds * 0.25;
        float vr = smoothstep(0.15 - uAds * 0.08, 1.05, r2);
        col *= 1.0 - vig * vr * vr * (3.0 - 2.0 * vr);
        float edge = smoothstep(0.18, 1.0, r2);
        col = mix(col, vec3(0.55, 0.02, 0.01) * (0.35 + l), clamp(uDamage * edge * 0.8 + uLowHealth * edge * edge * 0.25 * (0.75 + 0.25 * sin(uTime * 5.0)), 0.0, 1.0));
        col = toSRGB(clamp(col, 0.0, 1.0));
        // parlaklığa göre film greni + bant kırıcı dither
        vec2 seed = gl_FragCoord.xy + fract(uTime * vec2(7.31, 3.17)) * vec2(311.7, 173.3);
        float gr = hash12(seed) + hash12(seed + 57.3) - 1.0;
        float lg = luma(col);
        col += gr * uGrain * mix(1.0, 0.3, smoothstep(0.25, 0.9, lg)) * (0.35 + 0.65 * smoothstep(0.0, 0.08, lg));
        col += (hash12(gl_FragCoord.xy * 1.37 + 11.0) + hash12(gl_FragCoord.xy * 0.71 + 3.0) - 1.0) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`, {
      tScene: U(null), tBloom: U(null), tDirt: U(this.dirt), tAdapt: U(null),
      uSunCol: U(new THREE.Vector3(1, 0.85, 0.65)), uShadowTint: U(new THREE.Vector3(0.84, 1.0, 1.1)), uHighTint: U(new THREE.Vector3(1.06, 1.0, 0.91)),
      uSunUv: U(new THREE.Vector2()), uTime: U(0), uAspect: U(1), uBloom: U(0.06), uDirt: U(0.18), uFlare: U(1), uCA: U(0.0025), uVignette: U(0.22),
      uExposure: U(1), uKey: U(0.2), uAdaptAmt: U(0.55), uDamage: U(0), uLowHealth: U(0), uAds: U(0), uFlash: U(0), uSaturation: U(1.05), uAgxMix: U(0.45),
      uGrain: U(0.035), uContrast: U(0.2),
    });
  }

  resize(cssW, cssH, dpr) {
    const budget = PIXEL_BUDGET[this.qn] || 2.4e6;
    let scale = this.q.scale;
    const px = cssW * dpr * cssH * dpr * scale * scale;
    if (px > budget) scale *= Math.sqrt(budget / px);
    const W = Math.max(16, Math.round(cssW * dpr * scale)), H = Math.max(16, Math.round(cssH * dpr * scale));
    if (this.W === W && this.H === H) return;
    this.W = W; this.H = H;
    this.dispose(true);
    const depthTex = new THREE.DepthTexture(W, H, THREE.FloatType);
    this.rtScene = rt(W, H, { depth: true, samples: this.q.msaa, depthTexture: depthTex });
    this.rtHDR = rt(W, H, { depth: true });
    const hw = Math.max(8, W >> 1), hh = Math.max(8, H >> 1);
    this.rtHalfDepth = rt(hw, hh, { type: THREE.FloatType, format: THREE.RedFormat, nearest: true });
    this.rtAO = rt(hw, hh, { type: THREE.UnsignedByteType });
    this.rtAO2 = rt(hw, hh, { type: THREE.UnsignedByteType });
    this.rtVol = rt(hw, hh);
    this.bloomRT = [];
    let bw = W, bh = H;
    for (let i = 0; i < this.levels; i++) { bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); this.bloomRT.push(rt(bw, bh)); }
    this.adaptRT = [rt(1, 1, { type: THREE.FloatType }), rt(1, 1, { type: THREE.FloatType })];
    this.adaptIdx = 0;
    // beyaz başlangıç (ilk karede NaN koruması pass içinde)
    for (const r of [this.rtAO]) { this.r.setRenderTarget(r); this.r.setClearColor(0xffffff, 1); this.r.clear(); }
    this.r.setRenderTarget(null); this.r.setClearColor(0x000000, 1);
  }

  dispose(keep) {
    for (const r of [this.rtScene, this.rtHDR, this.rtHalfDepth, this.rtAO, this.rtAO2, this.rtVol, ...(this.bloomRT || []), ...(this.adaptRT || [])]) r?.dispose();
    if (this.rtScene?.depthTexture) this.rtScene.depthTexture.dispose();
    if (!keep) this.W = this.H = 0;
  }

  // o: { vm, sun, atm, box, damage, lowHealth, ads, flash, dt }
  render(scene, camera, o) {
    const r = this.r, q = this.q, dt = o.dt || 0.016;
    this.time += dt;
    const autoClear = r.autoClear;
    r.autoClear = true;
    const near = camera.near, far = camera.far;
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanX = tanY * camera.aspect;
    const atm = o.atm;

    // 1) sahne → HDR (MSAA çözülür, derinlik dokusu dolar)
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);

    const half = new THREE.Vector2(this.rtHalfDepth.width, this.rtHalfDepth.height);
    const needDepth = q.ao || q.vol;
    if (needDepth) {
      const u = this.linDepth.material.uniforms;
      u.tDepth.value = this.rtScene.depthTexture; u.uNear.value = near; u.uFar.value = far; u.uTexel.value.set(1 / this.W, 1 / this.H);
      r.setRenderTarget(this.rtHalfDepth); this.linDepth.render(r);
    }
    // 2) SSAO
    if (q.ao) {
      const u = this.ssao.material.uniforms;
      u.tDepthHalf.value = this.rtHalfDepth.texture; u.uTanHalf.value.set(tanX, tanY); u.uTexel.value.set(1 / half.x, 1 / half.y); u.uAspect.value = camera.aspect;
      r.setRenderTarget(this.rtAO); this.ssao.render(r);
      const b = this.aoBlur.material.uniforms;
      b.tDepthHalf.value = this.rtHalfDepth.texture;
      b.tAO.value = this.rtAO.texture; b.uDir.value.set(1 / half.x, 0);
      r.setRenderTarget(this.rtAO2); this.aoBlur.render(r);
      b.tAO.value = this.rtAO2.texture; b.uDir.value.set(0, 1 / half.y);
      r.setRenderTarget(this.rtAO); this.aoBlur.render(r);
    }
    // 3) hacimsel ışık
    const sun = o.sun;
    const sunDir = sun ? sun.position.clone().sub(sun.target.position).normalize() : new THREE.Vector3(0, 1, 0);
    if (q.vol && atm) {
      const u = this.vol.material.uniforms;
      const smap = sun?.shadow?.map?.depthTexture;
      u.tDepthHalf.value = this.rtHalfDepth.texture;
      u.tShadow.value = smap || null; u.uHasShadow.value = smap && sun.castShadow ? 1 : 0;
      if (sun) u.uShadowMatrix.value.copy(sun.shadow.matrix);
      u.uCamWorld.value.copy(camera.matrixWorld); u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      u.uSunDir.value.copy(sunDir);
      const sc = atm.sunColor; u.uSunRad.value.set(sc.r, sc.g, sc.b).multiplyScalar(atm.sunIntensity * atm.shafts);
      const am = atm.ambient; u.uAmb.value.set(am.r, am.g, am.b).multiplyScalar(atm.ambientHaze);
      const hz = atm.horizon; u.uHorizon.value.set(hz.r, hz.g, hz.b);
      u.uSigma.value = atm.density; u.uFarHaze.value = atm.farHaze; u.uHeightFall.value = atm.heightFall;
      u.uTanHalf.value.set(tanX, tanY); u.uMaxDist.value = atm.maxDist;
      if (o.box) { u.uBoxMin.value.copy(o.box.min); u.uBoxMax.value.copy(o.box.max); u.uBoxDust.value = o.box.dust; } else u.uBoxDust.value = 0;
      r.setRenderTarget(this.rtVol); this.vol.render(r);
    }
    // 4) birleştirme
    {
      const u = this.composite.material.uniforms;
      u.tColor.value = this.rtScene.texture; u.tDepth.value = this.rtScene.depthTexture; u.tDepthHalf.value = this.rtHalfDepth.texture;
      u.tAO.value = this.rtAO.texture; u.tVol.value = this.rtVol.texture; u.uHalfRes.value.copy(half);
      u.uNear.value = near; u.uFar.value = far; u.uAoOn.value = q.ao ? 1 : 0; u.uVolOn.value = q.vol && atm ? 1 : 0; u.uAoStrength.value = atm?.ao ?? 1;
      r.setRenderTarget(this.rtHDR); this.composite.render(r);
    }
    // 5) silah (görüş modeli) HDR'a
    if (o.vm) {
      r.autoClear = false;
      r.setRenderTarget(this.rtHDR);
      r.clearDepth();
      r.render(o.vm.scene, o.vm.camera);
      r.autoClear = true;
    }
    // 6) bloom
    let src = this.rtHDR;
    for (let i = 0; i < this.levels; i++) {
      const u = this.down.material.uniforms;
      u.tSrc.value = src.texture; u.uTexel.value.set(1 / src.width, 1 / src.height); u.uFirst.value = i === 0 ? 1 : 0;
      r.setRenderTarget(this.bloomRT[i]); this.down.render(r);
      src = this.bloomRT[i];
    }
    r.autoClear = false;
    for (let i = this.levels - 1; i > 0; i--) {
      const u = this.up.material.uniforms, s = this.bloomRT[i];
      u.tSrc.value = s.texture; u.uTexel.value.set(1 / s.width, 1 / s.height); u.uRadius.value = 1;
      r.setRenderTarget(this.bloomRT[i - 1]); this.up.render(r);
    }
    r.autoClear = true;
    // 7) göz adaptasyonu + güneş görünürlüğü
    const sunWorld = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).addScaledVector(sunDir, 1000);
    const sp = sunWorld.clone().project(camera);
    const sunOn = sp.z < 1 && Math.abs(sp.x) < 1.3 && Math.abs(sp.y) < 1.3 && sunDir.y > -0.05 ? 1 : 0;
    const sunUv = new THREE.Vector2(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    {
      const u = this.adapt.material.uniforms;
      const prev = this.adaptRT[this.adaptIdx], next = this.adaptRT[1 - this.adaptIdx];
      u.tPrev.value = prev.texture; u.tLum.value = this.bloomRT[3].texture; u.tDepth.value = this.rtScene.depthTexture;
      u.uSunUv.value.copy(sunUv); u.uSunOn.value = sunOn; u.uRate.value = 1 - Math.exp(-dt * 1.6); u.uVisRate.value = 1 - Math.exp(-dt * 12); u.uAspect.value = camera.aspect;
      r.setRenderTarget(next); this.adapt.render(r);
      this.adaptIdx = 1 - this.adaptIdx;
    }
    // 8) final → ekran
    {
      const u = this.final.material.uniforms;
      u.tScene.value = this.rtHDR.texture; u.tBloom.value = this.bloomRT[0].texture; u.tAdapt.value = this.adaptRT[this.adaptIdx].texture;
      u.uSunUv.value.copy(sunUv); u.uTime.value = this.time; u.uAspect.value = camera.aspect;
      if (atm) {
        const sc = atm.sunColor; u.uSunCol.value.set(sc.r, sc.g, sc.b).multiplyScalar(atm.flare ?? 1);
        u.uExposure.value = atm.exposure; u.uShadowTint.value.copy(atm.shadowTint); u.uHighTint.value.copy(atm.highTint);
        u.uSaturation.value = atm.saturation; u.uAgxMix.value = atm.agx; u.uBloom.value = atm.bloom; u.uContrast.value = atm.contrast;
        u.uVignette.value = atm.vignette ?? 0.22;
      }
      u.uDamage.value = o.damage || 0; u.uLowHealth.value = o.lowHealth || 0; u.uAds.value = o.ads || 0; u.uFlash.value = o.flash || 0;
      r.setRenderTarget(null); this.final.render(r);
    }
    r.autoClear = autoClear;
  }
}
