// The game's rules and state, with no drawing and no browser in it: the turkey runs on its own
// while the world scrolls past; the farmer chases from behind and gains ground whenever the
// turkey stumbles; fences, hay bales, branches, falling and swinging carving knives, rolling
// pumpkins and oven flames block the way; corn feeds the score and pushes the farmer back.
// step() advances one fixed step and returns what happened as bit flags, so the caller can
// react without the world knowing about screens or sound. Nothing here allocates after
// createWorld returns.
import { ESCAPE_DISTANCE, FARMER, FIELD, LIVES, PLAYER, SCORE, SCROLL, SPAWN, ZONES } from './config.js';

export const KIND_FENCE = 0;
export const KIND_HAY = 1;
export const KIND_BRANCH = 2;
export const KIND_KNIFE_FALL = 3;
export const KIND_KNIFE_SWING = 4;
export const KIND_PUMPKIN = 5;
export const KIND_FLAME = 6;

export const PICK_CORN = 0;
export const PICK_GOLDEN = 1;
export const PICK_SHIELD = 2;
export const PICK_MAGNET = 3;
export const PICK_BOOST = 4;
export const PICK_HEART = 5;

export const EVENT_HIT = 1;
export const EVENT_CORN = 2;
export const EVENT_GOLDEN = 4;
export const EVENT_POWERUP = 8;
export const EVENT_OVER = 16;
export const EVENT_ZONE = 32;
export const EVENT_CAUGHT = 64;
export const EVENT_ESCAPED = 128;
export const EVENT_DASH_SMASH = 256;

const OBSTACLE_POOL = 48;
const PICKUP_POOL = 40;
const PARTICLE_POOL = 90;

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function createWorld(random) {
  const player = {
    x: PLAYER.x,
    y: FIELD.groundY - PLAYER.height,
    width: PLAYER.width,
    height: PLAYER.height,
    vy: 0,
    onGround: true,
    jumps: 0,
    dashTime: 0,
    dashCooldown: 0,
    stumble: 0,
    invulnerable: 0,
    shield: false,
    magnet: 0,
    boost: 0,
    runCycle: 0,
    ducking: false,
  };
  const obstacles = [];
  for (let i = 0; i < OBSTACLE_POOL; i += 1) {
    obstacles.push({ active: false, kind: KIND_FENCE, x: 0, y: 0, width: 0, height: 0, vy: 0, phase: 0, period: 1, timer: 0, state: 0 });
  }
  const pickups = [];
  for (let i = 0; i < PICKUP_POOL; i += 1) {
    pickups.push({ active: false, kind: PICK_CORN, x: 0, y: 0, size: 22, bob: 0, value: 0 });
  }
  const particles = [];
  for (let i = 0; i < PARTICLE_POOL; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#ffffff', size: 4 });
  }

  const state = {
    player,
    obstacles,
    pickups,
    particles,
    farmerGap: FARMER.startGap,
    distance: 0,
    score: 0,
    combo: 0,
    comboTimer: 0,
    lives: LIVES,
    zone: 0,
    speed: SCROLL.baseSpeed,
    scrollX: 0,
    time: 0,
    over: null,
    escaped: false,
    nextSpawnX: FIELD.width + 200,
    spawnIn: 0,
  };
  let scoreFrac = 0;

  function reset() {
    player.y = FIELD.groundY - PLAYER.height;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
    player.dashTime = 0;
    player.dashCooldown = 0;
    player.stumble = 0;
    player.invulnerable = 0;
    player.shield = false;
    player.magnet = 0;
    player.boost = 0;
    player.runCycle = 0;
    player.ducking = false;
    for (const o of obstacles) o.active = false;
    for (const p of pickups) p.active = false;
    for (const p of particles) p.active = false;
    state.farmerGap = FARMER.startGap;
    state.distance = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.lives = LIVES;
    state.zone = 0;
    state.speed = SCROLL.baseSpeed;
    state.scrollX = 0;
    state.time = 0;
    state.over = null;
    state.escaped = false;
    state.nextSpawnX = FIELD.width + 200;
    state.spawnIn = 0;
    scoreFrac = 0;
  }

  function freeObstacle() {
    for (let i = 0; i < obstacles.length; i += 1) if (!obstacles[i].active) return obstacles[i];
    return null;
  }
  function freePickup() {
    for (let i = 0; i < pickups.length; i += 1) if (!pickups[i].active) return pickups[i];
    return null;
  }
  function burst(x, y, color, count, speed) {
    let made = 0;
    for (let i = 0; i < particles.length && made < count; i += 1) {
      const p = particles[i];
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v - speed * 0.4;
      p.maxLife = 0.5 + random() * 0.5;
      p.life = p.maxLife;
      p.color = color;
      p.size = 3 + random() * 4;
      made += 1;
    }
  }

  function spawnObstacle(kind, x) {
    const o = freeObstacle();
    if (o === null) return;
    o.active = true;
    o.kind = kind;
    o.x = x;
    o.phase = random() * Math.PI * 2;
    o.period = 1.6 + random() * 0.9;
    o.timer = 0;
    o.state = 0;
    o.vy = 0;
    if (kind === KIND_FENCE) {
      o.width = 26 + random() * 16;
      o.height = 62 + random() * 26;
      o.y = FIELD.groundY - o.height;
    } else if (kind === KIND_HAY) {
      o.width = 66 + random() * 22;
      o.height = 54;
      o.y = FIELD.groundY - o.height;
    } else if (kind === KIND_BRANCH) {
      o.width = 58 + random() * 26;
      o.height = 30;
      o.y = FIELD.groundY - 78; // hangs at head height: duck under it, or jump through is risky
    } else if (kind === KIND_KNIFE_FALL) {
      o.width = 20;
      o.height = 64;
      o.x = player.x - 20 + random() * 40; // aimed at the turkey: dash or jump away
      o.y = -o.height;
      o.vy = 520 + random() * 260 + state.distance * 0.05;
    } else if (kind === KIND_KNIFE_SWING) {
      o.width = 26;
      o.height = 28;
      o.y = FIELD.groundY - 62; // blade swings at neck height: duck under it
    } else if (kind === KIND_PUMPKIN) {
      o.width = 44;
      o.height = 44;
      o.y = FIELD.groundY - o.height;
      o.vy = 120 + random() * 60; // rolls toward the turkey on top of the scroll
    } else if (kind === KIND_FLAME) {
      o.width = 74;
      o.height = 150;
      o.y = FIELD.groundY - o.height;
      o.timer = -0.5; // a short telegraph glow right after it appears, then it burns for good
    }
  }

  function spawnPickup(kind, x, y) {
    const p = freePickup();
    if (p === null) return;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.bob = random() * Math.PI * 2;
    p.size = kind === PICK_GOLDEN ? 30 : 24;
    p.value = kind === PICK_GOLDEN ? SCORE.goldenCorn : SCORE.corn;
  }

  function spawnCornLine(x) {
    const n = 3 + Math.floor(random() * 2);
    const arc = random() < 0.5;
    for (let i = 0; i < n; i += 1) {
      const y = arc
        ? FIELD.groundY - 46 - Math.sin((i / (n - 1)) * Math.PI) * 110
        : FIELD.groundY - 46 - random() * 60;
      spawnPickup(random() < SPAWN.goldenChance ? PICK_GOLDEN : PICK_CORN, x + i * 44, y);
    }
  }

  function spawnPowerup(x) {
    const roll = random();
    const kind = roll < 0.3 ? PICK_SHIELD : roll < 0.6 ? PICK_MAGNET : roll < 0.9 ? PICK_BOOST : PICK_HEART;
    spawnPickup(kind, x, FIELD.groundY - 120 - random() * 120);
  }

  /** Pick one obstacle group for the current zone and difficulty, at world x `x`. */
  function spawnGroup(x) {
    const zone = state.zone;
    const d = state.distance;
    const roll = random();
    if (zone === 0) {
      if (roll < 0.3) spawnObstacle(KIND_FENCE, x);
      else if (roll < 0.5) spawnObstacle(KIND_HAY, x);
      else if (roll < 0.65) { spawnObstacle(KIND_FENCE, x); spawnObstacle(KIND_FENCE, x + 110); }
      else if (roll < 0.8) spawnObstacle(KIND_KNIFE_FALL, x);
      else if (roll < 0.9) spawnObstacle(KIND_PUMPKIN, x);
      else spawnObstacle(KIND_BRANCH, x);
    } else if (zone === 1) {
      if (roll < 0.22) spawnObstacle(KIND_FENCE, x);
      else if (roll < 0.38) { spawnObstacle(KIND_HAY, x); spawnObstacle(KIND_FENCE, x + 200); }
      else if (roll < 0.55) spawnObstacle(KIND_KNIFE_SWING, x);
      else if (roll < 0.7) spawnObstacle(KIND_KNIFE_FALL, x);
      else if (roll < 0.82) spawnObstacle(KIND_BRANCH, x);
      else if (roll < 0.92) spawnObstacle(KIND_PUMPKIN, x);
      else { spawnObstacle(KIND_FENCE, x); spawnObstacle(KIND_KNIFE_FALL, x + 200); }
    } else {
      if (roll < 0.25) spawnObstacle(KIND_FLAME, x);
      else if (roll < 0.42) spawnObstacle(KIND_KNIFE_SWING, x);
      else if (roll < 0.58) { spawnObstacle(KIND_FLAME, x); spawnObstacle(KIND_FENCE, x + 220); }
      else if (roll < 0.72) spawnObstacle(KIND_KNIFE_FALL, x);
      else if (roll < 0.84) spawnObstacle(KIND_PUMPKIN, x);
      else if (roll < 0.94) spawnObstacle(KIND_BRANCH, x);
      else { spawnObstacle(KIND_FLAME, x); spawnObstacle(KIND_KNIFE_SWING, x + 240); }
    }
    if (random() < SPAWN.cornChance) spawnCornLine(x + 40 + random() * 120);
    if (random() < SPAWN.powerupChance) spawnPowerup(x + 220 + random() * 160);
    void d;
  }

  function playerBox() {
    const height = player.ducking ? 34 : PLAYER.height;
    return {
      x: player.x + 8,
      y: player.y + (PLAYER.height - height),
      width: PLAYER.width - 16,
      height,
    };
  }

  function stumble(events) {
    player.stumble = PLAYER.stumbleTime;
    player.invulnerable = PLAYER.invulnerable;
    state.farmerGap = Math.max(FARMER.catchGap + 4, state.farmerGap - FARMER.closeOnHit);
    state.combo = 0;
    state.comboTimer = 0;
    burst(player.x + 30, player.y + 20, '#e8a33c', 14, 260);
    return events | EVENT_HIT;
  }

  function caught(events) {
    state.lives -= 1;
    state.farmerGap = FARMER.fallBackOnCaught;
    player.invulnerable = PLAYER.invulnerable;
    player.stumble = PLAYER.stumbleTime;
    state.combo = 0;
    state.comboTimer = 0;
    burst(player.x + 30, player.y + 20, '#ff5a4e', 18, 300);
    events |= EVENT_CAUGHT;
    if (state.lives <= 0) {
      state.over = 'caught';
      events |= EVENT_OVER;
    }
    return events;
  }

  function step(dt, input, attract) {
    let events = 0;
    if (state.over !== null) return events;
    state.time += dt;

    const boostMul = player.boost > 0 ? 1.35 : 1;
    let speed = Math.min(SCROLL.maxSpeed, SCROLL.baseSpeed + state.distance * SCROLL.speedPerMetre) * boostMul;
    if (player.stumble > 0) speed *= 0.35;
    state.speed = speed;

    // --- player vertical physics ---
    if (input.jump) {
      if (player.onGround) {
        player.vy = PLAYER.jumpVelocity;
        player.onGround = false;
        player.jumps = 1;
        events |= 0; // sound is driven by the caller through the jump flag it passed
      } else if (player.jumps < 2 && player.dashTime <= 0) {
        player.vy = PLAYER.doubleJumpVelocity;
        player.jumps = 2;
      }
    }
    if (input.dash && player.dashCooldown <= 0 && player.dashTime <= 0) {
      player.dashTime = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
    }
    // Dashing is a short turbo burst: the turkey smashes through fences, hay bales and
    // pumpkins and phases through knives, branches and flames for its duration.
    if (player.dashTime > 0) player.dashTime -= dt;
    player.ducking = input.duck && player.onGround;
    player.vy += PLAYER.gravity * dt;
    player.y += player.vy * dt;
    if (player.y >= FIELD.groundY - PLAYER.height) {
      if (!player.onGround && player.vy > 500) burst(player.x + 30, FIELD.groundY, '#cbb98a', 6, 120);
      player.y = FIELD.groundY - PLAYER.height;
      player.vy = 0;
      player.onGround = true;
      player.jumps = 0;
    }
    if (player.dashTime > 0) player.dashTime -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.stumble > 0) player.stumble -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.magnet > 0) player.magnet -= dt;
    if (player.boost > 0) player.boost -= dt;
    player.runCycle += dt * (player.onGround ? speed / 34 : 0);

    // --- scrolling, distance, score ---
    const dx = speed * dt;
    state.scrollX += dx;
    const metres = dx * SCROLL.metresPerPixel;
    state.distance += metres;
    scoreFrac += metres * SCORE.perMetre;
    if (scoreFrac >= 1) {
      state.score += Math.floor(scoreFrac);
      scoreFrac -= Math.floor(scoreFrac);
    }
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // --- zones ---
    const zone = state.distance >= ZONES[2].from ? 2 : state.distance >= ZONES[1].from ? 1 : 0;
    if (zone !== state.zone) {
      state.zone = zone;
      state.score += SCORE.zoneBonus;
      events |= EVENT_ZONE;
    }
    if (state.distance >= ESCAPE_DISTANCE) {
      state.escaped = true;
      state.over = 'escaped';
      state.score += SCORE.escapeBonus;
      return events | EVENT_ESCAPED | EVENT_OVER;
    }

    // --- the farmer: creeps closer, gains on every stumble, falls back on corn ---
    if (!attract) {
      state.farmerGap -= FARMER.creep * dt;
      if (state.farmerGap <= FARMER.catchGap) {
        events = caught(events);
        if (state.over !== null) return events;
      }
    }

    // --- spawning ---
    if (!attract) {
      state.spawnIn -= dx;
      if (state.spawnIn <= 0) {
        const gap = Math.max(
          SPAWN.minGapFloor,
          SPAWN.minGap + random() * 260 - state.distance * SPAWN.gapShrinkPerMetre,
        );
        spawnGroup(FIELD.width + 80 + random() * 120);
        state.spawnIn = gap;
      }
    }

    // --- obstacles: move, animate, collide ---
    const box = playerBox();
    for (const o of obstacles) {
      if (!o.active) continue;
      o.x -= dx;
      if (o.kind === KIND_PUMPKIN) o.x -= o.vy * dt;
      if (o.kind === KIND_KNIFE_FALL) {
        o.y += o.vy * dt;
        if (o.y >= FIELD.groundY - o.height) {
          o.y = FIELD.groundY - o.height;
          o.state = 1; // stuck in the ground
          o.timer += dt;
          if (o.timer > 0.9) o.active = false;
        }
      }
      if (o.kind === KIND_KNIFE_SWING) o.phase += dt * (Math.PI * 2 / o.period);
      if (o.kind === KIND_FLAME) {
        o.timer += dt;
        // A short telegraph glow after it appears, then it burns for good: a flame that
        // flickers off and on again can re-ignite on top of the turkey with no warning.
        o.state = o.timer > 0 ? 1 : 0;
      }
      if (o.x + o.width < -80) { o.active = false; continue; }

      // The swinging knife's blade hangs from a rope at the top and sweeps side to side at
      // neck height: duck under it, or jump clean over it.
      let hitBox = o;
      if (o.kind === KIND_KNIFE_SWING) {
        const swing = Math.sin(o.phase) * 150;
        hitBox = { x: o.x + swing - 13, y: o.y, width: 26, height: o.height };
      } else if (o.kind === KIND_FLAME && o.state === 0) {
        continue; // telegraph glow does not burn yet
      }
      if (player.invulnerable > 0 || state.over !== null) continue;
      if (!overlaps(box, hitBox)) continue;
      if (player.dashTime > 0) {
        // Turbo burst: smash fences, hay bales and pumpkins; phase through the rest.
        if (o.kind === KIND_FENCE || o.kind === KIND_HAY || o.kind === KIND_PUMPKIN) {
          o.active = false;
          state.score += 5;
          burst(o.x + o.width / 2, o.y + o.height / 2, '#d8c9a8', 10, 220);
          events |= EVENT_DASH_SMASH;
        }
        continue;
      }
      if (o.kind === KIND_FLAME || o.kind === KIND_KNIFE_FALL || o.kind === KIND_KNIFE_SWING) {
        if (player.shield) {
          player.shield = false;
          o.active = false;
          burst(o.x + o.width / 2, o.y + 20, '#7fd4ff', 12, 240);
          events |= EVENT_POWERUP;
        } else {
          events = stumble(events);
        }
      } else if (player.shield) {
        player.shield = false;
        o.active = false;
        burst(o.x + o.width / 2, o.y + 20, '#7fd4ff', 12, 240);
        events |= EVENT_POWERUP;
      } else {
        events = stumble(events);
      }
    }

    // --- pickups: drift, magnet, collect ---
    for (const p of pickups) {
      if (!p.active) continue;
      p.x -= dx;
      p.bob += dt * 4;
      if (player.magnet > 0) {
        const px = player.x + 30;
        const py = player.y + 24;
        const ddx = px - p.x;
        const ddy = py - p.y;
        const dist = Math.hypot(ddx, ddy) || 1;
        if (dist < 320) {
          p.x += (ddx / dist) * 520 * dt;
          p.y += (ddy / dist) * 520 * dt;
        }
      }
      if (p.x < -60) { p.active = false; continue; }
      const size = p.size;
      const bobY = Math.sin(p.bob) * 5;
      if (overlaps(box, { x: p.x - size / 2, y: p.y - size / 2 + bobY, width: size, height: size })) {
        p.active = false;
        state.combo += 1;
        state.comboTimer = SCORE.comboWindow;
        const mult = 1 + Math.min(state.combo - 1, 8) * SCORE.comboStep;
        if (mult > SCORE.comboMax) { /* cap at x3 */ }
        const applied = Math.min(mult, SCORE.comboMax);
        if (p.kind === PICK_CORN || p.kind === PICK_GOLDEN) {
          state.score += Math.round(p.value * applied);
          state.farmerGap = Math.min(FARMER.startGap + 60, state.farmerGap + (p.kind === PICK_GOLDEN ? 30 : 9));
          burst(p.x, p.y, p.kind === PICK_GOLDEN ? '#ffd94d' : '#f2c94c', 8, 180);
          events |= p.kind === PICK_GOLDEN ? EVENT_GOLDEN : EVENT_CORN;
        } else {
          state.score += SCORE.powerup;
          if (p.kind === PICK_SHIELD) player.shield = true;
          else if (p.kind === PICK_MAGNET) player.magnet = 6;
          else if (p.kind === PICK_BOOST) player.boost = 5;
          else if (p.kind === PICK_HEART && state.lives < LIVES) state.lives += 1;
          burst(p.x, p.y, '#7fd4ff', 12, 200);
          events |= EVENT_POWERUP;
        }
      }
    }

    // --- particles ---
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;
    }
    return events;
  }

  return { state, reset, step };
}
