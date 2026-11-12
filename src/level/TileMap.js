// src/level/TileMap.js
// Grid of tiles stored in a flat Uint8Array. Answers "is this tile solid?".

/** Tile ids stored in the grid. */
export const TILE_EMPTY = 0;
export const TILE_SOLID = 1;

/**
 * Rectangular tile grid.
 *
 * Storage: one flat Uint8Array, index = row * width + col (1 byte per tile).
 * Complexity: getTile / isSolid / setTile / worldToTile are O(1);
 * memory is O(width * height). Tiles outside the map count as solid,
 * so entities can never leave the level and callers need no bounds checks.
 */
export class TileMap {
  /**
   * @param {number} width number of columns
   * @param {number} height number of rows
   * @param {number} tileSize size of one tile in px
   */
  constructor(width, height, tileSize) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.tiles = new Uint8Array(width * height); // all TILE_EMPTY at start
  }

  /** Map width in px. */
  get pixelWidth() {
    return this.width * this.tileSize;
  }

  /** Map height in px. */
  get pixelHeight() {
    return this.height * this.tileSize;
  }

  /** @returns {boolean} true if (col, row) is inside the map. */
  inBounds(col, row) {
    return col >= 0 && col < this.width && row >= 0 && row < this.height;
  }

  /**
   * @returns {number} tile id at (col, row); TILE_SOLID when out of bounds.
   */
  getTile(col, row) {
    if (!this.inBounds(col, row)) return TILE_SOLID;
    return this.tiles[row * this.width + col];
  }

  /** Set a tile id. Writes outside the map are ignored. */
  setTile(col, row, id) {
    if (!this.inBounds(col, row)) return;
    this.tiles[row * this.width + col] = id;
  }

  /** @returns {boolean} true if the tile at (col, row) blocks movement. */
  isSolid(col, row) {
    return this.getTile(col, row) === TILE_SOLID;
  }

  /**
   * Convert a pixel coordinate to a tile index.
   * Math.floor keeps negative coordinates correct (-1 px is tile -1).
   * @param {number} px x or y in pixels
   */
  worldToTile(px) {
    return Math.floor(px / this.tileSize);
  }

  /**
   * Build a map from text rows: '#' = solid, anything else = empty.
   * Handy for hard-coded test levels; TmxLoader will fill maps from Tiled later.
   * @param {string[]} rows all rows must have the same length
   * @param {number} tileSize size of one tile in px
   */
  static fromRows(rows, tileSize) {
    const height = rows.length;
    const width = rows[0].length;
    const map = new TileMap(width, height, tileSize);

    for (let row = 0; row < height; row++) {
      if (rows[row].length !== width) {
        throw new Error(`Row ${row} has length ${rows[row].length}, expected ${width}`);
      }
      for (let col = 0; col < width; col++) {
        if (rows[row][col] === '#') map.setTile(col, row, TILE_SOLID);
      }
    }
    return map;
  }
}