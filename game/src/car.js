/* One car — the Corvina 88. A bicycle model for steering, a box for a body,
   and enough weight that it does not feel like a shopping trolley. */

import * as THREE from '../vendor/three.module.min.js';
import { CITY, DRIVE } from './config.js';

export class Car {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'corvina';
    scene.add(this.group);

    this.shell = new THREE.Group();
    this.group.add(this.shell);

    this.speed = 0;
    this.steer = 0;
    this.yaw = 0;
    this.throttleSmooth = 0;
    this.wheelSpin = 0;
    this.braking = false;
    this.occupied = false;

    this._build();
  }

  _build() {
    const paint = new THREE.MeshStandardMaterial({ color: 0x9c3f37, metalness: 0.45, roughness: 0.36 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x191b1e, roughness: 0.72, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x16252b, roughness: 0.12, metalness: 0.7 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xbfc4c4, metalness: 0.9, roughness: 0.25 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.52, 4.24), paint);
    chassis.position.y = 0.68;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 4.1), dark);
    skirt.position.y = 0.42;
    const bonnet = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 1.0), paint);
    bonnet.position.set(0, 0.97, -1.4);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.8), paint);
    boot.position.set(0, 0.97, 1.55);

    this.glass = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.46, 1.86), glass);
    this.glass.position.set(0, 1.14, 0.1);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.1, 1.7), paint);
    roof.position.set(0, 1.4, 0.12);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.1), dark);
        pillar.position.set(sx * 0.77, 1.14, 0.12 + sz * 0.86);
        this.shell.add(pillar);
      }
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), dark);
      mirror.position.set(sx * 0.98, 1.18, -0.62);
      this.shell.add(mirror);
    }

    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.28, 0.26), dark);
    bumperF.position.set(0, 0.5, -2.16);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.28, 0.26), dark);
    bumperR.position.set(0, 0.5, 2.16);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.18, 0.06), chrome);
    grille.position.set(0, 0.7, -2.19);

    this.headMat = new THREE.MeshStandardMaterial({
      color: 0xfff6dc,
      emissive: 0xffe9b8,
      emissiveIntensity: 1.1,
      roughness: 0.3,
    });
    this.tailMat = new THREE.MeshStandardMaterial({
      color: 0x661414,
      emissive: 0xff2a1c,
      emissiveIntensity: 0.7,
      roughness: 0.5,
    });
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.08), this.headMat);
      lamp.position.set(sx * 0.6, 0.76, -2.2);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.07), this.tailMat);
      tail.position.set(sx * 0.6, 0.78, 2.22);
      this.shell.add(lamp, tail);
    }

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.16, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d6, roughness: 0.7 }),
    );
    plate.position.set(0, 0.5, -2.3);

    this.shell.add(chassis, skirt, bonnet, boot, this.glass, roof, bumperF, bumperR, grille, plate);
    this.shell.children.forEach((c) => {
      c.castShadow = true;
      c.receiveShadow = true;
    });

    const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14);
    tyreGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.28, 10);
    hubGeo.rotateZ(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9bdbd, metalness: 0.85, roughness: 0.3 });

    this.wheels = [];
    this.frontPivots = [];
    const positions = [
      [-0.88, -1.35, true],
      [0.88, -1.35, true],
      [-0.88, 1.4, false],
      [0.88, 1.4, false],
    ];
    for (const [x, z, front] of positions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.36, z);
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.position.x = x > 0 ? 0.02 : -0.02;
      const spinGroup = new THREE.Group();
      spinGroup.add(tyre, hub);
      pivot.add(spinGroup);
      this.group.add(pivot);
      this.wheels.push(spinGroup);
      if (front) this.frontPivots.push(pivot);
    }

    this.group.position.set(7, 0, 29);
    this.group.rotation.y = -Math.PI / 2;
    this.yaw = this.group.rotation.y;
  }

  get position() {
    return this.group.position;
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  place(x, z, yaw) {
    this.group.position.set(x, 0, z);
    this.yaw = yaw;
    this.group.rotation.y = yaw;
    this.speed = 0;
    this.steer = 0;
  }

  setVisible(v) {
    this.group.visible = v;
  }

  /**
   * controls: { throttle 0..1, brake 0..1, steer -1..1 (1 is left) }
   */
  update(dt, controls, colliders, groundAt) {
    const throttle = controls.throttle || 0;
    const brake = controls.brake || 0;
    const steerIn = controls.steer || 0;

    const grip = 1 / (1 + Math.abs(this.speed) * 0.05);
    const steerTarget = steerIn * DRIVE.steerMax * grip;
    const steerStep = DRIVE.steerRate * dt;
    this.steer += THREE.MathUtils.clamp(steerTarget - this.steer, -steerStep, steerStep);

    this.braking = false;
    if (throttle > 0) {
      if (this.speed < -0.3) {
        this.speed += DRIVE.brake * dt;
        this.braking = true;
      } else {
        const taper = 1 - Math.min(1, Math.max(0, this.speed) / DRIVE.maxSpeed);
        this.speed += DRIVE.accel * throttle * taper * dt;
      }
    } else if (brake > 0) {
      if (this.speed > 0.4) {
        this.speed -= DRIVE.brake * dt;
        this.braking = true;
      } else {
        this.speed -= DRIVE.reverseAccel * dt;
      }
    } else {
      const rolling = (DRIVE.roll + Math.abs(this.speed) * DRIVE.drag) * dt;
      if (Math.abs(this.speed) <= rolling) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * rolling;
    }

    if (this.speed > DRIVE.maxSpeed) this.speed = DRIVE.maxSpeed;
    if (this.speed < -DRIVE.maxReverse) this.speed = -DRIVE.maxReverse;

    const yawRate = (this.speed / DRIVE.wheelbase) * Math.tan(this.steer);
    this.yaw += yawRate * dt;

    const nx = this.group.position.x - Math.sin(this.yaw) * this.speed * dt;
    const nz = this.group.position.z - Math.cos(this.yaw) * this.speed * dt;

    if (this.hits(nx, nz, colliders)) {
      this.speed *= -0.16;
      this.steer *= 0.5;
    } else {
      this.group.position.x = nx;
      this.group.position.z = nz;
    }

    const limit = CITY.half + CITY.promenade - 4;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -limit, limit);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -limit, limit);
    this.group.position.y = groundAt(this.group.position.x, this.group.position.z);
    this.group.rotation.y = this.yaw;

    // body roll and squat
    const roll = THREE.MathUtils.clamp(-this.steer * this.speed * 0.012, -0.07, 0.07);
    this.shell.rotation.z += (roll - this.shell.rotation.z) * Math.min(1, 6 * dt);
    const squat = THREE.MathUtils.clamp(-(throttle - brake) * 0.012, -0.02, 0.02);
    this.shell.rotation.x += (squat - this.shell.rotation.x) * Math.min(1, 5 * dt);

    this.wheelSpin += (this.speed / 0.36) * dt;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const p of this.frontPivots) p.rotation.y = this.steer;

    this.tailMat.emissiveIntensity = this.braking ? 2.4 : 0.55;
  }

  hits(x, z, colliders) {
    const r = DRIVE.radius;
    for (const b of colliders) {
      if (b.top !== undefined && b.top < 0.5) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** Metres per second, absolute — the HUD wants a readable number. */
  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }
}
