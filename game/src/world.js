// Solmar Bay's rules and state, with no drawing and no browser in it: the player on foot and
// in cars, traffic and pedestrians, the police and the wanted level, combat, pickups, the garage
// and the hospital, and the mission chain. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react (and play sounds) without the world knowing
// about screens or speakers.

import { CAR_TYPES, CITY, ECONOMY, PLAYER, STORY, TRAFFIC, WANTED } from './config.js';
import { createMissions, MISSIONS, MISSION_DONE, MISSION_FAIL, MISSION_STEP } from './missions.js';

export const EVENT_HIT = 1;
export const EVENT_SHOT = 2;
export const EVENT_CRASH = 4;
export const EVENT_PICKUP = 8;
export const EVENT_STAR = 16;
export const EVENT_BUSTED = 32;
export const EVENT_WASTED = 64;
export const EVENT_MISSION_STEP = 128;
export const EVENT_MISSION_DONE = 256;
export const EVENT_MISSION_FAIL = 512;
export const EVENT_CAR_DEAD = 1024;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function createWorld(random, city, audio) {
  const state = {
    time: 0,
    money: ECONOMY.startMoney,
    health: PLAYER.health,
    wanted: { stars: 0, heat: 0, decay: 0 },
    player: {
      x: 0, y: 0, angle: -Math.PI / 2, vx: 0, vy: 0,
      onFoot: true, car: null, ammo: PLAYER.magazine, reload: 0, fireCd: 0, invuln: 0,
      bustTimer: 0, dead: false,
    },
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    skids: [],
    pickups: [],
    camera: { x: 0, y: 0 },
    message: null,
    messageTimer: 0,
    banner: null,
    bannerTimer: 0,
    stolenMissionCar: false,
    stats: { shots: 0, hits: 0, carsStolen: 0, missionsDone: 0, busted: 0, wasted: 0 },
    saved: null,
  };

  // ---- mission wiring -------------------------------------------------------
  const missions = createMissions({
    city: () => city,
    cityLandmark: (name) => city.landmarks[name],
    parkSpot: () => ({ x: city.parks[0].x + city.parks[0].w / 2, y: city.parks[0].y + city.parks[0].h / 2 }),
    hideoutSpot: () => ({ x: CITY.originX + CITY.blockPitch / 2, y: CITY.originY + CITY.blockPitch / 2 }),
    spawnMissionCar: (type, x, y) => spawnCar(type, x, y, { mission: true, parked: true }),
    spawnTargetPed: (x, y, role) => spawnPed(x, y, { role }),
    setWanted: (stars) => { state.wanted.stars = stars; state.wanted.heat = 0; state.wanted.decay = 0; },
    onMissionStart: (mission) => {
      showBanner(`${mission.title}`, `${mission.giver}: ${mission.brief}`);
      audio.mission();
    },
    onMissionDone: (mission) => {
      state.money += mission.reward;
      state.stats.missionsDone += 1;
      showBanner('Mission complete', `${mission.title} — $${mission.reward}`);
      audio.mission();
      saveGame();
    },
    onMissionFail: (mission) => {
      showBanner('Mission failed', mission ? `${mission.title} — try again at the garage` : 'Job failed');
    },
  });

  // The renderer reads the mission state off the world state.
  state.missions = missions;

  // ---- messages -------------------------------------------------------------
  function showMessage(text, seconds = 3) {
    state.message = text;
    state.messageTimer = seconds;
  }
  function showBanner(title, text) {
    state.banner = { title, text };
    state.bannerTimer = 4.5;
  }

  // ---- save / load ------------------------------------------------------------
  function saveGame() {
    const data = {
      money: state.money,
      missionIndex: missions.state.index,
      completed: missions.state.completed,
      health: state.health,
      x: state.player.x,
      y: state.player.y,
      stats: state.stats,
    };
    state.saved = data;
    try {
      window.localStorage.setItem('solmar-bay.save.v1', JSON.stringify(data));
    } catch {
      // Storage can be off: the save then lasts this visit only.
    }
  }
  function loadSave() {
    try {
      const raw = window.localStorage.getItem('solmar-bay.save.v1');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ---- spawning ---------------------------------------------------------------
  function spawnCar(type, x, y, opts = {}) {
    const def = CAR_TYPES[type];
    const car = {
      type, def, x, y, angle: opts.angle ?? random.range(0, TAU),
      speed: 0, health: 100, color: opts.color ?? def.color,
      driver: opts.driver ?? null, // 'traffic' | 'police' | 'player' | null (parked)
      mission: !!opts.mission, parked: !!opts.parked, wreck: false,
      node: null, nextNode: null, laneOffset: 0, cruise: 0, brakeLight: false,
      stuckTimer: 0, siren: false, bumpCd: 0,
    };
    state.cars.push(car);
    return car;
  }

  function spawnPed(x, y, opts = {}) {
    const ped = {
      x, y, angle: random.range(0, TAU), speed: 0,
      color: random.pick(['#e84f4f', '#4f8ae8', '#e8c94f', '#7ac94f', '#c94fb8', '#e8e8e8', '#4fc9b8']),
      role: opts.role ?? 'walker', // walker | target | shooter | friend | cop
      alive: true, health: opts.role === 'shooter' ? 60 : 30,
      state: 'walk', fleeX: 0, fleeY: 0, fleeTimer: 0,
      shootCd: random.range(0.5, 1.5), pickedUp: false, fade: 0,
      walkTarget: null,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnCop(x, y, onFoot) {
    const cop = {
      x, y, angle: 0, speed: 0, onFoot: !!onFoot, car: null,
      health: 50, shootCd: random.range(0.5, 1.5), touchTimer: 0, ramCd: 0, alive: true,
    };
    if (!onFoot) {
      cop.car = spawnCar('police', x, y, { driver: 'police' });
      cop.car.siren = true;
    }
    state.cops.push(cop);
    return cop;
  }

  function spawnPickup(x, y, kind, amount) {
    state.pickups.push({ x, y, kind, amount, bob: random.range(0, TAU) });
  }

  function addParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random.range(0, TAU);
      const s = random.range(speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: random.range(life * 0.5, life), maxLife: life, color, size: random.range(size * 0.6, size * 1.4),
      });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function addSkid(x, y, angle) {
    state.skids.push({ x, y, angle, life: 6 });
    if (state.skids.length > 300) state.skids.shift();
  }

  // ---- wanted -------------------------------------------------------------------
  function addWanted(stars, reason) {
    const before = state.wanted.stars;
    state.wanted.stars = Math.min(WANTED.maxStars, state.wanted.stars + stars);
    state.wanted.decay = 0;
    if (state.wanted.stars > before) {
      showMessage(`Wanted level ${state.wanted.stars} — ${reason}`, 3);
      return true;
    }
    return false;
  }

  function nearestCopDistance() {
    let best = Infinity;
    for (const cop of state.cops) {
      if (!cop.alive) continue;
      const d = dist2(state.player.x, state.player.y, cop.x, cop.y);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // ---- reset / start -------------------------------------------------------------
  function reset(newGame) {
    state.cars.length = 0;
    state.peds.length = 0;
    state.cops.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    state.skids.length = 0;
    state.pickups.length = 0;
    state.time = 0;
    state.wanted.stars = 0;
    state.wanted.decay = 0;
    const g = city.landmarks.garage;
    const p = state.player;
    p.x = g.x + 40;
    p.y = g.y + g.h / 2 + 60;
    p.angle = -Math.PI / 2;
    p.vx = 0; p.vy = 0;
    p.onFoot = true; p.car = null;
    p.ammo = PLAYER.magazine; p.reload = 0; p.fireCd = 0; p.invuln = 0; p.bustTimer = 0; p.dead = false;
    if (newGame) {
      state.money = ECONOMY.startMoney;
      state.health = PLAYER.health;
      missions.state.index = 0;
      missions.state.completed = 0;
      missions.state.active = null;
      state.stats = { shots: 0, hits: 0, carsStolen: 0, missionsDone: 0, busted: 0, wasted: 0 };
    }
    state.camera.x = p.x;
    state.camera.y = p.y;
    // Parked cars, a few pickups and the first walkers, all near the garage.
    for (const spot of city.parkedSpots) {
      if (state.cars.length >= 14) break;
      if (random.chance(0.5)) spawnCar(random.pick(['sedan', 'sedan', 'taxi', 'pickup', 'van', 'sports']), spot.x, spot.y, { angle: spot.angle, parked: true });
    }
    spawnPickup(g.x - 80, g.y - 40, 'ammo', 24);
    spawnPickup(city.landmarks.hospital.x, city.landmarks.hospital.y + 60, 'health', 50);
    for (let i = 0; i < 16; i += 1) {
      spawnPed(p.x + random.range(-400, 400), p.y + random.range(-300, 300));
    }
  }

  function applySave(save) {
    state.money = save.money;
    state.health = save.health;
    missions.state.index = save.missionIndex;
    missions.state.completed = save.completed;
    state.stats = save.stats;
    state.player.x = save.x;
    state.player.y = save.y;
    state.camera.x = save.x;
    state.camera.y = save.y;
  }

  // ---- combat ------------------------------------------------------------------
  function fireBullet(x, y, angle, fromPlayer) {
    state.bullets.push({
      x, y, vx: Math.cos(angle) * PLAYER.bulletSpeed, vy: Math.sin(angle) * PLAYER.bulletSpeed,
      life: 0.9, fromPlayer,
    });
    addParticles(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18, 3, '#ffd94f', 120, 0.12, 3);
  }

  function hurtPlayer(damage) {
    const p = state.player;
    if (p.invuln > 0 || p.dead) return false;
    state.health -= damage;
    p.invuln = 0.5;
    if (state.health <= 0) {
      state.health = 0;
      return true;
    }
    return false;
  }

  // ---- entering / stealing cars ---------------------------------------------------
  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (car.wreck || car.driver === 'player') continue;
      if (car.type === 'police' && car.driver === 'police') continue;
      const d = dist2(state.player.x, state.player.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    const p = state.player;
    // The driver bails and runs.
    if (car.driver === 'traffic') {
      const driver = spawnPed(car.x + 30, car.y + 30, { role: 'walker' });
      driver.state = 'flee';
      driver.fleeX = car.x + 200;
      driver.fleeY = car.y;
      driver.fleeTimer = 4;
    }
    const wasMission = car.mission;
    car.driver = 'player';
    car.parked = false;
    p.car = car;
    p.onFoot = false;
    p.x = car.x;
    p.y = car.y;
    if (!wasMission) {
      state.stats.carsStolen += 1;
      addWanted(WANTED.stealCar, 'grand theft auto');
    } else {
      state.stolenMissionCar = true;
    }
    showMessage(car.mission ? `You took the ${car.def.name}` : `You stole a ${car.def.name} — the cops noticed`, 2.5);
  }

  function exitCar() {
    const p = state.player;
    if (!p.car) return;
    const car = p.car;
    car.driver = null;
    car.parked = true;
    car.speed = 0;
    p.car = null;
    p.onFoot = true;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
    p.angle = car.angle;
    city.collideCircle({ x: p.x, y: p.y, radius: PLAYER.radius });
  }

  // ---- traffic AI ------------------------------------------------------------------
  function nearestNode(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const node of city.graph) {
      const d = dist2(x, y, node.x, node.y);
      if (d < bestD) { bestD = d; best = node; }
    }
    return best;
  }

  function driveTraffic(car, dt) {
    if (!car.node) {
      car.node = nearestNode(car.x, car.y);
      car.nextNode = car.node.neighbors[0] ?? car.node;
      car.laneOffset = 16;
      car.cruise = random.range(120, 185);
    }
    const target = city.graph[car.nextNode.id ?? car.nextNode];
    // Lane offset: right-hand side of the direction of travel.
    const dirAngle = Math.atan2(target.y - car.node.y, target.x - car.node.x);
    const tx = target.x + Math.cos(dirAngle + Math.PI / 2) * car.laneOffset;
    const ty = target.y + Math.sin(dirAngle + Math.PI / 2) * car.laneOffset;
    const want = Math.atan2(ty - car.y, tx - car.x);
    const turn = normAngle(want - car.angle);
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, turn));
    // Slow down for the car ahead.
    let blocked = false;
    for (const other of state.cars) {
      if (other === car || other.wreck) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 62 && side < 26) { blocked = true; break; }
    }
    const wantSpeed = blocked ? 0 : car.cruise;
    car.speed += (wantSpeed - car.speed) * Math.min(1, 2.2 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (dist2(car.x, car.y, tx, ty) < 24 * 24) {
      car.node = target;
      const options = target.neighbors.filter((n) => n !== car.node.id || target.neighbors.length === 1);
      const next = options.length ? options[Math.floor(random.next() * options.length)] : target.neighbors[0];
      car.nextNode = city.graph[next];
    }
  }

  // ---- police AI ---------------------------------------------------------------------
  function drivePolice(car, dt) {
    const p = state.player;
    const tx = p.car ? p.car.x : p.x;
    const ty = p.car ? p.car.y : p.y;
    const want = Math.atan2(ty - car.y, tx - car.x);
    const turn = normAngle(want - car.angle);
    const steer = Math.max(-3.2 * dt, Math.min(3.2 * dt, turn));
    car.angle += steer;
    const dist = Math.sqrt(dist2(car.x, car.y, tx, ty));
    const wantSpeed = dist > 90 ? car.def.topSpeed * 0.92 : car.def.topSpeed * 0.5;
    car.speed += (wantSpeed - car.speed) * Math.min(1, 2.5 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (Math.abs(steer) > 0.05 && car.speed > 260) addSkid(car.x, car.y, car.angle);
    const body = { x: car.x, y: car.y, radius: 22 };
    if (city.collideCircle(body)) {
      car.x = body.x;
      car.y = body.y;
      car.speed *= 0.6;
      car.angle += random.range(-0.4, 0.4);
    }
  }

  function updatePolice(dt, events) {
    const p = state.player;
    const stars = state.wanted.stars;
    const wantCruisers = WANTED.cruisersPerStar[stars] ?? 0;
    let cruisers = 0;
    for (const cop of state.cops) if (cop.alive && cop.car) cruisers += 1;
    // Spawn cruisers off-screen when the chase is under strength.
    if (stars > 0 && cruisers < wantCruisers && random.chance(dt * 0.8)) {
      const a = random.range(0, TAU);
      const x = p.x + Math.cos(a) * 850;
      const y = p.y + Math.sin(a) * 850;
      if (!city.buildingAt(x, y) && !city.isWater(x, y)) spawnCop(x, y, false);
    }
    // Foot cops when the player is on foot and the heat is on.
    let foot = 0;
    for (const cop of state.cops) if (cop.alive && cop.onFoot) foot += 1;
    if (stars > 0 && p.onFoot && foot < Math.min(stars, 3) && random.chance(dt * 0.6)) {
      const a = random.range(0, TAU);
      spawnCop(p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420, true);
    }
    for (const cop of state.cops) {
      if (!cop.alive) continue;
      if (cop.car) {
        if (stars === 0) {
          // Heat gone: the cruiser gives up and drives off.
          cop.car.siren = false;
          driveTraffic(cop.car, dt);
          if (dist2(cop.car.x, cop.car.y, p.x, p.y) > 1400 * 1400) {
            cop.alive = false;
            cop.car.wreck = true;
            cop.car.driver = null;
          }
        } else {
          drivePolice(cop.car, dt);
          cop.x = cop.car.x;
          cop.y = cop.car.y;
          // Ramming the player's car hurts it — one discrete hit per cooldown,
          // so a cruiser glued to the bumper can slow the player but never pin it.
          cop.ramCd -= dt;
          if (p.car && cop.ramCd <= 0 && dist2(cop.car.x, cop.car.y, p.car.x, p.car.y) < 52 * 52) {
            cop.ramCd = 1.2;
            p.car.health -= 6;
            p.car.speed *= 0.92;
            addParticles(p.car.x, p.car.y, 8, '#ffd166', 160, 0.5, 3);
            if (p.car.health <= 0) {
              p.car.wreck = true;
              addParticles(p.car.x, p.car.y, 26, '#ff8a3c', 260, 0.8, 5);
              events.value |= EVENT_CAR_DEAD;
              exitCar();
            }
          }
        }
      } else if (cop.onFoot) {
        if (stars === 0) {
          cop.alive = false;
          continue;
        }
        const d = Math.sqrt(dist2(cop.x, cop.y, p.x, p.y));
        const want = Math.atan2(p.y - cop.y, p.x - cop.x);
        cop.angle = want;
        const speed = p.onFoot ? 235 : 150;
        cop.x += Math.cos(want) * speed * dt;
        cop.y += Math.sin(want) * speed * dt;
        const body = { x: cop.x, y: cop.y, radius: 12 };
        city.collideCircle(body);
        cop.x = body.x;
        cop.y = body.y;
        if (p.onFoot && d < 30) {
          cop.touchTimer += dt;
          if (cop.touchTimer >= WANTED.bustSeconds) {
            events.value |= EVENT_BUSTED;
            return events;
          }
        } else {
          cop.touchTimer = 0;
        }
        // Cops open fire at three stars and up.
        if (stars >= 3 && d < 420 && d > 60) {
          cop.shootCd -= dt;
          if (cop.shootCd <= 0) {
            cop.shootCd = random.range(1.2, 2);
            fireBullet(cop.x, cop.y, want + random.range(-0.12, 0.12), false);
            audio.shoot();
          }
        }
      }
    }
    return events;
  }

  // ---- pedestrians ----------------------------------------------------------------------
  function updatePeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (!ped.alive) {
        ped.fade += dt;
        continue;
      }
      if (ped.role === 'target' || ped.role === 'shooter') {
        // Mission targets run from the player once the shooting starts.
        if (state.wanted.stars > 0 || ped.state === 'flee') {
          ped.state = 'flee';
          const away = Math.atan2(ped.y - p.y, ped.x - p.x);
          ped.angle = away;
          ped.x += Math.cos(away) * 200 * dt;
          ped.y += Math.sin(away) * 200 * dt;
          const body = { x: ped.x, y: ped.y, radius: 12 };
          city.collideCircle(body);
          ped.x = body.x;
          ped.y = body.y;
        }
        continue;
      }
      if (ped.role === 'friend') continue; // Lena waits at the park.
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
        ped.angle = away;
        ped.x += Math.cos(away) * 210 * dt;
        ped.y += Math.sin(away) * 210 * dt;
        const body = { x: ped.x, y: ped.y, radius: 12 };
        city.collideCircle(body);
        ped.x = body.x;
        ped.y = body.y;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
        continue;
      }
      // A walker strolls around its block, turning at corners.
      if (!ped.walkTarget) {
        const a = random.range(0, TAU);
        ped.walkTarget = { x: ped.x + Math.cos(a) * 200, y: ped.y + Math.sin(a) * 200 };
      }
      const dx = ped.walkTarget.x - ped.x;
      const dy = ped.walkTarget.y - ped.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 12) {
        ped.walkTarget = null;
        continue;
      }
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * 55 * dt;
      ped.y += (dy / d) * 55 * dt;
      const body = { x: ped.x, y: ped.y, radius: 12 };
      if (city.collideCircle(body) || city.isWater(ped.x, ped.y)) {
        ped.walkTarget = null;
        ped.x = body.x;
        ped.y = body.y;
      }
    }
    // Keep the streets alive: top walkers up near the player, cull the far ones.
    state.peds = state.peds.filter((ped) => ped.alive || ped.fade < 8);
    let walkers = 0;
    for (const ped of state.peds) if (ped.alive && ped.role === 'walker') walkers += 1;
    if (walkers < 14 && random.chance(dt * 2)) {
      const a = random.range(0, TAU);
      const x = p.x + Math.cos(a) * random.range(300, 800);
      const y = p.y + Math.sin(a) * random.range(300, 800);
      if (!city.buildingAt(x, y) && !city.isWater(x, y) && city.isRoad(x, y) === false) spawnPed(x, y);
    }
  }

  // ---- traffic upkeep ----------------------------------------------------------------------
  function updateTraffic(dt) {
    const p = state.player;
    let count = 0;
    for (const car of state.cars) if (car.driver === 'traffic') count += 1;
    if (count < 10 && random.chance(dt * 1.5)) {
      const node = city.graph[Math.floor(random.next() * city.graph.length)];
      if (dist2(node.x, node.y, p.x, p.y) > 650 * 650 && dist2(node.x, node.y, p.x, p.y) < 1200 * 1200) {
        spawnCar(random.pick(['sedan', 'sedan', 'taxi', 'pickup', 'van']), node.x, node.y, { driver: 'traffic' });
      }
    }
    for (const car of state.cars) {
      if (car.driver === 'traffic') driveTraffic(car, dt);
    }
    // Cull traffic that drove far away; wrecks stay where they fell.
    state.cars = state.cars.filter((car) => {
      if (car.driver === 'traffic' && dist2(car.x, car.y, p.x, p.y) > TRAFFIC.despawnDistance * TRAFFIC.despawnDistance) return false;
      if (car.wreck && car.driver !== 'player' && dist2(car.x, car.y, p.x, p.y) > 900 * 900) return false;
      return true;
    });
  }

  // ---- the step -----------------------------------------------------------------------------
  function updatePlayerOnFoot(dt, input, events) {
    const p = state.player;
    const v = input.vector();
    const speed = input.runHeld() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const len = Math.hypot(v.x, v.y) || 1;
    p.vx = (v.x / len) * speed * (v.x || v.y ? 1 : 0);
    p.vy = (v.y / len) * speed * (v.x || v.y ? 1 : 0);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (v.x || v.y) p.angle = Math.atan2(v.y, v.x);
    const body = { x: p.x, y: p.y, radius: PLAYER.radius };
    city.collideCircle(body);
    p.x = body.x;
    p.y = body.y;
    // Push out of cars (walking into one does not board it).
    for (const car of state.cars) {
      if (car.wreck) continue;
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const min = 30;
      if (d < min && d > 0.01) {
        p.x = car.x + (dx / d) * min;
        p.y = car.y + (dy / d) * min;
      }
    }
    if (p.invuln > 0) p.invuln -= dt;
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) p.ammo = PLAYER.magazine;
    }
    if (p.fireCd > 0) p.fireCd -= dt;
    // Shooting: aim with the mouse, click to fire.
    if (input.mouse().down && p.fireCd <= 0 && p.reload <= 0) {
      if (p.ammo > 0) {
        p.ammo -= 1;
        p.fireCd = 1 / PLAYER.fireRate;
        state.stats.shots += 1;
        const aim = input.aimWorld();
        fireBullet(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16, Math.atan2(aim.y - p.y, aim.x - p.x), true);
        audio.shoot();
        p.angle = Math.atan2(aim.y - p.y, aim.x - p.x);
        // A shot fired where the cops can hear it is a crime.
        if (state.wanted.stars < 1 && nearestCopDistance() < 600) {
          state.wanted.stars = 1;
          showMessage('Wanted level 1 — shots fired', 3);
          events.value |= EVENT_STAR;
        }
      } else {
        p.reload = PLAYER.reloadTime;
      }
    }
    if (input.actions() & 8) {
      if (p.ammo < PLAYER.magazine && p.reload <= 0) p.reload = PLAYER.reloadTime;
    }
    // Enter a car.
    if (input.actions() & 4) {
      const car = nearestCar(70);
      if (car) enterCar(car);
    }
  }

  function updatePlayerCar(dt, input, events) {
    const p = state.player;
    const car = p.car;
    if (!car || car.wreck) return;
    const v = input.vector();
    const def = car.def;
    // W/S: throttle and brake/reverse. A/D: steer, weaker at a standstill.
    const throttle = -v.y;
    if (throttle > 0) car.speed += def.accel * dt;
    else if (throttle < 0) {
      if (car.speed > 30) car.speed -= def.accel * 1.6 * dt;
      else car.speed -= def.accel * 0.5 * dt;
    }
    car.speed -= car.speed * 0.55 * dt; // drag and rolling resistance
    car.speed = Math.max(-def.topSpeed * 0.45, Math.min(def.topSpeed, car.speed));
    const steerInput = v.x;
    const steerAuthority = Math.min(1, Math.abs(car.speed) / 120);
    car.angle += steerInput * def.turn * steerAuthority * (car.speed >= 0 ? 1 : -1) * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const body = { x: nx, y: ny, radius: 22 };
    const hitBuilding = city.collideCircle(body);
    if (hitBuilding && Math.abs(car.speed) > 120) {
      car.health -= Math.abs(car.speed) * 0.05;
      addParticles(car.x, car.y, 8, '#c9c9c9', 160, 0.4, 4);
      audio.crash();
      events.value |= EVENT_CRASH;
      car.speed *= -0.25;
    } else if (hitBuilding) {
      car.speed *= 0.4;
    }
    car.x = body.x;
    car.y = body.y;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (Math.abs(steerInput) > 0.5 && Math.abs(car.speed) > 300) addSkid(car.x, car.y, car.angle);
    // Hitting a pedestrian with the car.
    for (const ped of state.peds) {
      if (!ped.alive || ped.role === 'friend') continue;
      if (dist2(car.x, car.y, ped.x, ped.y) < 30 * 30 && Math.abs(car.speed) > 140) {
        ped.alive = false;
        ped.health = 0;
        addParticles(ped.x, ped.y, 14, '#a82828', 200, 0.7, 4);
        if (random.chance(0.5)) spawnPickup(ped.x, ped.y, 'cash', ECONOMY.pedPickup);
        addWanted(WANTED.hitPed, 'pedestrian down');
        events.value |= EVENT_STAR;
        audio.hit();
      }
    }
    // Car-to-car bumps: separate every step, but the speed/damage hit is
    // cooldown-gated — a car glued to the bumper must not pin the player to a crawl.
    car.bumpCd -= dt;
    for (const other of state.cars) {
      if (other === car || other.wreck) continue;
      const d = Math.sqrt(dist2(car.x, car.y, other.x, other.y));
      if (d < 52 && d > 0.01) {
        const push = (52 - d) / 2;
        const nx2 = (car.x - other.x) / d;
        const ny2 = (car.y - other.y) / d;
        car.x += nx2 * push;
        car.y += ny2 * push;
        other.x -= nx2 * push;
        other.y -= ny2 * push;
        if (car.bumpCd <= 0) {
          car.bumpCd = 0.6;
          if (Math.abs(car.speed) > 200) {
            car.health -= 4;
            other.health -= 4;
            audio.crash();
            events.value |= EVENT_CRASH;
          }
          car.speed *= 0.7;
        }
      }
    }
    if (car.health <= 0 && !car.wreck) {
      car.wreck = true;
      addParticles(car.x, car.y, 30, '#ff8a3c', 300, 1, 6);
      addParticles(car.x, car.y, 20, '#333333', 120, 1.4, 8);
      audio.crash();
      events.value |= EVENT_CAR_DEAD;
      exitCar();
    }
    if (input.actions() & 4) exitCar();
  }

  function updateBullets(dt, events) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (city.buildingAt(b.x, b.y) || city.isWater(b.x, b.y)) {
        addParticles(b.x, b.y, 4, '#e8e4da', 120, 0.25, 3);
        b.life = 0;
        continue;
      }
      // Peds and cops.
      for (const ped of state.peds) {
        if (!ped.alive || ped.role === 'friend') continue;
        if (dist2(b.x, b.y, ped.x, ped.y) < 15 * 15) {
          b.life = 0;
          ped.health -= PLAYER.bulletDamage;
          if (b.fromPlayer) state.stats.hits += 1;
          addParticles(ped.x, ped.y, 8, '#a82828', 160, 0.5, 4);
          if (ped.health <= 0) {
            ped.alive = false;
            if (b.fromPlayer) {
              if (ped.role === 'target' || ped.role === 'shooter') missions.onTargetDown(ped);
              else {
                addWanted(WANTED.hitPed, 'pedestrian down');
                events.value |= EVENT_STAR;
              }
              if (random.chance(0.5)) spawnPickup(ped.x, ped.y, 'cash', ECONOMY.pedPickup);
            }
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const cop of state.cops) {
        if (!cop.alive || !cop.onFoot) continue;
        if (dist2(b.x, b.y, cop.x, cop.y) < 15 * 15) {
          b.life = 0;
          cop.health -= PLAYER.bulletDamage;
          if (b.fromPlayer) state.stats.hits += 1;
          addParticles(cop.x, cop.y, 8, '#a82828', 160, 0.5, 4);
          if (cop.health <= 0) {
            cop.alive = false;
            addWanted(WANTED.killCop, 'officer down');
            events.value |= EVENT_STAR;
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of state.cars) {
        if (car.wreck) continue;
        if (dist2(b.x, b.y, car.x, car.y) < 26 * 26) {
          b.life = 0;
          car.health -= PLAYER.bulletDamage * 0.5;
          addParticles(b.x, b.y, 4, '#ffd94f', 140, 0.25, 3);
          break;
        }
      }
      // A cop's bullet can hit the player.
      if (!b.fromPlayer && state.player.onFoot) {
        if (dist2(b.x, b.y, state.player.x, state.player.y) < 14 * 14) {
          b.life = 0;
          if (hurtPlayer(9)) events.value |= EVENT_WASTED;
          else events.value |= EVENT_HIT;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  function updatePickups(dt, events) {
    const p = state.player;
    for (const pk of state.pickups) {
      pk.bob += dt * 3;
      const d = dist2(p.x, p.y, pk.x, pk.y);
      if (d < 34 * 34) {
        if (pk.kind === 'health') {
          state.health = Math.min(PLAYER.health, state.health + pk.amount);
          showMessage(`Health +${pk.amount}`, 2);
        } else if (pk.kind === 'ammo') {
          p.ammo = PLAYER.magazine;
          p.reload = 0;
          showMessage('Ammo restocked', 2);
        } else if (pk.kind === 'cash') {
          state.money += pk.amount;
          showMessage(`+$${pk.amount}`, 2);
        }
        pk.amount = 0;
        audio.pickup();
        events.value |= EVENT_PICKUP;
      }
    }
    state.pickups = state.pickups.filter((pk) => pk.amount > 0);
  }

  function updatePlaces(dt, events) {
    const p = state.player;
    // The garage repaints: wanted gone for a fee, and it is where jobs start.
    const g = city.landmarks.garage;
    const inGarage = Math.abs(p.x - g.x) < g.w / 2 && Math.abs(p.y - g.y) < g.h / 2;
    if (inGarage && state.wanted.stars > 0 && state.money >= ECONOMY.garageRepaint) {
      state.money -= ECONOMY.garageRepaint;
      state.wanted.stars = 0;
      state.wanted.decay = 0;
      showMessage(`Repainted at ${STORY.garage} — $${ECONOMY.garageRepaint}. Heat gone.`, 3);
      audio.pickup();
    }
    // The hospital heals.
    const h = city.landmarks.hospital;
    const inHospital = Math.abs(p.x - h.x) < h.w / 2 && Math.abs(p.y - h.y) < h.h / 2;
    if (inHospital && state.health < PLAYER.health && state.money >= 20) {
      state.health = Math.min(PLAYER.health, state.health + 60 * dt);
      if (Math.floor(state.time * 2) !== Math.floor((state.time - dt) * 2)) {
        state.money = Math.max(0, state.money - 5);
      }
    }
  }

  function updateWanted(dt) {
    const w = state.wanted;
    if (w.stars === 0) return;
    if (nearestCopDistance() > 520) {
      w.decay += dt;
      if (w.decay >= WANTED.decaySeconds) {
        w.stars -= 1;
        w.decay = 0;
        showMessage(w.stars === 0 ? 'You lost them. Heat gone.' : `Wanted level ${w.stars}`, 2.5);
      }
    } else {
      w.decay = 0;
    }
  }

  function updateParticles(dt) {
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.98;
      pt.vy *= 0.98;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);
  }

  function updateCamera(dt) {
    const p = state.player;
    const lookAhead = p.onFoot ? 0 : 0.18;
    const tx = p.x + (p.car ? Math.cos(p.angle) * p.car.speed * lookAhead : 0);
    const ty = p.y + (p.car ? Math.sin(p.angle) * p.car.speed * lookAhead : 0);
    const k = Math.min(1, 4 * dt);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
  }

  /**
   * One fixed step. `input` carries the frame's keys, mouse and one-shot actions, plus
   * aimWorld() which turns the mouse position into world coordinates. Returns event flags.
   */
  function step(dt, input) {
    const events = { value: 0 };
    state.time += dt;
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = null;
    }
    if (state.bannerTimer > 0) {
      state.bannerTimer -= dt;
      if (state.bannerTimer <= 0) state.banner = null;
    }

    // Starting a job: stand on the garage marker and press E (mission offers live there).
    // On foot only — a driver pressing E near the garage is getting out of the car,
    // not signing up for a job.
    if (!missions.state.active && missions.state.index < MISSIONS.length && state.player.onFoot) {
      const g = city.landmarks.garage;
      const p = state.player;
      const near = Math.abs(p.x - g.x) < 90 && Math.abs(p.y - g.y) < 90;
      if (near && input.actions() & 4) {
        missions.start(missions.state.index);
        state.stolenMissionCar = false;
      }
    }

    if (state.player.onFoot) updatePlayerOnFoot(dt, input, events);
    else updatePlayerCar(dt, input, events);

    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt, events);
    updateBullets(dt, events);
    updatePickups(dt, events);
    updatePlaces(dt, events);
    updateWanted(dt);
    updateParticles(dt);

    const mEvents = missions.update(dt, {
      player: state.player,
      wanted: state.wanted,
      stolenMissionCar: state.stolenMissionCar,
    });
    if (mEvents & MISSION_STEP) events.value |= EVENT_MISSION_STEP;
    if (mEvents & MISSION_DONE) {
      events.value |= EVENT_MISSION_DONE;
      state.stolenMissionCar = false;
    }
    if (mEvents & MISSION_FAIL) {
      events.value |= EVENT_MISSION_FAIL;
      state.stolenMissionCar = false;
    }

    // Busted or wasted: the screen changes, the player respawns and pays.
    if (events.value & EVENT_BUSTED) {
      state.stats.busted += 1;
      const fine = Math.min(state.money, ECONOMY.bustFine);
      state.money -= fine;
      state.wanted.stars = 0;
      state.health = PLAYER.health;
      const st = city.landmarks.police;
      state.player.x = st.x;
      state.player.y = st.y + st.h / 2 + 50;
      state.player.onFoot = true;
      state.player.car = null;
      state.camera.x = state.player.x;
      state.camera.y = state.player.y;
      showBanner('Busted', `The ${STORY.police} took $${fine}. You walk out of the station.`);
      audio.busted();
      saveGame();
    }
    if (events.value & EVENT_WASTED) {
      state.stats.wasted += 1;
      const bill = Math.min(state.money, ECONOMY.hospitalBill);
      state.money -= bill;
      state.wanted.stars = 0;
      state.health = PLAYER.health;
      const h = city.landmarks.hospital;
      state.player.x = h.x;
      state.player.y = h.y + h.h / 2 + 50;
      state.player.onFoot = true;
      state.player.car = null;
      state.camera.x = state.player.x;
      state.camera.y = state.player.y;
      showBanner('Wasted', `${STORY.hospital} patched you up — $${bill}.`);
      audio.busted();
      saveGame();
    }

    updateCamera(dt);
    // Siren and engine hum follow the world.
    const anyChase = state.cops.some((c) => c.alive && c.car && c.car.siren);
    audio.siren(anyChase, dt);
    if (state.player.car) {
      const car = state.player.car;
      audio.engine(Math.abs(car.speed) / car.def.topSpeed, true);
    } else {
      audio.engine(0, false);
    }
    return events.value;
  }

  reset(true);

  return {
    state, city, missions, reset, step, applySave, loadSave, saveGame,
    showMessage, showBanner, spawnCar, spawnPed, spawnCop,
  };
}
