// src/physics/CollisionSystem.js
// AABB vs tile grid collision, resolved one axis at a time.

/** Small margin so an edge lying exactly on a tile border is not "inside" the next tile. */
const EPS = 0.001;

/**
 * Moves rectangular bodies through a TileMap and pushes them out of solid tiles.
 *
 * Algorithm: move on X, resolve X; then move on Y, resolve Y. Only the tile
 * column/row touched by the leading edge is tested. This is safe because the
 * displacement per axis is clamped to one tile, so the leading edge crosses at
 * most one tile border per step (no tunneling).
 *
 * Complexity per move(): O(1) for small bodies (a few tiles per axis).
 * Memory: O(1), nothing is allocated, so no garbage-collector pressure.
 */
export class CollisionSystem {
  /** @param {import('../level/TileMap.js').TileMap} tileMap */
  constructor(tileMap) {
    this.map = tileMap;
  }

  /**
   * Advance a body by its velocity and resolve collisions.
   * Reads: x, y, width, height, vx, vy.
   * Writes: x, y, vx, vy (zeroed on impact), hitWall, hitCeiling, onGround.
   * @param {{x:number,y:number,width:number,height:number,vx:number,vy:number}} body
   * @param {number} dt step length in seconds
   */
  move(body, dt) {
    const ts = this.map.tileSize;
    // Safety clamp: never move more than one tile per axis in a single step.
    const dx = Math.max(-ts, Math.min(ts, body.vx * dt));
    const dy = Math.max(-ts, Math.min(ts, body.vy * dt));

    body.hitWall = this.moveX(body, dx);
    body.onGround = false;
    body.hitCeiling = false;
    this.moveY(body, dy);
  }

  /**
   * Move on the X axis and snap to the wall if blocked.
   * @returns {boolean} true if a solid tile stopped the body
   */
  moveX(body, dx) {
    if (dx === 0) return false;
    const map = this.map;
    const ts = map.tileSize;

    body.x += dx;

    // Rows covered by the body, and the column hit by the leading edge.
    const top = map.worldToTile(body.y);
    const bottom = map.worldToTile(body.y + body.height - EPS);
    const col =
      dx > 0 ? map.worldToTile(body.x + body.width - EPS) : map.worldToTile(body.x);

    for (let row = top; row <= bottom; row++) {
      if (map.isSolid(col, row)) {
        // Snap flush against the wall: right edge on the tile's left side,
        // or left edge on the tile's right side.
        body.x = dx > 0 ? col * ts - body.width : (col + 1) * ts;
        body.vx = 0;
        return true;
      }
    }
    return false;
  }

  /**
   * Move on the Y axis and snap to floor or ceiling if blocked.
   * Sets body.onGround / body.hitCeiling when it collides.
   */
  moveY(body, dy) {
    if (dy === 0) return;
    const map = this.map;
    const ts = map.tileSize;

    body.y += dy;

    // Columns covered by the body, and the row hit by the leading edge.
    const left = map.worldToTile(body.x);
    const right = map.worldToTile(body.x + body.width - EPS);
    const row =
      dy > 0 ? map.worldToTile(body.y + body.height - EPS) : map.worldToTile(body.y);

    for (let col = left; col <= right; col++) {
      if (map.isSolid(col, row)) {
        if (dy > 0) {
          body.y = row * ts - body.height; // landed on top of the tile
          body.onGround = true;
        } else {
          body.y = (row + 1) * ts; // bumped the underside of the tile
          body.hitCeiling = true;
        }
        body.vy = 0;
        return;
      }
    }
  }
}