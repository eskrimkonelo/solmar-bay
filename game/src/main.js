// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between three screens: title, play and paused. Busted and wasted are banners inside the
// world itself: the player pays, respawns, and keeps driving.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|chase|mission|title (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = createCity(random);
const audio = createAudio();
const world = createWorld(random, city, audio);
const renderer = createRenderer(canvas, city);

// A handle for automated checks (and the finalist review): the live world, nothing else.
window.__solmar = world;

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = world.loadSave();
  let accumulator = 0;
  let last = performance.now();
  let continueKey = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat) continueKey = true;
  });
  canvas.addEventListener('pointerdown', () => input.confirm());

  function startGame(fresh) {
    audio.unlock();
    if (fresh) {
      world.reset(true);
      save = null;
    } else if (save) {
      world.reset(true);
      world.applySave(save);
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Drive with W A S D. Press E near a car to take it.');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (continueKey && save) {
        continueKey = false;
        startGame(false);
      } else if (actions & ACTION_CONFIRM) {
        startGame(true);
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      announce(screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      // One adapter per frame: the world reads the same actions all step long.
      // One-shot presses (E, R, ...) count once per frame, not once per step:
      // the mask is cleared after the first step, so a slow frame running two
      // steps cannot exit a car and re-enter it on the same press — while every
      // check inside that one step still sees the full mask.
      let stepActions = actions;
      const adapter = {
        vector: () => input.vector(),
        runHeld: () => input.runHeld(),
        mouse: () => input.mouse(),
        actions: () => stepActions,
        aimWorld: () => {
          const mouse = input.mouse();
          return renderer.screenToWorld(mouse.x, mouse.y, world.state.camera);
        },
      };
      while (accumulator >= STEP) {
        world.step(STEP, adapter);
        stepActions = 0;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, save);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
