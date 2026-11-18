// Palm Havoc — the city of Marisol Bay. Every measurement, colour and handling number the
// world, the walker and the cars share lives in this one file.

export const CITY = {
  cells: 5,           // blocks along each side of the grid
  pitch: 104,         // centre-to-centre distance between parallel streets
  roadWidth: 18,
  sidewalkWidth: 5,
  curbHeight: 0.16,
  lotInset: 3,        // how far a building sits back from the pavement edge
};

export const CITY_SPAN = CITY.cells * CITY.pitch;
export const CITY_HALF = CITY_SPAN / 2;
export const BLOCK_SIZE = CITY.pitch - CITY.roadWidth;
export const LOT_SIZE = BLOCK_SIZE - CITY.sidewalkWidth * 2;

/** World coordinate of street `index` (0 to CITY.cells), running north-south or east-west. */
export function roadCenter(index) {
  return -CITY_HALF + index * CITY.pitch;
}

/** World coordinate of the centre of block `index` (0 to CITY.cells - 1). */
export function blockCenter(index) {
  return roadCenter(index) + CITY.pitch / 2;
}

/** The bay runs along the south edge of the grid; the beach and the water start past it. */
export const OCEAN = {
  beachStart: -CITY_HALF - 26,
  beachEnd: -CITY_HALF - 120,
  waterStart: -CITY_HALF - 96,
  level: -0.34,
};

/** Direction toward the sun, in world space: low, warm and down the main boulevard. */
export const SUN = { x: -0.44, y: 0.34, z: -0.79 };

export const COLORS = {
  skyTop: 0x1c6ed0,
  skyMid: 0x6fb6e9,
  horizon: 0xf8e0c0,
  haze: 0xeadfc8,
  sunDisc: 0xfff6de,
  asphalt: 0x43474e,
  laneMark: 0xf6f1e2,
  crossing: 0xf0ebdd,
  pavement: 0xd8cfbf,
  curb: 0xbeb5a5,
  sand: 0xf0d8ab,
  water: 0x1b7f9c,
  outskirt: 0xb9b08c,
  palmTrunk: 0x8a6b4a,
  palmLeaf: 0x4f8f3c,
  palmLeafDark: 0x3d7530,
};

/** Facade variants: wall, trim and an accent used for awnings and storefronts. */
export const FACADES = [
  { wall: '#f4e8d4', trim: '#dbc9b1', accent: '#c4603f' },
  { wall: '#e89c88', trim: '#f7d5c6', accent: '#2f6f74' },
  { wall: '#a3d3c6', trim: '#dcf0ea', accent: '#d1793f' },
  { wall: '#f1ce95', trim: '#fbe9c9', accent: '#3c7f92' },
  { wall: '#dfdcd3', trim: '#f8f6f0', accent: '#b9433c' },
  { wall: '#86b9cb', trim: '#d8ecf3', accent: '#e3a24a' },
];

export const DRESS = {
  skin: '#c98d63',
  hair: '#241c16',
  shirt: '#d9603b',
  trousers: '#2f3b52',
  shoes: '#f2f0e9',
};

export const CAR_PAINT = {
  body: '#c9382f',
  bodyDark: '#8f241f',
  roof: '#f5efe4',
  glass: '#22303a',
  chrome: '#cfd5d8',
  tyre: '#1b1d21',
  lamp: '#ffe9b0',
  tail: '#ff5a44',
};

/** Walking: metres a second, and how sharply the walker answers the keyboard. */
export const PLAYER = {
  walkSpeed: 4.4,
  runSpeed: 7.8,
  acceleration: 34,
  drag: 11,
  radius: 0.42,
  height: 1.84,
  eyeHeight: 1.62,
  stepHeight: 0.2,
};

/** Driving: an arcade model that leans on grip and a bicycle-steering yaw rate. */
export const CAR = {
  length: 4.5,
  width: 1.95,
  height: 1.3,
  wheelBase: 2.72,
  maxSpeed: 36,
  reverseSpeed: 9,
  acceleration: 16,
  brakeForce: 34,
  rollingDrag: 0.42,
  airDrag: 0.0016,
  maxSteer: 0.62,
  steerRate: 4.2,
  handbrake: 26,
  collisionRadius: 1.5,
};

export const CAMERA = {
  fov: 60,
  carFov: 68,
  footDistance: 4.9,
  footHeight: 2.1,
  footLookHeight: 1.45,
  carDistance: 8.6,
  carHeight: 3.4,
  carLookAhead: 6.0,
  minPitch: -0.55,
  maxPitch: 0.95,
  sensitivity: 0.0026,
  followLag: 6.5,
  fovLag: 2.2,
};

export const WORLD = {
  fogNear: 110,
  fogFar: 820,
  shadowRadius: 165,
  shadowMapSize: 2048,
};
