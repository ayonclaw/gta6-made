// Marisol Bay itself: the asphalt, the pavements, the lane paint, the beach, the towers and the
// landmarks. buildCity() returns the group plus the collision boxes and spawn the rest of the
// game uses.
import * as THREE from '../vendor/three.module.min.js';
import {
  CITY, CITY_HALF, CITY_SPAN, BLOCK_SIZE, LOT_SIZE, OCEAN, COLORS, SUN,
  blockCenter, roadCenter,
} from './config.js';
import {
  createAsphalt, createPavement, createSand, createWater, createFacadeTextures,
  createStorefrontTextures, createSignTexture,
} from './textures.js';
import { range, chance, pick } from './rng.js';
import { plantPalms, lightStreets, dressRoofs, parkCars, dressCorners } from './props.js';
import { buildLandmarks } from './landmarks.js';

/** Raised surfaces the walker can stand on: pushed to by the pier and read by groundHeight. */
export const PLATFORMS = [];

/** Height of the ground at a point: a pier deck, a pavement, or the road between blocks. */
export function groundHeight(x, z) {
  for (let index = 0; index < PLATFORMS.length; index += 1) {
    const platform = PLATFORMS[index];
    if (x > platform.minX && x < platform.maxX && z > platform.minZ && z < platform.maxZ) return platform.y;
  }
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
    new THREE.MeshStandardMaterial({ map: surfaces.water, roughness: 0.12, metalness: 0.55 }),
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

  // A low sea wall separates the last row of blocks from the sand, with a gap at the pier.
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe6ddca, roughness: 0.9 });
  for (const segment of [[-1200, 1200 + (roadCenter(3) - 12)], [roadCenter(3) + 26, 1200]]) {
    const width = segment[1] - segment[0];
    if (width <= 0) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 3), wallMaterial);
    wall.position.set((segment[0] + segment[1]) / 2, 0.55, OCEAN.beachStart + 1.5);
    wall.castShadow = true;
    wall.receiveShadow = true;
    parent.add(wall);
  }
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

/** Which family suits a building of this height: glass and deco go up, brick and stone stay low. */
function pickVariant(random, surfaces, height) {
  const tall = height > 44;
  const low = height < 20;
  const wanted = tall
    ? (chance(random, 0.55) ? 'glass' : 'deco')
    : low
      ? pick(random, ['brick', 'brick', 'stone', 'deco'])
      : pick(random, ['deco', 'deco', 'stone', 'glass', 'brick']);
  const matches = [];
  surfaces.facades.forEach((entry, index) => {
    if (entry.family === wanted) matches.push(index);
  });
  return matches.length ? pick(random, matches) : 0;
}

function buildBlocks(parent, random, surfaces, colliders, buildings, reserved, staff) {
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
          if (chance(random, 0.12)) continue;
          const plotX = centreX + (cornerX === 0 ? -plot / 2 : plot / 2);
          const plotZ = centreZ + (cornerZ === 0 ? -plot / 2 : plot / 2);
          const width = range(random, 17, plot - CITY.lotInset * 2);
          const depth = range(random, 17, plot - CITY.lotInset * 2);
          const height = Math.round(range(random, 8, 20) + core * range(random, 12, 58) + (random() < 0.08 ? 26 : 0));
          const x = plotX + range(random, -1.6, 1.6);
          const z = plotZ + range(random, -1.6, 1.6);
          const footprint = { minX: x - width / 2 - 2, maxX: x + width / 2 + 2, minZ: z - depth / 2 - 2, maxZ: z + depth / 2 + 2 };
          const clashes = [...reserved, ...staff].some((area) => !(
            footprint.maxX < area.minX || footprint.minX > area.maxX
            || footprint.maxZ < area.minZ || footprint.minZ > area.maxZ
          ));
          if (clashes) continue;

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
    new THREE.MeshStandardMaterial({ map: texture, roughness: facade.family === 'glass' ? 0.28 : 0.72, metalness: facade.family === 'glass' ? 0.5 : 0.06 }),
  );
  tower.position.set(x, baseY + height / 2, z);
  tower.castShadow = true;
  tower.receiveShadow = true;
  parent.add(tower);
  return tower;
}

const ROOF_SIGNS = ['MARISOL', 'BAY HOTEL', 'DEL SOL', 'CASA NORTE'];

function addBuilding(parent, random, surfaces, buildings, spec) {
  const { x, z, width, depth, height } = spec;
  const variant = pickVariant(random, surfaces, height);
  const facade = surfaces.facades[variant];
  const base = CITY.curbHeight;
  const podiumHeight = Math.min(4.6, Math.max(3.2, height * 0.26));
  const towerHeight = height - podiumHeight;

  // Ground floor: a shop with a named fascia, or a plain stone base for the towers.
  if (height < 42 || chance(random, 0.55)) {
    const shop = chance(random, 0.7)
      ? pick(random, surfaces.storefronts)
      : surfaces.storefronts[variant * 4 % surfaces.storefronts.length];
    const storeTexture = shop.map.clone();
    storeTexture.needsUpdate = true;
    storeTexture.repeat.set(Math.max(1, Math.round(width / 12)), 1);
    const podium = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.9, podiumHeight, depth + 0.9),
      new THREE.MeshStandardMaterial({ map: storeTexture, roughness: 0.45, metalness: 0.22 }),
    );
    podium.position.set(x, base + podiumHeight / 2, z);
    podium.castShadow = true;
    podium.receiveShadow = true;
    parent.add(podium);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.7, 0.3, depth + 1.7),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(shop.accent), roughness: 0.85 }),
    );
    awning.position.set(x, base + podiumHeight + 0.15, z);
    awning.castShadow = true;
    awning.receiveShadow = true;
    parent.add(awning);
    buildings.push({ x, z, width, depth, height: podiumHeight, top: base + podiumHeight, shop: shop.name });
  }

  const stepped = height > 30 && random() < 0.72;
  let roofWidth = width;
  let roofDepth = depth;
  if (stepped) {
    const lower = towerHeight * 0.62;
    const upper = towerHeight - lower;
    addTower(parent, facade, x, z, width, depth, lower, base + podiumHeight);
    roofWidth = width * 0.72;
    roofDepth = depth * 0.72;
    addTower(parent, facade, x, z, roofWidth, roofDepth, upper, base + podiumHeight + lower);
  } else {
    addTower(parent, facade, x, z, width, depth, towerHeight, base + podiumHeight);
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(roofWidth + 0.7, 0.45, roofDepth + 0.7),
    new THREE.MeshStandardMaterial({ color: facade.family === 'brick' ? 0x9a6a4c : 0xd7cebd, roughness: 0.95 }),
  );
  roof.position.set(x, base + height - 0.05, z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  parent.add(roof);

  // A few rooftops carry a board with the building's name on it: the skyline gets words.
  if (height > 34 && chance(random, 0.3)) {
    const texture = createSignTexture(pick(random, ROOF_SIGNS), {
      width: 512, height: 128, size: 60, background: '#1b2a30', border: facade.facade.accent,
    });
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(roofWidth * 0.9, roofWidth * 0.22),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
    );
    board.position.set(x, base + height + roofWidth * 0.16, z + roofDepth / 2 + 0.2);
    parent.add(board);
  }

  buildings.push({
    x, z, width, depth, roofWidth, roofDepth, height,
    top: base + height,
    accent: facade.facade.accent,
    family: facade.family,
  });
}


/** Put the whole bay together and hand back what the player, the cars and the HUD need. */
export function buildCity(scene, random) {
  const group = new THREE.Group();
  group.name = 'MarisolBay';
  const surfaces = {
    asphalt: createAsphalt(random),
    pavement: createPavement(random),
    sand: createSand(random),
    water: createWater(random),
    facades: createFacadeTextures(random),
    storefronts: createStorefrontTextures(random),
  };
  const colliders = [];
  const buildings = [];
  PLATFORMS.length = 0;

  buildGround(group, surfaces);
  buildStreets(group);
  buildBay(group, surfaces);

  // Landmarks reserve their lots before the procedural blocks fill in around them.
  const landmarks = buildLandmarks(group, random, colliders, PLATFORMS);
  buildBlocks(group, random, surfaces, colliders, buildings, landmarks.reserved, []);
  parkCars(group, random, colliders);
  plantPalms(group, random, buildings);
  dressCorners(group, random, colliders);
  lightStreets(group);
  dressRoofs(group, random, buildings);

  scene.add(group);

  const spawn = { x: roadCenter(3) - 6.5, z: roadCenter(3) + 6.5 };
  return {
    group,
    colliders,
    buildings,
    landmarks,
    spawn,
    sun: new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize(),
  };
}
