// Oyuncu hareket fiziği (Quake/Source tarzı ivme + sürtünme)
import { PLAYER } from './constants.js';
import { moveAxis, groundHeight } from './map.js';

function accelerate(vel, wx, wz, wishSpeed, accel, dt) {
  const cur = vel.x * wx + vel.z * wz;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  const a = Math.min(accel * dt * wishSpeed, add);
  vel.x += wx * a; vel.z += wz * a;
}

// p: {pos, vel, onGround, crouch}, inp: {fwd, right, jump, crouch, walk, yaw, speedMul, frozen}
export function stepPlayer(p, inp, dt) {
  const P = PLAYER;
  p.crouch = !!inp.crouch;
  let maxSpeed = P.run * (inp.speedMul || 1);
  if (p.crouch) maxSpeed *= P.crouchMul; else if (inp.walk) maxSpeed *= P.walkMul;

  let fwd = inp.frozen ? 0 : inp.fwd, right = inp.frozen ? 0 : inp.right;
  const s = Math.sin(inp.yaw), c = Math.cos(inp.yaw);
  let wx = -s * fwd + c * right, wz = -c * fwd - s * right;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  if (p.onGround) {
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > 0) {
      const drop = Math.max(sp, P.stopSpeed) * P.friction * dt;
      const ns = Math.max(sp - drop, 0) / sp;
      p.vel.x *= ns; p.vel.z *= ns;
    }
    if (wl > 0) accelerate(p.vel, wx, wz, maxSpeed, P.accel, dt);
    if (inp.jump && !inp.frozen) { p.vel.y = P.jump; p.onGround = false; }
  } else if (wl > 0) {
    accelerate(p.vel, wx, wz, Math.min(maxSpeed, P.airCap), P.airAccel * 10, dt);
  }

  p.vel.y -= P.gravity * dt;
  if (moveAxis(p.pos, 'x', p.vel.x * dt)) p.vel.x = 0;
  if (moveAxis(p.pos, 'z', p.vel.z * dt)) p.vel.z = 0;

  const g = groundHeight(p.pos.x, p.pos.y, p.pos.z);
  const ny = p.pos.y + p.vel.y * dt;
  if (ny <= g && p.vel.y <= 0) {
    p.landed = !p.onGround && p.vel.y < -4;
    p.pos.y = g; p.vel.y = 0; p.onGround = true;
  } else {
    p.pos.y = ny; p.onGround = ny <= g + 0.001; p.landed = false;
  }
  return p;
}
