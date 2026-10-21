// src/main.js
// Entry point loaded by index.html. It only wires things together;
// no game rules live here.

import { CONFIG } from './config.js';
import { Game } from './core/Game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Size the canvas from the config so there is a single source of truth.
canvas.width = CONFIG.screen.width;
canvas.height = CONFIG.screen.height;

/** Temporary smoke test: draws the tile grid and a title. Replaced by Game later. */
function drawPlaceholder() {
  const { width, height } = CONFIG.screen;
  const tile = CONFIG.tileSize;

  ctx.fillStyle = '#1c1f2b';
  ctx.fillRect(0, 0, width, height);

  // Faint grid lines, one line per tile boundary.
  ctx.strokeStyle = '#2a2f42';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x += tile) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 0; y <= height; y += tile) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  ctx.fillStyle = '#f2f2f2';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Gun and PARKOUR', width / 2, height / 2 - 10);
  ctx.font = '16px sans-serif';
  ctx.fillText(
    `Engine OK - grid ${width / tile} x ${height / tile} tiles`,
    width / 2,
    height / 2 + 24
  );
}

// ---- Loop smoke test (temporary): a square bouncing left and right ----
const box = { x: 100, prevX: 100, y: 300, size: 32, vx: 240 }; // vx in px/s

/** Advance the simulation by one fixed step of dt seconds. */
function update(dt) {
  box.prevX = box.x; // remember the previous state for interpolation
  box.x += box.vx * dt;
  const maxX = CONFIG.screen.width - box.size;
  if (box.x < 0 || box.x > maxX) {
    box.vx = -box.vx;
    box.x = Math.min(Math.max(box.x, 0), maxX);
  }
}

/** Draw the scene. alpha is the fraction of a step left in the accumulator. */
function render(alpha) {
  drawPlaceholder();
  const drawX = box.prevX + (box.x - box.prevX) * alpha; // interpolated position
  ctx.fillStyle = '#ffcc33';
  ctx.fillRect(drawX, box.y, box.size, box.size);

  ctx.fillStyle = '#f2f2f2';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`update steps this frame: ${game.lastSteps}`, 12, 24);
}

const game = new Game({ update, render });
game.start();