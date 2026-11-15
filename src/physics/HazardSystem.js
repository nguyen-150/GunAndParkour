// src/physics/HazardSystem.js
// Tells whether a body touches a lethal hazard tile (spikes, abyss).

import { CONFIG } from '../config.js';

/** Small margin so an edge lying exactly on a tile border is not "inside" the next tile. */
const EPS = 0.001;

/**
 * Checks a rectangular body against the Hazards layer of a Level.
 *
 * Only the tiles under the body are visited (at most 2x2 for the player), and
 * each hazard has its own hitbox from CONFIG.hazards, usually smaller than
 * the tile so the player dies on the spike tips, not on empty space around them.
 *
 * Complexity per check(): O(tiles under the body) = O(1); memory O(1).
 * A brute-force version would test every hazard tile of the map: O(H).
 */
export class HazardSystem {
  /** @param {import('../level/Level.js').Level} level */
  constructor(level) {
    this.level = level;
  }

  /**
   * @param {{x:number, y:number, width:number, height:number}} body
   * @returns {number} tile id (gid) of the lethal hazard being touched, or 0 if safe
   */
  check(body) {
    const level = this.level;
    if (level.hazards === null) return 0; // this map has no Hazards layer

    const map = level.tileMap;
    const ts = map.tileSize;

    // Tiles under the body.
    const firstCol = map.worldToTile(body.x);
    const lastCol = map.worldToTile(body.x + body.width - EPS);
    const firstRow = map.worldToTile(body.y);
    const lastRow = map.worldToTile(body.y + body.height - EPS);

    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const gid = level.getHazardGid(col, row);
        if (gid === 0) continue;

        const box = CONFIG.hazards[gid];
        if (box === undefined) continue; // no hitbox defined: not lethal

        // Hazard hitbox in world px.
        const left = col * ts + box.x;
        const top = row * ts + box.y;

        // Strict overlap: touching edges alone does not count.
        if (
          body.x < left + box.w &&
          body.x + body.width > left &&
          body.y < top + box.h &&
          body.y + body.height > top
        ) {
          return gid;
        }
      }
    }
    return 0;
  }
}