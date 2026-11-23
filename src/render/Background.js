// src/render/Background.js
// Sunset sky and sun, drawn behind the world.

/**
 * Sky colors from the top of the screen (0) to the bottom (1).
 * The warm glow sits on the horizon; below it a dark haze stands for the
 * far ground, which is what you see through pits. Edit this table to change
 * the mood (night, cave, forest).
 */
export const SKY_STOPS = [
  [0.0, '#0d1024'],
  [0.3, '#1a1f45'],
  [0.55, '#36305f'],
  [0.7, '#5d4478'],
  [0.75, '#8a5a7a'], // horizon glow: a muted rose, so the terrain stands out
  [0.8, '#5f4872'], // mist below the horizon: shows through pits, still coloured
  [1.0, '#2e2548'], // deep mist at the bottom: dark, but not black
];

/**
 * Where the sky meets the far ground, as a fraction of the view height.
 * 0.75 of 640 px is y = 480, level with the ground surface of level1.
 */
const HORIZON = 0.75;

/** The sun: position as a fraction of the view, glow radius in px, camera drift. */
const SUN = { x: 0.72, y: 0.34, radius: 170, drift: 0.02 };

/** Sun colors from its center (0) to the edge of its glow (1): bright disc, then fading halo. */
const SUN_STOPS = [
  [0.0, '#f6e6c4'],
  [0.13, '#ecd2a8'],
  [0.15, 'rgba(240, 190, 140, 0.35)'],
  [0.45, 'rgba(220, 150, 130, 0.10)'],
  [1.0, 'rgba(200, 120, 120, 0)'],
];

/**
 * Ready-made moods. A theme has the sky color stops and a sun
 * (or null for no sun, as in the cave).
 */
export const THEMES = {
  sunset: { stops: SKY_STOPS, sun: SUN, mist: true, dark: false },
  // Almost black, with a faint red glow near the bottom, as if lava were about to rise.
  cave: {
    stops: [
      [0.0, '#06030b'],
      [0.45, '#100717'],
      [0.75, '#1f0c18'],
      [1.0, '#3a1015'],
    ],
    sun: null,
    mist: false, // no pink horizon haze in the dark cave
    dark: true, // lit by colored lights only (see Lighting.js)
  },
};

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
   * @param {{stops: Array<[number, string]>, sun: (object|null)}} [theme] sky colors and sun; defaults to the sunset
   */
  constructor(ctx, viewHeight, theme = THEMES.sunset) {
    this.sun = theme.sun;

    this.sky = ctx.createLinearGradient(0, 0, 0, viewHeight);
    for (const [offset, color] of theme.stops) this.sky.addColorStop(offset, color);

    // Centered on (0, 0); draw() moves the origin to the sun position. Themes without a sun skip it.
    this.sunGlow = null;
    if (this.sun !== null) {
      this.sunGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.sun.radius);
      for (const [offset, color] of SUN_STOPS) this.sunGlow.addColorStop(offset, color);
    }
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

    const sun = this.sun;
    if (sun === null) return; // a theme without a sun, for example the cave

    // The sun is very far away, so it drifts only slightly when the camera moves.
    // Not rounded on purpose: the sun is a soft glow, so sub-pixel positions look smooth.
    const sunX = w * sun.x - camera.x * sun.drift;
    const sunY = h * sun.y;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h * HORIZON); // nothing of the sun below the horizon
    ctx.clip();
    ctx.translate(sunX, sunY);
    ctx.fillStyle = this.sunGlow;
    ctx.fillRect(-sun.radius, -sun.radius, sun.radius * 2, sun.radius * 2);
    ctx.restore();
  }
}