// Birinci şahıs silah modeli: prosedürel modeller + (varsa) Sketchfab glTF modelleri
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEAPONS } from '/shared/constants.js';

const M = {
  metal: new THREE.MeshStandardMaterial({ color: '#34373c', roughness: 0.45, metalness: 0.55 }),
  metal2: new THREE.MeshStandardMaterial({ color: '#53575e', roughness: 0.4, metalness: 0.6 }),
  poly: new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.8, metalness: 0.1 }),
  wood: new THREE.MeshStandardMaterial({ color: '#7a4a22', roughness: 0.7 }),
  tan: new THREE.MeshStandardMaterial({ color: '#8f7f5e', roughness: 0.8 }),
  skin: new THREE.MeshStandardMaterial({ color: '#c99a74', roughness: 0.75 }),
  glove: new THREE.MeshStandardMaterial({ color: '#2a2621', roughness: 0.9 }),
  blade: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.25, metalness: 0.95 }),
  green: new THREE.MeshStandardMaterial({ color: '#4a5a2a', roughness: 0.8 }),
  lens: new THREE.MeshStandardMaterial({ color: '#0a1a2a', roughness: 0.1, metalness: 0.9 }),
};
const SLEEVE = { att: new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9 }), def: new THREE.MeshStandardMaterial({ color: '#2f456e', roughness: 0.9 }) };

function b(g, w, h, d, mat, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m;
}
function cyl(g, r, len, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
}

// Silah modelleri — namlu -Z yönünde, kabza (0,0,0) civarında
function buildGun(key) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  switch (key) {
    case 'knife':
      b(g, 0.035, 0.05, 0.13, M.poly, 0, 0, 0.02);
      b(g, 0.012, 0.045, 0.2, M.blade, 0, 0.005, -0.15);
      b(g, 0.05, 0.07, 0.015, M.metal, 0, 0, -0.05);
      muzzle.position.set(0, 0, -0.25); break;
    case 'pistol':
    case 'deagle': {
      const L = key === 'deagle' ? 0.24 : 0.19;
      b(g, 0.04, 0.045, L, key === 'deagle' ? M.metal2 : M.metal, 0, 0.05, -L / 2 + 0.03);
      b(g, 0.036, 0.11, 0.05, M.poly, 0, -0.025, 0.02, 0.25);
      b(g, 0.03, 0.02, 0.06, M.metal, 0, 0.0, -0.03);
      b(g, 0.008, 0.012, 0.008, M.metal, 0, 0.078, -L + 0.05);
      muzzle.position.set(0, 0.05, -L + 0.02); break;
    }
    case 'smg':
      b(g, 0.05, 0.07, 0.3, M.metal, 0, 0.04, -0.1);
      cyl(g, 0.013, 0.1, M.metal2, 0, 0.05, -0.3);
      b(g, 0.035, 0.18, 0.04, M.poly, 0, -0.08, -0.12);
      b(g, 0.035, 0.09, 0.05, M.poly, 0, -0.03, 0.03, 0.25);
      b(g, 0.03, 0.04, 0.16, M.metal2, 0, 0.04, 0.14);
      b(g, 0.02, 0.025, 0.05, M.metal, 0, 0.09, -0.05);
      muzzle.position.set(0, 0.05, -0.36); break;
    case 'shotgun':
      cyl(g, 0.018, 0.6, M.metal, 0, 0.055, -0.3);
      cyl(g, 0.016, 0.45, M.metal2, 0, 0.02, -0.25);
      b(g, 0.055, 0.075, 0.2, M.metal, 0, 0.04, 0.0);
      b(g, 0.06, 0.06, 0.16, M.wood, 0, 0.015, -0.28);
      b(g, 0.045, 0.09, 0.28, M.wood, 0, -0.01, 0.22, -0.12);
      muzzle.position.set(0, 0.055, -0.62); break;
    case 'rifle':
      b(g, 0.055, 0.08, 0.32, M.metal, 0, 0.04, -0.05);
      cyl(g, 0.012, 0.32, M.metal, 0, 0.055, -0.38);
      b(g, 0.06, 0.065, 0.18, M.wood, 0, 0.035, -0.28);
      b(g, 0.04, 0.17, 0.06, M.metal2, 0, -0.08, -0.12, 0.35);
      b(g, 0.035, 0.1, 0.05, M.wood, 0, -0.035, 0.07, 0.3);
      b(g, 0.045, 0.08, 0.26, M.wood, 0, 0.0, 0.24, -0.1);
      b(g, 0.008, 0.03, 0.01, M.metal, 0, 0.1, -0.44);
      muzzle.position.set(0, 0.055, -0.55); break;
    case 'carbine':
      b(g, 0.05, 0.08, 0.3, M.tan, 0, 0.04, -0.05);
      b(g, 0.06, 0.07, 0.2, M.poly, 0, 0.04, -0.29);
      cyl(g, 0.011, 0.22, M.metal, 0, 0.05, -0.47);
      b(g, 0.035, 0.15, 0.06, M.poly, 0, -0.07, -0.08, 0.15);
      b(g, 0.035, 0.1, 0.05, M.poly, 0, -0.035, 0.07, 0.3);
      b(g, 0.03, 0.03, 0.2, M.metal2, 0, 0.04, 0.2);
      b(g, 0.045, 0.08, 0.1, M.poly, 0, 0.02, 0.3);
      b(g, 0.03, 0.045, 0.08, M.poly, 0, 0.105, -0.04);
      muzzle.position.set(0, 0.05, -0.58); break;
    case 'sniper':
      b(g, 0.055, 0.085, 0.36, M.green, 0, 0.03, -0.05);
      cyl(g, 0.014, 0.5, M.metal, 0, 0.05, -0.45);
      cyl(g, 0.03, 0.26, M.metal, 0, 0.13, -0.08);
      cyl(g, 0.034, 0.02, M.lens, 0, 0.13, 0.05);
      b(g, 0.035, 0.1, 0.05, M.poly, 0, -0.04, 0.08, 0.3);
      b(g, 0.05, 0.1, 0.28, M.green, 0, 0.0, 0.26);
      b(g, 0.035, 0.08, 0.06, M.metal, 0, -0.06, -0.08);
      muzzle.position.set(0, 0.05, -0.72); break;
    case 'grenade': {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), M.green); s.scale.y = 1.25; g.add(s);
      b(g, 0.025, 0.03, 0.025, M.metal2, 0, 0.065, 0);
      b(g, 0.012, 0.07, 0.02, M.metal2, 0.025, 0.04, 0);
      muzzle.position.set(0, 0, -0.1); break;
    }
    case 'bomb':
      b(g, 0.2, 0.08, 0.14, M.green, 0, 0, -0.05);
      b(g, 0.09, 0.012, 0.07, M.poly, 0.02, 0.046, -0.05);
      for (let i = 0; i < 3; i++) cyl(g, 0.012, 0.13, new THREE.MeshStandardMaterial({ color: ['#a33', '#cc3', '#36a'][i] }), -0.06 + i * 0.025, 0.045, -0.05);
      muzzle.position.set(0, 0, -0.2); break;
  }
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

// Kollar: sağ el kabzada, sol el ön tarafta
function buildArms(key, team) {
  const g = new THREE.Group();
  const sleeve = SLEEVE[team] || SLEEVE.att;
  const twoHand = ['smg', 'shotgun', 'rifle', 'carbine', 'sniper'].includes(key);
  const pistol = key === 'pistol' || key === 'deagle';
  // sağ kol
  const armR = b(g, 0.07, 0.07, 0.36, sleeve, 0.06, -0.08, 0.24, 0.4);
  void armR;
  b(g, 0.055, 0.075, 0.08, M.glove, 0.0, -0.02, 0.04);
  if (twoHand) {
    b(g, 0.07, 0.07, 0.42, sleeve, -0.16, -0.12, -0.06, 0.15).rotation.y = -0.6;
    b(g, 0.06, 0.06, 0.09, M.glove, -0.02, -0.0, -0.24);
  } else if (pistol) {
    b(g, 0.07, 0.07, 0.36, sleeve, -0.1, -0.1, 0.22, 0.4).rotation.y = -0.35;
    b(g, 0.05, 0.065, 0.07, M.glove, -0.035, -0.035, 0.035);
  }
  return g;
}

const BASE_POS = {
  knife: [0.2, -0.2, -0.42], pistol: [0.16, -0.17, -0.46], deagle: [0.16, -0.17, -0.46],
  smg: [0.16, -0.18, -0.42], shotgun: [0.16, -0.19, -0.42], rifle: [0.16, -0.19, -0.42],
  carbine: [0.16, -0.19, -0.42], sniper: [0.16, -0.2, -0.4], grenade: [0.2, -0.18, -0.4], bomb: [0.1, -0.22, -0.45],
};

// Klipten [a,b] kare aralığını, TÜM izleri örnekleyerek ayrı klip yapar
// (AnimationUtils.subclip aralıkta anahtarı olmayan izleri attığı için kemikler yanlış pozda kalıyordu)
function sampleSubclip(clip, name, a, b, fps) {
  const tracks = [];
  const n = Math.max(2, b - a + 1);
  for (const tr of clip.tracks) {
    const interp = tr.createInterpolant();
    const size = tr.getValueSize();
    const times = new Float32Array(n), values = new Float32Array(n * size);
    for (let i = 0; i < n; i++) {
      const t = (a + i) / fps;
      times[i] = i / fps;
      values.set(interp.evaluate(Math.min(t, clip.duration)), i * size);
    }
    tracks.push(new tr.constructor(tr.name, times, values));
  }
  return new THREE.AnimationClip(name, (n - 1) / fps, tracks);
}

// glTF modelleri için klip adı eşleştirme
const CLIP_RX = {
  idle: /idle|rest|hold|static/i,
  fire: /fire|shoot|shot|attack|recoil|slash|stab|swing/i,
  reload: /reload|realod/i,
  draw: /draw|equip|take|get|pull.?out|show|select/i,
};

export class ViewModel {
  constructor(aspect, renderer) {
    this.scene = new THREE.Scene();
    if (renderer) {
      const pm = new THREE.PMREMGenerator(renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.6;
    }
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight('#e6efff', '#6a5236', 1.6));
    const d = new THREE.DirectionalLight('#fff3dd', 2.2); d.position.set(0.5, 1, 0.6); this.scene.add(d);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = {};      // key -> {group, muzzle, gltf?}
    this.team = 'att';
    this.key = null;
    this.kick = 0; this.kickRot = 0;
    this.drawT = 1; this.reloadT = 0; this.reloadDur = 1;
    this.bob = 0; this.sway = { x: 0, y: 0 };
    this.flash = this.makeFlash();
    this.gltfConfig = {};
    this.gltfList = {};
    this.mixer = null;
  }

  makeFlash() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.set(0.16, 0.16, 1); s.visible = false;
    this.flashLight = new THREE.PointLight('#ffb050', 0, 2);
    this.scene.add(this.flashLight);
    return s;
  }

  async loadModels() {
    try {
      this.gltfList = await (await fetch('/models.json')).json();
      try { this.gltfConfig = await (await fetch('/assets/models/config.json')).json(); } catch { this.gltfConfig = {}; }
    } catch { this.gltfList = {}; }
    const loader = new GLTFLoader();
    const keys = Object.keys(this.gltfList).filter((k) => WEAPONS[k]);
    await Promise.all(keys.map((k) => new Promise((res) => {
      loader.load('/' + this.gltfList[k], (gltf) => { this.prepareGltf(k, gltf); res(); }, undefined, (e) => { console.warn('Model yüklenemedi', k, e); res(); });
    })));
    if (this.key) { const k = this.key; this.key = null; this.setWeapon(k, true); }
    return keys;
  }

  prepareGltf(key, gltf) {
    const cfg = { ...(this.gltfConfig[key] || {}), ...((this.overrideConfig || {})[key] || {}) };
    const obj = gltf.scene;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) { m.depthWrite = true; if (m.map) m.map.anisotropy = 8; }
    });
    // pivot: ölçek + yön; holder: konum (update() sallanma/geri tepme uygular)
    // birim normalizasyonu: metre ile çizilmiş modelleri santimetreye çevir
    {
      const b = new THREE.Box3().setFromObject(obj);
      const m = Math.max(...b.getSize(new THREE.Vector3()).toArray());
      if (m > 0 && m < 6) obj.scale.multiplyScalar(100);
    }
    const pivot = new THREE.Group();
    pivot.add(obj);
    const sc = cfg.scale ?? 0.01;
    pivot.scale.setScalar(sc);
    pivot.rotation.set(...(cfg.rotation || [0, 180, 0]).map((d) => d * Math.PI / 180));
    // otomatik hizalama: silah gövdesinin kutusuna göre göz konumu (model uzayı, silah +Z yönünde)
    const fit = this.autoFit(obj, gltf.animations[0], cfg);
    if (cfg.eye) { fit.x = cfg.eye[0]; fit.y = cfg.eye[1]; fit.z = cfg.eye[2]; }
    const off = cfg.offset || [0, 0, 0];
    const c = { x: fit.x + off[0], y: fit.y + off[1], z: fit.z + off[2] };
    const rot = pivot.rotation.clone();
    const pc = new THREE.Vector3(c.x, c.y, c.z).applyEuler(rot).multiplyScalar(-sc);
    pivot.position.set(...(cfg.position || pc.toArray()));
    const holder = new THREE.Group();
    holder.add(pivot);
    // namlu ucu: silah kutusunun en ön noktası (görüntü uzayına dönüştürülmüş)
    const mz = fit.muzzle;
    const muzzle = new THREE.Object3D();
    const mv = new THREE.Vector3(mz.x - c.x, mz.y - c.y, mz.z - c.z).applyEuler(rot).multiplyScalar(sc);
    muzzle.position.set(...(cfg.muzzle || mv.toArray()));
    holder.add(muzzle);
    // klipler: ayrı isimli klipler ya da tek klip içinde kare aralıkları (30 fps)
    const clips = {};
    const base = gltf.animations[0];
    if (cfg.segments && base) {
      for (const [name, [a, b]] of Object.entries(cfg.segments)) clips[name] = sampleSubclip(base, name, a, b, cfg.fps || 30);
    } else {
      for (const [name, rx] of Object.entries(CLIP_RX)) clips[name] = gltf.animations.find((x) => rx.test(x.name)) || null;
    }
    this.models[key] = { group: holder, muzzle, gltf: true, clips, anims: gltf.animations, root: obj, cfg };
  }

  autoFit(obj, clip, cfg) {
    const mixer = new THREE.AnimationMixer(obj);
    if (clip) { mixer.clipAction(clip).play(); mixer.setTime((cfg.fitFrame ?? 0) / (cfg.fps || 30)); }
    obj.updateMatrixWorld(true);
    const boxes = [];
    obj.traverse((o) => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o, true); if (!b.isEmpty()) boxes.push({ o, b, v: b.getSize(new THREE.Vector3()).toArray().reduce((a, x) => a * Math.max(x, 1), 1) }); } });
    mixer.stopAllAction(); mixer.uncacheRoot(obj);
    boxes.sort((a, b) => b.v - a.v);
    // en büyük hacimli mesh kollardır; geri kalanlar silah
    const gun = new THREE.Box3();
    for (const e of boxes.slice(boxes.length > 1 ? 1 : 0)) gun.union(e.b);
    if (gun.isEmpty() && boxes[0]) gun.copy(boxes[0].b);
    const ctr = gun.getCenter(new THREE.Vector3()), size = gun.getSize(new THREE.Vector3());
    const small = size.z < 45;
    return {
      x: ctr.x + (small ? 5 : 11),
      y: gun.max.y - (small ? 9 : 2),
      z: small ? gun.min.z - 40 : gun.min.z + 28,
      muzzle: { x: ctr.x, y: gun.max.y - 3, z: gun.max.z },
    };
  }

  // geliştirici sayfası için: klibin belirli anında dondur
  freezeAt(t) {
    const m = this.cur; if (!m?.gltf) return;
    this.mixer = new THREE.AnimationMixer(m.root);
    const a = this.mixer.clipAction(m.anims[0]); a.play(); this.mixer.setTime(t);
    this.mixer = null;
    this.update(0, { speed: 0, onGround: true });
  }
  play(name) { this.playOnce(name); }

  setTeam(team) {
    if (team === this.team) return;
    this.team = team;
    for (const k of Object.keys(this.models)) if (!this.models[k].gltf) delete this.models[k];
    if (this.key) { const k = this.key; this.key = null; this.setWeapon(k); }
  }

  getModel(key) {
    if (!this.models[key]) {
      const group = new THREE.Group();
      const gun = buildGun(key);
      group.add(gun, buildArms(key, this.team));
      this.models[key] = { group, muzzle: gun.userData.muzzle, gltf: false };
    }
    return this.models[key];
  }

  setWeapon(key, silent = false) {
    if (key === this.key) return;
    this.key = key;
    this.root.clear();
    const m = this.getModel(key);
    this.cur = m;
    this.root.add(m.group);
    m.muzzle.add(this.flash);
    this.drawT = silent ? 1 : 0;
    this.reloadT = 0;
    this.mixer = null;
    if (m.gltf) {
      this.mixer = new THREE.AnimationMixer(m.root);
      this.actions = {};
      for (const [n, clip] of Object.entries(m.clips)) if (clip) this.actions[n] = this.mixer.clipAction(clip);
      if (this.actions.draw) this.playOnce('draw');
      else if (this.actions.idle) this.actions.idle.play();
    }
  }

  playOnce(name, dur) {
    if (!this.mixer || !this.actions?.[name]) return false;
    const a = this.actions[name];
    for (const x of Object.values(this.actions)) if (x !== a) x.fadeOut(0.08);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    if (dur) a.timeScale = a.getClip().duration / dur; else a.timeScale = 1;
    a.fadeIn(0.05).play();
    clearTimeout(this._idleT);
    const ms = (dur || a.getClip().duration) * 1000;
    this._idleT = setTimeout(() => { if (this.actions?.idle) { a.fadeOut(0.15); this.actions.idle.reset().fadeIn(0.15).play(); } }, ms);
    return true;
  }

  fire() {
    const w = WEAPONS[this.key];
    const strong = w.type === 'gun' ? Math.min(1, (w.recoil || 0.01) * 20) : 0.6;
    this.kick = Math.min(1.5, this.kick + 0.6 + strong);
    if (w.type === 'gun') {
      this.flash.visible = true; this.flash.material.rotation = Math.random() * 6;
      const s = 0.12 + Math.random() * 0.1; this.flash.scale.set(s, s, 1);
      this.flashLight.intensity = 3; this.flashT = 0.045;
    }
    if (this.cur?.gltf) this.playOnce('fire');
  }

  reload(dur) {
    this.reloadT = dur; this.reloadDur = dur;
    if (this.cur?.gltf) this.playOnce('reload', dur);
  }
  cancelReload() { this.reloadT = 0; }

  update(dt, st) {
    // st: {speed, onGround, punchPitch, punchYaw, scoped, mouseDX, mouseDY, crouch}
    if (this.mixer) this.mixer.update(dt);
    const base = this.cur?.gltf ? [0, 0, 0] : (BASE_POS[this.key] || [0.17, -0.19, -0.38]);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.drawT = Math.min(1, this.drawT + dt * 3.2);
    if (this.reloadT > 0) this.reloadT = Math.max(0, this.reloadT - dt);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; } }

    const moving = st.onGround ? Math.min(1, st.speed / 5) : 0;
    this.bob += dt * (6 + st.speed * 1.3) * (moving > 0.05 ? 1 : 0);
    const bx = Math.sin(this.bob) * 0.012 * moving, by = -Math.abs(Math.cos(this.bob)) * 0.012 * moving;
    this.sway.x += (-(st.mouseDX || 0) * 0.0004 - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += ((st.mouseDY || 0) * 0.0004 - this.sway.y) * Math.min(1, dt * 8);
    this.sway.x = Math.max(-0.03, Math.min(0.03, this.sway.x)); this.sway.y = Math.max(-0.03, Math.min(0.03, this.sway.y));
    const idle = Math.sin(performance.now() * 0.0015) * 0.003;

    // çekme ve şarjör animasyonu (prosedürel)
    const draw = 1 - this.drawT;
    let rDip = 0, rRot = 0;
    if (this.reloadT > 0 && !this.cur?.gltf) {
      const p = 1 - this.reloadT / this.reloadDur;
      const e = Math.sin(Math.min(1, p) * Math.PI);
      rDip = e * 0.12; rRot = e * 0.7;
    }
    const k = this.kick;
    const isMelee = WEAPONS[this.key]?.type === 'melee';
    this.root.position.set(
      base[0] + bx + this.sway.x,
      base[1] + by + idle + this.sway.y - draw * 0.25 - rDip - (isMelee ? 0 : k * 0.012),
      base[2] + (isMelee ? -k * 0.08 : k * 0.035),
    );
    this.root.rotation.set(k * (isMelee ? -0.25 : 0.06) + draw * 0.9 - rRot * 0.3, isMelee ? k * 0.3 : 0, rRot * 0.6);
    this.root.visible = !st.scoped;
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
