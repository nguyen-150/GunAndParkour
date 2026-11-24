// src/render/Lighting.js
// Darkness with colored lights: a light map that is multiplied over the scene.

/** Light of the cave when no source shines: a very dark purple (r, g, b). */
const DEFAULT_AMBIENT = '14, 8, 20';

/** Colors (r, g, b) of the kinds of light in the game. Each kind gets one gradient, built once. */
export const LIGHT_COLORS = {
  eye: '255, 70, 45', // the skeleton's eyes
  lava: '255, 130, 50', // the glow of lava
  warm: '255, 232, 200', // a small light around the player
};

/** Falloff of every light: [position from the center (0) to the edge (1), opacity]. Smooth, so there is no visible ring. */
const FALLOFF = [
  [0, 1],
  [0.3, 0.6],
  [0.65, 0.2],
  [1, 0],
];

/** Default way to make an offscreen canvas in the browser. */
function createBrowserCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Lighting with a light map: an offscreen picture filled with a dark ambient
 * color, to which every light adds a colored glow. The finished map is then
 * multiplied over the scene: where it is bright the scene keeps its colors,
 * where it is dark the scene goes dark, and colored light tints what it hits.
 *
 * Per frame: begin() -> addLight() for each source -> end() after the world is drawn.
 *
 * The offscreen canvas is made once (and resized only when the view changes);
 * each kind of light has one unit-size gradient, built once and scaled when
 * drawing, so a frame allocates nothing.
 *
 * Complexity per frame: O(W * H) for the ambient fill and the final copy, plus
 * O(1) work and the area of its glow for each light. Memory O(W * H).
 */
export class Lighting {
  /**
   * @param {function(number, number): *} [createCanvas] makes an offscreen canvas (width, height)
   * @param {string} [ambient] "r, g, b" of the light that is always there
   * @param {Object<string, string>} [colors] kinds of light, each as "r, g, b"
   */
  constructor(createCanvas = createBrowserCanvas, ambient = DEFAULT_AMBIENT, colors = LIGHT_COLORS) {
    this.createCanvas = createCanvas;
    this.ambientFill = `rgb(${ambient})`;
    this.colors = colors;
    this.canvas = null;
    this.g = null;
    this.gradients = {};
    this.width = 0;
    this.height = 0;
  }

  /**
   * Start a frame: reset the light map to the ambient color.
   * @param {number} width visible width in px
   * @param {number} height visible height in px
   * @param {number} [ambientLevel] how much of the ambient light is on: 1 = as usual (default),
   *   0 = complete darkness (only the lights you add will show). It is blended over black with
   *   an opacity, so fading it creates no color strings.
   */
  begin(width, height, ambientLevel = 1) {
      if (this.canvas === null) {
      this.canvas = this.createCanvas(width, height);
      this.g = this.canvas.getContext('2d');
      // One unit gradient per kind of light, built once.
      for (const kind of Object.keys(this.colors)) {
        const gradient = this.g.createRadialGradient(0, 0, 0, 0, 0, 1);
        for (const [offset, alpha] of FALLOFF) {
          gradient.addColorStop(offset, `rgba(${this.colors[kind]}, ${alpha})`);
        }
        this.gradients[kind] = gradient;
      }
    } else if (width !== this.width || height !== this.height) {
      this.canvas.width = width; // resizing clears the canvas; the gradients stay valid
      this.canvas.height = height;
    }
    this.width = width;
    this.height = height;

    const g = this.g;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = '#000000';
    g.fillRect(0, 0, width, height); // opaque black: the previous frame is fully replaced
    if (ambientLevel > 0) {
      g.globalAlpha = Math.min(1, ambientLevel); // the ambient color over black, at this opacity
      g.fillStyle = this.ambientFill;
      g.fillRect(0, 0, width, height);
      g.globalAlpha = 1;
    }
  }

  /**
   * Add a light to the map. Lights add up where they overlap.
   * @param {string} kind a key of the colors table: 'eye', 'lava' or 'warm'
   * @param {number} x center in screen px (world x minus camera x)
   * @param {number} y center in screen px (world y minus camera y)
   * @param {number} radius radius of the glow in px
   * @param {number} intensity 0 (no light) to 1 (full)
   * @throws {Error} for an unknown kind
   */
  addLight(kind, x, y, radius, intensity) {
    if (intensity <= 0 || radius <= 0) return;
    const gradient = this.gradients[kind];
    if (gradient === undefined) throw new Error(`Lighting: unknown light "${kind}"`);

    const g = this.g;
    g.globalCompositeOperation = 'lighter'; // add light
    g.globalAlpha = Math.min(1, intensity);
    g.save();
    g.translate(x, y);
    g.scale(radius, radius); // the unit gradient becomes the real glow
    g.fillStyle = gradient;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
  }

  /**
   * Finish the frame: multiply the light map over what is already drawn.
   * Draw it after the world and before the HUD, so the text stays readable.
   * @param {CanvasRenderingContext2D} ctx the main canvas
   * @param {number} [strength] 0 = no darkness at all, 1 = full; fades the effect without allocating
   */
  end(ctx, strength = 1) {
    if (this.canvas === null || strength <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = Math.min(1, strength);
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
  }
}