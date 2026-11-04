// Görsel efektler: GPU parçacıkları (toz, duman, kan, kıvılcım), mermi delikleri, kan izleri,
// fizikli parçalar (taş/ahşap kıymıkları, boş kovanlar), patlamalar, el bombası ve bomba modeli.
import * as THREE from 'three';
import { cellChar, CELL, raycastMap, groundHeight } from '/shared/map.js';

// ---------------------------------------------------------------- doku üreticileri
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const softTex = () => canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const smokeTex = () => canvasTex(128, (g, s) => {
  for (let i = 0; i < 26; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.45, y = s / 2 + (Math.random() - 0.5) * s * 0.45, r = s * (0.12 + Math.random() * 0.22);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});
const dropTex = () => canvasTex(32, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const holeTex = () => canvasTex(128, (g, s) => {
  const c = s / 2;
  // dış kırık/çatlak halkası
  g.strokeStyle = 'rgba(40,32,24,.55)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, l = s * (0.18 + Math.random() * 0.25);
    g.beginPath(); g.moveTo(c, c);
    let x = c, y = c;
    for (let k = 0; k < 4; k++) { x += Math.cos(a + (Math.random() - 0.5) * 0.8) * l / 4; y += Math.sin(a + (Math.random() - 0.5) * 0.8) * l / 4; g.lineTo(x, y); }
    g.stroke();
  }
  let gr = g.createRadialGradient(c, c, 0, c, c, s * 0.42);
  gr.addColorStop(0, 'rgba(70,58,44,.75)'); gr.addColorStop(0.45, 'rgba(110,92,70,.35)'); gr.addColorStop(1, 'rgba(120,100,80,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, s * 0.42, 0, Math.PI * 2); g.fill();
  gr = g.createRadialGradient(c, c, 0, c, c, s * 0.2);
  gr.addColorStop(0, 'rgba(5,4,3,1)'); gr.addColorStop(0.75, 'rgba(18,14,10,.95)'); gr.addColorStop(1, 'rgba(30,24,18,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, s * 0.2, 0, Math.PI * 2); g.fill();
});
function bloodSplatTex(seed) {
  return canvasTex(256, (g, s) => {
    const c = s / 2;
    const col = (a) => `rgba(${70 + seed * 10},${4 + seed},${4},${a})`;
    // ana leke
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * s * 0.16, r = s * (0.05 + Math.random() * 0.12);
      g.fillStyle = col(0.75 + Math.random() * 0.25);
      g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
    }
    // sıçrama damlaları + uzantılar
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, d = s * (0.18 + Math.random() * 0.3), r = s * (0.004 + Math.random() * 0.02);
      const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      g.fillStyle = col(0.8);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (Math.random() < 0.4) { g.strokeStyle = col(0.6); g.lineWidth = r; g.beginPath(); g.moveTo(c + Math.cos(a) * s * 0.12, c + Math.sin(a) * s * 0.12); g.lineTo(x, y); g.stroke(); }
    }
  });
}
const poolTex = () => canvasTex(256, (g, s) => {
  const c = s / 2;
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * s * 0.18, r = s * (0.1 + Math.random() * 0.14);
    const gr = g.createRadialGradient(c + Math.cos(a) * d, c + Math.sin(a) * d, 0, c + Math.cos(a) * d, c + Math.sin(a) * d, r);
    gr.addColorStop(0, 'rgba(60,2,2,.95)'); gr.addColorStop(0.85, 'rgba(70,4,4,.9)'); gr.addColorStop(1, 'rgba(70,4,4,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
  }
});
const scorchTex = () => canvasTex(256, (g, s) => {
  const c = s / 2;
  const gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, 'rgba(8,6,5,.95)'); gr.addColorStop(0.5, 'rgba(20,16,12,.7)'); gr.addColorStop(1, 'rgba(30,25,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(10,8,6,.6)';
  for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * c * (0.6 + Math.random() * 0.4), c + Math.sin(a) * c * (0.6 + Math.random() * 0.4)); g.stroke(); }
});

// ---------------------------------------------------------------- GPU parçacık sistemi
class Particles {
  constructor(scene, max, tex, additive) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.rgba = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('rgba', this.aCol); g.setAttribute('size', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float scale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; vC = rgba; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb * t.rgb, vC.a * t.a); if (gl_FragColor.a < 0.004) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  emit(p, v, life, s0, s1, color, alpha, grav = 0, drag = 1) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = alpha;
    this.rgba[i * 4] = color.r; this.rgba[i * 4 + 1] = color.g; this.rgba[i * 4 + 2] = color.b;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.size[i] !== 0) { this.size[i] = 0; this.rgba[i * 4 + 3] = 0; } continue; }
      this.life[i] -= dt;
      const k = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const j = i * 3, damp = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j + 1] -= this.grav[i] * dt;
      this.vel[j] *= damp; this.vel[j + 1] *= damp; this.vel[j + 2] *= damp;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(k);
      this.rgba[i * 4 + 3] = this.a0[i] * (1 - k) * Math.min(1, k * 12 + 0.3);
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

// ---------------------------------------------------------------- kalıcı izler (instanced decal halkası)
class DecalRing {
  constructor(scene, tex, max, opts = {}) {
    this.max = max; this.i = 0;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: opts.rough ?? 0.9, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.count = 0; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  add(point, normal, size, spin = Math.random() * 6.28) {
    const n = new THREE.Vector3(...(normal.isVector3 ? normal.toArray() : normal)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
    const p = new THREE.Vector3().copy(point).addScaledVector(n, 0.006 + (this.i % 7) * 0.0006);
    const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(size, size, 1));
    this.mesh.setMatrixAt(this.i, m);
    const idx = this.i;
    this.i = (this.i + 1) % this.max;
    this.mesh.count = Math.min(this.max, Math.max(this.mesh.count, this.i === 0 ? this.max : this.i));
    this.mesh.instanceMatrix.needsUpdate = true;
    return idx;
  }
  setScale(idx, point, normal, size, spin) { // havuz büyütme için
    const n = new THREE.Vector3(...normal).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
    this.mesh.setMatrixAt(idx, new THREE.Matrix4().compose(new THREE.Vector3().copy(point).addScaledVector(n, 0.004), q, new THREE.Vector3(size, size, 1)));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.i = 0; }
}

// ---------------------------------------------------------------- fizikli küçük parçalar (instanced)
class Debris {
  constructor(scene, geo, mat, max, life = 2.5) {
    this.max = max; this.i = 0; this.lifeT = life;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.items = Array.from({ length: max }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, s: 1, bounced: false }));
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, zero);
    scene.add(this.mesh);
    this.onBounce = null;
  }
  spawn(p, v, s = 1) {
    const it = this.items[this.i]; this.i = (this.i + 1) % this.max;
    it.alive = true; it.p.copy(p); it.v.copy(v); it.life = this.lifeT * (0.7 + Math.random() * 0.6); it.s = s; it.bounced = false;
    it.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    it.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
  }
  update(dt) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (!it.alive) continue;
      any = true;
      it.life -= dt;
      if (it.life <= 0) { it.alive = false; this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
      it.v.y -= 14 * dt;
      it.p.addScaledVector(it.v, dt);
      const gnd = groundHeight(it.p.x, it.p.y + 0.3, it.p.z, 0.01);
      if (it.p.y < gnd + 0.01) {
        it.p.y = gnd + 0.01;
        if (it.v.y < -1.2 && this.onBounce && !it.bounced) this.onBounce(it.p);
        it.bounced = true;
        it.v.y = -it.v.y * 0.3; it.v.x *= 0.55; it.v.z *= 0.55; it.w.multiplyScalar(0.5);
      }
      it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
      const fade = Math.min(1, it.life * 2);
      this.mesh.setMatrixAt(i, m.compose(it.p, q.setFromEuler(it.r), sc.setScalar(it.s * fade)));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const it of this.items) it.alive = false; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, z); this.mesh.instanceMatrix.needsUpdate = true; }
}

const C = (hex) => new THREE.Color(hex);
const rnd = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = []; // izler (tracer) gibi kısa ömürlü meshler
    this.smoke = new Particles(scene, 1400, smokeTex(), false);
    this.soft = new Particles(scene, 1200, softTex(), false);
    this.drops = new Particles(scene, 900, dropTex(), false);
    this.glow = new Particles(scene, 600, softTex(), true);
    this.holes = new DecalRing(scene, holeTex(), 300);
    this.splats = [0, 1, 2].map((k) => new DecalRing(scene, bloodSplatTex(k), 50, { rough: 0.35 }));
    this.pools = new DecalRing(scene, poolTex(), 16, { rough: 0.15 });
    this.scorch = new DecalRing(scene, scorchTex(), 16);
    this.poolAnim = [];
    this.chipsStone = new Debris(scene, new THREE.BoxGeometry(0.035, 0.025, 0.03), new THREE.MeshStandardMaterial({ color: '#c9ac80', roughness: 1 }), 220, 2.2);
    this.chipsWood = new Debris(scene, new THREE.BoxGeometry(0.012, 0.012, 0.09), new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.9 }), 160, 2.2);
    const shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8); shellGeo.rotateZ(Math.PI / 2);
    this.shells = new Debris(scene, shellGeo, new THREE.MeshStandardMaterial({ color: '#c9a043', roughness: 0.25, metalness: 1 }), 120, 4);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.BoxGeometry(0.01, 0.01, 1); this.tracerGeo.translate(0, 0, -0.5);
    this.grenadeMeshes = new Map();
    this.grenadeGeo = new THREE.SphereGeometry(0.07, 10, 8);
    this.grenadeMat = new THREE.MeshStandardMaterial({ color: '#4a5a2a', roughness: 0.7 });
    this.bombMesh = this.makeBomb();
    this.light = { l: new THREE.PointLight('#ffb050', 0, 8, 2), t: 0, max: 1, i0: 0 };
    scene.add(this.light.l);
  }

  // kamera/ekran boyutuna göre nokta parçacık ölçeği
  setView(camera, heightPx) {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const p of [this.smoke, this.soft, this.drops, this.glow]) p.mat.uniforms.scale.value = s;
  }

  makeBomb() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: '#4a5a2a', roughness: 0.8 }));
    body.position.y = 0.06; body.castShadow = true; g.add(body);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: '#111' }));
    pad.position.set(0.04, 0.13, 0); g.add(pad);
    this.bombLed = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }));
    this.bombLed.position.set(-0.1, 0.135, 0); g.add(this.bombLed);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  flashLight(pos, intensity = 4, dur = 0.05, color = '#ffb050', dist = 8) {
    const s = this.light;
    if (s.t > 0 && s.i0 > intensity) return; // daha güçlü bir flaş sürüyor
    s.l.position.copy(pos); s.l.color.set(color); s.l.distance = dist; s.l.intensity = intensity; s.t = dur; s.max = dur; s.i0 = intensity;
  }

  tracer(from, to) {
    const d = to.clone().sub(from); const len = d.length();
    if (len < 1.5) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    m.position.copy(from); m.lookAt(to); m.scale.set(1, 1, Math.min(len, 60));
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.045, max: 0.045 });
  }

  surfaceAt(point, n) {
    const x = point.x - n[0] * 0.05, y = point.y - n[1] * 0.05, z = point.z - n[2] * 0.05;
    const ch = cellChar(Math.floor(x / CELL), Math.floor(z / CELL));
    if (n[1] > 0.7 && y < 0.05) return 'ground';
    if (ch === 'c' || ch === 'C') return 'wood';
    return 'stone';
  }

  // mermi isabeti: delik + toz + kıymık (+ taşta kıvılcım)
  impact(point, normal) {
    const n = normal || [0, 1, 0];
    const nv = V(n[0], n[1], n[2]);
    const surf = this.surfaceAt(point, n);
    this.holes.add(point, nv, surf === 'wood' ? rnd(0.1, 0.13) : rnd(0.13, 0.18));
    const dust = surf === 'wood' ? C('#9a7650') : surf === 'ground' ? C('#bba27e') : C('#d6bf98');
    // ani püskürme
    for (let i = 0; i < 6; i++) {
      const v = nv.clone().multiplyScalar(rnd(1.5, 4)).add(V(rnd(-1, 1), rnd(-0.3, 1.2), rnd(-1, 1)));
      this.soft.emit(point, v, rnd(0.25, 0.5), rnd(0.04, 0.08), rnd(0.14, 0.25), dust, 0.85, 3, 4);
    }
    // asılı kalan toz bulutu
    for (let i = 0; i < 4; i++) {
      const v = nv.clone().multiplyScalar(rnd(0.3, 0.9)).add(V(rnd(-0.25, 0.25), rnd(0.05, 0.35), rnd(-0.25, 0.25)));
      this.smoke.emit(point.clone().addScaledVector(nv, 0.05), v, rnd(1.2, 2.4), rnd(0.15, 0.25), rnd(0.6, 1.1), dust, 0.45, -0.05, 1.6);
    }
    // parçalar
    const deb = surf === 'wood' ? this.chipsWood : this.chipsStone;
    for (let i = 0; i < (surf === 'ground' ? 3 : 5); i++) deb.spawn(point.clone().addScaledVector(nv, 0.03), nv.clone().multiplyScalar(rnd(1.5, 4)).add(V(rnd(-1.5, 1.5), rnd(0, 2.5), rnd(-1.5, 1.5))), rnd(0.6, 1.3));
    if (surf === 'stone' && Math.random() < 0.45) {
      for (let i = 0; i < 4; i++) this.glow.emit(point, nv.clone().multiplyScalar(rnd(2, 6)).add(V(rnd(-3, 3), rnd(-1, 3), rnd(-3, 3))), rnd(0.08, 0.18), 0.025, 0.01, C('#ffc070'), 1, 9, 1);
    }
  }

  // kan: sis + damlalar + arkadaki duvara/yere sıçrama
  blood(point, dir, big = false) {
    const d = dir ? dir.clone().normalize() : V(0, 0, 0);
    const red = C('#7a0606'), dark = C('#3d0202');
    for (let i = 0; i < (big ? 14 : 8); i++) {
      const v = d.clone().multiplyScalar(rnd(0.5, 2.5)).add(V(rnd(-0.8, 0.8), rnd(-0.2, 0.9), rnd(-0.8, 0.8)));
      this.soft.emit(point, v, rnd(0.25, 0.55), rnd(0.08, 0.14), rnd(0.35, 0.7) * (big ? 1.4 : 1), red, 0.85, 1.5, 3);
    }
    for (let i = 0; i < (big ? 30 : 16); i++) {
      const v = d.clone().multiplyScalar(rnd(2, 6)).add(V(rnd(-1.5, 1.5), rnd(-0.5, 2.5), rnd(-1.5, 1.5)));
      this.drops.emit(point, v, rnd(0.4, 0.8), rnd(0.025, 0.05), rnd(0.015, 0.03), dark, 1, 9.8, 0.3);
    }
    // arkadaki duvara sıçrama
    if (dir) {
      const h = raycastMap(point.x, point.y, point.z, d.x, d.y, d.z, 3.2);
      if (h) {
        const p = point.clone().addScaledVector(d, h.t);
        this.splats[Math.floor(Math.random() * 3)].add(p, V(...h.n), rnd(0.5, 1.0) * (big ? 1.4 : 1) * (1 - h.t / 4));
      }
    }
    // yere damlalar
    const gh = raycastMap(point.x, point.y, point.z, d.x * 0.3, -1, d.z * 0.3, 3);
    if (gh) {
      const p = point.clone().add(V(d.x * 0.3 * gh.t, -gh.t, d.z * 0.3 * gh.t));
      this.splats[Math.floor(Math.random() * 3)].add(p, V(...gh.n), rnd(0.3, 0.55));
    }
  }

  // ölen oyuncunun altında büyüyen kan gölü
  bloodPool(pos) {
    const p = V(pos.x, groundHeight(pos.x, pos.y + 0.2, pos.z, 0.1), pos.z);
    const spin = Math.random() * 6.28;
    const idx = this.pools.add(p, V(0, 1, 0), 0.2, spin);
    this.poolAnim.push({ idx, p, spin, t: 0, size: rnd(1.4, 2.0) });
  }

  // boş kovan
  shell(pos, vel, big = false) { this.shells.spawn(pos, vel, big ? 1.5 : 1); }

  muzzleSmoke(pos, dir) {
    for (let i = 0; i < 3; i++) {
      const v = dir.clone().multiplyScalar(rnd(0.4, 1.2)).add(V(rnd(-0.15, 0.15), rnd(0.1, 0.4), rnd(-0.15, 0.15)));
      this.smoke.emit(pos, v, rnd(0.6, 1.1), 0.06, rnd(0.3, 0.5), C('#cfcac2'), 0.22, -0.2, 1.5);
    }
  }

  explosion(pos, big) {
    const s = big ? 2.4 : 1;
    this.flashLight(pos.clone().add(V(0, 1, 0)), 60 * s, 0.4, '#ffa040', 26 * s);
    for (let i = 0; i < 40 * s; i++) {
      const v = V(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(3, 10) * s);
      this.glow.emit(pos.clone().add(V(0, 0.4, 0)), v, rnd(0.25, 0.55), rnd(0.6, 1.2) * s, rnd(1.4, 2.6) * s, C(Math.random() < 0.5 ? '#ffb04a' : '#ff7a20'), 1, 0, 4);
    }
    for (let i = 0; i < 30 * s; i++) this.glow.emit(pos.clone().add(V(0, 0.3, 0)), V(rnd(-14, 14), rnd(4, 16), rnd(-14, 14)), rnd(0.4, 0.9), 0.06, 0.03, C('#ffd080'), 1, 14, 0.5);
    for (let i = 0; i < 26 * s; i++) {
      const v = V(rnd(-2.5, 2.5), rnd(1, 4), rnd(-2.5, 2.5)).multiplyScalar(s * 0.7);
      this.smoke.emit(pos.clone().add(V(rnd(-0.5, 0.5), 0.6, rnd(-0.5, 0.5))), v, rnd(2.5, 5), rnd(1.0, 1.6) * s, rnd(3.5, 6) * s, C('#5a524a'), 0.7, -0.15, 0.8);
    }
    for (let i = 0; i < 18 * s; i++) this.chipsStone.spawn(pos.clone().add(V(0, 0.3, 0)), V(rnd(-8, 8), rnd(3, 10), rnd(-8, 8)), rnd(1, 2.5));
    const gp = V(pos.x, groundHeight(pos.x, pos.y + 0.3, pos.z, 0.1), pos.z);
    this.scorch.add(gp, V(0, 1, 0), (big ? 6 : 2.6) * rnd(0.9, 1.1));
  }

  setGrenades(list) {
    const seen = new Set();
    for (const [id, x, y, z] of list) {
      seen.add(id);
      let m = this.grenadeMeshes.get(id);
      if (!m) { m = new THREE.Mesh(this.grenadeGeo, this.grenadeMat); m.castShadow = true; this.scene.add(m); this.grenadeMeshes.set(id, m); m.userData.target = V(x, y, z); m.position.set(x, y, z); }
      m.userData.target.set(x, y, z);
    }
    for (const [id, m] of this.grenadeMeshes) if (!seen.has(id)) { this.scene.remove(m); this.grenadeMeshes.delete(id); }
  }

  setBomb(b, timeLeft) {
    const show = b && (b.s === 'planted' || b.s === 'dropped') && b.p;
    this.bombMesh.visible = !!show;
    if (show) {
      this.bombMesh.position.set(b.p[0], b.p[1], b.p[2]);
      if (b.s === 'planted') {
        const rate = timeLeft > 20 ? 1 : timeLeft > 10 ? 2 : timeLeft > 5 ? 4 : 8;
        this.bombLed.visible = (performance.now() / 1000 * rate) % 1 < 0.3;
      } else this.bombLed.visible = false;
    }
  }

  clearDecals() {
    this.holes.clear(); this.splats.forEach((s) => s.clear()); this.pools.clear(); this.scorch.clear(); this.poolAnim = [];
    this.shells.clear(); this.chipsStone.clear(); this.chipsWood.clear();
  }

  update(dt) {
    for (const [, m] of this.grenadeMeshes) { m.position.lerp(m.userData.target, Math.min(1, dt * 15)); m.rotation.x += dt * 8; }
    const L = this.light;
    if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.i0 * (L.t / L.max)); if (L.t <= 0) { L.l.intensity = 0; L.i0 = 0; } }
    this.smoke.update(dt); this.soft.update(dt); this.drops.update(dt); this.glow.update(dt);
    this.chipsStone.update(dt); this.chipsWood.update(dt); this.shells.update(dt);
    for (const a of this.poolAnim) {
      if (a.t >= 1) continue;
      a.t = Math.min(1, a.t + dt / 5);
      this.pools.setScale(a.idx, a.p, [0, 1, 0], 0.2 + (a.size - 0.2) * (1 - Math.pow(1 - a.t, 2)), a.spin);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { this.scene.remove(it.obj); it.obj.material.dispose(); this.items.splice(i, 1); continue; }
      it.obj.material.opacity = 0.8 * (it.life / it.max);
    }
  }
}
