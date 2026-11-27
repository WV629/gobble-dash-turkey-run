// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. All art
// is drawn with canvas shapes — no image files, no network. Text that holds a number is rebuilt
// only when the number changes, so a frame allocates nothing.
import { ESCAPE_DISTANCE, FIELD, FONT, LIVES, PALETTE, ZONES } from './config.js';
import {
  KIND_BRANCH,
  KIND_FENCE,
  KIND_FLAME,
  KIND_HAY,
  KIND_KNIFE_FALL,
  KIND_KNIFE_SWING,
  KIND_PUMPKIN,
  PICK_BOOST,
  PICK_CORN,
  PICK_GOLDEN,
  PICK_HEART,
  PICK_MAGNET,
  PICK_SHIELD,
} from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 660, top: 96, line: 36, bottom: 78 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const distanceLabel = cachedLabel('');
  const bestLabel = cachedLabel('BEST ');
  const comboLabel = cachedLabel('COMBO x');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.scale = scale;
    view.x = (width - FIELD.width * scale) / 2;
    view.y = (height - FIELD.height * scale) / 2;
  }

  function zonePalette(zone) {
    if (zone === 0) return { sky: PALETTE.skyFarm, ground: PALETTE.groundFarm, groundDark: PALETTE.groundFarmDark };
    if (zone === 1) return { sky: PALETTE.skyBarn, ground: PALETTE.groundBarn, groundDark: PALETTE.groundBarnDark };
    return { sky: PALETTE.skyKitchen, ground: PALETTE.groundKitchen, groundDark: PALETTE.groundKitchenDark };
  }

  function drawBackground(state) {
    const ctx = context;
    const pal = zonePalette(state.zone);
    const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.groundY);
    gradient.addColorStop(0, pal.sky[0]);
    gradient.addColorStop(0.55, pal.sky[1]);
    gradient.addColorStop(1, pal.sky[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.groundY);

    // Sun (farmyard/barn) or hanging lamp glow (kitchen).
    if (state.zone < 2) {
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(1060, 110, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 243, 196, 0.25)';
      ctx.beginPath();
      ctx.arc(1060, 110, 84, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255, 190, 90, 0.9)';
      ctx.beginPath();
      ctx.arc(640, 90, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    // Clouds drift with the parallax.
    ctx.fillStyle = 'rgba(255, 246, 229, 0.85)';
    for (let i = 0; i < 4; i += 1) {
      const cx = ((i * 340 - state.scrollX * 0.12) % 1400 + 1400) % 1400 - 60;
      const cy = 70 + i * 42;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 62, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 44, cy + 6, 44, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant hills / rooftops.
    ctx.fillStyle = state.zone === 2 ? '#2c1a14' : '#6b8a4a';
    ctx.beginPath();
    ctx.moveTo(0, FIELD.groundY);
    for (let x = 0; x <= FIELD.width; x += 80) {
      const hx = x - ((state.scrollX * 0.25) % 80);
      ctx.lineTo(hx, FIELD.groundY - 60 - Math.sin((x + state.scrollX * 0.25) * 0.008) * 34);
    }
    ctx.lineTo(FIELD.width, FIELD.groundY);
    ctx.closePath();
    ctx.fill();

    // Zone props on the horizon: farmhouse, barn, kitchen dresser.
    if (state.zone === 0) drawFarmhouse(180 - ((state.scrollX * 0.4) % 1600), 430);
    if (state.zone === 1) drawBarn(300 - ((state.scrollX * 0.4) % 1600), 420);
    if (state.zone === 2) drawKitchenBack(0);

    // Fence posts scrolling past.
    ctx.fillStyle = '#5d4126';
    for (let x = 0; x < FIELD.width + 90; x += 90) {
      const px = x - (state.scrollX % 90);
      ctx.fillRect(px, FIELD.groundY - 44, 8, 44);
      ctx.fillRect(px + 8, FIELD.groundY - 38, 82, 6);
      ctx.fillRect(px + 8, FIELD.groundY - 22, 82, 6);
    }

    // Ground.
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, FIELD.groundY, FIELD.width, FIELD.height - FIELD.groundY);
    ctx.fillStyle = pal.groundDark;
    ctx.fillRect(0, FIELD.groundY, FIELD.width, 10);
    // Grass tufts / floor tiles scrolling past.
    ctx.fillStyle = pal.groundDark;
    for (let x = 0; x < FIELD.width + 60; x += 60) {
      const px = x - (state.scrollX % 60);
      if (state.zone === 2) ctx.fillRect(px, FIELD.groundY + 30, 34, 6);
      else {
        ctx.beginPath();
        ctx.moveTo(px, FIELD.groundY + 26);
        ctx.lineTo(px + 5, FIELD.groundY + 12);
        ctx.lineTo(px + 10, FIELD.groundY + 26);
        ctx.fill();
      }
    }
  }

  function drawFarmhouse(x, y) {
    const ctx = context;
    ctx.fillStyle = '#f3e2c2';
    ctx.fillRect(x, y, 190, 110);
    ctx.fillStyle = '#b0492f';
    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.lineTo(x + 95, y - 52);
    ctx.lineTo(x + 204, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5d4126';
    ctx.fillRect(x + 80, y + 58, 34, 52);
    ctx.fillStyle = '#7fb2d9';
    ctx.fillRect(x + 22, y + 24, 34, 30);
    ctx.fillRect(x + 134, y + 24, 34, 30);
  }

  function drawBarn(x, y) {
    const ctx = context;
    ctx.fillStyle = '#a83c2a';
    ctx.fillRect(x, y, 210, 120);
    ctx.fillStyle = '#7d2a1e';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 105, y - 58);
    ctx.lineTo(x + 210, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f3e2c2';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 105, y + 118);
    ctx.lineTo(x + 105, y + 30);
    ctx.moveTo(x + 60, y + 74);
    ctx.lineTo(x + 150, y + 74);
    ctx.stroke();
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(x + 105, y - 30, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawKitchenBack() {
    const ctx = context;
    // A big oven glow and hanging pots at the back of the kitchen.
    ctx.fillStyle = '#241512';
    ctx.fillRect(60, 300, 240, 240);
    ctx.fillStyle = '#ff8c42';
    ctx.beginPath();
    ctx.arc(180, 470, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(180, 470, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6b3f';
    ctx.lineWidth = 6;
    for (let i = 0; i < 3; i += 1) {
      const px = 900 + i * 110;
      ctx.beginPath();
      ctx.moveTo(px, 180);
      ctx.lineTo(px, 240);
      ctx.stroke();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.arc(px, 268, 34, 0, Math.PI);
      ctx.fill();
    }
  }

  function drawTurkey(x, y, state, ducking, dashing) {
    const ctx = context;
    const p = state.player;
    const cycle = p.runCycle;
    const legSwing = p.onGround && !ducking ? Math.sin(cycle * 2.2) * 10 : 0;
    const bob = p.onGround && !ducking ? Math.abs(Math.sin(cycle * 2.2)) * 3 : 0;
    const bodyY = y - bob;
    const height = ducking ? 34 : 58;

    ctx.save();
    if (p.invulnerable > 0 && Math.floor(state.time * 12) % 2 === 0) ctx.globalAlpha = 0.45;

    // Tail fan.
    ctx.fillStyle = PALETTE.turkeyTail[0];
    for (let i = -2; i <= 2; i += 1) {
      ctx.save();
      ctx.translate(x + 8, bodyY + 18);
      ctx.rotate(i * 0.42 - 0.5);
      ctx.beginPath();
      ctx.ellipse(-16, -14, 9, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = PALETTE.turkeyTail[1];
    for (let i = -1; i <= 1; i += 1) {
      ctx.save();
      ctx.translate(x + 8, bodyY + 18);
      ctx.rotate(i * 0.45 - 0.5);
      ctx.beginPath();
      ctx.ellipse(-14, -12, 8, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Legs: planted on the ground while running, tucked while airborne.
    const legEndY = p.onGround ? FIELD.groundY : bodyY + height + 12;
    ctx.strokeStyle = '#e8a33c';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 24, bodyY + height - 8);
    ctx.lineTo(x + 24 + legSwing, legEndY);
    ctx.moveTo(x + 38, bodyY + height - 8);
    ctx.lineTo(x + 38 - legSwing, legEndY);
    ctx.stroke();

    // Body.
    ctx.fillStyle = PALETTE.turkeyBody;
    ctx.beginPath();
    ctx.ellipse(x + 30, bodyY + 26, 30, height / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wing.
    ctx.fillStyle = PALETTE.turkeyFeather;
    ctx.beginPath();
    ctx.ellipse(x + 26, bodyY + 28, 16, 11, dashing ? -0.9 : -0.3 + Math.sin(cycle * 2.2) * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Head.
    ctx.fillStyle = '#c9d2e3';
    ctx.beginPath();
    ctx.arc(x + 56, bodyY + 2, 13, 0, Math.PI * 2);
    ctx.fill();
    // Beak.
    ctx.fillStyle = '#f2a541';
    ctx.beginPath();
    ctx.moveTo(x + 66, bodyY - 2);
    ctx.lineTo(x + 80, bodyY + 3);
    ctx.lineTo(x + 66, bodyY + 7);
    ctx.closePath();
    ctx.fill();
    // Wattle.
    ctx.fillStyle = '#e5534b';
    ctx.beginPath();
    ctx.ellipse(x + 64, bodyY + 12, 5, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Eye.
    ctx.fillStyle = '#171310';
    ctx.beginPath();
    ctx.arc(x + 59, bodyY - 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + 60, bodyY - 3, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Dash trail.
    if (dashing) {
      ctx.fillStyle = 'rgba(255, 246, 229, 0.35)';
      ctx.beginPath();
      ctx.ellipse(x - 6, bodyY + 26, 34, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shield bubble.
    if (p.shield) {
      ctx.strokeStyle = PALETTE.shield;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + 30, bodyY + 24, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(127, 212, 255, 0.12)';
      ctx.fill();
    }
  }

  function drawFarmer(state) {
    const ctx = context;
    const p = state.player;
    const gap = state.farmerGap;
    const x = p.x - gap;
    if (x < -140) return; // off screen to the left
    const y = FIELD.groundY - 96;
    const cycle = p.runCycle * 1.15;
    const legSwing = Math.sin(cycle * 2.2) * 12;
    const close = gap < 150;

    ctx.save();
    // Body: blue overalls.
    ctx.fillStyle = PALETTE.farmer;
    roundRect(ctx, x + 8, y + 34, 44, 62, 10);
    ctx.fill();
    ctx.fillStyle = '#d8c9a8';
    ctx.fillRect(x + 14, y + 34, 32, 22);
    // Legs.
    ctx.strokeStyle = '#2c3e5e';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 92);
    ctx.lineTo(x + 20 + legSwing, FIELD.groundY);
    ctx.moveTo(x + 40, y + 92);
    ctx.lineTo(x + 40 - legSwing, FIELD.groundY);
    ctx.stroke();
    // Head + straw hat.
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(x + 30, y + 18, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.farmerHat;
    ctx.beginPath();
    ctx.ellipse(x + 30, y + 8, 30, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 16, y - 8, 28, 16);
    // Angry eyes.
    ctx.fillStyle = '#171310';
    ctx.fillRect(x + 36, y + 12, 4, 4);
    ctx.fillRect(x + 44, y + 12, 4, 4);
    // Pitchfork, held high while chasing.
    ctx.strokeStyle = '#8a6b3f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 56, y + 40);
    ctx.lineTo(x + 66, y - 26);
    ctx.stroke();
    ctx.strokeStyle = '#d7dde6';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + 66 + i * 8, y - 26);
      ctx.lineTo(x + 66 + i * 8, y - 44);
      ctx.stroke();
    }
    // "!" when close.
    if (close) {
      ctx.fillStyle = PALETTE.danger;
      ctx.font = 'bold 34px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('!', x + 30, y - 40);
    }
    ctx.restore();
  }

  function drawObstacle(o, state) {
    const ctx = context;
    if (o.kind === KIND_FENCE) {
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(o.x, o.y, o.width, o.height);
      ctx.fillStyle = '#5d3d22';
      ctx.fillRect(o.x - 3, o.y + 12, o.width + 6, 7);
      ctx.fillRect(o.x - 3, o.y + o.height - 20, o.width + 6, 7);
      ctx.fillStyle = '#a0714a';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x + o.width / 2, o.y - 10);
      ctx.lineTo(o.x + o.width, o.y);
      ctx.closePath();
      ctx.fill();
    } else if (o.kind === KIND_HAY) {
      ctx.fillStyle = '#d9a441';
      ctx.beginPath();
      ctx.ellipse(o.x + o.width / 2, o.y + o.height / 2, o.width / 2, o.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a87c2a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(o.x + o.width / 2, o.y + o.height / 2, o.width / 2 - 8, o.height / 2 - 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(o.x + 8, o.y + 12);
      ctx.lineTo(o.x + o.width - 8, o.y + o.height - 12);
      ctx.moveTo(o.x + o.width - 8, o.y + 12);
      ctx.lineTo(o.x + 8, o.y + o.height - 12);
      ctx.stroke();
    } else if (o.kind === KIND_BRANCH) {
      ctx.fillStyle = '#4a3220';
      ctx.fillRect(o.x - 6, o.y, o.width + 12, 12);
      ctx.fillStyle = '#5d7a38';
      ctx.beginPath();
      ctx.ellipse(o.x + o.width / 2, o.y + 18, o.width / 2, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.arc(o.x + 14, o.y + 22, 6, 0, Math.PI * 2);
      ctx.arc(o.x + o.width - 16, o.y + 16, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === KIND_KNIFE_FALL) {
      // Landing shadow telegraphs where it will stick.
      if (o.state === 0) {
        ctx.fillStyle = 'rgba(255, 90, 78, 0.35)';
        ctx.beginPath();
        ctx.ellipse(o.x + o.width / 2, FIELD.groundY + 4, 26, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(o.x + o.width / 2, o.y + o.height / 2);
      ctx.fillStyle = PALETTE.knife;
      ctx.beginPath();
      ctx.moveTo(-8, -32);
      ctx.lineTo(8, -32);
      ctx.lineTo(8, 14);
      ctx.lineTo(0, 32);
      ctx.lineTo(-8, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.knifeHandle;
      ctx.fillRect(-7, -44, 14, 14);
      ctx.restore();
    } else if (o.kind === KIND_KNIFE_SWING) {
      const swing = Math.sin(o.phase) * 150;
      const bx = o.x + swing;
      ctx.strokeStyle = '#8a6b3f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(o.x, 0);
      ctx.lineTo(bx, o.y);
      ctx.stroke();
      ctx.save();
      ctx.translate(bx, o.y + o.height / 2);
      ctx.fillStyle = PALETTE.knife;
      ctx.beginPath();
      ctx.moveTo(-13, -14);
      ctx.lineTo(13, -14);
      ctx.lineTo(13, 6);
      ctx.lineTo(0, 14);
      ctx.lineTo(-13, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.knifeHandle;
      ctx.fillRect(-8, -26, 16, 12);
      ctx.restore();
    } else if (o.kind === KIND_PUMPKIN) {
      ctx.fillStyle = '#e8722a';
      ctx.beginPath();
      ctx.ellipse(o.x + o.width / 2, o.y + o.height / 2, o.width / 2, o.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b8511a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(o.x + o.width / 2, o.y + o.height / 2, o.width / 4, o.height / 2 - 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#5d7a38';
      ctx.fillRect(o.x + o.width / 2 - 3, o.y - 8, 6, 12);
      ctx.fillStyle = '#171310';
      ctx.beginPath();
      ctx.arc(o.x + o.width / 2 - 8, o.y + 18, 3, 0, Math.PI * 2);
      ctx.arc(o.x + o.width / 2 + 8, o.y + 18, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === KIND_FLAME) {
      if (o.state === 0) {
        // Telegraph: the oven vent glows before the jet ignites.
        ctx.fillStyle = 'rgba(255, 140, 66, 0.25)';
        ctx.fillRect(o.x, FIELD.groundY - 30, o.width, 30);
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(o.x, FIELD.groundY - 26, o.width, 26);
      } else {
        const flick = Math.sin(state.time * 22 + o.x) * 8;
        ctx.fillStyle = '#ff8c42';
        ctx.beginPath();
        ctx.moveTo(o.x - 6, FIELD.groundY);
        ctx.quadraticCurveTo(o.x + o.width / 2 + flick, o.y - 30, o.x + o.width + 6, FIELD.groundY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath();
        ctx.moveTo(o.x + 12, FIELD.groundY);
        ctx.quadraticCurveTo(o.x + o.width / 2 - flick, o.y + 30, o.x + o.width - 12, FIELD.groundY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(o.x, FIELD.groundY - 26, o.width, 26);
      }
    }
  }

  function drawPickup(p) {
    const ctx = context;
    const bobY = Math.sin(p.bob) * 5;
    const y = p.y + bobY;
    if (p.kind === PICK_CORN || p.kind === PICK_GOLDEN) {
      ctx.fillStyle = p.kind === PICK_GOLDEN ? PALETTE.golden : PALETTE.corn;
      ctx.beginPath();
      ctx.ellipse(p.x, y, 11, 15, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.kind === PICK_GOLDEN ? '#b8860b' : '#c99a2e';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(p.x - 6, y + i * 8);
        ctx.lineTo(p.x + 6, y + i * 8);
        ctx.stroke();
      }
      ctx.fillStyle = '#5d7a38';
      ctx.beginPath();
      ctx.moveTo(p.x - 8, y + 12);
      ctx.lineTo(p.x - 16, y + 22);
      ctx.lineTo(p.x - 4, y + 18);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === PICK_SHIELD) {
      ctx.fillStyle = PALETTE.shield;
      ctx.beginPath();
      ctx.ellipse(p.x, y, 12, 18, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, y - 16);
      ctx.lineTo(p.x, y + 16);
      ctx.stroke();
    } else if (p.kind === PICK_MAGNET) {
      ctx.fillStyle = '#c96a2e';
      ctx.beginPath();
      ctx.arc(p.x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(p.x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.arc(p.x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === PICK_BOOST) {
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath();
      ctx.ellipse(p.x, y, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a5a30';
      ctx.fillRect(p.x - 18, y - 6, 6, 4);
      ctx.fillStyle = '#ff8c42';
      ctx.beginPath();
      ctx.arc(p.x, y - 6, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === PICK_HEART) {
      ctx.fillStyle = PALETTE.heart;
      ctx.beginPath();
      ctx.moveTo(p.x, y + 12);
      ctx.bezierCurveTo(p.x - 18, y - 4, p.x - 10, y - 16, p.x, y - 6);
      ctx.bezierCurveTo(p.x + 10, y - 16, p.x + 18, y - 4, p.x, y + 12);
      ctx.fill();
    }
  }

  function drawParticles(state) {
    const ctx = context;
    for (const p of state.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawHearts(x, y, lives) {
    const ctx = context;
    for (let i = 0; i < LIVES; i += 1) {
      const hx = x + i * 30;
      ctx.fillStyle = i < lives ? PALETTE.heart : 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(hx, y + 10);
      ctx.bezierCurveTo(hx - 13, y - 3, hx - 7, y - 12, hx, y - 4);
      ctx.bezierCurveTo(hx + 7, y - 12, hx + 13, y - 3, hx, y + 10);
      ctx.fill();
    }
  }

  function drawHud(state, muted) {
    const ctx = context;
    // Top-left: score, distance, zone.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(20, 14, 10, 0.55)';
    roundRect(ctx, 18, 14, 300, 92, 12);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText(scoreLabel(state.score), 32, 22);
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText(distanceLabel(Math.floor(state.distance)) + ' m', 32, 58);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '16px ' + FONT;
    ctx.fillText(ZONES[state.zone].name + '  ·  ESCAPE AT ' + ESCAPE_DISTANCE + ' m', 32, 86);

    // Top-right: lives, combo, power-ups.
    drawHearts(1120, 26, state.lives);
    if (state.combo >= 2) {
      ctx.fillStyle = PALETTE.accent;
      ctx.font = 'bold 24px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText(comboLabel(Math.min(state.combo, 12)), 1252, 60);
    }
    let py = 92;
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px ' + FONT;
    if (state.player.shield) { ctx.fillStyle = PALETTE.shield; ctx.fillText('🛡 FEATHER SHIELD', 1252, py); py += 22; }
    if (state.player.magnet > 0) { ctx.fillStyle = '#f2c94c'; ctx.fillText('🧲 MAGNET ' + Math.ceil(state.player.magnet) + 's', 1252, py); py += 22; }
    if (state.player.boost > 0) { ctx.fillStyle = '#ff8c42'; ctx.fillText('⚡ GRAVY RUSH ' + Math.ceil(state.player.boost) + 's', 1252, py); py += 22; }
    if (state.player.dashCooldown > 0) {
      ctx.fillStyle = 'rgba(255, 246, 229, 0.55)';
      ctx.fillText('DASH ' + Math.ceil(state.player.dashCooldown * 10) / 10 + 's', 1252, py);
    }

    // Zone progress bar along the bottom.
    const barX = 320;
    const barW = 640;
    const barY = FIELD.height - 26;
    ctx.fillStyle = 'rgba(20, 14, 10, 0.6)';
    roundRect(ctx, barX - 6, barY - 6, barW + 12, 20, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.accent;
    const progress = Math.min(1, state.distance / ESCAPE_DISTANCE);
    roundRect(ctx, barX, barY, Math.max(8, barW * progress), 8, 4);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    for (let i = 0; i < ZONES.length; i += 1) {
      const zx = barX + (ZONES[i].from / ESCAPE_DISTANCE) * barW;
      ctx.fillText('◆ ' + ZONES[i].name, zx + 40, barY - 24);
    }
    ctx.fillText('🏠 FREEDOM', barX + barW, barY - 24);

    // Farmer proximity warning.
    if (state.farmerGap < 150) {
      const blink = Math.floor(state.time * 6) % 2 === 0;
      if (blink) {
        ctx.fillStyle = PALETTE.danger;
        ctx.font = 'bold 30px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('⚠ THE FARMER IS RIGHT BEHIND YOU! ⚠', FIELD.width / 2, 130);
      }
      ctx.fillStyle = 'rgba(255, 90, 78, 0.18)';
      ctx.fillRect(0, 0, 90, FIELD.height);
    }
    if (muted) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '16px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText('🔇 MUTED (M)', 32, FIELD.height - 46);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const ctx = context;
    const height = PANEL.top + PANEL.line * lines.length + PANEL.bottom;
    const top = (FIELD.height - height) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, (FIELD.width - PANEL.width) / 2, top, PANEL.width, height, 18);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.panelBorder;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.accent;
    ctx.font = 'bold 40px ' + FONT;
    ctx.fillText(title, FIELD.width / 2, top + 26);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '21px ' + FONT;
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], FIELD.width / 2, top + 92 + i * PANEL.line);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText(prompt, FIELD.width / 2, top + height - 52);
  }

  function draw(state, screen, best, bestDistance, muted) {
    resize();
    const ctx = context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#171310';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);

    drawBackground(state);
    if (screen === SCREEN_TITLE) {
      // The turkey runs in place behind the title panel.
      drawFarmer(state);
      drawTurkey(state.player.x, state.player.y, state, false, false);
      drawParticles(state);
      ctx.fillStyle = 'rgba(20, 14, 10, 0.45)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      drawPanel('🦃 GOBBLE DASH', [
        'The Great Turkey Escape — Thanksgiving is coming.',
        'Outrun the farmer, dodge the oven and the carving knives,',
        'and reach FREEDOM 3000 m down the road.',
        '',
        'SPACE / CLICK — jump (twice = double jump)',
        'SHIFT — turbo dash: smash fences, phase through danger',
        '↓ / S — duck under branches & swinging knives',
        'P — pause · M — mute',
        'Corn feeds your score and slows the farmer. Grab power-ups!',
        '',
        'BEST SCORE ' + best + '    ·    BEST ESCAPE ' + Math.floor(bestDistance) + ' m',
      ], 'PRESS SPACE OR CLICK TO RUN', PALETTE.accent);
      return;
    }

    for (const o of state.obstacles) if (o.active) drawObstacle(o, state);
    for (const p of state.pickups) if (p.active) drawPickup(p);
    drawFarmer(state);
    drawTurkey(state.player.x, state.player.y, state, state.player.ducking, state.player.dashTime > 0);
    drawParticles(state);
    drawHud(state, muted);

    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(20, 14, 10, 0.55)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      drawPanel('PAUSED', [
        'Score ' + state.score + '  ·  ' + Math.floor(state.distance) + ' m  ·  ' + ZONES[state.zone].name,
        'The farmer waits. The oven stays lit.',
      ], 'PRESS P OR CLICK TO KEEP RUNNING', PALETTE.muted);
    } else if (screen === SCREEN_OVER) {
      ctx.fillStyle = 'rgba(20, 14, 10, 0.55)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      if (state.over === 'escaped') {
        drawPanel('🎉 ESCAPED!', [
          'You made it past the farm, the barn and the kitchen —',
          'no Thanksgiving dinner this year!',
          '',
          'SCORE ' + state.score + '   ·   DISTANCE ' + Math.floor(state.distance) + ' m',
          'BEST SCORE ' + best,
        ], 'PRESS SPACE OR CLICK TO RUN AGAIN', '#7fd47f');
      } else {
        drawPanel('😱 CAUGHT!', [
          'The farmer got you at ' + Math.floor(state.distance) + ' m…',
          'Thanksgiving dinner is served. Better luck next run!',
          '',
          'SCORE ' + state.score + '   ·   BEST SCORE ' + best,
          'BEST ESCAPE ' + Math.floor(bestDistance) + ' m',
        ], 'PRESS SPACE OR CLICK TO TRY AGAIN', PALETTE.danger);
      }
    }
  }

  return { draw };
}
