// src/core/Cutscene.js
// A timeline of timed events, advanced by the fixed-step game loop.

/** Tolerance for floating-point drift when comparing times (30 steps of 1/60 may not equal 0.5 exactly). */
const TIME_EPSILON = 1e-9;

/**
 * Plays a list of timed events, for example "at 0.6 s the hand starts rising".
 * Each event is a packaged action (a function) placed on a timeline, close to
 * the Command pattern.
 *
 * The events must be given already in ascending time order. The constructor
 * checks this instead of sorting: a check is O(E) and catches mistakes at once,
 * and the project avoids built-in sorting for core code.
 *
 * Complexity: update() is O(1) when no event is due; a whole run costs O(E)
 * because a forward-only pointer visits each event exactly once.
 * Memory O(E); nothing is allocated while it plays.
 */
export class Cutscene {
  /**
   * @param {Array<{at:number, run:function(Cutscene): void}>} events actions in ascending order of `at` (seconds)
   * @param {number} duration total length in seconds; no event may be later than this
   */
  constructor(events, duration) {
    let previous = 0;
    for (let i = 0; i < events.length; i++) {
      const at = events[i].at;
      if (at < previous || at > duration) {
        throw new Error('Cutscene: events must be in ascending order of time and not after the duration');
      }
      previous = at;
    }

    this.events = events;
    this.duration = duration;
    this.time = 0; // seconds since start()
    this.next = 0; // index of the next event to run
    this.running = false;
  }

  /** @returns {boolean} true while the cutscene is playing */
  get active() {
    return this.running;
  }

  /** Begin from the start. Events at time 0 run immediately, in this very step. */
  start() {
    this.time = 0;
    this.next = 0;
    this.running = true;
    this.runDueEvents();
  }

  /**
   * Advance by one fixed step. Does nothing when not running.
   * @param {number} dt step length in seconds
   */
  update(dt) {
    if (!this.running) return;
    this.time += dt;
    this.runDueEvents(); // before the finish check, so an event at the very end still runs
    if (this.time >= this.duration - TIME_EPSILON) this.running = false;
  }

  /** Run every event whose time has come, in order. */
  runDueEvents() {
    while (this.next < this.events.length && this.events[this.next].at <= this.time + TIME_EPSILON) {
      this.events[this.next++].run(this);
    }
  }

  /**
   * How far the time is between two moments, as a number from 0 to 1, for
   * animations (for example the hand rising from 0.6 s to 1.4 s).
   * @param {number} from start of the animation, in seconds
   * @param {number} to end of the animation, in seconds
   * @returns {number} 0 before `from`, 1 after `to`
   */
    /**
   * How far a time is between two moments, as a number from 0 to 1, for
   * animations (for example the hand rising from 0.6 s to 1.4 s).
   * @param {number} from start of the animation, in seconds
   * @param {number} to end of the animation, in seconds
   * @param {number} [at] the time to evaluate; defaults to the current time. Rendering passes
   *   an interpolated time here so animations stay smooth at any frame rate.
   * @returns {number} 0 before `from`, 1 after `to`
   */
  progress(from, to, at = this.time) {
    const t = (at - from) / (to - from);
    return Math.max(0, Math.min(1, t));
  }
}