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
import { CAR_NAME, CITY, START, WALK, districtAt } from './config.js';
import { Rng, hashSeed } from './rng.js';
import { Traffic } from './traffic.js';
import { Crowd } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Audio } from './audio.js';
import { Save } from './save.js';

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
    player: [37, 33, Math.PI],
    car: [33, 40, 0],
    eye: [29, 3.4, 92],
    look: [29, 1.4, 26],
    fov: 55,
    focus: [29, 40],
    restock: 45,
    crowd: 70,
  },
  chase: {
    time: 0.78,
    player: [16.2, 34.7, 0],
    car: [16.4, 34.6, -Math.PI / 2],
    driving: true,
    eye: [34, 3.6, 34.8],
    look: [-12, 1.3, 34.3],
    fov: 48,
    focus: [8, 34],
    crowd: 60,
    stage: 'chase',
    police: [
      { x: 12.5, z: 32.8, yaw: -Math.PI / 2 },
      { x: 7.2, z: 35.8, yaw: -Math.PI / 2 },
      { x: 1.6, z: 33.0, yaw: -Math.PI / 2 },
      { x: -4.2, z: 35.4, yaw: -Math.PI / 2 },
    ],
  },
  mission: {
    time: 0.9,
    player: [9.4, 34.6, -Math.PI / 2],
    car: [3.6, 31.4, -Math.PI / 2],
    eye: [-1.5, 2.35, 40.2],
    look: [15.5, 1.4, 34.3],
    fov: 54,
    restock: 55,
    crowd: 45,
    stage: 'mission',
  },
  vista: {
    time: 0.9,
    player: [3, 35.6, 0],
    car: [4.2, 31.6, -Math.PI / 2],
    eye: [-30, 24, 258],
    look: [40, 4, 175],
    fov: 50,
    focus: [40, 178],
    restock: 90,
    crowd: 80,
    // Street 7 is the seafront avenue the eye looks down, the one street the
    // respawner never fills (it clamps to STREETS - 2). The shot lays the fleet
    // on its lanes and the crowd on its pavements instead, in metres.
    fill: {
      street: 7,
      from: -90,
      to: 170,
      lane: 3.1,
      cars: 46,
      // walkers, in strips: the two pavements either side of the avenue, then
      // the promenade the eye stands over, where a body is worth most pixels
      walkers: 92,
      strips: [
        { z: -8.6, from: -90, to: 170, share: 0.3 },
        { z: 8.6, from: -90, to: 170, share: 0.3 },
        { z: 15.5, from: -50, to: 80, share: 0.4 },
      ],
    },
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

/* --- the living city --------------------------------------------------- */

const lowQuality = params.get('quality') === 'low';
const spawnFocus = { x: city.spawn.x, z: city.spawn.z };

const traffic = new Traffic(world.scene, rng.fork(3), {
  count: lowQuality ? 64 : 76,
  focus: spawnFocus,
});
const crowd = new Crowd(world.scene, rng.fork(7), {
  count: lowQuality ? 108 : 132,
});
const police = new Police(world.scene, rng.fork(11));
const combat = new Combat(world.scene, world.camera, { low: lowQuality });
const missions = new Missions(world.scene);
const audio = new Audio();
const save = new Save();

let mode = 'walk';
let paused = false;
let staged = false;
let stagedFocus = null;
let stagedFill = null;
let nearCar = false;
let frames = 0;
let elapsed = 0;
let cash = START.cash;
let health = START.health;
let wasLocked = false;
let trigger = false;
let saveTimer = 6;
let crimeCooldown = 0;

hud.setCash(cash);
hud.setHealth(health);
hud.setStars(0);
hud.setWeapon(combat.magazine, combat.reserve, false);
hud.setDistrict(districtAt(city.spawn.z).name);

/* --- restore ----------------------------------------------------------- */

const stored = save.read();
if (stored) {
  cash = stored.cash;
  health = stored.health;
  missions.restore({ job: stored.job, step: stored.step, completed: stored.completed });
  police.stars = stored.stars;
  police.heat = stored.stars * 21;
  if (stored.stars > 0) police.spawnTimer = 3;
  combat.health = health;
  hud.setCash(cash);
  hud.setHealth(health);
  hud.setStars(stored.stars);
  if (stored.cash !== START.cash) hud.message('Salmora remembers you');
}

function persist() {
  save.write({
    cash,
    stars: police.stars,
    health: Math.round(combat.health),
    job: missions.index,
    step: missions.step,
    completed: missions.completed,
  });
}

/* --- mission plumbing --------------------------------------------------- */

function syncJobCard() {
  const job = missions.job;
  if (!job || missions.state === 'done') {
    hud.setJob(null);
    return;
  }
  hud.setJob({
    title: job.title,
    text: missions.objective,
    payout: job.payout,
    tag: `JOB ${missions.index + 1} / ${missions.jobs.length}`,
  });
}

missions.onPayout = (amount, title) => {
  cash += amount;
  hud.setCash(cash, true);
  hud.message(`+ $${amount} — ${title}`);
  audio.payout();
  persist();
};

missions.onMessage = (text) => hud.message(text);
missions.onLine = (text) => hud.say(text);
missions.onCrime = (levels) => {
  police.crime(levels, 'job');
  hud.setStars(police.stars);
};

/* --- damage and death --------------------------------------------------- */

function respawn() {
  player.teleport(city.spawn.x, city.spawn.z, city.spawn.yaw);
  player.setVisible(true);
  mode = 'walk';
  chase.setMode('walk');
  chase.yaw = city.spawn.yaw;
  combat.health = 100;
  combat.dead = false;
  combat.magazine = 12;
  combat.reserve = Math.max(combat.reserve, 24);
  police.clear();
  hud.setStars(0);
  hud.setHealth(100);
  hud.setWeapon(combat.magazine, combat.reserve, false);
  hud.message('Stitched up on the coast road');
  cash = Math.max(0, cash - 100);
  hud.setCash(cash);
  persist();
}

combat.onDeath = () => respawn();
combat.onDamage = (hp) => {
  hud.setHealth(hp);
  chase.addShake(0.14);
  audio.hit();
};
combat.onShoot = (point, kind) => {
  audio.shot();
  const heard = crowd.startle(point.x, point.z, 26, 1);
  if (kind === 'ped' || heard > 0) {
    if (crimeCooldown <= 0) {
      crimeCooldown = 1.6;
      police.crime(1, 'gunfire');
      hud.setStars(police.stars);
      persist();
    }
  }
};
combat.onHitPed = (person, point) => {
  crowd.startle(point.x, point.z, 24, 1.3);
  police.crime(1, 'assault');
  hud.setStars(police.stars);
};
combat.onHitPolice = (unit, point) => {
  police.hit(unit, 34);
  police.crime(1, 'police');
  hud.setStars(police.stars);
};
combat.onHitCar = (carHit, point) => {
  crowd.startle(point.x, point.z, 12, 0.5);
};
combat.onKick = (kick) => chase.addShake(kick * 0.22);
combat.onReload = () => audio.click();

crowd.onScream = () => audio.startle();

police.onShot = () => {
  audio.shot();
  chase.addShake(0.05);
};
police.onCrash = () => audio.hit();

/* --- audio needs a gesture ---------------------------------------------- */

function unlockAudio() {
  audio.unlock();
}
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('pointerdown', unlockAudio, { once: true });

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

function enterCar(stolen = null) {
  if (stolen) {
    traffic.take(stolen);
    car.place(stolen.x, stolen.z, stolen.yaw);
    police.crime(1, 'theft');
    hud.setStars(police.stars);
    crimeCooldown = 2.5;
    persist();
  }
  mode = 'drive';
  nearCar = false;
  player.setVisible(false);
  chase.setMode('drive');
  hud.setSpeed(0);
  hud.prompt('E', 'Step out onto the street', 2.4);
  hud.message(stolen ? 'Taken' : CAR_NAME);
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
  traffic.restock({ x: car.position.x, z: car.position.z });
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

canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0 && input.locked && !paused && !staged) trigger = true;
});

window.addEventListener('beforeunload', () => {
  if (!staged) persist();
});

hud.onResume = () => resume();

window.addEventListener('resize', () => world.resize());

/* --- staging ----------------------------------------------------------- */

/* How far inside the frame an object has to sit to be counted as in shot:
   the very edge of a render is not something a viewer reads. */
const EDGE = 0.97;

/** True when a world point lands inside the staged camera's frame. */
function inFrame(x, y, z) {
  const camera = world.camera;
  camera.updateMatrixWorld(true);
  const view = new THREE.Vector3(x, y, z).applyMatrix4(
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert(),
  );
  if (view.z > -1) return false;
  const ndc = new THREE.Vector3(x, y, z).project(camera);
  return Math.abs(ndc.x) <= EDGE && Math.abs(ndc.y) <= EDGE;
}

/** What the staged frame actually holds, projected exactly as it renders. */
function frustumCounts() {
  let cars = 0;
  let moving = 0;
  let walkers = 0;
  for (const car of traffic.cars) {
    if (!car.alive || !inFrame(car.x, 1, car.z)) continue;
    cars++;
    if (Math.abs(car.speed) > 0.5) moving++;
  }
  for (const person of crowd.people) {
    if (inFrame(person.x, 1.2, person.z)) walkers++;
  }
  return { cars, moving, walkers };
}

/** Run the ambient sim forward without waiting on the wall clock, so wheels are
 *  turning and legs mid-swing on the frame that gets shot. */
function stepStaged(seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    traffic.update(dt, { focus: stagedFocus, car: null, body: null, peds: crowd });
    crowd.update(dt, { car: null, traffic });
  }
}

/** Lay the street a shot frames with traffic and walkers. `traffic.reseed` only
 *  ever uses the inner streets (it clamps to STREETS - 2), so the seafront
 *  avenue a vista looks down never receives a car of its own and the frame
 *  reads as an empty town. The shot puts the fleet on its lanes and the crowd
 *  on its pavements by hand; a fixed scatter, not game RNG, so every capture
 *  is the same frame. */
function stageFill(fill) {
  const line = -CITY.half + fill.street * CITY.pitch + CITY.street / 2;
  const span = fill.to - fill.from;
  const fleet = Math.min(fill.cars, traffic.cars.length);
  const perLane = Math.max(1, Math.ceil(fleet / 2));
  const step = span / perLane;
  for (let i = 0; i < fleet; i++) {
    const car = traffic.cars[i];
    const dir = i % 2 === 0 ? -1 : 1;
    // lanes alternate by parity and a fixed quarter-slot scatter breaks the
    // even spacing, so the avenue reads as traffic in flow and not two rows
    // of parked cars
    const slot = Math.floor(i / 2) + 0.5 + ((i * 0.618) % 1 - 0.5) * 0.5;
    car.alive = true;
    car.axis = 'x';
    car.dir = dir;
    car.line = line + dir * fill.lane;
    car.along = fill.from + slot * step;
    car.x = car.along;
    car.z = car.line;
    car.yaw = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    car.speed = 6 + (i % 5) * 0.7;
    car.cruise = 10.5 + (i % 4) * 1.2;
    car.stuck = 0;
    car.next = null;
    car.nextK = undefined;
    car.nextClaimed = false;
  }
  let used = 0;
  for (const band of fill.strips) {
    const many = Math.min(Math.round(fill.walkers * band.share), crowd.people.length - used);
    const width = band.to - band.from;
    for (let i = 0; i < many; i++) {
      const person = crowd.people[used++];
      const x = band.from + ((i + 0.5) / Math.max(1, many)) * width;
      const z = line + band.z;
      person.x = x;
      person.z = z;
      person.y = CITY.kerb;
      person.state = 'walk';
      person.speed = person.walk;
      person.tx = x + (i % 2 ? 8 : -8);
      person.tz = z;
      person.timer = 30;
      person.yaw = i % 2 ? -Math.PI / 2 : Math.PI / 2;
      person.home = { x, z, r: 4 };
    }
  }
  stepStaged(1.6);
}

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
  // traffic respawns around the point the shot actually frames, so the coast
  // road carries cars instead of whatever happens to sit near the player pose
  stagedFocus = pose.focus ? { x: pose.focus[0], z: pose.focus[1] } : { x: pose.look[0], z: pose.look[2] };
  if (pose.restock) traffic.reseed(stagedFocus, pose.restock);
  if (pose.crowd) crowd.gather(stagedFocus, pose.crowd);
  chase.place(
    new THREE.Vector3(pose.eye[0], pose.eye[1], pose.eye[2]),
    new THREE.Vector3(pose.look[0], pose.look[1], pose.look[2]),
    pose.fov,
  );
  // a shot that frames a street the respawner leaves empty packs it itself,
  // once the eye is where the capture will hold it
  if (pose.fill) {
    stagedFill = pose.fill;
    stageFill(pose.fill);
  }
  hud.showTitle(Boolean(pose.titleCard));
  hud.setSpeed(null);
  hud.veiled(false);

  // a staged frame is always the same frame: no heat, job one, no marker
  police.clear();
  hud.setStars(0);
  missions.stage();
  missions.beacon.visible = false;

  if (pose.stage === 'chase') {
    police.stage(4, pose.police || []);
    hud.setStars(4);
    hud.setWeapon(combat.magazine, combat.reserve, false);
  }
  if (pose.stage === 'mission') {
    missions.beacon.visible = true;
    syncJobCard();
    hud.say('RUNNER: You are late. That is twice this week.');
    hud.setWeapon(combat.magazine, combat.reserve, false);
  }
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
  crimeCooldown = Math.max(0, crimeCooldown - dt);

  const here = mode === 'drive' ? car.position : player.position;
  const drivingCar = mode === 'drive'
    ? { x: car.position.x, z: car.position.z, yaw: car.yaw, speed: Math.abs(car.speed) }
    : null;

  if (!staged && !paused) {
    if (mode === 'walk') {
      const axes = input.axes();
      player.update(dt, axes, chase.yaw, input.pressed('Space'), city.colliders, city.groundHeight);
      const distance = Math.hypot(player.position.x - car.position.x, player.position.z - car.position.z);
      const theft = distance < 4.8 ? null : traffic.at(player.position.x, player.position.z, 5.2);
      if (distance < 4.6) {
        nearCar = true;
        hud.prompt('E', `Drive the ${CAR_NAME.toLowerCase()}`);
      } else if (theft) {
        nearCar = true;
        hud.prompt('E', 'Take the car');
      } else if (nearCar) {
        nearCar = false;
        hud.hidePrompt();
      }
      if (input.pressed('KeyE')) {
        if (distance < 4.8) enterCar();
        else if (theft) enterCar(theft);
      }
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

    police.update(dt, {
      player: { x: here.x, z: here.z },
      car: drivingCar,
      colliders: city.colliders,
      onFoot: mode === 'walk',
      onDamage: (amount) => combat.damage(amount, 'law'),
      onRam: (unit, dist) => {
        combat.damage(mode === 'drive' ? 4 : 9, 'ram');
        if (mode === 'drive') car.speed *= 0.55;
      },
      onMessage: (text) => hud.message(text),
    });
    missions.update(dt, {
      x: here.x,
      z: here.z,
      wanted: police.stars,
      interact: input.pressed('KeyE'),
    });
  }

  // Ambient life runs in a staged frame too: a car or a walker only reaches the
  // screen once update() writes its instance matrix, and a shot of the road is
  // supposed to show the road working. Staged traffic streams around the point
  // the camera frames instead of the frozen player pose.
  if (!paused) {
    traffic.update(dt, {
      focus: staged ? stagedFocus : { x: here.x, z: here.z },
      car: drivingCar,
      body: !staged && mode === 'walk' ? { x: player.position.x, z: player.position.z } : null,
      peds: crowd,
    });
    crowd.update(dt, { car: drivingCar, traffic });
  }

  combat.update(dt, {
    active: !staged && !paused && mode === 'walk',
    trigger: trigger || input.pressed('KeyF'),
    reload: input.pressed('KeyR'),
    time: elapsed,
    colliders: city.colliders,
    peds: crowd,
    police,
    traffic,
  });
  trigger = false;

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
  hud.setStars(police.stars);
  hud.setWeapon(combat.magazine, combat.reserve, combat.reloadingNow);
  hud.setHealth(combat.health);
  syncJobCard();

  let nearestUnit = Infinity;
  for (const unit of police.units) {
    nearestUnit = Math.min(nearestUnit, Math.hypot(unit.x - here.x, unit.z - here.z));
  }
  audio.update(dt, {
    speed: mode === 'drive' ? Math.abs(car.speed) : 0,
    driving: mode === 'drive',
    siren: police.stars > 0 && nearestUnit < 170,
    walking: mode === 'walk' && player.speed > 0.6,
    running: player.speed > 5.2,
  });

  hud.update(dt, {
    layout: city.layout,
    player: marker,
    car: { x: car.position.x, z: car.position.z },
    driving: mode === 'drive',
    marker: missions.marker,
  });

  if (!staged) {
    saveTimer -= dt;
    if (saveTimer <= 0) {
      saveTimer = 8;
      persist();
    }
  }

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
  ready: true,
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
  get cash() { return cash; },
  get health() { return combat.health; },
  get wanted() { return police.stars; },

  traffic,
  crowd,
  police,
  combat,
  missions,
  audio,
  save,
  hud,
  world,

  /** Put the walker somewhere without asking the physics. Used by probes. */
  teleport(x, z, yaw = chase.yaw) {
    player.teleport(x, z, yaw);
    chase.yaw = yaw;
    chase.pos.set(x + Math.sin(yaw) * 6, 3, z + Math.cos(yaw) * 6);
  },

  /** Re-pack a staged frame that fills its own street, then report what the
   *  camera holds. A capture that misses the bar is not worth taking. */
  restageFill() {
    if (!stagedFill) return null;
    stageFill(stagedFill);
    return frustumCounts();
  },

  /** What the current frame holds: cars, how many of them moving, walkers. */
  frustum: frustumCounts,

  report() {
    const info = world.renderer.info;
    return {
      frames,
      mode,
      cash,
      health: Math.round(combat.health),
      stars: police.stars,
      cars: traffic.cars.filter((c) => c.alive).length,
      carsMoving: traffic.moving(),
      peds: crowd.people.length,
      pedsMoving: crowd.moving(),
      units: police.units.length,
      mission: missions.report(),
      calls: info.render.calls,
      triangles: info.render.triangles,
    };
  },
};

requestAnimationFrame(tick);
