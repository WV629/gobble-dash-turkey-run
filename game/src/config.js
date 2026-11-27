// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720, groundY: 618 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  x: 250,
  width: 62,
  height: 58,
  gravity: 2600,
  jumpVelocity: -1080,
  doubleJumpVelocity: -950,
  dashTime: 0.22,
  dashCooldown: 1.1,
  stumbleTime: 0.55,
  invulnerable: 2.0,
};

export const LIVES = 3;

/** Distance in metres at which each zone starts; the escape gate is at ESCAPE_DISTANCE. */
export const ESCAPE_DISTANCE = 3000;
export const ZONES = [
  { name: 'FARMYARD', from: 0, to: 1000, banner: 'ZONE 1 · THE FARMYARD', sub: 'Out of the pen — run!' },
  { name: 'BARN', from: 1000, to: 2000, banner: 'ZONE 2 · THE BARN', sub: 'Hay bales and hanging knives…' },
  { name: 'KITCHEN', from: 2000, to: 3000, banner: 'ZONE 3 · THE KITCHEN', sub: 'The oven is lit. Do not stop!' },
];

export const FARMER = {
  startGap: 210, // pixels behind the turkey at the start of a run
  catchGap: 46, // gap at which the farmer grabs the turkey
  closeOnHit: 80, // pixels the farmer gains when the turkey stumbles
  fallBackOnCaught: 260, // pixels the farmer is pushed back after a catch
  creep: 4, // pixels per second the farmer gains while the turkey dawdles
  creepMaxGap: 320,
};

export const SCROLL = {
  baseSpeed: 330, // px per second at the start
  speedPerMetre: 0.075, // px/s added per metre run (caps at maxSpeed)
  maxSpeed: 640,
  metresPerPixel: 1 / 45, // 45 px of scrolling = 1 metre of escape (a full run takes ~7 minutes)
};

export const SPAWN = {
  minGap: 280, // px between obstacle groups at the start
  gapShrinkPerMetre: 0.03, // px less gap per metre
  minGapFloor: 180,
  cornChance: 0.35,
  powerupChance: 0.09,
  goldenChance: 0.08,
};

export const SCORE = {
  corn: 10,
  goldenCorn: 50,
  powerup: 25,
  perMetre: 1,
  zoneBonus: 250,
  escapeBonus: 1000,
  comboStep: 0.25, // +25% per combo step, caps at x3
  comboMax: 3,
  comboWindow: 4, // seconds to keep a combo alive
};

export const PALETTE = {
  title: '#171310',
  skyFarm: ['#f7c873', '#f2a35e', '#e87f4e'],
  skyBarn: ['#e8a35c', '#d97b4f', '#b85a44'],
  skyKitchen: ['#7a3b2e', '#5d2a24', '#3d1a18'],
  groundFarm: '#7d9b4e',
  groundFarmDark: '#5d7a38',
  groundBarn: '#8a6b3f',
  groundBarnDark: '#6b4f2c',
  groundKitchen: '#4a3630',
  groundKitchenDark: '#33241f',
  panel: 'rgba(20, 14, 10, 0.82)',
  panelBorder: '#f2c94c',
  text: '#fff6e5',
  muted: '#d8c9a8',
  accent: '#f2c94c',
  danger: '#ff5a4e',
  farmer: '#3e5a8a',
  farmerHat: '#2c3e5e',
  turkeyBody: '#8a5a30',
  turkeyFeather: '#a0522d',
  turkeyTail: ['#c96a2e', '#e8a33c', '#d2691e'],
  knife: '#d7dde6',
  knifeHandle: '#6e4423',
  corn: '#f2c94c',
  golden: '#ffd94d',
  heart: '#ff5a6e',
  shield: '#7fd4ff',
};

export const FONT = '"Trebuchet MS", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'turkey-run.best';
export const BEST_DISTANCE_KEY = 'turkey-run.best-distance';
