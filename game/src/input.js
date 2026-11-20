// Keyboard and mouse input. Held keys give a drive/walk vector; one-shot presses (confirm,
// pause, interact, reload, mute) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse aims and shoots.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_RELOAD = 8;
export const ACTION_MUTE = 16;
export const ACTION_MISSION = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const RELOAD = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function press(event) {
    const code = event.code;
    if (UP.has(code)) keys.up = true;
    else if (DOWN.has(code)) keys.down = true;
    else if (LEFT.has(code)) keys.left = true;
    else if (RIGHT.has(code)) keys.right = true;
    else if (RUN.has(code)) keys.run = true;
    else if (CONFIRM.has(code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (INTERACT.has(code)) { if (!event.repeat) actions |= ACTION_INTERACT; }
    else if (RELOAD.has(code)) { if (!event.repeat) actions |= ACTION_RELOAD; }
    else if (MUTE.has(code)) { if (!event.repeat) actions |= ACTION_MUTE; }
    else return;
    event.preventDefault();
  }

  function release(event) {
    const code = event.code;
    if (UP.has(code)) keys.up = false;
    else if (DOWN.has(code)) keys.down = false;
    else if (LEFT.has(code)) keys.left = false;
    else if (RIGHT.has(code)) keys.right = false;
    else if (RUN.has(code)) keys.run = false;
  }

  window.addEventListener('keydown', press);
  window.addEventListener('keyup', release);
  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = keys.run = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (event.button === 0) mouseDown = true;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Drive/walk vector, each axis -1, 0 or 1. */
    vector() {
      return { x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0) };
    },
    runHeld() {
      return keys.run;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Queue a confirm from code (used by the title screen's click). */
    confirm() {
      actions |= ACTION_CONFIRM;
    },
  };
}
