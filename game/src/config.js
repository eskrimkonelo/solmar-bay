// Solmar Bay: every tuning number, colour and name in one place.
// The world is a big top-down city (3600 x 2600 world units); the camera shows a 1280x720
// slice of it and follows the player. Nothing here depends on the screen size.

export const STEP = 1 / 60;

export const WORLD = { width: 3600, height: 2600 };

// The city grid: roads run every BLOCK_PITCH units, each ROAD_WIDTH wide; the blocks between
// them hold buildings, parks and landmarks. The bay washes the whole southern edge.
export const CITY = {
  blockPitch: 320,
  roadWidth: 76,
  sidewalk: 14,
  originX: 120,
  originY: 120,
  cols: 10,
  rows: 7,
  bayY: 2320, // water starts here; the beach is the strip just above it
  beachHeight: 90,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 345,
  health: 100,
  // Pistol: shots per second, bullet speed, damage, magazine.
  fireRate: 4.5,
  bulletSpeed: 900,
  bulletDamage: 34,
  magazine: 12,
  reloadTime: 1.1,
};

export const CAR_TYPES = {
  sedan:   { name: 'Solano',  length: 64, width: 30, accel: 420, topSpeed: 540, turn: 2.6, color: '#c94f43', price: 120 },
  taxi:    { name: 'Cab',     length: 62, width: 30, accel: 400, topSpeed: 500, turn: 2.7, color: '#e8b93c', price: 90 },
  pickup:  { name: 'Bravo',   length: 70, width: 32, accel: 360, topSpeed: 470, turn: 2.3, color: '#4a7a52', price: 140 },
  sports:  { name: 'Veloce',  length: 66, width: 30, accel: 620, topSpeed: 730, turn: 3.1, color: '#e8e8e8', price: 400 },
  van:     { name: 'Courier', length: 72, width: 32, accel: 330, topSpeed: 440, turn: 2.1, color: '#7a6a8a', price: 110 },
  police:  { name: 'Cruiser', length: 66, width: 30, accel: 560, topSpeed: 660, turn: 2.9, color: '#20242e', price: 0 },
};

export const TRAFFIC = { maxCars: 26, maxPeds: 42, spawnDistance: 900, despawnDistance: 1300 };

export const WANTED = {
  maxStars: 5,
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 2,
  // Seconds out of every cop's sight before one star fades.
  decaySeconds: 14,
  // Police cars kept in the chase per star level.
  cruisersPerStar: [0, 1, 2, 3, 4, 5],
  // How long a cop must touch the player on foot before the bust lands.
  bustSeconds: 1.2,
};

export const ECONOMY = {
  startMoney: 150,
  missionReward: [400, 600, 800, 1200, 1500, 2500],
  garageRepaint: 200,
  hospitalBill: 150,
  bustFine: 250,
  pedPickup: 25,
};

export const SAVE_KEY = 'solmar-bay.save.v1';

// The story's people and places. All original: no Rockstar names, no GTA names.
export const STORY = {
  city: 'Solmar Bay',
  hero: 'Dario Cruz',
  heroNick: 'D',
  contact: 'Lena Marin',
  garage: "Lena's Garage",
  shark: 'Marco Voss',
  hospital: 'Solmar General',
  police: 'Solmar Bay PD',
};

export const PALETTE = {
  // Sun-soaked coast: warm sand, turquoise water, terracotta roofs, white walls.
  sky: '#ffd98a',
  grass: '#7fae5a',
  parkGrass: '#6da34e',
  sand: '#e8cf9a',
  water: '#2fa8b8',
  waterDeep: '#1f7f9e',
  road: '#3d3a38',
  roadLine: '#e8d44f',
  sidewalk: '#b8a88f',
  crosswalk: '#e8e4da',
  buildingRoof: ['#c96f4a', '#b8543f', '#8a6f5c', '#d9a05b', '#7a8a99', '#a34a5e'],
  buildingWall: '#e8dcc8',
  buildingGlass: '#7fb8c9',
  carShadow: 'rgba(0,0,0,0.28)',
  player: '#2f6fb8',
  playerSkin: '#e8b88a',
  cop: '#20242e',
  copSkin: '#d9a06a',
  pedShirts: ['#e84f4f', '#4f8ae8', '#e8c94f', '#7ac94f', '#c94fb8', '#e8e8e8', '#4fc9b8'],
  hudPanel: 'rgba(12,16,24,0.72)',
  hudText: '#f4f1e8',
  hudGold: '#f2c94c',
  wantedStar: '#f2c94c',
  wantedEmpty: 'rgba(244,241,232,0.28)',
  minimapWater: '#2fa8b8',
  minimapRoad: '#8a8578',
  minimapBlock: '#5c7a4a',
  markerMission: '#f2c94c',
  markerGarage: '#4fc3f7',
  markerHospital: '#e84f6a',
  markerPolice: '#4f8ae8',
  bullet: '#ffe9a8',
  muzzle: '#ffd94f',
  blood: '#a82828',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
