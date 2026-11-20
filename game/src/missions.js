// The story: six missions from Lena Marin and Marco Voss. Each mission is a list of steps; a
// step is a small goal (go somewhere, take a marked car, pick someone up, lose the cops, take a
// target out) checked against the world every frame. The module owns no entities: it asks the
// world to spawn things through the api it is given, and reports progress as events.

import { ECONOMY, STORY } from './config.js';

export const MISSION_STEP = 1;
export const MISSION_DONE = 2;
export const MISSION_FAIL = 4;

/** Where each mission's places sit, in city coordinates. Filled in by start() from landmarks. */
function placeOf(city, name) {
  const mark = city.landmarks[name];
  return { x: mark.x, y: mark.y };
}

export const MISSIONS = [
  {
    id: 0, title: 'First Wheels', giver: STORY.contact,
    brief: 'A customer left a sedan at the garage and never came back. Take it for a spin around the block and bring it home — and try not to scratch the paint.',
    reward: ECONOMY.missionReward[0],
    steps: [
      { type: 'goto', where: 'garage', radius: 130, text: 'Go to the garage' },
      { type: 'steal', text: 'Take the marked sedan' },
      { type: 'goto', where: 'garage', radius: 130, text: 'Bring the sedan back to the garage' },
    ],
  },
  {
    id: 1, title: 'The Package', giver: STORY.contact,
    brief: 'A parcel for a friend at the marina. The harbour master does not ask questions, and neither should you. One hundred seconds, no detours.',
    reward: ECONOMY.missionReward[1],
    steps: [
      { type: 'goto', where: 'garage', radius: 130, text: 'Pick up the package at the garage' },
      { type: 'deliver', where: 'marina', radius: 140, time: 100, text: 'Deliver the package to the marina' },
    ],
  },
  {
    id: 2, title: 'Lose the Tail', giver: STORY.contact,
    brief: 'That parcel had a tail on it. The cops are two stars deep on you now. Shake them — thirty seconds out of sight — then get the car repainted at the garage.',
    reward: ECONOMY.missionReward[2],
    steps: [
      { type: 'escape', seconds: 30, text: 'Stay out of sight for 30 seconds' },
      { type: 'goto', where: 'garage', radius: 130, text: 'Get the car repainted at the garage' },
    ],
  },
  {
    id: 3, title: 'Bayfront Hit', giver: STORY.shark,
    brief: 'An informant is drinking at the marina and talking too much. Make it quiet. Voss pays well for quiet.',
    reward: ECONOMY.missionReward[3],
    steps: [
      { type: 'goto', where: 'marina', radius: 150, text: 'Go to the marina' },
      { type: 'eliminate', text: 'Take out the informant' },
      { type: 'goto', where: 'garage', radius: 130, text: 'Get back to the garage and lay low' },
    ],
  },
  {
    id: 4, title: 'The Getaway', giver: STORY.contact,
    brief: 'Lena is waiting in the park and the cops want her more than you. Pick her up, keep her safe, and get her to the hideout up north before the heat closes in.',
    reward: ECONOMY.missionReward[4],
    steps: [
      { type: 'pickup', where: 'park', text: 'Pick up Lena at the park' },
      { type: 'deliver', where: 'hideout', radius: 140, time: 150, text: 'Drive Lena to the hideout' },
    ],
  },
  {
    id: 5, title: 'Paying Voss', giver: STORY.shark,
    brief: 'The debt comes due at the marina tower. Voss sent three of his boys to watch the handover — convince them the money is real, then hand it over.',
    reward: ECONOMY.missionReward[5],
    steps: [
      { type: 'goto', where: 'garage', radius: 130, text: 'Collect the payoff at the garage' },
      { type: 'goto', where: 'marina', radius: 150, text: 'Take the payoff to the marina tower' },
      { type: 'eliminate', count: 3, text: 'Deal with Voss’s watchers' },
      { type: 'goto', where: 'marina', radius: 120, text: 'Hand the money to Voss' },
    ],
  },
];

export function createMissions(api) {
  const state = {
    index: 0, // next mission to offer
    active: null, // { mission, step, timer, elapsed, targetCar, targetPed, kills }
    completed: 0,
  };

  function objectiveText() {
    if (!state.active) return state.index < MISSIONS.length ? 'Go to the garage (yellow L) to start the next job' : 'Story complete — Solmar Bay is yours. Free roam.';
    const step = state.active.mission.steps[state.active.step];
    return step.text;
  }

  function marker() {
    if (!state.active) {
      if (state.index >= MISSIONS.length) return null;
      const g = api.cityLandmark('garage');
      return { x: g.x, y: g.y, label: 'L', color: '#f2c94c' };
    }
    const step = state.active.mission.steps[state.active.step];
    if (step.where) {
      const at = step.where === 'park' ? api.parkSpot() : step.where === 'hideout' ? api.hideoutSpot() : placeOf(api.city(), step.where);
      return { x: at.x, y: at.y, label: '!', color: '#f2c94c' };
    }
    if (state.active.targetCar) return { x: state.active.targetCar.x, y: state.active.targetCar.y, label: '!', color: '#f2c94c' };
    if (state.active.targetPed) return { x: state.active.targetPed.x, y: state.active.targetPed.y, label: '!', color: '#e84f4f' };
    return null;
  }

  function start(index) {
    const mission = MISSIONS[index];
    const active = { mission, step: 0, timer: 0, elapsed: 0, targetCar: null, targetPed: null, kills: 0 };
    state.active = active;
    api.onMissionStart(mission);
    enterStep();
    return active;
  }

  function enterStep() {
    const step = state.active.mission.steps[state.active.step];
    state.active.timer = step.time || 0;
    state.active.elapsed = 0;
    if (step.type === 'steal') {
      const g = api.cityLandmark('garage');
      state.active.targetCar = api.spawnMissionCar('sedan', g.x + 60, g.y + 40);
    } else if (step.type === 'eliminate') {
      const at = step.where ? placeOf(api.city(), step.where) : api.cityLandmark('marina');
      const count = step.count || 1;
      for (let i = 0; i < count; i += 1) {
        const ped = api.spawnTargetPed(at.x + (i - count / 2) * 40, at.y + 30, step.count ? 'shooter' : 'target');
        if (i === 0) state.active.targetPed = ped;
      }
    } else if (step.type === 'escape') {
      api.setWanted(2);
    } else if (step.type === 'pickup') {
      const at = api.parkSpot();
      state.active.targetPed = api.spawnTargetPed(at.x, at.y, 'friend');
    }
  }

  function advance() {
    state.active.step += 1;
    if (state.active.step >= state.active.mission.steps.length) {
      const mission = state.active.mission;
      state.active = null;
      state.index += 1;
      state.completed += 1;
      api.onMissionDone(mission);
      return MISSION_DONE;
    }
    enterStep();
    return MISSION_STEP;
  }

  function fail() {
    const mission = state.active ? state.active.mission : null;
    state.active = null;
    api.onMissionFail(mission);
    return MISSION_FAIL;
  }

  /**
   * One step. `world` carries the live facts the steps read: player position and vehicle, the
   * heat, and whether the player just did something (stole a car, killed a target).
   */
  function update(dt, world) {
    if (!state.active) return 0;
    const step = state.active.mission.steps[state.active.step];
    state.active.elapsed += dt;
    let events = 0;

    if (step.time) {
      state.active.timer -= dt;
      if (state.active.timer <= 0) return fail();
    }

    if (step.type === 'goto' || step.type === 'deliver') {
      const at = step.where === 'park' ? api.parkSpot() : step.where === 'hideout' ? api.hideoutSpot() : placeOf(api.city(), step.where);
      const dx = world.player.x - at.x;
      const dy = world.player.y - at.y;
      if (dx * dx + dy * dy < step.radius * step.radius) events |= advance();
    } else if (step.type === 'steal') {
      if (world.stolenMissionCar) events |= advance();
    } else if (step.type === 'escape') {
      if (world.wanted.stars === 0) {
        state.active.elapsed += dt;
        if (state.active.elapsed >= step.seconds) events |= advance();
      } else {
        state.active.elapsed = 0;
      }
    } else if (step.type === 'pickup') {
      const ped = state.active.targetPed;
      if (ped && !ped.alive) return fail();
      if (ped) {
        const dx = world.player.x - ped.x;
        const dy = world.player.y - ped.y;
        if (dx * dx + dy * dy < 50 * 50) {
          ped.alive = false;
          ped.pickedUp = true;
          events |= advance();
        }
      }
    } else if (step.type === 'eliminate') {
      const need = step.count || 1;
      if (state.active.kills >= need) events |= advance();
    }
    return events;
  }

  /** The world calls this when a mission target ped goes down. */
  function onTargetDown(ped) {
    if (!state.active) return;
    const step = state.active.mission.steps[state.active.step];
    if (step.type === 'eliminate') state.active.kills += 1;
  }

  return { state, MISSIONS, start, update, fail, objectiveText, marker, onTargetDown };
}
