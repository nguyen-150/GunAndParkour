// src/render/Atmosphere.js
// Ground mist and a vignette, for depth and focus.

/** Same horizon as Background.js: the sky meets the far ground at 75% of the view height. */
const HORIZON = 0.75;

/** Mist band: its height in px, how far above the horizon it starts, color (r, g, b) and peak opacity. */
const MIST = { height: 220, above: 110, color: '150, 105, 150', alpha: 0.28 };

/**
 * Vignette: color (r, g, b), the fraction of the radius that stays fully clear,
 * the opacity at the very edge, and how much the ellipse is stretched past the
 * screen (1.25 puts the middle of each edge at 80% of the radius, the corners beyond it).
 */
const VIGNETTE = { color: '10, 6, 20', clearUntil: 0.62, alpha: 0.5, stretch: 1.25 };

/**
 * Atmospheric overlays. Both gradients are built once at unit size and then
 * stretched with canvas transforms when drawing, so nothing is allocated per
 * frame and resizing the window needs no rebuild.
 *
 * Complexity: each draw method is O(1) (one fill); memory O(1).
 */
export class Atmosphere {
  /** @param {CanvasRenderingContext2D} ctx context the gradients are created on */
  constructor(ctx) {
    // Vertical gradient from y = 0 to y = 1: clear, hazy in the middle, clear.
    this.mist = ctx.createLinearGradient(0, 0, 0, 1);
    this.mist.addColorStop(0, `rgba(${MIST.color}, 0)`);
    this.mist.addColorStop(0.5, `rgba(${MIST.color}, ${MIST.alpha})`);
    this.mist.addColorStop(1, `rgba(${MIST.color}, 0)`);

    // Radial gradient of radius 1 around the origin: clear in the middle, dark at the edge.
    this.vignette = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    this.vignette.addColorStop(0, `rgba(${VIGNETTE.color}, 0)`);
    this.vignette.addColorStop(VIGNETTE.clearUntil, `rgba(${VIGNETTE.color}, 0)`);
    this.vignette.addColorStop(1, `rgba(${VIGNETTE.color}, ${VIGNETTE.alpha})`);
  }

  /**
   * Haze at the horizon. Draw after the mountains and before the world, so it
   * melts the foot of the mountains and shows through pits.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{viewWidth:number, viewHeight:number}} camera
   */
  drawMist(ctx, camera) {
    const top = Math.round(camera.viewHeight * HORIZON - MIST.above);
    ctx.save();
    ctx.translate(0, top);
    ctx.scale(1, MIST.height); // the unit-high gradient becomes MIST.height px tall
    ctx.fillStyle = this.mist;
    ctx.fillRect(0, 0, camera.viewWidth, 1);
    ctx.restore();
  }

  /**
   * Darken the edges and corners of the screen. Draw after the world and
   * before the HUD, so the text stays readable.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{viewWidth:number, viewHeight:number}} camera
   */
  drawVignette(ctx, camera) {
    const k = VIGNETTE.stretch;
    ctx.save();
    ctx.translate(camera.viewWidth / 2, camera.viewHeight / 2);
    // The unit circle becomes an ellipse that follows the screen's aspect ratio.
    ctx.scale((camera.viewWidth / 2) * k, (camera.viewHeight / 2) * k);
    ctx.fillStyle = this.vignette;
    ctx.fillRect(-1, -1, 2, 2); // more than the screen; the canvas clips the rest
    ctx.restore();
  }
}