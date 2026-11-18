/* Traffic. Salmora's streets are an eight-by-eight grid, so the lane graph is
   cheap to build: every street centre-line carries two lanes, one each way,
   and a junction is simply where two of those lines cross. Each car owns a
   lane, a direction and a distance along it; it plans its turn about thirty
   metres out, keeps a real gap to the car in front, yields at a busy junction
   and slows for anybody standing on the zebra. Draw calls stay flat because
   the whole fleet is four instanced meshes. */

import * as THREE from '../vendor/three.module.min.js';
import { CITY } from './config.js';

const LANE = 3.1;
const STREETS = CITY.rows + 1;
const HALF = CITY.half;
const PITCH = CITY.pitch;
const STREET = CITY.street;
const ONE = new THREE.Vector3(1, 1, 1);

const PAINT = [
  0x9c3f37, 0x2f4f63, 0xd8d1be, 0x3c4a3d, 0x6b6e73,
  0x1e2b3a, 0xb1813f, 0x7c8b89, 0x9a5c3e, 0x41566b,
  0xc4a15f, 0x35393d, 0x8a6d55, 0x5c3f48,
];

/* wheel positions in the car's own frame, metres from the centre */
const WHEELS = [
  [-0.86, -1.34], [0.86, -1.34], [-0.86, 1.36], [0.86, 1.36],
];

const streetAt = (k) => -HALF + k * PITCH + STREET / 2;
const indexAt = (v) => Math.round((v + HALF - STREET / 2) / PITCH);

/** Heading that points a car down a lane. Forward is minus Z at yaw zero. */
function laneYaw(axis, dir) {
  if (axis === 'x') return dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  return dir > 0 ? Math.PI : 0;
}

/** The fixed coordinate of a lane: z for east-west lanes, x for north-south. */
function laneLine(axis, dir, k) {
  return axis === 'x' ? streetAt(k) + dir * LANE : streetAt(k) - dir * LANE;
}

export class Traffic {
  constructor(scene, rng, options = {}) {
    this.rng = rng;
    this.count = options.count || 60;
    this.cars = [];
    this.leases = new Map();
    this.time = 0;
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    scene.add(this.group);

    this._build();
    const focus = options.focus || { x: 0, z: 0 };
    for (let i = 0; i < this.count; i++) {
      const car = { id: i, alive: true, speed: 0, stuck: 0, next: null };
      this.cars.push(car);
      // two thirds of the fleet starts around the middle of town so the
      // opening junction is busy; the rest is spread over the whole grid
      this._respawn(car, focus, i < this.count * 0.7 ? 64 : 200);
      this._paintCar(car);
    }
    this._paint();
  }

  /* --- meshes --------------------------------------------------------- */

  _build() {
    const bodyGeo = new THREE.BoxGeometry(1.86, 0.7, 4.12);
    bodyGeo.translate(0, 0.73, 0);
    const cabinGeo = new THREE.BoxGeometry(1.66, 0.58, 2.02);
    cabinGeo.translate(0, 1.31, 0.1);
    const wheelGeo = new THREE.BoxGeometry(0.26, 0.66, 0.66);
    wheelGeo.translate(0, 0.33, 0);
    const lampGeo = new THREE.BoxGeometry(1.44, 0.14, 0.08);
    lampGeo.translate(0, 0.8, 0);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.46, metalness: 0.32 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.58, metalness: 0.3 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.body = new THREE.InstancedMesh(bodyGeo, bodyMat, this.count);
    this.cabin = new THREE.InstancedMesh(cabinGeo, trimMat, this.count);
    this.wheels = new THREE.InstancedMesh(wheelGeo, trimMat, this.count * 4);
    this.lamps = new THREE.InstancedMesh(lampGeo, lampMat, this.count * 2);

    for (const mesh of [this.body, this.cabin, this.wheels, this.lamps]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }
    this.body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3);
    this.lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 2 * 3), 3);

    // number plates and glass are folded into the paint colours, so the only
    // extra per-car tone is the lamp pair
    this._color = new THREE.Color();
  }

  _paintCar(car) {
    this._color.setHex(PAINT[car.id % PAINT.length]);
    this.body.setColorAt(car.id, this._color);
    this.lamps.setColorAt(car.id * 2, new THREE.Color(0xffe9bb));
    this.lamps.setColorAt(car.id * 2 + 1, new THREE.Color(0xd8322a));
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  /* --- population ----------------------------------------------------- */

  _respawn(car, focus, spread) {
    const rng = this.rng;
    // stream onto lanes around the player's own corner of the grid, so the
    // traffic keeps arriving where it can be seen instead of thinning out
    const fi = Math.round((focus.x + HALF - STREET / 2) / PITCH);
    const fj = Math.round((focus.z + HALF - STREET / 2) / PITCH);

    for (let attempt = 0; attempt < 26; attempt++) {
      const axis = rng.chance(0.5) ? 'x' : 'z';
      const dir = rng.chance(0.5) ? 1 : -1;
      const near = axis === 'x' ? fj : fi;
      const ahead = axis === 'x' ? fi : fj;
      const k = THREE.MathUtils.clamp(near + rng.int(-2, 2), 1, STREETS - 2);
      const anchor = THREE.MathUtils.clamp(ahead + rng.int(-2, 2), 1, STREETS - 2);
      const line = laneLine(axis, dir, k);
      const along = THREE.MathUtils.clamp(streetAt(anchor) + rng.jitter(17), -HALF + 8, HALF - 8);
      const px = axis === 'x' ? along : line;
      const pz = axis === 'x' ? line : along;
      const far = Math.hypot(px - focus.x, pz - focus.z);
      if (far > spread || far < 12) continue;
      if (this._crowded(axis, line, along, car.id)) continue;

      car.axis = axis;
      car.dir = dir;
      car.line = line;
      car.along = along;
      car.next = null;
      car.nextK = undefined;
      car.nextClaimed = false;
      car.x = px;
      car.z = pz;
      car.yaw = laneYaw(axis, dir);
      car.speed = rng.range(4, 9);
      car.cruise = rng.range(10.5, 15.5);
      car.stuck = 0;
      return true;
    }
    // a fallback lane in the middle of the grid, always legal
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const dir = rng.chance(0.5) ? 1 : -1;
    car.axis = axis;
    car.dir = dir;
    car.line = laneLine(axis, dir, 4);
    car.along = streetAt(4);
    car.next = null;
    car.nextK = undefined;
    car.nextClaimed = false;
    car.x = axis === 'x' ? car.along : car.line;
    car.z = axis === 'x' ? car.line : car.along;
    car.yaw = laneYaw(axis, dir);
    car.speed = 6;
    car.cruise = 12;
    car.stuck = 0;
    return false;
  }

  _crowded(axis, line, along, ignoreId) {
    for (const other of this.cars) {
      if (!other.alive || other.id === ignoreId || other.axis !== axis) continue;
      if (Math.abs(other.line - line) > 1.2) continue;
      if (Math.abs(other.along - along) < 8) return true;
    }
    return false;
  }

  /* --- the driving itself --------------------------------------------- */

  /** The next junction on this car's lane, with a distance to it. */
  _corner(car) {
    let best = null;
    for (let k = 0; k < STREETS; k++) {
      const d = (streetAt(k) - car.along) * car.dir;
      if (d > 0.7 && (best === null || d < best.dist)) {
        best = { k, dist: d, s: streetAt(k) };
      }
    }
    if (best === null) {
      const k = car.dir > 0 ? STREETS - 1 : 0;
      best = { k, dist: 260, s: streetAt(k) };
    }
    return best;
  }

  /** Pick a continuation: straight mostly, with a turning share. */
  _plan(car, k) {
    if (car.next && car.nextK === k) return car.next;

    const options = [];
    const push = (axis, dir, weight) => {
      if (axis === car.axis) {
        const nextAlong = car.dir > 0 ? k + 1 : k - 1;
        if (nextAlong < 0 || nextAlong > STREETS - 1) return;
      }
      options.push({ axis, dir, weight });
    };
    push(car.axis, car.dir, 0.56);
    if (car.axis === 'x') {
      push('z', car.dir, 0.24);
      push('z', -car.dir, 0.2);
    } else {
      push('x', -car.dir, 0.24);
      push('x', car.dir, 0.2);
    }
    const total = options.reduce((sum, o) => sum + o.weight, 0);
    let roll = this.rng.next() * total;
    let pick = options[options.length - 1];
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) { pick = option; break; }
    }
    car.next = { axis: pick.axis, dir: pick.dir };
    car.nextK = k;
    return car.next;
  }

  /** Along-coordinate where this car leaves its current lane. */
  _stopLine(car, corner, next) {
    if (next.axis === car.axis) return corner.s;
    return car.axis === 'x'
      ? corner.s - next.dir * LANE
      : corner.s + next.dir * LANE;
  }

  _lead(car) {
    let gap = Infinity;
    for (const other of this.cars) {
      if (other === car || !other.alive) continue;
      if (other.axis !== car.axis || other.dir !== car.dir) continue;
      if (Math.abs(other.line - car.line) > 1.4) continue;
      const ahead = (other.along - car.along) * car.dir;
      if (ahead > 0 && ahead < gap) gap = ahead;
    }
    return gap;
  }

  /** Distance to a point if it sits in front of this car in this lane. */
  _aheadOf(car, x, z) {
    if (car.axis === 'x') {
      if (Math.abs(z - car.line) > 2.8) return Infinity;
      const ahead = (x - car.along) * car.dir;
      return ahead > -1 ? ahead : Infinity;
    }
    if (Math.abs(x - car.line) > 2.8) return Infinity;
    const ahead = (z - car.along) * car.dir;
    return ahead > -1 ? ahead : Infinity;
  }

  _junctionKey(x, z) {
    return `${indexAt(x)}:${indexAt(z)}`;
  }

  update(dt, ctx) {
    this.time += dt;
    for (const [key, lease] of this.leases) {
      lease.t -= dt;
      if (lease.t <= 0) this.leases.delete(key);
    }

    for (const car of this.cars) {
      if (!car.alive) continue;
      this._drive(car, dt, ctx);
      const dx = car.x - ctx.focus.x;
      const dz = car.z - ctx.focus.z;
      if (dx * dx + dz * dz > 240 * 240) {
        this._respawn(car, ctx.focus, 160);
        this._paintCar(car);
      }
    }
    this._paint();
  }

  _drive(car, dt, ctx) {
    const corner = this._corner(car);
    const next = this._plan(car, corner.k);
    const stopLine = this._stopLine(car, corner, next);
    const toCorner = (stopLine - car.along) * car.dir;

    let target = Math.min(car.cruise, 4 + Math.max(0, toCorner) * 0.9);

    // the gap to the car in front, in metres of daylight
    const lead = this._lead(car);
    if (lead < 46) target = Math.min(target, Math.max(0, (lead - 2.8) * 0.9));

    // do not drive through the player, on foot or behind the wheel
    if (ctx.car) {
      const gap = this._aheadOf(car, ctx.car.x, ctx.car.z);
      if (gap < 28) target = Math.min(target, Math.max(0, (gap - 3.6) * 0.95));
    }
    if (ctx.body) {
      const gap = this._aheadOf(car, ctx.body.x, ctx.body.z);
      if (gap < 18) target = Math.min(target, Math.max(0, (gap - 2.2) * 0.9));
    }

    // give the zebra its moment
    if (ctx.peds && toCorner > 4 && toCorner < 22) {
      const fx = car.axis === 'x' ? car.dir : 0;
      const fz = car.axis === 'z' ? car.dir : 0;
      const lookX = car.x + fx * Math.min(9, toCorner);
      const lookZ = car.z + fz * Math.min(9, toCorner);
      if (ctx.peds.blocking(lookX, lookZ, 3.4)) target = 0;
    }

    // one car at a time through the junction
    if (!car.nextClaimed && toCorner < 26 && toCorner > 0) {
      const key = this._junctionKey(
        car.axis === 'x' ? stopLine : car.line,
        car.axis === 'x' ? car.line : stopLine,
      );
      const lease = this.leases.get(key);
      if (!lease) {
        this.leases.set(key, { id: car.id, t: 5.5 });
        car.nextClaimed = true;
      } else if (lease.id !== car.id) {
        target = 0;
      } else {
        car.nextClaimed = true;
      }
    }

    const rate = target > car.speed ? 4.4 : 11;
    if (target > car.speed) car.speed = Math.min(target, car.speed + rate * dt);
    else car.speed = Math.max(target, car.speed - rate * dt);
    if (car.speed < 0.05) car.speed = 0;

    car.stuck = car.speed < 0.4 ? car.stuck + dt : 0;
    if (car.stuck > 14) {
      // a jam that will not clear: slip the car out of the world nearby
      this._respawn(car, ctx.focus, 150);
      this._paintCar(car);
      return;
    }

    let travel = car.speed * dt;
    if (travel <= 0) {
      this._place(car);
      return;
    }

    const room = (stopLine - car.along) * car.dir;
    if (travel >= room) {
      travel -= Math.max(0, room);
      this._turn(car, next, stopLine);
      car.next = null;
      car.nextK = undefined;
      car.nextClaimed = false;
    }
    car.along += car.dir * travel;
    this._place(car);
  }

  _turn(car, next, stopLine) {
    if (next.axis === car.axis) {
      car.along = stopLine;
      car.dir = next.dir;
      car.yaw = laneYaw(car.axis, car.dir);
      return;
    }
    const oldLine = car.line;
    const oldAlong = stopLine;
    car.axis = next.axis;
    car.dir = next.dir;
    car.line = oldAlong;
    car.along = oldLine;
    car.yaw = laneYaw(car.axis, car.dir);
  }

  _place(car) {
    if (car.axis === 'x') {
      car.x = car.along;
      car.z = car.line;
    } else {
      car.x = car.line;
      car.z = car.along;
    }
  }

  _paint() {
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const dead = new THREE.Vector3(0, 0, 0);

    for (const car of this.cars) {
      const i = car.id;
      if (!car.alive) {
        matrix.compose(dead, quat, new THREE.Vector3(0.001, 0.001, 0.001));
        this.body.setMatrixAt(i, matrix);
        this.cabin.setMatrixAt(i, matrix);
        for (let w = 0; w < 4; w++) this.wheels.setMatrixAt(i * 4 + w, matrix);
        this.lamps.setMatrixAt(i * 2, matrix);
        this.lamps.setMatrixAt(i * 2 + 1, matrix);
        continue;
      }
      quat.setFromAxisAngle(up, car.yaw);
      pos.set(car.x, 0, car.z);
      matrix.compose(pos, quat, ONE);
      this.body.setMatrixAt(i, matrix);
      this.cabin.setMatrixAt(i, matrix);

      for (let w = 0; w < 4; w++) {
        offset.set(WHEELS[w][0], 0, WHEELS[w][1]).applyQuaternion(quat);
        offset.add(pos);
        matrix.compose(offset, quat, ONE);
        this.wheels.setMatrixAt(i * 4 + w, matrix);
      }
      offset.set(0, 0, -2.06).applyQuaternion(quat).add(pos);
      matrix.compose(offset, quat, ONE);
      this.lamps.setMatrixAt(i * 2, matrix);
      offset.set(0, 0, 2.06).applyQuaternion(quat).add(pos);
      matrix.compose(offset, quat, ONE);
      this.lamps.setMatrixAt(i * 2 + 1, matrix);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.cabin.instanceMatrix.needsUpdate = true;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
  }

  /* --- what the rest of the game asks of traffic ----------------------- */

  /** The nearest car within reach of a walker, for the steal prompt. */
  at(x, z, reach = 5.2) {
    let best = null;
    let bestD = reach * reach;
    for (const car of this.cars) {
      if (!car.alive) continue;
      const dx = car.x - x;
      const dz = car.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  /** Take a car off the road; the walker drives it away from here. */
  take(car) {
    car.alive = false;
    car.speed = 0;
    const matrix = new THREE.Matrix4();
    matrix.compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(0.001, 0.001, 0.001));
    this.body.setMatrixAt(car.id, matrix);
    this.cabin.setMatrixAt(car.id, matrix);
    this.lamps.setMatrixAt(car.id * 2, matrix);
    this.lamps.setMatrixAt(car.id * 2 + 1, matrix);
    for (let w = 0; w < 4; w++) this.wheels.setMatrixAt(car.id * 4 + w, matrix);
    this.body.instanceMatrix.needsUpdate = true;
    this.cabin.instanceMatrix.needsUpdate = true;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
    return car;
  }

  /** Put a car back on a lane near a point, e.g. once the player drives off. */
  restock(focus) {
    let placed = 0;
    for (const car of this.cars) {
      if (car.alive) continue;
      this._respawn(car, focus, 220);
      car.alive = true;
      this._paintCar(car);
      placed++;
      if (placed > 2) break;
    }
  }

  /** Put the whole fleet around a point, for a staged frame: the road in shot is
   *  busy instead of holding whatever the opening spawn left there. */
  reseed(focus, spread = 170) {
    for (const car of this.cars) {
      car.alive = true;
      this._respawn(car, focus, spread);
      this._paintCar(car);
    }
    this._paint();
  }

  /** Cars inside a radius, for reports and for the crowd to dodge. */
  within(x, z, radius) {
    const r2 = radius * radius;
    let n = 0;
    for (const car of this.cars) {
      if (!car.alive) continue;
      const dx = car.x - x;
      const dz = car.z - z;
      if (dx * dx + dz * dz < r2) n++;
    }
    return n;
  }

  moving() {
    let n = 0;
    for (const car of this.cars) if (car.alive && car.speed > 0.5) n++;
    return n;
  }
}
