/* Salmora — every number that shapes the coast, the light and the handling.
   Keep this file boring: one home for metrics, palette and tuning. */

export const TITLE = 'SALMORA';
export const TAGLINE = 'a coastal crime story';
export const CAR_NAME = 'CORVINA 88';

/* --- city metrics ------------------------------------------------------ */

export const CITY = {
  cols: 7,
  rows: 7,
  block: 44,      // side of a city block, metres
  street: 14,     // carriageway + gutters
  walk: 4,        // pavement depth inside each block
  kerb: 0.18,     // pavement height above the tarmac
  gap: 0.9,       // breathing room between lots
  promenade: 16,  // seawall walk beyond the last street
};

CITY.pitch = CITY.block + CITY.street;
CITY.span = CITY.rows * CITY.pitch + CITY.street;
CITY.half = CITY.span / 2;

/** Centre of block (i, j) on the ground plane. */
export function blockCentre(i, j) {
  return {
    x: CITY.half - CITY.street - CITY.block / 2 - i * CITY.pitch,
    z: CITY.half - CITY.street - CITY.block / 2 - j * CITY.pitch,
  };
}

/** The shoreline sits past the southern row of blocks. */
CITY.quayZ = CITY.half - CITY.street / 2 + 6;
CITY.seaY = -1.15;

/* --- palette ----------------------------------------------------------- */

export const PALETTE = {
  asphalt: '#2f3236',
  kerb: '#9d9a92',
  pavement: '#b3aea3',
  pavementDark: '#8d887e',
  roof: '#4a4640',
  sea: '#1d4a54',
  seaDeep: '#14333c',

  sunLow: '#ffb070',
  sunHigh: '#fff3da',
  skyZenith: '#2b4a72',
  skyHorizon: '#ffb48a',
  haze: '#c9a68f',

  night: '#101a2a',

  stucco: ['#e6d3ae', '#dcbf9a', '#efdcc0', '#cfae8d'],
  brick: ['#8d5140', '#7a4436', '#9b6248', '#6e3d31'],
  glass: ['#7fa2a6', '#6d8f9c', '#8fb0ad', '#5d7f8b'],
  deco: ['#79b3ac', '#8ac2b4', '#e8d9b4', '#c98f70'],
};

/* --- districts --------------------------------------------------------- */

/* z bands, north (negative) to the water (positive). */
export const DISTRICTS = [
  { name: 'COBALT ROW', from: -999, to: -108, minH: 22, maxH: 58, family: 'glass', shops: ['BANCO LUME', 'TORRE AZUL'] },
  { name: 'OLD QUAY', from: -108, to: -20, minH: 10, maxH: 26, family: 'brick', shops: ['EL ANCLA', 'TABACO', 'PUERTO VIEJO'] },
  { name: 'SALT FLATS', from: -20, to: 92, minH: 8, maxH: 22, family: 'stucco', shops: ['MERCADO', 'CASA VELA', 'FARMACIA', 'RADIO SOL'] },
  { name: 'LANTERN HILL', from: 92, to: 999, minH: 7, maxH: 17, family: 'deco', shops: ['HOTEL MAREA', 'PESCADO', 'HELADOS'] },
];

export function districtAt(z) {
  for (const d of DISTRICTS) if (z >= d.from && z < d.to) return d;
  return DISTRICTS[DISTRICTS.length - 1];
}

/* --- feel -------------------------------------------------------------- */

export const WALK = {
  speed: 4.4,
  run: 7.8,
  accel: 34,
  damping: 11,
  gravity: 24,
  jump: 6.6,
  radius: 0.38,
  height: 1.78,
  eye: 1.52,
  stepUp: 0.34,
  bob: 0.05,
};

export const DRIVE = {
  mass: 1200,
  accel: 10.5,
  brake: 20,
  reverseAccel: 6,
  maxSpeed: 27,
  maxReverse: 7.5,
  drag: 0.62,
  roll: 1.1,
  steerMax: 0.62,
  steerRate: 5.2,
  steerFalloff: 2.1,
  wheelbase: 2.62,
  radius: 1.28,
  halfLength: 2.25,
  halfWidth: 0.95,
  ride: 0.62,
};

export const CAM = {
  walkDist: 5.2,
  walkLift: 0.35,
  walkPivot: 1.45,
  carDist: 8.4,
  carLift: 1.0,
  carPivot: 1.05,
  minDist: 3.2,
  maxDist: 11,
  sensitivity: 0.0023,
  smoothing: 9,
  lookAhead: 5.5,
};

export const START = {
  seed: 19770,
  cash: 240,
  health: 100,
  x: 3,
  z: 35.6,
  carX: 4.2,
  carZ: 31.6,
};

export const RENDER = {
  shadowMap: 2048,
  shadowExtent: 120,
  fogNear: 130,
  fogFar: 560,
  exposure: 1.04,
  fov: 58,
};
