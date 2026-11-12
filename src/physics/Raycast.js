// src/physics/Raycast.js
// Grid raycast using DDA (Amanatides & Woo): visits each tile on the ray once.

/**
 * Create a reusable result object. Allocate it once and pass it to castRay()
 * every time, so shooting never creates garbage.
 * @returns {{hit:boolean,distance:number,x:number,y:number,col:number,row:number,normalX:number,normalY:number}}
 */
export function createRayHit() {
  return {
    hit: false,
    distance: 0, // from the origin to the hit point, in px
    x: 0, // hit point in world px
    y: 0,
    col: 0, // tile that was hit
    row: 0,
    normalX: 0, // face that was hit: (-1,0) means the left face of the tile
    normalY: 0,
  };
}

/** Fill the result object (private helper). */
function setHit(out, distance, x, y, col, row, normalX, normalY) {
  out.hit = true;
  out.distance = distance;
  out.x = x;
  out.y = y;
  out.col = col;
  out.row = row;
  out.normalX = normalX;
  out.normalY = normalY;
}

/**
 * Cast a ray through the tile grid and find the first solid tile.
 *
 * DDA idea: tMax is the distance along the ray to the next vertical/horizontal
 * grid line, tDelta is the distance needed to cross one whole tile. Each loop
 * step moves into the neighbouring tile across whichever line is nearer.
 *
 * Complexity: O(number of tiles the ray crosses) <= O(maxDistance / tileSize);
 * memory O(1), nothing is allocated.
 *
 * @param {import('../level/TileMap.js').TileMap} map
 * @param {number} originX ray start x in px
 * @param {number} originY ray start y in px
 * @param {number} dirX ray direction x (does not need to be normalized)
 * @param {number} dirY ray direction y
 * @param {number} maxDistance stop and report no hit beyond this distance, in px
 * @param {ReturnType<typeof createRayHit>} out result object, written in place
 * @returns {boolean} true if a solid tile was hit within maxDistance
 */
export function castRay(map, originX, originY, dirX, dirY, maxDistance, out) {
  out.hit = false;

  const len = Math.hypot(dirX, dirY);
  if (len === 0) return false;
  const dx = dirX / len;
  const dy = dirY / len;

  const ts = map.tileSize;
  let col = map.worldToTile(originX);
  let row = map.worldToTile(originY);

  // Starting inside a solid tile counts as an immediate hit.
  if (map.isSolid(col, row)) {
    setHit(out, 0, originX, originY, col, row, 0, 0);
    return true;
  }

  // Direction of travel along each axis (unused when that component is 0).
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;

  // Distance along the ray to cross one whole tile on each axis.
  const tDeltaX = dx !== 0 ? ts / Math.abs(dx) : Infinity;
  const tDeltaY = dy !== 0 ? ts / Math.abs(dy) : Infinity;

  // Distance along the ray to the first grid line on each axis.
  let tMaxX;
  if (dx > 0) tMaxX = ((col + 1) * ts - originX) / dx;
  else if (dx < 0) tMaxX = (col * ts - originX) / dx;
  else tMaxX = Infinity;

  let tMaxY;
  if (dy > 0) tMaxY = ((row + 1) * ts - originY) / dy;
  else if (dy < 0) tMaxY = (row * ts - originY) / dy;
  else tMaxY = Infinity;

  while (true) {
    let t;
    let normalX;
    let normalY;

    // Step across whichever grid line the ray reaches first.
    if (tMaxX < tMaxY) {
      t = tMaxX;
      col += stepX;
      tMaxX += tDeltaX;
      normalX = -stepX; // entered the tile through its left or right face
      normalY = 0;
    } else {
      t = tMaxY;
      row += stepY;
      tMaxY += tDeltaY;
      normalX = 0;
      normalY = -stepY; // entered through its top or bottom face
    }

    if (t > maxDistance) return false;

    if (map.isSolid(col, row)) {
      setHit(out, t, originX + dx * t, originY + dy * t, col, row, normalX, normalY);
      return true;
    }
  }
}