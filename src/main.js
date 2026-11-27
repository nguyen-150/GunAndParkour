// src/main.js
// Entry point loaded by index.html. It only wires things together;
// no game rules live here.

import { CONFIG } from './config.js';
import { Game } from './core/Game.js';
import { Cutscene } from './core/Cutscene.js';
import { GrabHand, GRAB_TIMELINE } from './render/GrabHand.js';
import { InputHandler } from './core/InputHandler.js';
import { Level } from './level/Level.js';
import { LevelManager } from './level/LevelManager.js';
import { TmxLoader } from './level/TmxLoader.js';
import { CollisionSystem } from './physics/CollisionSystem.js';
import { HazardSystem } from './physics/HazardSystem.js';
import { Player } from './entities/Player.js';
import { Weapon } from './entities/Weapon.js';
import { castRay, createRayHit } from './physics/Raycast.js';
import { Camera } from './render/Camera.js';
import { Background, THEMES } from './render/Background.js';
import { Parallax, LAYER_SETS } from './render/Parallax.js';
import { Atmosphere } from './render/Atmosphere.js';
import { BossBackdrop } from './render/BossBackdrop.js';
import { Lighting } from './render/Lighting.js';
import { Lava } from './render/Lava.js';
import { LavaFalls } from './render/LavaFalls.js';
import { CAVE_INTRO, createIntroPose, sampleIntro } from './render/CaveIntro.js';
import { TracerSystem } from './render/TracerSystem.js';
import { TuningPanel } from './render/TuningPanel.js';
import { PlayerAnimator } from './render/PlayerAnimator.js';
import { GameScreen } from './screens/GameScreen.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const gameScreen = new GameScreen(ctx, canvas); // drawing helpers are moving here (task A0)

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
// The sky and the parallax layers depend on the level's theme: applyTheme() builds them.
let theme;
let background;
let parallax;
let hasBoss = false; // true on levels with the skeleton boss in the background
const atmosphere = new Atmosphere(ctx); // mist and vignette gradients are created once, here
// Dark levels (the cave): a light map is multiplied over the scene. The ambient light is
// deliberately not black, so the platforms stay visible until lava lights the room.
const lighting = new Lighting(undefined, '90, 62, 82');
const eyePos = { x: 0, y: 0 }; // reused, so lighting the eyes allocates nothing

// ---- Levels: loaded by name, so the game can move from one level to the next ----
const levels = new LevelManager(
  {
    level1: { url: './assets/maps/level1.tmx', next: 'cave', theme: 'sunset' },
    cave: { url: './assets/maps/cave.tmx', theme: 'cave', boss: true },
  },
  (url) => TmxLoader.load(url),
  async (imageSource, tmxUrl) => {
    const image = new Image();
    // The image path in the .tmx is relative to the .tmx file itself.
    image.src = new URL(imageSource, new URL(tmxUrl, document.baseURI)).href;
    await image.decode();
    return image;
  }
);

let loaded;
try {
  loaded = await levels.load('level1');
} catch (err) {
  ctx.fillStyle = '#ff6b6b';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Cannot load level: ${err.message}`, 20, 40);
  throw err;
}
let currentName = loaded.name; // name of the level being played
let { level, image: tilesetImage } = loaded;
let map = level.tileMap; // collision, raycast and camera keep using "map" unchanged
applyTheme(currentName); // sky and mountains for the first level

// ---- Game objects ----
const input = new InputHandler();
input.attach(canvas);
let collision = new CollisionSystem(map);
let hazards = new HazardSystem(level);
const animator = new PlayerAnimator(); // squash, lean and gun kick values
let bossZone = level.getZone('boss_trigger'); // null on levels without a boss
let wasInsideBossZone = false; // so the entry is reported once, not every step
let showZones = false; // debug view: press Z to draw the zones and the player's hitbox

// Pose of the skeleton, updated every frame and reused (nothing is allocated). Debug keys, in the Z view:
// E cycles the eye glow (0, 0.5, 1), J opens or closes the jaw, R makes it roar (pulse and shake),
// L cycles the darkness of dark levels (1, 0.5, 0).
const bossPose = { clock: 0, eyeLevel: 1, jawOpen: false, roar: 0, targetX: null, targetY: 0 };
let lightStrength = 1;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyZ') showZones = !showZones;
  if (!showZones) return; // the boss test keys work only in the debug view
  if (e.code === 'KeyE') bossPose.eyeLevel = bossPose.eyeLevel >= 1 ? 0 : bossPose.eyeLevel + 0.5;
  if (e.code === 'KeyJ') bossPose.jawOpen = !bossPose.jawOpen;
  if (e.code === 'KeyR') bossPose.roar = bossPose.roar > 0 ? 0 : 1;
  if (e.code === 'KeyL') lightStrength = lightStrength <= 0 ? 1 : lightStrength - 0.5;
  if (e.code === 'KeyV') setLavaMode((lavaMode + 1) % 3); // none, pool, flooded room
  if (e.code === 'KeyI' && hasBoss) startIntro(); // replay the opening scene of the boss cave
});

// ---- Scripted scene: stepping into the boss trigger (the hand pulls the player down) ----
const noInput = { getMoveAxis: () => 0 }; // fake keyboard used while the player has no control
const grabScene = new Cutscene(
  [
    {
      at: GRAB_TIMELINE.restartAt, // the screen is fully black: switch levels now
      run: () => {
        if (preloadedLevel !== null) {
          applyLevel(preloadedLevel);
          preloadedLevel = null;
        } else {
          // No next level, or it did not load in time: just start this level again.
          player.respawn(level.spawnX, level.spawnY);
          weapon.reset();
          animator.reset();
        }
      },
    },
  ],
  GRAB_TIMELINE.duration
);

/** Where the hand comes out of the ground: under the player, on the ground below him. */
const grabSpot = { x: 0, groundY: 0 };

/** Update grabSpot from the player's current position (a ray straight down finds the ground). */
function trackGrabSpot() {
  const cx = player.x + player.width / 2;
  const feetY = player.y + player.height;
  const hit = castRay(map, cx, feetY, 0, 1, 4096, aimHit);
  grabSpot.x = cx;
  grabSpot.groundY = hit ? feetY + aimHit.distance : feetY;
}

// The spawn point in the .tmx marks the player's feet (middle of the bottom edge).
const player = new Player(
  level.spawnX - CONFIG.player.width / 2,
  level.spawnY - CONFIG.player.height
);
const tracers = new TracerSystem();
const weapon = new Weapon(map, tracers); // map lets pellet rays stop at walls

// ---- Moving to another level ----
let preloadedLevel = null; // the next level, loaded in the background while the scene plays

/** Start loading the next level (if there is one) so it is ready when the screen is black. */
function preloadNextLevel() {
  const next = levels.nextName(currentName);
  if (next === null) return;
  preloadedLevel = null;
  levels
    .load(next)
    .then((result) => {
      preloadedLevel = result;
    })
    .catch((err) => console.warn('Next level not loaded:', err.message));
}

/** Rebuild the sky and the parallax layers for the theme of a level ("sunset" or "cave"). */
function applyTheme(levelName) {
  const def = levels.definition(levelName);
  const name = def.theme ?? 'sunset';
  theme = THEMES[name] ?? THEMES.sunset;
  background = new Background(ctx, camera.viewHeight, theme);
  parallax = new Parallax(camera.viewHeight, LAYER_SETS[name] ?? LAYER_SETS.sunset);
  hasBoss = def.boss === true;
}

/**
 * Switch the game to a loaded level: rebuild everything that depends on the
 * map, and put the player at the new spawn point with a fresh weapon.
 * @param {{name:string, level:Level, image:HTMLImageElement}} result from LevelManager.load()
 */
function applyLevel(result) {
  currentName = result.name;
  applyTheme(currentName);
  level = result.level;
  tilesetImage = result.image;
  map = level.tileMap;
  collision = new CollisionSystem(map);
  hazards = new HazardSystem(level);
  bossZone = level.getZone('boss_trigger');
  makeLava();
  wasInsideBossZone = false;
  weapon.map = map; // the weapon casts its pellet rays through the new map
  weapon.reset();
  animator.reset();
  player.respawn(level.spawnX, level.spawnY);
  // Boss levels open with a scripted scene; other levels reset what that scene controls.
  if (hasBoss) {
    startIntro();
  } else {
    ambientLevel = 1;
    fallsFlow = 0;
    bossBarAlpha = 0;
  }
  console.log('Playing level:', currentName);
}


// ---- Lava (levels with a `lava_pool` rectangle in Tiled) ----
let lava = null;
let lavaZone = null;
let lavaRest = 0; // world y of the lava surface once the room has filled up
let lavaMode = 0; // debug (V in the Z view): 0 no lava, 1 the pool, 2 the flooded room

/** Build the lava pool of the current level from its `lava_pool` zone (null when there is none). */
function makeLava() {
  lavaZone = level.getZone('lava_pool');
  lava =
    lavaZone === null
      ? null
      : new Lava(ctx, {
          x0: lavaZone.x,
          x1: lavaZone.x + lavaZone.width,
          bottom: lavaZone.y + lavaZone.height,
        });
  lavaRest = lavaZone === null ? 0 : lavaZone.y + 64; // 64 px below the top of the zone
  setLavaMode(0);
}

/** Debug: put the lava in one of three states. The cave intro animates `lava.level` instead. */
function setLavaMode(mode) {
  lavaMode = mode;
  if (lava === null) return;
  if (mode === 0) {
    lava.level = lava.bottom; // empty
  } else if (mode === 1) {
    lava.x0 = lavaZone.x; // just the pool between the ledges
    lava.x1 = lavaZone.x + lavaZone.width;
    lava.level = lavaRest;
  } else {
    lava.x0 = 0; // the whole room
    lava.x1 = map.pixelWidth;
    lava.level = lavaZone.y - 48; // only something higher than this stays above the lava
  }
}
makeLava();

// ---- Opening scene of the boss cave (timeline in CaveIntro.js) ----
const lavaFalls = new LavaFalls(ctx);
const fallsSpots = [
  { x: 0, floorY: 0 },
  { x: 0, floorY: 0 },
]; // where the two streams pour: along the inner faces of the two side walls
let fallsFlow = 0; // 0 to 1, how much lava the streams carry
let ambientLevel = 1; // 1 = normal light, 0 = darkness (the intro fades it in)
let bossBarAlpha = 0; // opacity of the boss health bar (placeholder: always full)
const introPose = createIntroPose(); // reused every frame, nothing is allocated
const introScene = new Cutscene(
  [{ at: CAVE_INTRO.duration, run: () => finishIntro() }],
  CAVE_INTRO.duration
);

/** Find where the two streams pour: the inner faces of the side walls, read on a row above the platforms. */
function findFallsSpots() {
  const ts = map.tileSize;
  const row = 5;
  let left = 0;
  while (left < map.width && map.isSolid(left, row)) left++;
  let right = map.width - 1;
  while (right >= 0 && map.isSolid(right, row)) right--;
  const columns = [left, right];
  fallsSpots[0].x = left * ts + 42; // 42 = half the width of a full stream, so it runs along the wall
  fallsSpots[1].x = (right + 1) * ts - 42;
  for (let i = 0; i < 2; i++) {
    // The stream ends on the first solid tile below the ceiling, or at the bottom of the map.
    let r = 0;
    while (r < map.height && !map.isSolid(columns[i], r)) r++;
    fallsSpots[i].floorY = r * ts;
  }
}

/** World y where a stream ends: the lava surface, or the ledge or floor if that is higher. */
function fallsBottom(spot) {
  return lava !== null && lava.active ? Math.min(spot.floorY, lava.level) : spot.floorY;
}

/** Start the opening scene of the boss cave. The player has no control until it ends. */
function startIntro() {
  findFallsSpots();
  bossPose.eyeLevel = 0; // everything starts dark and quiet
  bossPose.jawOpen = false;
  bossPose.roar = 0;
  fallsFlow = 0;
  ambientLevel = 0;
  bossBarAlpha = 0;
  if (lava !== null) {
    lava.x0 = lavaZone.x;
    lava.x1 = lavaZone.x + lavaZone.width;
    lava.level = lava.bottom; // empty: the scene raises it
    lava.glow = 0;
  }
  introScene.start();
}

/** The scene is over: everything stays at its final value and the player gets control back. */
function finishIntro() {
  bossPose.eyeLevel = 1;
  bossPose.jawOpen = false;
  bossPose.roar = 0;
  fallsFlow = 0;
  ambientLevel = 1;
  bossBarAlpha = 1;
  if (lava !== null) {
    lava.level = lavaRest;
    lava.glow = 1;
  }
}

const aimHit = createRayHit(); // reused every frame, so aiming allocates nothing

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

  // Scripted scenes: no input, no firing, and nothing can kill the player.
  if (grabScene.active || introScene.active) {
    if (grabScene.active) {
      grabScene.update(dt);
      // Until the hand appears, follow the player so it rises exactly where he ended up (he may still slide or fall).
      if (grabScene.time < GRAB_TIMELINE.rise[0]) trackGrabSpot();
    }
    if (introScene.active) introScene.update(dt);
    player.update(dt, noInput, collision);
    animator.update(dt, player);
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

  // Boss trigger: start the scripted scene the moment the player steps into the zone.
  if (bossZone !== null && !player.dead) {
    const inside = level.overlapsZone('boss_trigger', player);
    if (inside && !wasInsideBossZone) {
      grabScene.start();
      trackGrabSpot(); // where the hand will come out of the ground
      preloadNextLevel(); // load the next level while the scene plays
    }
    wasInsideBossZone = inside;
  }
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

// The skeleton's hand for the grab scene. Optional: the scene still plays without it.
let handStrip = null;
try {
  handStrip = await loadImage('./assets/sprites/boss-hands.png');
} catch (err) {
  console.warn('Hand sprite not loaded, the grab scene will have no hand:', err.message);
}
const grabHand = handStrip === null ? null : new GrabHand(handStrip);

// The skeleton boss for levels flagged `boss: true`. Optional: the level plays without it.
const BOSS_BOTTOM = 570; // world y of the bottom edge of the skeleton picture
let bossStrip = null;
try {
  bossStrip = await loadImage('./assets/sprites/boss-head.png');
} catch (err) {
  console.warn('Boss picture not loaded, the cave will have no skeleton:', err.message);
}
const bossBackdrop = bossStrip === null ? null : new BossBackdrop(ctx, bossStrip);

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

/** Debug view (toggle with Z): the level's zones in blue and the player's hitbox in green. */
function drawZones() {
  if (!showZones) return;
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(80, 200, 255, 0.25)';
  ctx.strokeStyle = 'rgba(80, 200, 255, 0.9)';
  for (let i = 0; i < level.zones.length; i++) {
    const z = level.zones[i];
    ctx.fillRect(z.x, z.y, z.width, z.height);
    ctx.strokeRect(z.x + 0.5, z.y + 0.5, z.width - 1, z.height - 1);
  }
  ctx.strokeStyle = 'rgba(120, 255, 120, 0.9)';
  ctx.strokeRect(Math.round(player.x) + 0.5, Math.round(player.y) + 0.5, player.width, player.height);
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
  const lavaClock = performance.now() / 1000; // visual only: ripples and flicker

  // Opening scene of the boss cave: sample the timeline at the interpolated scene time and
  // apply it to the eyes, the jaw, the streams, the lava, the light and the health bar.
  let introShakeX = 0;
  let introShakeY = 0;
  if (introScene.active) {
    const s = sampleIntro(introScene.time + alpha * CONFIG.loop.fixedStep, introPose);
    bossPose.eyeLevel = s.eyeLevel;
    bossPose.jawOpen = s.jawOpen;
    bossPose.roar = s.roar;
    fallsFlow = s.falls;
    ambientLevel = s.ambient;
    bossBarAlpha = s.hud;
    if (lava !== null) {
      lava.level = lava.bottom - (lava.bottom - lavaRest) * s.lavaRise; // 0 = empty, 1 = resting level
      lava.glow = s.glow;
    }
    introShakeX = Math.round(Math.sin(lavaClock * 90) * s.shake);
    introShakeY = Math.round(Math.cos(lavaClock * 70) * s.shake);
  }  
  // Scripted scene effects follow the interpolated scene time, so they stay smooth at any frame rate.
  const tl = GRAB_TIMELINE;
  const sceneT = grabScene.active ? grabScene.time + alpha * CONFIG.loop.fixedStep : 0;
  let shakeX = 0;
  let shakeY = 0;
  let fade = 0; // 0 = clear, 1 = black
  if (grabScene.active) {
    // Rumble: ramps up at the start and dies away before the fade completes.
    const strength =
      5 * grabScene.progress(0, tl.shakeIn, sceneT) * (1 - grabScene.progress(tl.shakeOut[0], tl.shakeOut[1], sceneT));
    const clock = performance.now() / 1000; // visual only, does not touch the simulation
    shakeX = Math.round(Math.sin(clock * 90) * strength);
    shakeY = Math.round(Math.cos(clock * 70) * strength);
    fade =
      sceneT < tl.restartAt
        ? grabScene.progress(tl.fadeOut[0], tl.fadeOut[1], sceneT)
        : 1 - grabScene.progress(tl.fadeIn[0], tl.fadeIn[1], sceneT);
  }
  // From the moment the fist closes until the restart, the player is inside the hand.
  const playerGrabbed = grabScene.active && sceneT >= tl.grabAt && sceneT < tl.restartAt;
  ctx.save();
  ctx.translate(shakeX + introShakeX, shakeY + introShakeY); // the whole picture shakes; the HUD and the fade are drawn after restore  
  background.draw(ctx, camera); // sky and sun, after camera.follow so the sun drifts with it
  parallax.draw(ctx, camera); // mountains between the sky and the world  
  if (theme.mist) atmosphere.drawMist(ctx, camera); // haze at the horizon, behind the terrain

  // World space: everything here is shifted by the camera position.
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  if (hasBoss && bossBackdrop !== null) {
    // Behind the terrain, in front of the far parallax layers.
    bossPose.clock = performance.now() / 1000; // visual only
    bossPose.targetX = px; // the eyes follow the player (interpolated position, world space)
    bossPose.targetY = py;
    bossBackdrop.draw(ctx, map.pixelWidth / 2, BOSS_BOTTOM, bossPose);  }
  drawTiles();
  if (lava !== null) lava.draw(ctx, lavaClock); // after the terrain, so rising lava covers the platforms
  if (hasBoss && fallsFlow > 0) {
    for (let i = 0; i < 2; i++) {
      lavaFalls.draw(ctx, lavaClock, fallsSpots[i].x, 0, fallsBottom(fallsSpots[i]), fallsFlow);
    }
  }
  gameScreen.drawGoalMarker(bossZone);
  drawZones();
  ctx.imageSmoothingEnabled = false; // keep pixel art crisp (resizing the canvas resets this)
  const facing = camera.screenToWorldX(input.mouseX) < px ? -1 : 1; // face the mouse
  if (!playerGrabbed) player.render(ctx, alpha, playerSprite, facing, runStrip, airStrip, animator);  // One hand position and one aim angle per frame, shared by the gun picture and
  // the aim line. Both use the interpolated position, so neither jitters.
  const handX = Math.round(px);
  // The hand sinks with the landing squash, so the gun stays on the body.
  const handY = Math.round(py + player.height / 2 - CONFIG.gun.mountHeight * animator.scaleY);
  const aimAngle = Math.atan2(
    camera.screenToWorldY(input.mouseY) - handY,
    camera.screenToWorldX(input.mouseX) - handX
  );
  if (gunSprite !== null && !player.dead && !playerGrabbed) drawGun(handX, handY, aimAngle);

  tracers.render(ctx);
  if (!player.dead && !grabScene.active) drawAim(handX, handY, aimAngle);

  // The skeleton's hand is drawn last in the world, so it is in front of the player and the gun.
  if (grabHand !== null && grabScene.active) {
    grabHand.draw(ctx, sceneT, grabSpot.x, grabSpot.groundY, grabSpot.groundY - player.height / 2);
  }
  ctx.restore();
  ctx.restore(); // end of the shaken part of the picture

    // Dark levels: a light map (ambient darkness plus colored lights) is multiplied over the scene.
  if (theme.dark) {
    lighting.begin(canvas.width, canvas.height, ambientLevel);
    if (lava !== null) lava.addLights(lighting, camera, lavaClock);
    if (hasBoss && fallsFlow > 0) {
      for (let i = 0; i < 2; i++) {
        lavaFalls.addLights(lighting, camera, lavaClock, fallsSpots[i].x, 0, fallsBottom(fallsSpots[i]), fallsFlow);
      }
    }    
    if (hasBoss && bossBackdrop !== null) {
      // Both eyes shine with the same flicker as their drawing.
      const brightness = bossBackdrop.eyeBrightness(bossPose.clock, bossPose.eyeLevel);
      for (let i = 0; i < 2; i++) {
        bossBackdrop.eyePosition(i, map.pixelWidth / 2, BOSS_BOTTOM, eyePos);
        lighting.addLight('eye', eyePos.x - camera.x, eyePos.y - camera.y, 260, brightness);
      }
    }
    if (!player.dead && !playerGrabbed) {
      lighting.addLight('warm', px - camera.x, py - camera.y, 130, 0.85); // a small light around the player
    }
    lighting.end(ctx, lightStrength);
  }

  atmosphere.drawVignette(ctx, camera); // dark edges over the world, under the HUD text
  gameScreen.drawBossBar(bossBarAlpha); // the boss health bar fades in at the end of the cave intro  // Screen space: the HUD stays fixed on the screen.
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
  // Fade to black during the scripted scene (drawn last, over everything).
  if (fade > 0) {
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
}

const tuningPanel = new TuningPanel(); // remembers start-up values for the Reset button
tuningPanel.mount(); // press P in the game to show or hide it
if (hasBoss) startIntro(); // useful when the game starts directly in a boss level (for testing)
const game = new Game({ update, render });
game.start();
