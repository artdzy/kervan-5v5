// Küçük matematik yardımcıları (sunucu + istemci)

export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function dist3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
export function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function approachAngle(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

// Bir noktadan diğerine bakmak için yaw/pitch
export function anglesTo(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return { yaw, pitch };
}

// Işın / AABB kesişimi (slab). {t, n} veya null
export function rayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = -Infinity, tmax = Infinity, nAxis = -1, nSign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      let s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = i; nSign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  const n = [0, 0, 0];
  if (nAxis >= 0) n[nAxis] = nSign;
  return { t: Math.max(tmin, 0), n };
}

export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

// Koni içinde rastgele sapma uygula
export function applySpread(dir, spread, rnd = Math.random) {
  if (spread <= 0) return dir;
  // dir'e dik iki eksen
  const up = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let rx = dir.y * up.z - dir.z * up.y, ry = dir.z * up.x - dir.x * up.z, rz = dir.x * up.y - dir.y * up.x;
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * dir.z - rz * dir.y, uy = rz * dir.x - rx * dir.z, uz = rx * dir.y - ry * dir.x;
  const a = rnd() * Math.PI * 2, m = Math.sqrt(rnd()) * spread;
  const ca = Math.cos(a) * m, sa = Math.sin(a) * m;
  return normalize({ x: dir.x + rx * ca + ux * sa, y: dir.y + ry * ca + uy * sa, z: dir.z + rz * ca + uz * sa });
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
