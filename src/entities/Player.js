// src/entities/Player.js
// The player body: A/D running, gravity, friction and tile collision.

import { CONFIG } from '../config.js';

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
   * Draw the player as a rectangle, interpolated between the last two steps.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha fraction of a step left in the accumulator, [0, 1)
   */
  render(ctx, alpha) {
    const drawX = this.prevX + (this.x - this.prevX) * alpha;
    const drawY = this.prevY + (this.y - this.prevY) * alpha;
    ctx.fillStyle = '#ffcc33';
    ctx.fillRect(drawX, drawY, this.width, this.height);
  }
}