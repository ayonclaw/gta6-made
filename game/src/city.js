// Marisol Bay itself: the asphalt, the pavements, the lane paint, the beach and the towers.
// buildCity() returns the group plus the collision boxes and spawn the rest of the game uses.
import * as THREE from '../vendor/three.module.min.js';
import {
  CITY, CITY_HALF, CITY_SPAN, BLOCK_SIZE, LOT_SIZE, OCEAN, COLORS, SUN,
  blockCenter, roadCenter,
} from './config.js';
import {
  createAsphalt, createPavement, createSand, createFacadeTextures, createStorefrontTextures,
} from './textures.js';
import { range, chance } from './rng.js';
import { plantPalms, lightStreets, dressRoofs, parkCars } from './props.js';

/** Height of the ground at a point: the pavement of a block, or the road between blocks. */
export function groundHeight(x, z) {
  const blockX = Math.round((x + CITY_HALF) / CITY.pitch - 0.5);
  const blockZ = Math.round((z + CITY_HALF) / CITY.pitch - 0.5);
  if (blockX < 0 || blockZ < 0 || blockX >= CITY.cells || blockZ >= CITY.cells) return 0;
  const centreX = blockCenter(blockX);
  const centreZ = blockCenter(blockZ);
  if (Math.abs(x - centreX) < BLOCK_SIZE / 2 && Math.abs(z - centreZ) < BLOCK_SIZE / 2) return CITY.curbHeight;
  return 0;
}

/** Slide a circle out of every building footprint it overlaps; returns the corrected position. */
export function pushOutOfBoxes(boxes, x, z, radius) {
  let px = x;
  let pz = z;
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    const closestX = Math.max(box.minX, Math.min(px, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
    const deltaX = px - closestX;
    const deltaZ = pz - closestZ;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (distanceSquared > radius * radius) continue;
    if (distanceSquared > 0.000001) {
      const distance = Math.sqrt(distanceSquared);
      const push = radius - distance;
      px += (deltaX / distance) * push;
      pz += (deltaZ / distance) * push;
    } else {
      const left = px - box.minX;
      const right = box.maxX - px;
      const back = pz - box.minZ;
      const front = box.maxZ - pz;
      const smallest = Math.min(left, right, back, front);
      if (smallest === left) px = box.minX - radius;
      else if (smallest === right) px = box.maxX + radius;
      else if (smallest === back) pz = box.minZ - radius;
      else pz = box.maxZ + radius;
    }
  }
  return { x: px, z: pz };
}

function buildGround(parent, surfaces) {
  const outskirts = new THREE.Mesh(
    new THREE.PlaneGeometry(4200, 4200),
    new THREE.MeshStandardMaterial({ color: COLORS.outskirt, roughness: 1 }),
  );
  outskirts.rotation.x = -Math.PI / 2;
  outskirts.position.y = -0.62;
  outskirts.receiveShadow = true;
  parent.add(outskirts);

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_SPAN + 70, CITY_SPAN + 70),
    new THREE.MeshStandardMaterial({ map: surfaces.asphalt, roughness: 0.94, metalness: 0.02 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  parent.add(asphalt);
}

function buildBay(parent, surfaces) {
  const depth = Math.abs(OCEAN.beachEnd - OCEAN.beachStart);
  const beach = new THREE.Mesh(
    new THREE.BoxGeometry(2400, 0.5, depth),
    new THREE.MeshStandardMaterial({ map: surfaces.sand, roughness: 1 }),
  );
  beach.position.set(0, -0.05, (OCEAN.beachStart + OCEAN.beachEnd) / 2);
  beach.receiveShadow = true;
  parent.add(beach);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 1500, 1, 1),
    new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.14, metalness: 0.5 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, OCEAN.level, OCEAN.beachEnd - 750);
  parent.add(water);

  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 9),
    new THREE.MeshStandardMaterial({ color: 0xf7fbfc, roughness: 0.6, transparent: true, opacity: 0.75 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.02, OCEAN.beachEnd + 3);
  parent.add(foam);

  // A low sea wall separates the last row of blocks from the sand.
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(2400, 1.1, 3),
    new THREE.MeshStandardMaterial({ color: 0xe6ddca, roughness: 0.9 }),
  );
  wall.position.set(0, 0.55, OCEAN.beachStart + 1.5);
  wall.castShadow = true;
  wall.receiveShadow = true;
  parent.add(wall);
}

/** Lane dashes down the middle of every street, and crosswalks at every crossing. */
function buildStreets(parent) {
  const paintMaterial = new THREE.MeshStandardMaterial({ color: COLORS.laneMark, roughness: 0.7 });
  const dashes = [];
  const stripeGeometry = new THREE.BoxGeometry(0.8, 0.02, 4.4);
  const crossings = [];

  const nearCrossing = (value) => {
    for (let index = 0; index <= CITY.cells; index += 1) {
      if (Math.abs(value - roadCenter(index)) < CITY.roadWidth / 2 + 6) return true;
    }
    return false;
  };

  for (let index = 0; index <= CITY.cells; index += 1) {
    const centre = roadCenter(index);
    for (let along = -CITY_HALF; along <= CITY_HALF; along += 9) {
      if (nearCrossing(along)) continue;
      dashes.push({ x: along, z: centre, turn: Math.PI / 2 });
      dashes.push({ x: centre, z: along, turn: 0 });
    }
  }

  for (let first = 0; first <= CITY.cells; first += 1) {
    for (let second = 0; second <= CITY.cells; second += 1) {
      const x = roadCenter(first);
      const z = roadCenter(second);
      for (const side of [-1, 1]) {
        for (let stripe = -4; stripe <= 4; stripe += 1) {
          crossings.push({ x: x + stripe * 2.0, z: z + side * 11.4, turn: 0 });
          crossings.push({ x: x + side * 11.4, z: z + stripe * 2.0, turn: Math.PI / 2 });
        }
      }
    }
  }

  const dashMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.02, 4.2),
    paintMaterial,
    dashes.length,
  );
  const stripeMesh = new THREE.InstancedMesh(stripeGeometry, paintMaterial, crossings.length);
  const dummy = new THREE.Object3D();
  dashes.forEach((dash, index) => {
    dummy.position.set(dash.x, 0.03, dash.z);
    dummy.rotation.set(0, dash.turn, 0);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(index, dummy.matrix);
  });
  crossings.forEach((stripe, index) => {
    dummy.position.set(stripe.x, 0.028, stripe.z);
    dummy.rotation.set(0, stripe.turn, 0);
    dummy.updateMatrix();
    stripeMesh.setMatrixAt(index, dummy.matrix);
  });
  dashMesh.frustumCulled = false;
  stripeMesh.frustumCulled = false;
  parent.add(dashMesh);
  parent.add(stripeMesh);
}

function buildBlocks(parent, random, surfaces, colliders, buildings) {
  const pavementMaterial = new THREE.MeshStandardMaterial({ map: surfaces.pavement, roughness: 0.9 });

  for (let blockX = 0; blockX < CITY.cells; blockX += 1) {
    for (let blockZ = 0; blockZ < CITY.cells; blockZ += 1) {
      const centreX = blockCenter(blockX);
      const centreZ = blockCenter(blockZ);

      const pavement = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE, CITY.curbHeight, BLOCK_SIZE),
        pavementMaterial,
      );
      pavement.position.set(centreX, CITY.curbHeight / 2, centreZ);
      pavement.receiveShadow = true;
      pavement.castShadow = false;
      parent.add(pavement);

      const core = 1 - Math.max(Math.abs(blockX - 2), Math.abs(blockZ - 2)) / 2;
      const plot = (BLOCK_SIZE - CITY.sidewalkWidth * 2) / 2;

      for (let cornerX = 0; cornerX < 2; cornerX += 1) {
        for (let cornerZ = 0; cornerZ < 2; cornerZ += 1) {
          if (chance(random, 0.14)) continue;
          const plotX = centreX + (cornerX === 0 ? -plot / 2 : plot / 2);
          const plotZ = centreZ + (cornerZ === 0 ? -plot / 2 : plot / 2);
          const width = range(random, 17, plot - CITY.lotInset * 2);
          const depth = range(random, 17, plot - CITY.lotInset * 2);
          const height = Math.round(range(random, 9, 21) + core * range(random, 14, 52));
          const x = plotX + range(random, -1.6, 1.6);
          const z = plotZ + range(random, -1.6, 1.6);
          addBuilding(parent, random, surfaces, buildings, { x, z, width, depth, height, blockX, blockZ });
          colliders.push({
            minX: x - width / 2 - 0.4,
            maxX: x + width / 2 + 0.4,
            minZ: z - depth / 2 - 0.4,
            maxZ: z + depth / 2 + 0.4,
          });
        }
      }
    }
  }
}

function addTower(parent, facade, x, z, width, depth, height, baseY) {
  const texture = facade.map.clone();
  texture.needsUpdate = true;
  texture.repeat.set(Math.max(1, Math.round(width / 8)), Math.max(1, Math.round(height / 9)));
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, metalness: 0.06 }),
  );
  tower.position.set(x, baseY + height / 2, z);
  tower.castShadow = true;
  tower.receiveShadow = true;
  parent.add(tower);
  return tower;
}

function addBuilding(parent, random, surfaces, buildings, spec) {
  const { x, z, width, depth, height } = spec;
  const variant = Math.floor(random() * surfaces.facades.length);
  const facade = surfaces.facades[variant];
  const storefront = surfaces.storefronts[variant];
  const base = CITY.curbHeight;
  const podiumHeight = Math.min(4.4, Math.max(3.2, height * 0.28));
  const towerHeight = height - podiumHeight;

  const storeTexture = storefront.clone();
  storeTexture.needsUpdate = true;
  storeTexture.repeat.set(Math.max(1, Math.round(width / 12)), 1);
  const podium = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.9, podiumHeight, depth + 0.9),
    new THREE.MeshStandardMaterial({ map: storeTexture, roughness: 0.45, metalness: 0.25 }),
  );
  podium.position.set(x, base + podiumHeight / 2, z);
  podium.castShadow = true;
  podium.receiveShadow = true;
  parent.add(podium);

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.7, 0.3, depth + 1.7),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(facade.facade.accent), roughness: 0.85 }),
  );
  awning.position.set(x, base + podiumHeight + 0.15, z);
  awning.castShadow = true;
  awning.receiveShadow = true;
  parent.add(awning);

  const stepped = height > 32 && random() < 0.7;
  let roofWidth = width;
  let roofDepth = depth;
  if (stepped) {
    const lower = towerHeight * 0.6;
    const upper = towerHeight - lower;
    addTower(parent, facade, x, z, width, depth, lower, base + podiumHeight);
    roofWidth = width * 0.74;
    roofDepth = depth * 0.74;
    addTower(parent, facade, x, z, roofWidth, roofDepth, upper, base + podiumHeight + lower);
  } else {
    addTower(parent, facade, x, z, width, depth, towerHeight, base + podiumHeight);
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(roofWidth + 0.7, 0.45, roofDepth + 0.7),
    new THREE.MeshStandardMaterial({ color: 0xd7cebd, roughness: 0.95 }),
  );
  roof.position.set(x, base + height - 0.05, z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  parent.add(roof);

  buildings.push({
    x, z, width, depth, roofWidth, roofDepth, height,
    top: base + height,
    accent: facade.facade.accent,
  });
}


/** Put the whole bay together and hand back what the player, the car and the HUD need. */
export function buildCity(scene, random) {
  const group = new THREE.Group();
  group.name = 'MarisolBay';
  const surfaces = {
    asphalt: createAsphalt(random),
    pavement: createPavement(random),
    sand: createSand(random),
    facades: createFacadeTextures(random),
    storefronts: createStorefrontTextures(random),
  };
  const colliders = [];
  const buildings = [];

  buildGround(group, surfaces);
  buildStreets(group);
  buildBlocks(group, random, surfaces, colliders, buildings);
  parkCars(group, random, colliders);
  buildBay(group, surfaces);
  plantPalms(group, random, buildings);
  lightStreets(group);
  dressRoofs(group, random, buildings);

  scene.add(group);

  const spawn = { x: roadCenter(3) - 6.5, z: roadCenter(3) + 6.5 };
  return {
    group,
    colliders,
    buildings,
    spawn,
    sun: new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize(),
  };
}
