// İstemci giriş noktası: render döngüsü, girdi, ağ, oyun durumu
import * as THREE from 'three';
import { WEAPONS, WEAPON_KEYS, PLAYER, ROUND, GRENADE, TEAM_NAMES, BUY_RADIUS, INTERP_DELAY, BUY_MENU } from '/shared/constants.js';
import { SPAWN_CENTER, zoneAt, raycastMap, hasLOS } from '/shared/map.js';
import { stepPlayer } from '/shared/physics.js';
import { dirFromAngles, applySpread, wrapAngle, rayAABB, raySphere, clamp } from '/shared/util.js';
import { buildWorld } from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Avatar } from './avatar.js';
import { ViewModel } from './viewmodel.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';

// ------------------------------------------------------------------ kurulum
const container = document.getElementById('game');
const QUALITY = localStorage.getItem('fps-quality') || 'ultra';
document.getElementById('quality').value = QUALITY;
document.getElementById('quality').addEventListener('change', (e) => { localStorage.setItem('fps-quality', e.target.value); location.reload(); });
const renderer = new THREE.WebGLRenderer({ antialias: QUALITY === 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY === 'ultra' ? 1.25 : QUALITY === 'high' ? 1 : 0.85));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const BASE_FOV = 78;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 600);
camera.rotation.order = 'YXZ';
const world = buildWorld(scene, renderer, QUALITY);
window.__world = world;

// ---- post-processing (Ultra/Yüksek)
let composer = null, gtao = null, bloom = null;
function makeComposer() {
  if (QUALITY === 'low') return;
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (QUALITY === 'ultra') {
    gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 1.0;
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1, samples: 8, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    composer.addPass(gtao);
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.45, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
const vm = new ViewModel(window.innerWidth / window.innerHeight, renderer);
const fx = new Effects(scene);
fx.shells.onBounce = (p) => audio.tink(p);
window.__vm = vm;
window.__dbg = { fx, hud: () => hud, camera };
const audio = new Audio();
const hud = new HUD();

makeComposer();
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = vm.camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); vm.camera.updateProjectionMatrix();
});

// ------------------------------------------------------------------ durum
const S = {
  ws: null, myId: null, team: 'att', connected: false,
  offset: null, snaps: [], roster: new Map(), avatars: new Map(),
  me: { hp: 100, ar: 0, $: 800, a: false, pr: 0, pt: null },
  inv: { primary: null, secondary: 'pistol', gr: 0, bomb: false, kit: false, ammo: {}, armor: 0, helmet: false },
  round: { ph: 'waiting', pe: 0, be: 0, n: 0, sa: 0, sd: 0 }, bomb: null,
  alive: false,
  pos: { x: 48, y: 0, z: 79 }, vel: { x: 0, y: 0, z: 0 }, onGround: true, crouch: false, eyeH: PLAYER.eye,
  yaw: 0, pitch: 0,
  w: { cur: 'pistol', last: 'knife', nextFire: 0, reloadEnd: 0, drawEnd: 0, spray: 0, lastShot: 0, triggerUsed: false, scoped: 0 },
  punch: { p: 0, y: 0 }, shake: 0,
  keys: new Set(), mouse: { l: false, r: false, dx: 0, dy: 0 },
  buyOpen: false, chatOpen: false, sbOpen: false,
  sens: 1, stepAcc: 0, specId: null, deathPos: null, lastBeep: 0, sendAcc: 0,
};
const now = () => performance.now() / 1000;
const serverNow = () => now() + (S.offset || 0);

// ------------------------------------------------------------------ lobi
const $ = (id) => document.getElementById(id);
const nameInput = $('name');
nameInput.value = localStorage.getItem('fps-name') || '';
S.sens = Number(localStorage.getItem('fps-sens') || 1);
$('sens').value = S.sens; $('sens-val').textContent = S.sens.toFixed(2);
$('sens').addEventListener('input', (e) => { S.sens = Number(e.target.value); $('sens-val').textContent = S.sens.toFixed(2); localStorage.setItem('fps-sens', S.sens); });
let pickTeam = 'auto';
document.querySelectorAll('.tbtn').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tbtn').forEach((x) => x.classList.remove('sel'));
  b.classList.add('sel'); pickTeam = b.dataset.team;
}));
$('play').addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Oyuncu' + Math.floor(Math.random() * 900 + 100);
  localStorage.setItem('fps-name', name);
  audio.init();
  connect(name, pickTeam);
});
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('play').click(); });

const CREDITS = {
  knife: ['knife Animated', 'bumstrum', 'f3140db917cc43389c14b5b2536c1dc8'],
  pistol: ['fps pistol Animated', 'bumstrum', 'a8cdd6c2e936484aaf67e1786c8320d9'],
  deagle: ['heavy pistol animated', 'bumstrum', 'b7c78c533ced40cd986c44594b778ed6'],
  smg: ['fps animated smg', 'bumstrum', 'ea3dad7478624495a5a46f40127b0579'],
  shotgun: ['shotgun animated', 'bumstrum', 'c3d3cf425869463a84d650c15e3af0d2'],
  rifle: ['fps AK animated', 'bumstrum', 'b0b1bae40337449189483f6187cf7af7'],
  carbine: ['fps animated carbine', 'bumstrum', '62977bb4c53047a185b9f3a0cdf56b87'],
  sniper: ['sniper animated', 'bumstrum', 'b48999a250b2433da59f705c371a49b2'],
  grenade: ['Fps Arms throwing', 'bumstrum', '99ff0b0e5b144cbfbf67cb34f8ce83bb'],
};
vm.loadModels().then((keys) => {
  const weapons = keys.length
    ? 'Silahlar (CC BY 4.0, Sketchfab): ' + keys.map((k) => CREDITS[k] ? `<a href="https://sketchfab.com/3d-models/${CREDITS[k][2]}" target="_blank">${CREDITS[k][0]}</a> — ${CREDITS[k][1]}` : k).join(' · ')
    : 'Silahlar: prosedürel modeller';
  $('credits').innerHTML = `${weapons}<br>Ortam: <a href="https://polyhaven.com" target="_blank">Poly Haven</a> (CC0) — HDRI, dokular, dekor modelleri · Asker: three.js örnek modeli (Mixamo)`;
});

hud.buildBuy((item) => buy(item));

// ------------------------------------------------------------------ ağ
function connect(name, team) {
  $('play').disabled = true; $('lobby-status').textContent = 'Bağlanılıyor…';
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  S.ws = ws;
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', name, team })); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => {
    S.connected = false;
    $('lobby').classList.remove('hidden'); hud.show(false);
    $('play').disabled = false; $('lobby-status').textContent = 'Sunucu bağlantısı koptu. Tekrar dene.';
    document.exitPointerLock?.();
  };
  ws.onerror = () => { $('lobby-status').textContent = 'Sunucuya bağlanılamadı.'; };
}
const send = (m) => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(m)); };

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      S.myId = m.id; S.team = m.team; S.connected = true;
      S.offset = m.tm / 1000 - now();
      vm.setTeam(S.team);
      $('lobby').classList.add('hidden'); hud.show(true);
      lock();
      break;
    case 's': onSnap(m); break;
    case 'roster':
      S.roster = new Map(m.list.map((p) => [p.i, p]));
      { const me = S.roster.get(S.myId); if (me && me.tm !== S.team) { S.team = me.tm; vm.setTeam(S.team); } }
      for (const [id, av] of S.avatars) { const r = S.roster.get(id); if (r) av.setName(r.n, r.tm, r.tm === S.team); }
      if (S.sbOpen) hud.scoreboard(true, [...S.roster.values()], S.myId, S.round);
      break;
    case 'inv': onInv(m); break;
    case 'spawn':
      S.pos = { ...m.pos }; S.vel = { x: 0, y: 0, z: 0 }; S.yaw = m.yaw; S.pitch = 0; S.alive = true;
      S.punch = { p: 0, y: 0 }; S.w.reloadEnd = 0; S.w.scoped = 0; S.specId = null; S.deathPos = null;
      hud.spectate(null);
      break;
    case 'pos': S.pos = { ...m.pos }; S.vel = { x: 0, y: 0, z: 0 }; break;
    case 'round':
      hud.center(`Round ${m.n}`, '', 'Hazırlık — B ile satın al', 3);
      fx.clearDecals();
      break;
    case 'live': audio.roundStart(); hud.notify(S.team === 'att' ? 'Bombayı A veya B bölgesine kur!' : 'Bölgeleri savun, bombayı engelle!', 3); break;
    case 'roundEnd': {
      const why = { elim: 'Tüm rakipler etkisiz', time: 'Süre doldu', bomb: 'Bomba patladı', defuse: 'Bomba imha edildi' }[m.reason] || '';
      hud.center(`${TEAM_NAMES[m.winner]} kazandı`, m.winner, why, 5);
      audio.roundEnd(m.winner === S.team);
      break;
    }
    case 'matchEnd':
      hud.center(m.winner ? `MAÇ BİTTİ — ${TEAM_NAMES[m.winner]} kazandı` : 'MAÇ BERABERE', m.winner || '', `${m.score.att} : ${m.score.def} · yeni maç başlıyor…`, 10);
      break;
    case 'msg': if (m.big) hud.center(m.text, '', '', 4); else hud.notify(m.text); break;
    case 'chat': { const r = S.roster.get(m.i); hud.chat(r ? r.n : '?', r ? r.tm : 'att', m.msg); break; }
    case 'shot': onRemoteShot(m); break;
    case 'reload': { const p = remotePos(m.i); if (p) audio.reload(p); break; }
    case 'throw': { const p = remotePos(m.i); if (p) audio.swing(p); break; }
    case 'hit': hud.hitmarker(m.hs); audio.hit(m.hs); break;
    case 'dmg': {
      audio.hurt();
      let ang = null;
      if (m.from) { const rel = wrapAngle(Math.atan2(-(m.from[0] - S.pos.x), -(m.from[1] - S.pos.z)) - S.yaw); ang = -rel; }
      hud.damage(ang, m.amt);
      S.punch.p += 0.02; S.shake = Math.max(S.shake, 0.15);
      break;
    }
    case 'kill': onKill(m); break;
    case 'planted':
      hud.center('Bomba kuruldu!', 'att', `${m.site} bölgesi · ${ROUND.bomb} saniye`, 3);
      break;
    case 'defused': hud.center('Bomba imha edildi', 'def', '', 3); break;
    case 'explode': {
      const p = new THREE.Vector3(...m.p);
      fx.explosion(p, m.big); audio.explosion(p, m.big);
      const d = p.distanceTo(new THREE.Vector3(S.pos.x, S.pos.y, S.pos.z));
      S.shake = Math.max(S.shake, clamp((m.big ? 40 : 14) / (d + 2), 0, 1.2));
      break;
    }
    case 'bounce': audio.bounce(new THREE.Vector3(...m.p)); break;
    case 'left': { const av = S.avatars.get(m.i); if (av) { av.dispose(); S.avatars.delete(m.i); } break; }
  }
}

function onInv(m) {
  const prevBomb = S.inv.bomb;
  S.inv = { primary: m.primary, secondary: m.secondary, gr: m.gr, bomb: m.bomb, kit: m.kit, ammo: m.ammo, armor: m.armor, helmet: m.helmet };
  S.me.$ = m.money;
  if (!owns(S.w.cur) || (m.w && m.w !== S.w.cur && (WEAPONS[m.w].slot === 1 || WEAPONS[m.w].slot === 2) && S.buyOpen)) switchTo(m.w || bestWeapon(), true);
  else if (S.round.ph === 'freeze' && m.w && m.w !== S.w.cur && owns(m.w)) switchTo(m.w, true);
  if (!prevBomb && m.bomb && S.alive) hud.notify('Bomba sende! A veya B bölgesinde E basılı tut.');
  if (S.buyOpen) hud.updateBuy(S.me.$, S.team, S.inv);
}

function onKill(m) {
  const k = m.k ? S.roster.get(m.k) : null, v = S.roster.get(m.v);
  if (v) hud.killfeed(k, v, m.w, m.hs, m.k === S.myId || m.v === S.myId);
  // ölünün altında kan gölü (gövdenin düştüğü yer)
  {
    const st = m.v === S.myId ? { x: S.pos.x, y: S.pos.y, z: S.pos.z, yaw: S.yaw } : remoteState(m.v, serverNow() - INTERP_DELAY);
    if (st && m.w !== 'bomb') fx.bloodPool({ x: st.x + Math.sin(st.yaw) * 0.55, y: st.y, z: st.z + Math.cos(st.yaw) * 0.55 });
  }
  if (m.v === S.myId) {
    S.alive = false; S.deathPos = { ...S.pos };
    S.w.scoped = 0; S.buyOpen = false; hud.buyOpen(false);
    hud.center(k && m.k !== S.myId ? `${k.n} seni öldürdü` : 'Öldün', '', `${WEAPONS[m.w]?.name || 'Bomba'}${m.hs ? ' · kafadan' : ''}`, 3);
    S.specTimer = 2.5;
  } else if (m.k === S.myId) {
    hud.notify(`+$${WEAPONS[m.w]?.kill ?? 300}  ${v ? v.n : ''} öldürüldü${m.hs ? ' (kafa)' : ''}`, 2);
  }
  if (S.specId === m.v) S.specId = null;
}

function onSnap(m) {
  const t = m.tm / 1000;
  const est = t - now();
  if (S.offset === null || est > S.offset) S.offset = est; else S.offset += (est - S.offset) * 0.02;
  const pl = new Map();
  for (const a of m.p) pl.set(a[0], { x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], f: a[6], w: WEAPON_KEYS[a[7]] });
  S.snaps.push({ t, pl });
  if (S.snaps.length > 40) S.snaps.shift();
  const prevPh = S.round.ph;
  S.round = m.r; S.bomb = m.b;
  S.me = m.me;
  if (m.me.tm && m.me.tm !== S.team) { S.team = m.me.tm; vm.setTeam(S.team); }
  if (S.alive && !m.me.a) { S.alive = false; S.deathPos = S.deathPos || { ...S.pos }; }
  if (!S.alive && m.me.a && prevPh !== m.r.ph && m.r.ph === 'freeze') S.alive = true;
  fx.setGrenades(m.g);
  // kendi durumum için sunucu konumunu kullan (ölüyken)
  for (const id of S.avatars.keys()) if (!pl.has(id)) { S.avatars.get(id).dispose(); S.avatars.delete(id); }
}

function remoteState(id, rt) {
  const sn = S.snaps;
  if (!sn.length) return null;
  let i = sn.length - 1;
  while (i > 0 && sn[i].t > rt) i--;
  const a = sn[i], b = sn[i + 1];
  const pa = a.pl.get(id);
  if (!pa) return null;
  if (!b || rt <= a.t) return { ...pa };
  const pb = b.pl.get(id);
  if (!pb) return { ...pa };
  const k = clamp((rt - a.t) / (b.t - a.t), 0, 1);
  return {
    x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k, z: pa.z + (pb.z - pa.z) * k,
    yaw: pa.yaw + wrapAngle(pb.yaw - pa.yaw) * k, pitch: pa.pitch + (pb.pitch - pa.pitch) * k,
    f: k < 0.5 ? pa.f : pb.f, w: k < 0.5 ? pa.w : pb.w,
  };
}
function remotePos(id) {
  const s = remoteState(id, serverNow() - INTERP_DELAY);
  return s ? new THREE.Vector3(s.x, s.y + 1.4, s.z) : null;
}

function onRemoteShot(m) {
  const o = new THREE.Vector3(...m.o);
  audio.shot(m.w, o);
  if (WEAPONS[m.w].type !== 'gun') return;
  fx.flashLight(o, 3, 0.05);
  for (const e of m.e) {
    const end = new THREE.Vector3(e[0], e[1], e[2]);
    const from = o.clone().add(end.clone().sub(o).normalize().multiplyScalar(0.6));
    fx.tracer(from, end);
    if (e[3]) fx.blood(end, end.clone().sub(o).normalize());
    else {
      const d = end.clone().sub(o); const len = d.length(); d.normalize();
      const h = raycastMap(o.x, o.y, o.z, d.x, d.y, d.z, len + 0.2);
      if (h && Math.abs(h.t - len) < 0.3) fx.impact(end, h.n);
    }
  }
}

// ------------------------------------------------------------------ envanter / silah
function owns(key) {
  if (key === 'knife') return true;
  if (key === 'grenade') return S.inv.gr > 0;
  if (key === 'bomb') return S.inv.bomb;
  return S.inv.primary === key || S.inv.secondary === key;
}
function bestWeapon() { return S.inv.primary || S.inv.secondary || 'knife'; }

function switchTo(key, silent = false) {
  if (!key || !owns(key)) return;
  if (key === S.w.cur && !silent) return;
  if (key !== S.w.cur) S.w.last = S.w.cur;
  S.w.cur = key; S.w.reloadEnd = 0; S.w.scoped = 0; S.w.spray = 0;
  S.w.drawEnd = now() + (silent ? 0 : key === 'knife' ? 0.3 : 0.5);
  vm.setWeapon(key, silent);
  vm.cancelReload();
}

function slotKey(n) {
  if (n === 1) return S.inv.primary;
  if (n === 2) return S.inv.secondary;
  if (n === 3) return 'knife';
  if (n === 4) return S.inv.gr > 0 ? 'grenade' : null;
  if (n === 5) return S.inv.bomb ? 'bomb' : null;
  return null;
}

function startReload() {
  const key = S.w.cur, w = WEAPONS[key];
  if (!S.alive || w.type !== 'gun' || S.w.reloadEnd) return;
  const a = S.inv.ammo[key];
  if (!a || a.mag >= w.mag || a.res <= 0) return;
  S.w.reloadEnd = now() + w.reload;
  S.w.scoped = 0;
  vm.reload(w.reload); audio.reload(null);
  send({ t: 'reload' });
}

function finishReload() {
  const key = S.w.cur, w = WEAPONS[key], a = S.inv.ammo[key];
  S.w.reloadEnd = 0;
  if (!a) return;
  const n = Math.min(w.mag - a.mag, a.res); a.mag += n; a.res -= n;
}

function currentSpread() {
  const w = WEAPONS[S.w.cur];
  if (w.type !== 'gun') return 0;
  const speedFrac = clamp(Math.hypot(S.vel.x, S.vel.z) / PLAYER.run, 0, 1);
  let s;
  if (w.scope) s = S.w.scoped ? w.scopedSpread + w.moveSpread * Math.pow(speedFrac, 1.2) : w.spread + w.moveSpread * speedFrac;
  else s = w.spread + w.moveSpread * Math.pow(speedFrac, 1.3);
  if (!S.onGround) s += w.airSpread;
  if (S.crouch) s *= 0.75;
  if (w.auto) s += Math.min(S.w.spray, 10) * 0.0016;
  return s;
}

function eyePos() { return { x: S.pos.x, y: S.pos.y + S.eyeH, z: S.pos.z }; }
function aimAngles() { return { yaw: S.yaw + S.punch.y, pitch: clamp(S.pitch + S.punch.p, -1.55, 1.55) }; }

// istemci tarafı görsel isabet (hasar sunucuda)
function localHit(o, d, maxT) {
  const rt = serverNow() - INTERP_DELAY;
  let best = null;
  for (const [id] of S.avatars) {
    const r = S.roster.get(id);
    if (!r || r.tm === S.team) continue;
    const s = remoteState(id, rt);
    if (!s || !(s.f & 1)) continue;
    const eye = s.f & 2 ? PLAYER.crouchEye : PLAYER.eye;
    const th = raySphere(o, d, { x: s.x, y: s.y + eye - 0.02, z: s.z }, 0.2);
    const rb = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, s.x - 0.28, s.y, s.z - 0.28, s.x + 0.28, s.y + eye - 0.2, s.z + 0.28);
    let t = Math.min(th ?? Infinity, rb ? rb.t : Infinity);
    if (t < maxT && (!best || t < best)) best = t;
  }
  return best;
}

function fire() {
  const t = now(), key = S.w.cur, w = WEAPONS[key];
  if (!S.alive || t < S.w.nextFire || t < S.w.drawEnd || S.buyOpen || S.chatOpen) return;
  if (S.round.ph === 'freeze' || S.round.ph === 'waiting') return;
  if (w.type === 'bomb') return;
  if (w.type === 'grenade') { if (!S.w.triggerUsed) throwGrenade(); S.w.triggerUsed = true; return; }
  if (w.type === 'gun') {
    if (S.w.reloadEnd) return;
    const a = S.inv.ammo[key];
    if (!a || a.mag <= 0) {
      if (!S.w.triggerUsed) audio.click();
      S.w.triggerUsed = true; S.w.nextFire = t + 0.25;
      if (a && a.res > 0) startReload();
      return;
    }
    if (!w.auto && S.w.triggerUsed) return;
    a.mag--;
  }
  S.w.triggerUsed = true;
  if (t - S.w.lastShot > w.rate * 2 + 0.12) S.w.spray = 0;
  S.w.lastShot = t;
  S.w.nextFire = t + w.rate;

  const ang = aimAngles();
  const base = dirFromAngles(ang.yaw, ang.pitch);
  const o = eyePos();
  const spread = currentSpread();
  const dirs = [];
  for (let i = 0; i < (w.pellets || 1); i++) dirs.push(applySpread(base, spread));
  // görüntü modelinden dünya koordinatına yaklaşık namlu
  const right = new THREE.Vector3(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
  const mz = new THREE.Vector3(o.x, o.y, o.z).addScaledVector(right, 0.12).add(new THREE.Vector3(0, -0.1, 0));
  for (const d of dirs) {
    const range = w.range || 200;
    const hit = raycastMap(o.x, o.y, o.z, d.x, d.y, d.z, range);
    const maxT = hit ? hit.t : range;
    const pt = localHit(o, d, maxT);
    const tEnd = pt ?? maxT;
    const end = new THREE.Vector3(o.x + d.x * tEnd, o.y + d.y * tEnd, o.z + d.z * tEnd);
    if (w.type === 'gun') {
      if (Math.random() < 0.6 || w.pellets) fx.tracer(mz.clone().addScaledVector(new THREE.Vector3(d.x, d.y, d.z), 0.5), end);
      if (pt !== null) fx.blood(end, new THREE.Vector3(d.x, d.y, d.z));
      else if (hit) fx.impact(end, hit.n);
    }
  }
  if (w.type === 'gun') {
    // boş kovan ve namlu dumanı
    const fwd = new THREE.Vector3(base.x, base.y, base.z);
    const ej = new THREE.Vector3(o.x, o.y, o.z).addScaledVector(right, 0.2).addScaledVector(fwd, 0.35).add(new THREE.Vector3(0, -0.12, 0));
    const ev = right.clone().multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 1.6 + Math.random(), 0)).addScaledVector(fwd, 0.4).add(new THREE.Vector3(S.vel.x, 0, S.vel.z));
    if (key !== 'shotgun') fx.shell(ej, ev, key === 'sniper' || key === 'deagle');
    fx.muzzleSmoke(mz.clone().addScaledVector(fwd, 0.6), fwd);
  }
  send({ t: 'shoot', w: key, o: [o.x, o.y, o.z], d: dirs.map((d) => [d.x, d.y, d.z]), rt: Math.round((serverNow() - INTERP_DELAY) * 1000) });
  vm.fire();
  if (w.type === 'gun') {
    audio.shot(key, null);
    fx.flashLight(mz, 2.5, 0.05);
    const r = w.recoil * (1 + Math.min(S.w.spray, 10) * 0.09);
    S.punch.p += r;
    S.punch.y += (Math.random() - 0.5) * w.recoil * (S.w.spray > 3 ? 1.4 : 0.35);
    S.w.spray++;
    if (w.scope) S.w.scoped = 0;
    if (S.inv.ammo[key].mag === 0) setTimeout(() => { if (S.w.cur === key) startReload(); }, 250);
  } else audio.swing(null);
}

function throwGrenade() {
  const ang = aimAngles();
  const d = dirFromAngles(ang.yaw, ang.pitch + 0.08);
  const v = [d.x * GRENADE.throwSpeed + S.vel.x * 0.6, d.y * GRENADE.throwSpeed + 1.5 + S.vel.y * 0.4, d.z * GRENADE.throwSpeed + S.vel.z * 0.6];
  send({ t: 'throw', v });
  audio.swing(null);
  vm.fire();
  S.inv.gr = Math.max(0, S.inv.gr - 1);
  setTimeout(() => switchTo(owns(S.w.last) && S.w.last !== 'grenade' ? S.w.last : bestWeapon()), 250);
}

function buyAllowed() {
  return S.alive && serverNow() < S.round.be / 1000 && (S.round.ph === 'freeze' || S.round.ph === 'live')
    && Math.hypot(S.pos.x - SPAWN_CENTER[S.team].x, S.pos.z - SPAWN_CENTER[S.team].z) <= BUY_RADIUS;
}
function buy(item) { send({ t: 'buy', item }); audio.buy(); }
function toggleBuy(force) {
  const open = force !== undefined ? force : !S.buyOpen;
  if (open && !buyAllowed()) { hud.notify('Şu an satın alamazsın (süre doldu veya bölge dışı)'); return; }
  S.buyOpen = open;
  hud.buyOpen(open);
  if (open) { hud.updateBuy(S.me.$, S.team, S.inv); document.exitPointerLock?.(); }
  else lock();
}

// ------------------------------------------------------------------ girdi
function lock() {
  if (S.chatOpen || S.buyOpen) return;
  try { const r = renderer.domElement.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch { /* yoksay */ }
}
const locked = () => document.pointerLockElement === renderer.domElement;
renderer.domElement.addEventListener('click', () => { if (S.connected && !locked()) lock(); });
document.addEventListener('pointerlockchange', () => {
  $('click-to-play').classList.toggle('hidden', locked() || !S.connected || S.buyOpen || S.chatOpen);
  if (!locked()) { S.keys.clear(); S.mouse.l = false; }
});
$('click-to-play').addEventListener('click', lock);
document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  const fovK = camera.fov / BASE_FOV;
  const k = 0.0022 * S.sens * fovK;
  S.yaw -= e.movementX * k;
  S.pitch = clamp(S.pitch - e.movementY * k, -1.55, 1.55);
  S.mouse.dx += e.movementX; S.mouse.dy += e.movementY;
});
document.addEventListener('mousedown', (e) => {
  if (!locked()) return;
  if (e.button === 0) { S.mouse.l = true; }
  if (e.button === 2) {
    const w = WEAPONS[S.w.cur];
    if (w.scope && S.alive && !S.w.reloadEnd) S.w.scoped = (S.w.scoped + 1) % 3;
  }
  if (!S.alive && e.button === 0) cycleSpectate();
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) { S.mouse.l = false; S.w.triggerUsed = false; } });
document.addEventListener('contextmenu', (e) => e.preventDefault());

const chatInput = $('chat-input');
function openChat() {
  S.chatOpen = true; chatInput.classList.remove('hidden'); chatInput.value = '';
  document.exitPointerLock?.(); setTimeout(() => chatInput.focus(), 0);
}
chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { const v = chatInput.value.trim(); if (v) send({ t: 'chat', msg: v }); closeChat(); }
  else if (e.key === 'Escape') closeChat();
});
function closeChat() { S.chatOpen = false; chatInput.classList.add('hidden'); chatInput.blur(); lock(); }

document.addEventListener('keydown', (e) => {
  if (!S.connected || S.chatOpen) return;
  if (e.code === 'Tab') { e.preventDefault(); S.sbOpen = true; hud.scoreboard(true, [...S.roster.values()], S.myId, S.round); return; }
  if (S.buyOpen) {
    if (e.code === 'KeyB' || e.code === 'Escape') { e.preventDefault(); toggleBuy(false); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= 9) { const items = BUY_MENU.flatMap((c) => c.items); if (items[n - 1]) buy(items[n - 1]); }
    return;
  }
  if (e.code === 'KeyB') { e.preventDefault(); toggleBuy(true); return; }
  if ((e.code === 'KeyT' || e.code === 'Enter') && locked()) { e.preventDefault(); openChat(); return; }
  if (!locked()) return;
  if (['Space', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault();
  S.keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyQ') switchTo(owns(S.w.last) ? S.w.last : bestWeapon());
  if (e.code === 'KeyG' && S.inv.gr > 0) { switchTo('grenade'); }
  const m = /^Digit([1-5])$/.exec(e.code);
  if (m) { const k = slotKey(Number(m[1])); if (k) switchTo(k); }
});
document.addEventListener('keyup', (e) => {
  S.keys.delete(e.code);
  if (e.code === 'Tab') { S.sbOpen = false; hud.scoreboard(false); }
});
window.addEventListener('wheel', (e) => {
  if (!locked() || !S.alive) return;
  const order = [1, 2, 3, 4, 5].map(slotKey).filter(Boolean);
  const i = order.indexOf(S.w.cur);
  const n = order[(i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length];
  if (n) switchTo(n);
});

// ------------------------------------------------------------------ izleyici
function aliveMates() {
  const list = [];
  const last = S.snaps[S.snaps.length - 1];
  if (!last) return list;
  for (const [id, s] of last.pl) { const r = S.roster.get(id); if (id !== S.myId && r && r.tm === S.team && (s.f & 1)) list.push(id); }
  return list;
}
function cycleSpectate() {
  const l = aliveMates(); if (!l.length) { S.specId = null; return; }
  const i = l.indexOf(S.specId);
  S.specId = l[(i + 1) % l.length];
}

// ------------------------------------------------------------------ döngü
let lastT = now();
function frame() {
  requestAnimationFrame(frame);
  const t = now();
  const dt = Math.min(0.05, t - lastT);
  lastT = t;
  if (S.connected) update(dt, t);
  else { camera.position.set(48 + Math.sin(t * 0.1) * 30, 14, 44 + Math.cos(t * 0.1) * 30); camera.lookAt(48, 0, 44); }
  renderer.clear();
  if (composer) composer.render(dt); else renderer.render(scene, camera);
  if (S.connected && S.alive && !S.specId) vm.render(renderer);
}

function update(dt, t) {
  const ph = S.round.ph;
  const frozenPhase = ph === 'freeze' || ph === 'waiting';

  // --- kullanım (bomba kur/imha)
  const holdingUse = S.alive && locked() && (S.keys.has('KeyE') || (S.mouse.l && S.w.cur === 'bomb'));
  const canPlant = S.inv.bomb && zoneAt(S.pos.x, S.pos.z) && S.onGround && ph === 'live';
  const b = S.bomb;
  const canDefuse = S.team === 'def' && b && b.s === 'planted' && b.p && Math.hypot(S.pos.x - b.p[0], S.pos.z - b.p[2]) < 1.8;
  const using = holdingUse && (canPlant || canDefuse);
  if (using && canPlant && S.w.cur !== 'bomb') switchTo('bomb', true);

  // --- yerel hareket
  if (S.alive) {
    if (S.w.reloadEnd && t >= S.w.reloadEnd) finishReload();
    const k = S.keys;
    const wpn = WEAPONS[S.w.cur];
    let spMul = wpn.speed || 1;
    if (S.w.scoped) spMul *= 0.55;
    const inp = {
      fwd: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      right: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      jump: k.has('Space') && !S.jumpHeld,
      crouch: k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC') || (using && canDefuse),
      walk: k.has('ShiftLeft') || k.has('ShiftRight'),
      yaw: S.yaw, speedMul: spMul,
      frozen: frozenPhase || using || S.buyOpen || S.chatOpen,
    };
    S.jumpHeld = k.has('Space');
    const ps = { pos: S.pos, vel: S.vel, onGround: S.onGround, crouch: S.crouch };
    const before = { x: S.pos.x, z: S.pos.z };
    stepPlayer(ps, inp, dt);
    S.onGround = ps.onGround; S.crouch = ps.crouch;
    if (ps.landed) audio.land();
    const targetEye = S.crouch ? PLAYER.crouchEye : PLAYER.eye;
    S.eyeH += (targetEye - S.eyeH) * Math.min(1, dt * 14);
    // ayak sesi
    const moved = Math.hypot(S.pos.x - before.x, S.pos.z - before.z);
    if (S.onGround && !inp.walk && !S.crouch && moved / Math.max(dt, 1e-4) > 3.3) {
      S.stepAcc += moved;
      if (S.stepAcc > 2.3) { S.stepAcc = 0; audio.step(null, 0.5); }
    }
    // ateş
    if (S.mouse.l && locked()) fire();
    // tepme geri dönüşü
    const rec = Math.min(1, dt * (t - S.w.lastShot > 0.12 ? 7 : 2.5));
    S.punch.p -= S.punch.p * rec; S.punch.y -= S.punch.y * rec;
  }

  // --- ağ girdisi gönder (30Hz)
  S.sendAcc += dt;
  if (S.sendAcc >= 1 / 30) {
    S.sendAcc = 0;
    const a = aimAngles();
    send({ t: 'in', p: [+S.pos.x.toFixed(3), +S.pos.y.toFixed(3), +S.pos.z.toFixed(3)], v: [+S.vel.x.toFixed(2), +S.vel.y.toFixed(2), +S.vel.z.toFixed(2)], yaw: +a.yaw.toFixed(3), pitch: +a.pitch.toFixed(3), c: S.crouch ? 1 : 0, g: S.onGround ? 1 : 0, w: S.w.cur, u: using ? 1 : 0 });
  }

  // --- uzak oyuncular
  const rt = serverNow() - INTERP_DELAY;
  const last = S.snaps[S.snaps.length - 1];
  const radar = [];
  const alive = { att: 0, def: 0 };
  const myEye = eyePos();
  if (last) {
    for (const [id] of last.pl) {
      const r = S.roster.get(id);
      if (!r) continue;
      const s = remoteState(id, rt);
      if (!s) continue;
      const isAlive = !!(s.f & 1);
      if (isAlive) alive[r.tm]++;
      if (id === S.myId) continue;
      let av = S.avatars.get(id);
      if (!av) { av = new Avatar(scene, { n: r.n, tm: r.tm, mate: r.tm === S.team }); S.avatars.set(id, av); }
      av.update(dt, { ...s, alive: isAlive, crouch: !!(s.f & 2), bomb: !!(s.f & 4), weapon: s.w, team: r.tm });
      av.root.visible = id !== S.specId || S.alive;
      // uzak ayak sesleri
      if (isAlive && av.speed > 3.4 && (s.f & 8)) {
        av.stepAcc = (av.stepAcc || 0) + av.speed * dt;
        if (av.stepAcc > 2.3) { av.stepAcc = 0; audio.step(new THREE.Vector3(s.x, s.y, s.z), 1); }
      }
      const mate = r.tm === S.team;
      if (mate || (isAlive && hasLOS(myEye, { x: s.x, y: s.y + 1.3, z: s.z }))) {
        radar.push({ x: s.x, z: s.z, color: mate ? '#7fd0ff' : '#ff5a4f', dead: !isAlive });
      }
    }
  }

  // --- izleyici kamerası
  if (!S.alive) {
    S.specTimer = (S.specTimer || 0) - dt;
    if (S.specId) { const ss = last?.pl.get(S.specId); if (!ss || !(ss.f & 1)) S.specId = null; }
    if (!S.specId && S.specTimer <= 0) cycleSpectate();
  }

  // --- kamera
  const a = aimAngles();
  let shakeX = 0, shakeY = 0;
  if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 1.5); shakeX = (Math.random() - 0.5) * S.shake * 0.05; shakeY = (Math.random() - 0.5) * S.shake * 0.05; }
  if (S.alive) {
    camera.position.set(S.pos.x, S.pos.y + S.eyeH, S.pos.z);
    camera.rotation.set(a.pitch + shakeY, a.yaw + shakeX, 0);
    hud.spectate(null);
  } else if (S.specId) {
    const s = remoteState(S.specId, rt);
    if (s) {
      camera.position.set(s.x, s.y + (s.f & 2 ? PLAYER.crouchEye : PLAYER.eye), s.z);
      camera.rotation.set(s.pitch, s.yaw, 0);
    }
    const r = S.roster.get(S.specId);
    hud.spectate(`İzleniyor: <b>${r ? r.n.replace(/</g, '') : ''}</b><small>Sol tık: sonraki oyuncu</small>`);
  } else {
    const dp = S.deathPos || S.pos;
    camera.position.set(dp.x, dp.y + 0.4, dp.z);
    camera.rotation.set(-0.2, S.yaw, 0.3);
    hud.spectate(aliveMates().length ? null : 'Takımında yaşayan kimse yok — sonraki roundu bekle');
  }
  const wantFov = S.alive && S.w.scoped === 1 ? 40 : S.alive && S.w.scoped === 2 ? 15 : BASE_FOV;
  if (camera.fov !== wantFov) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
  const fwd = dirFromAngles(camera.rotation.y, camera.rotation.x);
  audio.setListener(camera.position, fwd);

  // --- görüntü modeli
  if (S.alive) {
    vm.setWeapon(S.w.cur);
    vm.update(dt, { speed: Math.hypot(S.vel.x, S.vel.z), onGround: S.onGround, scoped: S.w.scoped > 0, mouseDX: S.mouse.dx, mouseDY: S.mouse.dy });
  }
  S.mouse.dx = 0; S.mouse.dy = 0;

  // --- bomba
  const bombLeft = b && b.s === 'planted' ? b.ea / 1000 - serverNow() : 0;
  fx.setBomb(b, bombLeft);
  if (b && b.s === 'planted' && bombLeft > 0) {
    const interval = bombLeft > 20 ? 1 : bombLeft > 10 ? 0.6 : bombLeft > 5 ? 0.35 : 0.18;
    if (t - S.lastBeep > interval) { S.lastBeep = t; audio.beep(new THREE.Vector3(b.p[0], b.p[1] + 0.2, b.p[2]), bombLeft < 5); }
  }
  const dbs = renderer.getDrawingBufferSize(new THREE.Vector2());
  fx.setView(camera, dbs.y);
  fx.update(dt);

  // --- HUD
  hud.tick(dt);
  hud.setVitals(Math.max(0, S.me.hp), S.me.ar, S.me.$);
  hud.lowHealth(S.alive ? Math.max(0, S.me.hp) : 100, dt);
  if (S.alive && S.me.hp > 0 && S.me.hp < 30 && t - (S.lastHeart || 0) > 0.85) { S.lastHeart = t; audio.heartbeat(); }
  hud.setAmmo(S.w.cur, S.inv.ammo[S.w.cur]);
  hud.setSlots(S.inv, S.w.cur);
  const timeLeft = (S.round.pe / 1000) - serverNow();
  hud.setTop(S.round, timeLeft, b && b.s === 'planted', alive);
  // nişangâh boşluğu: sapma açısını piksele çevir
  const spr = currentSpread();
  const px = Math.tan(spr) * (window.innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  hud.crosshair(4 + px, S.alive && !S.w.scoped && WEAPONS[S.w.cur].type !== 'bomb');
  hud.scope(S.alive && S.w.scoped > 0);
  const prLabel = S.me.pt === 'defuse' ? (S.inv.kit ? 'İmha ediliyor (kit)' : 'İmha ediliyor') : 'Bomba kuruluyor';
  hud.progress(S.me.pr || 0, prLabel);
  let hint = null;
  if (S.alive && S.inv.bomb && ph === 'live') hint = zoneAt(S.pos.x, S.pos.z) ? 'Bomba kurmak için E basılı tut' : null;
  if (S.alive && canDefuse && !S.me.pr) hint = 'İmha etmek için E basılı tut';
  hud.bombHint(hint);
  if (S.buyOpen) { if (!buyAllowed()) toggleBuy(false); else hud.updateBuy(S.me.$, S.team, S.inv); }
  hud.drawRadar({ x: S.alive ? S.pos.x : camera.position.x, z: S.alive ? S.pos.z : camera.position.z, yaw: camera.rotation.y }, radar, b);
}

frame();
