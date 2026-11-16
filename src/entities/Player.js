// src/entities/Player.js
// The player body: A/D running, gravity, friction and tile collision.

import { CONFIG } from '../config.js';

/** Tolerance for floating-point drift when counting the respawn timer down. */
const TIME_EPSILON = 1e-9;

/**
 * Player character. Also a "body" for CollisionSystem (x, y, width, height, vx, vy).
 *
 * Movement uses acceleration and friction instead of setting velocity directly,
 * so momentum gained from weapon recoil is preserved while the player steers.
 *
 * Complexity: update() is O(1); memory O(1), nothing allocated per step.
 */
export class Player {
  /**
   * @param {number} x spawn x (left edge) in px
   * @param {number} y spawn y (top edge) in px
   */
  constructor(x, y) {
    const cfg = CONFIG.player;

    this.x = x;
    this.y = y;
    this.prevX = x; // previous step position, used for render interpolation
    this.prevY = y;
    this.width = cfg.width;
    this.height = cfg.height;
    this.vx = 0; // px/s
    this.vy = 0; // px/s

    // Written by CollisionSystem.move() every step.
    this.onGround = false;
    this.hitWall = false;
    this.hitCeiling = false;
    
    // Death state: while dead the player ignores input, does not move and is not drawn.
    this.dead = false;
    this.respawnTimer = 0; // seconds left before the player may reappear
  }

  /**
   * Advance one fixed step.
   * @param {number} dt step length in seconds
   * @param {{getMoveAxis: function(): number}} input provides -1, 0 or 1 from A/D
   * @param {import('../physics/CollisionSystem.js').CollisionSystem} collision
   */
  update(dt, input, collision) {
    this.prevX = this.x;
    this.prevY = this.y;
    
    if (this.dead) {
      this.respawnTimer -= dt;
      return; // dead: no input, no gravity, no movement
    }

    

    this.applyHorizontalControl(dt, input.getMoveAxis());
    

    // Gravity, then clamp so the speed never exceeds what collision can handle.
    const phys = CONFIG.physics;
    this.vy += phys.gravity * dt;
    this.vx = Math.max(-phys.maxSpeedX, Math.min(phys.maxSpeedX, this.vx));
    this.vy = Math.max(-phys.maxSpeedY, Math.min(phys.maxSpeedY, this.vy));

    collision.move(this, dt);
  }

  /**
   * A/D acceleration, or friction when no direction is held.
   * @param {number} dt
   * @param {number} axis -1 (left), 0 (none), 1 (right)
   */

    /** @returns {boolean} true when the player is dead and the respawn delay is over */
  get canRespawn() {
    return this.dead && this.respawnTimer <= TIME_EPSILON;
  }

  /**
   * Kill the player. Ignored if already dead, so touching two hazards in the
   * same step cannot restart the countdown.
   */
  die() {
    if (this.dead) return;
    this.dead = true;
    this.respawnTimer = CONFIG.player.respawnDelay;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Bring the player back, standing still, at a spawn point.
   * @param {number} feetX x of the middle of the feet, in px
   * @param {number} feetY y of the feet (bottom edge), in px
   */
  respawn(feetX, feetY) {
    this.x = feetX - this.width / 2;
    this.y = feetY - this.height;
    // Reset the previous position too, or rendering would interpolate from the death spot.
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.hitWall = false;
    this.hitCeiling = false;
    this.dead = false;
    this.respawnTimer = 0;
  }

  applyHorizontalControl(dt, axis) {
    const cfg = CONFIG.player;

    if (axis !== 0) {
      // Only accelerate while below running speed; never slow down a faster
      // player (for example one launched by recoil).
      if (this.vx * axis < cfg.maxRunSpeed) {
        const accel = this.onGround ? cfg.runAccelGround : cfg.runAccelAir;
        this.vx += axis * accel * dt;
        if (this.vx * axis > cfg.maxRunSpeed) this.vx = axis * cfg.maxRunSpeed;
      }
    } else {
      // Friction pulls velocity toward zero without crossing it.
      const f = (this.onGround ? cfg.frictionGround : cfg.frictionAir) * dt;
      if (this.vx > 0) this.vx = Math.max(0, this.vx - f);
      else if (this.vx < 0) this.vx = Math.min(0, this.vx + f);
    }
  }

  /**
   * Draw the player, interpolated between the last two steps.
   * With a sprite, the feet are aligned with the bottom of the hitbox and the
   * sprite is centered on it; without one, a rectangle is drawn instead.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha fraction of a step left in the accumulator, [0, 1)
   * @param {HTMLImageElement|null} [sprite] picture of the player facing right
   * @param {number} [facing] 1 = facing right, -1 = facing left (sprite is mirrored)
   */
  render(ctx, alpha, sprite = null, facing = 1) {
    if (this.dead) return; // a dead player is not drawn

    const drawX = this.prevX + (this.x - this.prevX) * alpha;
    const drawY = this.prevY + (this.y - this.prevY) * alpha;

    if (sprite === null) {
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(drawX, drawY, this.width, this.height);
      return;
    }

    // Whole pixels only: pixel art drawn at fractional positions looks blurry.
    const centerX = Math.round(drawX + this.width / 2);
    const feetY = Math.round(drawY + this.height);

    ctx.save();
    ctx.translate(centerX, feetY);
    ctx.scale(facing, 1); // -1 mirrors the sprite around the vertical axis
    ctx.drawImage(sprite, -Math.round(sprite.width / 2), -sprite.height);
    ctx.restore();
  }
}