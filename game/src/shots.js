// The three scenes behind ?shot=title|drive|street. Each one sets up the same world the player
// gets, plays the real rules forward for a fixed number of steps and leaves the camera where a
// photographer would want it, so the same seed always frames the same picture.
import * as THREE from '../vendor/three.module.min.js';
import { roadCenter } from './config.js';
import { groundHeight } from './city.js';

const STEP = 1 / 60;

const IDLE = {
  axisForward: () => 0,
  axisStrafe: () => 0,
  sprinting: false,
  handbrake: false,
  consumePress: () => false,
  endFrame: () => {},
};

const THROTTLE = { ...IDLE, axisForward: () => 1 };
const CORNERING = { ...IDLE, axisForward: () => 1, axisStrafe: () => 1 };

function run(game, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) game.step(STEP, input, game.mode);
}

function frameCamera(game, position, lookAt) {
  game.camera.position.copy(position);
  game.camera.lookAt(lookAt);
  game.rig.freeze(position, lookAt);
}

/** The cover: the bay from above the roofs, sun off the water, the grid running to the sea. */
function stageTitle(game) {
  game.setMode('foot');
  game.player.position.set(38, groundHeight(38, 34), 34);
  game.player.mesh.position.copy(game.player.position);
  game.player.facing = Math.PI;
  game.player.mesh.rotation.y = Math.PI;
  game.car.place(roadCenter(3) - 2.6, 26, Math.PI);

  run(game, 0.6, IDLE);
  const eye = new THREE.Vector3(150, 72, 232);
  const look = new THREE.Vector3(-24, 6, -250);
  frameCamera(game, eye, look);
  game.hud.hide();
  game.boot.show();
}

/** A run down the boulevard in the car: palms, tower walls, the crossing coming up. */
function stageDrive(game) {
  game.setMode('car');
  game.car.place(roadCenter(3) - 2.6, 186, Math.PI);
  game.car.speed = 0;
  game.rig.snap();
  game.boot.hide();
  game.hud.show();
  run(game, 5.4, THROTTLE);
  game.rig.snap();
  run(game, 2 / 60, THROTTLE);
  game.hud.update({ mode: 'car', player: game.player, car: game.car, cameraYaw: game.rig.yaw });
}

/** On foot on a corner, the car at the kerb and the towers of the bay behind. */
function stageStreet(game) {
  game.setMode('foot');
  game.player.position.set(39, groundHeight(39, 12), 12);
  game.player.mesh.position.copy(game.player.position);
  game.player.facing = Math.PI;
  game.car.place(roadCenter(3) - 2.6, 30, Math.PI);
  game.rig.yaw = Math.PI * 0.92;
  game.rig.pitch = 0.06;
  game.boot.hide();
  game.hud.show();
  run(game, 1.4, IDLE);
  game.hud.update({ mode: 'foot', player: game.player, car: game.car, cameraYaw: game.rig.yaw });
}

/** The car stopped across a crossing, seen from the pavement: kerbs, paint, palms. */
function stageCorner(game) {
  game.setMode('car');
  game.car.place(roadCenter(3) - 2.6, roadCenter(2) + 34, Math.PI);
  game.car.speed = 0;
  game.rig.snap();
  game.boot.hide();
  game.hud.show();
  run(game, 1.9, THROTTLE);
  const eye = game.car.position.clone().add(new THREE.Vector3(-9.5, 3.4, -12.5));
  const look = game.car.position.clone().add(new THREE.Vector3(1.5, 0.9, 1.5));
  frameCamera(game, eye, look);
  game.hud.update({ mode: 'car', player: game.player, car: game.car, cameraYaw: game.rig.yaw });
}

/** Down on the sand by the sea wall, the bay opening up behind the car. */
function stageBay(game) {
  game.setMode('car');
  game.car.place(70, -318, Math.PI * 0.62);
  game.car.speed = 0;
  game.rig.snap();
  run(game, 0.4, IDLE);
  game.player.position.set(52, 0.2, -304);
  game.player.mesh.position.copy(game.player.position);
  game.player.facing = Math.PI * 0.86;
  game.player.mesh.rotation.y = game.player.facing;
  game.player.setVisible(true);
  game.boot.hide();
  game.hud.show();
  const eye = new THREE.Vector3(112, 5.6, -268);
  const look = new THREE.Vector3(34, 2.2, -352);
  frameCamera(game, eye, look);
  game.hud.update({ mode: 'car', player: game.player, car: game.car, cameraYaw: game.rig.yaw });
}

/** Stage the named scene; an unknown name falls back to the title. */
export function stageShot(name, game) {
  if (name === 'drive') {
    stageDrive(game);
    return 'drive';
  }
  if (name === 'street') {
    stageStreet(game);
    return 'street';
  }
  if (name === 'corner') {
    stageCorner(game);
    return 'corner';
  }
  if (name === 'bay') {
    stageBay(game);
    return 'bay';
  }
  stageTitle(game);
  return 'title';
}
