// The heads-up display: the strip along the bottom, the cash and district badge, and the
// minimap, which is drawn from the same street grid the city itself was built on.
import { CITY, CITY_HALF, OCEAN, roadCenter } from './config.js';

const DISTRICTS = [
  'Coral Heights', 'Sunset Quay', 'Boulevard Nine', 'Palmera Row',
  'Saltwind', 'Calle Marina', 'Old Lagoon', 'Neon Parade',
];

const MAP_SPAN = 320;   // metres across the minimap
const MAP_ROAD = 18;    // how wide a street reads on the map

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.areaName = document.getElementById('area-name');
    this.cashValue = document.getElementById('cash-value');
    this.modeValue = document.getElementById('mode-value');
    this.healthFill = document.getElementById('health-fill');
    this.canvas = document.getElementById('minimap');
    this.context = this.canvas.getContext('2d');
    this.cash = 1240;
    this.health = 1;
    this.district = '';
  }

  show() {
    this.root.classList.add('visible');
  }

  hide() {
    this.root.classList.remove('visible');
  }

  setCash(amount) {
    this.cash = amount;
    this.cashValue.textContent = `$${amount.toLocaleString('en-US')}`;
  }

  setHealth(fraction) {
    this.health = Math.max(0, Math.min(1, fraction));
    this.healthFill.style.width = `${Math.round(this.health * 100)}%`;
  }

  /** Called once a frame with the walker, the car and whether the player is driving. */
  update(state) {
    this.setCash(this.cash);
    const position = state.mode === 'car' ? state.car.position : state.player.position;
    const district = this.districtAt(position.x, position.z);
    if (district !== this.district) {
      this.district = district;
      this.areaName.textContent = district;
    }
    if (state.mode === 'car') {
      const speed = Math.round(Math.abs(state.car.speed) * 3.6);
      this.modeValue.textContent = `${speed} km/h`;
    } else {
      this.modeValue.textContent = 'On foot';
    }
    this.drawMinimap(state);
  }

  districtAt(x, z) {
    const blockX = Math.min(CITY.cells - 1, Math.max(0, Math.round((x + CITY_HALF) / CITY.pitch - 0.5)));
    const blockZ = Math.min(CITY.cells - 1, Math.max(0, Math.round((z + CITY_HALF) / CITY.pitch - 0.5)));
    return DISTRICTS[(blockX * CITY.cells + blockZ) % DISTRICTS.length];
  }

  drawMinimap(state) {
    const context = this.context;
    const size = this.canvas.width;
    const half = size / 2;
    const scale = size / MAP_SPAN;
    const position = state.mode === 'car' ? state.car.position : state.player.position;

    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(half, half, half - 3, 0, Math.PI * 2);
    context.clip();

    context.fillStyle = '#16343c';
    context.fillRect(0, 0, size, size);

    const toX = (worldX) => half + (worldX - position.x) * scale;
    const toY = (worldZ) => half + (worldZ - position.z) * scale;

    const sandY = toY(OCEAN.beachStart);
    if (sandY < size) {
      context.fillStyle = '#e3c795';
      context.fillRect(0, sandY, size, size - sandY);
    }
    const waterY = toY(OCEAN.beachEnd);
    if (waterY < size) {
      context.fillStyle = '#1d7f9c';
      context.fillRect(0, waterY, size, size - waterY);
    }

    context.fillStyle = '#2f4f57';
    const road = MAP_ROAD * scale;
    for (let index = 0; index <= CITY.cells; index += 1) {
      const line = roadCenter(index);
      context.fillRect(0, toY(line) - road / 2, size, road);
      context.fillRect(toX(line) - road / 2, 0, road, size);
    }

    if (state.mode !== 'car') {
      context.fillStyle = '#ffd89b';
      context.beginPath();
      context.arc(toX(state.car.position.x), toY(state.car.position.z), 4.5, 0, Math.PI * 2);
      context.fill();
    }

    context.save();
    context.translate(half, half);
    if (state.mode === 'car') {
      context.rotate(Math.PI - state.car.heading);
      context.fillStyle = '#ff7a4d';
      context.fillRect(-3.5, -6, 7, 12);
    } else {
      context.rotate(-state.cameraYaw);
      context.beginPath();
      context.moveTo(0, -9);
      context.lineTo(6.5, 7);
      context.lineTo(0, 3.5);
      context.lineTo(-6.5, 7);
      context.closePath();
      context.fillStyle = '#ff7a4d';
      context.fill();
    }
    context.restore();

    const vignette = context.createRadialGradient(half, half, half * 0.5, half, half, half);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(4,16,20,0.6)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, size, size);

    context.restore();
    context.strokeStyle = 'rgba(246,241,230,0.28)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(half, half, half - 3, 0, Math.PI * 2);
    context.stroke();
  }
}
