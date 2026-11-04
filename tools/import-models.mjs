// Sketchfab'den indirilen modelleri oyuna kopyalar.
// Kullanım: npm run import-models [klasör]   (varsayılan: ~/Downloads ve ~/Downloads/gltf)
// Dosya adları kervan_<silah>.glb ya da Sketchfab'in orijinal adları olabilir (.glb veya .zip).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client', 'assets', 'models');
const dirs = process.argv[2] ? [process.argv[2]] : [path.join(os.homedir(), 'Downloads'), path.join(os.homedir(), 'Downloads', 'gltf')];

const PATTERNS = [
  ['rifle', /kervan_rifle|fps_ak/i],
  ['carbine', /kervan_carbine|carbine/i],
  ['deagle', /kervan_deagle|heavy_pistol/i],
  ['pistol', /kervan_pistol|fps_pistol/i],
  ['smg', /kervan_smg|fps_animated_smg/i],
  ['shotgun', /kervan_shotgun|^shotgun_animated/i],
  ['sniper', /kervan_sniper|sniper_animated/i],
  ['knife', /kervan_knife|knife_animated/i],
  ['grenade', /kervan_grenade|arms_throwing/i],
];

const found = {};
for (const d of dirs) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    const full = path.join(d, f);
    if (!/\.(glb|zip)$/i.test(f)) continue;
    const st = fs.statSync(full);
    if (st.size < 100000) continue; // hata yanıtları / boş dosyalar
    for (const [key, rx] of PATTERNS) {
      if (rx.test(f) && (!found[key] || st.mtimeMs > found[key].mtime)) { found[key] = { file: full, mtime: st.mtimeMs }; break; }
    }
  }
}

if (!Object.keys(found).length) { console.log('Model bulunamadı. Dosyaları ~/Downloads içine indir.'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
for (const [key, { file }] of Object.entries(found)) {
  const dest = path.join(OUT, key);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  if (file.endsWith('.zip')) execFileSync('unzip', ['-q', '-o', file, '-d', dest]);
  else fs.copyFileSync(file, path.join(dest, 'model.glb'));
  console.log(`✓ ${key.padEnd(8)} ← ${path.basename(file)}`);
}
console.log(`\n${Object.keys(found).length} model içe aktarıldı → ${path.relative(ROOT, OUT)}`);
