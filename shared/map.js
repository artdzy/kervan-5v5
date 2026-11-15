// Ortak harita çekirdeği: aktif harita (setMap ile seçilir), çarpışma, ışın izleme, A* yol bulma.
// Izgara tabanlı; her hücre CELL x CELL metre. Harita tanımları shared/maps/ altında.

import { PLAYER } from './constants.js';
import { rayAABB } from './util.js';
import kervan from './maps/kervan.js';
import liman from './maps/liman.js';

export const CELL = 2;
export const WALL_H = 6;
export const CRATE_H = 1.1;
export const BIGCRATE_H = 2.2;
export const MAPS = { kervan, liman };
export const MAP_IDS = Object.keys(MAPS);

// ---- aktif harita (canlı bağlamalar: setMap sonrası güncellenir)
export let MAP = null;          // tanım + build çıktısı
export let MAP_ID = null;
export let MAP_NAME = '';
export let MAP_W = 0;
export let MAP_H = 0;
export let GRID = [];
export let SPAWNS = { def: [], att: [] };
export let SPAWN_YAW = { def: 0, att: 0 };
export let SPAWN_CENTER = { def: { x: 0, y: 0, z: 0 }, att: { x: 0, y: 0, z: 0 } };
export let REGIONS = {};
let HEIGHTS = new Float32Array(0);

export function cellCenter(cx, cz) { return { x: (cx + 0.5) * CELL, y: 0, z: (cz + 0.5) * CELL }; }

export function setMap(id) {
  const def = MAPS[id] || MAPS.kervan;
  const built = def.build();
  MAP = { ...def, ...built };
  MAP_ID = def.id; MAP_NAME = def.name; MAP_W = def.W; MAP_H = def.H;
  GRID = built.rows; HEIGHTS = built.heights;
  SPAWNS = {
    def: def.spawnCells.def.map(([x, z]) => cellCenter(x, z)),
    att: def.spawnCells.att.map(([x, z]) => cellCenter(x, z)),
  };
  SPAWN_YAW = { ...def.spawnYaw };
  SPAWN_CENTER = { def: cellCenter(...def.spawnCenter.def), att: cellCenter(...def.spawnCenter.att) };
  const cellsWhere = (fn) => { const out = []; for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) if (fn(x, z)) out.push([x, z]); return out; };
  REGIONS = {
    A: cellsWhere((x, z) => cellChar(x, z) === 'A'),
    B: cellsWhere((x, z) => cellChar(x, z) === 'B'),
  };
  for (const [k, [x0, z0, x1, z1]] of Object.entries(def.regions)) {
    REGIONS[k] = cellsWhere((x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && walkable(x, z));
  }
  return MAP;
}

export function cellChar(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return '#';
  return GRID[cz][cx];
}

const SOLID = new Set(['#', 'W', 'P', '~']);
export function isSolidChar(c) { return SOLID.has(c); }

export function cellHeight(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return 12;
  const c = GRID[cz][cx];
  if (SOLID.has(c)) return HEIGHTS[cz * MAP_W + cx];
  return c === 'C' ? BIGCRATE_H : c === 'c' ? CRATE_H : 0;
}

// Kervan görselleri için bina rastgeleliği (geriye uyum)
export { buildingRand } from './maps/kervan.js';

export function walkable(cx, cz) { return cellHeight(cx, cz) === 0; }
export function cellOf(x, z) { return [Math.floor(x / CELL), Math.floor(z / CELL)]; }

export function zoneAt(x, z) {
  const c = cellChar(Math.floor(x / CELL), Math.floor(z / CELL));
  return c === 'A' || c === 'B' ? c : null;
}

// çatı altında mı (yağmur maskesi, ses vb.)
export function underRoof(x, z) {
  for (const [x0, z0, x1, z1] of MAP?.roofs || []) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true;
  return false;
}

// ---- Çarpışma ----
function overlapCells(x, z, r, fn) {
  const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
  const cz0 = Math.floor((z - r) / CELL), cz1 = Math.floor((z + r) / CELL);
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cx, cz);
}

export function moveAxis(pos, axis, delta, r = PLAYER.radius) {
  if (delta === 0) return false;
  pos[axis] += delta;
  let lim = delta > 0 ? Infinity : -Infinity, hit = false;
  overlapCells(pos.x, pos.z, r - 0.0005, (cx, cz) => {
    const top = cellHeight(cx, cz);
    if (top <= pos.y + 0.02) return;
    hit = true;
    const c = axis === 'x' ? cx : cz;
    if (delta > 0) lim = Math.min(lim, c * CELL - r - 0.001);
    else lim = Math.max(lim, (c + 1) * CELL + r + 0.001);
  });
  if (hit) pos[axis] = lim;
  return hit;
}

export function groundHeight(x, y, z, r = PLAYER.radius) {
  let g = 0;
  overlapCells(x, z, r - 0.0005, (cx, cz) => {
    const top = cellHeight(cx, cz);
    if (top <= y + 0.06 && top > g) g = top;
  });
  return g;
}

export function solidAt(x, y, z) {
  return cellHeight(Math.floor(x / CELL), Math.floor(z / CELL)) > y;
}

// ---- Işın izleme (DDA) ----
export function raycastMap(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist, normal = null;
  if (dy < 0) {
    const t = -oy / dy;
    if (t >= 0 && t < best) { best = t; normal = [0, 1, 0]; }
  }
  let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDX = Math.abs(dx) > 1e-9 ? Math.abs(CELL / dx) : Infinity;
  const tDZ = Math.abs(dz) > 1e-9 ? Math.abs(CELL / dz) : Infinity;
  let tMX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
  let tMZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
  let t = 0;
  for (let i = 0; i < 400; i++) {
    if (t > best) break;
    if (cx < -2 || cz < -2 || cx > MAP_W + 1 || cz > MAP_H + 1) break;
    const h = cellHeight(cx, cz);
    if (h > 0) {
      const r = rayAABB(ox, oy, oz, dx, dy, dz, cx * CELL, 0, cz * CELL, (cx + 1) * CELL, h, (cz + 1) * CELL);
      if (r && r.t < best) { best = r.t; normal = r.n; break; }
    }
    if (tMX < tMZ) { t = tMX; tMX += tDX; cx += stepX; } else { t = tMZ; tMZ += tDZ; cz += stepZ; }
  }
  return best < maxDist ? { t: best, n: normal } : null;
}

export function hasLOS(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-4) return true;
  const hit = raycastMap(a.x, a.y, a.z, dx / d, dy / d, dz / d, d);
  return !hit || hit.t >= d - 0.05;
}

// ---- A* yol bulma ----
export function findPath(sx, sz, gx, gz) {
  if (!walkable(gx, gz)) { const n = nearestWalkable(gx, gz); if (!n) return null; [gx, gz] = n; }
  if (!walkable(sx, sz)) { const n = nearestWalkable(sx, sz); if (!n) return null; [sx, sz] = n; }
  const N = MAP_W * MAP_H, idx = (x, z) => z * MAP_W + x;
  const gS = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [];
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const hfn = (x, z) => { const ax = Math.abs(x - gx), az = Math.abs(z - gz); return Math.max(ax, az) + 0.414 * Math.min(ax, az); };
  const s = idx(sx, sz), goal = idx(gx, gz);
  gS[s] = 0; push(hfn(sx, sz), s);
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const [, cur] = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const x = cur % MAP_W, z = (cur / MAP_W) | 0;
    for (const [ddx, ddz, c] of dirs) {
      const nx = x + ddx, nz = z + ddz;
      if (!walkable(nx, nz)) continue;
      if (ddx && ddz && (!walkable(x + ddx, z) || !walkable(x, z + ddz))) continue;
      const ni = idx(nx, nz), ng = gS[cur] + c;
      if (ng < gS[ni]) { gS[ni] = ng; from[ni] = cur; push(ng + hfn(nx, nz), ni); }
    }
  }
  if (from[goal] === -1 && goal !== s) return null;
  const path = [];
  for (let c = goal; c !== -1 && c !== s; c = from[c]) path.push([c % MAP_W, (c / MAP_W) | 0]);
  path.reverse();
  return path;
}

export function nearestWalkable(cx, cz) {
  for (let r = 0; r < 6; r++)
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
      if (walkable(cx + dx, cz + dz)) return [cx + dx, cz + dz];
  return null;
}

setMap('kervan');
