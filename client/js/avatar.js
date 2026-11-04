// Uzak oyuncu karakteri: animasyonlu asker modeli (Soldier.glb) + iki kemikli IK ile silah tutuşu.
// Model yüklenemezse basit prosedürel karaktere düşer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER } from '/shared/constants.js';

const SOLDIER_URL = '/assets/characters/Soldier.glb';
const TEAM_TINT = { att: new THREE.Color('#d8b48a'), def: new THREE.Color('#7f9fd6') };
const SOLDIER_YAW = 0; // model -Z yönüne bakıyor (oyunun ileri yönü)
let soldierPromise = null;
export function loadSoldier() {
  if (!soldierPromise) soldierPromise = new GLTFLoader().loadAsync(SOLDIER_URL).catch((e) => { console.warn('Asker modeli yüklenemedi', e); return null; });
  return soldierPromise;
}

const DARK = new THREE.MeshStandardMaterial({ color: '#1e2024', roughness: 0.45, metalness: 0.6 });
const WOOD = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.7 });
const GREEN = new THREE.MeshStandardMaterial({ color: '#4a5a2a', roughness: 0.8 });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

function nameSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(text, 128, 32);
  g.fillStyle = color; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1); s.renderOrder = 10;
  s.userData.isLabel = true;
  return s;
}

// 3. şahıs silah: kabza (0,0,0), namlu -Z. grip: sol el konumu
function tpGun(key) {
  const g = new THREE.Group();
  const spec = {
    knife: { len: 0.22, grip: null }, pistol: { len: 0.2, grip: null }, deagle: { len: 0.25, grip: null },
    smg: { len: 0.42, grip: -0.22 }, shotgun: { len: 0.85, grip: -0.38 }, rifle: { len: 0.8, grip: -0.34 },
    carbine: { len: 0.76, grip: -0.32 }, sniper: { len: 1.05, grip: -0.4 }, grenade: { len: 0.1, grip: null }, bomb: { len: 0.25, grip: null },
  }[key] || { len: 0.6, grip: -0.3 };
  if (key === 'grenade') { g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), GREEN)); }
  else if (key === 'bomb') { g.add(box(0.22, 0.1, 0.16, GREEN)); }
  else if (key === 'knife') { g.add(box(0.03, 0.03, 0.1, DARK, 0, 0, 0.02)); g.add(box(0.01, 0.035, 0.16, new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.9, roughness: 0.3 }), 0, 0.01, -0.11)); }
  else {
    const L = spec.len;
    g.add(box(0.05, 0.08, L * 0.55, DARK, 0, 0.05, -L * 0.2));
    g.add(box(0.025, 0.025, L * 0.45, DARK, 0, 0.06, -L * 0.62));
    g.add(box(0.035, 0.1, 0.05, DARK, 0, -0.03, 0.02));
    if (L > 0.35) {
      g.add(box(0.045, 0.07, L * 0.3, key === 'rifle' || key === 'shotgun' ? WOOD : DARK, 0, 0.0, 0.2));
      g.add(box(0.04, 0.12, 0.05, DARK, 0, -0.04, -0.1));
      g.add(box(0.055, 0.06, L * 0.22, key === 'rifle' || key === 'shotgun' ? WOOD : DARK, 0, 0.04, spec.grip));
    }
    if (key === 'sniper') g.add(box(0.05, 0.05, 0.3, DARK, 0, 0.12, -0.2));
  }
  g.userData.grip = spec.grip;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------- IK yardımcıları
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function worldPos(o, out) { return o.getWorldPosition(out); }
function rotateBoneWorld(bone, qWorld) {
  bone.getWorldQuaternion(_q1);
  const newWorld = qWorld.clone().multiply(_q1);
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(newWorld));
  bone.updateMatrixWorld(true);
}
function aimBone(bone, child, target) {
  const a = worldPos(bone, new THREE.Vector3()), b = worldPos(child, new THREE.Vector3());
  const from = b.sub(a).normalize(), to = target.clone().sub(a).normalize();
  rotateBoneWorld(bone, new THREE.Quaternion().setFromUnitVectors(from, to));
}
function twoBoneIK(upper, lower, end, target, pole) {
  const A = worldPos(upper, new THREE.Vector3()), B = worldPos(lower, new THREE.Vector3()), C = worldPos(end, new THREE.Vector3());
  const lab = A.distanceTo(B), lbc = B.distanceTo(C);
  const toT = target.clone().sub(A);
  const lat = THREE.MathUtils.clamp(toT.length(), 0.02, lab + lbc - 0.002);
  const dirT = toT.normalize();
  const cosA = THREE.MathUtils.clamp((lab * lab + lat * lat - lbc * lbc) / (2 * lab * lat), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const pd = pole.clone().sub(A).normalize();
  const bend = pd.sub(dirT.clone().multiplyScalar(pd.dot(dirT))).normalize();
  const desiredB = A.clone().add(dirT.clone().multiplyScalar(cosA * lab)).add(bend.multiplyScalar(sinA * lab));
  aimBone(upper, lower, desiredB);
  aimBone(lower, end, target);
}

export class Avatar {
  constructor(scene, info) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.team = info.tm;
    this.deadT = 0; this.lastPos = null; this.speed = 0; this.weapon = null; this.crouchK = 0;
    this.gun = new THREE.Group();     // silah, kök (root) uzayında
    this.root.add(this.gun);
    this.setName(info.n, info.tm, info.mate);
    scene.add(this.root);
    this.buildFallback();
    loadSoldier().then((g) => { if (g && !this.disposed) this.buildSoldier(g); });
  }

  buildFallback() {
    this.body.clear();
    const shirt = new THREE.MeshStandardMaterial({ color: this.team === 'att' ? '#7a5634' : '#2f456e', roughness: 0.9 });
    this.body.add(box(0.44, 0.6, 0.26, shirt, 0, 1.2, 0), box(0.36, 0.85, 0.22, shirt, 0, 0.45, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshStandardMaterial({ color: '#c99a74' }));
    head.position.y = 1.62; this.body.add(head);
    this.soldier = null;
  }

  buildSoldier(gltf) {
    this.body.clear();
    if (!gltf.userData.height) { const b = new THREE.Box3().setFromObject(gltf.scene); gltf.userData.height = b.max.y - b.min.y; }
    const model = SkeletonUtils.clone(gltf.scene);
    model.scale.setScalar(1.82 / gltf.userData.height);
    model.rotation.y = SOLDIER_YAW;
    const tint = TEAM_TINT[this.team] || TEAM_TINT.att;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        if (!/visor/i.test(o.material.name)) o.material.color.copy(tint);
        else { o.material.roughness = 0.08; o.material.metalness = 0.6; }
      }
    });
    this.body.add(model);
    const bone = (rx) => { let f = null; model.traverse((o) => { if (!f && o.isBone && rx.test(o.name)) f = o; }); return f; };
    this.bones = {
      spine: bone(/Spine1$/), spine2: bone(/Spine2$/), head: bone(/Head$/), neck: bone(/Neck$/),
      rArm: bone(/RightArm$/), rFore: bone(/RightForeArm$/), rHand: bone(/RightHand$/),
      lArm: bone(/LeftArm$/), lFore: bone(/LeftForeArm$/), lHand: bone(/LeftHand$/),
    };
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const c of gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
    this.cur = null;
    this.play('Idle');
    this.soldier = model;
  }

  play(name) {
    const a = this.actions?.[name];
    if (!a || this.cur === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(0.2).play();
    if (this.cur) this.cur.fadeOut(0.2);
    this.cur = a;
  }

  setName(name, team, mate) {
    if (this.label) this.root.remove(this.label);
    this.label = nameSprite(name, team === 'att' ? '#ffcf8a' : '#a8d4ff');
    this.label.position.y = 2.15;
    this.label.visible = !!mate;
    this.mate = !!mate;
    this.root.add(this.label);
  }

  setWeapon(key) {
    if (key === this.weapon) return;
    this.weapon = key;
    this.gun.clear();
    this.gunModel = tpGun(key);
    this.gun.add(this.gunModel);
  }

  update(dt, s) {
    if (s.team !== this.team) {
      this.team = s.team;
      if (this.soldier) loadSoldier().then((g) => g && this.buildSoldier(g)); else this.buildFallback();
    }
    if (s.weapon) this.setWeapon(s.weapon);
    if (this.lastPos) {
      const d = Math.hypot(s.x - this.lastPos.x, s.z - this.lastPos.z);
      const sp = dt > 0 ? d / dt : 0;
      this.speed += (Math.min(sp, 8) - this.speed) * Math.min(1, dt * 8);
    }
    this.lastPos = { x: s.x, z: s.z };
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = s.yaw;

    // ölüm
    if (!s.alive) {
      this.deadT = Math.min(1, this.deadT + dt * 2.5);
      const k = 1 - Math.pow(1 - this.deadT, 3);
      this.body.rotation.x = k * Math.PI / 2; this.body.position.y = k * 0.12; this.body.position.z = k * 0.95;
      this.gun.visible = false; this.label.visible = false;
      if (this.mixer) { this.play('Idle'); this.mixer.update(dt * (1 - k)); }
      return;
    }
    this.deadT = 0; this.body.rotation.x = 0; this.body.position.z = 0; this.gun.visible = true;
    this.label.visible = this.mate;
    this.crouchK += ((s.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    const ck = this.crouchK;

    if (!this.soldier) { this.body.position.y = -ck * 0.4; return; }

    // hareket animasyonu
    const sp = this.speed;
    if (sp < 0.4) this.play('Idle');
    else if (sp < 3.6 || ck > 0.5) { this.play('Walk'); this.actions.Walk.timeScale = THREE.MathUtils.clamp(sp / 1.7, 0.5, 1.8); }
    else { this.play('Run'); this.actions.Run.timeScale = THREE.MathUtils.clamp(sp / 5.4, 0.7, 1.3); }
    this.mixer.update(dt);
    // eğilme: gövdeyi indir, bacakları sıkıştır
    this.soldier.scale.y = this.soldier.scale.x * (1 - ck * 0.28);
    this.body.position.y = 0;
    this.root.updateMatrixWorld(true);

    // nişan çerçevesi (kök uzayında): göğüs yüksekliği, pitch ile dönen ileri yön
    const B = this.bones;
    const chestY = (PLAYER.eye - 0.32) - ck * 0.45;
    const pitch = THREE.MathUtils.clamp(s.pitch, -1.2, 1.2);
    this.gun.position.set(0.12, chestY - 0.01, -0.1);
    this.gun.rotation.set(pitch, 0, 0);
    this.gun.updateMatrixWorld(true);
    if (!B.rArm || !B.lArm) return;
    // omurga hafifçe pitch'e bükülür
    if (B.spine2) { rotateBoneWorld(B.spine2, new THREE.Quaternion().setFromAxisAngle(_v3.set(1, 0, 0).applyQuaternion(this.root.quaternion), pitch * 0.35)); }
    const gripR = this.gunModel.localToWorld(new THREE.Vector3(0.0, -0.03, 0.03));
    const gl = this.gunModel.userData.grip;
    const gripL = gl !== null && gl !== undefined ? this.gunModel.localToWorld(new THREE.Vector3(0, 0.0, gl)) : this.gunModel.localToWorld(new THREE.Vector3(-0.04, -0.04, 0.02));
    const right = _v1.set(1, 0, 0).applyQuaternion(this.root.quaternion);
    const down = new THREE.Vector3(0, -1, 0);
    const rShoulder = worldPos(B.rArm, new THREE.Vector3());
    const lShoulder = worldPos(B.lArm, new THREE.Vector3());
    twoBoneIK(B.rArm, B.rFore, B.rHand, gripR, rShoulder.clone().add(down).addScaledVector(right, 0.6));
    twoBoneIK(B.lArm, B.lFore, B.lHand, gripL, lShoulder.clone().add(down).addScaledVector(right, -0.6));
    // eller silah yönüne
    if (B.rHand) B.rHand.quaternion.slerp(B.rHand.quaternion, 1);
    // kafa nişana bakar
    if (B.head) rotateBoneWorld(B.head, new THREE.Quaternion().setFromAxisAngle(right, pitch * 0.4));
    this.label.position.y = 2.15 - ck * 0.45;
  }

  dispose() { this.disposed = true; this.scene.remove(this.root); }
}

export function eyeHeight(crouch) { return crouch ? PLAYER.crouchEye : PLAYER.eye; }
