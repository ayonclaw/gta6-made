/* Boot and glue. Builds the coast from a seed, runs the loop, and swaps
   between walking and driving. Deterministic poses for the camera live here. */

import * as THREE from '../vendor/three.module.min.js';
import { createTextures } from './textures.js';
import { buildCity } from './city.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Car } from './car.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { CAR_NAME, START, WALK, districtAt } from './config.js';
import { Rng, hashSeed } from './rng.js';

/* --- seed and staging -------------------------------------------------- */

const params = new URLSearchParams(window.location.search);
const rawSeed = params.get('seed');
const seed = rawSeed === null || rawSeed === ''
  ? START.seed
  : (/^\d+$/.test(rawSeed) ? Number(rawSeed) >>> 0 : hashSeed(rawSeed));
const shot = params.get('shot');

const SHOTS = {
  title: {
    time: 0.9,
    player: [3, 35.6, 0],
    car: [4.2, 31.6, -Math.PI / 2],
    eye: [-64, 7.5, 292],
    look: [6, 16, 118],
    fov: 44,
    titleCard: true,
    cinema: true,
  },
  street: {
    time: 0.86,
    player: [1.6, 37.4, 0.35],
    car: [9.5, 30.6, -Math.PI / 2],
    eye: [11.5, 2.3, 55],
    look: [3.5, 4.2, 6],
    fov: 58,
  },
  vista: {
    time: 0.9,
    player: [3, 35.6, 0],
    car: [4.2, 31.6, -Math.PI / 2],
    eye: [-46, 24, 336],
    look: [6, 10, 120],
    fov: 46,
  },
};

/* --- build ------------------------------------------------------------- */

const canvas = document.getElementById('stage');
const hud = new Hud(document.getElementById('hud'));

const textures = createTextures(seed);
const world = new World(canvas, textures, { low: params.get('quality') === 'low' });
const rng = new Rng(seed);
const city = buildCity(world.scene, textures, rng);

const player = new Player(world.scene);
player.teleport(city.spawn.x, city.spawn.z, city.spawn.yaw);

const car = new Car(world.scene);
car.place(city.carSpawn.x, city.carSpawn.z, city.carSpawn.yaw);

const chase = new ChaseCamera(world.camera);
chase.obstacles = city.colliders;
chase.yaw = city.spawn.yaw;
chase.pos.set(city.spawn.x, 3.2, city.spawn.z + 7);

const input = new Input(canvas);

let mode = 'walk';
let paused = false;
let staged = false;
let nearCar = false;
let frames = 0;
let elapsed = 0;
let cash = START.cash;
let health = START.health;
let wasLocked = false;

hud.setCash(cash);
hud.setHealth(health);
hud.setDistrict(districtAt(city.spawn.z).name);

/* --- interaction ------------------------------------------------------- */

function setPaused(next) {
  if (staged) return;
  paused = next;
  hud.openPause(next);
  input.enabled = !next;
  if (next) {
    input.keys.clear();
    input.edges.clear();
    input.releaseLock();
    hud.hidePrompt();
  }
}

function resume() {
  setPaused(false);
  input.requestLock();
}

function enterCar() {
  mode = 'drive';
  nearCar = false;
  player.setVisible(false);
  chase.setMode('drive');
  hud.setSpeed(0);
  hud.prompt('E', `Step out of the ${CAR_NAME.toLowerCase()}`, 2.4);
  hud.message(CAR_NAME);
  chase.addShake(0.06);
}

function safeExit(x, z) {
  for (const b of city.colliders) {
    if (b.top !== undefined && b.top < 0.6) continue;
    if (x > b.minX - 0.7 && x < b.maxX + 0.7 && z > b.minZ - 0.7 && z < b.maxZ + 0.7) return false;
  }
  return Math.abs(x) < city.layout.half + 15 && z < city.layout.quay - 1.2;
}

function exitCar() {
  const rightX = Math.cos(car.yaw);
  const rightZ = -Math.sin(car.yaw);
  const backX = Math.sin(car.yaw);
  const backZ = Math.cos(car.yaw);
  const spots = [
    [car.position.x + rightX * 2.2, car.position.z + rightZ * 2.2],
    [car.position.x - rightX * 2.2, car.position.z - rightZ * 2.2],
    [car.position.x + backX * 3.4, car.position.z + backZ * 3.4],
    [car.position.x - backX * 3.4, car.position.z - backZ * 3.4],
  ];
  let spot = spots[0];
  for (const s of spots) {
    if (safeExit(s[0], s[1])) { spot = s; break; }
  }
  player.teleport(spot[0], spot[1], car.yaw);
  player.setVisible(true);
  mode = 'walk';
  chase.setMode('walk');
  chase.yaw = car.yaw;
  hud.setSpeed(null);
  hud.hidePrompt();
  hud.prompt('E', `Drive the ${CAR_NAME.toLowerCase()}`, 2.2);
}

/* --- input wiring ------------------------------------------------------ */

input.onEscape = () => setPaused(!paused);

input.onLockChange = (locked) => {
  if (locked) {
    wasLocked = true;
    hud.hidePrompt();
    return;
  }
  if (wasLocked && !staged && elapsed > 1.4 && !paused) setPaused(true);
};

canvas.addEventListener('click', () => {
  if (staged) return;
  if (paused) resume();
  else input.requestLock();
});

hud.onResume = () => resume();

window.addEventListener('resize', () => world.resize());

/* --- staging ----------------------------------------------------------- */

function applyShot(name) {
  const pose = SHOTS[name];
  if (!pose) return false;
  staged = true;
  input.enabled = false;
  hud.openPause(false);
  hud.setCinema(Boolean(pose.cinema));
  world.setTimeOfDay(pose.time);
  player.teleport(pose.player[0], pose.player[1], pose.player[2]);
  player.setVisible(!pose.driving);
  car.place(pose.car[0], pose.car[1], pose.car[2]);
  chase.place(
    new THREE.Vector3(pose.eye[0], pose.eye[1], pose.eye[2]),
    new THREE.Vector3(pose.look[0], pose.look[1], pose.look[2]),
    pose.fov,
  );
  hud.showTitle(Boolean(pose.titleCard));
  hud.setSpeed(null);
  hud.veiled(false);
  return true;
}

const stagedHere = shot ? applyShot(shot) : false;
if (!stagedHere) {
  hud.veiled(false);
  window.setTimeout(() => {
    if (!input.locked && !paused) hud.prompt('Click', 'Look around', 3.2);
  }, 1800);
}

/* --- loop -------------------------------------------------------------- */

let last = performance.now();

function tick(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  elapsed += dt;

  city.update(dt);

  if (!staged && !paused) {
    if (mode === 'walk') {
      const axes = input.axes();
      player.update(dt, axes, chase.yaw, input.pressed('Space'), city.colliders, city.groundHeight);
      const distance = Math.hypot(player.position.x - car.position.x, player.position.z - car.position.z);
      if (!nearCar && distance < 4.4) {
        nearCar = true;
        hud.prompt('E', `Drive the ${CAR_NAME.toLowerCase()}`);
      } else if (nearCar && distance > 5.6) {
        nearCar = false;
        hud.hidePrompt();
      }
      if (input.pressed('KeyE') && distance < 4.8) enterCar();
    } else {
      const axes = input.axes();
      car.update(
        dt,
        { throttle: Math.max(0, axes.y), brake: Math.max(0, -axes.y), steer: -axes.x },
        city.colliders,
        city.groundHeight,
      );
      if (car.speed > 16) chase.addShake(0.0035);
      if (input.pressed('KeyE')) exitCar();
    }
  }

  if (!staged) {
    const pivot = mode === 'drive' ? car.position : player.position;
    chase.update(dt, input, pivot, mode === 'drive' ? car.yaw : null);
  }

  const focus = mode === 'drive' ? car.position : player.position;
  world.focus(focus);

  const marker = mode === 'drive'
    ? { x: car.position.x, z: car.position.z, yaw: car.yaw }
    : { x: player.position.x, z: player.position.z, yaw: player.facing };
  hud.setDistrict(districtAt(focus.z).name);
  hud.setSpeed(mode === 'drive' ? car.kmh : null);
  hud.update(dt, {
    layout: city.layout,
    player: marker,
    car: { x: car.position.x, z: car.position.z },
    driving: mode === 'drive',
  });

  world.render();
  input.endFrame();

  frames++;
  if (frames === 2) {
    const boot = document.getElementById('boot');
    if (boot) boot.classList.add('gone');
  }
  requestAnimationFrame(tick);
}

window.__salmora = {
  get mode() { return mode; },
  get paused() { return paused; },
  get staged() { return staged; },
  get frames() { return frames; },
  get player() {
    return { x: player.position.x, y: player.position.y, z: player.position.z, facing: player.facing };
  },
  get car() {
    return { x: car.position.x, z: car.position.z, speed: car.speed, heading: car.yaw, visible: car.group.visible };
  },
  get camera() {
    return { yaw: chase.yaw, x: world.camera.position.x, y: world.camera.position.y, z: world.camera.position.z };
  },
  get colliders() { return city.colliders.length; },
};

requestAnimationFrame(tick);
