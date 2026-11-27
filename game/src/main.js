// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and game over.
//
// ?seed=N fixes the falling pattern. ?shot=start|farm|kitchen|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_DISTANCE_KEY, BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_CAUGHT, EVENT_CORN, EVENT_DASH_SMASH, EVENT_ESCAPED, EVENT_GOLDEN, EVENT_HIT, EVENT_OVER, EVENT_POWERUP, EVENT_ZONE } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_JUMP, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.bestDistance, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest(BEST_KEY);
  let bestDistance = readBest(BEST_DISTANCE_KEY);
  let accumulator = 0;
  let last = performance.now();
  // One-shot presses stashed by handleActions for the next simulation step: handleActions
  // runs once per frame while step() can run several times, so the presses must wait here.
  let pendingJump = false;
  let pendingDash = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    announce(`Playing. ${LIVES} lives. Outrun the farmer!`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.stopMusic();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(BEST_KEY, best);
    }
    if (world.state.distance > bestDistance) {
      bestDistance = world.state.distance;
      saveBest(BEST_DISTANCE_KEY, Math.floor(bestDistance));
    }
    if (world.state.over === 'escaped') {
      audio.escaped();
      announce(`Escaped! Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.caught();
      announce(`Caught. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleEvents(events) {
    if (events & EVENT_CORN) audio.pickup(world.state.combo);
    if (events & EVENT_GOLDEN) audio.golden();
    if (events & EVENT_POWERUP) audio.powerup();
    if (events & EVENT_HIT) {
      audio.hit();
      audio.gobble();
    }
    if (events & EVENT_ZONE) audio.zone();
    if (events & EVENT_CAUGHT) audio.farmerClose();
    if (events & EVENT_DASH_SMASH) audio.dash();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_JUMP)) {
        audio.click();
        startGame();
      }
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopMusic();
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      audio.startMusic();
      announce('Playing.');
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_JUMP) pendingJump = true;
      if (actions & ACTION_DASH) pendingDash = true;
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { jump: false, dash: false, duck: false }, true);
      return;
    }
    const actions = { jump: pendingJump, dash: pendingDash };
    pendingJump = false;
    pendingDash = false;
    const jumpPressed = actions.jump;
    const wasAirborne = !world.state.player.onGround;
    if (jumpPressed) {
      if (wasAirborne) audio.doubleJump();
      else audio.jump();
    }
    if (actions.dash) audio.dash();
    const events = world.step(STEP, {
      jump: jumpPressed,
      dash: actions.dash,
      duck: input.ducking(),
    }, false);
    handleEvents(events);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_HIT) announce(world.state.lives === 1 ? 'Hit. 1 life left.' : `Hit. ${world.state.lives} lives left.`);
    else if (events & EVENT_CAUGHT) announce('The farmer caught you!');
    else if (events & EVENT_ESCAPED) announce('Escaped!');
    else if (events & EVENT_ZONE) announce('New zone!');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, bestDistance, audio.isMuted());
  }

  // Leaving the tab pauses a running game rather than letting the farmer catch up unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopMusic();
      announce('Paused.');
    }
  });

  announce('Gobble Dash. Press Space or click to run.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
