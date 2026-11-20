// src/main.js
// Entry point loaded by index.html. It only wires things together;
// no game rules live here.

import { CONFIG } from './config.js';
import { Game } from './core/Game.js';
import { InputHandler } from './core/InputHandler.js';
import { Level } from './level/Level.js';
import { TmxLoader } from './level/TmxLoader.js';
import { CollisionSystem } from './physics/CollisionSystem.js';
import { HazardSystem } from './physics/HazardSystem.js';
import { Player } from './entities/Player.js';
import { Weapon } from './entities/Weapon.js';
import { castRay, createRayHit } from './physics/Raycast.js';
import { Camera } from './render/Camera.js';
import { Background } from './render/Background.js';
import { Parallax } from './render/Parallax.js';
import { Atmosphere } from './render/Atmosphere.js';
import { TracerSystem } from './render/TracerSystem.js';
import { TuningPanel } from './render/TuningPanel.js';
import { PlayerAnimator } from './render/PlayerAnimator.js';

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
const background = new Background(ctx, camera.viewHeight); // gradients are created once, here
const parallax = new Parallax(camera.viewHeight); // mountain layers are painted once, here
const atmosphere = new Atmosphere(ctx); // mist and vignette gradients are created once, here

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
const hazards = new HazardSystem(level);
const animator = new PlayerAnimator(); // squash, lean and gun kick values
const bossZone = level.getZone('boss_trigger'); // null on levels without a boss

// The spawn point in the .tmx marks the player's feet (middle of the bottom edge).
const player = new Player(
  level.spawnX - CONFIG.player.width / 2,
  level.spawnY - CONFIG.player.height
);
const tracers = new TracerSystem();
const weapon = new Weapon(map, tracers); // map lets pellet rays stop at walls
const aimHit = createRayHit(); // reused every frame, so aiming allocates nothing

/** Advance the simulation by one fixed step of dt seconds. */
/** Advance the simulation by one fixed step of dt seconds. */
/** Advance the simulation by one fixed step of dt seconds. */
function update(dt) {
  weapon.update(dt);
  tracers.update(dt);

  // Dead: only count the respawn delay down, then come back with a fresh weapon.
  if (player.dead) {
    player.update(dt, input, collision);
    if (player.canRespawn) {
      player.respawn(level.spawnX, level.spawnY);
      weapon.reset();
      animator.reset();
    }
    return;
  }

  // Fire before moving the player, so the recoil is applied in this very step.
  if (input.mouseDown) {
    const dx = camera.screenToWorldX(input.mouseX) - weapon.handX(player);
    const dy = camera.screenToWorldY(input.mouseY) - weapon.handY(player);
    if (weapon.fire(player, dx, dy)) animator.onShot();
  }

  player.update(dt, input, collision);
  animator.update(dt, player); // after the move, so it sees the resolved position

  // Check after moving and collision, so the position is already resolved.
  if (hazards.check(player) !== 0) player.die();
}

/** Draw the tiles inside the camera view, using pictures from the tileset image. */
/** Draw the tileset picture of tile id gid at map position (col, row). */
function drawTile(gid, col, row) {
  const ts = map.tileSize;  
  const { firstGid, columns } = level.tileset;
  const index = gid - firstGid;
  ctx.drawImage(
    tilesetImage,
    (index % columns) * ts, // position of the picture in the tileset image
    Math.floor(index / columns) * ts,
    ts,
    ts,
    col * ts, // position in the world
    row * ts,
    ts,
    ts
  );
}

/** Load one image and wait until it can be drawn. */
async function loadImage(url) {
  const image = new Image();
  image.src = new URL(url, document.baseURI).href;
  await image.decode();
  return image;
}

// The game still runs without the player picture (a rectangle is drawn instead).
let playerSprite = null;
try {
  playerSprite = await loadImage('./assets/sprites/player.png');
} catch (err) {
  console.warn('Player sprite not loaded, drawing a rectangle instead:', err.message);
}

// Run animation strip: frames side by side. Optional, the standing sprite is used without it.
let runStrip = null;
try {
  runStrip = await loadImage('./assets/sprites/player-run.png');
} catch (err) {
  console.warn('Run strip not loaded, using the standing sprite while running:', err.message);
}

// Air poses: rising and falling frames side by side. Optional, like the run strip.
let airStrip = null;
try {
  airStrip = await loadImage('./assets/sprites/player-air.png');
} catch (err) {
  console.warn('Air strip not loaded, using the standing sprite in the air:', err.message);
}

let gunSprite = null;
try {
  gunSprite = await loadImage('./assets/sprites/gun.png');
} catch (err) {
  console.warn('Gun sprite not loaded, the gun will not be drawn:', err.message);
}

/** Draw the tiles inside the camera view: ground first, hazards on top. */
function drawTiles() {
  const ts = map.tileSize;

  // Visible range of tiles, clamped to the map.
  const firstCol = Math.max(0, Math.floor(camera.x / ts));
  const lastCol = Math.min(map.width - 1, Math.floor((camera.x + camera.viewWidth) / ts));
  const firstRow = Math.max(0, Math.floor(camera.y / ts));
  const lastRow = Math.min(map.height - 1, Math.floor((camera.y + camera.viewHeight) / ts));

  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      const ground = level.getGid(col, row);
      if (ground !== 0) drawTile(ground, col, row);

      const hazard = level.getHazardGid(col, row);
      // Hazards marked visible: false (the abyss) still kill the player but are not drawn.
      if (hazard !== 0 && CONFIG.hazards[hazard]?.visible !== false) drawTile(hazard, col, row);    }
  }
}

/**
 * Draw the aim line from the barrel end to the first wall (or max range).
 * It starts at the same hand position and angle as the gun picture, so it
 * stays glued to the gun while flying fast.
 * @param {number} ox world x of the hand (the interpolated one used to draw the gun)
 * @param {number} oy world y of the hand
 * @param {number} angle aim direction in radians
 */
function drawAim(ox, oy, angle) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);

  const range = CONFIG.weapon.range;
  const hit = castRay(map, ox, oy, ux, uy, range, aimHit);
  const dist = hit ? aimHit.distance : range;

  // Start at the barrel end, but never past the wall.
  const start = Math.min(CONFIG.gun.muzzleLength, dist);

  ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox + ux * start, oy + uy * start);
  ctx.lineTo(ox + ux * dist, oy + uy * dist);
  ctx.stroke();

  if (hit) {
    ctx.fillStyle = '#ff5050';
    ctx.fillRect(ox + ux * dist - 3, oy + uy * dist - 3, 6, 6); // dot where the ray meets the wall
  }
}

/**
 * Draw a bobbing triangle above the boss trigger zone, pointing down at it.
 * It only marks where the level ends and says nothing about what waits there.
 */
function drawGoalMarker() {
  if (bossZone === null) return;
  const cx = Math.round(bossZone.x + bossZone.width / 2);
  // The bobbing is visual only: it reads the clock but never touches the simulation.
  const bob = Math.round(Math.sin(performance.now() / 300) * 4);
  const tip = bossZone.y - 10 + bob; // the point of the triangle, just above the zone

  ctx.beginPath();
  ctx.moveTo(cx, tip);
  ctx.lineTo(cx - 12, tip - 18);
  ctx.lineTo(cx + 12, tip - 18);
  ctx.closePath();
  ctx.fillStyle = '#ffd36b';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3b2a14';
  ctx.stroke();
}

/**
 * Draw the gun turning around the hand toward the aim angle.
 * @param {number} handX world x of the hand (whole pixels)
 * @param {number} handY world y of the hand (whole pixels)
 * @param {number} angle aim direction in radians
 */
function drawGun(handX, handY, angle) {
  const g = CONFIG.gun;
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(angle);
  ctx.translate(-Math.round(animator.gunKick), 0); // kick: slide back along the barrel
  // Aiming left, a plain rotation would turn the gun upside down: mirror it
  // across the barrel axis so the stock stays below the barrel.
  if (Math.cos(angle) < 0) ctx.scale(1, -1);
  ctx.drawImage(gunSprite, -g.pivotX, -g.pivotY);
  ctx.restore();
}

/** Draw the scene. alpha is the fraction of a step left in the accumulator. */
function render(alpha) {
  // Follow the interpolated player position so the camera does not jitter.
  const px = player.prevX + (player.x - player.prevX) * alpha + player.width / 2;
  const py = player.prevY + (player.y - player.prevY) * alpha + player.height / 2;
  camera.follow(px, py, map.pixelWidth, map.pixelHeight);

  background.draw(ctx, camera); // sky and sun, after camera.follow so the sun drifts with it
  parallax.draw(ctx, camera); // mountains between the sky and the world  
  atmosphere.drawMist(ctx, camera); // haze at the horizon, behind the terrain

  // World space: everything here is shifted by the camera position.
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawTiles();
  drawGoalMarker();
  ctx.imageSmoothingEnabled = false; // keep pixel art crisp (resizing the canvas resets this)
  const facing = camera.screenToWorldX(input.mouseX) < px ? -1 : 1; // face the mouse
  player.render(ctx, alpha, playerSprite, facing, runStrip, airStrip, animator);
  // One hand position and one aim angle per frame, shared by the gun picture and
  // the aim line. Both use the interpolated position, so neither jitters.
  const handX = Math.round(px);
  // The hand sinks with the landing squash, so the gun stays on the body.
  const handY = Math.round(py + player.height / 2 - CONFIG.gun.mountHeight * animator.scaleY);
  const aimAngle = Math.atan2(
    camera.screenToWorldY(input.mouseY) - handY,
    camera.screenToWorldX(input.mouseX) - handX
  );
  if (gunSprite !== null && !player.dead) drawGun(handX, handY, aimAngle);

  tracers.render(ctx);
  if (!player.dead) drawAim(handX, handY, aimAngle);
  ctx.restore();

  atmosphere.drawVignette(ctx, camera); // dark edges over the world, under the HUD text
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
  
  // Death notice (screen space) until the player respawns.
  if (player.dead) {
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
  }
}

const tuningPanel = new TuningPanel(); // remembers start-up values for the Reset button
tuningPanel.mount(); // press P in the game to show or hide it
const game = new Game({ update, render });
game.start();
