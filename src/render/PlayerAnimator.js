// src/render/PlayerAnimator.js
// Procedural animation values for the player: bob, lean, landing squash, gun kick.
// It only computes numbers; Player.render and the gun drawing apply them.

const BOB_HEIGHT = 2; // px, how high the body bounces while running
const BOB_STRIDE = 36; // px of ground covered per bounce
const BOB_MIN_SPEED = 10; // px/s below which the player counts as standing
const BOB_EASE = 15; // per second, how fast the bob fades in and out

const LEAN_GROUND = 0.08; // rad, lean at full speed on the ground (about 5 degrees)
const LEAN_AIR = 0.25; // rad, lean at full speed in the air (about 14 degrees)
const LEAN_SPEED = 600; // px/s of horizontal speed that counts as "full speed"
const LEAN_EASE = 12; // per second, how fast the lean follows its target

const LAND_MIN_SPEED = 200; // px/s: falling slower than this does not squash
const LAND_FULL_SPEED = 700; // px/s: falling at this speed gives the full squash
const SQUASH_TIME = 0.15; // s to recover from a squash
const SQUASH_Y = 0.25; // body gets this much shorter at full squash
const SQUASH_X = 0.2; // and this much wider

const KICK_TIME = 0.12; // s for the gun to return after a shot
const KICK_DISTANCE = 4; // px the gun slides back along the barrel at the moment of the shot

/** @returns {number} v limited to the range [min, max] */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Computes the pose of the player each fixed step.
 *
 * Why numbers on one sprite instead of many frames: it needs no extra art and
 * follows the real physics (bounce speed from the real running speed, squash
 * from the real fall speed).
 *
 * Complexity: update() and every getter are O(1); memory O(1), nothing is
 * allocated while the game runs.
 */
export class PlayerAnimator {
  constructor() {
    this.reset();
  }

  /** Back to a neutral pose, for example after a respawn. */
  reset() {
    this.runPhase = 0; // radians, advances with distance run
    this.bobAmount = 0; // 0..1, how strongly the bob is shown
    this.lean = 0; // radians
    this.squash = 0; // 0..1, strength of the landing squash left
    this.kick = 0; // 0..1, strength of the gun kick left
    this.wasOnGround = true; // so spawning does not count as a landing
    this.lastVy = 0; // vertical speed at the end of the previous step
  }

  /** Call when a shot is fired. */
  onShot() {
    this.kick = 1;
  }

  /**
   * Advance by one fixed step. Call after the player has moved.
   * @param {number} dt step length in seconds
   * @param {{vx:number, vy:number, onGround:boolean}} body the player
   */
  update(dt, body) {
    // Run bob: the phase moves with the distance covered, so faster means more bounces.
    const running = body.onGround && Math.abs(body.vx) > BOB_MIN_SPEED;
    if (running) {
      this.runPhase = (this.runPhase + (Math.abs(body.vx) * dt * Math.PI) / BOB_STRIDE) % Math.PI;
    }
    this.bobAmount += ((running ? 1 : 0) - this.bobAmount) * Math.min(1, dt * BOB_EASE);

    // Lean toward the direction of travel, more in the air.
    const maxLean = body.onGround ? LEAN_GROUND : LEAN_AIR;
    const leanTarget = clamp(body.vx / LEAN_SPEED, -1, 1) * maxLean;
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * LEAN_EASE);

    // Landing squash. Collision zeroes vy on impact, so use the speed from the previous step.
    this.squash = Math.max(0, this.squash - dt / SQUASH_TIME);
    if (body.onGround && !this.wasOnGround && this.lastVy > LAND_MIN_SPEED) {
      this.squash = clamp(this.lastVy / LAND_FULL_SPEED, 0, 1);
    }
    this.wasOnGround = body.onGround;
    this.lastVy = body.vy;

    // Gun kick fades out.
    this.kick = Math.max(0, this.kick - dt / KICK_TIME);
  }

  /** @returns {number} vertical body offset in px (0 or negative: up) */
  get bobY() {
    return 0 - Math.abs(Math.sin(this.runPhase)) * BOB_HEIGHT * this.bobAmount;
  }

  /** @returns {number} body rotation in radians (positive leans right) */
  get leanAngle() {
    return this.lean;
  }

  /** @returns {number} horizontal body scale (wider when squashed) */
  get scaleX() {
    return 1 + SQUASH_X * this.squash;
  }

  /** @returns {number} vertical body scale (shorter when squashed) */
  get scaleY() {
    return 1 - SQUASH_Y * this.squash;
  }

  /** @returns {number} how far the gun is pushed back along its barrel, in px */
  get gunKick() {
    return this.kick * KICK_DISTANCE;
  }
}