// "Liman" haritasının görselleri: yağmurlu konteyner limanı (orijinal tasarım)
import * as THREE from 'three';
import { MAP, MAP_W, MAP_H, CELL, cellChar, cellHeight } from '/shared/map.js';
import { pbr, Geo, FACE, faceMatrix, rand, setupSky, loadModels, PropBatcher, setAniso, addInstanced, canvasTexture } from './common.js';
import { makeWet } from '../render/reflection.js';

const TIER = 2.6;

// Konteyner malzemesi: dokuyu gri tona çevirip örnek rengiyle boyar, üstüne prosedürel yıpranma ekler:
// üst dikişten aşağı akan pas izleri, kat altında kir/çamur, pas lekeleri, dikişlerde koyulaşma, yağmurla ıslak parlaklık.
function tintable(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying float vSeed;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cwp = instanceMatrix * cwp;
          vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        #else
          vSeed = 0.5;
        #endif
        vWPos = (modelMatrix * cwp).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying float vSeed;
        float ch(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(ch(i), ch(i + vec2(1, 0)), u.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), u.x), u.y); }
        float cf(vec2 p){ return cn(p) * 0.55 + cn(p * 2.1 + 3.7) * 0.3 + cn(p * 4.3 + 9.1) * 0.15; }
        float cWear, cRust, cWet;`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          float lumC = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb *= vec3(clamp(lumC * 2.2, 0.0, 1.5));
        #endif
        {
          float hy = fract(vWPos.y / 2.6 + 0.0005);
          float u = vWPos.x + vWPos.z + vSeed * 50.0;
          // üstten akan pas izleri: yatayda dar, dikeyde uzun gürültü
          float st = cf(vec2(u * 3.2, vWPos.y * 0.22 + vSeed * 9.0));
          float streak = smoothstep(0.58, 0.82, st) * (0.35 + 0.65 * smoothstep(0.15, 0.95, hy));
          // pas lekeleri (kenar ve köşelerde daha yoğun)
          float rPatch = smoothstep(0.66, 0.8, cf(vec2(u * 0.9, vWPos.y * 0.9) + vSeed * 13.0));
          float edge = 1.0 - smoothstep(0.0, 0.08, min(hy, 1.0 - hy));
          cRust = clamp(streak * 0.75 + rPatch * 0.8 + edge * 0.35 * cn(vec2(u * 6.0, vWPos.y * 2.0)), 0.0, 1.0) * (0.35 + 0.65 * vSeed);
          vec3 rustCol = mix(vec3(0.26, 0.11, 0.05), vec3(0.42, 0.2, 0.08), cn(vec2(u * 8.0, vWPos.y * 4.0)));
          diffuseColor.rgb = mix(diffuseColor.rgb, rustCol, cRust * 0.85);
          // kat altında kir, yer seviyesinde çamur
          float dirt = (1.0 - smoothstep(0.0, 0.3, hy)) * 0.45 + (1.0 - smoothstep(0.0, 1.1, vWPos.y)) * 0.4;
          diffuseColor.rgb *= 1.0 - dirt * (0.6 + 0.4 * cn(vec2(u * 2.0, vWPos.y * 3.0)));
          // dikişlerde koyu çizgi
          diffuseColor.rgb *= 0.55 + 0.45 * smoothstep(0.0, 0.012, hy) * (1.0 - smoothstep(0.988, 1.0, hy));
          cWear = dirt; cWet = 1.0 - cRust;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(min(roughnessFactor, 0.42), 0.9, cRust);`);
  };
  mat.customProgramCacheKey = () => 'container-wear';
  return mat;
}

// uydurma nakliye firması logoları (aşınmış boya)
const LOGOS = [
  ['ANKA LINES', '#f2efe6', 'bird'], ['MARMARA', '#f4d35e', 'wave'], ['LEVANT', '#ffffff', 'star'],
  ['TETHYS', '#e8e4da', 'ring'], ['KARAYEL', '#ffb36b', 'arrow'],
];
function logoTex([name, col, mark]) {
  return canvasTexture(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 16;
    const cx = 120, cy = h / 2;
    if (mark === 'bird') { g.beginPath(); g.moveTo(40, cy + 40); g.quadraticCurveTo(cx, cy - 90, 200, cy + 40); g.quadraticCurveTo(cx, cy - 10, 40, cy + 40); g.fill(); }
    if (mark === 'wave') { g.beginPath(); for (let x = 30; x < 210; x += 4) g.lineTo(x, cy + Math.sin(x / 18) * 26); g.stroke(); g.beginPath(); for (let x = 30; x < 210; x += 4) g.lineTo(x, cy + 40 + Math.sin(x / 18) * 26); g.stroke(); }
    if (mark === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 36 : 84; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill(); }
    if (mark === 'ring') { g.beginPath(); g.arc(cx, cy, 70, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill(); }
    if (mark === 'arrow') { g.beginPath(); g.moveTo(40, cy - 40); g.lineTo(150, cy - 40); g.lineTo(150, cy - 80); g.lineTo(210, cy); g.lineTo(150, cy + 80); g.lineTo(150, cy + 40); g.lineTo(40, cy + 40); g.fill(); }
    g.font = 'bold 128px Arial'; g.textBaseline = 'middle'; g.fillText(name, 240, cy + 6);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) { g.globalAlpha = Math.random() * 0.8; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 7, 1 + Math.random() * 3); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  });
}

function waterNormals() {
  // dalga normal haritası: çok oktavlı sinüs dalgalarının türevi
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const img = g.createImageData(S, S);
  const waves = Array.from({ length: 14 }, () => ({ a: Math.random() * Math.PI * 2, f: 1 + Math.floor(Math.random() * 7), p: Math.random() * 6.28, amp: 0.5 + Math.random() }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) {
      const kx = Math.round(Math.cos(w.a) * w.f), ky = Math.round(Math.sin(w.a) * w.f);
      const ph = (kx * x + ky * y) / S * Math.PI * 2 + w.p;
      const d = Math.cos(ph) * w.amp / (w.f + 1);
      dx += d * kx; dy += d * ky;
    }
    const n = new THREE.Vector3(-dx * 0.18, -dy * 0.18, 1).normalize();
    const i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

function stripeTex() {
  return canvasTexture(256, 32, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#141414' : '#e2b322'; g.beginPath(); g.moveTo(i * 32 - 16, h); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 16, h); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 500; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
  });
}
function paintTex(draw, w = 512, h = 512) {
  const t = canvasTexture(w, h, (g) => { g.clearRect(0, 0, w, h); draw(g, w, h); });
  return t;
}
function wornPaint(g, w, h) {
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400; i++) { g.globalAlpha = Math.random() * 0.7; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 6, 1 + Math.random() * 3); }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

export function buildLiman({ root, scene, renderer, quality, reflection, shared }) {
  setAniso(renderer.capabilities.getMaxAnisotropy());
  const W = MAP_W * CELL, H = MAP_H * CELL;
  const R = rand(777);
  const M = {
    asphalt: pbr('asphalt', { color: '#717780' }),
    quay: pbr('quay_concrete', { color: '#b6b2aa' }),
    yard: pbr('quay_concrete', { color: '#a7a39b' }),
    floorIn: pbr('floor_concrete', { color: '#8e8a84' }),
    container: tintable(pbr('container', { metal: 0.35 })),
    corrugated: pbr('corrugated', { color: '#a9b0b4', metal: 0.6 }),
    roof: pbr('corrugated', { color: '#7f878c', metal: 0.6 }),
    brick: pbr('brick', { color: '#c9a99a' }),
    concreteWall: pbr('concrete_wall', { color: '#b0aca5' }),
    crane1: pbr('painted_metal', { color: '#e0a82a', metal: 0.4 }),
    crane2: pbr('painted_metal', { color: '#c9503a', metal: 0.4 }),
    steel: pbr('painted_metal', { color: '#4a4f55', metal: 0.7 }),
    hull: pbr('plate', { color: '#3a4a5c', metal: 0.45 }),
    hullRed: pbr('plate', { color: '#7a2a22', metal: 0.4 }),
    shipWhite: pbr('plate', { color: '#dcdcd6', metal: 0.3 }),
    shutter: pbr('shutter', { color: '#8d9aa3', metal: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.85 }),
    fluo: new THREE.MeshStandardMaterial({ color: '#e8f2ff', emissive: '#dfeeff', emissiveIntensity: 6 }),
    warm: new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45a', emissiveIntensity: 5 }),
    redLight: new THREE.MeshStandardMaterial({ color: '#ff3020', emissive: '#ff2010', emissiveIntensity: 8 }),
    window: new THREE.MeshStandardMaterial({ color: '#2a2a22', emissive: '#ffc070', emissiveIntensity: 1.6, roughness: 0.2 }),
  };
  const wetShared = shared || { uTime: { value: 0 }, uRain: { value: 1 } };
  if (reflection) {
    makeWet(M.asphalt, reflection, wetShared, { wet: 1, puddle: 1, puddleScale: 0.06, darken: 0.38, key: 'a' });
    makeWet(M.quay, reflection, wetShared, { wet: 0.9, puddle: 0.9, puddleScale: 0.07, darken: 0.45, key: 'q' });
    makeWet(M.yard, reflection, wetShared, { wet: 0.95, puddle: 1, puddleScale: 0.07, darken: 0.42, key: 'y' });
    makeWet(M.floorIn, reflection, { uTime: wetShared.uTime, uRain: { value: 0 } }, { wet: 0.25, puddle: 0.12, puddleScale: 0.2, darken: 0.85, key: 'i' });
  }
  const reflectives = [];
  const addMesh = (geo, mat, cast = true, recv = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; root.add(m); return m; };
  const wh = MAP.warehouse; // [x0,z0,x1,z1] hücre
  const inWarehouse = (x, z) => x > wh[0] && x < wh[2] && z > wh[1] && z < wh[3];

  // ---------------------------------------------------------------- zemin
  const fl = { asphalt: new Geo(0.22), quay: new Geo(0.3), yard: new Geo(0.3), floorIn: new Geo(0.3) };
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const ch = cellChar(x, z);
    if (ch === '#' || ch === 'W' || ch === '~') continue;
    const k = inWarehouse(x, z) ? 'floorIn' : z <= 5 ? 'quay' : (x >= 32 && z <= 18) ? 'yard' : 'asphalt';
    fl[k].face('py', x * CELL, 0, z * CELL, (x + 1) * CELL, 0, (z + 1) * CELL);
  }
  // kapı eşikleri depo içi değilse dışarı say
  for (const [k, g] of Object.entries(fl)) if (!g.empty) { const m = addMesh(g.build(), M[k], false, true); reflectives.push(m); }
  // harita dışı zemin (konteynerlerin arkası görünmez ama gölge/AO için)
  const out = new Geo(0.15); out.face('py', -60, -0.03, 2, W + 60, -0.03, H + 80);
  addMesh(out.build(), M.asphalt, false, true);

  // ---------------------------------------------------------------- konteynerler (instanced, kat başına renk)
  const colors = MAP.colors.map((c) => new THREE.Color(c));
  const byLen = {};
  for (const c of MAP.containers) {
    // tamamen kapalı (hiç açık komşusu olmayan) iç konteynerleri atla
    let vis = false;
    for (let i = 0; i < c.len && !vis; i++) {
      const cx = c.axis === 'x' ? c.x + i : c.x, cz = c.axis === 'z' ? c.z + i : c.z;
      for (let dz = -3; dz <= 3 && !vis; dz++) for (let dx = -3; dx <= 3; dx++) { const ch = cellChar(cx + dx, cz + dz); if (ch !== '#' && ch !== 'W') { vis = true; break; } }
    }
    if (!vis && c.tiers < 3) continue;
    const L = c.len * CELL;
    const cx = c.axis === 'x' ? (c.x + c.len / 2) * CELL : (c.x + 0.5) * CELL;
    const cz = c.axis === 'z' ? (c.z + c.len / 2) * CELL : (c.z + 0.5) * CELL;
    for (let k = 0; k < c.tiers; k++) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(cx + (R() - 0.5) * 0.06, k * TIER + TIER / 2, cz + (R() - 0.5) * 0.06),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (c.axis === 'z' ? Math.PI / 2 : 0) + (R() - 0.5) * 0.012),
        new THREE.Vector3(1, 1, 1));
      (byLen[c.len] ||= []).push({ m, color: colors[c.colors[k] ?? c.color] });
    }
  }
  const doorBars = [];
  for (const [len, list] of Object.entries(byLen)) {
    const L = len * CELL - 0.06;
    const g = new Geo(0.515);
    g.box(-L / 2, -TIER / 2 + 0.02, -0.98, L / 2, TIER / 2 - 0.02, 0.98);
    const geo = g.build();
    const im = new THREE.InstancedMesh(geo, M.container, list.length);
    list.forEach((e, i) => { im.setMatrixAt(i, e.m); im.setColorAt(i, e.color); });
    im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
    root.add(im);
    // kapı uçlarında dikey kilit çubukları
    for (const e of list) for (const sx of [-1, 1]) for (const zz of [-0.55, -0.2, 0.2, 0.55]) {
      doorBars.push(e.m.clone().multiply(new THREE.Matrix4().makeTranslation(sx * (L / 2 + 0.02), 0, zz)));
    }
  }
  addInstanced(root, new THREE.CylinderGeometry(0.025, 0.025, TIER - 0.2, 6), M.steel, doorBars, false);
  // logolar: açık alana bakan uzun yüzlere
  const logoLists = LOGOS.map(() => []);
  const openAt = (x, z) => { const ch = cellChar(x, z); return ch !== '#' && ch !== 'W' && ch !== '~'; };
  for (const c of MAP.containers) {
    if (c.len < 3) continue;
    const mid = Math.floor(c.len / 2);
    const mx = c.axis === 'x' ? c.x + mid : c.x, mz = c.axis === 'z' ? c.z + mid : c.z;
    const sides = c.axis === 'x' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [dx, dz] of sides) {
      if (!openAt(mx + dx, mz + dz) || R() > 0.55) continue;
      const k = Math.floor(R() * c.tiers);
      const L = c.len * CELL;
      const cxw = c.axis === 'x' ? (c.x + c.len / 2) * CELL : (c.x + 0.5) * CELL + dx * 1.0;
      const czw = c.axis === 'z' ? (c.z + c.len / 2) * CELL : (c.z + 0.5) * CELL + dz * 1.0;
      const n = new THREE.Vector3(dx, 0, dz);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const wdt = Math.min(L * 0.7, 7.5);
      logoLists[Math.floor(R() * LOGOS.length)].push(new THREE.Matrix4().compose(new THREE.Vector3(cxw, k * TIER + TIER * 0.55, czw).addScaledVector(n, 0.025), q, new THREE.Vector3(wdt, wdt / 4, 1)));
    }
  }
  LOGOS.forEach((l, i) => {
    const mat = new THREE.MeshStandardMaterial({ map: logoTex(l), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.5 });
    addInstanced(root, new THREE.PlaneGeometry(1, 1), mat, logoLists[i], false);
  });

  // ---------------------------------------------------------------- depo
  const brickG = new Geo(0.4), corrG = new Geo(0.35), roofG = new Geo(0.3);
  const isW = (x, z) => cellChar(x, z) === 'W';
  const solid = (x, z) => { const c = cellChar(x, z); return c === 'W' || c === '#'; };
  const WH = 9, BR = 3.2;
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    if (!isW(x, z)) continue;
    const x0 = x * CELL, z0 = z * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
    for (const [d, nx, nz] of [['px', x + 1, z], ['nx', x - 1, z], ['pz', x, z + 1], ['nz', x, z - 1]]) {
      if (solid(nx, nz)) continue;
      brickG.face(d, x0, 0, z0, x1, BR, z1);
      corrG.face(d, x0, BR, z0, x1, WH, z1);
    }
    corrG.face('py', x0, 0, z0, x1, WH, z1);
  }
  // kapı üstü lentolar + yarı açık panjur kepenkler
  const doors = [];
  for (let z = wh[1]; z <= wh[3]; z++) for (let x = wh[0]; x <= wh[2]; x++) {
    const onEdge = x === wh[0] || x === wh[2] || z === wh[1] || z === wh[3];
    if (onEdge && !isW(x, z)) doors.push([x, z]);
  }
  const shutterG = new Geo(0.35);
  for (const [x, z] of doors) {
    const x0 = x * CELL, z0 = z * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
    corrG.box(x0, 3.6, z0, x1, WH, z1, { ny: 1 });
    corrG.face('ny', x0, 3.6, z0, x1, 3.6, z1);
    const horiz = z === wh[1] || z === wh[3];
    if (horiz) shutterG.box(x0, 3.25, z0 + 0.85, x1, 3.6, z0 + 1.15); else shutterG.box(x0 + 0.85, 3.25, z0, x0 + 1.15, 3.6, z1);
  }
  addMesh(brickG.build(), M.brick);
  addMesh(corrG.build(), M.corrugated);
  addMesh(shutterG.build(), M.shutter);
  // çatı: ışık boşluklu (yağmur içeri girmez, güneş huzmeleri girer)
  const rx0 = wh[0] * CELL, rz0 = wh[1] * CELL, rx1 = (wh[2] + 1) * CELL, rz1 = (wh[3] + 1) * CELL;
  const gaps = [];
  for (let z = rz0 + 4; z < rz1 - 3; z += 6.5) gaps.push([z, z + 1.3]);
  let zc = rz0;
  for (const [g0, g1] of gaps) { roofG.box(rx0, WH, zc, rx1, WH + 0.12, g0); zc = g1; }
  roofG.box(rx0, WH, zc, rx1, WH + 0.12, rz1);
  addMesh(roofG.build(), M.roof);
  // çatı makasları + aşıklar
  const truss = [], purlin = [];
  for (let z = rz0 + 2; z < rz1; z += 4) truss.push(new THREE.Matrix4().compose(new THREE.Vector3((rx0 + rx1) / 2, WH - 0.45, z), new THREE.Quaternion(), new THREE.Vector3(rx1 - rx0, 1, 1)));
  for (let x = rx0 + 3; x < rx1; x += 5) purlin.push(new THREE.Matrix4().compose(new THREE.Vector3(x, WH - 0.15, (rz0 + rz1) / 2), new THREE.Quaternion(), new THREE.Vector3(1, 1, rz1 - rz0)));
  addInstanced(root, new THREE.BoxGeometry(1, 0.5, 0.18), M.steel, truss);
  addInstanced(root, new THREE.BoxGeometry(0.16, 0.22, 1), M.steel, purlin);
  // floresan armatürler
  const fluo = [];
  for (let z = rz0 + 4; z < rz1 - 2; z += 6) for (let x = rx0 + 6; x < rx1 - 3; x += 9) fluo.push(new THREE.Matrix4().makeTranslation(x, WH - 1.4, z));
  addInstanced(root, new THREE.BoxGeometry(2.2, 0.06, 0.16), M.fluo, fluo, false);
  for (const [lx, lz] of [[rx0 + 9, rz0 + 9], [rx0 + 18, rz0 + 18]]) { const l = new THREE.PointLight('#dfeaff', 14, 18, 2); l.position.set(lx, WH - 2, lz); root.add(l); }
  // depo tabelası
  const sign = paintTex((g, w, h) => {
    g.fillStyle = '#1d2a33'; g.fillRect(0, h * 0.3, w, h * 0.4);
    g.fillStyle = '#e8e2d2'; g.font = 'bold 120px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('DEPO 3', w / 2, h / 2 + 6);
    wornPaint(g, w, h);
  }, 1024, 256);
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshStandardMaterial({ map: sign, transparent: true, roughness: 0.7 }));
  signM.position.set((rx0 + rx1) / 2, 6.6, rz0 - 0.03); signM.rotation.y = Math.PI; root.add(signM);

  // ---------------------------------------------------------------- rıhtım kenarı, deniz, babalar
  const edgeZ = 2;
  const qw = new Geo(0.3);
  qw.face('nz', 0, -3, edgeZ, W, 0, edgeZ);
  addMesh(qw.build(), M.concreteWall);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(W - 4, 0.22, 0.35), new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.6 }));
  curb.material.map.wrapS = THREE.RepeatWrapping; curb.material.map.repeat.set(30, 1);
  curb.position.set(W / 2, 0.11, edgeZ + 0.18); curb.castShadow = true; curb.receiveShadow = true; root.add(curb);
  const bollards = [], fenders = [];
  for (let x = 6; x < W - 4; x += 7) { bollards.push(new THREE.Matrix4().makeTranslation(x, 0.35, edgeZ + 0.7)); fenders.push(new THREE.Matrix4().makeTranslation(x + 3.5, -1.2, edgeZ - 0.25)); }
  const bg = new THREE.CylinderGeometry(0.22, 0.28, 0.7, 12);
  addInstanced(root, bg, M.steel, bollards);
  addInstanced(root, new THREE.BoxGeometry(1.2, 1.8, 0.5), M.rubber, fenders);
  // deniz
  const wn = waterNormals(); wn.repeat.set(110, 70);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), new THREE.MeshPhysicalMaterial({
    color: '#132026', roughness: 0.13, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.32, 0.32), envMapIntensity: 0.9, clearcoat: 0.4, clearcoatRoughness: 0.18,
  }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(W / 2, -1.9, edgeZ - 450); sea.receiveShadow = true;
  root.add(sea);

  // ---------------------------------------------------------------- yük gemisi
  const ship = new THREE.Group();
  const sx0 = -70, sx1 = 140, sz0 = -104, sz1 = -74;
  const hullG = new Geo(0.12), redG = new Geo(0.12), whiteG = new Geo(0.15);
  hullG.box(sx0, 0, sz0, sx1, 11, sz1, { ny: 1 });
  redG.box(sx0 - 0.05, -1.95, sz0 - 0.05, sx1 + 0.05, 0.4, sz1 + 0.05, { ny: 1, py: 1 });
  whiteG.box(sx1 - 30, 11, sz0 + 3, sx1 - 12, 31, sz1 - 3);   // köprü üstü yapı
  whiteG.box(sx1 - 34, 26, sz0 - 1, sx1 - 8, 28, sz1 + 1);     // köprü kanatları
  ship.add(new THREE.Mesh(hullG.build(), M.hull), new THREE.Mesh(redG.build(), M.hullRed), new THREE.Mesh(whiteG.build(), M.shipWhite));
  // güverte boyunca sarı lambalar
  const deckLights = [];
  for (let x = sx0 + 5; x < sx1 - 32; x += 9) deckLights.push(new THREE.Matrix4().makeTranslation(x, 11.3, sz1 + 0.05));
  addInstanced(ship, new THREE.BoxGeometry(0.4, 0.25, 0.1), M.warm, deckLights, false);
  // köprü pencereleri
  const win = [];
  for (let y = 14; y < 30; y += 3) for (let z = sz0 + 4; z < sz1 - 3; z += 2.2) win.push(new THREE.Matrix4().makeTranslation(sx1 - 30.02, y, z));
  addInstanced(ship, new THREE.BoxGeometry(0.05, 1.1, 1.4), M.window, win, false);
  // baca + direk + kırmızı ikaz lambaları
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 7), M.hullRed); funnel.position.set(sx1 - 18, 36, (sz0 + sz1) / 2); ship.add(funnel);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 14, 8), M.steel); mast.position.set(sx1 - 24, 38, (sz0 + sz1) / 2); ship.add(mast);
  const rl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), M.redLight); rl.position.set(sx1 - 24, 45.3, (sz0 + sz1) / 2); ship.add(rl);
  // güverte konteynerleri
  const deck = [];
  const dcol = colors.slice();
  for (let x = sx0 + 6; x < sx1 - 36; x += 12.4) for (let z = sz0 + 2; z < sz1 - 1; z += 2.5) {
    const tiers = 2 + Math.floor(R() * 3);
    for (let k = 0; k < tiers; k++) deck.push({ m: new THREE.Matrix4().makeTranslation(x, 11 + k * TIER + TIER / 2, z + 1.2), c: dcol[Math.floor(R() * dcol.length)] });
  }
  {
    const g = new Geo(0.515); g.box(-6, -TIER / 2, -1.2, 6, TIER / 2, 1.2);
    const im = new THREE.InstancedMesh(g.build(), M.container, deck.length);
    deck.forEach((e, i) => { im.setMatrixAt(i, e.m); im.setColorAt(i, e.c); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    ship.add(im);
  }
  ship.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.add(ship);

  // ---------------------------------------------------------------- gantry vinçler
  const crane = (legsX, color, boomX, boomBack, boomFront) => {
    const g = new THREE.Group();
    const legH = 26, mat = color;
    const zA = 1 * CELL + 1, zB = 5 * CELL + 1;
    for (const lx of legsX) for (const lz of [zA, zB]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.3, legH, 1.3), mat); leg.position.set(lx, legH / 2, lz); g.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 2.6), M.steel); foot.position.set(lx, 0.4, lz); g.add(foot);
    }
    for (const lx of legsX) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, zB - zA + 1.3), mat); b.position.set(lx, legH - 0.7, (zA + zB) / 2); g.add(b);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, zB - zA), mat); b2.position.set(lx, 9, (zA + zB) / 2); g.add(b2);
      // çapraz destek
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.4, Math.hypot(legH - 10, zB - zA), 0.4), mat);
      d.position.set(lx, (legH + 9) / 2, (zA + zB) / 2); d.rotation.x = Math.atan2(zB - zA, legH - 10); g.add(d);
    }
    const spanX = Math.abs(legsX[1] - legsX[0]) + 1.3;
    for (const lz of [zA, zB]) { const b = new THREE.Mesh(new THREE.BoxGeometry(spanX, 1.6, 1.2), mat); b.position.set((legsX[0] + legsX[1]) / 2, legH + 0.8, lz); g.add(b); }
    // bom (denize uzanan kol)
    const boomLen = boomBack - boomFront;
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, boomLen), mat); boom.position.set(boomX, legH + 4, (boomBack + boomFront) / 2); g.add(boom);
    const house = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 8), M.shipWhite); house.position.set(boomX, legH + 7, boomBack - 6); g.add(house);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), M.window); cab.position.set(boomX, legH + 1.4, -10); g.add(cab);
    // gergi halatları
    for (const zz of [boomFront + 6, boomBack - 2]) {
      const len = Math.hypot(14, Math.abs(zz - (boomBack - 6)));
      const cab2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 4), M.steel);
      cab2.position.set(boomX, legH + 11, (zz + boomBack - 6) / 2);
      cab2.rotation.x = Math.atan2(zz - (boomBack - 6), 14) * -1 + Math.PI / 2;
      g.add(cab2);
    }
    const apex = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), mat); apex.position.set(boomX, legH + 11, boomBack - 6); g.add(apex);
    // spreader + halatlar (gemi üstünde asılı)
    const spZ = -62;
    const spreader = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 12.4), M.steel); spreader.position.set(boomX, 21, spZ); g.add(spreader);
    for (const dz of [-4, 4]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, legH + 3 - 21, 4), M.steel); r.position.set(boomX, (legH + 3 + 21) / 2, spZ + dz); g.add(r); }
    const warn = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), M.redLight); warn.position.set(boomX, legH + 18.2, boomBack - 6); g.add(warn);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g);
  };
  crane([35 * CELL + 1, 41 * CELL + 1], M.crane1, 38 * CELL + 1, 24, -62);
  crane([-4, 11 * CELL + 1], M.crane2, 10, 22, -58);

  // ---------------------------------------------------------------- zemin işaretleri (boya)
  const lineMat = new THREE.MeshStandardMaterial({ map: paintTex((g, w, h) => { g.fillStyle = '#d8b02a'; g.fillRect(0, 0, w, h); wornPaint(g, w, h); }, 64, 512), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.55 });
  const whiteMat = new THREE.MeshStandardMaterial({ map: paintTex((g, w, h) => { g.fillStyle = '#e4e2dc'; g.fillRect(0, 0, w, h); wornPaint(g, w, h); }, 64, 512), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.55 });
  const line = (x0, z0, x1, z1, wdt, mat) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wdt, len), mat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(x1 - x0, z1 - z0);
    m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); m.receiveShadow = true; root.add(m);
  };
  // rıhtım güvenlik çizgisi + orta koridor kesik çizgisi + A uzun yol çizgileri
  line(4, 4.2, W - 4, 4.2, 0.18, lineMat);
  for (let z = 14; z < 68; z += 4) line(47, z, 47, z + 2, 0.15, whiteMat);
  for (let z = 40; z < 70; z += 4) line(87, z, 87, z + 2, 0.15, whiteMat);
  for (let x = 38; x < 58; x += 3.2) line(x, 75, x, 82, 0.12, whiteMat);   // saldırı doğuşu park çizgileri
  // bomba bölgesi harfleri
  const letter = (ch, x, z, s) => {
    const t = paintTex((g, w, h) => { g.strokeStyle = '#e8b030'; g.fillStyle = '#e8b030'; g.lineWidth = 22; g.strokeRect(20, 20, w - 40, h - 40); g.font = 'bold 330px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, w / 2, h / 2 + 20); wornPaint(g, w, h); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.5 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.014, z); root.add(m);
  };
  letter('A', 79, 26, 6); letter('B', 17, 27, 5.5);
  // konteyner yan yüzlerine yön boyaları
  const wallSign = (txt, x, y, z, rotY) => {
    const t = paintTex((g, w, h) => { g.fillStyle = '#f0ece2'; g.font = 'bold 200px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2); wornPaint(g, w, h); }, 512, 256);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.6 }));
    m.position.set(x, y, z); m.rotation.y = rotY; root.add(m);
  };
  wallSign('A →', 60.03, 2.2, 74, Math.PI / 2);
  wallSign('← B', 35.97, 2.2, 76, -Math.PI / 2);
  wallSign('A ↑', 81.97, 2.2, 52, -Math.PI / 2);
  wallSign('B ↑', 13.97, 2.2, 56, -Math.PI / 2);
  wallSign('ORTA', 41.97, 2.2, 60, -Math.PI / 2);

  // ---------------------------------------------------------------- ışıklar
  const sun = new THREE.DirectionalLight('#ffc994', 4.4);
  sun.castShadow = quality !== 'low';
  const sm = quality === 'ultra' ? 4096 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 420;
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  sun.position.set(W / 2 - 80, 40, -60); sun.target.position.set(W / 2, 0, H / 2);
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight('#8a9aac', '#3a3630', 0.25));
  scene.fog = null;
  scene.background = new THREE.Color('#6d7682');
  renderer.shadowMap.enabled = quality !== 'low';
  // HDRI: güneşi denizin üstüne (kuzey-batı) çevir
  const envReady = setupSky(scene, renderer, sun, new THREE.Vector3(W / 2, 0, H / 2), 'belfast_sunset_puresky_4k.hdr', {
    envIntensity: 0.7, bgIntensity: 1.0, minSunY: 0.24, sunToward: new THREE.Vector3(-0.55, 0, -1),
  });

  // ---------------------------------------------------------------- dekor modelleri
  const propsReady = (async () => {
    const objs = await loadModels(['wooden_crate_01', 'wooden_crate_02', 'old_military_crate', 'Barrel_01', 'concrete_road_barrier_02', 'utility_box_02', 'small_lpg_tank', 'modular_chainlink_fence']);
    const pb = new PropBatcher(root, objs);
    for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
      const ch = cellChar(x, z);
      if (ch !== 'c' && ch !== 'C') continue;
      const id = R() < 0.5 ? 'old_military_crate' : R() < 0.5 ? 'wooden_crate_02' : 'wooden_crate_01';
      for (let l = 0; l < (ch === 'C' ? 2 : 1); l++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) pb.place(id, x * CELL + 0.5 + i, l * 1.1, z * CELL + 0.5 + j, 0.98, 1.1, 0.98, Math.floor(R() * 4) * Math.PI / 2);
    }
    // sokak lambaları: duvar diplerinde, rıhtım boyunca
    const lampSpots = [];
    for (let x = 4; x < W - 4; x += 16) lampSpots.push([x, 11.4, 0]);
    for (let z = 20; z < 70; z += 14) lampSpots.push([42.6, z, Math.PI / 2], [51.4, z + 7, -Math.PI / 2]);
    for (let z = 40; z < 72; z += 14) lampSpots.push([82.6, z, Math.PI / 2]);
    const halo = new THREE.SpriteMaterial({ map: canvasTexture(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,160,.9)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    // modern LED projektör direkleri (prosedürel): direk + kol + ışık kafası
    const poles = [], arms = [], heads = [];
    for (const [x, z, r] of lampSpots) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      poles.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 4.5, z), q, new THREE.Vector3(1, 1, 1)));
      arms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 8.85, z).addScaledVector(fwd, 0.7), q, new THREE.Vector3(1, 1, 1)));
      heads.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 8.75, z).addScaledVector(fwd, 1.35), q, new THREE.Vector3(1, 1, 1)));
    }
    addInstanced(root, new THREE.CylinderGeometry(0.09, 0.13, 9, 10), M.steel, poles);
    addInstanced(root, new THREE.BoxGeometry(0.1, 0.1, 1.5), M.steel, arms);
    addInstanced(root, new THREE.BoxGeometry(0.5, 0.12, 0.8), M.steel, heads);
    addInstanced(root, new THREE.BoxGeometry(0.42, 0.02, 0.7), M.warm, heads.map((m) => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.07, 0))), false);
    for (const [x, z, r] of lampSpots) {
      const fwd = new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
      const sp = new THREE.Sprite(halo); sp.position.set(x, 8.55, z).addScaledVector(fwd, 1.35); sp.scale.set(3.2, 3.2, 1); root.add(sp);
    }
    // varil, tüp, elektrik kutusu öbekleri (duvar dibine yakın)
    const clusters = [[3.5, 45, 'Barrel_01'], [4.2, 47, 'Barrel_01'], [3.5, 49, 'small_lpg_tank'], [33.4, 25, 'utility_box_02'], [33.4, 32, 'small_lpg_tank'], [63.5, 46, 'Barrel_01'], [64.3, 47.3, 'Barrel_01'], [89.4, 46, 'utility_box_02'], [44, 13.5, 'Barrel_01'], [45.2, 13.4, 'Barrel_01']];
    for (const [x, z, id] of clusters) pb.placeH(id, x, 0, z, id === 'Barrel_01' ? 1.0 : id === 'small_lpg_tank' ? 1.1 : 1.4, R() * 6.28);
    // saldırı doğuşu bariyerleri ve çit
    for (let x = 37; x < 58; x += 2.2) pb.placeH('concrete_road_barrier_02', x, 0, 85.2, 0.9, 0);
    pb.flush();
  })();

  // ---------------------------------------------------------------- canlandırma
  const update = (dt, t) => {
    wn.offset.set(t * 0.004, t * 0.0025);
    M.fluo.emissiveIntensity = 6 * (0.96 + 0.04 * Math.sin(t * 50.0 + Math.sin(t * 3.0) * 3.0));
  };

  return {
    sun, envReady, propsReady, update, reflectives,
    box: { min: new THREE.Vector3(rx0, 0, rz0), max: new THREE.Vector3(rx1, WH, rz1), dust: 2.2 },
    roofs: MAP.roofs,
    rain: 1,
    atmosphere: {
      sunColor: new THREE.Color('#ffb877'), sunIntensity: 4.4, shafts: 0.85, ambient: new THREE.Color('#5d6a7c'), ambientHaze: 0.16,
      horizon: new THREE.Color('#9a958f'), density: 0.012, farHaze: 0.9, heightFall: 9, maxDist: 110, ao: 1.1,
      exposure: 0.82, shadowTint: new THREE.Vector3(0.74, 1.0, 1.2), highTint: new THREE.Vector3(1.13, 1.0, 0.82), vignette: 0.32,
      saturation: 1.18, agx: 0.55, bloom: 0.085, contrast: 0.36, flare: 1.0, rainColor: new THREE.Color(0.5, 0.55, 0.6),
    },
  };
}
