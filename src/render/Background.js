// src/render/Background.js
// Sunset sky and sun, drawn behind the world.

/**
 * Sky colors from the top of the screen (0) to the bottom (1).
 * The warm glow sits on the horizon; below it a dark haze stands for the
 * far ground, which is what you see through pits. Edit this table to change
 * the mood (night, cave, forest).
 */
export const SKY_STOPS = [
  [0.0, '#14122e'],
  [0.3, '#3b2466'],
  [0.52, '#8a3a7a'],
  [0.68, '#d9605a'],
  [0.75, '#ffa860'], // horizon glow
  [0.78, '#5a2f55'], // haze below the horizon
  [1.0, '#1a1426'],
];

/**
 * Where the sky meets the far ground, as a fraction of the view height.
 * 0.75 of 640 px is y = 480, level with the ground surface of level1.
 */
const HORIZON = 0.75;

/** The sun: position as a fraction of the view, glow radius in px, camera drift. */
const SUN = { x: 0.7, y: 0.7, radius: 220, drift: 0.02 };

/** Sun colors from its center (0) to the edge of its glow (1): bright disc, then fading halo. */
const SUN_STOPS = [
  [0.0, '#fff6d8'],
  [0.13, '#ffeab0'],
  [0.15, 'rgba(255, 190, 110, 0.6)'],
  [0.4, 'rgba(255, 140, 90, 0.22)'],
  [1.0, 'rgba(255, 110, 80, 0)'],
];

/**
 * Sky backdrop. Both gradients are created once, so drawing a frame allocates
 * nothing (creating gradient objects every frame would feed the garbage collector).
 * The sky gradient is vertical, so it stays valid when the window width changes.
 *
 * Complexity: draw() is O(1); memory O(1).
 */
export class Background {
  /**
   * @param {CanvasRenderingContext2D} ctx context the gradients are created on
   * @param {number} viewHeight visible height in px (fixed)
   */
  constructor(ctx, viewHeight) {
    this.sky = ctx.createLinearGradient(0, 0, 0, viewHeight);
    for (const [offset, color] of SKY_STOPS) this.sky.addColorStop(offset, color);

    // Centered on (0, 0); draw() moves the origin to the sun position.
    this.sunGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, SUN.radius);
    for (const [offset, color] of SUN_STOPS) this.sunGlow.addColorStop(offset, color);
  }

  /**
   * Draw the sky and the sun in screen space. Call before drawing the world.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{viewWidth:number, viewHeight:number, x:number}} camera
   */
  draw(ctx, camera) {
    const w = camera.viewWidth;
    const h = camera.viewHeight;

    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, w, h);

    // The sun is very far away, so it drifts only slightly when the camera moves.
    const sunX = Math.round(w * SUN.x - camera.x * SUN.drift);
    const sunY = Math.round(h * SUN.y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h * HORIZON); // nothing of the sun below the horizon
    ctx.clip();
    ctx.translate(sunX, sunY);
    ctx.fillStyle = this.sunGlow;
    ctx.fillRect(-SUN.radius, -SUN.radius, SUN.radius * 2, SUN.radius * 2);
    ctx.restore();
  }
}