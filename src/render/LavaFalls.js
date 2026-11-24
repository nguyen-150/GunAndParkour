// src/render/LavaFalls.js
// Streams of lava pouring from the ceiling, drawn in code.

const PIXEL = 4; // px, everything is built from 4 px blocks like the rest of the art
const MAX_WIDTH = 28; // px, width of a stream at full flow
const STREAKS = 7; // bright bands that run down each stream
const STREAK_HEIGHT = 36; // px
const STREAK_COLOR = '#fff0b0';
const DROPS = 6; // droplets splashing at the foot of each stream
const DROP_COLOR = '#ffb347';
const LIGHT_SPACING = 140; // px between the lights along a stream
const LIGHT_RADIUS = 160;
const BASE_LIGHT_RADIUS = 210; // the splash lights its surroundings more

/** Colors across the stream (0 = left edge, 1 = right edge): dark red edges, bright core. */
const BODY_STOPS = [
  [0, '#7a1608'],
  [0.18, '#e8541a'],
  [0.5, '#ffc060'],
  [0.82, '#e8541a'],
  [1, '#7a1608'],
];

/** @returns {number} v rounded to the 4 px block grid */
function snap(v) {
  return Math.round(v / PIXEL) * PIXEL;
}

/**
 * Lava streams. One LavaFalls draws any number of streams (call draw() once
 * per stream). The body gradient is built once at unit width and stretched
 * when drawing, so a frame allocates nothing.
 *
 * Complexity: draw() is O(STREAKS + DROPS), a constant (14 rectangles);
 * addLights() is O(height / 140); memory O(1).
 */
export class LavaFalls {
  /** @param {CanvasRenderingContext2D} ctx used to create the gradient once */
  constructor(ctx) {
    this.body = ctx.createLinearGradient(0, 0, 1, 0); // unit width; draw() stretches it
    for (const [offset, color] of BODY_STOPS) this.body.addColorStop(offset, color);
  }

  /**
   * Draw one stream in world space (after the terrain, so it runs down the rock).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} clock time in seconds (visual only)
   * @param {number} x world x of the middle of the stream
   * @param {number} topY world y where the stream starts (the ceiling)
   * @param {number} bottomY world y where it ends (the lava surface or the floor)
   * @param {number} falls how much lava flows, 0 (none) to 1 (full)
   */
  draw(ctx, clock, x, topY, bottomY, falls) {
    if (falls <= 0) return;
    const length = bottomY - topY;
    if (length <= 0) return;

    // Width in whole blocks, with a slight pulse; too thin to show means no stream yet.
    const w = snap(MAX_WIDTH * falls * (1 + 0.05 * Math.sin(clock * 9 + x)));
    if (w < PIXEL) return;

    // Body: one rectangle, filled with the unit gradient stretched to the stream width.
    ctx.save();
    ctx.translate(snap(x - w / 2), topY);
    ctx.scale(w, 1);
    ctx.fillStyle = this.body;
    ctx.fillRect(0, 0, 1, length);
    ctx.restore();

    // Bright streaks running down: different speeds and offsets, so the flow looks alive.
    ctx.fillStyle = STREAK_COLOR;
    const streakW = Math.max(PIXEL, snap(w * 0.2));
    for (let i = 0; i < STREAKS; i++) {
      const speed = 150 + ((i * 37) % 90); // px/s
      const phase = (clock * speed + i * 83 + x) % length; // + x so two streams are out of step
      const sideways = (((i * 53) % 7) - 3) / 3 * (w * 0.25); // each streak has its own lane
      const y = snap(topY + phase);
      const h = Math.min(STREAK_HEIGHT, bottomY - y); // never past the foot of the stream
      if (h > 0) ctx.fillRect(snap(x + sideways - streakW / 2), y, streakW, h);
    }

    // Splash: droplets jump up from the foot of the stream and fall back, fading out.
    ctx.fillStyle = DROP_COLOR;
    for (let k = 0; k < DROPS; k++) {
      const p = (clock * 1.6 + k / DROPS + x * 0.013) % 1; // 0 = just thrown, 1 = gone
      const side = k % 2 === 0 ? 1 : -1;
      const rise = 38 * 4 * p * (1 - p); // an arc: up to 38 px at the middle of the flight
      ctx.globalAlpha = 1 - p;
      ctx.fillRect(snap(x + side * (10 + 6 * k) * p), bottomY - snap(rise) - PIXEL, PIXEL, PIXEL);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Add the glow of one stream to a Lighting instance: a light every 140 px
   * along the stream and a bigger one at its foot.
   * @param {{addLight: function(string, number, number, number, number): void}} lighting
   * @param {{x:number, y:number}} camera top-left of the view, to convert to screen px
   * @param {number} clock time in seconds (visual only)
   * @param {number} x world x of the middle of the stream
   * @param {number} topY world y of the top of the stream
   * @param {number} bottomY world y of the foot of the stream
   * @param {number} falls how much lava flows, 0 to 1
   */
  addLights(lighting, camera, clock, x, topY, bottomY, falls) {
    if (falls <= 0 || bottomY <= topY) return;
    const flicker = 0.85 + 0.15 * Math.sin(clock * 5 + x * 0.02);
    for (let y = topY + LIGHT_SPACING / 2; y < bottomY; y += LIGHT_SPACING) {
      lighting.addLight('lava', x - camera.x, y - camera.y, LIGHT_RADIUS, 0.7 * falls * flicker);
    }
    lighting.addLight('lava', x - camera.x, bottomY - 12 - camera.y, BASE_LIGHT_RADIUS, falls * flicker);
  }
}