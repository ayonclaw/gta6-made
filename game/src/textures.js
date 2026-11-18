/* Every surface in Salmora is painted here on a 2D canvas — no image files,
   no network. Textures are cheap tiles; the city stretches them by UV. */

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './config.js';
import { Rng } from './rng.js';

const TEX_ANISO = 4;

function surface(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, ctx: cv.getContext('2d') };
}

function upload(cv, repeat = true) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = TEX_ANISO;
  tex.needsUpdate = true;
  return tex;
}

function speckle(ctx, w, h, rng, count, alpha, spread = 40) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rng.range(0, 255));
    ctx.fillStyle = `rgba(${v},${v},${v},${rng.range(alpha * 0.3, alpha)})`;
    const s = rng.range(0.6, 2.4);
    ctx.fillRect(rng.range(0, w), rng.range(0, h), s, s);
    if (spread < 0) break;
  }
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/* --- ground surfaces --------------------------------------------------- */

function asphalt(rng) {
  const { cv, ctx } = surface(512, 512);
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, rng, 9000, 0.16);
  // patched repairs and tar snakes
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(20,21,23,${rng.range(0.1, 0.3)})`;
    const x = rng.range(0, 512), y = rng.range(0, 512);
    ctx.beginPath();
    ctx.ellipse(x, y, rng.range(20, 90), rng.range(10, 46), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = 'rgba(18,19,20,0.5)';
    ctx.lineWidth = rng.range(1, 2.6);
    ctx.beginPath();
    let x = rng.range(0, 512), y = rng.range(0, 512);
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += rng.range(-50, 50);
      y += rng.range(10, 60);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return upload(cv);
}

function pavement(rng) {
  const { cv, ctx } = surface(256, 256);
  ctx.fillStyle = PALETTE.pavement;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 2600, 0.2);
  ctx.strokeStyle = 'rgba(90,86,78,0.42)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i + 2, 0); ctx.lineTo(i + 2, 256); ctx.stroke();
  }
  return upload(cv);
}

function concrete(rng) {
  const { cv, ctx } = surface(128, 128);
  ctx.fillStyle = PALETTE.kerb;
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 1400, 0.22);
  ctx.fillStyle = 'rgba(40,40,38,0.18)';
  ctx.fillRect(0, 96, 128, 32);
  return upload(cv);
}

function roof(rng) {
  const { cv, ctx } = surface(256, 256);
  ctx.fillStyle = PALETTE.roof;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 5200, 0.24);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = `rgba(120,118,110,${rng.range(0.04, 0.12)})`;
    ctx.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(20, 90), rng.range(16, 60));
  }
  ctx.strokeStyle = 'rgba(28,27,25,0.28)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * 64 + 8); ctx.lineTo(256, i * 64 + 8); ctx.stroke();
  }
  return upload(cv);
}

function water(rng) {
  const { cv, ctx } = surface(512, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, PALETTE.seaDeep);
  g.addColorStop(0.5, PALETTE.sea);
  g.addColorStop(1, PALETTE.seaDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 420; i++) {
    const y = rng.range(0, 512);
    ctx.strokeStyle = `rgba(190,224,225,${rng.range(0.02, 0.1)})`;
    ctx.lineWidth = rng.range(0.6, 2);
    const x = rng.range(0, 512), len = rng.range(8, 70);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + rng.range(-3, 3), x + len, y);
    ctx.stroke();
  }
  return upload(cv);
}

/* --- façades ----------------------------------------------------------- */

const TILE_M = 6.4; // metres covered by one façade tile
export const FACADE_TILE = TILE_M;

function windowGlass(ctx, x, y, w, h, lit, rng) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  if (lit) {
    const warm = rng.pick(['#ffd79a', '#ffc97e', '#ffe6bb', '#c9e2e6']);
    g.addColorStop(0, warm);
    g.addColorStop(1, shade(warm, -0.18));
  } else {
    g.addColorStop(0, '#20343c');
    g.addColorStop(0.55, '#2c4650');
    g.addColorStop(1, '#16242b');
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // a slanted sheen across the pane
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = lit ? 'rgba(255,255,255,0.18)' : 'rgba(180,220,225,0.13)';
  ctx.beginPath();
  ctx.moveTo(x - 6, y + h);
  ctx.lineTo(x + w * 0.55, y - 8);
  ctx.lineTo(x + w * 0.9, y - 8);
  ctx.lineTo(x + w * 0.25, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function stuccoFacade(rng, base) {
  const { cv, ctx } = surface(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 3600, 0.1);
  // string courses
  ctx.fillStyle = shade(base, -0.09);
  ctx.fillRect(0, 118, 256, 5);
  ctx.fillRect(0, 246, 256, 5);
  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 2; gx++) {
      const x = 24 + gx * 128, y = 22 + gy * 118;
      const w = 80, h = 78;
      // recess shadow
      ctx.fillStyle = shade(base, -0.2);
      ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
      windowGlass(ctx, x, y, w, h, rng.chance(0.22), rng);
      // shutters
      if (rng.chance(0.5)) {
        ctx.fillStyle = rng.pick(['#456b5c', '#7c4c3a', '#4d6172']);
        ctx.fillRect(x - 17, y, 12, h);
        ctx.fillRect(x + w + 5, y, 12, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        for (let s = 6; s < h; s += 8) {
          ctx.beginPath(); ctx.moveTo(x - 17, y + s); ctx.lineTo(x - 5, y + s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w + 5, y + s); ctx.lineTo(x + w + 17, y + s); ctx.stroke();
        }
      }
      // trim + sill
      ctx.strokeStyle = shade(base, 0.16);
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
      ctx.fillStyle = shade(base, -0.14);
      ctx.fillRect(x - 9, y + h + 5, w + 18, 6);
    }
  }
  return upload(cv);
}

function brickFacade(rng, base) {
  const { cv, ctx } = surface(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const course = 10;
  for (let row = 0; row * course < 256; row++) {
    const y = row * course;
    ctx.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.07)})`;
    ctx.fillRect(0, y, 256, 1);
    const off = row % 2 === 0 ? 0 : 15;
    for (let x = off; x < 256; x += 30) {
      if (rng.chance(0.25)) {
        ctx.fillStyle = `rgba(120,70,55,${rng.range(0.05, 0.16)})`;
        ctx.fillRect(x + 1, y + 1, 28, course - 2);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(x, y, 1, course);
    }
  }
  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 2; gx++) {
      const x = 30 + gx * 128, y = 26 + gy * 118;
      const w = 72, h = 84;
      ctx.fillStyle = '#d8cdb6';
      ctx.fillRect(x - 10, y - 12, w + 20, 14); // lintel
      windowGlass(ctx, x, y, w, h, rng.chance(0.2), rng);
      ctx.strokeStyle = shade(base, 0.22);
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#cfc4ad';
      ctx.fillRect(x - 10, y + h + 4, w + 20, 8);
      ctx.strokeStyle = 'rgba(30,22,18,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    }
  }
  return upload(cv);
}

function glassFacade(rng, base) {
  const { cv, ctx } = surface(256, 256);
  ctx.fillStyle = '#48626b';
  ctx.fillRect(0, 0, 256, 256);
  const cell = 64;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      const lit = rng.chance(0.09);
      const tone = new THREE.Color(base).offsetHSL(rng.jitter(0.02), rng.jitter(0.05), rng.jitter(0.06));
      const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
      if (lit) {
        g.addColorStop(0, '#e5d3ac');
        g.addColorStop(1, '#b09a76');
      } else {
        g.addColorStop(0, `#${tone.getHexString()}`);
        g.addColorStop(0.6, shade(`#${tone.getHexString()}`, -0.08));
        g.addColorStop(1, '#4e6a72');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x + 3, y + 4, cell - 6, cell - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.moveTo(x + 3, y + cell - 10);
      ctx.lineTo(x + cell - 12, y + 4);
      ctx.lineTo(x + cell - 4, y + 4);
      ctx.lineTo(x + 3, y + cell - 26);
      ctx.closePath();
      ctx.fill();
    }
  }
  // mullions
  ctx.fillStyle = '#2c3f46';
  for (let i = 0; i <= 256; i += cell) {
    ctx.fillRect(i - 2, 0, 4, 256);
    ctx.fillRect(0, i - 2, 256, 4);
  }
  ctx.fillStyle = 'rgba(20,28,32,0.55)';
  ctx.fillRect(0, 0, 256, 6);
  return upload(cv);
}

function decoFacade(rng, base) {
  const { cv, ctx } = surface(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 2400, 0.09);
  // fluted pilasters
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = shade(base, -0.07);
    ctx.fillRect(x + 24, 0, 6, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 23, 0, 2, 256);
  }
  // teal spandrel band
  ctx.fillStyle = '#2f6f6b';
  ctx.fillRect(0, 108, 256, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, 108, 256, 2);
  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const x = 12 + gx * 82, y = 24 + gy * 118;
      const w = 30, h = 74;
      windowGlass(ctx, x, y, w, h, rng.chance(0.25), rng);
      ctx.strokeStyle = shade(base, 0.2);
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
      ctx.fillStyle = shade(base, -0.22);
      ctx.fillRect(x - 6, y + h + 3, w + 12, 4);
    }
  }
  return upload(cv);
}

function shopFront(rng) {
  const { cv, ctx } = surface(256, 256);
  ctx.fillStyle = '#2a2b2a';
  ctx.fillRect(0, 0, 256, 256);
  // awning stripes at the top
  const stripe = rng.pick([['#a8463c', '#e8dcc4'], ['#2f6f6b', '#efe6d2'], ['#8a6b2f', '#243b3a']]);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = x % 64 === 0 ? stripe[0] : stripe[1];
    ctx.fillRect(x, 0, 32, 34);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 30, 256, 6);
  // glazing
  for (let i = 0; i < 2; i++) {
    const x = 8 + i * 124, y = 46, w = 110, h = 186;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#334c50');
    g.addColorStop(0.45, '#5d7a78');
    g.addColorStop(1, '#22322f');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,240,200,0.13)';
    ctx.fillRect(x + 10, y + 20, w - 20, 60);
    ctx.strokeStyle = '#191d1c';
    ctx.lineWidth = 6;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w * 0.6, y); ctx.lineTo(x + w * 0.2, y + h); ctx.stroke();
  }
  ctx.fillStyle = '#15191a';
  ctx.fillRect(0, 232, 256, 24);
  return upload(cv);
}

/* --- signage ----------------------------------------------------------- */

const SIGN_NAMES = [
  ['CASA VELA', '#123c3a', '#f2e2b6'],
  ['EL ANCLA', '#7a2b25', '#f7e3c2'],
  ['TABACO', '#22262a', '#e8b451'],
  ['MERCADO', '#1f3f5c', '#f0d8a8'],
  ['RADIO SOL', '#3b2a4d', '#ffd27d'],
  ['HOTEL MAREA', '#204a46', '#f4e7cf'],
  ['FARMACIA', '#5a1f28', '#f7efe0'],
  ['PESCADO', '#284559', '#a8e0d2'],
];

function signAtlas(rng) {
  const { cv, ctx } = surface(1024, 512);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 1024, 512);
  SIGN_NAMES.forEach((entry, i) => {
    const cx = (i % 4) * 256;
    const cy = Math.floor(i / 4) * 256;
    const [text, bg, ink] = entry;
    ctx.fillStyle = bg;
    ctx.fillRect(cx + 4, cy + 4, 248, 248);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.strokeRect(cx + 18, cy + 18, 220, 220);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 30, cy + 30, 196, 196);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 52;
    ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`;
    while (ctx.measureText(text).width > 176 && size > 20) {
      size -= 2;
      ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`;
    }
    ctx.fillText(text, cx + 128, cy + 120);
    ctx.font = '600 18px "Trebuchet MS", sans-serif';
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.72;
    ctx.fillText(rng.pick(['DESDE 1962', 'ABIERTO', '24 HORAS', 'FAMILIA', 'PUERTO']), cx + 128, cy + 176);
    ctx.globalAlpha = 1;
    // bulb studs
    for (let b = 0; b < 12; b++) {
      ctx.fillStyle = 'rgba(255,235,190,0.75)';
      ctx.beginPath();
      ctx.arc(cx + 40 + b * 16, cy + 34, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return upload(cv, false);
}

/* --- sky and foliage --------------------------------------------------- */

function skyGradient() {
  const { cv, ctx } = surface(128, 1024);
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0.0, '#1f3457');
  g.addColorStop(0.28, '#3d5c82');
  g.addColorStop(0.5, '#8d8fa0');
  g.addColorStop(0.62, '#d99a86');
  g.addColorStop(0.72, '#ffc59a');
  g.addColorStop(0.8, '#f6d3b0');
  g.addColorStop(1.0, '#7d7c78');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 1024);
  // soft cloud bands near the horizon
  for (let i = 0; i < 60; i++) {
    const y = 220 + Math.random() * 460;
    ctx.fillStyle = `rgba(255,214,186,${0.02 + Math.random() * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 128, y, 26 + Math.random() * 52, 3 + Math.random() * 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // dither the ramp so the dome does not band
  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 1024, 1, 1);
  }
  const tex = upload(cv, false);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function frond(rng) {
  const { cv, ctx } = surface(128, 256);
  ctx.clearRect(0, 0, 128, 256);
  // a solid, slightly serrated blade so the crown reads at a distance
  const baseX = 64;
  const baseY = 252;
  const tipY = 8;
  const widthAt = (t) => 2 + 25 * Math.sin(Math.pow(t, 0.72) * Math.PI);
  const steps = 24;

  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = baseY + (tipY - baseY) * t;
    const w = widthAt(t) * (i % 2 === 0 ? 0.72 : 1);
    ctx.lineTo(baseX - w, y);
  }
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const y = baseY + (tipY - baseY) * t;
    const w = widthAt(t) * (i % 2 === 0 ? 1 : 0.72);
    ctx.lineTo(baseX + w, y);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, baseY, 0, tipY);
  g.addColorStop(0, '#3c5827');
  g.addColorStop(0.45, '#547c33');
  g.addColorStop(1, '#7ea046');
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = 'rgba(206, 218, 160, 0.6)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY - 2);
  ctx.lineTo(baseX, tipY + 4);
  ctx.stroke();

  for (let i = 2; i < steps; i += 2) {
    const t = i / steps;
    const y = baseY + (tipY - baseY) * t;
    const w = widthAt(t);
    ctx.strokeStyle = `rgba(38, 60, 26, ${0.16 + rng.next() * 0.16})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(baseX, y);
    ctx.lineTo(baseX - w * 0.92, y + 4);
    ctx.moveTo(baseX, y);
    ctx.lineTo(baseX + w * 0.92, y + 4);
    ctx.stroke();
  }
  return upload(cv, false);
}

/* --- bundle ------------------------------------------------------------ */

export function createTextures(seed) {
  const rng = new Rng((seed ^ 0x51f3a7) >>> 0);
  const pick = (list) => list[Math.floor(rng.next() * list.length)];

  return {
    asphalt: asphalt(rng),
    pavement: pavement(rng),
    concrete: concrete(rng),
    roof: roof(rng),
    water: water(rng),
    sky: skyGradient(),
    frond: frond(rng),
    shop: shopFront(rng),
    signs: signAtlas(rng),
    facades: [
      { key: 'stucco', map: stuccoFacade(rng, pick(PALETTE.stucco)) },
      { key: 'brick', map: brickFacade(rng, pick(PALETTE.brick)) },
      { key: 'glass', map: glassFacade(rng, pick(PALETTE.glass)) },
      { key: 'deco', map: decoFacade(rng, pick(PALETTE.deco)) },
    ],
  };
}

export { upload as uploadTexture, surface as makeSurface };
