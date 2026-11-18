// The one car Marisol Bay hands you at the start: a boxy little coupe built from primitives,
// and an arcade driving model with a bicycle-steering yaw rate, drag and braking.
import * as THREE from '../vendor/three.module.min.js';
import { CAR, CAR_PAINT, CITY_HALF, OCEAN } from './config.js';
import { groundHeight, pushOutOfBoxes } from './city.js';

function part(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildCar() {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  const paint = new THREE.MeshStandardMaterial({ color: CAR_PAINT.body, roughness: 0.32, metalness: 0.55 });
  const paintDark = new THREE.MeshStandardMaterial({ color: CAR_PAINT.bodyDark, roughness: 0.5, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: CAR_PAINT.glass, roughness: 0.12, metalness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: CAR_PAINT.chrome, roughness: 0.22, metalness: 0.9 });
  const rubber = new THREE.MeshStandardMaterial({ color: CAR_PAINT.tyre, roughness: 0.95 });
  const roofPaint = new THREE.MeshStandardMaterial({ color: CAR_PAINT.roof, roughness: 0.4, metalness: 0.2 });
  const headLamp = new THREE.MeshStandardMaterial({ color: CAR_PAINT.lamp, emissive: CAR_PAINT.lamp, emissiveIntensity: 0.85, roughness: 0.3 });
  const tailLamp = new THREE.MeshStandardMaterial({ color: CAR_PAINT.tail, emissive: CAR_PAINT.tail, emissiveIntensity: 0.7, roughness: 0.4 });

  chassis.add(part(1.95, 0.52, 4.5, paint, 0, 0.66, 0));
  chassis.add(part(1.88, 0.34, 4.42, paintDark, 0, 0.42, 0));
  chassis.add(part(1.6, 0.34, 1.1, paint, 0, 0.86, 1.62));
  chassis.add(part(1.66, 0.52, 2.1, glass, 0, 1.18, -0.35));
  chassis.add(part(1.62, 0.1, 1.85, roofPaint, 0, 1.46, -0.42));
  chassis.add(part(1.7, 0.16, 2.0, paint, 0, 0.98, -1.9));
  chassis.add(part(2.0, 0.12, 0.22, chrome, 0, 0.5, 2.2));
  chassis.add(part(2.0, 0.12, 0.22, chrome, 0, 0.5, -2.2));
  chassis.add(part(0.5, 0.18, 0.08, headLamp, -0.66, 0.78, 2.24));
  chassis.add(part(0.5, 0.18, 0.08, headLamp, 0.66, 0.78, 2.24));
  chassis.add(part(0.5, 0.16, 0.08, tailLamp, -0.66, 0.8, -2.24));
  chassis.add(part(0.5, 0.16, 0.08, tailLamp, 0.66, 0.8, -2.24));
  chassis.add(part(0.22, 0.1, 0.16, chrome, -1.02, 1.2, 0.35));
  chassis.add(part(0.22, 0.1, 0.16, chrome, 1.02, 1.2, 0.35));

  const wheelGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 16);
  wheelGeometry.rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 10);
  hubGeometry.rotateZ(Math.PI / 2);

  const wheels = [];
  for (const side of [-1, 1]) {
    for (const front of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.92, 0.46, front * 1.42);
      const tyre = new THREE.Mesh(wheelGeometry, rubber);
      tyre.castShadow = true;
      const hub = new THREE.Mesh(hubGeometry, chrome);
      pivot.add(tyre);
      pivot.add(hub);
      group.add(pivot);
      wheels.push({ pivot, tyre, front: front === 1 });
    }
  }

  return { group, chassis, wheels, tailLamp };
}

export class Car {
  constructor(scene, city, start) {
    const built = buildCar();
    this.group = built.group;
    this.chassis = built.chassis;
    this.wheels = built.wheels;
    this.tailLamp = built.tailLamp;
    this.city = city;
    this.position = new THREE.Vector3(start.x, 0, start.z);
    this.heading = start.heading ?? Math.PI;
    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.occupied = false;
    this.pitch = 0;
    this.roll = 0;
    this.lastSpeed = 0;
    this.place(this.position.x, this.position.z, this.heading);
    scene.add(this.group);
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  place(x, z, heading) {
    this.position.x = x;
    this.position.z = z;
    this.heading = heading;
    this.position.y = groundHeight(x, z);
    this.group.position.copy(this.position);
    this.group.rotation.y = heading;
  }

  distanceTo(point) {
    return Math.hypot(point.x - this.position.x, point.z - this.position.z);
  }

  /** Arcade driving: throttle, brake and reverse on one axis, steering on the other. */
  update(dt, input, driving) {
    if (driving) {
      const pedal = input.axisForward();
      if (pedal > 0) {
        this.speed += CAR.acceleration * dt;
      } else if (pedal < 0) {
        this.speed -= (this.speed > 0.4 ? CAR.brakeForce : CAR.acceleration * 0.75) * dt;
      }

      const drag = CAR.rollingDrag * dt + CAR.airDrag * this.speed * Math.abs(this.speed) * dt;
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), drag);
      if (input.handbrake) {
        this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), CAR.handbrake * dt);
      }
      this.speed = THREE.MathUtils.clamp(this.speed, -CAR.reverseSpeed, CAR.maxSpeed);

      const speedRatio = Math.abs(this.speed) / CAR.maxSpeed;
      const steerTarget = input.axisStrafe() * CAR.maxSteer * (1 - 0.52 * speedRatio);
      this.steer += (steerTarget - this.steer) * Math.min(1, CAR.steerRate * dt);
      if (Math.abs(this.speed) > 0.05) {
        this.heading -= (this.speed / CAR.wheelBase) * Math.tan(this.steer) * dt;
      }

      this.position.x += Math.sin(this.heading) * this.speed * dt;
      this.position.z += Math.cos(this.heading) * this.speed * dt;

      const corrected = pushOutOfBoxes(this.city.colliders, this.position.x, this.position.z, CAR.collisionRadius);
      const bumped = Math.hypot(corrected.x - this.position.x, corrected.z - this.position.z);
      this.position.x = corrected.x;
      this.position.z = corrected.z;
      if (bumped > 0.01) this.speed *= 0.35;

      const limit = CITY_HALF + 22;
      this.position.x = THREE.MathUtils.clamp(this.position.x, -limit, limit);
      this.position.z = THREE.MathUtils.clamp(this.position.z, OCEAN.beachEnd + 16, limit);
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), CAR.brakeForce * dt);
      this.steer += (0 - this.steer) * Math.min(1, CAR.steerRate * dt);
    }

    this.position.y = groundHeight(this.position.x, this.position.z);

    const acceleration = (this.speed - this.lastSpeed) / Math.max(dt, 0.0001);
    this.lastSpeed = this.speed;
    this.pitch += ((-acceleration * 0.004) - this.pitch) * Math.min(1, 6 * dt);
    this.roll += ((this.steer * this.speed * 0.006) - this.roll) * Math.min(1, 6 * dt);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    this.chassis.rotation.x = this.pitch;
    this.chassis.rotation.z = this.roll;

    this.wheelSpin += (this.speed * dt) / 0.46;
    for (const wheel of this.wheels) {
      wheel.tyre.rotation.x = this.wheelSpin;
      wheel.pivot.rotation.y = wheel.front ? this.steer : 0;
    }
    const braking = driving && input.axisForward() < 0 && this.speed > 0.4;
    this.tailLamp.emissiveIntensity = braking ? 2.6 : 0.7;
  }
}
