/* Third-person camera: over the shoulder on foot, further back and higher
   behind the car. It slides forward when a wall would swallow it. */

import * as THREE from '../vendor/three.module.min.js';
import { CAM, CITY } from './config.js';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'walk';
    this.yaw = 0;
    this.pitch = -0.13;
    this.zoom = 1;
    this.distance = CAM.walkDist;
    this.pos = new THREE.Vector3(0, 3, 8);
    this.look = new THREE.Vector3();
    this.pivot = new THREE.Vector3();
    this.obstacles = [];
    this.lookHold = 0;
    this.shake = 0;
    this._offset = new THREE.Vector3();
    this._want = new THREE.Vector3();
  }

  setMode(mode) {
    this.mode = mode;
    this.zoom = 1;
  }

  addShake(amount) {
    this.shake = Math.min(0.35, this.shake + amount);
  }

  update(dt, input, pivotPoint, carYaw = null) {
    const look = input.takeLook();
    const moving = Math.abs(look.x) + Math.abs(look.y) > 0.5;
    if (input.locked) {
      this.yaw -= look.x * CAM.sensitivity;
      this.pitch -= look.y * CAM.sensitivity;
    }
    if (moving) this.lookHold = 0.9;
    else this.lookHold = Math.max(0, this.lookHold - dt);

    // while driving the camera drifts back behind the car unless the player is looking around
    if (carYaw !== null && this.lookHold <= 0) {
      let delta = carYaw - this.yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.yaw += delta * Math.min(1, 2.4 * dt);
    }

    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.85, 0.24);

    const wheel = input.takeWheel();
    if (wheel !== 0) this.zoom = THREE.MathUtils.clamp(this.zoom + wheel * 0.12, 0.66, 1.9);

    const base = this.mode === 'drive' ? CAM.carDist : CAM.walkDist;
    const lift = this.mode === 'drive' ? CAM.carLift : CAM.walkLift;
    const pivotY = this.mode === 'drive' ? CAM.carPivot : CAM.walkPivot;
    const targetDist = THREE.MathUtils.clamp(base * this.zoom, CAM.minDist, CAM.maxDist);

    this.distance += (targetDist - this.distance) * Math.min(1, 6 * dt);
    this.pivot.copy(pivotPoint);
    this.pivot.y += pivotY;
    this.look.copy(this.pivot);

    const cosP = Math.cos(this.pitch);
    this._offset.set(
      Math.sin(this.yaw) * cosP,
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * cosP,
    ).multiplyScalar(this.distance);
    this._want.copy(this.pivot).add(this._offset);
    this._want.y += lift;

    // pull in when a building sits between the pivot and the ideal spot
    const blocked = this.blockedDistance(this.pivot, this._want);
    if (blocked < this.distance) {
      const t = Math.max(0.28, blocked / this.distance);
      this._want.copy(this.pivot).addScaledVector(this._offset, t);
      this._want.y += lift * t;
    }

    const k = 1 - Math.exp(-CAM.smoothing * dt);
    this.pos.lerp(this._want, k);
    if (this.shake > 0.001) {
      this.pos.x += (Math.random() - 0.5) * this.shake;
      this.pos.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.max(0, 1 - dt * 6);
    }
    this.camera.position.copy(this.pos);

    const ahead = this.mode === 'drive' ? CAM.lookAhead : 2.2;
    this.look.x -= Math.sin(this.yaw) * ahead;
    this.look.z -= Math.cos(this.yaw) * ahead;
    this.camera.lookAt(this.look);
    this.camera.rotation.z += this._roll || 0;
  }

  blockedDistance(from, to) {
    if (!this.obstacles.length) return from.distanceTo(to);
    const steps = 8;
    const p = new THREE.Vector3();
    for (let s = 1; s <= steps; s++) {
      p.lerpVectors(from, to, s / steps);
      if (p.y < 0.35) continue;
      for (const box of this.obstacles) {
        if (p.y > box.top + 0.4) continue;
        if (p.x > box.minX && p.x < box.maxX && p.z > box.minZ && p.z < box.maxZ) {
          return (s - 1) / steps * from.distanceTo(to);
        }
      }
    }
    return from.distanceTo(to);
  }

  /** Used by the deterministic screenshot staging. */
  place(eye, target, fov = null) {
    this.camera.position.copy(eye);
    this.camera.lookAt(target);
    if (fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.pos.copy(eye);
    this.look.copy(target);
  }

  /** Keep the shot camera away from the far plane edges of the map. */
  clampInside() {
    const lim = CITY.half + CITY.promenade - 2;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
  }
}
