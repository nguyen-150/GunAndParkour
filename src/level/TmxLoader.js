// src/level/TmxLoader.js
// Hand-written reader for the subset of the Tiled .tmx format this game uses.

/**
 * @typedef {Object} TmxData
 * @property {number} width map width in tiles
 * @property {number} height map height in tiles
 * @property {number} tileWidth tile width in px
 * @property {number} tileHeight tile height in px
 * @property {{firstGid:number, name:string, columns:number, tileCount:number, imageSource:string}} tileset
 * @property {Object<string, Uint16Array>} layers tile ids (gid, 0 = empty) by layer name, row by row
 * @property {Array<{name:string, x:number, y:number}>} objects points and shapes from object layers
 */

/** Parse the key="value" pairs of one XML tag into a plain object. */
function parseAttributes(text) {
  const attrs = {};
  const re = /([\w:.-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

/**
 * Reads Tiled .tmx maps. Supported: orthogonal, finite maps, one embedded
 * tileset, tile layers stored as CSV, object layers with named points.
 * Anything else throws an Error that says what to change in Tiled.
 *
 * Why hand-written: it also runs in Node (tests and benchmarks), where the
 * browser's DOMParser does not exist. Complexity: O(n) in file size, memory
 * O(width * height); it runs once per level load, never inside the game loop.
 */
export class TmxLoader {
  /**
   * Fetch a .tmx file and parse it.
   * @param {string} url path of the file, for example './assets/maps/level1.tmx'
   * @returns {Promise<TmxData>}
   */
  static async load(url) {
    const res = await fetch(url);
    // Files opened from disk (file://) may report status 0, which is still fine.
    if (!res.ok && res.status !== 0) {
      throw new Error(`TMX: cannot load ${url} (HTTP ${res.status})`);
    }
    return TmxLoader.parse(await res.text());
  }

  /**
   * Parse the text of a .tmx file.
   * @param {string} text file content
   * @returns {TmxData}
   */
  static parse(text) {
    const mapTag = /<map\b([^>]*)>/.exec(text);
    if (!mapTag) throw new Error('TMX: <map> tag not found');
    const map = parseAttributes(mapTag[1]);

    if (map.orientation !== 'orthogonal') {
      throw new Error('TMX: map must be Orthogonal');
    }
    if (map.infinite === '1') {
      throw new Error('TMX: infinite maps are not supported, set a fixed map size in Tiled');
    }

    const width = Number(map.width);
    const height = Number(map.height);

    // Tileset: must be embedded in the map ("Embed in map" in Tiled).
    const tilesetTag = /<tileset\b([^>]*)>/.exec(text);
    if (!tilesetTag) throw new Error('TMX: no tileset found');
    const ts = parseAttributes(tilesetTag[1]);
    if (ts.source !== undefined) {
      throw new Error('TMX: external tilesets are not supported, tick "Embed in map" in Tiled');
    }
    const imageTag = /<image\b([^>]*)>/.exec(text);
    if (!imageTag) throw new Error('TMX: tileset has no <image>');
    const image = parseAttributes(imageTag[1]);

    // Tile layers.
    const layers = {};
    const layerRe = /<layer\b([^>]*)>([\s\S]*?)<\/layer>/g;
    let m;
    while ((m = layerRe.exec(text)) !== null) {
      const attrs = parseAttributes(m[1]);
      const dataTag = /<data\b([^>]*)>([\s\S]*?)<\/data>/.exec(m[2]);
      if (!dataTag) throw new Error(`TMX: layer "${attrs.name}" has no <data>`);
      if (parseAttributes(dataTag[1]).encoding !== 'csv') {
        throw new Error(`TMX: layer "${attrs.name}" must use CSV format (Map properties > Tile Layer Format)`);
      }
      layers[attrs.name] = TmxLoader.parseCsv(dataTag[2], width * height, attrs.name);
    }

    // Objects (spawn points and so on). "<objectgroup" does not match "<object\b".
    const objects = [];
    const objectRe = /<object\b([^>]*)>/g;
    while ((m = objectRe.exec(text)) !== null) {
      const a = parseAttributes(m[1]);
      objects.push({ name: a.name ?? '', x: Number(a.x), y: Number(a.y) });
    }

    return {
      width,
      height,
      tileWidth: Number(map.tilewidth),
      tileHeight: Number(map.tileheight),
      tileset: {
        firstGid: Number(ts.firstgid),
        name: ts.name ?? '',
        columns: Number(ts.columns),
        tileCount: Number(ts.tilecount),
        imageSource: image.source,
      },
      layers,
      objects,
    };
  }

  /**
   * Turn a CSV block of tile ids into a typed array.
   * @param {string} csv content of <data>
   * @param {number} expected width * height
   * @param {string} layerName used only in error messages
   * @returns {Uint16Array}
   */
  static parseCsv(csv, expected, layerName) {
    const parts = csv.trim().split(',');
    if (parts.length !== expected) {
      throw new Error(`TMX: layer "${layerName}" has ${parts.length} tiles, expected ${expected}`);
    }
    const ids = new Uint16Array(expected);
    for (let i = 0; i < expected; i++) {
      // Mask off Tiled's flip/rotate flags (top bits); flipping is not supported.
      ids[i] = Number(parts[i].trim()) & 0x1fffffff;
    }
    return ids;
  }
}