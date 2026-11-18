/* Salmora's street plan: a seven-by-seven grid of blocks, a seawall promenade,
   shopfronts at eye level and clutter on the roofs. Lots are chosen by seed. */

import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE, START, blockCentre, districtAt } from './config.js';
import { FACADE_TILE } from './textures.js';

const TILE = FACADE_TILE;
const INNER = CITY.block - CITY.walk * 2;
const QUAY = CITY.half + CITY.promenade;
const PIER_X = -64;

/* --- geometry batching ------------------------------------------------- */

class Batch {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
  }

  add(geo, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const u = g.attributes.uv.array;
    const c = new THREE.Color(color);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nor.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < u.length; i++) this.uv.push(u[i]);
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  get empty() {
    return this.pos.length === 0;
  }

  build(material) {
    if (this.empty) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

function quad(w, h, uRep, vRep) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uRep, uv.getY(i) * vRep);
  }
  return g;
}

function box(w, h, d, uRep = 1, vRep = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uRep, uv.getY(i) * vRep);
  }
  return g;
}

function tint(rng, hueLo = 0.05, hueHi = 0.13) {
  return new THREE.Color().setHSL(rng.range(hueLo, hueHi), rng.range(0.05, 0.22), rng.range(0.82, 1));
}

/* --- lots -------------------------------------------------------------- */

function divideLots(rng) {
  const span = INNER - 1.4;
  const roll = rng.next();
  if (roll < 0.24) {
    return [{ x: 0, z: 0, w: span, d: span }];
  }
  if (roll < 0.58) {
    const split = rng.range(0.36, 0.64);
    const w1 = span * split - 0.6;
    const w2 = span * (1 - split) - 0.6;
    return [
      { x: -span / 2 + w1 / 2, z: 0, w: w1, d: span },
      { x: span / 2 - w2 / 2, z: 0, w: w2, d: span },
    ];
  }
  const gap = 1.1;
  const half = (span - gap) / 2;
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push({ x: sx * (half / 2 + gap / 2), z: sz * (half / 2 + gap / 2), w: half, d: half });
    }
  }
  return out;
}

/* --- the city ---------------------------------------------------------- */

export function buildCity(scene, tex, rng) {
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const batches = {};
  for (const f of tex.facades) batches[f.key] = new Batch();
  const roofBatch = new Batch();
  const shopBatch = new Batch();
  const signBatch = new Batch();
  const slabBatch = new Batch();

  const colliders = [];
  const palms = [];
  const lamps = [];
  const clutter = { ac: [], tank: [], vent: [], antenna: [] };

  const facadeMats = {};
  for (const f of tex.facades) {
    facadeMats[f.key] = new THREE.MeshStandardMaterial({
      map: f.map,
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.02,
    });
  }
  const roofMat = new THREE.MeshStandardMaterial({ map: tex.roof, vertexColors: true, roughness: 0.98 });
  const shopMat = new THREE.MeshStandardMaterial({ map: tex.shop, vertexColors: true, roughness: 0.7, metalness: 0.08 });
  const signMat = new THREE.MeshStandardMaterial({
    map: tex.signs,
    emissive: 0xffffff,
    emissiveMap: tex.signs,
    emissiveIntensity: 0.42,
    roughness: 0.72,
    side: THREE.FrontSide,
  });
  const slabMat = new THREE.MeshStandardMaterial({ map: tex.pavement, vertexColors: true, roughness: 0.95 });

  /* ground + water ------------------------------------------------------ */

  const roadMat = new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.95, color: 0xffffff });
  tex.asphalt.repeat.set(CITY.span / 18, CITY.span / 18);
  // the tarmac stops at the promenade; past that it is water
  const groundDepth = QUAY + 1 + CITY.half + 120;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.span + 220, groundDepth), roadMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, (QUAY + 1 - CITY.half - 120) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const seaMat = new THREE.MeshStandardMaterial({
    map: tex.water,
    color: 0x3f8590,
    emissive: 0x0a2228,
    emissiveIntensity: 0.5,
    roughness: 0.36,
    metalness: 0.12,
  });
  tex.water.repeat.set(26, 26);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2200, 1000), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, CITY.seaY, QUAY + 500);
  group.add(sea);

  /* blocks -------------------------------------------------------------- */

  for (let j = 0; j < CITY.rows; j++) {
    for (let i = 0; i < CITY.cols; i++) {
      const c = blockCentre(i, j);
      const district = districtAt(c.z);
      const plaza = i === 3 && j === 3;

      // pavement slab with a lip
      const slab = box(CITY.block, CITY.kerb, CITY.block, 11, 11);
      slab.translate(c.x, CITY.kerb / 2, c.z);
      slabBatch.add(slab, new THREE.Color().setHSL(0.08, 0.04, 0.96));

      if (plaza) {
        addPlaza(c.x, c.z);
        continue;
      }

      const park = rng.chance(0.06);
      if (park) {
        palms.push({ x: c.x - 9, z: c.z - 9, h: rng.range(7, 11) });
        palms.push({ x: c.x + 9, z: c.z + 9, h: rng.range(7, 11) });
        palms.push({ x: c.x - 9, z: c.z + 9, h: rng.range(6, 10) });
        continue;
      }

      for (const lot of divideLots(rng)) {
        const h = district.minH + Math.pow(rng.next(), 1.55) * (district.maxH - district.minH);
        const famKeys = tex.facades.map((f) => f.key);
        const fam = rng.chance(0.68) ? district.family : rng.pick(famKeys);
        addBuilding(c.x + lot.x, c.z + lot.z, lot, h, fam, district, rng);
      }

      // corner palms on the pavement
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          if (rng.chance(0.72)) {
            palms.push({
              x: c.x + sx * (CITY.block / 2 - 1.6),
              z: c.z + sz * (CITY.block / 2 - 1.6),
              h: rng.range(7.5, 12),
            });
          }
        }
      }
    }
  }

  /* promenade, seawall, pier -------------------------------------------- */

  const prom = box(CITY.span, CITY.kerb, CITY.promenade, 44, 3);
  prom.translate(0, CITY.kerb / 2, CITY.half + CITY.promenade / 2);
  slabBatch.add(prom, new THREE.Color(0xffffff));

  const wallMat = new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95, color: 0xd8d2c4 });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(CITY.span + 60, 4.2, 1.6), wallMat);
  quay.position.set(0, -1.7, QUAY + 0.8);
  quay.receiveShadow = true;
  group.add(quay);

  // pier deck
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x6d5a45, roughness: 0.95 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 96), pierMat);
  deck.position.set(PIER_X, 0.4, QUAY + 48);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  const pylonGeo = new THREE.CylinderGeometry(0.28, 0.32, 5.4, 7);
  const pylons = new THREE.InstancedMesh(pylonGeo, pierMat, 26);
  const dummy = new THREE.Object3D();
  for (let k = 0; k < 26; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    dummy.position.set(PIER_X + side * 4, -1.9, QUAY + 6 + Math.floor(k / 2) * 7);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    pylons.setMatrixAt(k, dummy.matrix);
  }
  group.add(pylons);

  // promenade palms
  for (let x = -CITY.half + 12; x <= CITY.half - 12; x += 26) {
    palms.push({ x, z: CITY.half + 8, h: rng.range(8, 12) });
  }
  for (let x = -CITY.half + 18; x <= CITY.half - 18; x += 31) {
    lamps.push({ x, z: CITY.half + 3.2 });
  }

  /* kerbside lamps and lane paint --------------------------------------- */

  for (let j = 0; j < CITY.rows; j++) {
    for (let i = 0; i < CITY.cols; i++) {
      if ((i + j) % 2 === 0) continue;
      const c = blockCentre(i, j);
      lamps.push({ x: c.x - CITY.block / 2 - 1.4, z: c.z - CITY.block / 2 - 1.4 });
      lamps.push({ x: c.x + CITY.block / 2 + 1.4, z: c.z + CITY.block / 2 + 1.4 });
    }
  }

  const paintMat = new THREE.MeshStandardMaterial({ color: 0xe8e2cf, roughness: 0.8 });
  const dashGeo = new THREE.PlaneGeometry(0.42, 3.4);
  dashGeo.rotateX(-Math.PI / 2);
  const dashes = [];
  for (let i = 0; i <= CITY.rows; i++) {
    const streetZ = -CITY.half + i * CITY.pitch + CITY.street / 2;
    for (let x = -CITY.half + 6; x < CITY.half - 6; x += 9.5) {
      if (nearCross(x, streetZ)) continue;
      dashes.push({ x, z: streetZ, rot: 0 });
    }
    const streetX = -CITY.half + i * CITY.pitch + CITY.street / 2;
    for (let z = -CITY.half + 6; z < CITY.half - 6; z += 9.5) {
      if (nearCross(streetX, z)) continue;
      dashes.push({ x: streetX, z, rot: Math.PI / 2 });
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, paintMat, dashes.length);
  dashes.forEach((d, k) => {
    dummy.position.set(d.x, 0.012, d.z);
    dummy.rotation.set(0, d.rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(k, dummy.matrix);
  });
  dashMesh.receiveShadow = true;
  group.add(dashMesh);

  // zebra crossings on every approach
  const stripeGeo = new THREE.PlaneGeometry(0.62, CITY.street - 5.4);
  stripeGeo.rotateX(-Math.PI / 2);
  const stripes = [];
  for (let j = 0; j <= CITY.rows; j++) {
    for (let i = 0; i <= CITY.cols; i++) {
      const ix = -CITY.half + i * CITY.pitch + CITY.street / 2;
      const iz = -CITY.half + j * CITY.pitch + CITY.street / 2;
      for (let s = 0; s < 5; s++) {
        const off = -1.9 + s * 0.95;
        stripes.push({ x: ix + off, z: iz - CITY.pitch / 2 + 2.2, rot: 0 });
        stripes.push({ x: ix + off, z: iz + CITY.pitch / 2 - 2.2, rot: 0 });
        stripes.push({ x: ix - CITY.pitch / 2 + 2.2, z: iz + off, rot: Math.PI / 2 });
        stripes.push({ x: ix + CITY.pitch / 2 - 2.2, z: iz + off, rot: Math.PI / 2 });
      }
    }
  }
  const zebra = new THREE.InstancedMesh(stripeGeo, paintMat, stripes.length);
  stripes.forEach((s, k) => {
    dummy.position.set(s.x, 0.014, s.z);
    dummy.rotation.set(0, s.rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    zebra.setMatrixAt(k, dummy.matrix);
  });
  zebra.receiveShadow = true;
  group.add(zebra);

  /* merge and mount ----------------------------------------------------- */

  for (const f of tex.facades) {
    const mesh = batches[f.key].build(facadeMats[f.key]);
    if (mesh) group.add(mesh);
  }
  const roofs = roofBatch.build(roofMat);
  if (roofs) group.add(roofs);
  const shops = shopBatch.build(shopMat);
  if (shops) group.add(shops);
  const signs = signBatch.build(signMat);
  if (signs) {
    signs.castShadow = false;
    group.add(signs);
  }
  const slabs = slabBatch.build(slabMat);
  if (slabs) group.add(slabs);

  /* palms --------------------------------------------------------------- */

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.27, 1, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a6247, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);
  trunks.castShadow = true;

  const crownGeo = palmCrown();
  const crownMat = new THREE.MeshStandardMaterial({
    map: tex.frond,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
    roughness: 0.86,
    color: 0xcfdcba,
    emissive: 0x101a0b,
    emissiveIntensity: 0.5,
  });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palms.length);
  crowns.castShadow = true;

  palms.forEach((p, k) => {
    const lean = rng.jitter(0.07);
    dummy.position.set(p.x, p.h / 2, p.z);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), lean);
    dummy.scale.set(1, p.h, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(k, dummy.matrix);

    dummy.position.set(p.x + lean * p.h * 0.5, p.h, p.z);
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.scale.setScalar(rng.range(0.72, 1.0));
    dummy.updateMatrix();
    crowns.setMatrixAt(k, dummy.matrix);
  });
  group.add(trunks, crowns);

  /* lamps --------------------------------------------------------------- */

  const poleGeo = new THREE.CylinderGeometry(0.075, 0.11, 4.8, 6);
  poleGeo.translate(0, 2.4, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.6, metalness: 0.4 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lamps.length);
  poles.castShadow = true;
  const headGeo = new THREE.SphereGeometry(0.26, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff2d0,
    emissive: 0xffcf92,
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
  lamps.forEach((l, k) => {
    dummy.position.set(l.x, CITY.kerb, l.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(k, dummy.matrix);
    dummy.position.set(l.x, CITY.kerb + 4.85, l.z);
    dummy.updateMatrix();
    heads.setMatrixAt(k, dummy.matrix);
  });
  group.add(poles, heads);

  /* rooftop clutter ----------------------------------------------------- */

  mountClutter(clutter, group);

  /* quay rail ----------------------------------------------------------- */

  addRailing(group);

  /* plaza fountain, pier lamps already enough ---------------------------- */

  return {
    group,
    colliders,
    layout: {
      cols: CITY.cols,
      rows: CITY.rows,
      block: CITY.block,
      street: CITY.street,
      pitch: CITY.pitch,
      half: CITY.half,
      quay: QUAY,
      pierX: PIER_X,
    },
    spawn: { x: START.x, z: START.z, yaw: 0 },
    carSpawn: { x: START.carX, z: START.carZ, yaw: -Math.PI / 2 },
    sea,
    waterTex: tex.water,
    groundHeight,
    update(dt) {
      tex.water.offset.y = (tex.water.offset.y + dt * 0.004) % 1;
      tex.water.offset.x = (tex.water.offset.x + dt * 0.0016) % 1;
    },
  };

  /* --------------------------------------------------------------------- */

  function addBuilding(cx, cz, lot, height, famKey, district, R) {
    const w = lot.w;
    const d = lot.d;
    const wallTint = tint(R);
    const y0 = CITY.kerb;
    const shopH = Math.min(3.4, height * 0.36);
    const bodyH = Math.max(2, height - shopH);
    const shopName = R.pick(district.shops);

    const facing = {
      px: lot.x + w / 2 >= INNER / 2 - 1.0,
      nx: lot.x - w / 2 <= -INNER / 2 + 1.0,
      pz: lot.z + d / 2 >= INNER / 2 - 1.0,
      nz: lot.z - d / 2 <= -INNER / 2 + 1.0,
    };

    const wallBatch = batches[famKey];
    const uW = w / TILE;
    const uD = d / TILE;
    const vBody = bodyH / TILE;

    const front = quad(w, bodyH, uW, vBody);
    front.translate(cx, y0 + shopH + bodyH / 2, cz + d / 2);
    wallBatch.add(front, wallTint);

    const back = quad(w, bodyH, uW, vBody);
    back.rotateY(Math.PI);
    back.translate(cx, y0 + shopH + bodyH / 2, cz - d / 2);
    wallBatch.add(back, wallTint);

    const right = quad(d, bodyH, uD, vBody);
    right.rotateY(Math.PI / 2);
    right.translate(cx + w / 2, y0 + shopH + bodyH / 2, cz);
    wallBatch.add(right, wallTint);

    const left = quad(d, bodyH, uD, vBody);
    left.rotateY(-Math.PI / 2);
    left.translate(cx - w / 2, y0 + shopH + bodyH / 2, cz);
    wallBatch.add(left, wallTint);

    // shop band
    const bandTint = new THREE.Color().setHSL(0.09, 0.1, R.range(0.82, 1));
    const bandFront = quad(w, shopH, w / TILE, 1);
    bandFront.translate(cx, y0 + shopH / 2, cz + d / 2 + 0.02);
    shopBatch.add(bandFront, bandTint);
    const bandBack = quad(w, shopH, w / TILE, 1);
    bandBack.rotateY(Math.PI);
    bandBack.translate(cx, y0 + shopH / 2, cz - d / 2 - 0.02);
    shopBatch.add(bandBack, bandTint);
    const bandRight = quad(d, shopH, d / TILE, 1);
    bandRight.rotateY(Math.PI / 2);
    bandRight.translate(cx + w / 2 + 0.02, y0 + shopH / 2, cz);
    shopBatch.add(bandRight, bandTint);
    const bandLeft = quad(d, shopH, d / TILE, 1);
    bandLeft.rotateY(-Math.PI / 2);
    bandLeft.translate(cx - w / 2 - 0.02, y0 + shopH / 2, cz);
    shopBatch.add(bandLeft, bandTint);

    // roof plate + parapet
    const roofTint = new THREE.Color().setHSL(0.08, 0.03, R.range(0.62, 0.9));
    const plate = quad(w, d, w / 5, d / 5);
    plate.rotateX(-Math.PI / 2);
    plate.translate(cx, y0 + height, cz);
    roofBatch.add(plate, roofTint);
    const rimT = 0.34;
    for (const s of [-1, 1]) {
      const ew = box(w, 0.52, rimT, w / 5, 1);
      ew.translate(cx, y0 + height + 0.26, cz + s * (d / 2 - rimT / 2));
      roofBatch.add(ew, roofTint);
      const ed = box(rimT, 0.52, d, 1, d / 5);
      ed.translate(cx + s * (w / 2 - rimT / 2), y0 + height + 0.26, cz);
      roofBatch.add(ed, roofTint);
    }

    // a setback crown on the taller buildings
    let top = y0 + height;
    if (height > 27 && R.chance(0.8)) {
      const sw = w * 0.64;
      const sd = d * 0.64;
      const sh = height * R.range(0.12, 0.26);
      const crownTint = wallTint.clone().offsetHSL(0, 0, 0.03);
      const cf = quad(sw, sh, sw / TILE, sh / TILE);
      cf.translate(cx, top + sh / 2, cz + sd / 2);
      wallBatch.add(cf, crownTint);
      const cb = quad(sw, sh, sw / TILE, sh / TILE);
      cb.rotateY(Math.PI);
      cb.translate(cx, top + sh / 2, cz - sd / 2);
      wallBatch.add(cb, crownTint);
      const cr = quad(sd, sh, sd / TILE, sh / TILE);
      cr.rotateY(Math.PI / 2);
      cr.translate(cx + sw / 2, top + sh / 2, cz);
      wallBatch.add(cr, crownTint);
      const cl = quad(sd, sh, sd / TILE, sh / TILE);
      cl.rotateY(-Math.PI / 2);
      cl.translate(cx - sw / 2, top + sh / 2, cz);
      wallBatch.add(cl, crownTint);
      const cap = quad(sw, sd, sw / 5, sd / 5);
      cap.rotateX(-Math.PI / 2);
      cap.translate(cx, top + sh, cz);
      roofBatch.add(cap, roofTint);
      top += sh;
      addClutter(cx, cz, sw, sd, top, R);
    } else {
      addClutter(cx, cz, w, d, top, R);
    }

    // fascia sign above the shopfront, on the street sides
    const sides = [];
    if (facing.pz) sides.push({ x: cx, z: cz + d / 2 + 0.12, rot: 0, w: Math.min(w * 0.72, 6.4) });
    if (facing.nz) sides.push({ x: cx, z: cz - d / 2 - 0.12, rot: Math.PI, w: Math.min(w * 0.72, 6.4) });
    if (facing.px) sides.push({ x: cx + w / 2 + 0.12, z: cz, rot: Math.PI / 2, w: Math.min(d * 0.72, 6.4) });
    if (facing.nx) sides.push({ x: cx - w / 2 - 0.12, z: cz, rot: -Math.PI / 2, w: Math.min(d * 0.72, 6.4) });
    for (const side of sides) {
      if (R.chance(0.25)) continue;
      const cell = signCell(shopName);
      addSign(side.x, y0 + shopH + 0.85, side.z, side.rot, side.w, 1.35, cell);
    }

    colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      top,
    });
  }

  function addSign(x, y, z, rot, w, h, cell) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    const u0 = (cell % 4) * 0.25;
    const v0 = cell < 4 ? 0.5 : 0;
    const inset = 0.012;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        u0 + inset + uv.getX(i) * (0.25 - inset * 2),
        v0 + inset + uv.getY(i) * (0.5 - inset * 2),
      );
    }
    g.rotateY(rot);
    g.translate(x, y, z);
    signBatch.add(g, 0xffffff);
  }

  function addClutter(cx, cz, w, d, top, R) {
    const n = R.int(1, 3);
    for (let k = 0; k < n; k++) {
      const px = cx + R.range(-w * 0.32, w * 0.32);
      const pz = cz + R.range(-d * 0.32, d * 0.32);
      const kind = R.next();
      if (kind < 0.42) clutter.ac.push({ x: px, z: pz, y: top, rot: R.range(0, 6.28) });
      else if (kind < 0.68) clutter.tank.push({ x: px, z: pz, y: top });
      else if (kind < 0.86) clutter.vent.push({ x: px, z: pz, y: top });
      else clutter.antenna.push({ x: px, z: pz, y: top, h: R.range(2.5, 6.5) });
    }
    if (R.chance(0.2)) clutter.antenna.push({ x: cx, z: cz, y: top, h: R.range(4, 9) });
  }

  function addPlaza(cx, cz) {
    const stone = new THREE.Color().setHSL(0.09, 0.06, 0.98);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(7.2, 7.4, 0.55, 28),
      new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.9 }),
    );
    ring.position.set(cx, CITY.kerb + 0.27, cz);
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(6.5, 6.5, 0.2, 28),
      new THREE.MeshStandardMaterial({ color: 0x2f6f74, roughness: 0.12, metalness: 0.5 }),
    );
    pool.position.set(cx, CITY.kerb + 0.5, cz);
    group.add(pool);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.8, 4.4, 12),
      new THREE.MeshStandardMaterial({ color: 0xd6cdb8, roughness: 0.85 }),
    );
    column.position.set(cx, CITY.kerb + 2.4, cz);
    column.castShadow = true;
    group.add(column);
    colliders.push({ minX: cx - 7.2, maxX: cx + 7.2, minZ: cz - 7.2, maxZ: cz + 7.2, top: CITY.kerb + 0.6 });

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        palms.push({ x: cx + sx * 12, z: cz + sz * 12, h: rng.range(8, 12) });
      }
    }
    slabsPlaza(cx, cz, stone);
  }

  function slabsPlaza(cx, cz, color) {
    const pad = quad(CITY.block - 4, CITY.block - 4, 8, 8);
    pad.rotateX(-Math.PI / 2);
    pad.translate(cx, CITY.kerb + 0.006, cz);
    slabBatch.add(pad, color);
  }

  function addRailing(target) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x30383a, roughness: 0.5, metalness: 0.6 });
    const postGeo = new THREE.CylinderGeometry(0.045, 0.05, 1.05, 5);
    postGeo.translate(0, 0.52, 0);
    const count = Math.floor(CITY.span / 2.6);
    const posts = new THREE.InstancedMesh(postGeo, metal, count);
    for (let k = 0; k < count; k++) {
      dummy.position.set(-CITY.half + 1.3 + k * 2.6, CITY.kerb, QUAY - 0.35);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(k, dummy.matrix);
    }
    target.add(posts);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(CITY.span, 0.07, 0.07), metal);
    rail.position.set(0, CITY.kerb + 1.02, QUAY - 0.35);
    target.add(rail);
    colliders.push({ minX: -CITY.half, maxX: CITY.half, minZ: QUAY - 1.0, maxZ: QUAY + 3, top: 2 });
  }

  function mountClutter(list, target) {
    const acGeo = new THREE.BoxGeometry(1.7, 0.95, 1.3);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a0, roughness: 0.7, metalness: 0.25 });
    const acMesh = new THREE.InstancedMesh(acGeo, acMat, Math.max(list.ac.length, 1));
    acMesh.count = list.ac.length;
    list.ac.forEach((a, k) => {
      dummy.position.set(a.x, a.y + 0.48, a.z);
      dummy.rotation.set(0, a.rot, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      acMesh.setMatrixAt(k, dummy.matrix);
    });
    acMesh.castShadow = true;

    const tankGeo = new THREE.CylinderGeometry(0.95, 0.95, 2.3, 10);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x6f5b46, roughness: 0.9 });
    const tankMesh = new THREE.InstancedMesh(tankGeo, tankMat, Math.max(list.tank.length, 1));
    tankMesh.count = list.tank.length;
    list.tank.forEach((a, k) => {
      dummy.position.set(a.x, a.y + 1.4, a.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tankMesh.setMatrixAt(k, dummy.matrix);
    });
    tankMesh.castShadow = true;

    const ventGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 6);
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x878c8b, roughness: 0.6, metalness: 0.4 });
    const ventMesh = new THREE.InstancedMesh(ventGeo, ventMat, Math.max(list.vent.length, 1));
    ventMesh.count = list.vent.length;
    list.vent.forEach((a, k) => {
      dummy.position.set(a.x, a.y + 0.55, a.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ventMesh.setMatrixAt(k, dummy.matrix);
    });

    const antGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 5);
    antGeo.translate(0, 0.5, 0);
    const antMat = new THREE.MeshStandardMaterial({ color: 0x2e3234, roughness: 0.6, metalness: 0.5 });
    const antMesh = new THREE.InstancedMesh(antGeo, antMat, Math.max(list.antenna.length, 1));
    antMesh.count = list.antenna.length;
    list.antenna.forEach((a, k) => {
      dummy.position.set(a.x, a.y, a.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, a.h, 1);
      dummy.updateMatrix();
      antMesh.setMatrixAt(k, dummy.matrix);
    });

    target.add(acMesh, tankMesh, ventMesh, antMesh);
  }
}

/* --- helpers ----------------------------------------------------------- */

function palmCrown() {
  const parts = [];
  const rng = new RngShim(9);
  for (let k = 0; k < 9; k++) {
    const droop = rng.float(0.16, 0.5);
    for (const tilt of [-0.42, 0.42]) {
      const g = new THREE.PlaneGeometry(2.5, 4.9);
      g.translate(0, 2.45, 0);
      g.rotateY(tilt);
      g.rotateX(Math.PI / 2 + droop);
      g.rotateY((k / 9) * Math.PI * 2 + rng.float(-0.18, 0.18));
      parts.push(g);
    }
  }
  // a young spear standing up in the middle
  for (const tilt of [-0.3, 0.3]) {
    const spear = new THREE.PlaneGeometry(0.9, 2.6);
    spear.translate(0, 1.1, 0);
    spear.rotateY(tilt);
    spear.rotateX(0.2);
    parts.push(spear);
  }

  let pos = [], nor = [], uv = [];
  for (const g of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos = pos.concat(Array.from(ng.attributes.position.array));
    nor = nor.concat(Array.from(ng.attributes.normal.array));
    uv = uv.concat(Array.from(ng.attributes.uv.array));
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

/* A minimal deterministic float source for static decor. */
class RngShim {
  constructor(seed) {
    this.s = seed;
  }
  float(a, b) {
    this.s = (this.s * 16807) % 2147483647;
    return a + ((this.s % 1000) / 1000) * (b - a);
  }
}

function signCell(name) {
  const order = ['CASA VELA', 'EL ANCLA', 'TABACO', 'MERCADO', 'RADIO SOL', 'HOTEL MAREA', 'FARMACIA', 'PESCADO'];
  const index = order.indexOf(name);
  if (index >= 0) return index;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 3)) % 8;
  return h;
}

function nearCross(x, z) {
  const step = CITY.pitch;
  const fx = (x + CITY.half - CITY.street / 2) / step;
  const fz = (z + CITY.half - CITY.street / 2) / step;
  return Math.abs(fx - Math.round(fx)) < 0.34 && Math.abs(fz - Math.round(fz)) < 0.34;
}

function groundHeight(x, z) {
  if (z > CITY.half && z < CITY.half + CITY.promenade) return CITY.kerb;
  const fx = (CITY.half - CITY.street - CITY.block / 2 - x) / CITY.pitch;
  const fz = (CITY.half - CITY.street - CITY.block / 2 - z) / CITY.pitch;
  const i = Math.round(fx);
  const j = Math.round(fz);
  if (i < 0 || i >= CITY.cols || j < 0 || j >= CITY.rows) return 0;
  const c = blockCentre(i, j);
  if (Math.abs(x - c.x) <= CITY.block / 2 && Math.abs(z - c.z) <= CITY.block / 2) return CITY.kerb;
  return 0;
}

export { groundHeight };
