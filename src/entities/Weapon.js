// src/entities/Weapon.js
// Context of the State pattern: owns the weapon states and applies recoil.

import { CONFIG } from '../config.js';
import { ReadyState } from './weapon/ReadyState.js';
import { ReloadingState } from './weapon/ReloadingState.js';

/**
 * Weapon with infinite ammo and a one-round magazine.
 * After each shot it needs CONFIG.weapon.reloadTime seconds to chamber the
 * next round, whether the owner is on the ground or in the air.
 *
 * Roles in the State pattern: Weapon = Context; ReadyState and ReloadingState
 * = Concrete States. The states decide WHEN a shot is allowed; the Weapon
 * decides WHAT a shot does (recoil now, spawning a bullet later).
 *
 * Complexity: update(), fire() and setState() are O(1); memory O(1).
 */
export class Weapon {
  constructor() {
    // Both states are created once and reused, so switching never allocates.
    this.ready = new ReadyState();
    this.reloading = new ReloadingState();

    this.reloadTimer = 0; // seconds left until the next round is chambered
    this.state = this.ready;
    this.state.enter(this);
  }

  /**
   * Switch to another state and let it initialise itself.
   * @param {import('./weapon/WeaponState.js').WeaponState} next
   */
  setState(next) {
    this.state = next;
    next.enter(this);
  }

  /** @returns {boolean} true when a shot can be fired right now. */
  get isReady() {
    return this.state === this.ready;
  }

  /**
   * Advance the weapon by one fixed step.
   * @param {number} dt step length in seconds
   */
  update(dt) {
    this.state.update(this, dt);
  }

  /**
   * Try to fire toward a direction. On success the owner gets recoil in the
   * opposite direction.
   * @param {{vx:number, vy:number}} owner body that receives the recoil
   * @param {number} dirX aim direction x (does not need to be normalized)
   * @param {number} dirY aim direction y
   * @returns {boolean} true if a shot was fired
   */
  fire(owner, dirX, dirY) {
    const len = Math.hypot(dirX, dirY);
    if (len === 0) return false; // no direction: refuse before changing state

    if (!this.state.tryFire(this)) return false;

    // Add an impulse opposite to the barrel; momentum already held is kept.
    const impulse = CONFIG.weapon.recoilImpulse;
    owner.vx -= (dirX / len) * impulse;
    owner.vy -= (dirY / len) * impulse;
    return true;
  }
}