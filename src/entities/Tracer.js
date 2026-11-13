// src/entities/Tracer.js
// A short-lived visual streak left by one shotgun pellet. Pooled and reused.

/**
 * Visual-only streak: a straight line from the muzzle to where the pellet
 * ray ended. It fades out over its lifetime and then expires.
 * It has no physics and deals no damage (damage comes from the shot's cone).
 *
 * Pool contract: has an `active` flag (managed by ObjectPool). The Tracer does
 * not know about the pool; its owner releases it when update() returns false.
 *
 * Complexity: start, update and render are O(1); memory O(1). Fading uses
 * globalAlpha (a number) instead of an rgba() string, so drawing allocates nothing.
 */
export class Tracer {
  constructor() {
    this.active = false; // required by ObjectPool
    this.x1 = 0; // start point (muzzle), world px
    this.y1 = 0;
    this.x2 = 0; // end point (wall hit or max range), world px
    this.y2 = 0;
    this.age = 0; // seconds since start()
    this.lifetime = 0; // seconds the streak lasts
  }

  /**
   * (Re)initialise this streak. Called after ObjectPool.acquire().
   * @param {number} x1 start x
   * @param {number} y1 start y
   * @param {number} x2 end x
   * @param {number} y2 end y
   * @param {number} lifetime seconds until it disappears
   */
  start(x1, y1, x2, y2, lifetime) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.age = 0;
    this.lifetime = lifetime;
  }

  /**
   * Age the streak by one fixed step.
   * @param {number} dt step length in seconds
   * @returns {boolean} true while still visible, false once expired
   */
  update(dt) {
    this.age += dt;
    return this.age < this.lifetime;
  }

  /**
   * Draw the streak, fading linearly from opaque to transparent.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const alpha = Math.max(0, 1 - this.age / this.lifetime);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#fff2b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.stroke();
    ctx.globalAlpha = 1; // leave the context clean for whatever is drawn next
  }
}