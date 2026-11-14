// src/render/TuningPanel.js
// Developer panel: sliders that edit CONFIG while the game runs (toggle with P).

import { CONFIG } from '../config.js';

/**
 * Parameters shown in the panel. `path` points into CONFIG, for example
 * 'physics.gravity'. Ranges keep speed caps below tileSize / fixedStep
 * (1920 px/s), the speed at which one step could skip a whole tile.
 */
export const TUNABLES = [
  { label: 'Gravity', path: 'physics.gravity', min: 400, max: 3000, step: 50 },
  { label: 'Max speed X', path: 'physics.maxSpeedX', min: 300, max: 1500, step: 50 },
  { label: 'Max speed Y', path: 'physics.maxSpeedY', min: 300, max: 1500, step: 50 },
  { label: 'Max run speed', path: 'player.maxRunSpeed', min: 80, max: 500, step: 10 },
  { label: 'Run accel (ground)', path: 'player.runAccelGround', min: 500, max: 4000, step: 100 },
  { label: 'Run accel (air)', path: 'player.runAccelAir', min: 100, max: 2500, step: 50 },
  { label: 'Friction (ground)', path: 'player.frictionGround', min: 200, max: 4000, step: 100 },
  { label: 'Friction (air)', path: 'player.frictionAir', min: 0, max: 600, step: 10 },
  { label: 'Recoil impulse', path: 'weapon.recoilImpulse', min: 200, max: 1500, step: 25 },
  { label: 'Reload time (s)', path: 'weapon.reloadTime', min: 0.1, max: 1.5, step: 0.05 },
  { label: 'Pellets', path: 'weapon.pellets', min: 1, max: 16, step: 1 },
  { label: 'Spread (deg)', path: 'weapon.spreadDegrees', min: 0, max: 60, step: 1 },
  { label: 'Range (px)', path: 'weapon.range', min: 64, max: 600, step: 16 },
  { label: 'Tracer life (s)', path: 'weapon.tracerLifetime', min: 0.05, max: 0.5, step: 0.01 },
];

/** Walk a dotted path like 'physics.gravity' and return the owning object and key. */
function resolve(path) {
  const keys = path.split('.');
  const last = keys.pop();
  let obj = CONFIG;
  for (const key of keys) obj = obj[key];
  return { obj, last };
}

/** @param {string} path dotted path into CONFIG @returns {number} current value */
export function getValue(path) {
  const { obj, last } = resolve(path);
  return obj[last];
}

/** @param {string} path dotted path into CONFIG @param {number} value new value */
export function setValue(path, value) {
  const { obj, last } = resolve(path);
  obj[last] = value;
}

/** How many decimals to show for a slider step (0.05 -> 2, 10 -> 0). */
function decimalsOf(step) {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * Live tuning panel. Dragging a slider writes straight into CONFIG, and the
 * game reads CONFIG every step, so the change is felt immediately.
 *
 * The data part (TUNABLES, getValue, setValue, exportText) has no DOM access
 * and can be tested in Node; only mount() builds HTML elements.
 * Complexity: O(number of tunables) when building; nothing runs per frame.
 */
export class TuningPanel {
  constructor() {
    /** Values at start-up, used by reset(). */
    this.defaults = TUNABLES.map((t) => getValue(t.path));
    /** One entry per slider: { input, valueEl }. */
    this.rows = [];
    this.root = null;
    this.handleKey = (e) => {
      if (e.code === 'KeyP' && !e.repeat) this.toggle();
    };
  }

  /**
   * Build the panel and add it to the page (hidden until P is pressed).
   * @param {HTMLElement} [parent] where to put the panel
   */
  mount(parent = document.body) {
    const root = document.createElement('div');
    root.style.cssText =
      'position:fixed;top:8px;right:8px;width:300px;max-height:90vh;overflow-y:auto;' +
      'padding:8px 10px;background:rgba(10,12,20,0.88);color:#f2f2f2;font:12px sans-serif;' +
      'border:1px solid #3a4160;border-radius:6px;display:none;z-index:10;';

    const title = document.createElement('div');
    title.textContent = 'Tuning (press P to hide)';
    title.style.cssText = 'font-weight:bold;margin-bottom:6px;';
    root.appendChild(title);

    TUNABLES.forEach((t, i) => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:grid;grid-template-columns:120px 1fr 44px;gap:6px;align-items:center;margin:3px 0;';

      const label = document.createElement('span');
      label.textContent = t.label;

      const input = document.createElement('input');
      input.type = 'range';
      input.min = t.min;
      input.max = t.max;
      input.step = t.step;
      input.value = getValue(t.path);

      const valueEl = document.createElement('span');
      valueEl.style.textAlign = 'right';

      input.addEventListener('input', () => {
        setValue(t.path, Number(input.value));
        this.syncRow(i);
      });

      row.append(label, input, valueEl);
      root.appendChild(row);
      this.rows.push({ input, valueEl });
      this.syncRow(i);
    });

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => this.reset());

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy values';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.exportText()).catch(() => {});
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy values'), 1000);
    });

    buttons.append(resetBtn, copyBtn);
    root.appendChild(buttons);

    parent.appendChild(root);
    this.root = root;
    window.addEventListener('keydown', this.handleKey);
  }

  /** Show or hide the panel. */
  toggle() {
    if (this.root === null) return;
    this.root.style.display = this.root.style.display === 'none' ? 'block' : 'none';
  }

  /** Put one slider and its number label in line with the current CONFIG value. */
  syncRow(i) {
    const value = getValue(TUNABLES[i].path);
    this.rows[i].input.value = value;
    this.rows[i].valueEl.textContent = value.toFixed(decimalsOf(TUNABLES[i].step));
  }

  /** Restore every value to what it was when the game started. */
  reset() {
    TUNABLES.forEach((t, i) => {
      setValue(t.path, this.defaults[i]);
      if (this.rows.length > 0) this.syncRow(i);
    });
  }

  /**
   * Current values as text, one "path = value" per line, ready to paste into
   * config.js or into the report.
   * @returns {string}
   */
  exportText() {
    return TUNABLES.map((t) => `${t.path} = ${getValue(t.path)}`).join('\n');
  }
}