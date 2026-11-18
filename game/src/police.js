/* The heat. Five stars, a heat meter behind them, and cruisers that come off
   the nearest junction when the meter is up. They drive straight at you, ram
   when close, shoot when you are on foot, and give up when you have been out
   of their sight long enough for the meter to run down. */

import * as THREE from '../vendor/three.module.min.js';
import { CITY } from './config.js';

const HALF = CITY.half;
const PITCH = CITY.pitch;
const STREET = CITY.street;
const streetAt = (k) => -HALF + k * PITCH + STREET / 2;

function segmentHitsBox(ax, az, bx, bz, box) {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const axis = (p, d, lo, hi) => {
    if (Math.abs(d) < 0.0001) return p >= lo && p <= hi;
    let a = (lo - p) / d;
    let b = (hi - p) / d;
    if (a > b) { const s = a; a = b; b = s; }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  if (!axis(ax, dx, box.minX, box.maxX)) return false;
  if (!axis(az, dz, box.minZ, box.maxZ)) return false;
  return t1 >= 0.02 && t0 <= 0.98;
}

export class Police {
  constructor(scene, rng, options = {}) {
    this.rng = rng;
    this.stars = 0;
    this.heat = 0;
    this.units = [];
    this.maxUnits = 6;
    this.group = new THREE.Group();
    this.group.name = 'police';
    scene.add(this.group);

    this.onShot = null;
    this.onCrash = null;
    this.spawnTimer = 0;
    this.lostFor = 0;
    this.flash = 0;
    this.clock = 0;

    this._build();
  }

  _build() {
    const bodyGeo = new THREE.BoxGeometry(1.92, 0.74, 4.3);
    bodyGeo.translate(0, 0.76, 0);
    const doorGeo = new THREE.BoxGeometry(1.99, 0.44, 1.92);
    doorGeo.translate(0, 0.66, 0.12);
    const cabinGeo = new THREE.BoxGeometry(1.7, 0.58, 2.05);
    cabinGeo.translate(0, 1.36, 0.16);
    const barGeo = new THREE.BoxGeometry(0.52, 0.19, 0.42);
    barGeo.translate(0, 1.76, 0.12);

    // a pale shell with black doors and a split red/blue bar: readable as law
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe4e1d6, roughness: 0.46, metalness: 0.28 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x181d21, roughness: 0.5, metalness: 0.3 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x121619, roughness: 0.16, metalness: 0.6 });
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.body = new THREE.InstancedMesh(bodyGeo, bodyMat, this.maxUnits);
    this.door = new THREE.InstancedMesh(doorGeo, doorMat, this.maxUnits);
    this.cabin = new THREE.InstancedMesh(cabinGeo, cabinMat, this.maxUnits);
    this.bar = new THREE.InstancedMesh(barGeo, barMat, this.maxUnits * 2);
    for (const mesh of [this.body, this.door, this.cabin, this.bar]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      this.group.add(mesh);
    }
    this.bar.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxUnits * 2 * 3), 3);
    this.red = new THREE.Color(0xff2c24);
    this.blue = new THREE.Color(0x2f6cff);
    this.offTone = new THREE.Color(0x14181a);
    this._clear();
  }

  _clear() {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -8, 0), new THREE.Quaternion(), new THREE.Vector3(0.001, 0.001, 0.001),
    );
    for (let i = 0; i < this.maxUnits; i++) {
      this.body.setMatrixAt(i, matrix);
      this.door.setMatrixAt(i, matrix);
      this.cabin.setMatrixAt(i, matrix);
      this.bar.setMatrixAt(i * 2, matrix);
      this.bar.setMatrixAt(i * 2 + 1, matrix);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.door.instanceMatrix.needsUpdate = true;
    this.cabin.instanceMatrix.needsUpdate = true;
    this.bar.instanceMatrix.needsUpdate = true;
  }

  /* --- escalation ----------------------------------------------------- */

  /** Add wanted level. Anything the law can see counts. */
  crime(levels = 1, reason = '') {
    this.stars = Math.min(5, this.stars + levels);
    this.heat = Math.max(this.heat, this.stars * 21);
    this.lostFor = 0;
    if (this.stars > 0) this.spawnTimer = Math.min(this.spawnTimer, 0.4);
    return { stars: this.stars, reason };
  }

  clear() {
    this.stars = 0;
    this.heat = 0;
    this.units.length = 0;
    this._clear();
  }

  /** Staging hook: a fixed number of units, no decay. */
  stage(stars, spots) {
    this.stars = THREE.MathUtils.clamp(stars, 0, 5);
    this.heat = this.stars * 21;
    this.units.length = 0;
    for (let i = 0; i < Math.min(spots.length, this.maxUnits); i++) {
      this._addUnit(spots[i].x, spots[i].z, spots[i].yaw);
    }
    this.spawnTimer = 99;
    this._paint();
  }

  _addUnit(x, z, yaw) {
    const unit = {
      id: this.units.length + Math.floor(this.rng.next() * 1000),
      x,
      z,
      yaw,
      speed: 9,
      hp: 100,
      fire: this.rng.range(0.8, 2.2),
      stuck: 0,
      ram: 0,
      alive: true,
    };
    this.units.push(unit);
    return unit;
  }

  _junctionNear(x, z, minD, maxD) {
    const candidates = [];
    for (let i = 0; i <= CITY.rows; i++) {
      for (let j = 0; j <= CITY.rows; j++) {
        const jx = streetAt(i);
        const jz = streetAt(j);
        const d = Math.hypot(jx - x, jz - z);
        if (d >= minD && d <= maxD) candidates.push({ x: jx, z: jz, d });
      }
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(this.rng.next() * candidates.length) % candidates.length];
  }

  _spawnNear(player) {
    if (this.stars <= 0 || this.units.length >= Math.min(this.maxUnits, this.stars + 1)) return;
    const spot = this._junctionNear(player.x, player.z, 45, 120);
    if (!spot) return;
    const side = this.rng.chance(0.5) ? 0 : 1;
    const along = this.rng.range(-9, 9);
    const x = spot.x + (side ? along : this.rng.range(7, 15));
    const z = spot.z + (side ? this.rng.range(7, 15) : along);
    const yaw = Math.atan2(-(player.x - x), -(player.z - z));
    this._addUnit(x, z, yaw);
  }

  /* --- driving and fighting ------------------------------------------- */

  _hits(x, z, colliders) {
    for (const b of colliders) {
      if (b.top !== undefined && b.top < 0.7) continue;
      if (x > b.minX - 1.2 && x < b.maxX + 1.2 && z > b.minZ - 1.2 && z < b.maxZ + 1.2) return true;
    }
    return false;
  }

  _los(unit, target, colliders) {
    for (const b of colliders) {
      if (b.top !== undefined && b.top < 1.6) continue;
      if (segmentHitsBox(unit.x, unit.z, target.x, target.z, b)) return false;
    }
    return true;
  }

  update(dt, ctx) {
    this.clock += dt;
    const player = ctx.player;
    const car = ctx.car || null;

    if (this.stars > 0) {
      // the meter only gets topped up when a crime lands, never by the clock,
      // otherwise it could never fall back below a star
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 3.2;
        this._spawnNear(player);
      }
    }

    let seen = false;
    let nearest = Infinity;

    for (const unit of this.units) {
      const dx = player.x - unit.x;
      const dz = player.z - unit.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      const clear = dist < 95 && this._los(unit, player, ctx.colliders);
      if (clear) seen = true;

      // aim at the player, or a little ahead of the car when it is moving
      let tx = player.x;
      let tz = player.z;
      if (car && Math.abs(car.speed) > 8) {
        tx += -Math.sin(car.yaw) * Math.min(14, car.speed * 0.45);
        tz += -Math.cos(car.yaw) * Math.min(14, car.speed * 0.45);
      }
      const wantYaw = Math.atan2(-(tx - unit.x), -(tz - unit.z));
      let turn = wantYaw - unit.yaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      unit.yaw += THREE.MathUtils.clamp(turn, -2.2 * dt, 2.2 * dt);

      const closing = dist > 9 ? 1 : 0.25;
      const speedTarget = (15 + this.stars * 2.4) * closing;
      unit.speed += (speedTarget - unit.speed) * Math.min(1, 2.4 * dt);

      const nx = unit.x - Math.sin(unit.yaw) * unit.speed * dt;
      const nz = unit.z - Math.cos(unit.yaw) * unit.speed * dt;
      if (!this._hits(nx, nz, ctx.colliders)) {
        unit.x = nx;
        unit.z = nz;
        unit.stuck = Math.max(0, unit.stuck - dt);
      } else if (!this._hits(nx, unit.z, ctx.colliders)) {
        unit.x = nx;
        unit.stuck += dt;
      } else if (!this._hits(unit.x, nz, ctx.colliders)) {
        unit.z = nz;
        unit.stuck += dt;
      } else {
        unit.stuck += dt;
        unit.speed *= 0.4;
        unit.yaw += 1.6 * dt;
      }
      unit.speed = THREE.MathUtils.clamp(unit.speed, 0, 27);

      // a cruiser walled off in a back street rejoins the chase
      if (unit.stuck > 3) {
        const spot = this._junctionNear(player.x, player.z, 30, 70);
        if (spot) {
          unit.x = spot.x + this.rng.range(-8, 8);
          unit.z = spot.z + this.rng.range(-8, 8);
          unit.yaw = Math.atan2(-(player.x - unit.x), -(player.z - unit.z));
          unit.stuck = 0;
        }
      }

      // ram
      unit.ram = Math.max(0, unit.ram - dt);
      if (dist < 3.6 && unit.ram <= 0) {
        unit.ram = 1.4;
        if (ctx.onRam) ctx.onRam(unit, dist);
        if (this.onCrash) this.onCrash(unit);
      }

      // gunfire, only at a walker standing still enough to aim at
      unit.fire -= dt;
      if (unit.fire <= 0 && dist < 34 && clear && ctx.onFoot) {
        unit.fire = this.rng.range(1.1, 2.2);
        if (ctx.onDamage) ctx.onDamage(this.rng.range(5, 10), unit);
        if (this.onShot) this.onShot(unit);
      }
    }

    this.lostFor = seen ? 0 : this.lostFor + dt;

    if (this.stars > 0 && this.lostFor > 5) {
      // with nobody on you at all, nearest is Infinity; treat that as "far"
      const gap = Number.isFinite(nearest) ? nearest : 400;
      this.heat -= dt * (2.4 + Math.min(6, Math.max(0, gap - 60) * 0.03));
      if (this.heat < (this.stars - 1) * 20.5) {
        this.stars = Math.max(0, this.stars - 1);
        if (this.stars === 0) {
          this.heat = 0;
          for (const unit of this.units) unit.leaving = true;
        }
        if (ctx.onMessage) ctx.onMessage(this.stars > 0 ? 'Heat falling' : 'You lost them');
      }
    }

    if (this.stars === 0) {
      for (const unit of this.units) {
        unit.speed += (0 - unit.speed) * Math.min(1, 1.4 * dt);
      }
      if (this.lostFor > 12) this.units.length = 0;
      else if (this.units.length) {
        for (const unit of this.units) {
          unit.x -= Math.sin(unit.yaw) * unit.speed * dt;
          unit.z -= Math.cos(unit.yaw) * unit.speed * dt;
        }
      }
    }

    this._paint();
  }

  _paint() {
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const off = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const phase = Math.floor(this.clock * 7) % 2 === 0;

    for (let i = 0; i < this.maxUnits; i++) {
      const unit = this.units[i];
      if (!unit) {
        matrix.compose(new THREE.Vector3(0, -8, 0), quat, new THREE.Vector3(0.001, 0.001, 0.001));
        this.body.setMatrixAt(i, matrix);
        this.door.setMatrixAt(i, matrix);
        this.cabin.setMatrixAt(i, matrix);
        this.bar.setMatrixAt(i * 2, matrix);
        this.bar.setMatrixAt(i * 2 + 1, matrix);
        continue;
      }
      quat.setFromAxisAngle(up, unit.yaw);
      pos.set(unit.x, 0, unit.z);
      matrix.compose(pos, quat, one);
      this.body.setMatrixAt(i, matrix);
      this.door.setMatrixAt(i, matrix);
      this.cabin.setMatrixAt(i, matrix);

      for (let side = 0; side < 2; side++) {
        off.set(side === 0 ? -0.36 : 0.36, 0, 0).applyQuaternion(quat).add(pos);
        matrix.compose(off, quat, one);
        this.bar.setMatrixAt(i * 2 + side, matrix);
        const lit = this.stars > 0 && ((side === 0) === phase);
        const tone = side === 0 ? this.red : this.blue;
        this.bar.setColorAt(i * 2 + side, lit ? tone : this.offTone);
      }
    }
    if (this.bar.instanceColor) this.bar.instanceColor.needsUpdate = true;
    this.body.instanceMatrix.needsUpdate = true;
    this.door.instanceMatrix.needsUpdate = true;
    this.cabin.instanceMatrix.needsUpdate = true;
    this.bar.instanceMatrix.needsUpdate = true;
  }

  /* --- combat hooks ---------------------------------------------------- */

  raycast(origin, dir, maxDist) {
    let hit = null;
    let best = maxDist;
    for (const unit of this.units) {
      const ox = unit.x - origin.x;
      const oz = unit.z - origin.z;
      const oy = 1.0 - origin.y;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0.5 || t > best) continue;
      const px = ox - dir.x * t;
      const pz = oz - dir.z * t;
      if (px * px + pz * pz < 1.5 * 1.5) {
        best = t;
        hit = { t, unit };
      }
    }
    return hit;
  }

  hit(unit, damage) {
    unit.hp -= damage;
    if (unit.hp <= 0) {
      unit.alive = false;
      const i = this.units.indexOf(unit);
      if (i >= 0) this.units.splice(i, 1);
      if (this.onCrash) this.onCrash(unit);
      return true;
    }
    return false;
  }

  get active() {
    return this.units.length > 0;
  }
}
