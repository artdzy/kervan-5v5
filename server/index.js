// HTTP statik sunucu + WebSocket oyun sunucusu
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { TICK_RATE } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp',
  '.ktx2': 'image/ktx2', '.md': 'text/markdown; charset=utf-8',
};

const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
  ['/', path.join(ROOT, 'client')],
];

const MODELS_DIR = path.join(ROOT, 'client', 'assets', 'models');

function listModels() {
  const out = {};
  if (!fs.existsSync(MODELS_DIR)) return out;
  for (const d of fs.readdirSync(MODELS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = path.join(MODELS_DIR, d.name);
    const f = fs.readdirSync(dir).find((n) => /\.(gltf|glb)$/i.test(n));
    if (f) out[d.name] = `assets/models/${d.name}/${f}`;
  }
  return out;
}

function serve(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (url === '/models.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(listModels()));
    return;
  }
  if (url === '/') url = '/index.html';
  for (const [prefix, base] of MOUNTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.resolve(base, '.' + url.slice(prefix.length - 1));
    if (!file.startsWith(base)) break;
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404).end();
}

const server = http.createServer(serve);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const game = new Game();
wss.on('connection', (ws) => game.onConnect(ws));

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try { game.tick(dt); } catch (e) { console.error('tick hatası:', e); }
}, 1000 / TICK_RATE);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  5v5 FPS sunucusu çalışıyor`);
  console.log(`  Bu bilgisayar:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  Yerel ağ (LAN): http://${i.address}:${PORT}`);
  }
  const m = Object.keys(listModels());
  console.log(`  Yüklü 3D modeller: ${m.length ? m.join(', ') : 'yok (prosedürel modeller kullanılıyor)'}\n`);
});
