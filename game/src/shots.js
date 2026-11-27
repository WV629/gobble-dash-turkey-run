// The screenshot scenes behind ?shot=start|farm|kitchen|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot (jump
// ground hazards, duck under branches and swinging knives, dash away from falling knives), so
// the frame is what a real game looks like and the same seed always gives the same frame.
import { FIELD, PLAYER, STEP } from './config.js';
import {
  EVENT_OVER,
  KIND_BRANCH,
  KIND_FLAME,
  KIND_KNIFE_FALL,
  KIND_KNIFE_SWING,
  KIND_PUMPKIN,
} from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const FARM_SECONDS = 20;
const KITCHEN_SECONDS = 8;
const END_LIMIT_SECONDS = 600;

/** How far ahead, in pixels, the autopilot ducks for a branch or a swinging knife. */
const REACT_DUCK = 150;

/**
 * How close a ground hazard may be before the turkey must jump: the jump's arc only keeps
 * the turkey's feet above the hazard's top for a window, and the hazard has to clear the
 * turkey's whole body (46 px of hitbox) inside that window — so a wide hay bale is jumped
 * later than a narrow fence. From the jump arc (vy0, gravity): the feet are above the
 * hazard's top between the roots of (g/2)t^2 + vy0*t + height = 0; the jump fires when the
 * hazard's trailing edge clears the turkey before the window's end, less a margin.
 */
function jumpDistance(state, obstacle) {
  const vy0 = -PLAYER.jumpVelocity;
  const disc = vy0 * vy0 - 2 * PLAYER.gravity * obstacle.height;
  if (disc <= 0) return 60;
  const t2 = (vy0 + Math.sqrt(disc)) / PLAYER.gravity;
  return Math.max(50, state.speed * (t2 - 0.06) - obstacle.width - 46);
}

export function autopilot(state) {
  const player = state.player;
  const input = { jump: false, dash: false, duck: false };
  // Fresh from a stumble the turkey is invulnerable: obstacles pass through it, so save
  // the jumps for when they matter again instead of landing on the next hazard.
  if (player.invulnerable > 0.3) return input;
  const centre = player.x + player.width / 2;
  let nearestGround = null;
  let nearestGroundDist = Infinity;
  let secondGroundDist = Infinity;
  let branchBlocking = false; // a branch hangs over the jump arc: jumping now means hitting it

  for (const o of state.obstacles) {
    if (!o.active) continue;
    if (o.kind === KIND_KNIFE_FALL) {
      // A knife aimed at the turkey: dash away from its landing spot while it falls.
      // Once stuck in the ground it is just a low obstacle to jump over (handled below).
      if (o.state === 0) {
        const landX = o.x + o.width / 2;
        const timeToLand = (FIELD.groundY - o.y) / Math.max(1, o.vy);
        if (Math.abs(landX - centre) < 46 && timeToLand < 0.5 && player.dashCooldown <= 0) {
          input.dash = true;
        }
        continue;
      }
      // Stuck knife: treat as a ground obstacle (only while it is still ahead of the turkey).
      const dist = o.x - (player.x + player.width);
      if (dist >= 0 && dist < nearestGroundDist) {
        secondGroundDist = nearestGroundDist;
        nearestGround = o;
        nearestGroundDist = dist;
      } else if (dist >= 0 && dist < secondGroundDist) {
        secondGroundDist = dist;
      }
      continue;
    }
    if (o.kind === KIND_KNIFE_SWING) {
      const bladeX = o.x + Math.sin(o.phase) * 150;
      if (Math.abs(bladeX - centre) < 130 && player.onGround) input.duck = true;
      // A blade sweeping near the jump arc: jumping now means rising into it.
      if (o.x - 160 < player.x + 340 && o.x + 160 > player.x - 20) branchBlocking = true;
      continue;
    }
    if (o.kind === KIND_BRANCH) {
      if (o.x + o.width > player.x - 10 && o.x < player.x + player.width + REACT_DUCK && player.onGround) {
        input.duck = true;
      }
      if (o.x < player.x + 340 && o.x + o.width > player.x - 20) branchBlocking = true;
      continue;
    }
    if (o.kind === KIND_FLAME && o.state === 0) continue; // telegraph glow: safe to run through
    // Only hazards still ahead of the turkey count: jumping for one already behind
    // wastes the jump and lands the turkey on the next hazard.
    const dist = o.x - (player.x + player.width);
    if (dist >= 0 && dist < nearestGroundDist) {
      secondGroundDist = nearestGroundDist;
      nearestGround = o;
      nearestGroundDist = dist;
    } else if (dist >= 0 && dist < secondGroundDist) {
      secondGroundDist = dist;
    }
  }

  if (nearestGround !== null && nearestGroundDist < jumpDistance(state, nearestGround)) {
    if (nearestGround.kind === KIND_PUMPKIN && nearestGroundDist < 220 && player.dashCooldown <= 0) {
      // A rolling pumpkin is best smashed: dash straight through it.
      input.dash = true;
    } else if (nearestGroundDist < 60 && player.onGround) {
      // Emergency: the hazard is on top of the turkey — jump now, whatever hangs above.
      input.jump = true;
    } else if (branchBlocking && player.onGround) {
      // Wait under the branch: duck until it passes, then jump. If the fence is already
      // on top of the turkey, dash through it instead.
      if (nearestGroundDist < 130 && player.dashCooldown <= 0) input.dash = true;
      else input.duck = true;
    } else if (player.onGround) {
      input.jump = true;
    } else if (player.jumps === 1 && player.vy > -120 && player.vy < 120 && nearestGroundDist < 280) {
      // Second jump at the apex, only when one jump cannot clear what is ahead: a tall
      // hazard, a wide one (the arc cannot outlast its whole width), a burning flame, or a
      // second hazard stacked right behind the first. A needless double jump only stretches
      // the arc and lands the turkey on the hazard.
      const needsDouble = nearestGround.height > 80 || nearestGround.width > 60
        || nearestGround.kind === KIND_FLAME
        || secondGroundDist - nearestGroundDist < 200;
      if (branchBlocking && player.dashCooldown <= 0) input.dash = true;
      else if (needsDouble && !branchBlocking) input.jump = true;
    }
  }
  return input;
}

function runAutopilot(world, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = autopilot(world.state);
    const events = world.step(STEP, { jump: input.jump, dash: input.dash, duck: input.duck }, false);
    if (events & EVENT_OVER) break;
  }
}

/**
 * Set `world` to the named scene (start, farm, kitchen or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'farm' && name !== 'kitchen' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { jump: false, dash: false, duck: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, bestDistance: 0 };
  }
  if (name === 'kitchen') {
    // Drop the turkey straight into the kitchen at full speed, then play on from there.
    world.state.distance = 2050;
    world.state.zone = 2;
    world.state.speed = 520;
    world.state.spawnIn = 0;
    runAutopilot(world, KITCHEN_SECONDS);
    return { screen: SCREEN_PLAY, best: world.state.score, bestDistance: world.state.distance };
  }
  if (name === 'end') {
    // A hurried player who never jumps: the farmer catches up, three times, and it is over.
    const steps = Math.floor(END_LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      const events = world.step(STEP, { jump: false, dash: false, duck: false }, false);
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score, bestDistance: world.state.distance };
  }
  runAutopilot(world, FARM_SECONDS);
  const over = world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, bestDistance: world.state.distance };
}
