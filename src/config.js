// src/config.js
// Single source of truth for every tunable constant in the game.
// Units: pixels (px) and seconds (s) unless stated otherwise.

/**
 * Central game configuration.
 * Not frozen on purpose: the live tuning panel (added later)
 * edits these values at runtime to find the right game feel.
 */
export const CONFIG = {
  // ---- Screen and map grid ----
  screen: {
    width: 960,
    height: 640,
  },
  tileSize: 32, // 960 / 32 = 30 columns, 640 / 32 = 20 rows

  // ---- Game loop (fixed timestep) ----
  loop: {
    fixedStep: 1 / 60, // physics always advances in 1/60 s steps
    maxFrameTime: 0.25, // clamp long frames to avoid the "spiral of death"
  },

  // ---- Physics: these numbers define the game feel ----
  physics: {
    gravity: 1400, // px/s^2, pulls the player down
    maxSpeedX: 700, // px/s, horizontal speed cap
    maxSpeedY: 900, // px/s, vertical speed cap
    // Cap must stay below tileSize / fixedStep (= 1920 px/s) so that one step
    // never skips over a whole tile (tunneling).
  },

  // ---- Player ----
  player: {
    width: 24,
    height: 30,
    runAccelGround: 2200, // px/s^2 when holding A/D on the ground
    runAccelAir: 900, // px/s^2 when holding A/D in the air (less control)
    maxRunSpeed: 220, // px/s, speed reached by A/D alone
    frictionGround: 1800, // px/s^2, slows down when no key is held on the ground
    frictionAir: 120, // px/s^2, small air drag when no key is held
  },

  // ---- Weapon (infinite ammo, 1-round magazine) ----
  weapon: {
    reloadTime: 0.5, // s, time to chamber the next round after each shot
    recoilImpulse: 650, // px/s, speed added to the player opposite to the barrel
    bulletSpeed: 900, // px/s
    bulletMaxRange: 1200, // px, bullet disappears beyond this distance
  },

  // ---- Object pools ----
  pools: {
    bulletCount: 32, // bullets pre-allocated once, then reused
  },
};