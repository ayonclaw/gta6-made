/* The pistol. A hitscan shot from the eye down the crosshair, a tracer that
   lives for a heartbeat, sparks where it lands, a twelve-round magazine with
   a reload, and the walker's health. Nothing here knows who it hit; main
   passes callbacks for the crowd, the law and the traffic. */

import * as THREE from '../vendor/three.module.min.js';

const MAG = 12;

function slab(origin, dir, box) {
  let tmin = 0;
  let tmax = 160;
  for (const axis of ['x', 'y', 'z']) {
    const lo = axis === 'x' ? box.minX : axis === 'y' ? (box.minY ?? 0) : box.minZ;
    const hi = axis === 'x' ? box.maxX : axis === 'y' ? (box.maxY ?? box.top ?? 30) : box.maxZ;
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 0.00001) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) return null;
  }
  return tmin > 0.4 ? tmin : null;
}

export class Combat {
  constructor(scene, camera, options = {}) {
    this.camera = camera;
    this.scene = scene;
    this.low = Boolean(options.low);

    this.health = 100;
    this.magazine = MAG;
    this.reserve = 84;
    this.shots = 0;
    this.hits = 0;
    this.cooldown = 0;
    this.reloading = 0;
    this.kick = 0;
    this.dead = false;

    this.onDeath = null;
    this.onShoot = null;
    this.onDamage = null;
    this.onHitPed = null;
    this.onHitPolice = null;
    this.onHitCar = null;
    this.onKick = null;

    this.tracers = [];
    this.tracerLife = [];
    this._buildWeapon();
    this._buildTracers();
    this._buildSparks();
  }

  _buildWeapon() {
    this.weapon = new THREE.Group();
    this.weapon.name = 'pistol';
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.6 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x3a2b22, roughness: 0.85 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.3), steel);
    slide.position.set(0, 0, -0.06);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.1), steel);
    barrel.position.set(0, -0.01, -0.24);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.16, 0.075), grip);
    handle.position.set(0, -0.1, 0.06);
    handle.rotation.x = -0.2;
    this.weapon.add(slide, barrel, handle);
    this.weapon.position.set(0.23, -0.21, -0.5);
    this.weapon.rotation.set(0.02, 0.06, 0);
    this.weapon.visible = false;
    this.camera.add(this.weapon);
    if (!this.camera.parent) this.scene.add(this.camera);
  }

  _buildTracers() {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 1);
    geo.translate(0, 0, -0.5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd79a, transparent: true, opacity: 0.85, depthWrite: false, fog: false,
    });
    this.tracerMesh = new THREE.InstancedMesh(geo, mat, 10);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.frustumCulled = false;
    this.scene.add(this.tracerMesh);
    const hidden = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -50, 0), new THREE.Quaternion(), new THREE.Vector3(0.001, 0.001, 0.001),
    );
    for (let i = 0; i < 10; i++) {
      this.tracerMesh.setMatrixAt(i, hidden);
      this.tracers.push({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, life: 0 });
    }
  }

  _buildSparks() {
    this.sparkCount = this.low ? 48 : 96;
    this.sparkPos = new Float32Array(this.sparkCount * 3);
    this.sparkVel = new Float32Array(this.sparkCount * 3);
    this.sparkLife = new Float32Array(this.sparkCount);
    for (let i = 0; i < this.sparkCount; i++) this.sparkPos[i * 3 + 1] = -80;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffc47a,
      size: 0.14,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.sparks = new THREE.Points(geo, mat);
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.sparkCursor = 0;
  }

  _burst(point, normal) {
    for (let n = 0; n < 7; n++) {
      const i = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % this.sparkCount;
      this.sparkPos[i * 3] = point.x;
      this.sparkPos[i * 3 + 1] = point.y;
      this.sparkPos[i * 3 + 2] = point.z;
      this.sparkVel[i * 3] = normal.x * 2.4 + (Math.random() - 0.5) * 4;
      this.sparkVel[i * 3 + 1] = normal.y * 2.4 + Math.random() * 4.2;
      this.sparkVel[i * 3 + 2] = normal.z * 2.4 + (Math.random() - 0.5) * 4;
      this.sparkLife[i] = 0.3 + Math.random() * 0.28;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }

  _tracer(from, to) {
    let slot = -1;
    let oldest = Infinity;
    for (let i = 0; i < this.tracers.length; i++) {
      if (this.tracers[i].life <= 0) { slot = i; break; }
      if (this.tracers[i].life < oldest) { oldest = this.tracers[i].life; slot = i; }
    }
    const t = this.tracers[slot];
    t.ax = from.x; t.ay = from.y; t.az = from.z;
    t.bx = to.x; t.by = to.y; t.bz = to.z;
    t.life = 0.09;
  }

  get reloadingNow() {
    return this.reloading > 0;
  }

  get ammo() {
    return this.magazine;
  }

  startReload() {
    if (this.reloading > 0 || this.magazine >= MAG || this.reserve <= 0) return false;
    this.reloading = 1.45;
    if (this.onReload) this.onReload();
    return true;
  }

  damage(amount, from) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.onDamage) this.onDamage(this.health, from);
    if (this.health <= 0) {
      this.dead = true;
      if (this.onDeath) this.onDeath();
    }
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
    this.dead = false;
  }

  /** One trigger pull. Returns true when a round actually left the barrel. */
  fire(ctx) {
    if (this.dead || this.cooldown > 0 || this.reloading > 0) return false;
    if (this.magazine <= 0) {
      this.startReload();
      return false;
    }
    this.magazine--;
    this.shots++;
    this.cooldown = 0.26;
    this.kick = 0.055;

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());

    let best = { t: 150, kind: 'air', point: null };
    if (ctx.colliders) {
      for (const box of ctx.colliders) {
        if (box.top !== undefined && box.top < 0.8) continue;
        const t = slab(origin, dir, box);
        if (t !== null && t < best.t) {
          best = {
            t,
            kind: 'wall',
            point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
          };
        }
      }
    }
    if (ctx.peds) {
      const hit = ctx.peds.raycast(origin, dir, best.t);
      if (hit) {
        best = {
          t: hit.t,
          kind: 'ped',
          target: hit.person,
          point: { x: origin.x + dir.x * hit.t, y: origin.y + dir.y * hit.t, z: origin.z + dir.z * hit.t },
        };
      }
    }
    if (ctx.police) {
      const hit = ctx.police.raycast(origin, dir, best.t);
      if (hit) {
        best = {
          t: hit.t,
          kind: 'police',
          target: hit.unit,
          point: { x: origin.x + dir.x * hit.t, y: origin.y + dir.y * hit.t, z: origin.z + dir.z * hit.t },
        };
      }
    }
    if (ctx.traffic) {
      for (const car of ctx.traffic.cars) {
        if (!car.alive) continue;
        const ox = car.x - origin.x;
        const oz = car.z - origin.z;
        const oy = 0.9 - origin.y;
        const t = ox * dir.x + oy * dir.y + oz * dir.z;
        if (t < 0.5 || t > best.t) continue;
        const px = ox - dir.x * t;
        const pz = oz - dir.z * t;
        if (px * px + pz * pz < 2.1 * 2.1) {
          best = {
            t,
            kind: 'car',
            target: car,
            point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
          };
        }
      }
    }

    const point = best.point || { x: origin.x + dir.x * 60, y: origin.y + dir.y * 60, z: origin.z + dir.z * 60 };
    this._tracer(origin, point);
    const normal = { x: -dir.x, y: -dir.y, z: -dir.z };
    this._burst(point, normal);

    if (best.kind === 'ped' && this.onHitPed) this.onHitPed(best.target, point);
    else if (best.kind === 'police' && this.onHitPolice) this.onHitPolice(best.target, point);
    else if (best.kind === 'car' && this.onHitCar) this.onHitCar(best.target, point);
    if (this.onShoot) this.onShoot(point, best.kind);
    return true;
  }

  update(dt, ctx) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.kick *= Math.max(0, 1 - dt * 9);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = MAG - this.magazine;
        const take = Math.min(need, this.reserve);
        this.magazine += take;
        this.reserve -= take;
      }
    }

    if (ctx.active) {
      if (ctx.trigger) this.fire(ctx);
      if (ctx.reload) this.startReload();
    }

    this.weapon.visible = Boolean(ctx.active) && !this.dead;
    if (this.weapon.visible) {
      const sway = Math.sin(ctx.time * 1.7) * 0.004;
      this.weapon.position.set(0.23 + sway, -0.21 + Math.abs(Math.cos(ctx.time * 1.7)) * 0.004 - this.kick, -0.5 + this.kick * 1.4);
      this.weapon.rotation.x = 0.02 + this.kick * 5;
      if (this.onKick && this.kick > 0.02) this.onKick(this.kick * 0.5);
    }

    // tracers fade by shrinking
    let moved = false;
    for (let i = 0; i < this.tracers.length; i++) {
      const t = this.tracers[i];
      if (t.life > 0) {
        t.life -= dt;
        const a = new THREE.Vector3(t.ax, t.ay, t.az);
        const b = new THREE.Vector3(t.bx, t.by, t.bz);
        const len = a.distanceTo(b) || 0.01;
        const mid = a.clone().lerp(b, 0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize(),
        );
        const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, len * Math.max(0.15, t.life / 0.09)));
        this.tracerMesh.setMatrixAt(i, m);
      } else {
        this.tracerMesh.setMatrixAt(i, new THREE.Matrix4().compose(
          new THREE.Vector3(0, -50, 0), new THREE.Quaternion(), new THREE.Vector3(0.001, 0.001, 0.001),
        ));
      }
      moved = true;
    }
    if (moved) this.tracerMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.sparkCount; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      this.sparkVel[i * 3 + 1] -= 13 * dt;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -80;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }
}
