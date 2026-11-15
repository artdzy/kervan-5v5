// Yağmur: GPU'da hareket eden çizgi damlalar (kameranın etrafında sarmalanan kutu),
// zemine çarpma sıçramaları, çatı altı maskesi ve ara sıra şimşek.
import * as THREE from 'three';

const MAX_ROOFS = 4;

export class Rain {
  constructor(scene, { count = 9000, splashes = 700, roofs = [] } = {}) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const roofU = [], roofH = [];
    for (let i = 0; i < MAX_ROOFS; i++) {
      const r = roofs[i];
      roofU.push(r ? new THREE.Vector4(r[0], r[1], r[2], r[3]) : new THREE.Vector4(1e6, 1e6, 1e6, 1e6));
      roofH.push(r ? r[4] : -1e6);
    }
    this.uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(36, 22, 36) },
      uVel: { value: new THREE.Vector3(1.6, -13, 0.9) }, uRoof: { value: roofU }, uRoofH: { value: roofH },
      uLight: { value: new THREE.Color(0.55, 0.6, 0.66) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
      uAmount: { value: 1 }, uFlash: { value: 0 },
    };
    // ---- çizgi damlalar
    const base = new THREE.InstancedBufferGeometry();
    base.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = Math.random(); }
    base.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    base.instanceCount = count;
    this.maxCount = count;
    const roofGLSL = `
      uniform vec4 uRoof[${MAX_ROOFS}]; uniform float uRoofH[${MAX_ROOFS}];
      bool underRoof(vec3 p){ for (int i = 0; i < ${MAX_ROOFS}; i++) { if (p.x > uRoof[i].x && p.x < uRoof[i].z && p.z > uRoof[i].y && p.z < uRoof[i].w && p.y < uRoof[i].x * 0.0 + uRoofH[i]) return true; } return false; }`;
    const streakMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec4 aSeed;
        uniform float uTime, uAmount; uniform vec3 uCam, uBox, uVel;
        uniform vec3 uSunDir;
        varying float vA; varying vec2 vQ; varying float vBack;
        ${roofGLSL}
        void main(){
          float sp = 0.8 + 0.4 * aSeed.w;
          vec3 vel = uVel * sp;
          vec3 o = uCam - uBox * 0.5;
          vec3 p = mod(aSeed.xyz * uBox + vel * uTime - o, uBox) + o;
          float kill = (aSeed.w > uAmount || underRoof(p) || p.y < 0.0) ? 1.0 : 0.0;
          vec3 dir = normalize(vel);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, toCam));
          float len = 0.55 + 0.35 * aSeed.y;
          vec3 wp = p + side * position.x * 0.012 + dir * (position.y - 0.5) * len;
          vBack = pow(max(dot(normalize(p - cameraPosition), uSunDir), 0.0), 6.0);
          vQ = position.xy; vA = (1.0 - kill) * (0.6 + 0.4 * aSeed.z) * smoothstep(0.0, 3.0, distance(p, cameraPosition));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          if (kill > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLight, uSunCol; uniform float uFlash;
        varying float vA; varying vec2 vQ; varying float vBack;
        void main(){
          float a = (1.0 - abs(vQ.x) * 2.0) * smoothstep(0.0, 0.2, vQ.y) * smoothstep(1.0, 0.6, vQ.y) * vA * (0.3 + vBack * 0.5);
          gl_FragColor = vec4(uLight * (1.0 + uFlash * 6.0) + uSunCol * vBack * 3.0, a);
        }`,
    });
    this.streaks = new THREE.Mesh(base, streakMat);
    this.streaks.frustumCulled = false; this.streaks.renderOrder = 5;
    this.group.add(this.streaks);

    // ---- sıçramalar (yere yatık halka + küçük taç)
    const sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    const ss = new Float32Array(splashes * 4);
    for (let i = 0; i < splashes; i++) { ss[i * 4] = Math.random(); ss[i * 4 + 1] = Math.random(); ss[i * 4 + 2] = Math.random(); ss[i * 4 + 3] = Math.random(); }
    sg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(ss, 4));
    sg.instanceCount = splashes;
    const splashMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec4 aSeed;
        uniform float uTime, uAmount; uniform vec3 uCam;
        varying float vL; varying vec2 vQ; varying float vK;
        ${roofGLSL}
        float h1(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          float rate = 1.6 + aSeed.w;
          float cyc = uTime * rate + aSeed.z * 10.0;
          float n = floor(cyc); float life = fract(cyc);
          vec2 rnd = vec2(h1(n * 12.9 + aSeed.x * 91.7), h1(n * 78.2 + aSeed.y * 37.1)) - 0.5;
          vec3 p = vec3(uCam.x + rnd.x * 30.0, 0.012, uCam.z + rnd.y * 30.0);
          vK = (aSeed.w > uAmount || underRoof(p + vec3(0.0, 0.5, 0.0))) ? 0.0 : 1.0;
          float s = 0.04 + life * 0.16;
          vec3 wp = p + vec3(position.x * s, 0.0, position.z * s);
          vL = life; vQ = position.xz;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          if (vK < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLight;
        varying float vL; varying vec2 vQ; varying float vK;
        void main(){
          float d = length(vQ);
          float ring = exp(-pow((d - 0.75) * 7.0, 2.0)) + 0.6 * exp(-d * d * 8.0) * (1.0 - vL);
          float a = ring * (1.0 - vL) * (1.0 - vL) * 0.35 * vK;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uLight * 1.3, a);
        }`,
    });
    this.splash = new THREE.Mesh(sg, splashMat);
    this.splash.frustumCulled = false; this.splash.renderOrder = 4;
    this.group.add(this.splash);

    this.flash = 0; this.nextBolt = 8 + Math.random() * 14; this.onThunder = null;
  }

  setAmount(a) { this.uniforms.uAmount.value = a; this.group.visible = a > 0.001; }

  update(dt, camera, atm, sunDir) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uCam.value.setFromMatrixPosition(camera.matrixWorld);
    if (atm) {
      u.uLight.value.copy(atm.rainColor || atm.ambient).multiplyScalar(0.9);
      u.uSunCol.value.copy(atm.sunColor);
    }
    if (sunDir) u.uSunDir.value.copy(sunDir);
    // şimşek: kısa çift parlama, birkaç saniye sonra gök gürültüsü
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.nextBolt = 14 + Math.random() * 26;
      this.boltT = 0; this.boltPow = 0.6 + Math.random() * 0.8;
      if (this.onThunder) setTimeout(() => this.onThunder(this.boltPow), 900 + Math.random() * 2500);
    }
    if (this.boltT !== undefined) {
      this.boltT += dt;
      const t = this.boltT;
      this.flash = this.boltPow * (Math.exp(-Math.pow((t - 0.05) * 30, 2)) + 0.7 * Math.exp(-Math.pow((t - 0.22) * 22, 2)) + 0.3 * Math.exp(-Math.pow((t - 0.4) * 18, 2)));
      if (t > 1) { this.boltT = undefined; this.flash = 0; }
    }
    u.uFlash.value = this.flash;
  }

  dispose() { this.group.parent?.remove(this.group); this.streaks.geometry.dispose(); this.splash.geometry.dispose(); }
}
