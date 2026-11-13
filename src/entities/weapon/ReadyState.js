// src/entities/weapon/ReadyState.js
// Concrete State: the round is chambered and the weapon can fire.

import { WeaponState } from './WeaponState.js';

/**
 * Ready state. The only job here is to allow a shot and move the weapon to
 * the reloading state. It does not import ReloadingState: the Weapon owns
 * both state instances, which avoids a circular import between the two files.
 *
 * Complexity: tryFire is O(1); memory O(1).
 */
export class ReadyState extends WeaponState {
  get name() {
    return 'Ready';
  }

  /**
   * Allow the shot and start reloading right away.
   * The Weapon (context) performs the shot's effects (bullet, recoil).
   * @param {{reloading: WeaponState, setState: function(WeaponState): void}} weapon
   * @returns {boolean} always true: a chambered weapon always fires
   */
  tryFire(weapon) {
    weapon.setState(weapon.reloading);
    return true;
  }

  // update() is inherited and does nothing: a ready weapon has nothing to count down.
}