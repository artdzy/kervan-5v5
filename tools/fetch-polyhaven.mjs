// Polyhaven (CC0) varlıklarını indirir: HDRI, PBR dokular, dekor modelleri
// Kullanım: node tools/fetch-polyhaven.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client', 'assets', 'polyhaven');

export const HDRI = { id: 'goegap', res: '4k' };
export const TEXTURES = {
  wall_sandstone: 'sandstone_blocks_08',
  wall_plaster: 'plastered_stone_wall',
  wall_clay: 'clay_plaster',
  floor_cobble: 'cobblestone_floor_08',
  floor_sand: 'gravelly_sand',
  floor_tiles: 'large_floor_tiles_02',
  floor_concrete: 'concrete_floor_worn_001',
  wood: 'rough_wood',
  metal: 'rusty_metal_02',
};
export const MODELS = ['wooden_crate_01', 'wooden_crate_02', 'Barrel_01', 'wooden_barrels_01', 'concrete_road_barrier', 'planter_pot_clay', 'ceramic_vase_02', 'Lantern_01', 'potted_plant_02', 'old_military_crate'];
const TEX_RES = '2k', MODEL_RES = '1k';

async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
async function save(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return true;
}

async function main() {
  let n = 0;
  const h = await json(`https://api.polyhaven.com/files/${HDRI.id}`);
  if (await save(h.hdri[HDRI.res].hdr.url, path.join(OUT, 'hdri', `${HDRI.id}_${HDRI.res}.hdr`))) n++;
  console.log('✓ HDRI', HDRI.id);
  for (const [key, id] of Object.entries(TEXTURES)) {
    const f = await json(`https://api.polyhaven.com/files/${id}`);
    for (const [map, name] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['arm', 'arm']]) {
      const e = f[map]?.[TEX_RES]?.jpg;
      if (e && await save(e.url, path.join(OUT, 'textures', key, `${name}.jpg`))) n++;
    }
    console.log('✓ doku', key, '←', id);
  }
  for (const id of MODELS) {
    const f = await json(`https://api.polyhaven.com/files/${id}`);
    const g = f.gltf?.[MODEL_RES]?.gltf;
    if (!g) { console.log('✗ model yok', id); continue; }
    const dir = path.join(OUT, 'models', id);
    if (await save(g.url, path.join(dir, `${id}.gltf`))) n++;
    for (const [rel, inc] of Object.entries(g.include || {})) if (await save(inc.url, path.join(dir, rel))) n++;
    console.log('✓ model', id);
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ hdri: `${HDRI.id}_${HDRI.res}.hdr`, textures: TEXTURES, models: MODELS }, null, 1));
  console.log(`\n${n} dosya indirildi → ${path.relative(ROOT, OUT)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
