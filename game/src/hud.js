/* HUD construction and painting. Nothing here touches the scene graph; the
   main loop hands it numbers and it hands back a strip, a map and prompts. */

import { TAGLINE, TITLE, districtAt } from './config.js';

function node(tag, cls, parent) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (parent) parent.appendChild(el);
  return el;
}

const CONTROLS = [
  ['W A S D', 'walk / drive'],
  ['Shift', 'run'],
  ['Space', 'jump'],
  ['Mouse', 'look around'],
  ['Click / F', 'fire'],
  ['R', 'reload'],
  ['E', 'enter car / take a car'],
  ['Esc', 'pause'],
];

export class Hud {
  constructor(root) {
    this.root = root;
    this.promptTimer = 0;
    this.toastTimer = 0;
    this.mapTimer = 0;
    this.promptSig = '';
    this.mapDirty = true;
    this.onResume = null;
    this._build();
  }

  _build() {
    const r = this.root;

    this.districtChip = node('div', 'district', r);
    this.districtName = node('span', '', this.districtChip);
    this.districtName.textContent = 'SALT FLATS';

    const brand = node('div', 'brand', r);
    brand.textContent = 'Salmora';

    const strip = node('div', 'strip', r);

    const vitals = node('div', 'cell vitals', strip);
    node('div', 'label', vitals).textContent = 'Vitals';
    this.bar = node('div', 'bar', vitals);
    this.barFill = node('i', '', this.bar);
    this.healthValue = node('div', 'value', vitals);
    this.healthValue.style.fontSize = '11px';
    this.healthValue.style.marginTop = '7px';
    this.healthValue.style.letterSpacing = '0.18em';
    this.healthValue.textContent = '100';

    const cash = node('div', 'cell', strip);
    node('div', 'label', cash).textContent = 'Funds';
    this.cashValue = node('div', 'value cash', cash);
    this.cashValue.textContent = '$240';

    this.speedCell = node('div', 'cell away', strip);
    this.speedCell.id = 'speedCell';
    node('div', 'label', this.speedCell).textContent = 'Speed';
    this.speedValue = node('div', 'value', this.speedCell);
    this.speedValue.innerHTML = '0<small>KM/H</small>';

    // sidearm
    this.weaponCell = node('div', 'cell weapon', strip);
    this.weaponCell.id = 'weaponCell';
    node('div', 'label', this.weaponCell).textContent = 'Sidearm';
    this.weaponValue = node('div', 'value ammo', this.weaponCell);
    this.weaponValue.innerHTML = '12<small>/84</small>';

    // wanted stars, a row of five over the strip
    this.wanted = node('div', 'wanted', r);
    this.wanted.id = 'wanted';
    this.stars = [];
    for (let i = 0; i < 5; i++) {
      const star = node('span', 'star', this.wanted);
      star.textContent = '\u2605';
      this.stars.push(star);
    }
    this.wantedLabel = node('em', '', this.wanted);
    this.wantedLabel.textContent = 'PD';

    // job card
    this.job = node('div', 'job', r);
    this.job.id = 'job';
    const jobTop = node('div', 'job-top', this.job);
    this.jobTag = node('span', 'job-tag', jobTop);
    this.jobTag.textContent = 'JOB';
    this.jobPay = node('span', 'job-pay', jobTop);
    this.jobPay.textContent = '$0';
    this.jobTitle = node('div', 'job-title', this.job);
    this.jobTitle.textContent = 'DOCK DUES';
    this.jobText = node('div', 'job-text', this.job);
    this.jobText.textContent = 'Meet the runner on the east pavement';
    this.jobLine = node('div', 'job-line', this.job);
    this.jobLine.textContent = '';

    // minimap
    const map = node('div', 'map', r);
    this.mapCanvas = node('canvas', '', map);
    this.mapCanvas.width = 320;
    this.mapCanvas.height = 320;
    this.mapCtx = this.mapCanvas.getContext('2d');
    const north = node('div', 'north', map);
    north.textContent = 'N';
    const mapLabel = node('div', 'pin-label', map);
    mapLabel.textContent = 'Salmora Sound';

    // prompt + toast
    this.promptEl = node('div', 'prompt', r);
    this.promptKbd = node('kbd', '', this.promptEl);
    this.promptText = node('span', '', this.promptEl);
    this.promptKbd.textContent = 'E';
    this.promptText.textContent = 'Drive the Corvina';

    this.toast = node('div', 'toast', r);

    // pause card
    this.pause = node('div', 'pause', r);
    const card = node('div', 'card', this.pause);
    const h2 = node('h2', '', card);
    h2.textContent = TITLE;
    const sub = node('p', 'sub', card);
    sub.textContent = TAGLINE + ' · paused';
    const list = node('ul', 'keys', card);
    for (const [key, action] of CONTROLS) {
      const li = node('li', '', list);
      const b = node('b', '', li);
      b.textContent = key;
      node('span', '', li).textContent = action;
    }
    this.resumeButton = node('button', '', card);
    this.resumeButton.textContent = 'Resume';
    this.resumeButton.addEventListener('click', () => {
      if (this.onResume) this.onResume();
    });

    // title card, only used by the title screenshot pose
    this.titleCard = node('div', 'title-card', r);
    const h1 = node('h1', '', this.titleCard);
    h1.textContent = TITLE;
    node('div', 'rule', this.titleCard);
    const tag = node('p', '', this.titleCard);
    tag.textContent = TAGLINE;
  }

  setHealth(value) {
    const v = Math.max(0, Math.min(100, value));
    this.barFill.style.width = `${v}%`;
    this.bar.classList.toggle('low', v < 35);
    this.healthValue.textContent = String(Math.round(v));
  }

  /** One star per level the law has on you. */
  setStars(level) {
    const n = Math.max(0, Math.min(5, level | 0));
    if (this._stars === n) return;
    this._stars = n;
    this.stars.forEach((star, i) => {
      star.classList.toggle('lit', i < n);
    });
    this.wanted.classList.toggle('hot', n > 0);
  }

  setWeapon(mag, reserve, reloading) {
    const sig = `${mag}/${reserve}/${reloading ? 1 : 0}`;
    if (sig === this._weaponSig) return;
    this._weaponSig = sig;
    this.weaponValue.innerHTML = `${mag}<small>/${reserve}</small>`;
    this.weaponCell.classList.toggle('empty', mag === 0);
    this.weaponCell.classList.toggle('busy', Boolean(reloading));
  }

  setJob(job) {
    if (!job) {
      this.job.classList.remove('show');
      return;
    }
    this.job.classList.add('show');
    if (this.jobTitle.textContent !== job.title) this.jobTitle.textContent = job.title;
    if (this.jobText.textContent !== job.text) this.jobText.textContent = job.text;
    this.jobPay.textContent = `$${job.payout}`;
    this.jobTag.textContent = job.tag || 'JOB';
  }

  say(text) {
    this.jobLine.textContent = text;
    this.jobLine.classList.add('say');
    this.lineTimer = 6.5;
  }

  /** Money moved: flash the number so the payout is visible. */
  setCash(value, pulse = false) {
    this.cashValue.textContent = `$${Math.round(value)}`;
    if (!pulse) return;
    this.cashValue.classList.remove('flash');
    void this.cashValue.offsetWidth;
    this.cashValue.classList.add('flash');
  }

  setDistrict(name) {
    if (this.districtName.textContent === name) return;
    this.districtName.textContent = name;
  }

  setSpeed(kmh) {
    const driving = kmh !== null && kmh !== undefined;
    this.speedCell.classList.toggle('away', !driving);
    if (!driving) return;
    const v = Math.round(kmh);
    if (this.speedValue.dataset.v !== String(v)) {
      this.speedValue.dataset.v = String(v);
      this.speedValue.innerHTML = `${v}<small>KM/H</small>`;
    }
  }

  /** A contextual hint. Repeats of the same hint do not reset the clock. */
  prompt(key, text, hold = 2.8) {
    const sig = `${key}|${text}`;
    if (sig !== this.promptSig) {
      this.promptSig = sig;
      this.promptKbd.textContent = key;
      this.promptText.textContent = text;
      this.promptTimer = hold;
      this.promptEl.classList.add('show');
    } else if (this.promptTimer <= 0) {
      this.promptTimer = hold;
      this.promptEl.classList.add('show');
    }
  }

  hidePrompt() {
    this.promptEl.classList.remove('show');
    this.promptTimer = 0;
    this.promptSig = '';
  }

  message(text, hold = 2.6) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastTimer = hold;
  }

  openPause(open) {
    this.pause.classList.toggle('open', open);
  }

  get paused() {
    return this.pause.classList.contains('open');
  }

  showTitle(show) {
    this.titleCard.classList.toggle('show', show);
  }

  veiled(show) {
    this.root.classList.toggle('veiled', show);
  }

  /** Cinema mode hides the play furniture but keeps the title card. */
  setCinema(on) {
    this.root.classList.toggle('cinema', on);
  }

  update(dt, view) {
    if (this.promptTimer > 0) {
      this.promptTimer -= dt;
      if (this.promptTimer <= 0) this.promptEl.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
    if (this.lineTimer > 0) {
      this.lineTimer -= dt;
      if (this.lineTimer <= 0) this.jobLine.classList.remove('say');
    }
    this.mapTimer -= dt;
    if (view && this.mapTimer <= 0) {
      this.mapTimer = 0.1;
      this.drawMap(view);
    }
  }

  drawMap(view) {
    const ctx = this.mapCtx;
    const size = this.mapCanvas.width;
    const { layout, player, car, driving } = view;
    const half = layout.half;
    const spanX = half * 2;
    const spanZ = layout.quay + half;

    const px = (x) => ((x + half) / spanX) * (size - 12) + 6;
    const pz = (z) => ((z + half) / spanZ) * (size - 12) + 6;

    ctx.clearRect(0, 0, size, size);

    // water
    const seaGrad = ctx.createLinearGradient(0, pz(layout.quay), 0, size);
    seaGrad.addColorStop(0, 'rgba(72, 138, 140, 0.45)');
    seaGrad.addColorStop(1, 'rgba(20, 52, 62, 0.7)');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, pz(layout.quay), size, size - pz(layout.quay));

    // blocks
    const bw = ((layout.block / spanX) * (size - 12));
    const bh = ((layout.block / spanZ) * (size - 12));
    for (let i = 0; i < layout.cols; i++) {
      for (let j = 0; j < layout.rows; j++) {
        const cx = half - layout.street - layout.block / 2 - i * layout.pitch;
        const cz = half - layout.street - layout.block / 2 - j * layout.pitch;
        const x0 = px(cx) - bw / 2;
        const y0 = pz(cz) - bh / 2;
        ctx.fillStyle = 'rgba(243, 231, 208, 0.26)';
        ctx.fillRect(x0, y0, bw, bh);
        ctx.strokeStyle = 'rgba(9, 13, 15, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1);
      }
    }

    // promenade edge and pier
    ctx.strokeStyle = 'rgba(243, 231, 208, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, pz(layout.quay));
    ctx.lineTo(size, pz(layout.quay));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240, 180, 90, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(layout.pierX), pz(layout.quay));
    ctx.lineTo(px(layout.pierX), pz(layout.quay + 90));
    ctx.stroke();

    // job marker
    if (view.marker) {
      const mx = px(view.marker.x);
      const mz = pz(view.marker.z);
      ctx.strokeStyle = 'rgba(240, 180, 90, 0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mx, mz, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(240, 180, 90, 0.85)';
      ctx.beginPath();
      ctx.moveTo(mx, mz - 3.2);
      ctx.lineTo(mx + 3.2, mz);
      ctx.lineTo(mx, mz + 3.2);
      ctx.lineTo(mx - 3.2, mz);
      ctx.closePath();
      ctx.fill();
    }

    // car dot
    if (car) {
      ctx.fillStyle = 'rgba(240, 180, 90, 0.95)';
      ctx.beginPath();
      ctx.arc(px(car.x), pz(car.z), driving ? 2.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240, 180, 90, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px(car.x), pz(car.z), driving ? 6 : 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // player arrow
    const ax = px(player.x);
    const az = pz(player.z);
    ctx.save();
    ctx.translate(ax, az);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#f3e7d0';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5.2, 5.4);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-5.2, 5.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export { districtAt };
