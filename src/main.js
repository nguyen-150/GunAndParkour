// src/main.js
// Entry point loaded by index.html. It only wires things together;
// no game rules live here.

import { CONFIG } from './config.js';

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

drawPlaceholder();