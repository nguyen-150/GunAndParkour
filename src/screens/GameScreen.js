// src/screens/GameScreen.js
// The gameplay screen: owns the state of a play session and draws it.
// Being moved here step by step from main.js (see task A0).

/**
 * Gameplay screen. Right now it only holds the two drawing helpers that
 * depend on almost no game state; update/render and the level state follow.
 *
 * Complexity: each draw method is O(1); memory O(1).
 */
export class GameScreen {
  /**
   * @param {CanvasRenderingContext2D} ctx main 2D context
   * @param {HTMLCanvasElement} canvas used for the screen size (HUD placement)
   */
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;
  }

  /**
   * Boss health bar at the top of the screen (screen space).
   * Placeholder: the boss has no health yet, so it is always full.
   * @param {number} alpha opacity 0 (hidden) to 1
   */
  drawBossBar(alpha) {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    const w = Math.min(520, this.canvas.width - 80);
    const x = Math.round((this.canvas.width - w) / 2);
    const y = 22;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(x - 3, y - 3, w + 6, 20); // dark frame
    ctx.fillStyle = '#b3141b';
    ctx.fillRect(x, y, w, 14); // the red bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x, y, w, 3); // highlight on top
    ctx.globalAlpha = 1;
  }

  /**
   * Bobbing triangle above the boss trigger zone, pointing down at it (world space).
   * @param {{x:number, y:number, width:number, height:number}|null} bossZone
   */
  drawGoalMarker(bossZone) {
    if (bossZone === null) return;
    const ctx = this.ctx;
    const cx = Math.round(bossZone.x + bossZone.width / 2);
    // The bobbing is visual only: it reads the clock but never touches the simulation.
    const bob = Math.round(Math.sin(performance.now() / 300) * 4);
    const tip = bossZone.y - 10 + bob; // the point of the triangle, just above the zone

    ctx.beginPath();
    ctx.moveTo(cx, tip);
    ctx.lineTo(cx - 12, tip - 18);
    ctx.lineTo(cx + 12, tip - 18);
    ctx.closePath();
    ctx.fillStyle = '#ffd36b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3b2a14';
    ctx.stroke();
  }
}