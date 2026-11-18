// Everything the city is painted with, drawn into canvases at load time: asphalt, pavement,
// sand and the facade sheets the towers wear. No image file, no network request.
import * as THREE from '../vendor/three.module.min.js';
import { FACADES } from './config.js';
import { range } from './rng.js';

function canvasOf(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function speckle(ctx, size, random, count, lightness) {
  for (let index = 0; index < count; index += 1) {
    const value = Math.floor(lightness + range(random, -24, 24));
    ctx.fillStyle = `rgba(${value},${value},${value},0.16)`;
    const radius = range(random, 0.6, 2.4);
    ctx.fillRect(range(random, 0, size), range(random, 0, size), radius, radius);
  }
}

function finish(canvas, repeat) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) texture.repeat.set(repeat, repeat);
  return texture;
}

/** Dark, patchy road surface. Tiled about eight metres to the repeat. */
export function createAsphalt(random) {
  const size = 256;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4b4f57';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, random, 9000, 96);
  for (let patch = 0; patch < 14; patch += 1) {
    ctx.fillStyle = `rgba(28,30,34,${range(random, 0.05, 0.16).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(range(random, 0, size), range(random, 0, size), range(random, 6, 34), range(random, 4, 26), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, 9);
}

/** Warm concrete slabs for the pavements. */
export function createPavement(random) {
  const size = 256;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d9d0c0';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, random, 5000, 205);
  ctx.strokeStyle = 'rgba(120,110,96,0.35)';
  ctx.lineWidth = 2;
  for (let line = 0; line <= size; line += 64) {
    ctx.beginPath();
    ctx.moveTo(line, 0);
    ctx.lineTo(line, size);
    ctx.moveTo(0, line);
    ctx.lineTo(size, line);
    ctx.stroke();
  }
  return finish(canvas, 6);
}

/** Wind-rippled sand for the beach. */
export function createSand(random) {
  const size = 256;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0d8ab';
  ctx.fillRect(0, 0, size, size);
  for (let ripple = 0; ripple < 90; ripple += 1) {
    ctx.strokeStyle = `rgba(206,178,132,${range(random, 0.12, 0.34).toFixed(3)})`;
    ctx.lineWidth = range(random, 1, 3);
    const y = range(random, 0, size);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + range(random, -8, 8), size * 0.7, y + range(random, -8, 8), size, y);
    ctx.stroke();
  }
  speckle(ctx, size, random, 2600, 224);
  return finish(canvas, 20);
}

/**
 * One facade sheet per palette entry: four floors of windows over four bays, with a trim band
 * between floors, a few windows lit warm and a little grime at the base.
 */
export function createFacadeTextures(random) {
  return FACADES.map((facade, variantIndex) => {
    const size = 256;
    const bay = size / 4;
    const canvas = canvasOf(size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = facade.wall;
    ctx.fillRect(0, 0, size, size);

    for (let blot = 0; blot < 700; blot += 1) {
      ctx.fillStyle = `rgba(255,255,255,${range(random, 0.02, 0.06).toFixed(3)})`;
      ctx.fillRect(range(random, 0, size), range(random, 0, size), 3, 3);
    }

    for (let floor = 0; floor < 4; floor += 1) {
      const top = floor * bay;
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(0, top, size, 6);
      ctx.fillStyle = facade.trim;
      ctx.fillRect(0, top + 1, size, 3);

      for (let column = 0; column < 4; column += 1) {
        const left = column * bay + 15;
        const width = bay - 30;
        const height = bay - 34;
        const windowTop = top + 22;

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(left - 4, windowTop - 4, width + 8, height + 8);

        const lit = random() < 0.09;
        const glass = ctx.createLinearGradient(left, windowTop, left + width * 0.4, windowTop + height);
        if (lit) {
          glass.addColorStop(0, '#ffe1a6');
          glass.addColorStop(1, '#d99a58');
        } else {
          glass.addColorStop(0, '#2f4650');
          glass.addColorStop(0.55, '#4e6f7b');
          glass.addColorStop(1, '#6d909c');
        }
        ctx.fillStyle = glass;
        ctx.fillRect(left, windowTop, width, height);

        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(left + Math.round(width / 2) - 1, windowTop, 2, height);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(left, windowTop + Math.round(height * 0.42), width, 2);

        ctx.fillStyle = 'rgba(30,30,30,0.16)';
        ctx.fillRect(left - 4, windowTop + height + 4, width + 8, 3);
      }
    }

    // A pilaster down each bay boundary gives the wall some rhythm in raking light.
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let column = 1; column < 4; column += 1) {
      ctx.fillRect(column * bay - 1.5, 0, 3, size);
    }

    const shade = ctx.createLinearGradient(0, size - 34, 0, size);
    shade.addColorStop(0, 'rgba(90,70,50,0)');
    shade.addColorStop(1, 'rgba(90,70,50,0.24)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, size - 34, size, 34);

    return { map: finish(canvas, null), facade };
  });
}

/** Ground floors: big shop windows with the building's accent on the frames and awning band. */
export function createStorefrontTextures(random) {
  return FACADES.map((facade) => {
    const width = 256;
    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3c4a52';
    ctx.fillRect(0, 0, width, height);

    for (let pane = 0; pane < 4; pane += 1) {
      const left = pane * 64 + 8;
      const glass = ctx.createLinearGradient(left, 30, left, 108);
      glass.addColorStop(0, '#43606b');
      glass.addColorStop(0.5, '#5c808c');
      glass.addColorStop(1, '#7fa3ad');
      ctx.fillStyle = glass;
      ctx.fillRect(left, 34, 48, 74);

      const glow = ctx.createLinearGradient(left, 60, left + 48, 110);
      glow.addColorStop(0, `rgba(255,220,170,${range(random, 0.05, 0.22).toFixed(2)})`);
      glow.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(left, 60, 48, 48);

      ctx.strokeStyle = facade.accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(left, 34, 48, 74);
    }

    ctx.fillStyle = facade.accent;
    ctx.fillRect(0, 0, width, 20);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 20, width, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, height - 10, width, 10);

    return finish(canvas, null);
  });
}

