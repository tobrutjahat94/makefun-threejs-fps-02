// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. Besides the held-key set it reports edge presses (a key that
// went down since the last frame) so menus and single actions never double-fire,
// and it tracks the aim and fire buttons the same way.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const look = { x: 0, y: 0 };
  const state = {
    keys,
    locked: false,
    firing: false,
    aiming: false,
    lookX: 0,
    lookY: 0,
  };

  function down(event) {
    if (!pressed.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function up(event) {
    keys.delete(event.code);
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    state.firing = false;
    state.aiming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => {
    if (state.locked) event.preventDefault();
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    // The mouse delta since the last call, then cleared.
    takeLook() {
      look.x = state.lookX;
      look.y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    // True once for a key pressed since the last call to takePressed.
    takePressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
