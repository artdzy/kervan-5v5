// HUD / arayüz güncellemeleri
import { WEAPONS, EQUIP, BUY_MENU, TEAM_NAMES } from '/shared/constants.js';
import { GRID, MAP_W, MAP_H, CELL } from '/shared/map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'hp', 'armor', 'money', 'mag', 'reserve', 'ammo', 'weapon-name', 'slots', 'timer', 'round-label', 'score-att', 'score-def', 'alive-att', 'alive-def',
      'killfeed', 'center-msg', 'sub-msg', 'notify', 'progress', 'progress-fill', 'progress-label', 'crosshair', 'hitmarker', 'scope', 'damage-flash', 'dmg-indicators',
      'buy-menu', 'buy-cats', 'buy-money', 'scoreboard', 'sb-att', 'sb-def', 'sb-score-att', 'sb-score-def', 'spectate', 'bomb-hint', 'radar', 'chat-log']) this.el[id] = $(id);
    this.radarCtx = this.el.radar.getContext('2d');
    this.radarBase = this.makeRadarBase();
    this.centerT = 0; this.notifyT = 0; this.hitT = 0; this.dmgT = 0;
    this.hitFlash = 0; this.bloodK = 0;
    this.bloodEl = document.getElementById('blood-overlay');
    this.bloodEl.style.backgroundImage = `url(${this.makeBloodEdges()})`;
    this.canvasEl = null;
  }

  // ekran kenarlarında kan lekeleri + koyu vinyet (CoD tarzı hasar efekti)
  makeBloodEdges() {
    const W = 1024, H = 640;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); // multiply için beyaz = etkisiz
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(0.55, 'rgba(150,20,20,.35)'); vg.addColorStop(1, 'rgba(40,0,0,.95)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const blob = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(90,0,0,${a})`); gr.addColorStop(0.7, `rgba(120,5,5,${a * 0.8})`); gr.addColorStop(1, 'rgba(140,10,10,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    for (let i = 0; i < 140; i++) {
      // kenarlara yakın rastgele noktalar
      const side = i % 4, t = Math.random();
      const depth = Math.pow(Math.random(), 2.2) * 120;
      const x = side === 0 ? t * W : side === 1 ? t * W : side === 2 ? depth : W - depth;
      const y = side === 0 ? depth : side === 1 ? H - depth : t * H;
      blob(x, y, 10 + Math.random() * 60, 0.35 + Math.random() * 0.5);
    }
    // akan damlalar (üst kenardan)
    g.strokeStyle = 'rgba(100,0,0,.7)';
    for (let i = 0; i < 24; i++) { const x = Math.random() * W; g.lineWidth = 2 + Math.random() * 5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 8, 40 + Math.random() * 140); g.stroke(); }
    return c.toDataURL();
  }

  lowHealth(hp, dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.1);
    const target = Math.max(0, Math.min(1, (55 - hp) / 55));
    this.bloodK += (target - this.bloodK) * Math.min(1, dt * 3);
    const op = Math.min(1, this.bloodK * 0.85 + this.hitFlash * 0.9);
    if (Math.abs(op - (this._lastOp || 0)) > 0.01) {
      this.bloodEl.style.opacity = op.toFixed(3);
      this._lastOp = op;
      if (!this.canvasEl) this.canvasEl = document.querySelector('#game canvas');
      if (this.canvasEl) this.canvasEl.style.filter = this.bloodK > 0.05 ? `saturate(${(1 - this.bloodK * 0.75).toFixed(2)}) contrast(${(1 + this.bloodK * 0.12).toFixed(2)})` : '';
    }
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  makeRadarBase() {
    const c = document.createElement('canvas');
    const s = 4; c.width = MAP_W * s; c.height = MAP_H * s;
    const g = c.getContext('2d');
    for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
      const ch = GRID[z][x];
      g.fillStyle = ch === '#' ? 'rgba(0,0,0,0)' : ch === 'A' || ch === 'B' ? 'rgba(255,170,80,.45)' : ch === 'c' || ch === 'C' ? 'rgba(120,100,70,.8)' : 'rgba(200,190,170,.35)';
      g.fillRect(x * s, z * s, s, s);
    }
    g.fillStyle = 'rgba(255,200,120,.95)'; g.font = 'bold 14px Arial'; g.textAlign = 'center';
    g.fillText('A', 39 * s, 9.5 * s); g.fillText('B', 8.5 * s, 11 * s);
    return c;
  }

  drawRadar(me, list, bomb) {
    const g = this.radarCtx, S = this.el.radar.width, sc = 4 / CELL;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.roundRect(0, 0, S, S, 10); g.clip();
    // oyuncu merkezli, yöne göre döndürülmüş
    g.translate(S / 2, S / 2);
    g.rotate(me.yaw);
    const zoom = 1.25;
    g.scale(zoom, zoom);
    g.translate(-me.x * sc, -me.z * sc);
    g.drawImage(this.radarBase, 0, 0);
    if (bomb && bomb.p && (bomb.s === 'planted' || bomb.s === 'dropped')) {
      g.fillStyle = bomb.s === 'planted' ? '#ff4030' : '#ffb030';
      g.fillRect(bomb.p[0] * sc - 3, bomb.p[2] * sc - 3, 6, 6);
    }
    for (const p of list) {
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x * sc, p.z * sc, p.dead ? 2 : 3.2, 0, Math.PI * 2); g.fill();
      if (p.dead) { g.strokeStyle = p.color; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x * sc - 3, p.z * sc - 3); g.lineTo(p.x * sc + 3, p.z * sc + 3); g.moveTo(p.x * sc + 3, p.z * sc - 3); g.lineTo(p.x * sc - 3, p.z * sc + 3); g.stroke(); }
    }
    g.restore();
    // kendimiz: merkezde ok
    g.save(); g.translate(S / 2, S / 2);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
  }

  setVitals(hp, armor, money) {
    this.el.hp.textContent = hp; this.el.armor.textContent = armor; this.el.money.textContent = money;
    this.el.hp.parentElement.classList.toggle('low', hp <= 25);
  }

  setAmmo(key, ammo) {
    const w = WEAPONS[key];
    this.el['weapon-name'].textContent = w ? w.name : '';
    if (w && w.type === 'gun' && ammo) {
      this.el.ammo.style.display = '';
      this.el.mag.textContent = ammo.mag; this.el.reserve.textContent = ammo.res;
      this.el.ammo.classList.toggle('low', ammo.mag <= Math.ceil(w.mag * 0.2));
    } else this.el.ammo.style.display = 'none';
  }

  setSlots(inv, cur) {
    const items = [];
    if (inv.primary) items.push(['1', inv.primary]);
    if (inv.secondary) items.push(['2', inv.secondary]);
    items.push(['3', 'knife']);
    if (inv.gr) items.push(['4', 'grenade']);
    if (inv.bomb) items.push(['5', 'bomb']);
    const html = items.map(([k, w]) => `<div class="${w === cur ? 'on' : ''} ${w === 'bomb' ? 'bomb' : ''}">${k} ${esc(WEAPONS[w].name)}</div>`).join('');
    if (html !== this._slotsHtml) { this.el.slots.innerHTML = html; this._slotsHtml = html; }
  }

  setTop(r, timeLeft, bombPlanted, alive) {
    this.el['score-att'].textContent = r.sa; this.el['score-def'].textContent = r.sd;
    const t = Math.max(0, Math.ceil(timeLeft));
    this.el.timer.textContent = bombPlanted ? '💣' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.el.timer.classList.toggle('bomb', !!bombPlanted);
    const ph = { freeze: 'Hazırlık', live: `Round ${r.n}`, post: 'Round bitti', over: 'Maç bitti', waiting: 'Bekleniyor' }[r.ph] || '';
    this.el['round-label'].textContent = ph;
    this.el['alive-att'].textContent = '●'.repeat(alive.att);
    this.el['alive-def'].textContent = '●'.repeat(alive.def);
  }

  killfeed(k, v, w, hs, mine) {
    const d = document.createElement('div');
    d.className = 'kf' + (mine ? ' mine' : '');
    d.innerHTML = (k ? `<span class="${k.tm}">${esc(k.n)}</span>` : '') + `<span class="w">${esc(WEAPONS[w]?.name || (w === 'bomb' ? 'Bomba' : w))}</span>` + (hs ? '<span class="hs">KAFA</span>' : '') + `<span class="${v.tm}">${esc(v.n)}</span>`;
    this.el.killfeed.prepend(d);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
    setTimeout(() => d.remove(), 7000);
  }

  center(text, cls = '', sub = '', dur = 3) {
    const c = this.el['center-msg'];
    c.textContent = text; c.className = 'show ' + cls;
    this.el['sub-msg'].textContent = sub; this.el['sub-msg'].className = sub ? 'show' : '';
    this.centerT = dur;
  }
  notify(text, dur = 2.5) { this.el.notify.textContent = text; this.el.notify.className = 'show'; this.notifyT = dur; }

  chat(name, team, msg) {
    const d = document.createElement('div');
    d.innerHTML = name ? `<b style="color:${team === 'att' ? 'var(--att)' : 'var(--def)'}">${esc(name)}:</b> ${esc(msg)}` : `<i style="color:#bbb">${esc(msg)}</i>`;
    this.el['chat-log'].append(d);
    while (this.el['chat-log'].children.length > 7) this.el['chat-log'].firstChild.remove();
    setTimeout(() => d.remove(), 9500);
  }

  hitmarker(hs) {
    const h = this.el.hitmarker; h.className = 'show' + (hs ? ' hs' : '');
    clearTimeout(this._hm); this._hm = setTimeout(() => { h.className = hs ? 'hs' : ''; }, 90);
  }

  damage(angle, amt = 20) {
    this.hitFlash = Math.min(1, this.hitFlash + 0.35 + amt / 80);
    this.el['damage-flash'].style.transition = 'none'; this.el['damage-flash'].style.opacity = 0.9;
    requestAnimationFrame(() => { this.el['damage-flash'].style.transition = 'opacity .5s'; this.el['damage-flash'].style.opacity = 0; });
    if (angle !== null) {
      const d = document.createElement('div'); d.className = 'dmg-ind';
      d.style.transform = `rotate(${angle}rad)`;
      this.el['dmg-indicators'].append(d);
      setTimeout(() => { d.style.opacity = 0; }, 400);
      setTimeout(() => d.remove(), 1400);
    }
  }

  crosshair(gapPx, visible) {
    this.el.crosshair.style.setProperty('--gap', `${Math.round(gapPx)}px`);
    this.el.crosshair.style.display = visible ? '' : 'none';
  }
  scope(on) { this.el.scope.classList.toggle('on', on); }

  progress(frac, label) {
    if (frac > 0) {
      this.el.progress.classList.remove('hidden');
      this.el['progress-fill'].style.width = `${Math.round(frac * 100)}%`;
      this.el['progress-label'].textContent = label;
    } else this.el.progress.classList.add('hidden');
  }

  bombHint(text) {
    this.el['bomb-hint'].classList.toggle('hidden', !text);
    if (text) this.el['bomb-hint'].textContent = text;
  }

  spectate(text) {
    this.el.spectate.classList.toggle('hidden', !text);
    if (text) this.el.spectate.innerHTML = text;
  }

  tick(dt) {
    if (this.centerT > 0 && (this.centerT -= dt) <= 0) { this.el['center-msg'].classList.remove('show'); this.el['sub-msg'].classList.remove('show'); }
    if (this.notifyT > 0 && (this.notifyT -= dt) <= 0) this.el.notify.classList.remove('show');
  }

  // ---- satın alma menüsü
  buildBuy(onBuy) {
    let n = 0;
    this.el['buy-cats'].innerHTML = BUY_MENU.map((cat, ci) => `<div class="buy-cat"><h4>${ci + 1}. ${cat.title}</h4>${cat.items.map((it) => {
      n++;
      const w = WEAPONS[it];
      const name = w ? w.name : EQUIP[it].name;
      const price = w ? w.price : EQUIP[it].price;
      const stats = w && w.type === 'gun' ? `Hasar ${w.damage}${w.pellets ? '×' + w.pellets : ''} · Şarjör ${w.mag} · ${w.auto ? 'Otomatik' : 'Tekli'}` : it === 'kit' ? 'Sadece savunma · imha 5 sn' : it === 'grenade' ? 'Patlayıcı · G ile at' : 'Gövde hasarını azaltır';
      return `<button class="buy-item" data-item="${it}"><span><span class="k">${n}</span>${esc(name)}<span class="stats">${stats}</span></span><span class="p">$${price}</span></button>`;
    }).join('')}</div>`).join('');
    this.buyItems = [...this.el['buy-cats'].querySelectorAll('.buy-item')];
    this.buyItems.forEach((b) => b.addEventListener('click', () => onBuy(b.dataset.item)));
  }

  updateBuy(money, team, inv) {
    this.el['buy-money'].textContent = money;
    for (const b of this.buyItems || []) {
      const it = b.dataset.item, w = WEAPONS[it];
      let price = w ? w.price : EQUIP[it].price;
      if (it === 'helmet' && inv.armor >= 100) price = 350;
      b.querySelector('.p').textContent = `$${price}`;
      const owned = (w && (inv.primary === it || inv.secondary === it)) || (it === 'kevlar' && inv.armor >= 100) || (it === 'helmet' && inv.helmet) || (it === 'kit' && inv.kit) || (it === 'grenade' && inv.gr > 0);
      b.disabled = money < price || owned || (it === 'kit' && team !== 'def');
    }
  }
  buyOpen(on) { this.el['buy-menu'].classList.toggle('hidden', !on); }

  // ---- skor tablosu
  scoreboard(on, roster, myId, score) {
    this.el.scoreboard.classList.toggle('hidden', !on);
    if (!on) return;
    this.el['sb-score-att'].textContent = score.sa; this.el['sb-score-def'].textContent = score.sd;
    for (const tm of ['att', 'def']) {
      const rows = roster.filter((p) => p.tm === tm).sort((a, b) => b.k - a.k);
      this.el['sb-' + tm].innerHTML = rows.map((p) => `<tr class="${p.a ? '' : 'dead'} ${p.i === myId ? 'me' : ''}"><td>${esc(p.n)}${p.b ? '<span class="bot">BOT</span>' : ''}</td><td>${p.k}</td><td>${p.d}</td><td>${p.m >= 0 ? '$' + p.m : ''}</td></tr>`).join('');
    }
  }

  teamName(t) { return TEAM_NAMES[t]; }
}
