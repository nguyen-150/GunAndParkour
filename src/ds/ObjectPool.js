// src/ds/ObjectPool.js
// Fixed-capacity object pool (Object Pool pattern), hand-written.

/**
 * Pool of pre-allocated objects, handed out and taken back in O(1).
 *
 * Why: creating and discarding objects every frame (bullets, effects) fills
 * memory with garbage and the garbage collector causes frame-rate hiccups.
 * A pool allocates everything once, then only reuses it.
 *
 * Contract: every object made by the factory must have a boolean `active`
 * property. The pool sets it to true on acquire() and false on release().
 *
 * Implementation: `free` is an array used as a stack; freeCount is its top.
 * Complexity: acquire() and release() are O(1); memory is O(capacity) and is
 * allocated only in the constructor, never while the game runs.
 */
export class ObjectPool {
  /**
   * @param {number} capacity how many objects exist in total, fixed forever
   * @param {function(): {active: boolean}} factory creates one object
   */
  constructor(capacity, factory) {
    this.capacity = capacity;

    /** Every object of the pool. Iterate it and skip entries with active === false. */
    this.items = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      const obj = factory();
      obj.active = false;
      this.items[i] = obj;
    }

    // Stack of free objects, filled in reverse so the first acquire() returns items[0].
    this.free = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.free[i] = this.items[capacity - 1 - i];
    }
    this.freeCount = capacity;
  }

  /** @returns {number} how many objects are currently borrowed */
  get activeCount() {
    return this.capacity - this.freeCount;
  }

  /**
   * Borrow a free object.
   * @returns {object|null} the object (active = true), or null if the pool is exhausted
   */
  acquire() {
    if (this.freeCount === 0) return null;
    const obj = this.free[--this.freeCount];
    obj.active = true;
    return obj;
  }

  /**
   * Give an object back. Releasing an object that is not active is ignored,
   * so a double release cannot corrupt the free stack.
   * @param {{active: boolean}} obj an object previously returned by acquire()
   */
  release(obj) {
    if (!obj.active) return;
    obj.active = false;
    this.free[this.freeCount++] = obj;
  }
}