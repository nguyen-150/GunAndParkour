// tools/build-sprites.js
// Builds the player and shotgun sprites from the Gemini character sheet.
// Run: node tools/build-sprites.js
//
// Input : assets/source/character1.png: character on the left, shotgun on the
//         right, on a flat magenta background.
// Output: assets/sprites/player.png and assets/sprites/gun.png
//         assets/source/sprites-preview.png (both sprites enlarged, to inspect)
// Uses only Node built-ins (zlib, fs).

import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('../assets/source/character1.png', import.meta.url);
const OUT_DIR = new URL('../assets/sprites/', import.meta.url);
const OUT_PREVIEW = new URL('../assets/source/sprites-preview.png', import.meta.url);

const PLAYER_HEIGHT = 40; // px, height of the player sprite in the game
const GUN_LENGTH = 32; // px, length of the shotgun sprite in the game
const MIN_GAP = 40; // empty source columns that separate the character from the gun
const PREVIEW_SCALE = 8;
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
 * Find the two main objects of the sheet (character, gun) as groups of
 * columns that contain non-background pixels, separated by an empty gap of
 * at least MIN_GAP columns. Stray specks are ignored: only the two clusters
 * with the most pixels are kept.
 * @returns {Array<{x0:number, x1:number, pixels:number}>} left to right
 */
function findTwoClusters(img) {
  const counts = new Uint32Array(img.width);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!isBackground(img.data, (y * img.width + x) * 4)) counts[x]++;
    }
  }

  const clusters = [];
  let start = -1;
  let last = -1;
  let pixels = 0;
  for (let x = 0; x < img.width; x++) {
    if (counts[x] === 0) continue;
    if (start === -1) {
      start = x;
      pixels = 0;
    } else if (x - last > MIN_GAP) {
      clusters.push({ x0: start, x1: last, pixels });
      start = x;
      pixels = 0;
    }
    last = x;
    pixels += counts[x];
  }
  if (start !== -1) clusters.push({ x0: start, x1: last, pixels });

  if (clusters.length < 2) {
    throw new Error(
      `Expected 2 objects (character and gun), found ${clusters.length}. ` +
        'They must be clearly separated on the magenta background.'
    );
  }
  clusters.sort((a, b) => b.pixels - a.pixels);
  return clusters.slice(0, 2).sort((a, b) => a.x0 - b.x0);
}

/** Tight box around a cluster: adds the vertical extent to its columns. */
function boxOf(img, cluster) {
  let minY = Infinity;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = cluster.x0; x <= cluster.x1; x++) {
      if (isBackground(img.data, (y * img.width + x) * 4)) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      break; // this row has content; move to the next row
    }
  }
  return { x: cluster.x0, y: minY, w: cluster.x1 - cluster.x0 + 1, h: maxY - minY + 1 };
}

/**
 * Shrink a region of the source to outW x outH by averaging colors, counting
 * only non-background pixels, so edges get no pink fringe. A target pixel is
 * opaque when at least half of its source pixels are not background.
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

const [charCluster, gunCluster] = findTwoClusters(img);
const charBox = boxOf(img, charCluster);
const gunBox = boxOf(img, gunCluster);

// Keep each object's proportions; only the player height and gun length are fixed.
const playerW = Math.max(1, Math.round((charBox.w * PLAYER_HEIGHT) / charBox.h));
const player = resample(img, charBox, playerW, PLAYER_HEIGHT);

const gunW = GUN_LENGTH;
const gunH = Math.max(1, Math.round((gunBox.h * GUN_LENGTH) / gunBox.w));
const gun = resample(img, gunBox, gunW, gunH);

console.log(
  `character crop ${charBox.w}x${charBox.h} at (${charBox.x}, ${charBox.y}) -> ` +
    `${playerW}x${PLAYER_HEIGHT}, opaque pixels: ${countOpaque(player)}`
);
console.log(
  `gun       crop ${gunBox.w}x${gunBox.h} at (${gunBox.x}, ${gunBox.y}) -> ` +
    `${gunW}x${gunH}, opaque pixels: ${countOpaque(gun)}`
);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(new URL('player.png', OUT_DIR), encodePng(playerW, PLAYER_HEIGHT, player));
writeFileSync(new URL('gun.png', OUT_DIR), encodePng(gunW, gunH, gun));
console.log(`Wrote assets/sprites/player.png (${playerW}x${PLAYER_HEIGHT})`);
console.log(`Wrote assets/sprites/gun.png (${gunW}x${gunH})`);

// Preview: both sprites enlarged on the game's background color.
const margin = 16;
const gap = 32;
const pw = margin + playerW * PREVIEW_SCALE + gap + gunW * PREVIEW_SCALE + margin;
const ph = margin + PLAYER_HEIGHT * PREVIEW_SCALE + margin;
const preview = new Uint8Array(pw * ph * 4);
for (let i = 0; i < pw * ph; i++) {
  preview[i * 4] = PREVIEW_BG[0];
  preview[i * 4 + 1] = PREVIEW_BG[1];
  preview[i * 4 + 2] = PREVIEW_BG[2];
  preview[i * 4 + 3] = 255;
}
blit(preview, pw, player, playerW, PLAYER_HEIGHT, margin, margin, PREVIEW_SCALE);
const gunX = margin + playerW * PREVIEW_SCALE + gap;
const gunY = margin + Math.round(((PLAYER_HEIGHT - gunH) * PREVIEW_SCALE) / 2);
blit(preview, pw, gun, gunW, gunH, gunX, gunY, PREVIEW_SCALE);
writeFileSync(OUT_PREVIEW, encodePng(pw, ph, preview));
console.log(`Wrote assets/source/sprites-preview.png (${pw}x${ph})`);