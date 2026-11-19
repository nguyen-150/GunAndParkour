// src/level/Level.js
// A playable level built from parsed TMX data: collision grid, tile ids, spawn point.

import { TileMap, TILE_SOLID } from './TileMap.js';

/**
 * One level of the game.
 *
 * It keeps two views of the same map on purpose:
 *   - tileMap: 1 byte per tile (empty or solid), used by collision and raycast;
 *   - gids: the original Tiled tile ids, used only to pick the picture to draw.
 * So physics never needs to know about Tiled or tilesets.
 *
 * Complexity: fromTmx() is O(width * height) and runs once per level load;
 * getGid() is O(1); memory is O(width * height).
 */
export class Level {
  /**
   * @param {TileMap} tileMap collision grid
   * @param {Uint16Array} gids Tiled tile ids, row by row (0 = empty)
   * @param {{firstGid:number, columns:number, imageSource:string}} tileset
   * @param {number} spawnX player feet x in px (middle of the feet)
   * @param {number} spawnY player feet y in px
   * @param {Uint16Array|null} [hazards] optional lethal tile ids (spikes, abyss), same layout as gids
   * @param {Array<{name:string,x:number,y:number,width:number,height:number}>} [zones] named rectangles from the object layer (for example the boss trigger)
   */
  constructor(tileMap, gids, tileset, spawnX, spawnY, hazards = null, zones = []) {
    this.tileMap = tileMap;
    this.gids = gids;
    this.tileset = tileset;
    this.spawnX = spawnX;
    this.spawnY = spawnY;
    this.hazards = hazards;
    this.zones = zones;
  }

  /**
   * Build a level from the result of TmxLoader.parse().
   * Every tile with a non-zero id in the "Ground" layer is solid.
   * @param {import('./TmxLoader.js').TmxData} data
   * @returns {Level}
   */
  static fromTmx(data) {
    if (data.tileWidth !== data.tileHeight) {
      throw new Error('Level: tiles must be square');
    }

    const ground = data.layers.Ground;
    if (ground === undefined) {
      throw new Error('Level: tile layer named "Ground" not found');
    }

    const spawn = data.objects.find((o) => o.name === 'player_spawn');
    if (spawn === undefined) {
      throw new Error('Level: object named "player_spawn" not found');
    }

    const tileMap = new TileMap(data.width, data.height, data.tileWidth);
    // Same row-by-row order as the CSV, so index i maps straight to tiles[i].
    for (let i = 0; i < ground.length; i++) {
      if (ground[i] !== 0) tileMap.tiles[i] = TILE_SOLID;
    }

    // Optional layer: tiles here are lethal (spikes, abyss) but do not block movement.
    const hazards = data.layers.Hazards ?? null;

    // Rectangles (objects with a size) become named zones; points such as the spawn do not.
    const zones = data.objects.filter((o) => o.width > 0 && o.height > 0);

    return new Level(tileMap, ground, data.tileset, spawn.x, spawn.y, hazards, zones);
    }

  /**
   * @param {number} col tile column
   * @param {number} row tile row
   * @returns {number} Tiled tile id at (col, row); 0 for empty or outside the map
   */
  getGid(col, row) {
    const map = this.tileMap;
    if (!map.inBounds(col, row)) return 0;
    return this.gids[row * map.width + col];
  }
  
  /**
   * @param {number} col tile column
   * @param {number} row tile row
   * @returns {number} hazard tile id at (col, row); 0 if there is none, the map
   *   has no Hazards layer, or the position is outside the map
   */
  getHazardGid(col, row) {
    if (this.hazards === null) return 0;
    const map = this.tileMap;
    if (!map.inBounds(col, row)) return 0;
    return this.hazards[row * map.width + col];
  }
  
  /**
   * @param {string} name object name set in Tiled, for example 'boss_trigger'
   * @returns {{name:string,x:number,y:number,width:number,height:number}|null} the zone, or null
   */
  getZone(name) {
    for (let i = 0; i < this.zones.length; i++) {
      if (this.zones[i].name === name) return this.zones[i];
    }
    return null;
  }

  /**
   * True if a body overlaps the named zone. Touching edges alone does not count.
   * @param {string} name zone name
   * @param {{x:number, y:number, width:number, height:number}} body
   * @returns {boolean} false when there is no such zone
   */
  overlapsZone(name, body) {
    const z = this.getZone(name);
    if (z === null) return false;
    return (
      body.x < z.x + z.width &&
      body.x + body.width > z.x &&
      body.y < z.y + z.height &&
      body.y + body.height > z.y
    );
  }
}