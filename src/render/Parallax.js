// src/render/Parallax.js
// Distant mountain layers that scroll slower than the world, for depth.

/**
 * Mountain layers, farthest first.
 *   factor : how much of the camera movement the layer follows (0.1 = very far)
 *   base   : height of the valleys, as a fraction of the view height
 *   amp    : how much higher than the valleys the peaks reach, in px
 *   octaves: [cycles across the tile, weight] pairs; more cycles = finer detail
 *   seed   : random phases, so every layer has its own silhouette
 * Colors fade toward the sky haze with distance, and all of them are close
 * to the sky, so the background never competes with the terrain for attention.
 * Layers are filled down to the bottom of the view, so pits show the depth.
 */
export const LAYERS = [
  { factor: 0.1, base: 0.7, amp: 150, color: '#6a4f80', octaves: [[3, 1], [7, 0.45], [19, 0.2]], seed: 11 },
  { factor: 0.25, base: 0.76, amp: 130, color: '#4f3d72', octaves: [[4, 1], [9, 0.5], [23, 0.22]], seed: 23 },
  { factor: 0.45, base: 0.82, amp: 100, color: '#3b2f5c', octaves: [[5, 1], [11, 0.5], [29, 0.25]], seed: 37 },
];


/**
 * Cave layers, farthest first. `hang: true` makes the silhouette hang from the
 * top of the view (stalactites) instead of rising from the bottom: `base` is
 * then how deep the ceiling reaches at its shortest, `amp` how much longer the
 * tips go (as fractions and pixels like the other layers).
 */
export const CAVE_LAYERS = [
  { factor: 0.1, base: 0.62, amp: 140, color: '#2b1422', octaves: [[3, 1], [8, 0.5], [17, 0.2]], seed: 5 },
  { factor: 0.25, base: 0.1, amp: 170, color: '#1a0d19', hang: true, octaves: [[4, 1], [11, 0.45], [26, 0.2]], seed: 17 },
  { factor: 0.45, base: 0.04, amp: 210, color: '#0e060f', hang: true, octaves: [[5, 1], [13, 0.4], [31, 0.2]], seed: 29 },
];

/** Layer sets by theme name, matching the themes of Background.js. */
export const LAYER_SETS = { sunset: LAYERS, cave: CAVE_LAYERS };

const TILE_WIDTH = 2048; // px, wider than the widest view (1600) so two copies always cover it
const PIXEL = 4; // px, silhouettes are drawn in chunky 4 px blocks like the rest of the art

/** Small seeded random generator (mulberry32): the same seed always gives the same mountains. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ridge heights across one tile, each in [0, 1] (1 = highest peak).
 * Every octave is 1 - |sin| with a whole number of cycles, so the profile
 * repeats exactly at the tile edge and the tiles join without a seam.
 * @param {number} count number of samples across the tile
 * @param {Array<[number, number]>} octaves [cycles, weight] pairs
 * @param {number} seed seed for the random phases
 * @returns {Float32Array}
 */
export function ridgeProfile(count, octaves, seed) {
  const random = mulberry32(seed);
  const phases = octaves.map(() => random() * Math.PI);
  let totalWeight = 0;
  for (const [, weight] of octaves) totalWeight += weight;

  const profile = new Float32Array(count);
  for (let j = 0; j < count; j++) {
    let sum = 0;
    for (let i = 0; i < octaves.length; i++) {
      const [cycles, weight] = octaves[i];
      sum += weight * (1 - Math.abs(Math.sin((Math.PI * cycles * j) / count + phases[i])));
    }
    profile[j] = sum / totalWeight;
  }
  return profile;
}

/** Default way to make an offscreen canvas in the browser. */
function createBrowserCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Parallax mountains. Each layer is painted once into an offscreen canvas and
 * afterwards only copied, shifted by a fraction of the camera position.
 *
 * Complexity: construction O(layers * tile width / 4), once; draw() is
 * O(layers) copies per frame and allocates nothing. Memory is about 5 MB per
 * layer (2048 x 640 x 4 bytes), allocated once.
 */
export class Parallax {
  /**
   * @param {number} viewHeight visible height in px (fixed)
   * @param {typeof LAYERS} [layers] layer definitions
   * @param {function(number, number): *} [createCanvas] makes an offscreen canvas (width, height)
   */
  constructor(viewHeight, layers = LAYERS, createCanvas = createBrowserCanvas) {
    this.tileWidth = TILE_WIDTH;
    this.layers = [];

    const samples = TILE_WIDTH / PIXEL;
    for (const def of layers) {
      const canvas = createCanvas(TILE_WIDTH, viewHeight);
      const g = canvas.getContext('2d');
      g.fillStyle = def.color;

      const profile = ridgeProfile(samples, def.octaves, def.seed);
      for (let j = 0; j < samples; j++) {
        if (def.hang) {
          // Stalactites: the column is filled from the top of the view down to a tip.
          const bottom = Math.round((def.base * viewHeight + def.amp * profile[j]) / PIXEL) * PIXEL;
          g.fillRect(j * PIXEL, 0, PIXEL, bottom);
        } else {
          // Top of this column in whole blocks; the column is filled down to the bottom.
          const top = Math.round((def.base * viewHeight - def.amp * profile[j]) / PIXEL) * PIXEL;
          g.fillRect(j * PIXEL, top, PIXEL, viewHeight - top);
        }
      }
      this.layers.push({ canvas, factor: def.factor });
    }
  }

  /**
   * Draw every layer in screen space, farthest first. Call after the sky and
   * before the world.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number, viewWidth:number}} camera
   */
  draw(ctx, camera) {
    const w = this.tileWidth;
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      // Whole pixels, and a positive remainder (the camera x can be negative on small maps).
      const shift = ((Math.round(camera.x * layer.factor) % w) + w) % w;
      const x0 = -shift;
      ctx.drawImage(layer.canvas, x0, 0);
      if (x0 + w < camera.viewWidth) ctx.drawImage(layer.canvas, x0 + w, 0); // second copy to cover the right side
    }
  }
}