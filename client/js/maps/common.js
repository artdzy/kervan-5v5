// Haritalar için ortak yardımcılar: Polyhaven PBR malzemeleri, dünya-UV'li geometri, yüz matrisleri,
// HDRI gökyüzü + güneş kurulumu, glTF prop yükleme ve instanced yerleştirme.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PH = '/assets/polyhaven';
const tl = new THREE.TextureLoader();
let MAX_ANISO = 8;
export function setAniso(n) { MAX_ANISO = n; }

// ---------------------------------------------------------------- malzemeler
const texCache = {};
export function tex(key, name, srgb) {
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
export function pbr(key, opts = {}) {
  const arm = tex(key, 'arm');
  return new THREE.MeshStandardMaterial({
    map: tex(key, 'diff', true), normalMap: tex(key, 'nor'),
    aoMap: arm, roughnessMap: arm, metalnessMap: arm,
    roughness: opts.rough ?? 1, metalness: opts.metal ?? 0, color: opts.color || '#ffffff',
    normalScale: new THREE.Vector2(opts.ns ?? 1, opts.ns ?? 1),
  });
}


// ---------------------------------------------------------------- geometri oluşturucu (dünya koordinatlı UV)
export class Geo {
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
export const FACE = {
  pz: { n: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(1, 0, 0) },
  nz: { n: new THREE.Vector3(0, 0, -1), t: new THREE.Vector3(-1, 0, 0) },
  px: { n: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, 0, -1) },
  nx: { n: new THREE.Vector3(-1, 0, 0), t: new THREE.Vector3(0, 0, 1) },
};
export const UP = new THREE.Vector3(0, 1, 0);
export function faceMatrix(dir, origin, u, v, w, rotY = 0, scale = null) {
  const f = FACE[dir];
  const pos = origin.clone().addScaledVector(f.t, u).add(new THREE.Vector3(0, v, 0)).addScaledVector(f.n, w);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.t, UP, f.n));
  if (rotY) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, rotY));
  return new THREE.Matrix4().compose(pos, q, scale || new THREE.Vector3(1, 1, 1));
}

export function rand(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

export function findSun(hdr, minY = 0.25) {
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
  if (d.y < minY) d.y = minY;
  return d.normalize();
}


// HDRI'yi yükle, ortam + arka plan yap, güneşi HDRI'deki en parlak noktaya hizala
export function setupSky(scene, renderer, sun, center, file, opts = {}) {
  return new HDRLoader().loadAsync(`${PH}/hdri/${file}`).then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(hdr).texture;
    pm.dispose();
    scene.environmentIntensity = opts.envIntensity ?? 1;
    scene.background = hdr;
    scene.backgroundIntensity = opts.bgIntensity ?? 1;
    let dir = findSun(hdr, opts.minSunY ?? 0.25);
    let rot = opts.bgRotation || 0;
    // güneşi istenen yöne çevirmek için gökyüzünü Y ekseninde döndür
    if (dir && opts.sunToward) rot = Math.atan2(opts.sunToward.x, opts.sunToward.z) - Math.atan2(dir.x, dir.z);
    if (rot) {
      scene.backgroundRotation.set(0, rot, 0); scene.environmentRotation.set(0, rot, 0);
      if (dir) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    }
    if (dir) { sun.position.copy(center).addScaledVector(dir, 160); sun.target.position.copy(center); }
    return dir;
  }).catch((e) => { console.warn('HDRI yüklenemedi', e); });
}

// glTF modellerini yükle (Polyhaven klasör yapısı)
export async function loadModels(ids) {
  const loader = new GLTFLoader();
  const load = (id) => loader.loadAsync(`${PH}/models/${id}/${id}.gltf`).then((g) => g.scene).catch(() => null);
  const objs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await load(id)])));
  for (const o of Object.values(objs)) o?.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return objs;
}

// Modelleri hedef boyuta ölçekleyip yerleştirir; flush() ile model başına InstancedMesh üretir
export class PropBatcher {
  constructor(root, objs) { this.root = root; this.objs = objs; this.batches = {}; }
  size(id) { const s = this.objs[id]; if (!s) return null; if (!s.userData.box) { s.updateMatrixWorld(true); s.userData.box = new THREE.Box3().setFromObject(s); } return s.userData.box.getSize(new THREE.Vector3()); }
  place(id, x, y, z, sx, sy, sz, rot = 0) {
    const src = this.objs[id]; if (!src) return;
    const s = this.size(id), b0 = src.userData.box, c0 = b0.getCenter(new THREE.Vector3());
    const m = new THREE.Matrix4().makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationY(rot))
      .multiply(new THREE.Matrix4().makeScale(sx / s.x, sy / s.y, sz / s.z))
      .multiply(new THREE.Matrix4().makeTranslation(-c0.x, -b0.min.y, -c0.z));
    (this.batches[id] ||= []).push(m);
  }
  placeH(id, x, y, z, height, rot = 0) { const s = this.size(id); if (!s) return; const k = height / s.y; this.place(id, x, y, z, s.x * k, height, s.z * k, rot); }
  flush() {
    for (const [id, mats] of Object.entries(this.batches)) {
      const src = this.objs[id];
      src.updateMatrixWorld(true);
      src.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(mesh.matrixWorld)));
        im.castShadow = true; im.receiveShadow = true;
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
        this.root.add(im);
      });
    }
    this.batches = {};
  }
}

export function addInstanced(root, geo, mat, list, cast = true) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = cast; im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  root.add(im); return im;
}

export function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
