// The spike: a small device the carrier plants inside a site and the defender
// defuses. Planting takes 3 seconds of standing in the ring (the bot does it);
// the defender defuses by standing in the ring and holding E — 4 seconds, or 2
// with a defuse kit. Once planted the spike beeps faster as its 35-second timer
// runs down, and the round ends when it blows.
import * as THREE from 'three';

export const BOMB_SECONDS = 35;
export const DEFUSE_SECONDS = 4;
export const DEFUSE_KIT_SECONDS = 2;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.26, 0.32),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a4350'), roughness: 0.5, metalness: 0.4 }),
  );
  body.position.y = 0.13;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb020') }),
  );
  light.position.set(0, 0.32, 0);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8e4d8') }),
  );
  antenna.position.set(0.12, 0.36, 0);
  group.add(body, light, antenna);
  group.visible = false;
  scene.add(group);

  const state = {
    planted: false,
    plantAt: 0,
    site: null,
    defusing: false,
    defuseAt: 0,
    beepAt: 0,
  };

  return {
    state,
    group,
    plant(site, time) {
      state.planted = true;
      state.site = site;
      state.plantAt = time;
      state.defusing = false;
      group.position.set(site.center.x, 0, site.center.z);
      group.visible = true;
    },
    clear() {
      state.planted = false;
      state.site = null;
      state.defusing = false;
      group.visible = false;
    },
    // Seconds left on the planted spike, or null when it is not planted.
    timeLeft(time) {
      if (!state.planted) return null;
      return Math.max(0, BOMB_SECONDS - (time - state.plantAt));
    },
    // The defender holds E inside the ring. Returns 'defused' when done,
    // 'tick' while the channel runs, 'idle' otherwise.
    defuseStep(holding, inRing, kit, time) {
      if (!state.planted) return 'idle';
      if (holding && inRing) {
        if (!state.defusing) {
          state.defusing = true;
          state.defuseAt = time;
        }
        const need = kit ? DEFUSE_KIT_SECONDS : DEFUSE_SECONDS;
        if (time - state.defuseAt >= need) {
          this.clear();
          return 'defused';
        }
        return 'tick';
      }
      state.defusing = false;
      return 'idle';
    },
    defuseProgress(time) {
      if (!state.defusing) return 0;
      return Math.min(1, (time - state.defuseAt) / (this.hasKit ? DEFUSE_KIT_SECONDS : DEFUSE_SECONDS));
    },
    hasKit: false,
    // A beep whose interval shrinks as the timer runs out; main.js plays it.
    beepDue(time) {
      if (!state.planted) return false;
      const left = this.timeLeft(time);
      const interval = left > 20 ? 1.0 : left > 10 ? 0.55 : 0.28;
      if (time - state.beepAt >= interval) {
        state.beepAt = time;
        return true;
      }
      return false;
    },
    blink(time) {
      if (!state.planted) return;
      const on = Math.sin(time * 10) > 0;
      light.material.color.set(on ? '#ff5a3c' : '#ffb020');
    },
  };
}
