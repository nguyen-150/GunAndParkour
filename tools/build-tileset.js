// tools/build-tileset.js
// Builds the game tileset from the Gemini sheet. Run: node tools/build-tileset.js
//
// Input : assets/source/tileset1.png, a 2x2 grid on a flat magenta background:
//         top-left grass, top-right spikes, bottom-left dirt, bottom-right abyss.
// Output: assets/tilesets/tiles.png (64x64, 2x2 tiles of 32 px)
//         tile ids (gid): 1 grass, 2 dirt, 3 spikes, 4 abyss
//         assets/source/tileset-preview.png (each tile repeated 4x to check seams)
// Uses only Node built-ins (zlib, fs).

import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const TILE = 32; // px, must match CONFIG.tileSize
const INSET = 2; // px cut off each cropped edge to drop blurry magenta fringes
const PREVIEW_SCALE = 3;
const PREVIEW_REPEAT = 4;
const PREVIEW_BG = [28, 31, 43]; // same as the game's background

// Usage: node tools/build-tileset.js [source file in assets/source] [output name]
//   ground tiles (default): node tools/build-tileset.js tileset1.png tiles
//   cave tiles:             node tools/build-tileset.js cave-tileset1.png cave-tiles
const [sourceName = 'tileset1.png', outName = 'tiles'] = process.argv.slice(2);
const OUT_TILES_NAME = `assets/tilesets/${outName}.png`;
const OUT_PREVIEW_NAME = `assets/source/${outName === 'tiles' ? 'tileset' : outName}-preview.png`;
const SOURCE = new URL(`../assets/source/${sourceName}`, import.meta.url);
const OUT_TILES = new URL(`../${OUT_TILES_NAME}`, import.meta.url);
const OUT_PREVIEW = new URL(`../${OUT_PREVIEW_NAME}`, import.meta.url);

// col/row: quadrant in the source sheet. slot: place in tiles.png (= gid - 1).
const TILES = [
  { name: 'grass', col: 0, row: 0, slot: 0, solid: true },
  { name: 'dirt', col: 0, row: 1, slot: 1, solid: true },
  { name: 'spikes', col: 1, row: 0, slot: 2, solid: false },
  { name: 'abyss', col: 1, row: 1, slot: 3, solid: true },
];

// ---------- PNG reading ----------

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG into { width, height, data (RGBA) }. */
function decodePng(buf) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== signature[i]) {
      throw new Error('Not a PNG file. If it is a JPEG or WebP, export it again as PNG.');
    }
  }

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length; // length + type + data + crc
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(
      `Unsupported PNG (bit depth ${bitDepth}, color type ${colorType}, interlace ${interlace}). ` +
        'Re-export as a normal 8-bit RGB/RGBA PNG without interlacing.'
    );
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(width * height * 4);

  let prevRow = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const base = y * (stride + 1) + 1;
    const row = new Uint8Array(stride);

    // Undo the per-row filter (None, Sub, Up, Average, Paeth).
    for (let i = 0; i < stride; i++) {
      const x = raw[base + i];
      const a = i >= channels ? row[i - channels] : 0; // left
      const b = prevRow[i]; // up
      const c = i >= channels ? prevRow[i - channels] : 0; // up-left
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Unknown PNG filter type ${filter}`);
      }
      row[i] = v & 255;
    }

    for (let px = 0; px < width; px++) {
      const o = (y * width + px) * 4;
      rgba[o] = row[px * channels];
      rgba[o + 1] = row[px * channels + 1];
      rgba[o + 2] = row[px * channels + 2];
      rgba[o + 3] = channels === 4 ? row[px * channels + 3] : 255;
    }
    prevRow = row;
  }
  return { width, height, data: rgba };
}

// ---------- PNG writing ----------

/** Build one PNG chunk: length, type, data, CRC32 of (type + data). */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode RGBA pixels as a PNG file. */
function encodePng(width, height, rgba) {
  const rowSize = width * 4 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // filter type 0 = none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * rowSize + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Image processing ----------

/** True if the pixel at byte offset i is the magenta background (or transparent). */
function isBackground(data, i) {
  if (data[i + 3] < 128) return true;
  const m = Math.min(data[i], data[i + 2]); // magenta = strong red and blue, weak green
  return m > 100 && data[i + 1] < 0.55 * m;
}

/** Bounding box of all non-background pixels inside a rectangle of the image. */
function findBounds(img, x0, y0, x1, y1) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (isBackground(img.data, (y * img.width + x) * 4)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/**
 * Square region to cut for one tile. The width of the content decides the size
 * (tiles are square). Solid tiles are measured from their top edge; spikes
 * stand on the bottom edge and have empty space above, so they are measured
 * from the bottom.
 */
function cropRect(img, tile) {
  const qw = Math.floor(img.width / 2);
  const qh = Math.floor(img.height / 2);
  const x0 = tile.col * qw;
  const y0 = tile.row * qh;
  const b = findBounds(img, x0, y0, x0 + qw, y0 + qh);
  if (b === null) throw new Error(`${tile.name}: nothing found in its quadrant`);

  const size = b.maxX - b.minX + 1 - 2 * INSET;
  const x = b.minX + INSET;
  const y = tile.solid ? b.minY + INSET : b.maxY + 1 - INSET - size;
  return { x, y, w: size, h: size };
}

/**
 * Shrink a square region to TILE x TILE by averaging colors, counting only
 * non-background pixels, so edges get no pink fringe. A target pixel is
 * opaque when at least half of its source pixels are not background.
 */
function resample(img, rect) {
  const out = new Uint8Array(TILE * TILE * 4);
  for (let ty = 0; ty < TILE; ty++) {
    const sy0 = Math.floor(rect.y + (ty * rect.h) / TILE);
    const sy1 = Math.max(sy0 + 1, Math.floor(rect.y + ((ty + 1) * rect.h) / TILE));
    for (let tx = 0; tx < TILE; tx++) {
      const sx0 = Math.floor(rect.x + (tx * rect.w) / TILE);
      const sx1 = Math.max(sx0 + 1, Math.floor(rect.x + ((tx + 1) * rect.w) / TILE));

      let r = 0;
      let g = 0;
      let b = 0;
      let opaque = 0;
      let total = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * img.width + sx) * 4;
          total++;
          if (isBackground(img.data, i)) continue;
          opaque++;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
        }
      }

      if (opaque * 2 >= total) {
        const o = (ty * TILE + tx) * 4;
        out[o] = Math.round(r / opaque);
        out[o + 1] = Math.round(g / opaque);
        out[o + 2] = Math.round(b / opaque);
        out[o + 3] = 255;
      }
    }
  }
  return out;
}

/** Average color difference between two pixel columns of a tile. */
function columnDiff(px, xa, xb) {
  let sum = 0;
  for (let y = 0; y < TILE; y++) {
    const a = (y * TILE + xa) * 4;
    const b = (y * TILE + xb) * 4;
    sum += Math.abs(px[a] - px[b]) + Math.abs(px[a + 1] - px[b + 1]) + Math.abs(px[a + 2] - px[b + 2]);
  }
  return sum / (TILE * 3);
}

/** Count the opaque pixels of a tile. */
function countOpaque(px) {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] === 255) n++;
  return n;
}

// ---------- Main ----------

const img = decodePng(readFileSync(SOURCE));
console.log(`Source: ${img.width}x${img.height}`);

const sheet = new Uint8Array(2 * TILE * 2 * TILE * 4); // 64x64, 2x2 tiles
const tilePixels = [];

for (const tile of TILES) {
  const rect = cropRect(img, tile);
  const px = resample(img, rect);
  tilePixels[tile.slot] = px;

  // Copy the tile into its slot of the sheet.
  const sx = (tile.slot % 2) * TILE;
  const sy = Math.floor(tile.slot / 2) * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const s = (y * TILE + x) * 4;
      sheet.set(px.subarray(s, s + 4), ((sy + y) * 2 * TILE + sx + x) * 4);
    }
  }
  console.log(
    `${tile.name.padEnd(7)} crop ${rect.w}x${rect.h} at (${rect.x}, ${rect.y}), ` +
      `opaque pixels: ${countOpaque(px)} of ${TILE * TILE}`
  );
}

// Seam check: left edge against right edge of each solid tile, compared with
// how different two neighbouring columns normally are inside the same tile.
for (const tile of TILES) {
  if (!tile.solid) continue;
  const px = tilePixels[tile.slot];
  let inner = 0;
  for (let x = 0; x < TILE - 1; x++) inner += columnDiff(px, x, x + 1);
  inner /= TILE - 1;
  const seam = columnDiff(px, TILE - 1, 0);
  const verdict = seam <= 2 * Math.max(inner, 1) ? 'ok' : 'CHECK the preview image';
  console.log(`seam ${tile.name.padEnd(5)} ${seam.toFixed(1)} (inside ${inner.toFixed(1)}): ${verdict}`);
}

mkdirSync(new URL('../assets/tilesets/', import.meta.url), { recursive: true });
writeFileSync(OUT_TILES, encodePng(2 * TILE, 2 * TILE, sheet));
console.log(`Wrote ${OUT_TILES_NAME} (${2 * TILE}x${2 * TILE})`);

// Preview: one row per tile, each tile repeated side by side, scaled up.
const pw = TILE * PREVIEW_REPEAT * PREVIEW_SCALE;
const ph = TILE * TILES.length * PREVIEW_SCALE;
const preview = new Uint8Array(pw * ph * 4);
for (const tile of TILES) {
  const px = tilePixels[tile.slot];
  for (let y = 0; y < TILE * PREVIEW_SCALE; y++) {
    for (let x = 0; x < pw; x++) {
      const tx = Math.floor(x / PREVIEW_SCALE) % TILE;
      const ty = Math.floor(y / PREVIEW_SCALE);
      const s = (ty * TILE + tx) * 4;
      const d = ((tile.slot * TILE * PREVIEW_SCALE + y) * pw + x) * 4;
      const solid = px[s + 3] === 255;
      preview[d] = solid ? px[s] : PREVIEW_BG[0];
      preview[d + 1] = solid ? px[s + 1] : PREVIEW_BG[1];
      preview[d + 2] = solid ? px[s + 2] : PREVIEW_BG[2];
      preview[d + 3] = 255;
    }
  }
}
writeFileSync(OUT_PREVIEW, encodePng(pw, ph, preview));
console.log(`Wrote ${OUT_PREVIEW_NAME} (${pw}x${ph})`);