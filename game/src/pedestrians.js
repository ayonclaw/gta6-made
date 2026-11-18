/* The crowd. Every walker in Salmora is six instanced boxes and a pair of
   swinging legs: torso, head, two legs, two arms. They gather where people
   actually stand about — the zebra corners, the shopfront pavements and the
   pier — wander a little, and run when a car comes at them or a shot goes off.
   Nothing here owns collisions with buildings; the pavement ring is enough to
   keep them off the glass. */

import * as THREE from '../vendor/three.module.min.js';
import { CITY, blockCentre } from './config.js';
import { groundHeight } from './city.js';

const HALF = CITY.half;
const PITCH = CITY.pitch;
const STREET = CITY.street;
const INNER = CITY.block / 2 - CITY.walk;

const COATS = [
  0x2c6a68, 0x8d5140, 0xcfc4ad, 0x33465c, 0x7d8c5a, 0xb08a5a,
  0x5b3f52, 0x2f3a33, 0xd8b48a, 0x4a5c72, 0x9a4d3c, 0x6c7f86,
];
const SKINS = [0xc08a63, 0x8d5f42, 0xe0b48c, 0x6a4530, 0xa9744f];

const streetAt = (k) => -HALF + k * PITCH + STREET / 2;

/** Metres to the nearest street centre-line, whichever axis. */
function streetGap(v) {
  const r = ((v + HALF - STREET / 2) % PITCH + PITCH) % PITCH;
  return Math.min(r, PITCH - r);
}

function onCarriageway(x, z) {
  return streetGap(x) < STREET / 2 - 0.4 || streetGap(z) < STREET / 2 - 0.4;
}

/** Shove a point out of a building footprint, onto the pavement ring. */
function clearOfBlocks(x, z) {
  const i = Math.round((HALF - STREET - CITY.block / 2 - x) / PITCH);
  const j = Math.round((HALF - STREET - CITY.block / 2 - z) / PITCH);
  if (i < 0 || i >= CITY.cols || j < 0 || j >= CITY.rows) return { x, z };
  const c = blockCentre(i, j);
  const dx = x - c.x;
  const dz = z - c.z;
  if (Math.abs(dx) >= INNER || Math.abs(dz) >= INNER) return { x, z };
  const px = INNER - Math.abs(dx);
  const pz = INNER - Math.abs(dz);
  if (px < pz) return { x: c.x + Math.sign(dx || 1) * (INNER + 0.5), z };
  return { x, z: c.z + Math.sign(dz || 1) * (INNER + 0.5) };
}

export class Crowd {
  constructor(scene, rng, options = {}) {
    this.rng = rng;
    this.count = options.count || 120;
    this.people = [];
    this.threats = [];
    this.clock = 0;
    this.scanTimer = 0;
    this.onScream = null;

    this.group = new THREE.Group();
    this.group.name = 'crowd';
    scene.add(this.group);

    this._build();
    this._seed();
  }

  _build() {
    const torsoGeo = new THREE.CapsuleGeometry(0.24, 0.42, 3, 6);
    torsoGeo.translate(0, 1.2, 0);
    const headGeo = new THREE.SphereGeometry(0.165, 8, 6);
    headGeo.translate(0, 1.64, 0);
    const legGeo = new THREE.BoxGeometry(0.15, 0.86, 0.19);
    legGeo.translate(0, -0.43, 0);
    const armGeo = new THREE.BoxGeometry(0.1, 0.56, 0.12);
    armGeo.translate(0, -0.28, 0);

    const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });

    this.torso = new THREE.InstancedMesh(torsoGeo, cloth, this.count);
    this.head = new THREE.InstancedMesh(headGeo, skin, this.count);
    this.legs = new THREE.InstancedMesh(legGeo, cloth, this.count * 2);
    this.arms = new THREE.InstancedMesh(armGeo, cloth, this.count * 2);

    for (const mesh of [this.torso, this.head, this.legs, this.arms]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }
    this.torso.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3);
    this.head.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3);
    this.legs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 2 * 3), 3);
    this.arms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 2 * 3), 3);
    this.blank = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -4, 0), new THREE.Quaternion(), new THREE.Vector3(0.001, 0.001, 0.001),
    );
  }

  /* --- where people stand --------------------------------------------- */

  _spots() {
    const rng = this.rng;
    const spots = [];

    // zebra corners around the busier middle of town
    for (let i = 2; i <= 5; i++) {
      for (let j = 2; j <= 5; j++) {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            spots.push({
              x: streetAt(i) + sx * 8.4,
              z: streetAt(j) + sz * 8.4,
              r: 5.6,
              kind: 'crossing',
              weight: 3,
            });
          }
        }
      }
    }
    // shopfront pavements, mid-block on the seaward side
    for (let j = 2; j <= 5; j++) {
      for (let i = 2; i <= 5; i++) {
        const c = blockCentre(i, j);
        spots.push({ x: c.x + 20.2, z: c.z + rng.range(-6, 6), r: 5, kind: 'shop', weight: 1 });
        spots.push({ x: c.x - 20.2, z: c.z + rng.range(-6, 6), r: 5, kind: 'shop', weight: 1 });
      }
    }
    // the pier crowd, out over the water
    const pierX = -64;
    for (let z = 232; z < 302; z += 9) {
      spots.push({ x: pierX + rng.range(-1.6, 1.6), z, r: 4.5, kind: 'pier', weight: 2 });
    }
    return spots;
  }

  _seed() {
    const rng = this.rng;
    const spots = this._spots();
    const weighted = [];
    for (const spot of spots) for (let w = 0; w < spot.weight; w++) weighted.push(spot);

    for (let i = 0; i < this.count; i++) {
      const spot = weighted[Math.floor(rng.next() * weighted.length) % weighted.length];
      const birth = clearOfBlocks(
        spot.x + rng.jitter(spot.r),
        spot.z + rng.jitter(spot.r * 0.7),
      );
      const person = {
        id: i,
        x: birth.x,
        z: birth.z,
        y: groundHeight(birth.x, birth.z),
        yaw: rng.range(-Math.PI, Math.PI),
        phase: rng.range(0, Math.PI * 2),
        speed: 0,
        state: 'idle',
        timer: rng.range(0.4, 3.5),
        home: { x: spot.x, z: spot.z, r: spot.r },
        kind: spot.kind,
        tx: birth.x,
        tz: birth.z,
        onRoad: onCarriageway(birth.x, birth.z),
        walk: rng.range(1.05, 1.55),
        run: rng.range(4.4, 6.2),
        scale: rng.range(0.92, 1.06),
      };
      this.people.push(person);
      this._tone(person);
      // most of the crowd is already walking when the coast comes up
      if (this.rng.chance(0.64)) {
        this._wander(person);
        person.timer = this.rng.range(3.5, 13);
      }
    }
  }

  _tone(person) {
    const rng = this.rng;
    const coat = new THREE.Color(COATS[Math.floor(rng.next() * COATS.length) % COATS.length]);
    const trouser = new THREE.Color(COATS[Math.floor(rng.next() * COATS.length) % COATS.length]).multiplyScalar(0.62);
    const skin = new THREE.Color(SKINS[Math.floor(rng.next() * SKINS.length) % SKINS.length]);
    this.torso.setColorAt(person.id, coat);
    this.head.setColorAt(person.id, skin);
    this.legs.setColorAt(person.id * 2, trouser);
    this.legs.setColorAt(person.id * 2 + 1, trouser);
    this.arms.setColorAt(person.id * 2, coat);
    this.arms.setColorAt(person.id * 2 + 1, coat);
    for (const mesh of [this.torso, this.head, this.legs, this.arms]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /* --- behaviour ------------------------------------------------------ */

  /** Scatter everyone near a bang, and remember where it came from. */
  startle(x, z, radius = 16, power = 1) {
    this.threats.push({ x, z, r: radius, t: 5.5 * power });
    if (this.threats.length > 8) this.threats.shift();
    let scared = 0;
    const r2 = radius * radius;
    for (const person of this.people) {
      const dx = person.x - x;
      const dz = person.z - z;
      if (dx * dx + dz * dz > r2) continue;
      this._flee(person, x, z);
      scared++;
    }
    if (scared > 0 && this.onScream) this.onScream(scared);
    return scared;
  }

  _flee(person, fromX, fromZ) {
    const dx = person.x - fromX;
    const dz = person.z - fromZ;
    const d = Math.max(0.35, Math.hypot(dx, dz));
    const reach = 12 + this.rng.range(0, 9);
    const spot = clearOfBlocks(
      person.x + (dx / d) * reach + this.rng.jitter(2.5),
      person.z + (dz / d) * reach + this.rng.jitter(2.5),
    );
    person.tx = spot.x;
    person.tz = spot.z;
    person.state = 'flee';
    person.timer = this.rng.range(3.4, 6.4);
  }

  _wander(person) {
    const spot = person.home;
    const ang = this.rng.range(0, Math.PI * 2);
    const reach = this.rng.range(1.5, spot.r);
    const target = clearOfBlocks(
      spot.x + Math.cos(ang) * reach,
      spot.z + Math.sin(ang) * reach,
    );
    person.tx = THREE.MathUtils.clamp(target.x, -HALF + 4, HALF + CITY.promenade - 4);
    person.tz = THREE.MathUtils.clamp(target.z, -HALF + 4, HALF + CITY.promenade - 4);
    person.state = 'walk';
    person.timer = this.rng.range(2.4, 7.5);
  }

  update(dt, ctx) {
    this.clock += dt;
    for (let i = this.threats.length - 1; i >= 0; i--) {
      this.threats[i].t -= dt;
      if (this.threats[i].t <= 0) this.threats.splice(i, 1);
    }

    // fast cars are a threat; check a handful of times a second, not per frame
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.24;
      this._dodgeCars(ctx);
    }

    for (const person of this.people) {
      person.timer -= dt;
      if (person.state === 'idle') {
        person.speed += (0 - person.speed) * Math.min(1, 6 * dt);
        if (person.timer <= 0) this._wander(person);
      } else if (person.state === 'walk') {
        const dx = person.tx - person.x;
        const dz = person.tz - person.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6 || person.timer <= 0) {
          person.state = 'idle';
          person.timer = this.rng.range(1.2, 5.5);
        } else {
          person.speed += (person.walk - person.speed) * Math.min(1, 4 * dt);
          person.x += (dx / d) * person.speed * dt;
          person.z += (dz / d) * person.speed * dt;
          person.yaw = Math.atan2(-dx, -dz);
        }
      } else if (person.state === 'flee') {
        const dx = person.tx - person.x;
        const dz = person.tz - person.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.8 || person.timer <= 0) {
          person.state = 'idle';
          person.timer = this.rng.range(1.6, 4.2);
        } else {
          person.speed += (person.run - person.speed) * Math.min(1, 7 * dt);
          person.x += (dx / d) * person.speed * dt;
          person.z += (dz / d) * person.speed * dt;
          person.yaw = Math.atan2(-dx, -dz);
        }
      }

      person.x = THREE.MathUtils.clamp(person.x, -HALF + 3, HALF + CITY.promenade - 3);
      person.z = THREE.MathUtils.clamp(person.z, -HALF + 3, HALF + CITY.promenade - 3);
      person.y = groundHeight(person.x, person.z);
      person.onRoad = onCarriageway(person.x, person.z);
      const stride = person.state === 'flee' ? 9.6 : 5.4;
      person.phase += person.speed * dt * stride;
    }

    this._paint();
  }

  _dodgeCars(ctx) {
    const fast = [];
    if (ctx.car && ctx.car.speed > 5) {
      fast.push({ x: ctx.car.x, z: ctx.car.z, yaw: ctx.car.yaw, speed: ctx.car.speed });
    }
    if (ctx.traffic) {
      for (const car of ctx.traffic.cars) {
        if (!car.alive || car.speed < 5.5) continue;
        fast.push(car);
        if (fast.length > 26) break;
      }
    }
    if (!fast.length) return;
    for (const person of this.people) {
      if (person.state === 'flee') continue;
      for (const car of fast) {
        const dx = person.x - car.x;
        const dz = person.z - car.z;
        if (dx * dx + dz * dz > 100) continue;
        const fx = -Math.sin(car.yaw);
        const fz = -Math.cos(car.yaw);
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > -1 && ahead < 9 && side < 3.4) {
          this._flee(person, car.x, car.z);
          if (this.onScream) this.onScream(1);
          break;
        }
      }
    }
  }

  /** True when somebody is standing in the road within r of a point. */
  blocking(x, z, r = 3.2) {
    const r2 = r * r;
    for (const person of this.people) {
      if (!person.onRoad) continue;
      const dx = person.x - x;
      const dz = person.z - z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  within(x, z, radius) {
    const r2 = radius * radius;
    let n = 0;
    for (const person of this.people) {
      const dx = person.x - x;
      const dz = person.z - z;
      if (dx * dx + dz * dz < r2) n++;
    }
    return n;
  }

  moving() {
    let n = 0;
    for (const person of this.people) if (person.speed > 0.2) n++;
    return n;
  }

  /** A hit test for the pistol: nearest walker along a ray, or null. */
  raycast(origin, dir, maxDist) {
    let hit = null;
    let bestT = maxDist;
    for (const person of this.people) {
      const ox = person.x - origin.x;
      const oz = person.z - origin.z;
      const oy = (person.y + 1.0) - origin.y;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0.5 || t > bestT) continue;
      const px = ox - dir.x * t;
      const py = oy - dir.y * t;
      const pz = oz - dir.z * t;
      if (px * px + pz * pz < 0.42 * 0.42 && Math.abs(py) < 1.05) {
        bestT = t;
        hit = { t, person };
      }
    }
    return hit;
  }

  /* --- matrices ------------------------------------------------------- */

  _paint() {
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const swingQ = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(1, 0, 0);
    const pos = new THREE.Vector3();
    const off = new THREE.Vector3();
    const scale = new THREE.Vector3();

    for (const person of this.people) {
      const i = person.id;
      quat.setFromAxisAngle(up, person.yaw);
      scale.set(person.scale, person.scale, person.scale);

      pos.set(person.x, person.y, person.z);
      matrix.compose(pos, quat, scale);
      this.torso.setMatrixAt(i, matrix);

      const bob = Math.abs(Math.sin(person.phase)) * 0.022 * Math.min(1, person.speed);
      pos.set(person.x, person.y + bob, person.z);
      matrix.compose(pos, quat, scale);
      this.head.setMatrixAt(i, matrix);

      const swing = Math.sin(person.phase) * 0.42 * Math.min(1, person.speed / 1.2);
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        off.set(side * 0.12, 0.9, 0).applyQuaternion(quat).add(pos);
        swingQ.setFromAxisAngle(right, side * swing).premultiply(quat);
        matrix.compose(off, swingQ, scale);
        this.legs.setMatrixAt(i * 2 + s, matrix);

        off.set(side * 0.31, 1.4, 0).applyQuaternion(quat).add(pos);
        swingQ.setFromAxisAngle(right, -side * swing * 0.8).premultiply(quat);
        matrix.compose(off, swingQ, scale);
        this.arms.setMatrixAt(i * 2 + s, matrix);
      }
    }
    this.torso.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.legs.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;
  }
}

export { onCarriageway };
