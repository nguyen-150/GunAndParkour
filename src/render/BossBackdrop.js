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

/** Radius of the small bright pupil that moves inside each socket, in px. */
const PUPIL_RADIUS = 18;
/** Opacity of the wide halo, relative to the pupil. */
const HALO_ALPHA = 0.55;
/** The pupils move up to this many px inside the sockets to look at the player... */
const MAX_LOOK = 7;
/** ...reaching the full offset when the player is at least this far away, in px. */
const LOOK_RANGE = 160;

// Idle motion (visual only).
const BREATH = 0.012; // the figure grows by this fraction at the top of a breath
const BREATH_SPEED = 1.7; // rad/s
const SWAY = 0.006; // rad, how far the whole figure leans to each side
const SWAY_SPEED = 0.9; // rad/s
const ROAR_PULSE = 0.03; // extra growth at the peak of a roar
const ROAR_SHAKE = 3; // px of horizontal shake during a roar

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
   * World position of an eye socket (ignores the small breathing and swaying).
   * @param {number} index 0 = left, 1 = right
   * @param {number} centerX world x of the middle of the skeleton
   * @param {number} bottomY world y of the bottom edge of the sprite
   * @param {{x:number, y:number}} out reused result, so nothing is allocated
   * @returns {{x:number, y:number}} out
   */
  eyePosition(index, centerX, bottomY, out) {
    out.x = centerX + EYES[index].x;
    out.y = bottomY - this.height + EYES[index].y;
    return out;
  }

  /**
   * Brightness of the eyes, 0 to 1: the eye level with a flicker. Used by the
   * drawing and by the lighting, so both flicker together.
   * @param {number} clock time in seconds (visual only)
   * @param {number} eyeLevel 0 = dark, 1 = lit
   */
  eyeBrightness(clock, eyeLevel) {
    // Two sines of different speed: the light never flickers in a visible rhythm.
    const flicker = 0.86 + 0.1 * Math.sin(clock * 11) + 0.04 * Math.sin(clock * 29 + 1.3);
    return Math.min(1, eyeLevel * flicker);
  }

  /**
   * Draw the skeleton in world space, breathing and swaying, with eyes that follow a target.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} centerX world x of the middle of the skeleton
   * @param {number} bottomY world y of the bottom edge of the sprite
   * @param {{clock:number, eyeLevel:number, jawOpen:boolean, roar:number, targetX:(number|null), targetY:number}} pose
   *   clock = time in seconds (visual only); eyeLevel = 0 dark to 1 lit; jawOpen = roar frame;
   *   roar = 0 to 1 pulse and shake; targetX/targetY = world point the eyes look at (targetX null = straight ahead).
   *   Pass the same object every frame: nothing is allocated here.
   */
  draw(ctx, centerX, bottomY, pose) {
    const { clock, eyeLevel, jawOpen, roar, targetX, targetY } = pose;

    // Idle motion: a slow breath and sway; a roar adds a pulse and a shake.
    const breath = 1 + BREATH * Math.sin(clock * BREATH_SPEED);
    const sway = SWAY * Math.sin(clock * SWAY_SPEED);
    const shake = Math.round(Math.sin(clock * 60) * ROAR_SHAKE * roar);

    ctx.save();
    // Soft art: smooth scaling avoids shimmering lines while the figure breathes
    // (the flag is part of the saved state, so the pixel art drawn later is not affected).
    ctx.imageSmoothingEnabled = true;
    ctx.translate(Math.round(centerX) + shake, Math.round(bottomY)); // origin at the bottom middle
    ctx.rotate(sway);
    ctx.scale(1 + ROAR_PULSE * roar, breath + ROAR_PULSE * roar);
    ctx.drawImage(
      this.strip,
      jawOpen ? this.frameW : 0, 0, this.frameW, this.height,
      -Math.round(this.frameW / 2), -this.height, this.frameW, this.height
    );

    if (eyeLevel > 0) {
      // Where the pupils sit: toward the target, at most MAX_LOOK px from the middle of the socket.
      let lookX = 0;
      let lookY = 0;
      if (targetX !== null) {
        const eyeY = bottomY - this.height + EYES[0].y; // both sockets are at the same height
        const dx = targetX - (centerX + (EYES[0].x + EYES[1].x) / 2);
        const dy = targetY - eyeY;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          const k = (Math.min(1, dist / LOOK_RANGE) * MAX_LOOK) / dist;
          lookX = dx * k;
          lookY = dy * k;
        }
      }

      const alpha = this.eyeBrightness(clock, eyeLevel);
      
      ctx.globalCompositeOperation = 'lighter'; // add light instead of painting over the bones
      ctx.fillStyle = this.glow;

      // Wide halos stay in the middle of the sockets...
      ctx.globalAlpha = alpha * HALO_ALPHA;
      for (let i = 0; i < EYES.length; i++) {
        ctx.save();
        ctx.translate(EYES[i].x, -this.height + EYES[i].y);
        ctx.scale(GLOW_RADIUS, GLOW_RADIUS);
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
      // ...and the small bright pupils move to look at the target.
      ctx.globalAlpha = alpha;
      for (let i = 0; i < EYES.length; i++) {
        ctx.save();
        ctx.translate(EYES[i].x + lookX, -this.height + EYES[i].y + lookY);
        ctx.scale(PUPIL_RADIUS, PUPIL_RADIUS);
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}