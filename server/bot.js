// Sunucu tarafı bot yapay zekâsı
import { WEAPONS, PLAYER, ROUND, EQUIP } from '../shared/constants.js';
import {
  REGIONS, findPath, cellOf, cellCenter, hasLOS, SPAWN_CENTER, zoneAt, walkable,
} from '../shared/map.js';
import { anglesTo, wrapAngle, approachAngle, dirFromAngles, applySpread, dist2 } from '../shared/util.js';

export const BOT_NAMES = ['Kartal', 'Şahin', 'Poyraz', 'Bora', 'Tufan', 'Kaya', 'Atlas', 'Doruk', 'Yiğit', 'Alp', 'Ozan', 'Toprak', 'Rüzgar', 'Demir', 'Çınar'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class BotBrain {
  constructor(p, game) {
    this.p = p; this.g = game;
    this.skill = rand(0.45, 0.9);
    this.resetRound();
  }

  resetRound() {
    this.path = []; this.goal = null; this.goalKind = null;
    this.target = null; this.reactAt = 0; this.aimErr = 0; this.errPhase = Math.random() * 10;
    this.holdUntil = 0; this.watchYaw = null; this.nextThink = 0;
    this.lastSeen = null; this.alertUntil = 0; this.alertYaw = null;
    this.stuckT = 0; this.lastPos = null; this.burst = 0; this.burstPauseUntil = 0;
    this.role = null; this.startDelay = rand(0, 1.5);
    this.strafeDir = 0; this.strafeUntil = 0; this._knewPlant = false; this.crouchFight = false;
  }

  buy() {
    const p = this.p, m = () => p.money;
    const spend = (n) => { p.money -= n; };
    const team = p.team;
    if (!p.primary) {
      if (m() >= 4750 + 1000 && Math.random() < 0.15) { p.primary = 'sniper'; spend(4750); }
      else if (m() >= 3100 + 1000) { p.primary = team === 'att' ? 'rifle' : 'carbine'; spend(WEAPONS[p.primary].price); }
      else if (m() >= 2700 + 650) { p.primary = 'rifle'; spend(2700); }
      else if (m() >= 1250 + 650 && Math.random() < 0.7) { p.primary = Math.random() < 0.75 ? 'smg' : 'shotgun'; spend(WEAPONS[p.primary].price); }
    }
    if (p.primary) this.g.giveAmmo(p, p.primary);
    if (p.armor < 100 && m() >= 1000) { p.armor = 100; p.helmet = true; spend(1000); }
    else if (p.armor < 100 && m() >= 650) { p.armor = 100; spend(650); }
    if (!p.primary && p.secondary === 'pistol' && m() >= 700 && Math.random() < 0.5) { p.secondary = 'deagle'; this.g.giveAmmo(p, 'deagle'); spend(700); }
    if (team === 'def' && !p.kit && m() >= EQUIP.kit.price + 200 && Math.random() < 0.6) { p.kit = true; spend(EQUIP.kit.price); }
    if (p.grenades < 1 && m() >= 300 && Math.random() < 0.5) { p.grenades = 1; spend(300); }
    p.weapon = p.primary || p.secondary;
  }

  hear(src) {
    if (this.target) return;
    const a = anglesTo(this.p.pos, src.pos);
    this.alertYaw = a.yaw; this.alertUntil = this.g.time + 2.5; this.alertFrom = src.id;
    this.lastSeen = { pos: { ...src.pos }, t: this.g.time };
  }
  onDamaged(att) { this.hear(att); }

  eye() { return this.g.eye(this.p); }

  canSee(e) {
    const eye = this.eye();
    return hasLOS(eye, this.g.eye(e)) || hasLOS(eye, this.g.chest(e));
  }

  perceive() {
    const p = this.p, g = this.g, t = g.time;
    let best = null, bestD = Infinity;
    for (const e of g.players.values()) {
      if (!e.alive || e.team === p.team) continue;
      const d = dist2(p.pos, e.pos);
      if (d > 85) continue;
      const a = anglesTo(p.pos, e.pos);
      const inFov = Math.abs(wrapAngle(a.yaw - p.yaw)) < 1.2 || d < 5 || (this.alertUntil > t && this.alertFrom === e.id);
      if (!inFov || !this.canSee(e)) continue;
      const score = d - (e.id === this.target ? 8 : 0);
      if (score < bestD) { bestD = score; best = e; }
    }
    if (best) {
      if (this.target !== best.id) {
        this.target = best.id;
        this.reactAt = t + rand(0.2, 0.45) * (1.25 - this.skill * 0.6);
        this.aimErr = rand(0.05, 0.11) * (1.4 - this.skill);
        this.aimHead = Math.random() < 0.25 + this.skill * 0.35;
        this.burst = 0;
        if (Math.random() < 0.25 && WEAPONS[p.weapon]?.auto) this.crouchFight = true; else this.crouchFight = false;
      }
      this.lastSeen = { pos: { ...best.pos }, t };
    } else if (this.target) {
      this.target = null; this.crouchFight = false;
      this.path = []; this.goal = null; // yeniden hedef seç
    }
  }

  ensureGun() {
    const p = this.p;
    const w = WEAPONS[p.weapon];
    if (!w || w.type !== 'gun') { p.weapon = p.primary || p.secondary || 'knife'; p.reloadEnd = 0; }
    const ww = WEAPONS[p.weapon];
    if (ww.type === 'gun') {
      const a = p.ammo[p.weapon];
      if (a && a.mag === 0) {
        if (a.res > 0) this.g.startReload(p);
        else if (p.weapon === p.primary && p.secondary) { p.weapon = p.secondary; p.reloadEnd = 0; }
      }
    }
  }

  update(dt) {
    const p = this.p, g = this.g, t = g.time;
    if (!p.alive) return;
    p.using = false;
    if (g.phase === 'freeze' || g.phase === 'waiting') { p.vel = { x: 0, y: 0, z: 0 }; return; }
    if (t >= this.nextThink) { this.nextThink = t + 0.1; this.perceive(); }
    const tgt = this.target ? g.players.get(this.target) : null;
    if (tgt && tgt.alive) this.combat(dt, tgt);
    else { this.target = null; this.crouchFight = false; p.crouch = false; this.navigate(dt); }
  }

  combat(dt, e) {
    const p = this.p, g = this.g, t = g.time;
    this.ensureGun();
    const eye = this.eye();
    const aimPt = this.aimHead ? g.eye(e) : g.chest(e);
    // hedefin hareketine göre hafif öngörü
    aimPt.x += (e.vel?.x || 0) * 0.05; aimPt.z += (e.vel?.z || 0) * 0.05;
    const want = anglesTo(eye, aimPt);
    this.aimErr = Math.max(this.aimErr - dt * (0.05 + this.skill * 0.08), 0.004 + (1 - this.skill) * 0.01);
    const ey = Math.sin(t * 2.7 + this.errPhase) * this.aimErr, ep = Math.cos(t * 2.1 + this.errPhase) * this.aimErr * 0.6;
    const turn = (5 + this.skill * 8) * dt;
    p.yaw = approachAngle(p.yaw, want.yaw + ey, turn);
    p.pitch = approachAngle(p.pitch, want.pitch + ep, turn);
    p.crouch = !!this.crouchFight;

    // hareket: çoğunlukla dur, bazen yana kay
    const d = dist2(p.pos, e.pos);
    const w = WEAPONS[p.weapon];
    let mx = 0, mz = 0;
    if (w.type === 'melee' || (w === WEAPONS.shotgun && d > 12)) {
      const f = dirFromAngles(p.yaw, 0); mx = f.x; mz = f.z;
    } else if (this.skill > 0.6 && !this.crouchFight && t < this.burstPauseUntil) {
      if (t > this.strafeUntil) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeUntil = t + rand(0.3, 0.7); }
      mx = Math.cos(p.yaw) * this.strafeDir; mz = -Math.sin(p.yaw) * this.strafeDir;
    }
    this.moveDir(mx, mz, dt, w.type === 'melee' ? 1 : 0.6);

    if (t < this.reactAt || w.type !== 'gun' && w.type !== 'melee') return;
    if (p.reloadEnd || t < this.burstPauseUntil) return;
    const err = Math.abs(wrapAngle(want.yaw - p.yaw)) + Math.abs(want.pitch - p.pitch);
    const tol = Math.atan2(0.35, Math.max(d, 1)) + 0.02;
    if (err > tol) return;
    if (w.type === 'melee' && d > 2) return;
    if (t < p.nextFire) return;
    const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
    let spread = (w.spread || 0) + (moving ? (w.moveSpread || 0) * 0.5 : 0) + (1 - this.skill) * 0.012;
    if (w.scope) spread = 0.003 + (1 - this.skill) * 0.01;
    if (w.auto) spread += Math.min(this.burst, 8) * 0.003;
    const base = dirFromAngles(p.yaw, p.pitch);
    const dirs = [];
    for (let i = 0; i < (w.pellets || 1); i++) dirs.push(applySpread(base, w.pellets ? w.spread : spread));
    if (g.fire(p, eye, dirs, p.weapon, t, 1)) {
      this.burst++;
      const maxBurst = w.auto ? (d > 25 ? 3 : d > 12 ? 5 : 9) : 1;
      if (this.burst >= maxBurst) { this.burst = 0; this.burstPauseUntil = t + (w.auto ? rand(0.18, 0.4) : rand(0.05, 0.25)); }
    }
  }

  moveDir(mx, mz, dt, mul = 1) {
    const p = this.p;
    const l = Math.hypot(mx, mz);
    if (l < 1e-3) { p.vel.x = 0; p.vel.z = 0; return; }
    const sp = PLAYER.run * (WEAPONS[p.weapon]?.speed || 1) * mul * (p.crouch ? PLAYER.crouchMul : 1);
    const vx = mx / l * sp, vz = mz / l * sp;
    const nx = p.pos.x + vx * dt, nz = p.pos.z + vz * dt;
    // ızgarada yürünebilir mi (yarıçap dahil)
    const ok = (x, z) => {
      const r = PLAYER.radius;
      for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        const [cx, cz] = cellOf(x + ox, z + oz);
        if (!walkable(cx, cz)) return false;
      }
      return true;
    };
    if (ok(nx, p.pos.z)) p.pos.x = nx; else this.strafeDir = -this.strafeDir;
    if (ok(p.pos.x, nz)) p.pos.z = nz;
    p.vel.x = vx; p.vel.z = vz; p.onGround = true; p.pos.y = 0;
  }

  // ---------------------------------------------------------------- hedef seçimi
  randomCell(region) { return pick(REGIONS[region]); }

  chooseGoal() {
    const p = this.p, g = this.g, t = g.time, b = g.bomb;
    let cell = null, kind = 'hold';
    const nearestOfTeam = (pos) => {
      let best = null, bd = Infinity;
      for (const q of g.aliveOf(p.team)) { if (!q.isBot) continue; const d = dist2(q.pos, pos); if (d < bd) { bd = d; best = q; } }
      return best;
    };
    if (p.team === 'att') {
      if (b.state === 'dropped' && nearestOfTeam(b.pos) === p) { cell = cellOf(b.pos.x, b.pos.z); kind = 'bomb'; }
      else if (p.hasBomb) { cell = this.randomCell(g.attPlan); kind = 'plant'; }
      else if (b.state === 'planted') { cell = this.nearCell(b.pos, 5); }
      else if (this.lastSeen && t - this.lastSeen.t < 5 && Math.random() < 0.6) { cell = cellOf(this.lastSeen.pos.x, this.lastSeen.pos.z); kind = 'hunt'; }
      else {
        const carrier = g.players.get(b.carrier);
        if (carrier && carrier.alive && carrier !== p && Math.random() < 0.35) cell = this.nearCell(carrier.pos, 3);
        else cell = this.randomCell(g.attPlan === 'A' ? (Math.random() < 0.7 ? 'Aarea' : 'A') : (Math.random() < 0.7 ? 'Barea' : 'B'));
      }
    } else {
      if (b.state === 'planted') {
        const defuser = nearestOfTeam(b.pos);
        if (defuser === p) { cell = cellOf(b.pos.x, b.pos.z); kind = 'defuse'; }
        else cell = this.nearCell(b.pos, 4);
      } else if (b.state === 'dropped' && Math.random() < 0.4) {
        cell = this.nearCell(b.pos, 3);
      } else if (this.lastSeen && t - this.lastSeen.t < 4 && Math.random() < 0.35) {
        cell = cellOf(this.lastSeen.pos.x, this.lastSeen.pos.z); kind = 'hunt';
      } else {
        if (!this.role) {
          const mates = g.teamPlayers('def').filter((q) => q.isBot);
          const i = mates.indexOf(p);
          this.role = ['Aarea', 'Barea', 'Aarea', 'Barea', 'mid'][i % 5];
          if (Math.random() < 0.2) this.role = pick(['long', 'tunnel', 'midLow']);
        }
        cell = this.randomCell(this.role);
      }
    }
    this.goal = cell; this.goalKind = kind;
    const [sx, sz] = cellOf(p.pos.x, p.pos.z);
    // saldırganlar doğuştan çıkarken farklı rotalar kullanır (uzun / kısa / tünel / orta)
    let via = null;
    if (p.team === 'att' && cell && sz >= 30 && kind !== 'hunt' && kind !== 'bomb' && g.bomb.state !== 'planted') {
      const siteA = cell[0] > 24;
      if (!g.attRoute) g.attRoute = {};
      const key = siteA ? 'A' : 'B';
      if (!g.attRoute[key] || g.attRoute.round !== g.roundNum) {
        g.attRoute = { round: g.roundNum, A: Math.random() < 0.65 ? [41, 30] : [30, 20], B: Math.random() < 0.7 ? [7, 28] : [19, 12] };
      }
      via = Math.random() < 0.85 ? g.attRoute[key] : (siteA ? [24, 25] : [7, 28]);
    }
    if (cell && via) {
      const a = findPath(sx, sz, via[0], via[1]) || [];
      const b = findPath(via[0], via[1], cell[0], cell[1]) || [];
      this.path = a.concat(b);
    } else this.path = (cell && findPath(sx, sz, cell[0], cell[1])) || [];
    this.watchYaw = null;
  }

  nearCell(pos, r) {
    const [cx, cz] = cellOf(pos.x, pos.z);
    for (let i = 0; i < 12; i++) {
      const x = cx + Math.round(rand(-r, r)), z = cz + Math.round(rand(-r, r));
      if (walkable(x, z) && hasLOS({ x: (x + 0.5) * 2, y: 1, z: (z + 0.5) * 2 }, { x: pos.x, y: 1, z: pos.z })) return [x, z];
    }
    return [cx, cz];
  }

  computeWatchYaw() {
    const p = this.p;
    const enemy = SPAWN_CENTER[p.team === 'att' ? 'def' : 'att'];
    const [sx, sz] = cellOf(p.pos.x, p.pos.z);
    const [ex, ez] = cellOf(enemy.x, enemy.z);
    const path = findPath(sx, sz, ex, ez);
    if (path && path.length) {
      const wp = path[Math.min(path.length - 1, 5)];
      return anglesTo(p.pos, cellCenter(wp[0], wp[1])).yaw;
    }
    return p.yaw;
  }

  navigate(dt) {
    const p = this.p, g = this.g, t = g.time, b = g.bomb;
    if (g.phase === 'live' && t < g.phaseEnd - ROUND.time + this.startDelay) { p.vel.x = 0; p.vel.z = 0; return; }
    // objektif değiştiyse yeniden planla
    if (p.team === 'def' && b.state === 'planted' && this.goalKind !== 'defuse' && !this._knewPlant) { this._knewPlant = true; this.goal = null; }
    if (p.team === 'att' && p.hasBomb && this.goalKind !== 'plant') this.goal = null;
    if (!this.goal) this.chooseGoal();

    if (this.path.length) {
      const [cx, cz] = this.path[0];
      const c = cellCenter(cx, cz);
      const dx = c.x - p.pos.x, dz = c.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) { this.path.shift(); }
      else {
        this.moveDir(dx, dz, dt, this.goalKind === 'hunt' ? 0.9 : 1);
        const want = Math.atan2(-dx, -dz);
        const look = this.alertUntil > t && this.alertYaw !== null ? this.alertYaw : want;
        p.yaw = approachAngle(p.yaw, look, 7 * dt);
        p.pitch = approachAngle(p.pitch, 0, 3 * dt);
      }
      // takılma kontrolü
      this.stuckT += dt;
      if (this.stuckT > 1.5) {
        if (this.lastPos && dist2(this.lastPos, p.pos) < 0.5) { this.goal = null; this.path = []; }
        this.lastPos = { ...p.pos }; this.stuckT = 0;
      }
      if (!this.path.length) this.holdUntil = t + rand(3, 9);
      return;
    }

    // hedefe varıldı
    p.vel.x = 0; p.vel.z = 0;
    if (this.goalKind === 'plant' && p.hasBomb) {
      if (zoneAt(p.pos.x, p.pos.z)) { p.using = true; p.weapon = 'bomb'; return; }
      this.goal = null; return;
    }
    if (this.goalKind === 'defuse' && b.state === 'planted') {
      if (dist2(p.pos, b.pos) > 1.2) { this.moveDir(b.pos.x - p.pos.x, b.pos.z - p.pos.z, dt, 0.5); return; }
      p.using = true; p.crouch = true; return;
    }
    if (this.watchYaw === null) this.watchYaw = this.computeWatchYaw();
    const look = this.alertUntil > t && this.alertYaw !== null ? this.alertYaw : this.watchYaw + Math.sin(t * 0.7 + this.errPhase) * 0.5;
    p.yaw = approachAngle(p.yaw, look, 4 * dt);
    p.pitch = approachAngle(p.pitch, 0, 2 * dt);
    if (t > this.holdUntil && this.goalKind !== 'defuse') this.goal = null;
  }
}
