// SABLE YARD — boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. The player defends the yard alone against five bots
// for up to nine rounds; the carrier plants the spike at site A or B, and the
// defender defuses it or drops all five. ?shot=start|buy|fight|plant with
// &seed=N stages a deterministic frame for a capture, renders it twice, freezes
// it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeRng, range } from './rng.js';
import { createWorld, SITES, PLAYER_SPAWN } from './world.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, ORDER, FRAG_PRICE, ARMOR_PRICE, KIT_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = makeRng(seed * 7919 + 13);
const liveRng = makeRng((Date.now() % 100000) + 7);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 80);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const weapons = createWeapons(camera);
const bots = createBots(scene, world.colliders, world.shootables);
const bomb = createBomb(scene);
const rounds = createRounds();
const hud = createHud();
const audio = createAudio();
const effects = createEffects(scene);
const player = createPlayer(world.colliders, PLAYER_SPAWN);

// The player's hit spheres: invisible to the eye (no colour written) but solid to
// the bots' raycasts, so a bot's shot can tell a body hit from a head hit.
const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
proxyMat.colorWrite = false;
const proxyBody = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), proxyMat);
proxyBody.userData.proxy = true;
proxyBody.userData.part = 'torso';
const proxyHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), proxyMat);
proxyHead.userData.proxy = true;
proxyHead.userData.part = 'head';
scene.add(proxyBody, proxyHead);
const proxy = [proxyBody, proxyHead];

const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootTargets = world.shootables.concat(bots.hitMeshes);
const aimDir = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

const G = {
  health: 100,
  alive: true,
  elapsed: 0,
  started: false,
  paused: false,
  frozen: false,
  shake: 0,
  fov: 74,
  noiseAt: -99,
  noisePos: new THREE.Vector3(),
  roundEndAt: 0,
  roundEndShown: false,
  grenades: [],
  lastFireEdge: false,
};

function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function syncCamera() {
  player.eyePosition(eyePos);
  camera.position.copy(eyePos);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  if (G.shake > 0) {
    camera.rotation.x += (Math.random() * 2 - 1) * G.shake * 0.02;
    camera.rotation.z += (Math.random() * 2 - 1) * G.shake * 0.015;
  }
}

function aimAt(point) {
  player.eyePosition(eyePos);
  const dx = point.x - eyePos.x;
  const dy = point.y - eyePos.y;
  const dz = point.z - eyePos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function hurtPlayer(damage) {
  if (!G.alive || rounds.state.phase !== 'fight') return;
  const taken = rounds.state.armor ? damage * 0.5 : damage;
  G.health -= taken;
  G.shake = Math.min(1, G.shake + 0.5);
  hud.damageFlash();
  audio.hurt();
  hud.setHealth(G.health, rounds.state.armor);
  if (G.health <= 0) {
    G.health = 0;
    G.alive = false;
    endRound(false, 'You went down');
  }
}

function onBotKilled(bot, byGrenade) {
  rounds.addKill();
  hud.setKills(rounds.state.kills);
  hud.setMoney(rounds.state.money);
  hud.killfeed(`YOU  ▸  ${bot.name}${byGrenade ? '  [frag]' : ''}`);
  audio.kill();
  if (bot.carrier) {
    const next = bots.promoteCarrier({ site: SITES[rounds.state.site] });
    if (next) hud.killfeed(`SPIKE DROPPED — ${next.name} picked it up`);
  }
  if (bots.allDead()) endRound(true, 'All five attackers down');
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dry();
    return false;
  }
  camera.getWorldDirection(aimDir);
  weapons.muzzleWorld(muzzle);
  audio.shot(weapons.current());
  G.noiseAt = G.elapsed;
  G.noisePos.copy(player.state.feet);
  scene.updateMatrixWorld(true);
  let hitSomething = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    // A fresh direction per pellet: the base aim plus this pellet's own spread.
    tmpVec.copy(aimDir);
    tmpVec.x += (rng() * 2 - 1) * spread;
    tmpVec.y += (rng() * 2 - 1) * spread;
    tmpVec.z += (rng() * 2 - 1) * spread;
    tmpVec.normalize();
    raycaster.set(camera.position, tmpVec);
    const hit = raycaster.intersectObjects(shootTargets, false)[0];
    const end = hit ? hit.point.clone() : camera.position.clone().addScaledVector(raycaster.ray.direction, 60);
    effects.tracer(muzzle, end);
    if (!hit) continue;
    hitSomething = true;
    const bot = hit.object.userData.bot;
    if (bot) {
      const head = hit.object.userData.part === 'head';
      const damage = weapons.damageAt(def, hit.distance) * (head ? def.headMult : 1);
      const killed = bots.damage(bot, damage);
      hud.hitMarker(killed);
      audio.hit();
      if (killed) onBotKilled(bot, false);
    } else if (hit.face) {
      effects.impact(hit.point, hit.face.normal.clone().transformDirection(hit.object.matrixWorld));
    }
  }
  weapons.pullTrigger();
  player.addRecoil(0.009 + rng() * 0.004, (rng() * 2 - 1) * 0.004);
  hud.setAmmo(weapons.owned[weapons.current()].mag, weapons.owned[weapons.current()].reserve, def.name);
  return hitSomething;
}

function throwFrag() {
  const r = rounds.state;
  if (r.phase !== 'fight' || r.frags <= 0 || !G.alive) return;
  r.frags -= 1;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c3542'), roughness: 0.6, metalness: 0.5 }),
  );
  camera.getWorldDirection(tmpVec);
  mesh.position.copy(camera.position).addScaledVector(tmpVec, 0.5);
  scene.add(mesh);
  const vel = tmpVec.clone().multiplyScalar(15);
  vel.y += 4.5;
  G.grenades.push({ mesh, vel, fuse: 1.8 });
  audio.shot('hornet');
}

const grenadeBox = new THREE.Box3();
function stepGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i -= 1) {
    const g = G.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    const next = g.mesh.position.clone().addScaledVector(g.vel, dt);
    // A cheap bounce: if the next spot is inside a collider, kill that axis.
    grenadeBox.min.set(next.x - 0.1, next.y - 0.1, next.z - 0.1);
    grenadeBox.max.set(next.x + 0.1, next.y + 0.1, next.z + 0.1);
    const hit = world.colliders.find((c) => grenadeBox.intersectsBox(c));
    if (hit) {
      if (Math.abs(g.vel.x) > Math.abs(g.vel.z)) g.vel.x *= -0.45;
      else g.vel.z *= -0.45;
      if (next.y < hit.max.y + 0.1 && g.vel.y < 0) {
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        next.y = hit.max.y + 0.1;
      }
    }
    if (next.y < 0.09) {
      next.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.45;
      g.vel.x *= 0.8;
      g.vel.z *= 0.8;
    }
    g.mesh.position.copy(next);
    if (g.fuse <= 0) {
      scene.remove(g.mesh);
      G.grenades.splice(i, 1);
      effects.explosion(next);
      audio.explode();
      G.noiseAt = G.elapsed;
      G.noisePos.copy(next);
      G.shake = Math.min(1, G.shake + 0.4);
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.pos.x - next.x, bot.pos.z - next.z);
        if (d < 6.5) {
          const killed = bots.damage(bot, 130 * (1 - d / 6.5));
          if (killed) onBotKilled(bot, true);
        }
      }
      const pd = Math.hypot(player.state.feet.x - next.x, player.state.feet.z - next.z);
      if (pd < 4) hurtPlayer(55 * (1 - pd / 4));
    }
  }
}

function buyMenuItems() {
  const items = {};
  for (const id of ORDER) {
    const def = WEAPONS[id];
    items[id] = { price: def.price, owned: Boolean(weapons.owned[id]), label: `${def.name} — ${def.mag} rnd` };
  }
  items.frag = { price: FRAG_PRICE, owned: rounds.state.frags >= 2, label: `Frag grenade (${rounds.state.frags}/2)` };
  items.armor = { price: ARMOR_PRICE, owned: rounds.state.armor, label: 'Armour — halves damage' };
  items.kit = { price: KIT_PRICE, owned: rounds.state.kit, label: 'Defuse kit — defuse in 2s' };
  return items;
}

function tryBuy(id) {
  const r = rounds.state;
  if (r.phase !== 'buy') return;
  if (id === 'frag') {
    if (r.frags >= 2) return;
    if (!rounds.spend(FRAG_PRICE)) return audio.denied();
    rounds.buyFrag();
  } else if (id === 'armor') {
    if (r.armor) return;
    if (!rounds.spend(ARMOR_PRICE)) return audio.denied();
    rounds.buyArmor();
  } else if (id === 'kit') {
    if (r.kit) return;
    if (!rounds.spend(KIT_PRICE)) return audio.denied();
    rounds.buyKit();
  } else {
    const price = weapons.buy(id);
    if (price < 0) return;
    if (!rounds.spend(price)) {
      // Roll the purchase back: the buy already added the weapon.
      if (weapons.owned[id] && price === WEAPONS[id].price) delete weapons.owned[id];
      return audio.denied();
    }
    weapons.equip(id);
  }
  audio.buy();
  hud.setMoney(r.money);
  hud.showBuy(buyMenuItems(), r.money);
  hud.setAmmo(weapons.owned[weapons.current()].mag, weapons.owned[weapons.current()].reserve, weapons.def().name);
  hud.setHealth(G.health, r.armor);
}

function deploy() {
  audio.unlock();
  if (rounds.state.phase === 'buy') {
    hud.hideBuy();
    rounds.startFight(G.elapsed);
    hud.showBanner(`ROUND ${rounds.state.round}`, `Spike site ${rounds.state.site} — hold the yard`);
    input.requestLock();
  }
}

function endRound(won, reason) {
  const r = rounds.state;
  if (r.phase !== 'fight') return;
  bomb.clear();
  const over = rounds.endRound(won, reason, G.elapsed);
  G.roundEndAt = G.elapsed;
  G.roundEndShown = false;
  if (won) audio.roundWin();
  else audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
}

function startMatch() {
  G.health = 100;
  G.alive = true;
  G.grenades.forEach((g) => scene.remove(g.mesh));
  G.grenades = [];
  weapons.refillAll();
  rounds.startMatch(G.elapsed);
  bots.reset(rounds.state.round, rounds.state.site);
  player.respawn(PLAYER_SPAWN);
  bomb.clear();
  hud.setHealth(100, false);
  hud.setKills(0);
  hud.setMoney(rounds.state.money);
  hud.setScore(0, 0, 1);
  hud.setBomb('');
  hud.setIntel('');
  hud.setDefuse(0);
  hud.showBuy(buyMenuItems(), rounds.state.money);
}

function onLockChange(locked) {
  if (shot) return;
  const phase = rounds.state.phase;
  if (locked) {
    G.started = true;
    G.paused = false;
    hud.hideOverlay();
  } else if (phase === 'fight' && G.alive) {
    G.paused = true;
    hud.showOverlay('paused');
  }
}

function step(dt) {
  G.elapsed += dt;
  const r = rounds.state;

  if (r.phase === 'buy') {
    if (rounds.phaseLeft(G.elapsed) <= 0) deploy();
    hud.setTimer(`BUY ${fmtClock(rounds.phaseLeft(G.elapsed))}`);
  } else if (r.phase === 'fight') {
    const left = bomb.state.planted ? bomb.timeLeft(G.elapsed) : rounds.phaseLeft(G.elapsed);
    hud.setTimer(bomb.state.planted ? `SPIKE ${fmtClock(left)}` : fmtClock(left));
    if (bomb.state.planted && left <= 0) {
      effects.explosion(new THREE.Vector3(bomb.state.site.center.x, 0.5, bomb.state.site.center.z));
      audio.explode();
      G.health = 0;
      G.alive = false;
      endRound(false, `The spike blew site ${bomb.state.site.name}`);
    } else if (!bomb.state.planted && rounds.phaseLeft(G.elapsed) <= 0) {
      endRound(true, 'The spike never landed');
    }
  }

  if (r.phase === 'roundEnd' || r.phase === 'matchEnd') {
    if (!G.roundEndShown) {
      G.roundEndShown = true;
      const score = rounds.scoreText();
      if (r.phase === 'matchEnd') {
        hud.showOverlay('matchEnd', { won: r.matchWon, score, kills: r.kills });
      } else {
        hud.showOverlay('roundEnd', { won: r.lastWon, reason: r.lastReason, score });
      }
    }
  }

  player.step(dt, input.state.keys);
  player.state.aiming = input.state.aiming && r.phase === 'fight';
  weapons.step(dt);
  effects.step(dt);
  bomb.blink(G.elapsed);
  if (bomb.beepDue(G.elapsed)) audio.plantBeep();
  stepGrenades(dt);
  G.shake = Math.max(0, G.shake - dt * 2.2);

  // The player's hit spheres follow the body for the bots' raycasts.
  player.eyePosition(eyePos);
  proxyBody.position.set(player.state.feet.x, player.state.feet.y + 0.95, player.state.feet.z);
  proxyHead.position.set(player.state.feet.x, player.state.feet.y + 1.5, player.state.feet.z);

  // Aim-down-sights: narrow the field of view toward the weapon's scoped value.
  const def = weapons.def();
  const targetFov = player.state.aiming ? (def.adsFov ?? 60) : 74;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }

  if (r.phase === 'fight' && G.alive) {
    bots.step(dt, {
      time: G.elapsed,
      round: r.round,
      playerEye: eyePos,
      playerBody: player.state.feet,
      playerAlive: G.alive,
      noiseAt: G.noiseAt,
      noisePos: G.noisePos,
      planted: bomb.state.planted,
      site: SITES[r.site],
      proxy,
      onShot(bot, from, point, damage) {
        effects.tracer(from, point, true);
        audio.foeShot(from.distanceTo(player.state.feet));
        if (damage > 0) hurtPlayer(damage);
      },
      onPlant(bot) {
        hud.killfeed(`${bot.name} reached site ${r.site} — planting`);
        hud.setIntel(`CONTACT — SITE ${r.site}`);
      },
      onPlanted(bot) {
        bomb.plant(SITES[r.site], G.elapsed);
        hud.setBanner(`SPIKE PLANTED — SITE ${r.site}`, 'Defuse it before the timer runs out', 4000);
        audio.plant();
        void bot;
      },
      onCarrierDown: null,
    });

    // Defuse: hold E inside the ring while the spike is planted.
    if (bomb.state.planted) {
      const inRing = Math.hypot(player.state.feet.x - bomb.state.site.center.x, player.state.feet.z - bomb.state.site.center.z) < SITES[r.site].radius;
      const holding = input.state.keys.has('KeyE');
      const result = bomb.defuseStep(holding, inRing, r.kit, G.elapsed);
      if (result === 'tick') {
        bomb.hasKit = r.kit;
        if (Math.floor(G.elapsed * 4) % 2 === 0) audio.defuseTick();
      } else if (result === 'defused') {
        rounds.addDefusePay();
        hud.setMoney(r.money);
        endRound(true, 'Spike defused');
      }
      hud.setDefuse(bomb.defuseProgress(G.elapsed));
      const left = bomb.timeLeft(G.elapsed);
      hud.setBomb(`SPIKE PLANTED — ${fmtClock(left)}${inRing ? ' — HOLD E TO DEFUSE' : ''}`, left < 10);
    } else {
      hud.setBomb('');
      hud.setDefuse(0);
    }
  }

  hud.setHealth(G.health, r.armor);
  hud.setScore(r.wins, r.losses, r.round);
  hud.setMoney(r.money);
  hud.setKills(r.kills);
  const slot = weapons.owned[weapons.current()];
  hud.setAmmo(slot.mag, slot.reserve, def.name);
  const spreadPx = 4 + weapons.spread(player.groundSpeed(), player.state.aiming, !player.state.onGround) * 900;
  hud.setSpread(Math.min(34, spreadPx));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (G.frozen) {
    renderer.render(scene, camera);
    return;
  }
  const look = input.takeLook();
  player.look(look.x, look.y);
  const r = rounds.state;
  if (r.phase === 'fight' && G.alive && input.state.locked) {
    const def = weapons.def();
    const firing = def.auto ? input.state.firing : input.state.firing && !G.lastFireEdge;
    G.lastFireEdge = input.state.firing;
    if (firing && weapons.ready()) shoot(weapons.spread(player.groundSpeed(), player.state.aiming, !player.state.onGround));
    if (input.takePressed('KeyR')) {
      if (weapons.reload()) audio.reload();
    }
    if (input.takePressed('KeyG')) throwFrag();
  } else {
    G.lastFireEdge = input.state.firing;
  }
  if (input.takePressed('KeyB') && r.phase === 'buy') {
    if (hud.buyVisible()) {
      hud.hideBuy();
      input.requestLock();
    } else {
      hud.showBuy(buyMenuItems(), r.money);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  if (input.takePressed('Enter') && r.phase === 'buy') deploy();
  for (const [index, id] of ORDER.entries()) {
    if (input.takePressed(`Digit${index + 1}`)) {
      if (weapons.equip(id)) {
        const slot = weapons.owned[id];
        hud.setAmmo(slot.mag, slot.reserve, WEAPONS[id].name);
      }
    }
  }
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  syncCamera();
  renderer.render(scene, camera);
}

let accumulator = 0;
let lastTime = performance.now();

hud.onAction(() => {
  audio.unlock();
  const phase = rounds.state.phase;
  if (phase === 'menu') {
    // No pointer lock here: the buy menu needs a free mouse to click its items.
    // The lock comes with Deploy, when the fighting starts.
    startMatch();
  } else if (G.paused) {
    G.paused = false;
    hud.hideOverlay();
    input.requestLock();
  } else if (phase === 'roundEnd') {
    hud.hideOverlay();
    rounds.nextRound(G.elapsed);
    bots.reset(rounds.state.round, rounds.state.site);
    player.respawn(PLAYER_SPAWN);
    G.health = 100;
    G.alive = true;
    bomb.clear();
    hud.setHealth(100, false);
    hud.showBuy(buyMenuItems(), rounds.state.money);
  } else if (phase === 'matchEnd') {
    hud.hideOverlay();
    startMatch();
  }
});
hud.onBuy((id) => tryBuy(id));
hud.onDeploy(() => deploy());

// Clicking the canvas mid-fight re-locks the pointer (Esc drops it, and the
// buy timer's deploy cannot lock without a gesture).
renderer.domElement.addEventListener('click', () => {
  if (!shot && rounds.state.phase === 'fight' && G.alive && !input.state.locked) {
    audio.unlock();
    input.requestLock();
  }
});

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      G.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function stageShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  G.health = 100;
  G.alive = true;
  weapons.refillAll();
  rounds.startMatch(0);
  if (name === 'start') {
    player.respawn(PLAYER_SPAWN);
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.0, -8));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    rounds.state.site = 'A';
    rounds.state.money = 2100;
    player.state.yaw = 0.5;
    player.state.pitch = 0.02;
    settle(20);
    hud.setMoney(2100);
    hud.showBuy(buyMenuItems(), 2100);
    hud.setTimer('BUY 0:12');
  } else if (name === 'fight') {
    rounds.state.site = 'A';
    rounds.startFight(0);
    bots.reset(1, 'A');
    // Two attackers mid-lane, in the open, where the camera can see them.
    const b0 = bots.bots[0];
    const b1 = bots.bots[1];
    b0.pos.set(-3.5, 0, 2);
    b0.group.position.copy(b0.pos);
    b0.group.rotation.y = Math.PI;
    b0.state = 'engage';
    b0.lastSeenAt = 0;
    b1.pos.set(4.5, 0, -1.5);
    b1.group.position.copy(b1.pos);
    b1.group.rotation.y = Math.PI;
    b1.state = 'engage';
    b1.lastSeenAt = 0;
    G.health = 78;
    settle(20);
    aimAt(b0.pos.clone().setY(1.1));
    shoot(0);
    settle(1);
    hud.setHealth(78, false);
    hud.setTimer('1:23');
    hud.hitMarker(false);
  } else if (name === 'plant') {
    rounds.state.site = 'B';
    rounds.startFight(0);
    bots.reset(1, 'B');
    const b0 = bots.bots[0];
    b0.pos.set(15.5, 0, 9);
    b0.group.position.copy(b0.pos);
    b0.group.rotation.y = Math.PI * 0.75;
    b0.state = 'postplant';
    bomb.plant(SITES.B, 8);
    G.elapsed = 16;
    player.state.feet.set(13, 0, 16);
    settle(10);
    aimAt(new THREE.Vector3(18, 0.6, 12));
    hud.setTimer('SPIKE 0:27');
    hud.setBomb('SPIKE PLANTED — 0:27 — HOLD E TO DEFUSE', false);
    hud.setHealth(64, true);
  }
  hud.setScore(rounds.state.wins, rounds.state.losses, rounds.state.round);
  hud.setMoney(rounds.state.money);
  hud.setKills(rounds.state.kills);
  const slot = weapons.owned[weapons.current()];
  hud.setAmmo(slot.mag, slot.reserve, weapons.def().name);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

player.respawn(PLAYER_SPAWN);
syncCamera();

// A small handle for automated play-testing (and for anyone poking at the game
// in devtools): the live state and the verbs that drive it.
window.__sable = {
  G, camera, rounds, bots, player, weapons, bomb,
  shoot: (spread = 0) => shoot(spread),
  throwFrag, deploy, startMatch, endRound,
  state: () => ({ phase: rounds.state.phase, hp: G.health, wins: rounds.state.wins, losses: rounds.state.losses, botsAlive: bots.aliveCount(), money: rounds.state.money }),
};

hud.showOverlay('start');
hud.setAmmo(weapons.owned.vandal.mag, weapons.owned.vandal.reserve, 'Vandal');
if (shot) stageShot(shot);
else requestAnimationFrame(frame);
