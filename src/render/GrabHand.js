// src/render/GrabHand.js
// The skeleton's hand rising out of the ground, closing into a fist and pulling the player down.

/**
 * Timeline of the grab scene, in seconds from the moment the scene starts.
 * It is shared by the hand, the rumble and the fade, so there is one source of timing.
 */
export const GRAB_TIMELINE = {
  shakeIn: 0.3, // the rumble ramps up over the first 0.3 s
  rise: [0.5, 1.3], // the open hand comes out of the ground
  grabAt: 1.3, // the hand closes into a fist around the player
  pull: [1.5, 2.1], // the fist pulls down into the ground
  shakeOut: [1.8, 2.0], // the rumble dies away
  fadeOut: [1.7, 2.5], // the screen goes black
  restartAt: 2.5, // black screen: the next level will be loaded here
  fadeIn: [2.5, 3.1], // the screen comes back
  duration: 3.1,
};

/** Where the middle of the palm is, as a fraction of the sprite height measured from the wrist. */
const PALM = 0.4;

/** @returns {number} v limited to [0, 1] */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/** Fast at the start, slow at the end: a heavy thing pushing out of the ground. */
function easeOut(x) {
  return 1 - (1 - x) * (1 - x) * (1 - x);
}

/** Slow at the start, fast at the end: being yanked down. */
function easeIn(x) {
  return x * x;
}

/**
 * The hand of the boss. The sprite strip has two frames side by side:
 * 0 = open hand with the fingers pointing down, 1 = clenched fist. Both
 * frames have the wrist at the top. The hand is drawn flipped upside down,
 * so the fingers point up and the wrist is below the ground.
 *
 * poseAt() only computes numbers (no canvas), writes into one reused object,
 * and can be tested in Node. Complexity: poseAt and draw are O(1); memory
 * O(1), nothing is allocated while the scene plays.
 */
export class GrabHand {
  /**
   * @param {{width:number, height:number}} strip image with two frames side by side
   */
  constructor(strip) {
    this.strip = strip;
    this.frameW = Math.floor(strip.width / 2);
    this.height = strip.height;
    /** Reused result of poseAt(). */
    this.pose = { wristY: 0, frame: 0, visible: false };
  }

  /**
   * Compute where the hand is at a given scene time.
   * @param {number} t scene time in seconds
   * @param {number} groundY world y of the ground surface the hand comes out of
   * @param {number} targetY world y of the middle of the player's body
   * @returns {{wristY:number, frame:number, visible:boolean}} the reused pose object:
   *   wristY = world y of the wrist, frame = 0 (open) or 1 (fist),
   *   visible = false once the whole hand is below the ground
   */
  poseAt(t, groundY, targetY) {
    const tl = GRAB_TIMELINE;
    const hidden = groundY + this.height; // wrist so low that the whole hand is under the ground
    const risen = targetY + PALM * this.height; // palm in front of the player's body

    let y;
    if (t < tl.pull[0]) {
      y = hidden + (risen - hidden) * easeOut(clamp01((t - tl.rise[0]) / (tl.rise[1] - tl.rise[0])));
    } else {
      y = risen + (hidden - risen) * easeIn(clamp01((t - tl.pull[0]) / (tl.pull[1] - tl.pull[0])));
    }

    const pose = this.pose;
    pose.wristY = y;
    pose.frame = t >= tl.grabAt ? 1 : 0;
    pose.visible = y - this.height < groundY; // some part is above the ground
    return pose;
  }

  /**
   * Draw the hand in world space. Everything below the ground line is clipped
   * away, so the hand really seems to come out of the ground.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t scene time in seconds
   * @param {number} x world x of the middle of the hand
   * @param {number} groundY world y of the ground surface
   * @param {number} targetY world y of the middle of the player's body
   */
  draw(ctx, t, x, groundY, targetY) {
    const pose = this.poseAt(t, groundY, targetY);
    if (!pose.visible) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - this.frameW, groundY - this.height * 2, this.frameW * 2, this.height * 2); // everything above the ground
    ctx.clip();
    ctx.translate(Math.round(x), Math.round(pose.wristY));
    ctx.scale(1, -1); // upside down: the fingers point up
    ctx.drawImage(
      this.strip,
      pose.frame * this.frameW, 0, this.frameW, this.height,
      -Math.round(this.frameW / 2), 0, this.frameW, this.height
    );
    ctx.restore();
  }
}