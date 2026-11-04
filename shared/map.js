// "Kervan" haritası — ızgara tabanlı. Her hücre CELL x CELL metre.
// '#' duvar, '.' zemin, 'c' alçak sandık, 'C' yüksek sandık, 'A'/'B' bomba bölgesi zemini

import { PLAYER } from './constants.js';
import { rayAABB } from './util.js';

export const CELL = 2;
export const WALL_H = 6;
export const CRATE_H = 1.1;
export const BIGCRATE_H = 2.2;
export const MAP_W = 48;
export const MAP_H = 44;
export const MAP_NAME = 'Kervan';

function build() {
  const g = [];
  for (let z = 0; z < MAP_H; z++) g.push(new Array(MAP_W).fill('#'));
  const carve = (x0, z0, x1, z1, ch = '.') => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch;
  };
  const put = (list, ch) => list.forEach(([x, z]) => { g[z][x] = ch; });

  carve(19, 2, 28, 7);    // savunma doğuşu
  carve(29, 3, 32, 4);    // savunma -> A
  carve(15, 5, 18, 6);    // savunma -> B
  carve(33, 3, 44, 14);   // A bölgesi
  carve(3, 3, 14, 14);    // B bölgesi
  carve(22, 8, 25, 35);   // orta koridor
  carve(18, 36, 29, 41);  // saldırı doğuşu
  carve(30, 37, 43, 40);  // A uzun (yatay)
  carve(40, 15, 43, 36);  // A uzun (dikey)
  carve(26, 19, 34, 21);  // A kısa / köprü
  carve(33, 15, 35, 18);  // A kısa çıkış
  carve(8, 36, 17, 38);   // B tünel giriş
  carve(6, 22, 9, 35);    // B tünel
  carve(5, 17, 12, 23);   // B üst tünel odası
  carve(6, 15, 9, 16);    // B tünel çıkış
  carve(15, 11, 21, 12);  // ortadan B'ye geçit
  g[14][22] = '#'; g[14][25] = '#'; // orta kapı daralması
  g[15][22] = '#'; g[15][25] = '#';

  carve(35, 5, 42, 12, 'A');
  carve(5, 5, 12, 12, 'B');

  put([[37, 8], [38, 8], [38, 9], [22, 30], [40, 20], [8, 8], [9, 8], [30, 37], [10, 18], [24, 4], [24, 5]], 'C');
  put([[36, 9], [43, 4], [34, 12], [41, 11], [8, 9], [4, 4], [12, 12], [13, 5],
       [23, 24], [42, 26], [19, 37], [28, 40], [11, 20], [20, 3], [27, 3], [16, 12], [24, 33], [43, 33]], 'c');
  return g.map((r) => r.join(''));
}

export const GRID = build();

export function cellChar(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return '#';
  return GRID[cz][cx];
}

// Bina yükseklikleri: 4x4 hücrelik bloklara göre 6-10 m arası (deterministik)
function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function buildingId(cx, cz) { return Math.floor(cx / 4) * 1000 + Math.floor(cz / 4); }
export function buildingRand(cx, cz, salt = 0) { return hash2(Math.floor(cx / 4) + salt * 31, Math.floor(cz / 4) + salt * 17); }
const WALL_HEIGHTS = (() => {
  const a = new Float32Array(MAP_W * MAP_H);
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const edge = x === 0 || z === 0 || x === MAP_W - 1 || z === MAP_H - 1;
    a[z * MAP_W + x] = edge ? 10 : WALL_H + Math.floor(buildingRand(x, z) * 5);
  }
  return a;
})();

export function cellHeight(cx, cz) {
  const c = cellChar(cx, cz);
  if (c === '#') {
    if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return 12;
    return WALL_HEIGHTS[cz * MAP_W + cx];
  }
  return c === 'C' ? BIGCRATE_H : c === 'c' ? CRATE_H : 0;
}

export function walkable(cx, cz) { return cellHeight(cx, cz) === 0; }
export function cellOf(x, z) { return [Math.floor(x / CELL), Math.floor(z / CELL)]; }
export function cellCenter(cx, cz) { return { x: (cx + 0.5) * CELL, y: 0, z: (cz + 0.5) * CELL }; }

export function zoneAt(x, z) {
  const c = cellChar(Math.floor(x / CELL), Math.floor(z / CELL));
  return c === 'A' || c === 'B' ? c : null;
}

// ---- Doğuş noktaları ----
const spawnCells = {
  def: [[21, 4], [23, 3], [25, 4], [27, 5], [22, 6], [24, 6], [26, 3], [20, 5], [28, 6], [25, 6]],
  att: [[20, 39], [22, 38], [24, 39], [26, 38], [28, 39], [21, 40], [23, 40], [25, 40], [27, 41], [19, 41]],
};
export const SPAWNS = {
  def: spawnCells.def.map(([x, z]) => cellCenter(x, z)),
  att: spawnCells.att.map(([x, z]) => cellCenter(x, z)),
};
export const SPAWN_YAW = { def: Math.PI, att: 0 }; // def güneye, att kuzeye bakar
export const SPAWN_CENTER = { def: cellCenter(23.5, 4.5), att: cellCenter(23.5, 39) };

// ---- Bölgeler (botlar için) ----
function cellsWhere(fn) {
  const out = [];
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) if (fn(x, z)) out.push([x, z]);
  return out;
}
const rect = (x0, z0, x1, z1) => (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && walkable(x, z);
export const REGIONS = {
  A: cellsWhere((x, z) => cellChar(x, z) === 'A'),
  B: cellsWhere((x, z) => cellChar(x, z) === 'B'),
  Aarea: cellsWhere(rect(33, 3, 44, 14)),
  Barea: cellsWhere(rect(3, 3, 14, 14)),
  mid: cellsWhere(rect(22, 9, 25, 13)),
  midLow: cellsWhere(rect(22, 22, 25, 30)),
  long: cellsWhere(rect(40, 22, 43, 34)),
  tunnel: cellsWhere(rect(5, 17, 12, 23)),
};

// ---- Çarpışma ----
function overlapCells(x, z, r, fn) {
  const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
  const cz0 = Math.floor((z - r) / CELL), cz1 = Math.floor((z + r) / CELL);
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cx, cz);
}

// Eksen boyunca hareket ettir ve çarpışmayı çöz. Çarptıysa true
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
  if (!walkable(gx, gz)) {
    const n = nearestWalkable(gx, gz); if (!n) return null; [gx, gz] = n;
  }
  if (!walkable(sx, sz)) {
    const n = nearestWalkable(sx, sz); if (!n) return null; [sx, sz] = n;
  }
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
