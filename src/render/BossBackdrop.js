// src/render/BossBackdrop.js
// The giant skeleton boss in the background of the cave: head and shoulders, with glowing eyes.

/**
 * Eye sockets: x is measured from the middle of the sprite and y from its
 * top edge, in px, for the strip built by `build-anim.js` with --height=470.
 * These are estimates read from the artwork; adjust them until the glow sits
 * exactly in the sockets.
 */
const EYES = [
  { x: -50, y: 150 }, // left socket
  { x: 40, y: 150 }, // right socket
];

/** Radius of the glow around each eye, in px. */
const GLOW_RADIUS = 46;

/** Eye glow colors from the center (0) to the edge (1) of the halo. */
const GLOW_STOPS = [
  [0.0, 'rgba(255, 235, 210, 1)'],
  [0.1, 'rgba(255, 110, 70, 0.95)'],
  [0.32, 'rgba(230, 40, 25, 0.5)'],
  [1.0, 'rgba(170, 10, 10, 0)'],
];

/**
 * The boss body, drawn behind the terrain. The strip has two frames side by
 * side: 0 = jaw closed, 1 = jaw open (the roar). The sockets in the artwork
 * are dark; the red glow is drawn here, so it can flicker, fade in and flare up.
 *
 * The glow gradient is built once at unit size and scaled when drawing, so a
 * frame allocates nothing. Complexity: draw() is O(number of eyes) = O(2);
 * memory O(1).
 */
export class BossBackdrop {
  /**
   * @param {CanvasRenderingContext2D} ctx used to create the glow gradient once
   * @param {{width:number, height:number}} strip picture with 2 frames side by side
   */
  constructor(ctx, strip) {
    this.strip = strip;
    this.frameW = Math.floor(strip.width / 2);
    this.height = strip.height;

    // Radius 1 around the origin; draw() scales it to GLOW_RADIUS.
    this.glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [offset, color] of GLOW_STOPS) this.glow.addColorStop(offset, color);
  }

  /**
   * Draw the skeleton in world space.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} centerX world x of the middle of the skeleton
   * @param {number} bottomY world y of the bottom edge of the sprite
   * @param {number} clock time in seconds, only for the flicker (visual only)
   * @param {number} [eyeLevel] 0 = eyes dark, 1 = fully lit
   * @param {boolean} [jawOpen] true for the roar frame
   */
  draw(ctx, centerX, bottomY, clock, eyeLevel = 1, jawOpen = false) {
    // Whole pixels only, so the pixel art stays crisp.
    const left = Math.round(centerX - this.frameW / 2);
    const top = Math.round(bottomY - this.height);
    ctx.drawImage(
      this.strip,
      jawOpen ? this.frameW : 0, 0, this.frameW, this.height,
      left, top, this.frameW, this.height
    );

    if (eyeLevel <= 0) return;

    // Two sines of different speed: the light never flickers in a visible rhythm.
    const flicker = 0.86 + 0.1 * Math.sin(clock * 11) + 0.04 * Math.sin(clock * 29 + 1.3);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // add light instead of painting over the bones
    ctx.globalAlpha = Math.min(1, eyeLevel * flicker);
    ctx.fillStyle = this.glow;
    for (let i = 0; i < EYES.length; i++) {
      ctx.save();
      ctx.translate(Math.round(centerX) + EYES[i].x, top + EYES[i].y);
      ctx.scale(GLOW_RADIUS, GLOW_RADIUS); // the unit gradient becomes the real halo
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    ctx.restore();
  }
}