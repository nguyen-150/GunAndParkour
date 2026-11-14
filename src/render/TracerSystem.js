// src/render/TracerSystem.js
// Owns the pool of tracer streaks: spawn, age, recycle and draw them.

import { CONFIG } from '../config.js';
import { ObjectPool } from '../ds/ObjectPool.js';
import { Tracer } from '../entities/Tracer.js';

/**
 * Manager for visual shotgun streaks, built on ObjectPool (Object Pool pattern).
 *
 * Tracers are visual only, so if the pool is exhausted a streak is simply
 * skipped. Recoil and damage never depend on this system.
 *
 * Complexity: spawn() is O(1); update() and render() are O(capacity), which is
 * tiny (32 by default). All memory is allocated once in the constructor.
 */
export class TracerSystem {
  /** @param {number} [capacity] how many streaks can exist at the same time */
  constructor(capacity = CONFIG.pools.tracerCount) {
    this.pool = new ObjectPool(capacity, () => new Tracer());
  }

  /**
   * Create one streak from (x1, y1) to (x2, y2), in world px.
   * @returns {boolean} true if a streak was created, false if the pool was full
   */
  spawn(x1, y1, x2, y2) {
    const tracer = this.pool.acquire();
    if (tracer === null) return false;
    tracer.start(x1, y1, x2, y2, CONFIG.weapon.tracerLifetime);
    return true;
  }

  /**
   * Age every live streak and return expired ones to the pool.
   * @param {number} dt step length in seconds
   */
  update(dt) {
    const items = this.pool.items;
    for (let i = 0; i < items.length; i++) {
      const tracer = items[i];
      if (tracer.active && !tracer.update(dt)) this.pool.release(tracer);
    }
  }

  /**
   * Draw every live streak (call this inside the camera transform).
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const items = this.pool.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].active) items[i].render(ctx);
    }
  }
}