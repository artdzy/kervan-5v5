// WebAudio ile sentezlenen sesler (dış dosya gerektirmez), 3B konumlu
const PROFILES = {
  pistol:  { f: 1800, q: 0.9, dur: 0.16, vol: 0.55, thump: 140 },
  deagle:  { f: 1100, q: 0.8, dur: 0.3, vol: 0.85, thump: 90 },
  smg:     { f: 2200, q: 1.0, dur: 0.11, vol: 0.45, thump: 160 },
  shotgun: { f: 800, q: 0.6, dur: 0.38, vol: 0.95, thump: 70 },
  rifle:   { f: 1300, q: 0.8, dur: 0.2, vol: 0.7, thump: 100 },
  carbine: { f: 1600, q: 0.9, dur: 0.17, vol: 0.6, thump: 120 },
  sniper:  { f: 700, q: 0.7, dur: 0.55, vol: 1.0, thump: 60 },
  knife:   { f: 3500, q: 2, dur: 0.08, vol: 0.25, thump: 0 },
};

export class Audio {
  constructor() { this.ctx = null; this.volume = 0.6; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.1; p.maxDistance = 200;
    p.positionX ? (p.positionX.value = pos.x, p.positionY.value = pos.y, p.positionZ.value = pos.z) : p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  noiseBurst(dest, { f, q, dur, vol, type = 'bandpass', start = 0, attack = 0.002 }) {
    const c = this.ctx, t = c.currentTime + start;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filt = c.createBiquadFilter(); filt.type = type; filt.frequency.value = f; filt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  tone(dest, { f, f2, dur, vol, type = 'sine', start = 0 }) {
    const c = this.ctx, t = c.currentTime + start;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  shot(key, pos) {
    if (!this.ctx) return;
    const p = PROFILES[key] || PROFILES.rifle;
    const dest = this.out(pos);
    const far = pos ? 1 : 1;
    this.noiseBurst(dest, { f: p.f, q: p.q, dur: p.dur, vol: p.vol * far });
    this.noiseBurst(dest, { f: 5000, q: 0.5, dur: p.dur * 0.35, vol: p.vol * 0.4, type: 'highpass' });
    if (p.thump) this.tone(dest, { f: p.thump * 1.6, f2: p.thump * 0.5, dur: p.dur * 0.8, vol: p.vol * 0.7, type: 'triangle' });
    if (key === 'shotgun' || key === 'sniper') this.noiseBurst(dest, { f: 300, q: 0.4, dur: p.dur * 1.6, vol: p.vol * 0.4, type: 'lowpass', start: 0.02 });
  }

  step(pos, loud = 1) {
    if (!this.ctx) return;
    this.noiseBurst(this.out(pos), { f: 420 + Math.random() * 200, q: 1.2, dur: 0.09, vol: 0.35 * loud, type: 'bandpass' });
  }
  land() { if (this.ctx) this.noiseBurst(this.master, { f: 250, q: 0.8, dur: 0.15, vol: 0.4, type: 'lowpass' }); }
  click() { if (this.ctx) this.tone(this.master, { f: 1800, dur: 0.03, vol: 0.2, type: 'square' }); }
  reload(pos) {
    if (!this.ctx) return;
    const d = this.out(pos);
    this.noiseBurst(d, { f: 2500, q: 3, dur: 0.05, vol: 0.3, start: 0.15 });
    this.noiseBurst(d, { f: 1800, q: 3, dur: 0.06, vol: 0.35, start: 0.9 });
    this.noiseBurst(d, { f: 3000, q: 3, dur: 0.04, vol: 0.3, start: 1.4 });
  }
  hit(hs) {
    if (!this.ctx) return;
    if (hs) this.tone(this.master, { f: 1900, f2: 1500, dur: 0.18, vol: 0.35, type: 'sine' });
    else this.tone(this.master, { f: 900, dur: 0.05, vol: 0.18, type: 'triangle' });
  }
  hurt() { if (this.ctx) this.noiseBurst(this.master, { f: 300, q: 1, dur: 0.12, vol: 0.4, type: 'lowpass' }); }
  beep(pos, hi) { if (this.ctx) this.tone(this.out(pos), { f: hi ? 2600 : 2100, dur: 0.09, vol: 0.5, type: 'square' }); }
  bounce(pos) { if (this.ctx) this.tone(this.out(pos), { f: 520, f2: 300, dur: 0.06, vol: 0.3, type: 'triangle' }); }
  explosion(pos, big) {
    if (!this.ctx) return;
    const d = this.out(pos);
    this.noiseBurst(d, { f: 900, q: 0.5, dur: big ? 2.6 : 1.2, vol: 1.0, type: 'lowpass', attack: 0.005 });
    this.tone(d, { f: 90, f2: 30, dur: big ? 1.8 : 0.8, vol: 0.9, type: 'sine' });
    this.noiseBurst(d, { f: 3000, q: 0.5, dur: 0.25, vol: 0.5, type: 'highpass' });
  }
  roundStart() { if (this.ctx) { this.tone(this.master, { f: 660, dur: 0.15, vol: 0.25 }); this.tone(this.master, { f: 990, dur: 0.25, vol: 0.25, start: 0.15 }); } }
  roundEnd(win) {
    if (!this.ctx) return;
    const seq = win ? [523, 659, 784] : [523, 415, 330];
    seq.forEach((f, i) => this.tone(this.master, { f, dur: 0.3, vol: 0.25, type: 'triangle', start: i * 0.16 }));
  }
  tink(pos) {
    if (!this.ctx) return;
    const d = this.out(pos);
    this.tone(d, { f: 3200 + Math.random() * 900, dur: 0.12, vol: 0.12, type: 'sine' });
    this.tone(d, { f: 5100 + Math.random() * 600, dur: 0.07, vol: 0.06, type: 'sine', start: 0.05 });
  }
  heartbeat() {
    if (!this.ctx) return;
    this.tone(this.master, { f: 60, f2: 40, dur: 0.14, vol: 0.55, type: 'sine' });
    this.tone(this.master, { f: 55, f2: 38, dur: 0.16, vol: 0.4, type: 'sine', start: 0.22 });
  }
  buy() { if (this.ctx) this.tone(this.master, { f: 1200, f2: 1600, dur: 0.08, vol: 0.2, type: 'triangle' }); }
  swing(pos) { if (this.ctx) this.noiseBurst(this.out(pos), { f: 1500, q: 0.7, dur: 0.15, vol: 0.3 }); }
}
