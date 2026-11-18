/* The walker: a capsule with arms and legs, gravity, kerbs it can step up,
   and walls it cannot. Mouse look arrives through the camera's yaw. */

import * as THREE from '../vendor/three.module.min.js';
import { CITY, WALK } from './config.js';

const SKIN = 0xc08a63;

function limb(w, h, d, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'walker';
    scene.add(this.group);

    this.velocity = new THREE.Vector3();
    this.feet = this.group.position;
    this.onGround = true;
    this.facing = 0;
    this.phase = 0;
    this.speed = 0;
    this.lean = 0;
    this._wish = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();

    this._build();

    // body parts hang off a rig so the walk bob never moves the collision feet
    this.rig = new THREE.Group();
    while (this.group.children.length) this.rig.add(this.group.children[0]);
    this.group.add(this.rig);
  }

  _build() {
    const jacket = 0x2c6a68;
    const trousers = 0x27313d;

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.27, 0.42, 4, 10),
      new THREE.MeshStandardMaterial({ color: jacket, roughness: 0.78 }),
    );
    torso.position.y = 1.22;
    torso.castShadow = true;
    this.group.add(torso);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.24, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0x1d4a49, roughness: 0.8 }),
    );
    collar.position.y = 1.51;
    this.group.add(collar);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 14, 12),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.68 }),
    );
    head.position.y = 1.65;
    head.castShadow = true;
    this.group.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.175, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0x241b17, roughness: 0.9 }),
    );
    hair.position.set(0, 1.68, -0.01);
    this.group.add(hair);

    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.62, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x3b3128, roughness: 0.9 }),
    );
    strap.position.set(0.1, 1.2, 0.25);
    strap.rotation.z = -0.28;
    this.group.add(strap);

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]]) {
      arm.position.set(side * 0.33, 1.42, 0);
      const upper = limb(0.12, 0.56, 0.14, jacket);
      upper.position.y = -0.28;
      arm.add(upper);
      const hand = limb(0.11, 0.14, 0.13, SKIN);
      hand.position.y = -0.62;
      arm.add(hand);
      arm.children.forEach((c) => { c.castShadow = true; });
      this.group.add(arm);
    }

    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]]) {
      leg.position.set(side * 0.13, 0.9, 0);
      const shin = limb(0.16, 0.8, 0.17, trousers);
      shin.position.y = -0.4;
      leg.add(shin);
      const shoe = limb(0.17, 0.12, 0.28, 0x1a1a1d);
      shoe.position.set(0, -0.82, 0.04);
      leg.add(shoe);
      leg.children.forEach((c) => { c.castShadow = true; });
      this.group.add(leg);
    }

    this.group.position.set(0, 0, 38);
  }

  get position() {
    return this.group.position;
  }

  teleport(x, z, facing = 0) {
    this.group.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.group.rotation.y = facing;
  }

  setVisible(v) {
    this.group.visible = v;
  }

  /**
   * axes: { x, y, run } from the keyboard; camYaw aims the walk.
   * jump: true on the frame the key went down.
   */
  update(dt, axes, camYaw, jump, colliders, groundAt) {
    const speedTarget = axes.run ? WALK.run : WALK.speed;
    this._fwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    this._right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    this._wish.set(0, 0, 0)
      .addScaledVector(this._fwd, axes.y)
      .addScaledVector(this._right, axes.x);
    if (this._wish.lengthSq() > 1) this._wish.normalize();

    const control = this.onGround ? 1 : 0.34;
    const pull = Math.min(1, WALK.accel * control * dt / Math.max(0.6, speedTarget));
    const wantX = this._wish.x * speedTarget;
    const wantZ = this._wish.z * speedTarget;
    this.velocity.x += (wantX - this.velocity.x) * pull;
    this.velocity.z += (wantZ - this.velocity.z) * pull;

    if (this.onGround && this._wish.lengthSq() < 0.01) {
      const damp = Math.exp(-WALK.damping * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    if (jump && this.onGround) {
      this.velocity.y = WALK.jump;
      this.onGround = false;
    }
    this.velocity.y -= WALK.gravity * dt;

    const beforeY = this.group.position.y;
    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;
    this.group.position.y += this.velocity.y * dt;

    // kerbs: snap up small rises so walking off the road feels natural
    const floor = groundAt(this.group.position.x, this.group.position.z);
    if (this.onGround && floor > beforeY + 0.01 && floor - beforeY <= WALK.stepUp) {
      this.group.position.y = floor;
      this.velocity.y = 0;
    }
    if (this.group.position.y <= floor) {
      this.group.position.y = floor;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.group.position.y > floor + 0.02) {
      this.onGround = false;
    }

    this._resolve(colliders);

    const limit = CITY.half + CITY.promenade - 1.6;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -limit, limit);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -limit, limit);

    // face the way we are moving
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = planar;
    if (planar > 0.4) {
      const want = Math.atan2(-this.velocity.x, -this.velocity.z);
      let delta = want - this.facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.facing += delta * Math.min(1, 12 * dt);
    }
    this.group.rotation.y = this.facing;

    this._animate(dt, planar);
  }

  _resolve(colliders) {
    const r = WALK.radius;
    const feetY = this.group.position.y;
    for (const b of colliders) {
      if (b.top !== undefined && b.top < feetY + 0.28) continue;
      const cx = THREE.MathUtils.clamp(this.group.position.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(this.group.position.z, b.minZ, b.maxZ);
      let dx = this.group.position.x - cx;
      let dz = this.group.position.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 0.000001) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        this.group.position.x += dx * push;
        this.group.position.z += dz * push;
        const nx = dx / d;
        const nz = dz / d;
        const into = this.velocity.x * nx + this.velocity.z * nz;
        if (into < 0) {
          this.velocity.x -= nx * into;
          this.velocity.z -= nz * into;
        }
      } else {
        // dead centre: shove out along the shallower axis
        const left = Math.abs(this.group.position.x - b.minX);
        const right = Math.abs(b.maxX - this.group.position.x);
        const back = Math.abs(this.group.position.z - b.minZ);
        const front = Math.abs(b.maxZ - this.group.position.z);
        const m = Math.min(left, right, back, front);
        if (m === left) this.group.position.x = b.minX - r;
        else if (m === right) this.group.position.x = b.maxX + r;
        else if (m === back) this.group.position.z = b.minZ - r;
        else this.group.position.z = b.maxZ + r;
      }
    }
  }

  _animate(dt, planar) {
    const moving = planar > 0.3;
    this.phase += dt * (2.4 + planar * 1.9);
    const amp = Math.min(0.85, planar * 0.16);
    const swing = moving ? Math.sin(this.phase) * amp : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.75;
    this.armR.rotation.x = swing * 0.75;
    this.lean += ((moving ? 0.06 : 0) - this.lean) * Math.min(1, 8 * dt);
    this.rig.rotation.x = this.lean;
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.045 : Math.sin(this.phase * 0.5) * 0.008;
    this.rig.position.y = bob;
    this.armL.position.y = 1.42 + bob * 0.3;
    this.armR.position.y = 1.42 + bob * 0.3;
  }
}
