// src/screens/GameScreen.js
// The gameplay screen: owns the state of a play session and draws it.
// Being moved here step by step from main.js (see task A0).

/**
 * Gameplay screen. Right now it only holds the two drawing helpers that
 * depend on almost no game state; update/render and the level state follow.
 *
 * Complexity: each draw method is O(1); memory O(1).
 */
import { CONFIG } from '../config.js';
import { castRay, createRayHit } from '../physics/Raycast.js';

export class GameScreen {
  /**
   * @param {CanvasRenderingContext2D} ctx main 2D context
   * @param {HTMLCanvasElement} canvas used for the screen size (HUD placement)
   */
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.aimHit = createRayHit(); // reused every frame, so aiming allocates nothing
  }

  /**
   * Boss health bar at the top of the screen (screen space).
   * Placeholder: the boss has no health yet, so it is always full.
   * @param {number} alpha opacity 0 (hidden) to 1
   */
  drawBossBar(alpha) {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    const w = Math.min(520, this.canvas.width - 80);
    const x = Math.round((this.canvas.width - w) / 2);
    const y = 22;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(x - 3, y - 3, w + 6, 20); // dark frame
    ctx.fillStyle = '#b3141b';
    ctx.fillRect(x, y, w, 14); // the red bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x, y, w, 3); // highlight on top
    ctx.globalAlpha = 1;
  }

  /**
   * Bobbing triangle above the boss trigger zone, pointing down at it (world space).
   * @param {{x:number, y:number, width:number, height:number}|null} bossZone
   */
  drawGoalMarker(bossZone) {
    if (bossZone === null) return;
    const ctx = this.ctx;
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
   * Debug view: the level's zones in blue and the player's hitbox in green (world space).
   * The caller decides whether to call it (the Z toggle stays in main.js for now).
   * @param {{zones: Array<{x:number,y:number,width:number,height:number}>}} level
   * @param {{x:number, y:number, width:number, height:number}} player
   */
  drawZones(level, player) {
    const ctx = this.ctx;
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
   * Draw the gun turning around the hand toward the aim angle (world space).
   * @param {HTMLImageElement} gunSprite the caller checks it is not null
   * @param {{gunKick:number}} animator provides the recoil slide of the gun
   * @param {number} handX world x of the hand (whole pixels)
   * @param {number} handY world y of the hand (whole pixels)
   * @param {number} angle aim direction in radians
   */
  drawGun(gunSprite, animator, handX, handY, angle) {
    const ctx = this.ctx;
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

  /**
   * Aim line from the barrel end to the first wall (or max range), world space.
   * Starts at the same hand position and angle as the gun picture, so it
   * stays glued to the gun while flying fast.
   * @param {import('../level/TileMap.js').TileMap} map used to find where the ray ends
   * @param {number} ox world x of the hand (the interpolated one used to draw the gun)
   * @param {number} oy world y of the hand
   * @param {number} angle aim direction in radians
   */
  drawAim(map, ox, oy, angle) {
    const ctx = this.ctx;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);

    const range = CONFIG.weapon.range;
    const hit = castRay(map, ox, oy, ux, uy, range, this.aimHit);
    const dist = hit ? this.aimHit.distance : range;

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
   * Draw the tileset picture of tile id gid at map position (col, row) (world space).
   * @param {{tileMap:{tileSize:number}, tileset:{firstGid:number, columns:number}}} level
   * @param {CanvasImageSource} tilesetImage picture with all tiles in a grid
   * @param {number} gid Tiled tile id (not 0)
   * @param {number} col tile column
   * @param {number} row tile row
   */
  drawTile(level, tilesetImage, gid, col, row) {
    const ts = level.tileMap.tileSize;
    const { firstGid, columns } = level.tileset;
    const index = gid - firstGid;
    this.ctx.drawImage(
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

  /**
   * Draw the tiles inside the camera view: ground first, hazards on top (world space).
   * Only the visible range is visited, so the cost does not grow with the map size.
   * @param {import('../level/Level.js').Level} level
   * @param {CanvasImageSource} tilesetImage
   * @param {{x:number, y:number, viewWidth:number, viewHeight:number}} camera
   */
  drawTiles(level, tilesetImage, camera) {
    const map = level.tileMap;
    const ts = map.tileSize;

    // Visible range of tiles, clamped to the map.
    const firstCol = Math.max(0, Math.floor(camera.x / ts));
    const lastCol = Math.min(map.width - 1, Math.floor((camera.x + camera.viewWidth) / ts));
    const firstRow = Math.max(0, Math.floor(camera.y / ts));
    const lastRow = Math.min(map.height - 1, Math.floor((camera.y + camera.viewHeight) / ts));

    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const ground = level.getGid(col, row);
        if (ground !== 0) this.drawTile(level, tilesetImage, ground, col, row);

        const hazard = level.getHazardGid(col, row);
        // Hazards marked visible: false (the abyss) still kill the player but are not drawn.
        if (hazard !== 0 && CONFIG.hazards[hazard]?.visible !== false) {
          this.drawTile(level, tilesetImage, hazard, col, row);
        }
      }
    }
  }
}