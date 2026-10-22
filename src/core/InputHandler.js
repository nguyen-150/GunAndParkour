// src/core/InputHandler.js
// Tracks held keys and the mouse. Game code polls this state inside update().

/**
 * Keyboard and mouse state holder.
 *
 * Complexity: every event handler and every query is O(1);
 * memory is O(number of keys currently held).
 * The on* methods never touch the DOM, so they can be tested in Node;
 * attach() is the only place that registers real browser listeners.
 */
export class InputHandler {
  constructor() {
    /** @type {Set<string>} event.code values of keys currently held */
    this.keys = new Set();
    this.mouseX = 0; // canvas coordinates, in px
    this.mouseY = 0;
    this.mouseDown = false; // true while the left button is held

    this.canvas = null;

    // Create the listener functions once so detach() can remove the same ones.
    this.handleKeyDown = (e) => this.onKeyDown(e.code);
    this.handleKeyUp = (e) => this.onKeyUp(e.code);
    this.handleBlur = () => this.reset();
    this.handleMouseMove = (e) => {
      const p = this.toCanvasCoords(e.clientX, e.clientY);
      this.onMouseMove(p.x, p.y);
    };
    this.handleMouseDown = (e) => this.onMouseButton(e.button, true);
    this.handleMouseUp = (e) => this.onMouseButton(e.button, false);
  }

  // ---- Pure state updates (no DOM), safe to call from tests ----

  /** @param {string} code KeyboardEvent.code, for example 'KeyA' */
  onKeyDown(code) {
    this.keys.add(code);
  }

  /** @param {string} code KeyboardEvent.code */
  onKeyUp(code) {
    this.keys.delete(code);
  }

  /** @param {number} x canvas x in px @param {number} y canvas y in px */
  onMouseMove(x, y) {
    this.mouseX = x;
    this.mouseY = y;
  }

  /** @param {number} button 0 = left button @param {boolean} down */
  onMouseButton(button, down) {
    if (button === 0) this.mouseDown = down;
  }

  /** Forget everything, for example when the window loses focus. */
  reset() {
    this.keys.clear();
    this.mouseDown = false;
  }

  // ---- Queries used by game code ----

  /** @param {string} code KeyboardEvent.code @returns {boolean} */
  isDown(code) {
    return this.keys.has(code);
  }

  /**
   * Horizontal move direction from A/D.
   * @returns {number} -1 (A only), 1 (D only), 0 (none or both)
   */
  getMoveAxis() {
    let axis = 0;
    if (this.isDown('KeyA')) axis -= 1;
    if (this.isDown('KeyD')) axis += 1;
    return axis;
  }

  // ---- Browser wiring ----

  /**
   * Register real browser listeners.
   * @param {HTMLCanvasElement} canvas used to convert mouse coordinates
   */
  attach(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    // mouseup on window so releasing the button outside the canvas still counts
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  /** Remove every listener added by attach(). */
  detach() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('mousemove', this.handleMouseMove);
    if (this.canvas) this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas = null;
  }

  /**
   * Convert page coordinates to canvas pixel coordinates,
   * accounting for any CSS scaling of the canvas.
   */
  toCanvasCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (this.canvas.width / rect.width),
      y: (clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }
}