// "Kervan" — güneşli çöl kasabası. Izgara: 48 x 44 hücre, hücre = 2 m.
// '#' bina duvarı, '.' zemin, 'c' alçak sandık, 'C' yüksek sandık, 'A'/'B' bomba bölgesi

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function buildingRand(cx, cz, salt = 0) { return hash2(Math.floor(cx / 4) + salt * 31, Math.floor(cz / 4) + salt * 17); }

const W = 48, H = 44;

function build() {
  const g = [];
  for (let z = 0; z < H; z++) g.push(new Array(W).fill('#'));
  const carve = (x0, z0, x1, z1, ch = '.') => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch; };
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
  g[14][22] = '#'; g[14][25] = '#';
  g[15][22] = '#'; g[15][25] = '#';
  carve(35, 5, 42, 12, 'A');
  carve(5, 5, 12, 12, 'B');
  put([[37, 8], [38, 8], [38, 9], [22, 30], [40, 20], [8, 8], [9, 8], [30, 37], [10, 18], [24, 4], [24, 5]], 'C');
  put([[36, 9], [43, 4], [34, 12], [41, 11], [8, 9], [4, 4], [12, 12], [13, 5],
    [23, 24], [42, 26], [19, 37], [28, 40], [11, 20], [20, 3], [27, 3], [16, 12], [24, 33], [43, 33]], 'c');
  const rows = g.map((r) => r.join(''));
  const heights = new Float32Array(W * H);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const edge = x === 0 || z === 0 || x === W - 1 || z === H - 1;
    heights[z * W + x] = edge ? 10 : 6 + Math.floor(buildingRand(x, z) * 5);
  }
  return { rows, heights };
}

export default {
  id: 'kervan', name: 'Kervan', desc: 'Güneşli çöl kasabası', W, H, build,
  spawnCells: {
    def: [[21, 4], [23, 3], [25, 4], [27, 5], [22, 6], [24, 6], [26, 3], [20, 5], [28, 6], [25, 6]],
    att: [[20, 39], [22, 38], [24, 39], [26, 38], [28, 39], [21, 40], [23, 40], [25, 40], [27, 41], [19, 41]],
  },
  spawnYaw: { def: Math.PI, att: 0 },
  spawnCenter: { def: [23.5, 4.5], att: [23.5, 39] },
  regions: {
    Aarea: [33, 3, 44, 14], Barea: [3, 3, 14, 14], mid: [22, 9, 25, 13], midLow: [22, 22, 25, 30],
    long: [40, 22, 43, 34], tunnel: [5, 17, 12, 23],
  },
  // saldırganların doğuştan çıkarken kullandığı ara noktalar
  routes: { A: [[41, 30], [30, 20]], B: [[7, 28], [19, 12]], mid: [24, 25] },
  attSpawnMinZ: 30,
  roofs: [],
};
