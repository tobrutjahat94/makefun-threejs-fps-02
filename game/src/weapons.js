// The armoury: four hitscan weapons plus the frag. Each definition owns its own
// numbers — damage, head multiplier, magazine, fire gap, reload, spread and price —
// and the view model is built from boxes per weapon, so the rifle, the SMG, the
// scoped DMR and the pump shotgun all read differently at a glance. main.js owns
// the ray and the damage; this module owns the gun in the player's hands.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  vandal: {
    name: 'Vandal', key: '1', price: 0, auto: true,
    damage: 34, headMult: 4, pellets: 1,
    mag: 30, reserve: 90, fireGap: 0.096, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, spreadAir: 0.012,
    falloffStart: 18, falloffEnd: 46, falloffMin: 0.6,
    barrel: 0.42, scope: false, pump: false,
  },
  hornet: {
    name: 'Hornet', key: '2', price: 700, auto: true,
    damage: 20, headMult: 4, pellets: 1,
    mag: 32, reserve: 128, fireGap: 0.07, reloadTime: 1.6,
    spreadStill: 0.004, spreadMove: 0.022, spreadAir: 0.01,
    falloffStart: 12, falloffEnd: 34, falloffMin: 0.55,
    barrel: 0.26, scope: false, pump: false,
  },
  longshot: {
    name: 'Longshot', key: '3', price: 1100, auto: false,
    damage: 80, headMult: 2, pellets: 1,
    mag: 10, reserve: 30, fireGap: 0.55, reloadTime: 2.4,
    spreadStill: 0.0008, spreadMove: 0.02, spreadAir: 0.02,
    falloffStart: 24, falloffEnd: 60, falloffMin: 0.75,
    barrel: 0.6, scope: true, pump: false, adsFov: 42,
  },
  breacher: {
    name: 'Breacher', key: '4', price: 600, auto: false,
    damage: 12, headMult: 2, pellets: 8,
    mag: 8, reserve: 24, fireGap: 0.8, reloadTime: 2.6,
    spreadStill: 0.02, spreadMove: 0.024, spreadAir: 0.016,
    falloffStart: 6, falloffEnd: 18, falloffMin: 0.25,
    barrel: 0.5, scope: false, pump: true,
  },
};

export const ORDER = ['vandal', 'hornet', 'longshot', 'breacher'];
export const FRAG_PRICE = 250;
export const ARMOR_PRICE = 500;
export const KIT_PRICE = 200;

export function createWeapons(camera) {
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const light = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0a0d11'), roughness: 0.9, metalness: 0.05 });

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.15, -0.6);
  camera.add(flashLight);

  const owned = { vandal: { mag: WEAPONS.vandal.mag, reserve: WEAPONS.vandal.reserve } };
  let current = 'vandal';
  let model = null;
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, reloadTotal: 1 };

  function buildModel(def) {
    const group = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.4), light);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), metal);
    barrel.position.set(0, 0.028, -0.2 - def.barrel / 2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, 0.28);
    group.add(receiver, barrel, stock);
    if (def.scope) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), metal);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.075, -0.05);
      group.add(tube);
    }
    if (def.pump) {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.18), grip);
      pump.position.set(0, -0.02, -0.3);
      group.add(pump);
    }
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), grip);
    mag.position.set(0, -0.11, 0.02);
    mag.rotation.x = 0.12;
    group.add(mag);
    group.position.set(0.24, -0.2, -0.42);
    return group;
  }

  function swapModel() {
    if (model) {
      camera.remove(model);
      model.traverse((mesh) => {
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    }
    model = buildModel(WEAPONS[current]);
    camera.add(model);
  }
  swapModel();

  function damageAt(def, distance) {
    if (distance <= def.falloffStart) return def.damage;
    if (distance >= def.falloffEnd) return def.damage * def.falloffMin;
    const t = (distance - def.falloffStart) / (def.falloffEnd - def.falloffStart);
    return def.damage * (1 - (1 - def.falloffMin) * t);
  }

  return {
    defs: WEAPONS,
    owned,
    current() {
      return current;
    },
    def() {
      return WEAPONS[current];
    },
    state,
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      if (model) {
        model.position.z = -0.42 + state.kick;
        model.rotation.x = state.kick * 2.2;
        if (state.reloadLeft > 0) {
          model.rotation.x = -0.55 * Math.min(1, ((state.reloadTotal - state.reloadLeft) / state.reloadTotal) * 2);
        }
      }
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        if (state.reloadLeft === 0) {
          const def = WEAPONS[current];
          const slot = owned[current];
          const take = Math.min(def.mag - slot.mag, slot.reserve);
          slot.mag += take;
          slot.reserve -= take;
        }
      }
    },
    ready() {
      const slot = owned[current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[current].fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (owned[current].mag <= 0) return false;
      owned[current].mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[current];
      const slot = owned[current];
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return false;
      state.reloadLeft = def.reloadTime;
      state.reloadTotal = def.reloadTime;
      return true;
    },
    spread(speed, aiming, airborne) {
      const def = WEAPONS[current];
      let value = def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
      if (airborne) value += def.spreadAir;
      if (aiming) value *= 0.35;
      return value;
    },
    // Buy a weapon (or refill an owned one) during the buy phase. Returns the
    // price paid, or -1 when the player already owns it full.
    buy(id) {
      const def = WEAPONS[id];
      if (!def || id === 'vandal') return -1;
      if (owned[id]) {
        const slot = owned[id];
        if (slot.reserve === def.reserve && slot.mag === def.mag) return -1;
        slot.reserve = def.reserve;
        return Math.floor(def.price / 2);
      }
      owned[id] = { mag: def.mag, reserve: def.reserve };
      return def.price;
    },
    equip(id) {
      if (!owned[id] || id === current) return false;
      current = id;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      swapModel();
      return true;
    },
    refillCurrent() {
      const def = WEAPONS[current];
      owned[current] = { mag: def.mag, reserve: def.reserve };
    },
    refillAll() {
      for (const id of Object.keys(owned)) {
        owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
    },
    damageAt,
    muzzleWorld(out) {
      // The tip of the barrel, in world space — where tracers start.
      const def = WEAPONS[current];
      out.set(0.24, -0.17, -0.42 - def.barrel);
      return camera.localToWorld(out);
    },
  };
}
