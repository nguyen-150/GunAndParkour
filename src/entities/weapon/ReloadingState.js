// src/entities/weapon/ReloadingState.js
// Concrete State: the next round is being chambered; firing is blocked.

import { CONFIG } from '../../config.js';
import { WeaponState } from './WeaponState.js';

/** Tolerance for floating-point drift when counting down (see update). */
const TIME_EPSILON = 1e-9;

/**
 * Reloading state. Counts down weapon.reloadTimer in fixed steps, then
 * returns the weapon to the ready state. tryFire() is inherited and returns
 * false, so shots are ignored while reloading.
 *
 * The timer lives on the Weapon (context), not here, because state objects
 * are shared and must hold behaviour only, not per-weapon data.
 *
 * Complexity: enter and update are O(1); memory O(1).
 */
export class ReloadingState extends WeaponState {
  get name() {
    return 'Reloading';
  }

  /** Start the countdown. Reads the config each time so live tuning works. */
  enter(weapon) {
    weapon.reloadTimer = CONFIG.weapon.reloadTime;
  }

  /**
   * Count down and switch back to ready when time is up.
   * The epsilon avoids an extra step caused by floating-point rounding
   * (0.5 minus 30 steps of 1/60 can leave a tiny positive remainder).
   * @param {{reloadTimer:number, ready: WeaponState, setState: function(WeaponState): void}} weapon
   * @param {number} dt step length in seconds
   */
  update(weapon, dt) {
    weapon.reloadTimer -= dt;
    if (weapon.reloadTimer <= TIME_EPSILON) {
      weapon.reloadTimer = 0;
      weapon.setState(weapon.ready);
    }
  }
}