// src/level/LevelManager.js
// Knows which levels exist, where their files are and which level comes next.

import { Level } from './Level.js';

/**
 * Loads levels by name.
 *
 * The functions that read the file and the tileset image are passed in, so
 * this class never touches the browser: tests can pass fake ones, and main.js
 * keeps using TmxLoader.load and its own image loader.
 *
 * Works like a small Factory: it builds a Level from a name.
 *
 * Complexity: has() and nextName() are O(1); load() is O(map size) and only
 * runs when the level changes, never inside the game loop.
 */
export class LevelManager {
  /**
   * @param {Object<string, {url:string, next?:string}>} definitions levels by name;
   *   url = the .tmx file, next = name of the level that follows (optional)
   * @param {function(string): Promise<import('./TmxLoader.js').TmxData>} loadTmx reads and parses a .tmx file
   * @param {function(string, string): Promise<*>} loadImage loads the tileset picture;
   *   receives the image path written in the .tmx and the url of the .tmx it is relative to
   */
  constructor(definitions, loadTmx, loadImage) {
    this.definitions = definitions;
    this.loadTmx = loadTmx;
    this.loadImage = loadImage;
    /** @type {string|null} name of the last level loaded successfully */
    this.current = null;
  }

  /** @returns {boolean} true if a level with this name is defined */
  has(name) {
    return Object.hasOwn(this.definitions, name);
  }

  /**
   * @param {string} name a defined level
   * @returns {string|null} the name of the level that follows it, or null for the last one
   */
  nextName(name) {
    return this.definition(name).next ?? null;
  }

  /**
   * Load a level and its tileset picture.
   * @param {string} name a defined level
   * @returns {Promise<{name:string, level:Level, image:*}>}
   * @throws {Error} for an unknown name or a file that cannot be loaded;
   *   `current` stays as it was in that case
   */
  async load(name) {
    const def = this.definition(name);
    const data = await this.loadTmx(def.url);
    const level = Level.fromTmx(data);
    const image = await this.loadImage(level.tileset.imageSource, def.url);
    this.current = name;
    return { name, level, image };
  }

  /** @returns {{url:string, next?:string}} the definition, or throws for an unknown name */
  definition(name) {
    if (!this.has(name)) throw new Error(`LevelManager: unknown level "${name}"`);
    return this.definitions[name];
  }
}