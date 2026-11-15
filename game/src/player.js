// First-person movement: acceleration and friction on the ground, a jump with
// gravity, crouching that shrinks the body, and a box resolved against the world's
// axis-aligned colliders one axis at a time, so a wall slides the mover along it
// instead of swallowing them. The resolver is shared: bots walk with the same code.
import * as THREE from 'three';

export const BODY = {
  radius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
};

const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const AIM_SPEED = 2.7;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

// Slide a body-sized box from `from` by `delta`, axis by axis. Returns the position
// the box ends at; `hit` reports which axes were blocked. `lift` keeps the feet and
// the crown out of the horizontal tests, so standing on a floor is not read as
// walking into a wall.
export function slideBox(colliders, from, delta, radius, height) {
  const pos = from.clone();
  const hit = { x: false, y: false, z: false };
  const probe = new THREE.Box3();
  const test = (x, y, z) => {
    probe.min.set(x - radius, y + 0.04, z - radius);
    probe.max.set(x + radius, y + height - 0.04, z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  };
  const nx = pos.x + delta.x;
  if (!test(nx, pos.y, pos.z)) pos.x = nx;
  else hit.x = true;
  const nz = pos.z + delta.z;
  if (!test(pos.x, pos.y, nz)) pos.z = nz;
  else hit.z = true;
  const ny = pos.y + delta.y;
  const floor = test(pos.x, ny, pos.z);
  if (!floor) pos.y = ny;
  else {
    hit.y = true;
    pos.y = delta.y <= 0 ? floor.max.y : floor.min.y - height;
  }
  return { pos, hit };
}

export function createPlayer(colliders, spawn) {
  const feet = new THREE.Vector3(spawn.x, 0, spawn.z);
  const velocity = new THREE.Vector3();
  const state = {
    feet,
    velocity,
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    eye: BODY.standEye,
    height: BODY.standHeight,
    onGround: true,
    crouched: false,
    aiming: false,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function addRecoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouchKey = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouchKey && !state.crouched) {
      state.crouched = true;
      state.height = BODY.crouchHeight;
    } else if (!crouchKey && state.crouched) {
      // Stand up only when the full height fits; otherwise stay crouched.
      const probe = new THREE.Box3();
      probe.min.set(feet.x - BODY.radius, feet.y + 0.02, feet.z - BODY.radius);
      probe.max.set(feet.x + BODY.radius, feet.y + BODY.standHeight - 0.02, feet.z + BODY.radius);
      if (!colliders.some((c) => probe.intersectsBox(c))) {
        state.crouched = false;
        state.height = BODY.standHeight;
      }
    }
    const eyeTarget = state.crouched ? BODY.crouchEye : BODY.standEye;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = state.crouched ? CROUCH_SPEED : state.aiming ? AIM_SPEED : WALK_SPEED;
    const accel = state.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const blend = Math.min(1, (accel * dt) / speed);
    velocity.x += (wish.x * speed - velocity.x) * blend;
    velocity.z += (wish.z * speed - velocity.z) * blend;
    if (state.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      velocity.x *= damp;
      velocity.z *= damp;
    }
    if (keys.has('Space') && state.onGround) {
      velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    velocity.y = Math.max(-30, velocity.y - GRAVITY * dt);

    const moved = slideBox(
      colliders,
      feet,
      new THREE.Vector3(velocity.x * dt, velocity.y * dt, velocity.z * dt),
      BODY.radius,
      state.height,
    );
    feet.copy(moved.pos);
    if (moved.hit.x) velocity.x = 0;
    if (moved.hit.z) velocity.z = 0;
    if (moved.hit.y) {
      state.onGround = velocity.y <= 0;
      velocity.y = 0;
    } else {
      state.onGround = false;
    }
    if (feet.y < 0) {
      feet.y = 0;
      velocity.y = 0;
      state.onGround = true;
    }
  }

  return {
    state,
    step,
    look,
    addRecoil,
    eyePosition(out) {
      return out.set(feet.x, feet.y + state.eye, feet.z);
    },
    groundSpeed() {
      return Math.hypot(velocity.x, velocity.z);
    },
    respawn(at) {
      feet.set(at.x, 0, at.z);
      velocity.set(0, 0, 0);
      state.yaw = at.yaw ?? 0;
      state.pitch = 0;
    },
  };
}
