// Harita görselleri: Polyhaven HDRI + PBR dokular + dekor modelleri, prosedürel mimari detaylar
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAP_W, MAP_H, CELL, cellChar, cellHeight, buildingRand } from '/shared/map.js';

const PH = '/assets/polyhaven';
const tl = new THREE.TextureLoader();
let MAX_ANISO = 8;

// ---------------------------------------------------------------- malzemeler
const texCache = {};
function tex(key, name, srgb) {
  const id = `${key}/${name}`;
  if (!texCache[id]) {
    const t = tl.load(`${PH}/textures/${key}/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = MAX_ANISO;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache[id] = t;
  }
  return texCache[id];
}
function pbr(key, opts = {}) {
  const arm = tex(key, 'arm');
  return new THREE.MeshStandardMaterial({
    map: tex(key, 'diff', true), normalMap: tex(key, 'nor'),
    aoMap: arm, roughnessMap: arm, metalnessMap: arm,
    roughness: opts.rough ?? 1, metalness: opts.metal ?? 0, color: opts.color || '#ffffff',
    normalScale: new THREE.Vector2(opts.ns ?? 1, opts.ns ?? 1),
  });
}

// ---------------------------------------------------------------- geometri oluşturucu (dünya koordinatlı UV)
class Geo {
  constructor(uvScale = 0.4) { this.p = []; this.n = []; this.u = []; this.s = uvScale; }
  tri(a, b, c, n, ua, ub, uc) { this.p.push(...a, ...b, ...c); this.n.push(...n, ...n, ...n); this.u.push(...ua, ...ub, ...uc); }
  quad(a, b, c, d, n, ua, ub, uc, ud) { this.tri(a, b, c, n, ua, ub, uc); this.tri(a, c, d, n, ua, uc, ud); }
  face(dir, x0, y0, z0, x1, y1, z1) {
    const s = this.s;
    switch (dir) {
      case 'py': this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s], [x0 * s, z0 * s]); break;
      case 'ny': this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s]); break;
      case 'pz': this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]); break;
      case 'nz': this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-x1 * s, y0 * s], [-x0 * s, y0 * s], [-x0 * s, y1 * s], [-x1 * s, y1 * s]); break;
      case 'px': this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [-z1 * s, y0 * s], [-z0 * s, y0 * s], [-z0 * s, y1 * s], [-z1 * s, y1 * s]); break;
      case 'nx': this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]); break;
    }
  }
  box(x0, y0, z0, x1, y1, z1, skip = {}) {
    for (const d of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) if (!skip[d]) this.face(d, x0, y0, z0, x1, y1, z1);
  }
  get empty() { return this.p.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// yüz yönü -> teğet ve dışa normal
const FACE = {
  pz: { n: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(1, 0, 0) },
  nz: { n: new THREE.Vector3(0, 0, -1), t: new THREE.Vector3(-1, 0, 0) },
  px: { n: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, 0, -1) },
  nx: { n: new THREE.Vector3(-1, 0, 0), t: new THREE.Vector3(0, 0, 1) },
};
const UP = new THREE.Vector3(0, 1, 0);
function faceMatrix(dir, origin, u, v, w, rotY = 0, scale = null) {
  const f = FACE[dir];
  const pos = origin.clone().addScaledVector(f.t, u).add(new THREE.Vector3(0, v, 0)).addScaledVector(f.n, w);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.t, UP, f.n));
  if (rotY) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, rotY));
  return new THREE.Matrix4().compose(pos, q, scale || new THREE.Vector3(1, 1, 1));
}

function rand(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

function stripeTex(c1, c2) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * 16, 0, 16, 128); }
  g.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 1, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function decalTex(letter) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.globalAlpha = 0.85; g.strokeStyle = '#e8a33a'; g.fillStyle = '#e8a33a'; g.lineWidth = 12;
  g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.font = 'bold 170px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, 128, 138);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { g.globalAlpha = Math.random() * 0.6; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 5); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function signTex(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2620'; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
  g.fillStyle = '#f0d9a8'; g.font = 'bold 50px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- ana kurulum
export function buildWorld(scene, renderer, quality = 'ultra') {
  MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  const W = MAP_W * CELL, H = MAP_H * CELL;
  const isWall = (x, z) => cellChar(x, z) === '#';
  const R = rand(1337);

  const M = {
    sandstone: pbr('wall_sandstone'),
    plaster: pbr('wall_plaster', { color: '#fff4e2' }),
    clay: pbr('wall_clay', { color: '#f6e3c9' }),
    roof: pbr('wall_clay', { color: '#f4e4cc' }),
    trim: pbr('wall_sandstone', { color: '#f1e6d4' }),
    cobble: pbr('floor_cobble', { ns: 1.2 }),
    sand: pbr('floor_sand'),
    tiles: pbr('floor_tiles', { color: '#f2e2c8' }),
    concrete: pbr('floor_concrete', { color: '#b9ae9c' }),
    wood: pbr('wood', { color: '#b48a62' }),
    darkwood: pbr('wood', { color: '#6e4c33' }),
    metal: pbr('metal', { metal: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#25303a', roughness: 0.04, metalness: 0.1, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffb347', emissiveIntensity: 4 }),
  };
  const wallMats = ['sandstone', 'plaster', 'clay'];
  const wallMatOf = (x, z) => {
    if (x <= 0 || z <= 0 || x >= MAP_W - 1 || z >= MAP_H - 1) return 'sandstone';
    const r = buildingRand(x, z, 3);
    return r < 0.5 ? 'sandstone' : r < 0.78 ? 'plaster' : 'clay';
  };
  const addMesh = (geo, mat, cast = true, recv = true) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m;
  };

  // ---- zemin bölgeleri
  const floors = { cobble: new Geo(0.45), sand: new Geo(0.3), tiles: new Geo(0.4), concrete: new Geo(0.3) };
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const ch = cellChar(x, z);
    if (ch === '#') continue;
    const inSpawn = (z <= 7 && x >= 19 && x <= 28) || (z >= 36 && x >= 18 && x <= 29);
    const inSite = (x >= 34 && x <= 43 && z >= 4 && z <= 13) || (x >= 4 && x <= 13 && z >= 4 && z <= 13);
    const inSand = (x >= 40 && z >= 15) || (x >= 30 && z >= 37) || (x <= 9 && z >= 22) || (x >= 5 && x <= 12 && z >= 17 && z <= 23);
    const k = inSpawn ? 'concrete' : inSite ? 'tiles' : inSand ? 'sand' : 'cobble';
    floors[k].face('py', x * CELL, 0, z * CELL, (x + 1) * CELL, 0, (z + 1) * CELL);
  }
  for (const [k, g] of Object.entries(floors)) if (!g.empty) addMesh(g.build(), M[k], false, true);
  const outerG = new Geo(0.3);
  outerG.face('py', -300, -0.02, -300, W + 300, -0.02, H + 300);
  addMesh(outerG.build(), M.sand, false, true);

  // ---- duvarlar / binalar
  const wallG = { sandstone: new Geo(0.4), plaster: new Geo(0.4), clay: new Geo(0.4) };
  const roofG = new Geo(0.3), trimG = new Geo(0.6);
  const exposed = [];
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    if (!isWall(x, z)) continue;
    const h = cellHeight(x, z);
    const x0 = x * CELL, z0 = z * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
    const g = wallG[wallMatOf(x, z)];
    const nb = { px: [x + 1, z], nx: [x - 1, z], pz: [x, z + 1], nz: [x, z - 1] };
    for (const [d, [nx, nz]] of Object.entries(nb)) {
      if (nx < 0 || nz < 0 || nx >= MAP_W || nz >= MAP_H) continue;
      const nh = isWall(nx, nz) ? cellHeight(nx, nz) : 0;
      if (nh >= h) continue;
      g.face(d, x0, nh, z0, x1, h, z1);
      if (!isWall(nx, nz)) {
        exposed.push({ dir: d, x, z, h });
        // kat silmesi (yatay şerit)
        const t = 0.1, e = { px: [x1, x1 + t], nx: [x0 - t, x0], pz: [z1, z1 + t], nz: [z0 - t, z0] }[d];
        if (d === 'px' || d === 'nx') trimG.box(e[0], 3.2, z0, e[1], 3.4, z1, { ny: 0 });
        else trimG.box(x0, 3.2, e[0], x1, 3.4, e[1], { ny: 0 });
        trimG.box(...(d === 'px' || d === 'nx' ? [e[0], 0, z0, e[1], 0.35, z1] : [x0, 0, e[0], x1, 0.35, e[1]]));
      }
    }
    roofG.face('py', x0, 0, z0, x1, h, z1);
    // çatı korkuluğu
    const edgeAt = (nx, nz) => !isWall(nx, nz) || cellHeight(nx, nz) < h;
    const pt = 0.25, ph = 0.6;
    if (edgeAt(x + 1, z)) trimG.box(x1 - pt, h, z0, x1, h + ph, z1);
    if (edgeAt(x - 1, z)) trimG.box(x0, h, z0, x0 + pt, h + ph, z1);
    if (edgeAt(x, z + 1)) trimG.box(x0, h, z1 - pt, x1, h + ph, z1);
    if (edgeAt(x, z - 1)) trimG.box(x0, h, z0, x1, h + ph, z0 + pt);
  }
  for (const k of wallMats) if (!wallG[k].empty) addMesh(wallG[k].build(), M[k]);
  addMesh(roofG.build(), M.roof, false, true);
  addMesh(trimG.build(), M.trim);

  // ---- mimari detaylar (instanced)
  const addInst = (geo, mat, list, cast = true) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = cast; im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    scene.add(im); return im;
  };
  const L = { frame: [], glass: [], sill: [], shutter: [], beam: [], door: [], doorFrame: [], awning: [], lampBody: [], lampGlow: [], pipe: [], ac: [] };
  const lampLights = [];
  for (const e of exposed) {
    const f = FACE[e.dir];
    const o = new THREE.Vector3(e.x * CELL + CELL / 2 + f.n.x * CELL / 2, 0, e.z * CELL + CELL / 2 + f.n.z * CELL / 2);
    const r = buildingRand(e.x * 4 + e.z, e.z * 4 + e.x, 7 + (e.dir.charCodeAt(1) % 5));
    const mat = wallMatOf(e.x, e.z);
    if (mat !== 'sandstone') for (const u of [-0.55, 0.55]) L.beam.push(faceMatrix(e.dir, o, u, e.h - 0.85, 0.22));
    if (e.h >= 7 && r < 0.42) {
      const v = e.h - 2.6;
      L.frame.push(faceMatrix(e.dir, o, 0, v, 0.04));
      L.glass.push(faceMatrix(e.dir, o, 0, v, 0.06));
      L.sill.push(faceMatrix(e.dir, o, 0, v - 0.82, 0.12));
      if (r < 0.2) { L.shutter.push(faceMatrix(e.dir, o, -0.82, v, 0.28, -1.1)); L.shutter.push(faceMatrix(e.dir, o, 0.82, v, 0.28, 1.1)); }
    } else if (r > 0.86) {
      L.doorFrame.push(faceMatrix(e.dir, o, 0, 1.2, 0.05));
      L.door.push(faceMatrix(e.dir, o, 0, 1.1, 0.08));
      if (r > 0.93) L.awning.push(faceMatrix(e.dir, o, 0, 2.75, 0.55));
      else {
        L.lampBody.push(faceMatrix(e.dir, o, 0.95, 2.6, 0.14));
        L.lampGlow.push(faceMatrix(e.dir, o, 0.95, 2.55, 0.16));
        if (lampLights.length < 8) lampLights.push(o.clone().addScaledVector(f.t, 0.95).add(new THREE.Vector3(0, 2.5, 0)).addScaledVector(f.n, 0.45));
      }
    } else if (r > 0.78 && e.h >= 7) {
      L.ac.push(faceMatrix(e.dir, o, 0.2, 3.9, 0.25));
    } else if (r > 0.7) {
      L.pipe.push(faceMatrix(e.dir, o, 0.85, e.h / 2, 0.08, 0, new THREE.Vector3(1, e.h, 1)));
    }
  }
  addInst(new THREE.BoxGeometry(1.15, 1.6, 0.14), M.darkwood, L.frame);
  addInst(new THREE.BoxGeometry(0.92, 1.36, 0.06), M.glass, L.glass, false);
  addInst(new THREE.BoxGeometry(1.35, 0.1, 0.24), M.trim, L.sill);
  addInst(new THREE.BoxGeometry(0.55, 1.45, 0.04), M.wood, L.shutter);
  addInst((() => { const g = new THREE.CylinderGeometry(0.09, 0.1, 0.55, 8); g.rotateX(Math.PI / 2); return g; })(), M.darkwood, L.beam);
  addInst(new THREE.BoxGeometry(1.45, 2.4, 0.12), M.trim, L.doorFrame);
  addInst(new THREE.BoxGeometry(1.15, 2.2, 0.12), M.darkwood, L.door);
  addInst(new THREE.BoxGeometry(0.18, 0.3, 0.18), M.metal, L.lampBody);
  addInst(new THREE.BoxGeometry(0.12, 0.18, 0.14), M.lamp, L.lampGlow, false);
  addInst(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), M.metal, L.pipe);
  addInst(new THREE.BoxGeometry(0.8, 0.55, 0.45), new THREE.MeshStandardMaterial({ color: '#c9c7c0', roughness: 0.5, metalness: 0.4 }), L.ac);
  if (L.awning.length) {
    const g = new THREE.PlaneGeometry(1.9, 1.15); g.rotateX(-Math.PI / 2 + 0.45);
    [['#b33a2e', '#efe3c8'], ['#2e6b8f', '#efe3c8'], ['#3f7a3a', '#efe3c8']].forEach((c, i) => {
      addInst(g, new THREE.MeshStandardMaterial({ map: stripeTex(c[0], c[1]), side: THREE.DoubleSide, roughness: 0.9 }), L.awning.filter((_, j) => j % 3 === i));
    });
  }
  // fenerler: nokta ışık yerine sahte ışık halesi (performans)
  if (lampLights.length) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g2 = c.getContext('2d'); const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,190,110,.55)'); gr.addColorStop(1, 'rgba(255,160,80,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
    const halo = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (const p of lampLights) { const sp = new THREE.Sprite(halo); sp.position.copy(p); sp.scale.set(2.2, 2.2, 1); scene.add(sp); }
  }

  // ---- kemerler (geçit girişleri, sadece görsel)
  const arches = [
    { a: 'x', from: 46, to: 50, at: 28 }, { a: 'x', from: 12, to: 20, at: 30 }, { a: 'x', from: 66, to: 72, at: 30 },
    { a: 'x', from: 80, to: 88, at: 30 }, { a: 'x', from: 44, to: 52, at: 72 },
    { a: 'z', from: 6, to: 10, at: 58 }, { a: 'z', from: 10, to: 14, at: 38 }, { a: 'z', from: 72, to: 78, at: 36 }, { a: 'z', from: 74, to: 82, at: 60 },
  ];
  for (const ar of arches) {
    const w = ar.to - ar.from, spring = 3.9, top = 6.0, depth = 0.8;
    const ry = Math.min(w / 2, 1.5);
    const shape = new THREE.Shape();
    shape.moveTo(0, spring); shape.lineTo(0, top); shape.lineTo(w, top); shape.lineTo(w, spring);
    shape.absellipse(w / 2, spring, w / 2, ry, 0, Math.PI, false);
    const eg = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 18 });
    const uv = eg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
    const m = new THREE.Mesh(eg, M.sandstone); m.castShadow = true; m.receiveShadow = true;
    if (ar.a === 'x') m.position.set(ar.from, 0, ar.at - depth / 2);
    else { m.rotation.y = -Math.PI / 2; m.position.set(ar.at - depth / 2, 0, ar.from); }
    scene.add(m);
  }

  // ---- bomba bölgesi işaretleri ve tabelalar
  const decal = (letter, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: decalTex(letter), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.9 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true; scene.add(m);
  };
  decal('A', 80, 13); decal('B', 13.2, 13);
  const sign = (text, x, y, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: signTex(text), roughness: 0.7 }));
    m.position.set(x, y, z); m.rotation.y = rotY; scene.add(m);
  };
  sign('A →', 59.86, 2.4, 73, -Math.PI / 2);
  sign('B →', 36.14, 2.4, 80, Math.PI / 2);
  sign('ORTA ↑', 40, 2.4, 72.14, 0);
  sign('A ↑', 80.14, 2.4, 56, Math.PI / 2);
  sign('B ↑', 19.86, 2.4, 50, -Math.PI / 2);

  // ---- harita dışı şehir silueti
  const skyG = { sandstone: new Geo(0.4), plaster: new Geo(0.4), clay: new Geo(0.4) };
  const roofG2 = new Geo(0.3);
  const SR = rand(99);
  for (let i = 0; i < 160; i++) {
    const side = i % 4, t = SR();
    const dist = 3 + SR() * 70, w = 6 + SR() * 14, d = 6 + SR() * 14, h = 8 + SR() * 16;
    let x, z;
    if (side === 0) { x = -10 + t * (W + 20); z = -dist - d; }
    else if (side === 1) { x = -10 + t * (W + 20); z = H + dist; }
    else if (side === 2) { z = -10 + t * (H + 20); x = -dist - w; }
    else { z = -10 + t * (H + 20); x = W + dist; }
    skyG[wallMats[Math.floor(SR() * 3)]].box(x, 0, z, x + w, h, z + d, { ny: 1, py: 1 });
    roofG2.face('py', x, 0, z, x + w, h, z + d);
  }
  for (const k of wallMats) addMesh(skyG[k].build(), M[k], true, true);
  addMesh(roofG2.build(), M.roof, false, true);

  // ---- ışıklar
  const sun = new THREE.DirectionalLight('#fff0d8', 3.4);
  sun.position.set(W / 2 + 50, 90, H / 2 - 40);
  sun.target.position.set(W / 2, 0, H / 2);
  sun.castShadow = quality !== 'low';
  const sm = quality === 'ultra' ? 4096 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#cfe0f5', '#a5845c', 0.3));
  scene.fog = new THREE.Fog('#d9cfbd', 140, 480);
  scene.background = new THREE.Color('#a9c4dc');
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---- HDRI (asenkron)
  const envReady = new HDRLoader().loadAsync(`${PH}/hdri/goegap_4k.hdr`).then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 1.05;
    scene.background = hdr;
    const dir = findSun(hdr);
    if (dir) {
      const center = new THREE.Vector3(W / 2, 0, H / 2);
      sun.position.copy(center).addScaledVector(dir, 160);
      sun.target.position.copy(center);
    }
    return dir;
  }).catch((e) => { console.warn('HDRI yüklenemedi', e); });

  const propsReady = loadProps(scene, R);
  return { sun, envReady, propsReady, materials: M };
}

// HDR görüntüsündeki en parlak bölgeden güneş yönü
function findSun(hdr) {
  const img = hdr.image; if (!img?.data) return null;
  const { width: w, height: h, data } = img;
  const half = data instanceof Uint16Array;
  const val = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * 4;
    const l = val(i) * 0.2126 + val(i + 1) * 0.7152 + val(i + 2) * 0.0722;
    if (l > best) { best = l; bx = x; by = y; }
  }
  const u = (bx + 0.5) / w, v = hdr.flipY ? 1 - (by + 0.5) / h : (by + 0.5) / h;
  const phi = (u - 0.5) * Math.PI * 2, lat = (v - 0.5) * Math.PI;
  const d = new THREE.Vector3(Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat));
  window.__sunDebug = { bx, by, w, h, flipY: hdr.flipY, dir: d.toArray() };
  if (d.y < 0.25) d.y = 0.25;
  return d.normalize();
}

async function loadProps(scene, R) {
  const loader = new GLTFLoader();
  const load = (id) => loader.loadAsync(`${PH}/models/${id}/${id}.gltf`).then((g) => g.scene).catch(() => null);
  const ids = ['wooden_crate_01', 'wooden_crate_02', 'old_military_crate', 'Barrel_01', 'wooden_barrels_01', 'planter_pot_clay', 'ceramic_vase_02', 'potted_plant_02'];
  const objs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await load(id)])));
  for (const o of Object.values(objs)) o?.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  const sizeOf = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  // yerleşimleri topla, sonra model başına InstancedMesh üret (az draw call)
  const batches = {};
  const place = (id, x, y, z, sx, sy, sz, rot = 0) => {
    const src = objs[id]; if (!src) return;
    if (!src.userData.box) { src.updateMatrixWorld(true); src.userData.box = new THREE.Box3().setFromObject(src); }
    const b0 = src.userData.box, s = b0.getSize(new THREE.Vector3()), c0 = b0.getCenter(new THREE.Vector3());
    const sc = new THREE.Vector3(sx / s.x, sy / s.y, sz / s.z);
    // model merkezini tabana hizala, ölçekle, döndür, konumlandır
    const m = new THREE.Matrix4().makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationY(rot))
      .multiply(new THREE.Matrix4().makeScale(sc.x, sc.y, sc.z))
      .multiply(new THREE.Matrix4().makeTranslation(-c0.x, -b0.min.y, -c0.z));
    (batches[id] ||= []).push(m);
  };
  const placeU = (id, x, y, z, height, rot = 0) => {
    const src = objs[id]; if (!src) return;
    const s = sizeOf(src); const k = height / s.y;
    place(id, x, y, z, s.x * k, height, s.z * k, rot);
  };
  const flush = () => {
    for (const [id, mats] of Object.entries(batches)) {
      const src = objs[id];
      src.updateMatrixWorld(true);
      src.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(mesh.matrixWorld)));
        im.castShadow = true; im.receiveShadow = true;
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
        scene.add(im);
      });
    }
  };
  // çarpışma hücrelerindeki sandık yığınları
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const ch = cellChar(x, z);
    if (ch !== 'c' && ch !== 'C') continue;
    const r = R();
    const id = r < 0.45 ? 'wooden_crate_01' : r < 0.85 ? 'wooden_crate_02' : 'old_military_crate';
    const levels = ch === 'C' ? 2 : 1;
    for (let l = 0; l < levels; l++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const rot = Math.floor(R() * 4) * Math.PI / 2;
      place(l === 1 && R() < 0.3 ? 'wooden_crate_01' : id, x * CELL + 0.5 + i, l * 1.1, z * CELL + 0.5 + j, 0.98, 1.1, 0.98, rot);
    }
  }
  // duvar diplerine küçük dekorlar (çarpışmasız)
  const decor = [['Barrel_01', 1.0], ['planter_pot_clay', 0.55], ['ceramic_vase_02', 0.6], ['potted_plant_02', 0.9], ['wooden_barrels_01', 1.0]];
  let count = 0;
  for (let z = 1; z < MAP_H - 1; z++) for (let x = 1; x < MAP_W - 1; x++) {
    if (cellChar(x, z) !== '.') continue;
    if ((z <= 7 && x >= 19 && x <= 28) || (z >= 36 && x >= 18 && x <= 29)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (cellChar(x + dx, z + dz) !== '#') continue;
      let open = 0; for (let k = 1; k <= 3; k++) if (cellChar(x - dx * k, z - dz * k) !== '#') open++;
      if (open < 3 || R() > 0.08 || count > 70) continue;
      const [id, hgt] = decor[Math.floor(R() * decor.length)];
      const px = x * CELL + 1 + dx * 0.6, pz = z * CELL + 1 + dz * 0.6;
      const tx = dz !== 0 ? (R() - 0.5) * 1.2 : 0, tz = dx !== 0 ? (R() - 0.5) * 1.2 : 0;
      placeU(id, px + tx, 0, pz + tz, hgt, R() * 6.28);
      count++;
    }
  }
  flush();
}
