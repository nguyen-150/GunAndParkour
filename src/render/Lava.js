// src/render/Lava.js
// A pool of lava drawn in code: wavy surface, glowing body, and it lights the scene.

const PIXEL = 4; // px, the surface is built from 4 px blocks like the rest of the art
const CRUST = '#ffe08a'; // bright band on top of the surface
const FLOW = '#ff7a2a'; // orange band under it

/** Color of the body from the surface (0) down to the bottom (1). */
const BODY_STOPS = [
  [0, '#ff6a1f'],
  [0.25, '#c93a14'],
  [1, '#4a0c0c'],
];

/** One light along the surface every this many px, and its radius and height above the surface. */
const LIGHT_SPACING = 160;
const LIGHT_RADIUS = 190;
const LIGHT_LIFT = 24;

/**
 * Lava pool. `level` is the world y of the surface (a smaller number is
 * higher); `level` equal to `bottom` means there is no lava yet. The game
 * logic uses `level` as it is: the waves are only drawn, so touching the
 * lava never flips back and forth with the ripples.
 *
 * The body gradient is built once at unit size and stretched when drawing,
 * so a frame allocates nothing. Complexity: draw() is O(width / 4)
 * rectangles, addLights() O(width / 160), overlaps() O(1); memory O(1).
 */
export class Lava {
  /**
   * @param {CanvasRenderingContext2D} ctx used to create the body gradient once
   * @param {{x0:number, x1:number, bottom:number}} bounds world x range of the pool and
   *   the world y of its bottom edge
   */
  constructor(ctx, bounds) {
    this.x0 = bounds.x0;
    this.x1 = bounds.x1;
    this.bottom = bounds.bottom;
    this.level = bounds.bottom; // starts empty
    this.glow = 1; // 0 = does not light the scene, 1 = full light

    this.body = ctx.createLinearGradient(0, 0, 0, 1); // unit height; draw() stretches it
    for (const [offset, color] of BODY_STOPS) this.body.addColorStop(offset, color);
  }

  /** @returns {boolean} true when there is any lava to show */
  get active() {
    return this.level < this.bottom;
  }

  /**
   * Height of the ripple at a world x, in px (about -5 to +5). Visual only.
   * @param {number} x world x
   * @param {number} clock time in seconds
   */
  waveAt(x, clock) {
    return 3 * Math.sin(x * 0.045 + clock * 1.6) + 2 * Math.sin(x * 0.11 - clock * 2.3);
  }

  /**
   * Draw the pool in world space: after the skeleton, before the terrain.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} clock time in seconds (visual only)
   */
  draw(ctx, clock) {
    if (!this.active) return;

    const base = Math.round(this.level / PIXEL) * PIXEL;
    const bodyTop = base + 2 * PIXEL; // the ripples reach at most one block below `base`

    // Body: one rectangle, filled with the unit gradient stretched to its height.
    const bodyHeight = this.bottom - bodyTop;
    if (bodyHeight > 0) {
      ctx.save();
      ctx.translate(this.x0, bodyTop);
      ctx.scale(1, bodyHeight);
      ctx.fillStyle = this.body;
      ctx.fillRect(0, 0, this.x1 - this.x0, 1);
      ctx.restore();
    }

    // Surface: one column per 4 px, its top moved by the ripple (in whole blocks).
    const columns = Math.ceil((this.x1 - this.x0) / PIXEL);
    for (let j = 0; j < columns; j++) {
      const x = this.x0 + j * PIXEL;
      const top = base + Math.round(this.waveAt(x, clock) / PIXEL) * PIXEL;
      ctx.fillStyle = FLOW;
      ctx.fillRect(x, top, PIXEL, bodyTop - top);
      ctx.fillStyle = CRUST;
      ctx.fillRect(x, top, PIXEL, PIXEL);
    }
  }

  /**
   * Add the glow of the lava to a Lighting instance: a row of lights just
   * above the surface, flickering a little.
   * @param {{addLight: function(string, number, number, number, number): void}} lighting
   * @param {{x:number, y:number}} camera top-left of the view, to convert to screen px
   * @param {number} clock time in seconds (visual only)
   */
  addLights(lighting, camera, clock) {
    if (!this.active || this.glow <= 0) return;
    const y = this.level - LIGHT_LIFT - camera.y;
    for (let x = this.x0 + LIGHT_SPACING / 2; x < this.x1; x += LIGHT_SPACING) {
      // Each light flickers with its own phase, so the glow dances along the pool.
      const flicker = 0.8 + 0.2 * Math.sin(clock * 3 + x * 0.01);
      lighting.addLight('lava', x - camera.x, y, LIGHT_RADIUS, this.glow * flicker);
    }
  }

  /**
   * True when a body dips into the lava: it is over the pool horizontally and
   * its feet are below the surface. Uses `level`, not the ripples.
   * @param {{x:number, y:number, width:number, height:number}} body
   */
  overlaps(body) {
    return (
      this.active &&
      body.x < this.x1 &&
      body.x + body.width > this.x0 &&
      body.y + body.height > this.level
    );
  }
}