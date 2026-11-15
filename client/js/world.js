// Harita görsel kurucusu: aktif haritaya göre doğru modülü çağırır, değiştirirken eskisini temizler.
import * as THREE from 'three';
import { MAP_ID } from '/shared/map.js';
import { buildKervan } from './maps/kervan.js';
import { buildLiman } from './maps/liman.js';

const BUILDERS = { kervan: buildKervan, liman: buildLiman };

export function buildWorld(scene, renderer, quality, extra = {}) {
  const root = new THREE.Group();
  root.name = 'world:' + MAP_ID;
  scene.add(root);
  const w = BUILDERS[MAP_ID]({ root, scene, renderer, quality, ...extra });
  w.root = root; w.id = MAP_ID;
  return w;
}

export function disposeWorld(scene, world) {
  if (!world) return;
  scene.remove(world.root);
  const mats = new Set(), geos = new Set();
  world.root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => mats.add(x));
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => { for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']) { /* dokular önbellekte paylaşılıyor */ } m.dispose(); });
  scene.environment = null; scene.background = null;
}
