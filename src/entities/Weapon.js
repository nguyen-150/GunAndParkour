// src/entities/Weapon.js
// Context of the State pattern: owns the weapon states and applies recoil.

import { CONFIG } from '../config.js';
import { ReadyState } from './weapon/ReadyState.js';
import { ReloadingState } from './weapon/ReloadingState.js';
import { castRay, createRayHit } from '../physics/Raycast.js';

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
    /**
   * @param {import('../level/TileMap.js').TileMap} [map] used to find where each pellet ray ends
   * @param {import('../render/TracerSystem.js').TracerSystem} [tracers] receives one streak per pellet
   * @param {function(): number} [random] returns a number in [0, 1); inject a fixed one in tests
   */
  constructor(map = null, tracers = null, random = Math.random) {
    this.map = map;
    this.tracers = tracers;
    this.random = random;
    this.rayHit = createRayHit(); // reused by every pellet, so firing allocates nothing
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
  
  /** Back to the freshly loaded state: round chambered, no countdown running. */
  reset() {
    this.reloadTimer = 0;
    this.setState(this.ready);
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
   * Try to fire toward a direction. On success the owner gets one recoil
   * impulse opposite to the aim, and the pellet streaks are spawned.
   * @param {{x:number, y:number, width:number, height:number, vx:number, vy:number}} owner
   *   body that fires and receives the recoil
   * @param {number} dirX aim direction x (does not need to be normalized)
   * @param {number} dirY aim direction y
   * @returns {boolean} true if a shot was fired
   */
  fire(owner, dirX, dirY) {
    const len = Math.hypot(dirX, dirY);
    if (len === 0) return false; // no direction: refuse before changing state

    if (!this.state.tryFire(this)) return false;

    // One impulse per shot, no matter how many pellets leave the barrel.
    const impulse = CONFIG.weapon.recoilImpulse;
    owner.vx -= (dirX / len) * impulse;
    owner.vy -= (dirY / len) * impulse;

    if (this.map !== null && this.tracers !== null) {
      this.spawnPellets(owner, Math.atan2(dirY, dirX));
    }
    return true;
  }

    /**
   * The hand: the point of the body the gun turns around, horizontally in the
   * middle of the hitbox and `CONFIG.gun.mountHeight` above the feet.
   * @param {{x:number, y:number, width:number, height:number}} owner
   * @returns {number} world x in px
   */
  handX(owner) {
    return owner.x + owner.width / 2;
  }

  /**
   * @param {{x:number, y:number, width:number, height:number}} owner
   * @returns {number} world y of the hand in px
   */
  handY(owner) {
    return owner.y + owner.height - CONFIG.gun.mountHeight;
  }
  
  /**
   * Cast one ray per pellet from the hand, each at a random angle inside the
   * cone, and spawn a streak from the barrel end to where each ray ends.
   * Rays start at the hand (always inside the owner's hitbox, so never inside
   * a wall); streaks start at the muzzle but never past the hit point, so
   * standing against a wall does not draw them inside the wall.
   * @param {{x:number, y:number, width:number, height:number}} owner
   * @param {number} aimAngle aim direction in radians
   */
  spawnPellets(owner, aimAngle) {
    const cfg = CONFIG.weapon;
    const spread = (cfg.spreadDegrees * Math.PI) / 180; // total cone angle in radians
    const hx = this.handX(owner);
    const hy = this.handY(owner);

    // Unit vector of the aim, computed once for all pellets.
    const aimX = Math.cos(aimAngle);
    const aimY = Math.sin(aimAngle);
    const muzzle = CONFIG.gun.muzzleLength;

    for (let i = 0; i < cfg.pellets; i++) {
      const angle = aimAngle + (this.random() - 0.5) * spread;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      // The ray ends at the wall hit, or at full range if nothing was hit.
      const hit = castRay(this.map, hx, hy, dx, dy, cfg.range, this.rayHit);
      const dist = hit ? this.rayHit.distance : cfg.range;

      // All streaks leave from the same barrel end, but never start beyond the hit.
      const start = Math.min(muzzle, dist);
      this.tracers.spawn(hx + aimX * start, hy + aimY * start, hx + dx * dist, hy + dy * dist);
    }
  }
}