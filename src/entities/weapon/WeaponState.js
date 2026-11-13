// src/entities/weapon/WeaponState.js
// Base class of the State pattern for the weapon.
// Roles: Weapon = Context, WeaponState = State,
//        ReadyState / ReloadingState = Concrete States.

/**
 * Base weapon state. Subclasses override the methods they care about.
 * Defaults are "do nothing" and "cannot fire", so a new state is safe
 * until it explicitly opts in.
 *
 * Complexity: every method is O(1); states are created once and reused,
 * so switching state never allocates memory.
 */
export class WeaponState {
  /** @returns {string} state name, handy for the HUD and debugging */
  get name() {
    return 'Base';
  }

  /**
   * Called once when the weapon switches into this state.
   * @param {object} weapon the Weapon (context) that owns this state
   */
  enter(weapon) {}

  /**
   * Called every fixed step while this state is active.
   * @param {object} weapon the Weapon (context)
   * @param {number} dt step length in seconds
   */
  update(weapon, dt) {}

  /**
   * Called when the player presses the fire button.
   * @param {object} weapon the Weapon (context)
   * @returns {boolean} true if a shot is actually fired
   */
  tryFire(weapon) {
    return false;
  }
}