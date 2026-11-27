// Keyboard and pointer input. One-shot presses (jump, dash, start, pause, mute) are queued as
// bit flags and taken once by the loop, so a press between two frames is never lost and never
// counted twice; held keys (duck) are read live.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_JUMP = 4;
export const ACTION_DASH = 8;
export const ACTION_MUTE = 16;

const JUMP = new Set(['Space', 'ArrowUp', 'KeyW']);
const DASH = new Set(['ShiftLeft', 'ShiftRight', 'KeyX']);
const DUCK = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let duck = false;
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (JUMP.has(event.code)) {
      if (!event.repeat) actions |= ACTION_JUMP;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (DUCK.has(event.code)) {
      duck = true;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (DUCK.has(event.code)) duck = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    duck = false;
  });
  // Mouse / touch: tap to jump, tap on a menu to confirm. The loop decides which applies.
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_JUMP | ACTION_CONFIRM;
  });

  return {
    /** True while the duck key is held. */
    ducking() {
      return duck;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
