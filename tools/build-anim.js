// tools/build-anim.js
// Builds the player's run animation strip from the Gemini run-cycle sheet.
// Run: node tools/build-anim.js
//
// Input : assets/source/run1.png, FRAMES poses in one row on a flat magenta background.
// Output: assets/sprites/player-run.png (FRAMES frames side by side)
//         assets/source/run-preview.png (enlarged, to inspect)
// Uses only Node built-ins (zlib, fs).
//
// All frames share ONE scale, ONE feet line and ONE horizontal anchor, so the
// body does not jump or breathe between frames.

import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('../assets/source/run8.png', import.meta.url);
const OUT_DIR = new URL('../assets/sprites/', import.meta.url);
const OUT_STRIP = new URL('../assets/sprites/player-run.png', import.meta.url);
const OUT_PREVIEW = new URL('../assets/source/run-preview.png', import.meta.url);

const SOURCE_COLS = 4; // poses per row in the source image
const SOURCE_ROWS = 2; // rows in the source image (read left to right, top to bottom)
const SOURCE_FRAMES = SOURCE_COLS * SOURCE_ROWS;
// Poses to use, in play order (0 = first pose of the first row).
const FRAME_ORDER = [0, 1, 2, 3, 4, 5, 6, 7];
const FRAMES = FRAME_ORDER.length; // frames in the output strip
const TARGET_HEIGHT = 40; // px, must match the height of player.png
const PREVIEW_SCALE = 6;
const PREVIEW_BG = [28, 31, 43]; // same as the game's background

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

/**
 * Measure the character inside one cell (columns x0 to x1): bounding box,
 * horizontal center of mass and pixel count. Returns null for an empty cell.
 */
function analyseCell(img, x0, x1) {
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  let sumX = 0;
  let count = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = x0; x < x1; x++) {
      if (isBackground(img.data, (y * img.width + x) * 4)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
      count++;
    }
  }
  if (count === 0) return null;
  return { minX, maxX, minY, maxY, centroidX: sumX / count, count };
}

/**
 * Shrink a region of the source to outW x outH by averaging colors, counting
 * only non-background pixels, so edges get no pink fringe. Source pixels
 * outside [clipX0, clipX1) or outside the image count as background, so
 * neighbouring frames never leak into this one.
 */
function resample(img, box, outW, outH, clipX0, clipX1) {
  const out = new Uint8Array(outW * outH * 4);
  for (let ty = 0; ty < outH; ty++) {
    const sy0 = Math.floor(box.y + (ty * box.h) / outH);
    const sy1 = Math.max(sy0 + 1, Math.floor(box.y + ((ty + 1) * box.h) / outH));
    for (let tx = 0; tx < outW; tx++) {
      const sx0 = Math.floor(box.x + (tx * box.w) / outW);
      const sx1 = Math.max(sx0 + 1, Math.floor(box.x + ((tx + 1) * box.w) / outW));

      let r = 0;
      let g = 0;
      let b = 0;
      let opaque = 0;
      let total = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          total++;
          if (sx < clipX0 || sx >= clipX1 || sy < 0 || sy >= img.height) continue;
          const i = (sy * img.width + sx) * 4;
          if (isBackground(img.data, i)) continue;
          opaque++;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
        }
      }

      if (opaque * 2 >= total) {
        const o = (ty * outW + tx) * 4;
        out[o] = Math.round(r / opaque);
        out[o + 1] = Math.round(g / opaque);
        out[o + 2] = Math.round(b / opaque);
        out[o + 3] = 255;
      }
    }
  }
  return out;
}

/** Count the opaque pixels of a frame. */
function countOpaque(px) {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] === 255) n++;
  return n;
}

/**
 * How different two frames are: 0 = identical, 1 = nothing in common.
 * Counts pixels that are opaque in either frame and differ in shape or color.
 */
function diffRatio(a, b) {
  let diff = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 4) {
    const oa = a[i + 3] === 255;
    const ob = b[i + 3] === 255;
    if (!oa && !ob) continue;
    union++;
    if (oa !== ob) {
      diff++;
    } else if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) {
      diff++;
    }
  }
  return union === 0 ? 0 : diff / union;
}

/** Draw a sprite enlarged by `scale` (nearest neighbour) into the preview buffer. */
function blit(dest, destW, src, srcW, srcH, ox, oy, scale) {
  for (let y = 0; y < srcH * scale; y++) {
    for (let x = 0; x < srcW * scale; x++) {
      const s = (Math.floor(y / scale) * srcW + Math.floor(x / scale)) * 4;
      if (src[s + 3] !== 255) continue;
      const d = ((oy + y) * destW + ox + x) * 4;
      dest[d] = src[s];
      dest[d + 1] = src[s + 1];
      dest[d + 2] = src[s + 2];
      dest[d + 3] = 255;
    }
  }
}

/**
 * Turn a sheet with several rows into one long row, so the rest of the tool
 * can treat it as a single strip. Cells are copied in reading order: all
 * cells of row 0 (left to right), then row 1, and so on.
 * @param {{width:number, height:number, data:Uint8Array}} img source sheet
 * @param {number} cols poses per row
 * @param {number} rows number of rows
 * @returns {{width:number, height:number, data:Uint8Array}}
 */
function flattenRows(img, cols, rows) {
  if (rows === 1) return img;
  const cellW = Math.floor(img.width / cols);
  const cellH = Math.floor(img.height / rows);
  const outW = cellW * cols * rows;
  const out = new Uint8Array(outW * cellH * 4);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const destX = (r * cols + c) * cellW;
      for (let y = 0; y < cellH; y++) {
        const src = ((r * cellH + y) * img.width + c * cellW) * 4;
        out.set(img.data.subarray(src, src + cellW * 4), (y * outW + destX) * 4);
      }
    }
  }
  return { width: outW, height: cellH, data: out };
}

// ---------- Main ----------

const img = flattenRows(decodePng(readFileSync(SOURCE)), SOURCE_COLS, SOURCE_ROWS);
const cellW = Math.floor(img.width / SOURCE_FRAMES);
console.log(`Source: ${img.width}x${img.height}, ${SOURCE_FRAMES} cells of ${cellW} px`);

// 1. Measure every frame inside its own equal-width cell.
const cells = [];
for (let i = 0; i < SOURCE_FRAMES; i++) {
const x0 = i * cellW;
  const x1 = x0 + cellW;
  const m = analyseCell(img, x0, x1);
  if (m === null) throw new Error(`Frame ${i + 1}: nothing found in its cell`);
  if (m.minX - x0 < 2 || x1 - 1 - m.maxX < 2) {
    console.warn(`WARNING frame ${i + 1} touches the edge of its cell: frames may overlap, or FRAMES is wrong`);
  }
  cells.push({ x0, x1, ...m });
}

// Keep only the chosen poses, in play order.
const chosen = FRAME_ORDER.map((i) => cells[i]);
cells.length = 0;
cells.push(...chosen);

// 2. One shared scale and feet line for all frames.
const top = Math.min(...cells.map((c) => c.minY));
const baseline = Math.max(...cells.map((c) => c.maxY));
const commonHeight = baseline - top + 1;
const scale = TARGET_HEIGHT / commonHeight;

// 3. One shared horizontal anchor: the average center of mass of all frames.
const anchor = cells.reduce((sum, c) => sum + (c.centroidX - c.x0), 0) / FRAMES;
let halfWidth = 0; // source px from the anchor to the farthest pixel of any frame
for (const c of cells) {
  halfWidth = Math.max(halfWidth, anchor - (c.minX - c.x0), c.maxX + 1 - c.x0 - anchor);
}
const frameW = 2 * Math.ceil(halfWidth * scale) + 2; // 1 px of margin on each side
const stripW = frameW * FRAMES;

cells.forEach((c, i) => {
  console.log(
    `frame ${i + 1}: height ${c.maxY - c.minY + 1}, feet at y=${c.maxY}, ` +
      `center x=${(c.centroidX - c.x0).toFixed(0)}, pixels ${c.count}`
  );
  if (baseline - c.maxY > commonHeight * 0.03) {
    console.warn(`WARNING frame ${i + 1}: feet are ${baseline - c.maxY} px above the others (not on the same line)`);
  }
});
console.log(`scale ${scale.toFixed(4)}, anchor x=${anchor.toFixed(0)}, output frame ${frameW}x${TARGET_HEIGHT}`);

// 4. Cut, shrink and place every frame into one strip.
const strip = new Uint8Array(stripW * TARGET_HEIGHT * 4);
const framePixels = [];
const srcW = frameW / scale;
cells.forEach((c, i) => {
  const box = { x: c.x0 + anchor - srcW / 2, y: top, w: srcW, h: commonHeight };
  const px = resample(img, box, frameW, TARGET_HEIGHT, c.x0, c.x1);
  framePixels.push(px);
  for (let y = 0; y < TARGET_HEIGHT; y++) {
    strip.set(px.subarray(y * frameW * 4, (y + 1) * frameW * 4), (y * stripW + i * frameW) * 4);
  }
});

console.log('difference between frames (0 = identical, 1 = nothing in common):');
for (let i = 0; i < FRAMES; i++) {
  for (let j = i + 1; j < FRAMES; j++) {
    console.log(`  frames ${i + 1}-${j + 1}: ${diffRatio(framePixels[i], framePixels[j]).toFixed(2)}`);
  }
}
console.log(`opaque pixels per frame: ${framePixels.map(countOpaque).join(', ')}`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_STRIP, encodePng(stripW, TARGET_HEIGHT, strip));
console.log(`Wrote assets/sprites/player-run.png (${stripW}x${TARGET_HEIGHT}, ${FRAMES} frames of ${frameW}x${TARGET_HEIGHT})`);

// 5. Preview: the strip enlarged, with thin lines between frames.
const margin = 8;
const pw = margin * 2 + stripW * PREVIEW_SCALE;
const ph = margin * 2 + TARGET_HEIGHT * PREVIEW_SCALE;
const preview = new Uint8Array(pw * ph * 4);
for (let i = 0; i < pw * ph; i++) {
  preview[i * 4] = PREVIEW_BG[0];
  preview[i * 4 + 1] = PREVIEW_BG[1];
  preview[i * 4 + 2] = PREVIEW_BG[2];
  preview[i * 4 + 3] = 255;
}
for (let f = 1; f < FRAMES; f++) {
  const x = margin + f * frameW * PREVIEW_SCALE;
  for (let y = 0; y < ph; y++) {
    const d = (y * pw + x) * 4;
    preview[d] = 70;
    preview[d + 1] = 76;
    preview[d + 2] = 104;
  }
}
blit(preview, pw, strip, stripW, TARGET_HEIGHT, margin, margin, PREVIEW_SCALE);
writeFileSync(OUT_PREVIEW, encodePng(pw, ph, preview));
console.log(`Wrote assets/source/run-preview.png (${pw}x${ph})`);