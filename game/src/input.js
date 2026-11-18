/* Keyboard, pointer lock and the small deltas the camera needs.
   Keeping listeners in one place makes it easy to freeze input on pause. */

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.onLockChange = null;
    this.onEscape = null;

    this._bind();
  }

  _bind() {
    const blockScroll = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    ]);

    window.addEventListener('keydown', (e) => {
      if (blockScroll.has(e.code)) e.preventDefault();
      if (e.code === 'Escape') {
        if (this.onEscape) this.onEscape();
        return;
      }
      if (!this.enabled) return;
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.edges.clear();
      this.lookX = 0;
      this.lookY = 0;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookX += e.movementX || 0;
      this.lookY += e.movementY || 0;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });

    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
      if (this.onLockChange) this.onLockChange(false);
    });
  }

  requestLock() {
    if (this.locked) return;
    try {
      const attempt = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => {
          try { this.canvas.requestPointerLock(); } catch (err) { /* browser said no */ }
        });
      }
    } catch (err) {
      try { this.canvas.requestPointerLock(); } catch (err2) { /* headless browsers may refuse */ }
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  /** True once per physical key press. */
  pressed(code) {
    return this.edges.has(code);
  }

  /** Read and clear the mouse delta. */
  takeLook() {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  takeWheel() {
    const v = this.wheel;
    this.wheel = 0;
    return v;
  }

  /** Axis helpers so gameplay code stays readable. */
  axes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, run: this.down('ShiftLeft') || this.down('ShiftRight') };
  }

  endFrame() {
    this.edges.clear();
  }
}
