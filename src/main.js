// src/main.js
// Entry point loaded by index.html. It only wires things together;
// no game rules live here.

import { CONFIG } from './config.js';
import { Game } from './core/Game.js';
import { InputHandler } from './core/InputHandler.js';
import { TileMap, TILE_SOLID } from './level/TileMap.js';
import { CollisionSystem } from './physics/CollisionSystem.js';
import { Player } from './entities/Player.js';
import { castRay, createRayHit } from './physics/Raycast.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Size the canvas from the config so there is a single source of truth.
canvas.width = CONFIG.screen.width;
canvas.height = CONFIG.screen.height;

// ---- Temporary test level (replaced by TmxLoader later) ----
const COLS = CONFIG.screen.width / CONFIG.tileSize; // 30
const ROWS = CONFIG.screen.height / CONFIG.tileSize; // 20
const map = new TileMap(COLS, ROWS, CONFIG.tileSize);

// Solid border around the whole map.
for (let c = 0; c < COLS; c++) {
  map.setTile(c, 0, TILE_SOLID);
  map.setTile(c, ROWS - 1, TILE_SOLID);
}
for (let r = 0; r < ROWS; r++) {
  map.setTile(0, r, TILE_SOLID);
  map.setTile(COLS - 1, r, TILE_SOLID);
}
// Two floating platforms to look at (the player cannot reach them yet).
for (let c = 6; c <= 11; c++) map.setTile(c, 14, TILE_SOLID);
for (let c = 16; c <= 22; c++) map.setTile(c, 10, TILE_SOLID);

// ---- Game objects ----
const input = new InputHandler();
input.attach(canvas);
const collision = new CollisionSystem(map);
const player = new Player(64, 100);
const aimHit = createRayHit(); // reused every frame, so aiming allocates nothing

/** Advance the simulation by one fixed step of dt seconds. */
function update(dt) {
  player.update(dt, input, collision);
}

/** Draw every solid tile. Camera culling will replace this for big maps. */
function drawTiles() {
  const ts = map.tileSize;
  ctx.fillStyle = '#5b6b8c';
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.isSolid(col, row)) ctx.fillRect(col * ts, row * ts, ts, ts);
    }
  }
}

/** Draw the aim ray from the player's center toward the mouse, stopping at the first wall. */
function drawAim() {
  const ox = player.x + player.width / 2;
  const oy = player.y + player.height / 2;
  const dx = input.mouseX - ox;
  const dy = input.mouseY - oy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return; // mouse exactly on the player: no direction

  const range = CONFIG.weapon.bulletMaxRange;
  const hit = castRay(map, ox, oy, dx, dy, range, aimHit);
  const dist = hit ? aimHit.distance : range;
  const ex = ox + (dx / len) * dist;
  const ey = oy + (dy / len) * dist;

  ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  if (hit) {
    ctx.fillStyle = '#ff5050';
    ctx.fillRect(ex - 3, ey - 3, 6, 6); // dot where the ray meets the wall
  }
}

/** Draw the scene. alpha is the fraction of a step left in the accumulator. */
function render(alpha) {
  ctx.fillStyle = '#1c1f2b';
  ctx.fillRect(0, 0, CONFIG.screen.width, CONFIG.screen.height);

  drawTiles();
  player.render(ctx, alpha);
  drawAim();

  ctx.fillStyle = '#f2f2f2';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `onGround: ${player.onGround}   vx: ${player.vx.toFixed(0)}   vy: ${player.vy.toFixed(0)}`,
    40,
    52
  );
}

const game = new Game({ update, render });
game.start();