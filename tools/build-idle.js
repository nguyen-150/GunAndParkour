// tools/build-idle.js
// Builds the standing player sprite. Run: node tools/build-idle.js
//
// Input : assets/source/idle1.png, one character on a flat magenta background.
// Output: assets/sprites/player.png
//         assets/source/idle-preview.png (idle sprite next to the run strip,
//         enlarged, to compare the two by eye)
// Uses only Node built-ins (zlib, fs).
//
// Same method as build-anim.js: the character is scaled to TARGET_HEIGHT and
// centered on its horizontal center of mass, so the body stays in the same
// place when the game switches between the idle sprite and the run frames.

import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('../assets/source/idle1.png', import.meta.url);
const OUT_DIR = new URL('../assets/sprites/', import.meta.url);
const OUT_SPRITE = new URL('../assets/sprites/player.png', import.meta.url);
const RUN_STRIP = new URL('../assets/sprites/player-run.png', import.meta.url);
const OUT_PREVIEW = new URL('../assets/source/idle-preview.png', import.meta.url);

const TARGET_HEIGHT = 36; // px, standing is upright, so 36 px gives the same head size as the 40 px run frames
const PREVIEW_SCALE = 4;
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
 * Shrink a region of the source to outW x outH by averaging colors, counting
 * only non-background pixels, so edges get no pink fringe. Source pixels
 * outside the image count as background. A target pixel is opaque when at
 * least half of its source pixels are not background.
 */
function resample(img, box, outW, outH) {
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
          if (sx < 0 || sx >= img.width || sy < 0 || sy >= img.height) continue;
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

/** Count the opaque pixels of a sprite. */
function countOpaque(px) {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] === 255) n++;
  return n;
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

// ---------- Main ----------

const img = decodePng(readFileSync(SOURCE));
console.log(`Source: ${img.width}x${img.height}`);

// 1. Measure the character: bounding box and horizontal center of mass.
let minX = Infinity;
let maxX = -1;
let minY = Infinity;
let maxY = -1;
let sumX = 0;
let count = 0;
for (let y = 0; y < img.height; y++) {
  for (let x = 0; x < img.width; x++) {
    if (isBackground(img.data, (y * img.width + x) * 4)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sumX += x;
    count++;
  }
}
if (count === 0) throw new Error('No character found: is the background flat magenta?');

// 2. Scale so the character is TARGET_HEIGHT tall; center the sprite on the center of mass.
const height = maxY - minY + 1;
const scale = TARGET_HEIGHT / height;
const centroidX = sumX / count;
const halfWidth = Math.max(centroidX - minX, maxX + 1 - centroidX);
const outW = 2 * Math.ceil(halfWidth * scale) + 2; // 1 px of margin on each side
const srcW = outW / scale;
const box = { x: centroidX - srcW / 2, y: minY, w: srcW, h: height };
const sprite = resample(img, box, outW, TARGET_HEIGHT);

console.log(
  `character ${maxX - minX + 1}x${height} at (${minX}, ${minY}), scale ${scale.toFixed(4)}, ` +
    `center of mass x=${centroidX.toFixed(0)}`
);
console.log(`sprite ${outW}x${TARGET_HEIGHT}, opaque pixels: ${countOpaque(sprite)}`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_SPRITE, encodePng(outW, TARGET_HEIGHT, sprite));
console.log(`Wrote assets/sprites/player.png (${outW}x${TARGET_HEIGHT})`);

// 3. Preview: the idle sprite, then the whole run strip, on the game's background.
const run = existsSync(RUN_STRIP) ? decodePng(readFileSync(RUN_STRIP)) : null;
if (run === null) {
  console.log('player-run.png not found: the preview shows only the idle sprite');
} else {
  console.log(`run strip: ${run.width}x${run.height} (shown next to the idle sprite in the preview)`);
}
const margin = 8;
const gap = 24;
const pw = margin * 2 + outW * PREVIEW_SCALE + (run ? gap + run.width * PREVIEW_SCALE : 0);
const ph = margin * 2 + Math.max(TARGET_HEIGHT, run ? run.height : 0) * PREVIEW_SCALE;
const preview = new Uint8Array(pw * ph * 4);
for (let i = 0; i < pw * ph; i++) {
  preview[i * 4] = PREVIEW_BG[0];
  preview[i * 4 + 1] = PREVIEW_BG[1];
  preview[i * 4 + 2] = PREVIEW_BG[2];
  preview[i * 4 + 3] = 255;
}
// Feet of both sprites on the same line: draw each one from the bottom edge up.
const feetY = ph - margin;
blit(preview, pw, sprite, outW, TARGET_HEIGHT, margin, feetY - TARGET_HEIGHT * PREVIEW_SCALE, PREVIEW_SCALE);
if (run !== null) {
  const runX = margin + outW * PREVIEW_SCALE + gap;
  blit(preview, pw, run.data, run.width, run.height, runX, feetY - run.height * PREVIEW_SCALE, PREVIEW_SCALE);
}
writeFileSync(OUT_PREVIEW, encodePng(pw, ph, preview));
console.log(`Wrote assets/source/idle-preview.png (${pw}x${ph})`);