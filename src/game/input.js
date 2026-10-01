/**
 * Keyboard / mouse / pointer-lock input.
 *
 * The game asks the Input object for held keys and for "pressed this frame"
 * edges; it never touches DOM events directly.
 */

const KEY_ALIASES = {
  Space: 'jump',
  ShiftLeft: 'sneak',
  ShiftRight: 'sneak',
  ControlLeft: 'sprint',
  ControlRight: 'sprint',
};

const UI_CONTROL_SELECTOR = 'button, input, select, textarea, a[href], label, [contenteditable="true"], [role="button"], [role="slider"]';

function isUiControl(target) {
  return target instanceof Element && target.closest(UI_CONTROL_SELECTOR) !== null;
}

export class Input {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: new Set(), wheel: 0 };
    this.mouseDownEvents = [];
    this.touchLook = { dx: 0, dy: 0 };
    this.touchMove = { x: 0, y: 0 };
    this.locked = false;
    this.sensitivity = options.sensitivity ?? 0.0022;
    this.invertY = options.invertY ?? false;
    this.enabled = true;
    this.onKey = options.onKey || null;
    this.onMouseDown = options.onMouseDown || null;
    this.onWheel = options.onWheel || null;
    this.onLockChange = options.onLockChange || null;
    /** Set while a text field (chat, seed input, search) owns the keyboard. */
    this.textMode = false;

    this._bind();
  }

  _bind() {
    this._onKeyDown = (event) => {
      if (this.textMode) return;
      if (isUiControl(event.target)) return;
      // Let the browser keep its own shortcuts (reload, close tab, devtools, ...).
      if (event.metaKey || event.altKey
        || (event.ctrlKey && event.code !== 'ControlLeft' && event.code !== 'ControlRight' && event.code !== 'Space')) {
        return;
      }
      const code = KEY_ALIASES[event.code] || event.code;
      if (!this.keys.has(code)) this.pressedThisFrame.add(code);
      this.keys.add(code);
      // Stop the browser from scrolling or tabbing away on game keys, but let
      // Ctrl+W / Ctrl+R through so the page stays closable.
      if (['Tab', 'F3', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)
        && (!event.ctrlKey || event.code === 'Space')
        && !event.metaKey) {
        event.preventDefault();
      }
      if (this.onKey) this.onKey(code, event);
    };

    this._onKeyUp = (event) => {
      const code = KEY_ALIASES[event.code] || event.code;
      this.keys.delete(code);
      this.releasedThisFrame.add(code);
      if (this.textMode) return;
      if (this.onKey) this.onKey(code, event, true);
    };

    this._onMouseMove = (event) => {
      if (!this.locked) return;
      this.mouse.dx += event.movementX || 0;
      this.mouse.dy += event.movementY || 0;
    };

    this._onMouseDown = (event) => {
      if (this.textMode || !this.locked) return;
      this.mouse.buttons.add(event.button);
      this.mouseDownEvents.push(event.button);
      if (this.onMouseDown) this.onMouseDown(event.button, event);
      event.preventDefault();
    };

    this._onMouseUp = (event) => {
      this.mouse.buttons.delete(event.button);
      if (this.locked) event.preventDefault();
    };

    this._onWheel = (event) => {
      if (!this.locked || isUiControl(event.target)) return;
      this.mouse.wheel += Math.sign(event.deltaY);
      if (this.onWheel) this.onWheel(Math.sign(event.deltaY));
      event.preventDefault();
    };

    this._onContextMenu = (event) => event.preventDefault();

    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.mouse.buttons.clear();
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons.clear(); });
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  requestLock() {
    if (this.locked) return;
    const promise = this.canvas.requestPointerLock?.();
    if (promise && typeof promise.catch === 'function') promise.catch(() => {});
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressedThisFrame.has(code);
  }

  /** Call once per frame, after the game has consumed the edges. */
  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.touchLook.dx = 0;
    this.touchLook.dy = 0;
    this.mouseDownEvents.length = 0;
  }

  /** Mouse buttons that went down during this frame (edge, not held). */
  consumeClicks() {
    const events = this.mouseDownEvents.slice();
    this.mouseDownEvents.length = 0;
    return events;
  }

  mouseButton(button) {
    return this.mouse.buttons.has(button);
  }

  setTouchKey(code, pressed) {
    if (pressed) this.keys.add(code);
    else this.keys.delete(code);
  }

  setTouchMove(x, y) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  setTouchButton(button, pressed) {
    if (pressed) this.mouse.buttons.add(button);
    else this.mouse.buttons.delete(button);
  }

  addTouchLook(dx, dy) {
    this.touchLook.dx += dx;
    this.touchLook.dy += dy;
  }

  /** Look delta in radians for this frame. */
  lookDelta() {
    if (!this.enabled || (!this.locked && this.touchLook.dx === 0 && this.touchLook.dy === 0)) {
      return { yaw: 0, pitch: 0 };
    }
    return {
      yaw: -(this.mouse.dx + this.touchLook.dx) * this.sensitivity,
      pitch: (this.invertY ? this.mouse.dy + this.touchLook.dy : -(this.mouse.dy + this.touchLook.dy)) * this.sensitivity,
    };
  }
}
