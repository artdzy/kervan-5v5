// Yetkili oyun sunucusu: roundlar, ekonomi, isabet tespiti, bomba, el bombası, botlar
import {
  WEAPONS, WEAPON_KEYS, PLAYER, ROUND, ECON, TEAM_SIZE, TEAMS, EQUIP, GRENADE, BOMB, BUY_RADIUS, SNAP_RATE,
} from '../shared/constants.js';
import {
  SPAWNS, SPAWN_YAW, SPAWN_CENTER, raycastMap, zoneAt, hasLOS, solidAt, cellHeight, CELL, groundHeight,
} from '../shared/map.js';
import { rayAABB, raySphere, normalize, dist3, dist2 } from '../shared/util.js';
import { BotBrain, BOT_NAMES } from './bot.js';

let nextId = 1;
const r2 = (v) => Math.round(v * 100) / 100;
const other = (t) => (t === 'att' ? 'def' : 'att');

export class Game {
  constructor() {
    this.players = new Map();
    this.time = 0;
    this.snapAcc = 0;
    this.rosterAcc = 0;
    this.grenades = [];
    this.gid = 1;
    this.usedBotNames = new Set();
    this.resetMatch();
  }

  // ---------------------------------------------------------------- yardımcılar
  send(p, msg) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p !== except && p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  humans() { return [...this.players.values()].filter((p) => !p.isBot); }
  teamPlayers(team) { return [...this.players.values()].filter((p) => p.team === team); }
  aliveOf(team) { return this.teamPlayers(team).filter((p) => p.alive); }
  eye(p) { return { x: p.pos.x, y: p.pos.y + (p.crouch ? PLAYER.crouchEye : PLAYER.eye), z: p.pos.z }; }
  chest(p) { return { x: p.pos.x, y: p.pos.y + (p.crouch ? 0.8 : 1.2), z: p.pos.z }; }

  owns(p, key) {
    if (key === 'knife') return true;
    if (key === 'grenade') return p.grenades > 0;
    if (key === 'bomb') return p.hasBomb;
    return p.primary === key || p.secondary === key;
  }
  bestWeapon(p) { return p.primary || p.secondary || 'knife'; }

  giveAmmo(p, key) {
    const w = WEAPONS[key];
    if (w && w.type === 'gun') p.ammo[key] = { mag: w.mag, res: w.reserve };
  }

  makePlayer(name, team, isBot) {
    const p = {
      id: nextId++, name, team, isBot, ws: null,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, crouch: false, onGround: true,
      alive: false, hp: 100, armor: 0, helmet: false, kit: false, money: ECON.start,
      primary: null, secondary: 'pistol', grenades: 0, hasBomb: false, weapon: 'pistol', ammo: {},
      nextFire: 0, reloadEnd: 0, reloadKey: null,
      kills: 0, deaths: 0, using: false, useStart: null, progress: 0, progType: null,
      history: [], lastInput: 0, bot: null,
    };
    this.giveAmmo(p, 'pistol');
    return p;
  }

  // ---------------------------------------------------------------- maç / round
  resetMatch() {
    this.phase = 'waiting';
    this.phaseEnd = 0;
    this.buyEnd = 0;
    this.roundNum = 0;
    this.score = { att: 0, def: 0 };
    this.lossStreak = { att: 0, def: 0 };
    this.bomb = { state: 'none', carrier: null, pos: null, explodeAt: 0, site: null };
    this.grenades = [];
    for (const p of this.players.values()) {
      p.money = ECON.start; p.kills = 0; p.deaths = 0; p.alive = false;
      this.resetInventory(p);
    }
  }

  resetInventory(p) {
    p.primary = null; p.secondary = 'pistol'; p.grenades = 0; p.hasBomb = false;
    p.armor = 0; p.helmet = false; p.kit = false; p.ammo = {};
    this.giveAmmo(p, 'pistol');
    p.weapon = 'pistol';
  }

  swapTeams() {
    for (const p of this.players.values()) {
      p.team = other(p.team);
      p.money = ECON.start;
      p.alive = false; // envanter sıfırlansın
    }
    this.score = { att: this.score.def, def: this.score.att };
    this.lossStreak = { att: 0, def: 0 };
    this.broadcast({ t: 'msg', text: 'Devre arası — takımlar yer değiştirdi!', big: true });
  }

  startRound() {
    this.roundNum++;
    if (this.roundNum === ROUND.half + 1) this.swapTeams();
    this.grenades = [];
    this.bomb = { state: 'none', carrier: null, pos: null, explodeAt: 0, site: null };
    const idx = { att: 0, def: 0 };
    for (const p of this.players.values()) {
      if (!p.alive) this.resetInventory(p);
      for (const k of Object.keys(p.ammo)) this.giveAmmo(p, k);
      p.hasBomb = false;
      p.hp = 100; p.alive = true; p.using = false; p.progress = 0; p.progType = null;
      p.reloadEnd = 0; p.nextFire = 0;
      p.weapon = this.bestWeapon(p);
      const sp = SPAWNS[p.team][idx[p.team]++ % SPAWNS[p.team].length];
      p.pos = { x: sp.x + (Math.random() - 0.5) * 0.4, y: 0, z: sp.z + (Math.random() - 0.5) * 0.4 };
      p.vel = { x: 0, y: 0, z: 0 };
      p.yaw = SPAWN_YAW[p.team]; p.pitch = 0; p.history = [];
    }
    const atts = this.teamPlayers('att');
    if (atts.length) {
      const c = atts[Math.floor(Math.random() * atts.length)];
      c.hasBomb = true; this.bomb.state = 'carried'; this.bomb.carrier = c.id;
    }
    this.attPlan = Math.random() < 0.5 ? 'A' : 'B';
    this.phase = 'freeze';
    this.phaseEnd = this.time + ROUND.freeze;
    this.buyEnd = this.time + ROUND.buy;
    for (const p of this.players.values()) {
      if (p.isBot) { p.bot.resetRound(); p.bot.buy(); }
    }
    for (const p of this.players.values()) {
      this.send(p, { t: 'spawn', pos: p.pos, yaw: p.yaw });
      this.sendInv(p);
    }
    this.broadcast({ t: 'round', n: this.roundNum, score: this.score });
  }

  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    const loser = other(winner);
    this.score[winner]++;
    this.lossStreak[winner] = 0;
    const lossBonus = Math.min(ECON.lossBase + ECON.lossStep * this.lossStreak[loser], ECON.lossMax);
    this.lossStreak[loser] = Math.min(this.lossStreak[loser] + 1, 4);
    const planted = this.bomb.state === 'planted' || this.bomb.state === 'exploded' || this.bomb.state === 'defused';
    for (const p of this.players.values()) {
      let add = p.team === winner ? ECON.win : lossBonus;
      if (p.team === 'att' && loser === 'att' && planted) add += ECON.plantedLossBonus;
      p.money = Math.min(ECON.max, p.money + add);
      p.using = false; p.progress = 0;
    }
    this.phase = 'post';
    this.phaseEnd = this.time + ROUND.end;
    this.broadcast({ t: 'roundEnd', winner, reason, score: this.score });
  }

  // ---------------------------------------------------------------- bağlantı
  onConnect(ws) {
    let player = null;
    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'join' && !player) { player = this.join(ws, m); return; }
      if (!player) return;
      switch (m.t) {
        case 'in': this.handleInput(player, m); break;
        case 'shoot': this.handleShoot(player, m); break;
        case 'reload': this.startReload(player); break;
        case 'buy': this.handleBuy(player, m.item); break;
        case 'throw': this.handleThrow(player, m); break;
        case 'chat': if (typeof m.msg === 'string' && m.msg.trim()) this.broadcast({ t: 'chat', i: player.id, msg: m.msg.slice(0, 120) }); break;
        case 'ping': this.send(player, { t: 'pong', c: m.c }); break;
      }
    });
    ws.on('close', () => { if (player) this.leave(player); });
  }

  join(ws, m) {
    const name = String(m.name || 'Oyuncu').replace(/[<>]/g, '').slice(0, 16) || 'Oyuncu';
    let team = m.team;
    if (!TEAMS.includes(team)) {
      const h = (t) => this.teamPlayers(t).filter((p) => !p.isBot).length;
      team = h('att') <= h('def') ? 'att' : 'def';
    }
    // takım insanla doluysa diğerine
    if (this.teamPlayers(team).filter((p) => !p.isBot).length >= TEAM_SIZE) team = other(team);
    // bir botu çıkar
    const bots = this.teamPlayers(team).filter((p) => p.isBot);
    if (bots.length) {
      const b = bots.find((x) => !x.alive) || bots[bots.length - 1];
      if (b.hasBomb) this.dropBomb(b);
      this.removePlayer(b);
    }
    const p = this.makePlayer(name, team, false);
    p.ws = ws;
    this.players.set(p.id, p);
    this.send(p, { t: 'welcome', id: p.id, team, tm: Math.round(this.time * 1000) });
    this.fillBots();
    this.broadcast({ t: 'msg', text: `${name} oyuna katıldı (${team === 'att' ? 'Saldırı' : 'Savunma'})` });
    if (this.phase === 'waiting') {
      this.startRound();
    } else if (this.phase === 'freeze') {
      // donma süresinde gelen oyuncu hemen doğsun
      p.alive = true; p.hp = 100;
      const sp = SPAWNS[team][Math.floor(Math.random() * SPAWNS[team].length)];
      p.pos = { x: sp.x, y: 0, z: sp.z }; p.yaw = SPAWN_YAW[team];
      this.send(p, { t: 'spawn', pos: p.pos, yaw: p.yaw });
    }
    this.sendInv(p);
    this.send(p, { t: 'round', n: this.roundNum, score: this.score });
    this.sendRoster();
    return p;
  }

  leave(p) {
    if (p.hasBomb) this.dropBomb(p);
    this.removePlayer(p);
    this.broadcast({ t: 'msg', text: `${p.name} oyundan ayrıldı` });
    if (this.humans().length === 0) {
      for (const b of [...this.players.values()]) this.removePlayer(b);
      this.resetMatch();
    } else {
      this.fillBots();
      this.sendRoster();
    }
  }

  removePlayer(p) {
    this.players.delete(p.id);
    if (p.isBot) this.usedBotNames.delete(p.name);
    this.broadcast({ t: 'left', i: p.id });
  }

  fillBots() {
    for (const team of TEAMS) {
      while (this.teamPlayers(team).length < TEAM_SIZE) {
        const name = BOT_NAMES.find((n) => !this.usedBotNames.has(n)) || `Bot${nextId}`;
        this.usedBotNames.add(name);
        const b = this.makePlayer(name, team, true);
        b.bot = new BotBrain(b, this);
        this.players.set(b.id, b);
      }
    }
  }

  sendInv(p) {
    this.send(p, {
      t: 'inv', primary: p.primary, secondary: p.secondary, gr: p.grenades, bomb: p.hasBomb,
      kit: p.kit, ammo: p.ammo, w: p.weapon, money: p.money, armor: p.armor, helmet: p.helmet,
    });
  }

  sendRoster() {
    const list = [...this.players.values()].map((p) => ({
      i: p.id, n: p.name, tm: p.team, b: p.isBot, k: p.kills, d: p.deaths, a: p.alive, m: p.money,
    }));
    for (const p of this.players.values()) {
      if (!p.ws) continue;
      this.send(p, { t: 'roster', list: list.map((e) => (e.tm === p.team ? e : { ...e, m: -1 })) });
    }
  }

  // ---------------------------------------------------------------- girdiler
  handleInput(p, m) {
    if (typeof m.yaw === 'number' && isFinite(m.yaw)) p.yaw = m.yaw;
    if (typeof m.pitch === 'number' && isFinite(m.pitch)) p.pitch = Math.max(-1.55, Math.min(1.55, m.pitch));
    p.crouch = !!m.c;
    p.using = !!m.u && p.alive;
    if (typeof m.w === 'string' && WEAPONS[m.w] && this.owns(p, m.w) && m.w !== p.weapon) {
      p.weapon = m.w;
      p.reloadEnd = 0;
    }
    if (!p.alive || this.phase === 'freeze') return;
    const pos = m.p;
    if (!Array.isArray(pos) || pos.length !== 3 || !pos.every((v) => typeof v === 'number' && isFinite(v))) return;
    const np = { x: pos[0], y: pos[1], z: pos[2] };
    const dt = Math.max(0.03, this.time - p.lastInput);
    p.lastInput = this.time;
    const horiz = dist2(np, p.pos);
    const inside = cellHeight(Math.floor(np.x / CELL), Math.floor(np.z / CELL)) > np.y + 0.3;
    if (horiz > (PLAYER.run * 1.6) * dt + 1.2 || inside || np.y < -1 || np.y > 8) {
      this.send(p, { t: 'pos', pos: p.pos });
      return;
    }
    p.pos = np;
    if (Array.isArray(m.v)) p.vel = { x: +m.v[0] || 0, y: +m.v[1] || 0, z: +m.v[2] || 0 };
    p.onGround = !!m.g;
  }

  startReload(p) {
    const w = WEAPONS[p.weapon];
    if (!p.alive || !w || w.type !== 'gun' || p.reloadEnd) return;
    const a = p.ammo[p.weapon];
    if (!a || a.mag >= w.mag || a.res <= 0) return;
    p.reloadEnd = this.time + w.reload;
    p.reloadKey = p.weapon;
    this.broadcast({ t: 'reload', i: p.id }, p);
  }

  finishReload(p) {
    const key = p.reloadKey, w = WEAPONS[key], a = p.ammo[key];
    p.reloadEnd = 0;
    if (!a || key !== p.weapon) return;
    const n = Math.min(w.mag - a.mag, a.res);
    a.mag += n; a.res -= n;
  }

  handleShoot(p, m) {
    if (!p.alive || this.phase === 'freeze' || this.phase === 'waiting') return;
    const key = m.w;
    if (!WEAPONS[key] || !this.owns(p, key)) return;
    p.weapon = key;
    if (!Array.isArray(m.d) || !m.d.length) return;
    const w = WEAPONS[key];
    const dirs = m.d.slice(0, w.pellets || 1).map((d) => (Array.isArray(d) ? normalize({ x: +d[0] || 0, y: +d[1] || 0, z: +d[2] || 0 }) : null)).filter(Boolean);
    const eye = this.eye(p);
    let o = eye;
    if (Array.isArray(m.o)) {
      const co = { x: +m.o[0], y: +m.o[1], z: +m.o[2] };
      if (isFinite(co.x) && isFinite(co.y) && isFinite(co.z) && dist3(co, eye) < 1.2) o = co;
    }
    let rt = typeof m.rt === 'number' ? m.rt / 1000 : this.time;
    rt = Math.max(this.time - 0.3, Math.min(this.time, rt));
    this.fire(p, o, dirs, key, rt, 0.7);
  }

  // Ortak ateş fonksiyonu (insan + bot). rateTol: ağ gecikmesi toleransı
  fire(p, o, dirs, key, rt, rateTol = 1) {
    const w = WEAPONS[key];
    if (this.time < p.nextFire) return false;
    if (w.type === 'gun') {
      if (p.reloadEnd) {
        if (this.time >= p.reloadEnd - 0.2) this.finishReload(p); else return false;
      }
      const a = p.ammo[key];
      if (!a || a.mag <= 0) { if (!p.isBot) this.sendInv(p); return false; }
      a.mag--;
    } else if (w.type !== 'melee') return false;
    p.nextFire = this.time + w.rate * rateTol;

    const victims = new Map();
    const ends = [];
    for (const d of dirs) {
      const h = this.hitscan(p, o, d, w, rt);
      ends.push([r2(h.end.x), r2(h.end.y), r2(h.end.z), h.best ? 1 : 0]);
      if (h.best) {
        const { target, t, group } = h.best;
        let dmg = w.damage * Math.pow(w.rm || 1, t / 10);
        if (group === 'head') dmg *= w.type === 'melee' ? 1.5 : 4;
        else if (group === 'legs') dmg *= 0.75;
        const v = victims.get(target) || { dmg: 0, head: false, group };
        v.dmg += dmg; v.head = v.head || group === 'head';
        if (group === 'head') v.group = 'head';
        victims.set(target, v);
      }
    }
    for (const [target, v] of victims) this.applyDamage(target, p, v.dmg, v.group, key, p.pos);
    this.broadcast({ t: 'shot', i: p.id, w: key, o: [r2(o.x), r2(o.y), r2(o.z)], e: ends }, p.isBot ? null : p);
    // botlar silah sesini duyar
    for (const q of this.players.values()) {
      if (q.isBot && q.alive && q.team !== p.team && dist2(q.pos, p.pos) < (w.type === 'melee' ? 6 : 38)) q.bot.hear(p);
    }
    return true;
  }

  posAt(target, rt) {
    const h = target.history;
    if (!h.length || rt >= h[h.length - 1].t) return { x: target.pos.x, y: target.pos.y, z: target.pos.z, c: target.crouch };
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= rt && rt <= b.t) {
        const k = (rt - a.t) / Math.max(1e-6, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: k < 0.5 ? a.c : b.c };
      }
    }
    return h[0];
  }

  hitscan(shooter, o, d, w, rt) {
    const range = w.range || 200;
    const wall = raycastMap(o.x, o.y, o.z, d.x, d.y, d.z, range);
    const maxT = wall ? wall.t : range;
    let best = null;
    for (const tg of this.players.values()) {
      if (!tg.alive || tg === shooter || tg.team === shooter.team) continue;
      const tp = this.posAt(tg, rt);
      if (Math.abs(tp.x - o.x) > maxT + 2 && Math.abs(tp.z - o.z) > maxT + 2) continue;
      const eye = tp.c ? PLAYER.crouchEye : PLAYER.eye;
      const th = raySphere(o, d, { x: tp.x, y: tp.y + eye - 0.02, z: tp.z }, 0.2);
      const top = eye - 0.2;
      const rb = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, tp.x - 0.28, tp.y, tp.z - 0.28, tp.x + 0.28, tp.y + top, tp.z + 0.28);
      let t = Infinity, group = null;
      if (th !== null && th < t) { t = th; group = 'head'; }
      if (rb && rb.t < t) {
        t = rb.t;
        const hy = o.y + d.y * t - tp.y;
        group = hy < (tp.c ? 0.45 : 0.8) ? 'legs' : 'body';
      }
      if (group && t < maxT && (!best || t < best.t)) best = { target: tg, t, group };
    }
    const tEnd = best ? best.t : maxT;
    return { best, end: { x: o.x + d.x * tEnd, y: o.y + d.y * tEnd, z: o.z + d.z * tEnd } };
  }

  applyDamage(victim, attacker, dmg, group, wKey, fromPos) {
    if (!victim.alive || this.phase === 'waiting') return;
    const pen = WEAPONS[wKey]?.pen ?? 0.5;
    if (victim.armor > 0 && (group === 'body' || group === 'explosion' || (group === 'head' && victim.helmet))) {
      const reduced = dmg * pen;
      victim.armor = Math.max(0, Math.round(victim.armor - (dmg - reduced) * 0.5));
      dmg = reduced;
    }
    dmg = Math.max(1, Math.round(dmg));
    victim.hp -= dmg;
    this.send(victim, { t: 'dmg', amt: dmg, from: fromPos ? [r2(fromPos.x), r2(fromPos.z)] : null });
    if (attacker && attacker !== victim) this.send(attacker, { t: 'hit', hs: group === 'head', kill: victim.hp <= 0, amt: dmg });
    if (victim.isBot && attacker && attacker !== victim) victim.bot.onDamaged(attacker);
    if (victim.hp <= 0) this.kill(victim, attacker, wKey, group === 'head');
  }

  kill(victim, killer, wKey, hs) {
    victim.alive = false; victim.hp = 0; victim.deaths++; victim.using = false; victim.progress = 0;
    if (victim.hasBomb) this.dropBomb(victim);
    if (killer && killer !== victim) {
      if (killer.team !== victim.team) {
        killer.kills++;
        killer.money = Math.min(ECON.max, killer.money + (WEAPONS[wKey]?.kill ?? 300));
      } else {
        killer.kills--;
      }
    }
    this.broadcast({ t: 'kill', k: killer ? killer.id : null, v: victim.id, w: wKey, hs: !!hs });
    this.sendRoster();
  }

  dropBomb(p) {
    p.hasBomb = false;
    if (this.bomb.state !== 'carried') return;
    this.bomb.state = 'dropped';
    this.bomb.carrier = null;
    this.bomb.pos = { x: p.pos.x, y: groundHeight(p.pos.x, p.pos.y, p.pos.z, 0.1), z: p.pos.z };
    if (p.weapon === 'bomb') p.weapon = this.bestWeapon(p);
    this.sendInv(p);
    for (const q of this.aliveOf('att')) this.send(q, { t: 'msg', text: 'Bomba düşürüldü!' });
  }

  handleBuy(p, item) {
    const fail = (why) => this.send(p, { t: 'msg', text: why });
    if (!p.alive) return fail('Ölüyken satın alamazsın');
    if (this.time > this.buyEnd || (this.phase !== 'freeze' && this.phase !== 'live')) return fail('Satın alma süresi doldu');
    if (dist2(p.pos, SPAWN_CENTER[p.team]) > BUY_RADIUS) return fail('Satın alma bölgesinde değilsin');
    const w = WEAPONS[item];
    let price;
    if (w && w.price && (w.slot === 1 || w.slot === 2)) {
      price = w.price;
      if (p.money < price) return fail('Yetersiz para');
      if (w.slot === 1) p.primary = item; else p.secondary = item;
      this.giveAmmo(p, item);
      p.weapon = item; p.reloadEnd = 0;
    } else if (item === 'grenade') {
      price = WEAPONS.grenade.price;
      if (p.grenades >= 1) return fail('Daha fazla taşıyamazsın');
      if (p.money < price) return fail('Yetersiz para');
      p.grenades = 1;
    } else if (item === 'kevlar') {
      price = EQUIP.kevlar.price;
      if (p.armor >= 100) return fail('Zaten zırhın var');
      if (p.money < price) return fail('Yetersiz para');
      p.armor = 100;
    } else if (item === 'helmet') {
      price = p.armor >= 100 ? 350 : EQUIP.helmet.price;
      if (p.armor >= 100 && p.helmet) return fail('Zaten yelek+kaskın var');
      if (p.money < price) return fail('Yetersiz para');
      p.armor = 100; p.helmet = true;
    } else if (item === 'kit') {
      if (p.team !== 'def') return fail('Sadece savunanlar alabilir');
      if (p.kit) return fail('Zaten kitin var');
      price = EQUIP.kit.price;
      if (p.money < price) return fail('Yetersiz para');
      p.kit = true;
    } else return;
    p.money -= price;
    this.sendInv(p);
  }

  handleThrow(p, m) {
    if (!p.alive || p.grenades <= 0 || this.phase === 'freeze' || this.phase === 'waiting') return;
    if (!Array.isArray(m.v)) return;
    let v = { x: +m.v[0] || 0, y: +m.v[1] || 0, z: +m.v[2] || 0 };
    const sp = Math.hypot(v.x, v.y, v.z);
    if (sp > 24) v = { x: v.x / sp * 24, y: v.y / sp * 24, z: v.z / sp * 24 };
    this.throwGrenade(p, this.eye(p), v);
    this.sendInv(p);
  }

  throwGrenade(p, pos, vel) {
    p.grenades--;
    if (p.weapon === 'grenade') p.weapon = this.bestWeapon(p);
    this.grenades.push({ id: this.gid++, owner: p.id, team: p.team, pos: { ...pos }, vel, explodeAt: this.time + GRENADE.fuse });
    this.broadcast({ t: 'throw', i: p.id }, p.isBot ? null : p);
  }

  // ---------------------------------------------------------------- simülasyon
  tick(dt) {
    this.time += dt;
    if (this.humans().length === 0) return;

    switch (this.phase) {
      case 'freeze':
        if (this.time >= this.phaseEnd) {
          this.phase = 'live'; this.phaseEnd = this.time + ROUND.time;
          this.broadcast({ t: 'live' });
        }
        break;
      case 'post':
        if (this.time >= this.phaseEnd) {
          const done = this.score.att >= ROUND.winRounds || this.score.def >= ROUND.winRounds || this.roundNum >= ROUND.maxRounds;
          if (done) {
            const winner = this.score.att === this.score.def ? null : this.score.att > this.score.def ? 'att' : 'def';
            this.phase = 'over'; this.phaseEnd = this.time + ROUND.over;
            this.broadcast({ t: 'matchEnd', winner, score: this.score });
          } else this.startRound();
        }
        break;
      case 'over':
        if (this.time >= this.phaseEnd) { this.resetMatch(); this.startRound(); }
        break;
    }

    for (const p of this.players.values()) {
      if (p.reloadEnd && this.time >= p.reloadEnd) this.finishReload(p);
      if (p.isBot) p.bot.update(dt);
      if (p.alive) {
        p.history.push({ t: this.time, x: p.pos.x, y: p.pos.y, z: p.pos.z, c: p.crouch });
        while (p.history.length && p.history[0].t < this.time - 1) p.history.shift();
      }
    }

    if (this.phase === 'live' || this.phase === 'post') {
      this.updateBomb(dt);
      this.updateGrenades(dt);
    }
    if (this.phase === 'live') this.checkWin();

    this.snapAcc += dt;
    if (this.snapAcc >= 1 / SNAP_RATE - 1e-4) { this.snapAcc = 0; this.sendSnapshots(); }
    this.rosterAcc += dt;
    if (this.rosterAcc >= 1) { this.rosterAcc = 0; this.sendRoster(); }
  }

  checkWin() {
    const attAlive = this.aliveOf('att').length, defAlive = this.aliveOf('def').length;
    const b = this.bomb;
    if (b.state === 'planted') {
      if (defAlive === 0) this.endRound('att', 'elim');
      return;
    }
    if (attAlive === 0) this.endRound('def', 'elim');
    else if (defAlive === 0) this.endRound('att', 'elim');
    else if (this.time >= this.phaseEnd) this.endRound('def', 'time');
  }

  updateBomb(dt) {
    const b = this.bomb;
    if (b.state === 'dropped') {
      for (const p of this.aliveOf('att')) {
        if (dist2(p.pos, b.pos) < 1.3 && Math.abs(p.pos.y - b.pos.y) < 1.5) {
          b.state = 'carried'; b.carrier = p.id; p.hasBomb = true;
          this.sendInv(p);
          this.send(p, { t: 'msg', text: 'Bombayı aldın' });
          break;
        }
      }
    }
    if (b.state === 'planted' && this.time >= b.explodeAt) {
      b.state = 'exploded';
      this.explosion(b.pos, BOMB.radius, BOMB.damage, null, 'bomb', true);
      if (this.phase === 'live') this.endRound('att', 'bomb');
      return;
    }
    for (const p of this.players.values()) {
      if (!p.alive || !p.using) { p.progress = 0; p.progType = null; p.useStart = null; continue; }
      let ok = false;
      if (p.team === 'att' && p.hasBomb && b.state === 'carried' && this.phase === 'live') {
        const site = zoneAt(p.pos.x, p.pos.z);
        if (site && p.onGround) {
          ok = true;
          if (!p.useStart || dist2(p.useStart, p.pos) > 0.4 || p.progType !== 'plant') { p.useStart = { ...p.pos }; p.progress = 0; }
          p.progType = 'plant';
          p.progress += dt;
          if (p.progress >= ROUND.plant) this.plant(p, site);
        }
      } else if (p.team === 'def' && b.state === 'planted' && dist2(p.pos, b.pos) < 1.8 && Math.abs(p.pos.y - b.pos.y) < 1.6) {
        ok = true;
        if (p.progType !== 'defuse') p.progress = 0;
        p.progType = 'defuse';
        p.progress += dt;
        const need = p.kit ? ROUND.defuseKit : ROUND.defuse;
        if (p.progress >= need) {
          b.state = 'defused';
          p.money = Math.min(ECON.max, p.money + ECON.defuse);
          p.progress = 0; p.using = false;
          this.broadcast({ t: 'defused', i: p.id });
          if (this.phase === 'live') this.endRound('def', 'defuse');
        }
      }
      if (!ok) { p.progress = 0; p.progType = null; }
    }
  }

  plant(p, site) {
    const b = this.bomb;
    b.state = 'planted'; b.carrier = null; b.site = site;
    b.pos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    b.explodeAt = this.time + ROUND.bomb;
    p.hasBomb = false; p.using = false; p.progress = 0; p.progType = null;
    p.money = Math.min(ECON.max, p.money + ECON.plant);
    if (p.weapon === 'bomb') p.weapon = this.bestWeapon(p);
    this.sendInv(p);
    this.broadcast({ t: 'planted', i: p.id, site });
  }

  explosion(pos, radius, maxDmg, owner, wKey, big) {
    this.broadcast({ t: 'explode', p: [r2(pos.x), r2(pos.y), r2(pos.z)], big: !!big });
    const o = { x: pos.x, y: pos.y + 0.3, z: pos.z };
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (owner && p.team === owner.team && p !== owner) continue;
      const c = this.chest(p);
      const d = dist3(o, c);
      if (d > radius) continue;
      if (!big && !hasLOS(o, c) && !hasLOS(o, this.eye(p))) continue;
      const k = 1 - d / radius;
      const dmg = maxDmg * (big ? k * k : k);
      if (dmg >= 1) this.applyDamage(p, owner, dmg, 'explosion', wKey, pos);
    }
  }

  updateGrenades(dt) {
    const steps = 3, h = dt / steps;
    for (const g of this.grenades) {
      for (let s = 0; s < steps; s++) {
        g.vel.y -= GRENADE.gravity * h;
        const nx = g.pos.x + g.vel.x * h;
        if (solidAt(nx, g.pos.y, g.pos.z)) g.vel.x *= -0.45; else g.pos.x = nx;
        const nz = g.pos.z + g.vel.z * h;
        if (solidAt(g.pos.x, g.pos.y, nz)) g.vel.z *= -0.45; else g.pos.z = nz;
        const ny = g.pos.y + g.vel.y * h;
        const ground = groundHeight(g.pos.x, g.pos.y, g.pos.z, 0.05);
        if (ny <= ground + 0.05) {
          g.pos.y = ground + 0.05;
          if (g.vel.y < -1.5) this.broadcast({ t: 'bounce', p: [r2(g.pos.x), r2(g.pos.y), r2(g.pos.z)] });
          g.vel.y = -g.vel.y * 0.35; g.vel.x *= 0.7; g.vel.z *= 0.7;
        } else if (solidAt(g.pos.x, ny, g.pos.z)) {
          g.vel.y = -g.vel.y * 0.3;
        } else g.pos.y = ny;
      }
    }
    for (const g of this.grenades.filter((x) => this.time >= x.explodeAt)) {
      this.explosion(g.pos, GRENADE.radius, GRENADE.damage, this.players.get(g.owner) || null, 'grenade', false);
    }
    this.grenades = this.grenades.filter((x) => this.time < x.explodeAt);
  }

  sendSnapshots() {
    const pl = [];
    for (const p of this.players.values()) {
      const flags = (p.alive ? 1 : 0) | (p.crouch ? 2 : 0) | (p.hasBomb ? 4 : 0) | (p.onGround ? 8 : 0) | (p.using ? 16 : 0) | (p.reloadEnd ? 32 : 0);
      pl.push([p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), flags, WEAPON_KEYS.indexOf(p.weapon)]);
    }
    const b = this.bomb;
    const base = {
      t: 's', tm: Math.round(this.time * 1000), p: pl,
      b: { s: b.state, c: b.carrier, p: b.pos ? [r2(b.pos.x), r2(b.pos.y), r2(b.pos.z)] : null, ea: Math.round(b.explodeAt * 1000), site: b.site },
      g: this.grenades.map((g) => [g.id, r2(g.pos.x), r2(g.pos.y), r2(g.pos.z)]),
      r: { ph: this.phase, pe: Math.round(this.phaseEnd * 1000), be: Math.round(this.buyEnd * 1000), n: this.roundNum, sa: this.score.att, sd: this.score.def },
    };
    for (const p of this.players.values()) {
      if (!p.ws) continue;
      const need = p.progType === 'defuse' ? (p.kit ? ROUND.defuseKit : ROUND.defuse) : ROUND.plant;
      this.send(p, {
        ...base,
        me: { hp: Math.max(0, p.hp), ar: p.armor, hm: p.helmet, kit: p.kit, $: p.money, a: p.alive, pr: p.progress ? Math.min(1, p.progress / need) : 0, pt: p.progType, tm: p.team },
      });
    }
  }
}
