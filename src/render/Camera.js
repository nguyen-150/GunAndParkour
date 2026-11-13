// src/render/Camera.js
// Decides which part of the world is visible. Pure math, no DOM access.

/**
 * Camera with a fixed view height and a view width that follows the window
 * aspect ratio, so fullscreen has no black bars and nothing is stretched.
 *
 * Why fixed height: vertical gameplay (recoil jumps) stays identical on every
 * screen; wider screens only reveal extra world to the sides.
 *
 * Complexity: every method is O(1); memory O(1), nothing is allocated.
 */
export class Camera {
  /**
   * @param {number} viewHeight visible height in world px (fixed)
   * @param {number} minViewWidth narrowest visible width in px
   * @param {number} maxViewWidth widest visible width in px
   */
  constructor(viewHeight, minViewWidth, maxViewWidth) {
    this.viewHeight = viewHeight;
    this.minViewWidth = minViewWidth;
    this.maxViewWidth = maxViewWidth;
    this.viewWidth = minViewWidth;

    // Top-left corner of the visible area in world px (always whole numbers).
    this.x = 0;
    this.y = 0;
  }

  /**
   * Fit the view width to the window aspect ratio, within the allowed range.
   * @param {number} windowWidth in CSS px
   * @param {number} windowHeight in CSS px
   * @returns {boolean} true if viewWidth changed (the canvas must be resized)
   */
  setWindowSize(windowWidth, windowHeight) {
    const wanted = Math.round(this.viewHeight * (windowWidth / windowHeight));
    const next = Math.max(this.minViewWidth, Math.min(this.maxViewWidth, wanted));
    const changed = next !== this.viewWidth;
    this.viewWidth = next;
    return changed;
  }

  /**
   * Center the view on a target point, then keep it inside the map.
   * If the map is smaller than the view on an axis, the map is centered.
   * @param {number} targetX world x to center on
   * @param {number} targetY world y to center on
   * @param {number} mapWidth map width in px
   * @param {number} mapHeight map height in px
   */
  follow(targetX, targetY, mapWidth, mapHeight) {
    this.x = Math.round(
      Camera.clampAxis(targetX - this.viewWidth / 2, this.viewWidth, mapWidth)
    );
    this.y = Math.round(
      Camera.clampAxis(targetY - this.viewHeight / 2, this.viewHeight, mapHeight)
    );
  }

  /** Convert a canvas x (screen) to a world x. */
  screenToWorldX(screenX) {
    return screenX + this.x;
  }

  /** Convert a canvas y (screen) to a world y. */
  screenToWorldY(screenY) {
    return screenY + this.y;
  }

  /**
   * Clamp one axis of the camera position.
   * @param {number} pos wanted top-left position on this axis
   * @param {number} view visible size on this axis
   * @param {number} map map size on this axis
   */
  static clampAxis(pos, view, map) {
    if (map <= view) return (map - view) / 2; // map fits: center it
    return Math.max(0, Math.min(pos, map - view));
  }
}