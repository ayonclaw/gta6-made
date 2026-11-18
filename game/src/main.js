// Palm Havoc — boot, the frame loop, and the two things the player switches between: walking
// Marisol Bay and driving the car parked at the kerb.
import * as THREE from '../vendor/three.module.min.js';
import { blockCenter, roadCenter } from './config.js';
import { makeRandom, hashSeed } from './rng.js';
import { buildCity, groundHeight, pushOutOfBoxes } from './city.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Car } from './vehicle.js';
import { ChaseCamera } from './camera.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = params.get('seed') || 'marisol';

const canvas = document.getElementById('view');
const bootPanel = document.getElementById('boot');
const startButton = document.getElementById('start-button');

const world = createWorld(canvas);
const city = buildCity(world.scene, makeRandom(hashSeed(seed)));
const player = new Player(world.scene, city);
const car = new Car(world.scene, city, { x: roadCenter(3) - 2.6, z: blockCenter(2) - 6, heading: Math.PI });
const rig = new ChaseCamera(world.camera);
const hud = new Hud();
const input = new Input(canvas);

let mode = 'foot';
let running = false;
let lastTime = 0;

player.position.set(blockCenter(2) + 37, 0, blockCenter(2) + 26);
player.position.y = groundHeight(player.position.x, player.position.z);
player.mesh.position.copy(player.position);
const toCarX = car.position.x - player.position.x;
const toCarZ = car.position.z - player.position.z;
player.facing = Math.atan2(toCarX, toCarZ);
player.mesh.rotation.y = player.facing;
rig.yaw = Math.atan2(-toCarX, -toCarZ);
rig.snap();

const boot = {
  show() {
    bootPanel.classList.remove('dismissed');
  },
  hide() {
    bootPanel.classList.add('dismissed');
  },
};

/** One tick of the world: whoever is being controlled moves, the camera follows. */
function step(dt, controls, activeMode) {
  if (activeMode === 'car') {
    car.update(dt, controls, true);
    player.setVisible(false);
  } else {
    car.update(dt, controls, false);
    player.update(dt, controls, rig.yaw);
  }
  const subject = activeMode === 'car' ? car : player;
  rig.update(dt, activeMode, subject);
  world.follow(subject.position || subject);
}

/** E at the kerb: get in if the car is close enough. */
function tryEnterCar() {
  if (mode !== 'foot') return false;
  if (car.distanceTo(player.position) > 5.5) return false;
  mode = 'car';
  car.occupied = true;
  player.setVisible(false);
  player.velocity.set(0, 0, 0);
  rig.snap();
  return true;
}

/** E while driving: step out on the driver's side, clear of the door. */
function tryLeaveCar() {
  if (mode !== 'car') return false;
  mode = 'foot';
  car.occupied = false;
  car.speed *= 0.2;
  const right = new THREE.Vector3(-Math.cos(car.heading), 0, Math.sin(car.heading));
  const spot = car.position.clone().addScaledVector(right, 2.6);
  const corrected = pushOutOfBoxes(city.colliders, spot.x, spot.z, 0.42);
  player.position.set(corrected.x, groundHeight(corrected.x, corrected.z), corrected.z);
  player.velocity.set(0, 0, 0);
  player.mesh.position.copy(player.position);
  player.setVisible(true);
  rig.snap();
  return true;
}

const game = {
  world,
  city,
  camera: world.camera,
  player,
  car,
  rig,
  hud,
  boot,
  input,
  step,
  get mode() {
    return mode;
  },
  setMode(next) {
    mode = next;
    car.occupied = next === 'car';
    player.setVisible(next !== 'car');
  },
  enterCar: tryEnterCar,
  leaveCar: tryLeaveCar,
};

startButton.textContent = 'Click to roam';
startButton.disabled = false;

if (shotName) {
  stageShot(shotName, game);
  running = false;
  lastTime = 0;
}

function begin() {
  if (running) return;
  running = true;
  boot.hide();
  hud.show();
  input.requestLock();
  lastTime = 0;
}

startButton.addEventListener('click', begin);
window.addEventListener('keydown', (event) => {
  if (!running && (event.code === 'Enter' || event.code === 'Space')) {
    event.preventDefault();
    begin();
  }
});
canvas.addEventListener('click', () => {
  if (running && !input.locked) input.requestLock();
});

const FIXED_STEP = 1 / 60;
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastTime ? Math.min(0.25, (now - lastTime) / 1000) : FIXED_STEP;
  lastTime = now;

  if (running) {
    const look = input.takeLook();
    rig.look(look.x, look.y);
    if (input.consumePress('KeyE')) {
      if (mode === 'foot') tryEnterCar();
      else tryLeaveCar();
    }
    accumulator = Math.min(accumulator + dt, 0.3);
    while (accumulator >= FIXED_STEP) {
      step(FIXED_STEP, input, mode);
      accumulator -= FIXED_STEP;
    }
    hud.update({ mode, player, car, cameraYaw: rig.yaw });
  }

  world.render();
  input.endFrame();
}

requestAnimationFrame(frame);

// A small handle for the screenshot tool and for poking at a running build from the console.
window.palmHavoc = {
  scene: world.scene,
  camera: world.camera,
  renderer: world.renderer,
  player,
  car,
  rig,
  mode: () => mode,
  seed,
  ready: true,
};
