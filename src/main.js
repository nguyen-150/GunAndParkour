// src/main.js
// Entry point loaded by index.html. It only wires things together;
// no game rules live here.

import { CONFIG } from './config.js';
import { Game } from './core/Game.js';
import { InputHandler } from './core/InputHandler.js';
import { Level } from './level/Level.js';
import { TmxLoader } from './level/TmxLoader.js';
import { CollisionSystem } from './physics/CollisionSystem.js';
import { Player } from './entities/Player.js';
import { Weapon } from './entities/Weapon.js';
import { castRay, createRayHit } from './physics/Raycast.js';
import { Camera } from './render/Camera.js';
import { TracerSystem } from './render/TracerSystem.js';
import { TuningPanel } from './render/TuningPanel.js';


const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Fixed view height, view width follows the window aspect ratio (see Camera).
const camera = new Camera(
  CONFIG.screen.height,
  CONFIG.camera.minViewWidth,
  CONFIG.camera.maxViewWidth
);

/** Match canvas resolution to the camera view and fit it inside the window. */
function resizeCanvas() {
  camera.setWindowSize(window.innerWidth, window.innerHeight);
  canvas.width = camera.viewWidth; // 1 canvas px = 1 world px
  canvas.height = camera.viewHeight;

  // Displayed size: as large as fits the window, same aspect ratio as the view.
  const scale = Math.min(
    window.innerWidth / camera.viewWidth,
    window.innerHeight / camera.viewHeight
  );
  canvas.style.width = `${camera.viewWidth * scale}px`;
  canvas.style.height = `${camera.viewHeight * scale}px`;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ---- Level: load the map drawn in Tiled and its tileset image ----
const LEVEL_URL = './assets/maps/level1.tmx';

/** Load a .tmx map and the tileset image it points to. */
async function loadLevel(url) {
  const level = Level.fromTmx(await TmxLoader.load(url));
  const image = new Image();
  // The image path in the .tmx is relative to the .tmx file itself.
  image.src = new URL(level.tileset.imageSource, new URL(url, document.baseURI)).href;
  await image.decode();
  return { level, image };
}

let loaded;
try {
  loaded = await loadLevel(LEVEL_URL);
} catch (err) {
  ctx.fillStyle = '#ff6b6b';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Cannot load level: ${err.message}`, 20, 40);
  throw err;
}
const { level, image: tilesetImage } = loaded;
const map = level.tileMap; // collision, raycast and camera keep using "map" unchanged

// ---- Game objects ----
const input = new InputHandler();
input.attach(canvas);
const collision = new CollisionSystem(map);
// The spawn point in the .tmx marks the player's feet (middle of the bottom edge).
const player = new Player(
  level.spawnX - CONFIG.player.width / 2,
  level.spawnY - CONFIG.player.height
);
const tracers = new TracerSystem();
const weapon = new Weapon(map, tracers); // map lets pellet rays stop at walls
const aimHit = createRayHit(); // reused every frame, so aiming allocates nothing

/** Advance the simulation by one fixed step of dt seconds. */
function update(dt) {
  weapon.update(dt);
  tracers.update(dt);

  // Fire before moving the player, so the recoil is applied in this very step.
  if (input.mouseDown) {
    const dx = camera.screenToWorldX(input.mouseX) - (player.x + player.width / 2);
    const dy = camera.screenToWorldY(input.mouseY) - (player.y + player.height / 2);
    weapon.fire(player, dx, dy);
  }

  player.update(dt, input, collision);
}

/** Draw the tiles inside the camera view, using pictures from the tileset image. */
function drawTiles() {
  const ts = map.tileSize;
  const { firstGid, columns } = level.tileset;

  // Visible range of tiles, clamped to the map.
  const firstCol = Math.max(0, Math.floor(camera.x / ts));
  const lastCol = Math.min(map.width - 1, Math.floor((camera.x + camera.viewWidth) / ts));
  const firstRow = Math.max(0, Math.floor(camera.y / ts));
  const lastRow = Math.min(map.height - 1, Math.floor((camera.y + camera.viewHeight) / ts));

  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      const gid = level.getGid(col, row);
      if (gid === 0) continue; // empty tile

      // Position of this tile's picture inside the tileset image.
      const index = gid - firstGid;
      const sx = (index % columns) * ts;
      const sy = Math.floor(index / columns) * ts;
      ctx.drawImage(tilesetImage, sx, sy, ts, ts, col * ts, row * ts, ts, ts);
    }
  }
}

/** Draw the aim ray from the player's center toward the mouse, stopping at the first wall. */
function drawAim() {
  const ox = player.x + player.width / 2;
  const oy = player.y + player.height / 2;
  const dx = camera.screenToWorldX(input.mouseX) - ox;
  const dy = camera.screenToWorldY(input.mouseY) - oy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return; // mouse exactly on the player: no direction

  const range = CONFIG.weapon.range;
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
  // Follow the interpolated player position so the camera does not jitter.
  const px = player.prevX + (player.x - player.prevX) * alpha + player.width / 2;
  const py = player.prevY + (player.y - player.prevY) * alpha + player.height / 2;
  camera.follow(px, py, map.pixelWidth, map.pixelHeight);

  ctx.fillStyle = '#1c1f2b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // World space: everything here is shifted by the camera position.
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawTiles();
  player.render(ctx, alpha);
  tracers.render(ctx);
  drawAim();
  ctx.restore();

  // Screen space: the HUD stays fixed on the screen.
  ctx.fillStyle = '#f2f2f2';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `onGround: ${player.onGround}   vx: ${player.vx.toFixed(0)}   vy: ${player.vy.toFixed(0)}`,
    40,
    52
  );
  ctx.fillText(
    `weapon: ${weapon.state.name}   reload: ${weapon.reloadTimer.toFixed(2)}s`,
    40,
    72
  );
}

const tuningPanel = new TuningPanel(); // remembers start-up values for the Reset button
tuningPanel.mount(); // press P in the game to show or hide it
const game = new Game({ update, render });
game.start();
