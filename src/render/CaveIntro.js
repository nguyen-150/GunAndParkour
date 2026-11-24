// src/render/CaveIntro.js
// Timeline of the opening scene in the boss cave, as a pure function of time.

/**
 * Times of the scene in seconds from its start. Each pair is [start, end] of a change.
 * The first frame of the storyboard is the dark room with two glowing eyes; then lava
 * pours in from both sides, fills the room and lights the skeleton; it roars; the fight starts.
 */
export const CAVE_INTRO = {
  eyesFlicker: [0.8, 1.4], // the eyes blink on, dimly
  eyesWake: [2.0, 2.8], // and then fully
  fallsIn: [3.0, 4.0], // two streams of lava start pouring from the sides
  fallsOut: [7.0, 7.6], // and stop
  glow: [3.2, 5.0], // the red light of the lava grows
  lavaRise: [3.4, 7.0], // the lava rises to its resting level
  ambient: [3.4, 8.0], // the room slowly becomes visible
  roarIn: [8.4, 8.8], // the roar swells...
  roarOut: [9.6, 10.2], // ...and dies away
  jaw: [8.4, 10.2], // the jaw is open
  hud: [10.2, 10.6], // the boss health bar appears
  duration: 10.6, // total length: the player gets control back
};

/** Extra lava height at the peak of the roar, as a fraction of the lava's whole rise. */
const ROAR_SURGE = 0.11;

/** Strength of the screen shake at the peak of the roar, in px. */
const ROAR_SHAKE = 6;

/**
 * Smooth progress between two moments: 0 before `from`, 1 after `to`,
 * with slow starts and ends (smoothstep: x * x * (3 - 2x)).
 * @param {number} t time in seconds
 * @param {number} from
 * @param {number} to
 */
function smooth(t, from, to) {
  const x = Math.max(0, Math.min(1, (t - from) / (to - from)));
  return x * x * (3 - 2 * x);
}

/**
 * @returns {{eyeLevel:number, falls:number, lavaRise:number, ambient:number, glow:number,
 *   roar:number, jawOpen:boolean, shake:number, hud:number}} a pose object to reuse with sampleIntro()
 */
export function createIntroPose() {
  return { eyeLevel: 0, falls: 0, lavaRise: 0, ambient: 0, glow: 0, roar: 0, jawOpen: false, shake: 0, hud: 0 };
}

/**
 * Compute everything that is animated in the opening scene at time `t`.
 * It keeps no state, so it gives the same result at any frame rate, and the
 * scene can be tested (or tuned) by asking for any moment.
 *
 * Complexity O(1); writes into `out` and allocates nothing.
 *
 * @param {number} t seconds since the scene started
 * @param {ReturnType<typeof createIntroPose>} out result object, written in place
 * @returns {ReturnType<typeof createIntroPose>} out
 *   eyeLevel: eye light 0 to 1 · falls: width of the two lava streams 0 to 1 ·
 *   lavaRise: lava height 0 (none) to 1 (resting level), a little above 1 during the roar ·
 *   ambient: how visible the room is 0 to 1 · glow: strength of the lava light 0 to 1 ·
 *   roar: pulse 0 to 1 · jawOpen: roar frame · shake: screen shake in px · hud: health bar opacity 0 to 1
 */
export function sampleIntro(t, out) {
  const c = CAVE_INTRO;

  // The eyes come on in two stages: a weak blink, then fully.
  out.eyeLevel = 0.35 * smooth(t, ...c.eyesFlicker) + 0.65 * smooth(t, ...c.eyesWake);

  out.falls = smooth(t, ...c.fallsIn) * (1 - smooth(t, ...c.fallsOut));
  out.glow = smooth(t, ...c.glow);
  out.ambient = smooth(t, ...c.ambient);

  const pulse = smooth(t, ...c.roarIn) * (1 - smooth(t, ...c.roarOut));
  out.roar = pulse;
  out.jawOpen = t >= c.jaw[0] && t < c.jaw[1];
  out.shake = ROAR_SHAKE * pulse;

  // The roar makes the lava surge a little above its resting level.
  out.lavaRise = smooth(t, ...c.lavaRise) + ROAR_SURGE * pulse;

  out.hud = smooth(t, ...c.hud);
  return out;
}