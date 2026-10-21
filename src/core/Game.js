// src/core/Game.js
// Fixed-timestep game loop with an accumulator.

import { CONFIG } from '../config.js';

/**
 * Game loop that runs logic in fixed steps and renders once per frame.
 *
 * Why fixed steps: physics gives the same result on any frame rate,
 * which keeps recoil trajectories reproducible and prevents tunneling.
 *
 * Complexity per frame: O(k) updates, k <= maxFrameTime / fixedStep (15 by
 * default). Memory: O(1), nothing is allocated inside the loop.
 */
export class Game {
  /**
   * @param {{update: function(number): void, render: function(number): void}} callbacks
   *   update(dt): advance the simulation by one fixed step of dt seconds.
   *   render(alpha): draw the scene; alpha in [0, 1) is the leftover time
   *   between two physics steps, used for smooth interpolation.
   */
  constructor({ update, render }) {
    this.update = update;
    this.render = render;

    this.accumulator = 0; // seconds of simulation time not yet consumed
    this.lastTime = 0; // timestamp of the previous frame, in seconds
    this.lastSteps = 0; // how many update steps the last advance() ran
    this.running = false;
    this.rafId = 0;

    // Bind once so requestAnimationFrame never receives a new function.
    this.tick = this.tick.bind(this);
  }

  /**
   * Consume real elapsed time by running as many fixed update steps as fit.
   * Pure logic with no browser API, so it can be tested and benchmarked in Node.
   * @param {number} frameTime real seconds since the previous frame
   * @returns {number} alpha in [0, 1): leftover fraction of one fixed step
   */
  advance(frameTime) {
    const { fixedStep, maxFrameTime } = CONFIG.loop;

    // Guard against negative values and against huge frames (tab was frozen).
    if (frameTime < 0) frameTime = 0;
    if (frameTime > maxFrameTime) frameTime = maxFrameTime;

    this.accumulator += frameTime;

    let steps = 0;
    while (this.accumulator >= fixedStep) {
      this.update(fixedStep);
      this.accumulator -= fixedStep;
      steps++;
    }
    this.lastSteps = steps;

    return this.accumulator / fixedStep;
  }

  /** Start the loop. Safe to call twice. */
  start() {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.lastTime = performance.now() / 1000;
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Stop the loop. */
  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * One browser frame: advance the simulation, draw, schedule the next frame.
   * @param {number} nowMs timestamp from requestAnimationFrame, in milliseconds
   */
  tick(nowMs) {
    if (!this.running) return;

    const now = nowMs / 1000;
    const alpha = this.advance(now - this.lastTime);
    this.lastTime = now;

    this.render(alpha);
    this.rafId = requestAnimationFrame(this.tick);
  }
}