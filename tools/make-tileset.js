// tools/make-tileset.js
// Generates assets/tilesets/tiles.png, a placeholder tileset for Tiled.
// Run once with: node tools/make-tileset.js
// Uses only Node built-ins (zlib, fs). Tile 1 = grass-topped ground, tile 2 = dirt.

import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const TILE = 32; // px, must match CONFIG.tileSize
const COUNT = 2; // tiles side by side
const WIDTH = TILE * COUNT;
const HEIGHT = TILE;

const GRASS = [88, 165, 92];
const DIRT = [122, 90, 58];

/** Base color of one pixel inside a tile (tileIndex 0 = grass top, 1 = dirt). */
function baseColor(tileIndex, y) {
  if (tileIndex === 0 && y < 8) return GRASS;
  return DIRT;
}

// Raw image: every row starts with a filter byte (0 = none), then RGBA pixels.
const rowSize = WIDTH * 4 + 1;
const raw = Buffer.alloc(rowSize * HEIGHT);
for (let y = 0; y < HEIGHT; y++) {
  raw[y * rowSize] = 0;
  for (let x = 0; x < WIDTH; x++) {
    const tileIndex = Math.floor(x / TILE);
    const lx = x % TILE; // x inside the tile
    let [r, g, b] = baseColor(tileIndex, y);

    // Darken a 1 px border so tile edges are visible in the editor.
    const border = lx === 0 || lx === TILE - 1 || y === 0 || y === TILE - 1;
    if (border) {
      r = Math.round(r * 0.75);
      g = Math.round(g * 0.75);
      b = Math.round(b * 0.75);
    }

    const offset = y * rowSize + 1 + x * 4;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
    raw[offset + 3] = 255; // fully opaque
  }
}

/** Build one PNG chunk: length, type, data, CRC32 of (type + data). */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type 6 = RGBA
// bytes 10-12 (compression, filter, interlace) stay 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = new URL('../assets/tilesets/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('tiles.png', outDir), png);
console.log(`Wrote assets/tilesets/tiles.png (${WIDTH}x${HEIGHT}, ${COUNT} tiles, ${png.length} bytes)`);