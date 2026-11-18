// The four scenes behind ?shot=vista|street|chase|mission. Each one sets up the same world the
// player gets, plays the real rules forward for a fixed number of steps and leaves the camera
// where a photographer would want it, so the same seed always frames the same picture.
import * as THREE from '../vendor/three.module.min.js';
import { roadCenter, blockCenter, OCEAN } from './config.js';
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

function run(game, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) game.step(STEP, input, game.mode);
}

function frameCamera(game, position, lookAt) {
  game.camera.position.copy(position);
  game.camera.lookAt(lookAt);
  game.rig.freeze(position, lookAt);
}

function settle(game) {
  game.boot.hide();
  game.hud.show();
  game.hud.update(0.016, game.hudState());
}

/** Cover: the whole bay from above the rooftops, Casa Alta on the left, the pier and the water beyond. */
function stageVista(game) {
  game.setMode('foot');
  game.player.position.set(52, groundHeight(52, 120), 120);
  game.player.mesh.position.copy(game.player.position);
  game.player.facing = Math.PI;
  game.player.mesh.rotation.y = Math.PI;
  game.player.setVisible(false);

  run(game, 6.0, IDLE);

  const eye = new THREE.Vector3(118, 68, -508);
  const look = new THREE.Vector3(6, 26, -96);
  frameCamera(game, eye, look);
  settle(game);
}

/** A busy block: pavement, walkers, cars queued at the lights, the towers above. */
function stageStreet(game) {
  game.setMode('foot');
  game.player.position.set(66, groundHeight(66, 58), 58);
  game.player.mesh.position.copy(game.player.position);
  game.player.facing = -2.4;
  game.player.mesh.rotation.y = game.player.facing;
  game.player.setVisible(true);
  game.rig.yaw = Math.PI * 0.9;
  game.rig.pitch = 0.02;

  run(game, 12.0, IDLE);

  const eye = new THREE.Vector3(66.0, 2.4, 58);
  const look = new THREE.Vector3(44, 1.4, 30);
  frameCamera(game, eye, look);
  settle(game);
}

/** A pursuit: four stars, two cruisers alongside, the boulevard running for the water. */
function stageChase(game) {
  game.setMode('car');
  game.car.place(roadCenter(3) - 0.6, 206, 0);
  game.car.speed = 27;
  game.rig.snap();

  game.police.setStars(4);
  game.police.place(0, roadCenter(3) - 7.6, 212, 0, 27);
  game.police.place(1, roadCenter(3) + 7.0, 210, 0, 27);
  game.police.place(2, roadCenter(3) - 2.2, 190, 0, 30);

  game.hud.show();
  game.boot.hide();
  run(game, 0.55, IDLE);

  game.hud.say('DISPATCH', 'All units, suspect in a stolen coupe heading south on the boulevard.', 8);
  game.hud.update(0.016, game.hudState());
}

/** The job: on the pier, the wheel turning, Sal on the radio, the objective on screen. */
function stageMission(game) {
  game.setMode('foot');
  const pierX = roadCenter(3) + 8;
  const wheelZ = OCEAN.waterStart - 66 + 16;
  game.player.position.set(pierX - 2.4, 1.4, wheelZ + 26);
  game.player.mesh.position.copy(game.player.position);
  game.player.facing = Math.PI * 0.02;
  game.player.mesh.rotation.y = game.player.facing;
  game.player.setVisible(true);

  game.missions.index = 0;
  game.missions.step = 1;
  game.missions.phase = 'active';
  game.missions.timer = 0;
  game.missions.refreshWaypoint();
  game.hud.setObjective('Curb Service — Drive it to Pier Nine');
  game.boot.hide();
  game.hud.show();

  run(game, 2.4, IDLE);

  game.hud.showMission('Curb Service', 'Sal wants a car that is not yours, and he wants it at the pier by sundown.', 999);
  game.hud.say('SAL', 'Pier Nine, before the light goes. And do not scratch it — that car is worth more than you.', 999);
  game.hud.update(0.016, game.hudState());

  const eye = new THREE.Vector3(pierX - 9.5, 4.2, wheelZ + 42);
  const look = new THREE.Vector3(pierX + 1.5, 6.5, wheelZ - 10);
  frameCamera(game, eye, look);
  game.hud.update(0.016, game.hudState());
}

/** Stage the named scene; an unknown name falls back to the vista. */
export function stageShot(name, game) {
  if (name === 'street') {
    stageStreet(game);
    return 'street';
  }
  if (name === 'chase') {
    stageChase(game);
    return 'chase';
  }
  if (name === 'mission') {
    stageMission(game);
    return 'mission';
  }
  stageVista(game);
  return 'vista';
}
