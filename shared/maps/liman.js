// "Liman" — yağmurlu konteyner limanı (orijinal tasarım). Izgara: 48 x 44 hücre, hücre = 2 m.
// Kuzey (z küçük) denize bakan rıhtım. Karakterler:
//  '#' konteyner yığını   'W' depo duvarı   'P' vinç ayağı   '~' rıhtım kenarı (deniz, görünmez duvar)
//  'c' palet / alçak sandık   'C' raf / yüksek yük   'A','B' bomba bölgesi   '.' zemin

const W = 48, H = 44;
export const TIER = 2.6;          // bir konteyner katının yüksekliği
export const WAREHOUSE_H = 9;     // depo duvar/çatı yüksekliği
const WAREHOUSE = [2, 7, 15, 19]; // x0, z0, x1, z1 (duvarlar dahil)

function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

const CONTAINER_COLORS = ['#6e2a20', '#22344c', '#2f4434', '#7a5226', '#575c60', '#9a978c', '#3e2a30', '#24464a', '#6b6036', '#5b3422', '#1e2b3d', '#47503a'];

function build() {
  const g = [];
  for (let z = 0; z < H; z++) g.push(new Array(W).fill('#'));
  const carve = (x0, z0, x1, z1, ch = '.') => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch; };
  const put = (list, ch) => list.forEach(([x, z]) => { g[z][x] = ch; });

  // ---- açık alanlar
  carve(1, 1, 46, 5);      // rıhtım şeridi
  carve(32, 6, 45, 18);    // A konteyner sahası
  carve(21, 6, 25, 34);    // orta koridor
  carve(16, 11, 20, 12);   // ortadan depoya geçit
  carve(26, 21, 31, 23);   // A kısa
  carve(31, 19, 34, 23);   // A kısa -> saha
  carve(41, 19, 45, 35);   // A uzun (dikey)
  carve(30, 36, 45, 39);   // A uzun (yatay)
  carve(18, 36, 29, 42);   // saldırı doğuşu (kamyon kapısı)
  carve(2, 20, 6, 35);     // B batı şeridi (çit boyu)
  carve(2, 36, 17, 38);    // B şeridi -> doğuş
  carve(7, 26, 10, 29);    // batı şeridinde küçük cep

  // ---- depo (B bölgesi): çevre duvarları + iç alan + kapılar
  const [wx0, wz0, wx1, wz1] = WAREHOUSE;
  for (let z = wz0; z <= wz1; z++) for (let x = wx0; x <= wx1; x++) {
    const edge = x === wx0 || x === wx1 || z === wz0 || z === wz1;
    g[z][x] = edge ? 'W' : '.';
  }
  carve(7, 7, 9, 7);       // kuzey kapı (rıhtıma)
  carve(15, 11, 15, 12);   // doğu kapı (orta geçide)
  carve(4, 19, 5, 19);     // güney kapı (batı şeridine)

  // ---- orta koridor daralması
  g[13][21] = '#'; g[13][25] = '#'; g[14][21] = '#'; g[14][25] = '#';

  // ---- bomba bölgeleri
  carve(35, 9, 43, 16, 'A');
  carve(5, 10, 12, 16, 'B');

  // ---- rıhtım kenarı (deniz)
  for (let x = 1; x <= 46; x++) g[0][x] = '~';

  // ---- vinç ayakları (rıhtım üzerinde, iki gantry vinç)
  put([[35, 1], [35, 5], [41, 1], [41, 5], [11, 1], [11, 5]], 'P');

  // ---- serbest konteynerler (siper): [x, z, uzunluk, eksen, kat]
  const loose = [
    [14, 2, 3, 'x', 1], [28, 3, 2, 'z', 2], [37, 11, 3, 'x', 1], [40, 13, 2, 'z', 2], [33, 15, 3, 'x', 1],
    [43, 7, 2, 'z', 1], [22, 18, 2, 'z', 1], [24, 28, 2, 'z', 1], [43, 27, 2, 'z', 1], [3, 31, 2, 'x', 1],
    [33, 37, 3, 'x', 1], [19, 2, 1, 'x', 1],
  ];
  const fixed = [];
  for (const [x, z, len, ax, tiers] of loose) {
    for (let i = 0; i < len; i++) { const cx = ax === 'x' ? x + i : x, cz = ax === 'z' ? z + i : z; g[cz][cx] = '#'; }
    fixed.push({ x, z, len, axis: ax, tiers });
  }

  // ---- palet / raf / sandık
  put([[6, 12], [10, 12], [6, 14], [10, 14], [36, 6], [24, 9], [44, 21], [29, 37], [20, 40], [5, 23], [8, 36]], 'c');
  put([[8, 9], [9, 9], [12, 9], [12, 17], [13, 17], [4, 17], [23, 33], [27, 23], [45, 33]], 'C');

  const rows = g.map((r) => r.join(''));

  // ---- konteyner yığınlarını döşe (her '#' hücresi bir konteynere ait)
  const owner = new Int32Array(W * H).fill(-1);
  const containers = [];
  const R = rnd(4242);
  const isC = (x, z) => x >= 0 && z >= 0 && x < W && z < H && g[z][x] === '#';
  const addC = (x, z, len, axis, tiers) => {
    const id = containers.length;
    containers.push({ x, z, len, axis, tiers, color: Math.floor(R() * CONTAINER_COLORS.length), colors: [0, 1, 2].map(() => Math.floor(R() * CONTAINER_COLORS.length)) });
    for (let i = 0; i < len; i++) { const cx = axis === 'x' ? x + i : x, cz = axis === 'z' ? z + i : z; owner[cz * W + cx] = id; }
  };
  for (const f of fixed) addC(f.x, f.z, f.len, f.axis, f.tiers);
  const run = (x, z, dx, dz) => { let n = 0; while (isC(x + dx * n, z + dz * n) && owner[(z + dz * n) * W + x + dx * n] < 0) n++; return n; };
  const tiersFor = (x, z) => {
    const edge = x <= 0 || z >= H - 1 || x >= W - 1;
    if (edge) return 3;
    return R() < 0.55 ? 2 : 3;
  };
  // önce dikey bloklar, sonra yatay
  for (const pass of ['z', 'x']) {
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (!isC(x, z) || owner[z * W + x] >= 0) continue;
      const hr = run(x, z, 1, 0), vr = run(x, z, 0, 1);
      if (pass === 'z' && !(vr > hr && vr >= 3)) continue;
      const n = pass === 'z' ? vr : hr;
      let i = 0;
      while (i < n) {
        const left = n - i;
        const len = left >= 9 ? 6 : left >= 6 ? (left === 6 ? 6 : 3) : left >= 3 ? 3 : left;
        const t = tiersFor(x, z);
        if (pass === 'z') addC(x, z + i, len, 'z', t); else addC(x + i, z, len, 'x', t);
        i += len;
      }
    }
  }
  const heights = new Float32Array(W * H);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const ch = g[z][x];
    if (ch === '#') heights[z * W + x] = containers[owner[z * W + x]].tiers * TIER;
    else if (ch === 'W') heights[z * W + x] = WAREHOUSE_H;
    else if (ch === 'P') heights[z * W + x] = 24;
    else if (ch === '~') heights[z * W + x] = 12;
  }
  return { rows, heights, containers, colors: CONTAINER_COLORS, warehouse: WAREHOUSE };
}

export default {
  id: 'liman', name: 'Liman', desc: 'Yağmurlu konteyner limanı', W, H, build,
  spawnCells: {
    def: [[20, 3], [22, 2], [24, 3], [26, 2], [21, 4], [23, 4], [25, 4], [27, 3], [22, 1], [26, 4]],
    att: [[20, 39], [22, 38], [24, 39], [26, 38], [28, 39], [21, 40], [23, 41], [25, 40], [27, 41], [19, 41]],
  },
  spawnYaw: { def: Math.PI, att: 0 },
  spawnCenter: { def: [23.5, 3], att: [23.5, 39.5] },
  regions: {
    Aarea: [32, 6, 45, 18], Barea: [3, 8, 14, 18], mid: [21, 7, 25, 11], midLow: [21, 24, 25, 31],
    long: [41, 22, 45, 33], tunnel: [2, 22, 6, 33],
  },
  routes: { A: [[43, 30], [28, 22]], B: [[4, 28], [18, 11]], mid: [23, 25] },
  attSpawnMinZ: 33,
  // yağmurun girmediği çatılı alanlar (dünya koordinatı, metre): x0, z0, x1, z1, yükseklik
  roofs: [[WAREHOUSE[0] * 2, WAREHOUSE[1] * 2, (WAREHOUSE[2] + 1) * 2, (WAREHOUSE[3] + 1) * 2, WAREHOUSE_H]],
};
