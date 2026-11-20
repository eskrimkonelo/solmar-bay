// The screenshot scenes behind ?shot=cover|chase|mission|title. Each one plays the real rules
// forward from a fresh world for a fixed time, steered by a simple autopilot, so the frame is
// what a short game really looks like and the same seed always gives the same frame.

import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const STEP = 1 / 60;

/** A fake input that holds W (drive forward / walk north) with no other buttons. */
function driveInput(world) {
  return {
    vector: () => ({ x: 0, y: -1 }),
    runHeld: () => false,
    mouse: () => ({ x: 0, y: 0, down: false }),
    actions: () => 0,
    aimWorld: () => ({ x: world.state.player.x, y: world.state.player.y - 120 }),
  };
}

function walkInput(world) {
  return {
    vector: () => ({ x: 0, y: -1 }),
    runHeld: () => false,
    mouse: () => ({ x: 640, y: 200, down: false }),
    actions: () => 0,
    aimWorld: () => ({ x: world.state.player.x + 120, y: world.state.player.y - 60 }),
  };
}

function putPlayerInCar(world, type, x, y, angle) {
  // Right-hand lane for the direction of travel, so oncoming traffic never overlaps.
  const laneX = x + Math.cos(angle + Math.PI / 2) * 16;
  const laneY = y + Math.sin(angle + Math.PI / 2) * 16;
  const car = world.spawnCar(type, laneX, laneY, { angle, parked: false });
  car.driver = 'player';
  const p = world.state.player;
  p.car = car;
  p.onFoot = false;
  p.x = x;
  p.y = y;
  p.angle = angle;
  return car;
}

function stageCover(world) {
  world.reset(true);
  const city = world.city;
  const roadX = city.roads.vertical[5].x;
  const roadY = city.roads.horizontal[6].y;
  // Start well south and drive north for two seconds: fast, but still inside the city.
  putPlayerInCar(world, 'sports', roadX, roadY + 200, -Math.PI / 2);
  // Start with empty streets: fresh walkers respawn off the road during the drive.
  world.state.peds.length = 0;
  // Traffic on other roads, kept out of the player's lane so the cover shows open road:
  // a taxi coming the other way, a pickup crossing on the avenue, a sedan on the next street.
  world.spawnCar('taxi', roadX - 16, roadY - 300, { driver: 'traffic', angle: Math.PI / 2 });
  world.spawnCar('pickup', roadX + 320, roadY - 16, { driver: 'traffic', angle: 0 });
  world.spawnCar('sedan', city.roads.vertical[3].x, roadY - 500, { driver: 'traffic', angle: -Math.PI / 2 });
  // Pedestrians on the sidewalks.
  for (let i = 0; i < 6; i += 1) {
    world.spawnPed(roadX + 60 + (i % 2) * 130, roadY + 120 - i * 90);
  }
  const input = driveInput(world);
  for (let i = 0; i < 2 / STEP; i += 1) {
    world.step(STEP, input);
    world.state.peds.length = 0; // no walkers near the car during staging
  }
  return { screen: SCREEN_PLAY, save: null };
}

function stageChase(world) {
  world.reset(true);
  const city = world.city;
  const roadX = city.roads.vertical[6].x;
  const roadY = city.roads.horizontal[6].y;
  putPlayerInCar(world, 'sports', roadX, roadY + 200, -Math.PI / 2);
  world.state.wanted.stars = 3;
  world.state.peds.length = 0; // the chase is about cars, not walkers
  // Two cruisers on the player's tail, close enough to stay in frame behind the car.
  // They are tuned slightly faster than the player's car so the chase holds together.
  const cop1 = world.spawnCop(roadX, roadY + 520, false);
  const cop2 = world.spawnCop(roadX + 20, roadY + 600, false);
  cop1.car.speed = 600;
  cop2.car.speed = 580;
  cop1.car.topSpeed = 780;
  cop2.car.topSpeed = 780;
  cop1.car.accel = 700;
  cop2.car.accel = 700;
  world.spawnCar('sedan', city.roads.vertical[4].x, roadY - 300, { driver: 'traffic', angle: -Math.PI / 2 });
  world.spawnCar('van', roadX - 16, roadY - 500, { driver: 'traffic', angle: Math.PI / 2 });
  const input = driveInput(world);
  for (let i = 0; i < 2.5 / STEP; i += 1) {
    world.step(STEP, input);
    world.state.peds.length = 0; // the chase is about cars, not walkers
  }
  return { screen: SCREEN_PLAY, save: null };
}

function stageMission(world) {
  world.reset(true);
  const marina = world.city.landmarks.marina;
  // Walk Dario to the marina, then jump the story to the hit: the goto step completes the
  // moment the player arrives, and the eliminate step spawns the informant.
  world.missions.start(3);
  world.state.player.x = marina.x;
  world.state.player.y = marina.y + 120;
  world.state.player.angle = -Math.PI / 2;
  const input = walkInput(world);
  for (let i = 0; i < 2 / STEP; i += 1) world.step(STEP, input);
  // A couple of bystanders and a parked car sell the scene.
  world.spawnCar('sedan', marina.x - 120, marina.y + 60, { parked: true, angle: 0 });
  world.spawnPed(marina.x + 90, marina.y + 40);
  world.spawnPed(marina.x - 60, marina.y + 150);
  return { screen: SCREEN_PLAY, save: null };
}

/**
 * Set `world` to the named scene (cover, chase, mission; any other name is the title) and
 * return the screen to draw and the save to show on it.
 */
export function stageShot(name, world) {
  if (name === 'cover') return stageCover(world);
  if (name === 'chase') return stageChase(world);
  if (name === 'mission') return stageMission(world);
  world.reset(true);
  return { screen: SCREEN_TITLE, save: null };
}
