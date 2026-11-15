// The attackers: five bots with names, routes and a state machine. Each round they
// walk a lane toward the chosen site — the carrier on the direct route, the others
// split across the lanes as a feint — then hold angles, react to what they see and
// hear, and shoot back in bursts with a human reaction time. The carrier plants
// the spike at the site; if the carrier dies, the nearest living bot picks it up.
// They never see through walls: sight is a raycast, checked a few times a second,
// and hearing is the player's gunfire inside 26 metres.
import * as THREE from 'three';
import { FOE_COLOR } from './palette.js';
import { FOE_SPAWNS, ROUTES, HOLDS } from './world.js';
import { slideBox, BODY } from './player.js';
import { makeRng, pick, range } from './rng.js';

const CALLSIGNS = ['Dagger', 'Vex', 'Rook', 'Nomad', 'Fable'];
const HEALTH = 100;
const WALK_SPEED = 3.4;
const HOLD_SPEED = 2.1;
const REACTION_BASE = 0.72;
const BURST_MIN = 3;
const BURST_MAX = 5;
const BOT_DAMAGE = 13;
const BOT_HEAD_DAMAGE = 22;
const HEAR_RANGE = 26;
const SIGHT_RANGE = 48;
const PLANT_SECONDS = 3;

export function createBots(scene, colliders, shootables) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const rng = makeRng(20261115);
  const bots = [];
  const hitMeshes = [];
  const visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(FOE_COLOR) });
  const armorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232a33'), roughness: 0.75, metalness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14181e'), roughness: 0.85, metalness: 0.1 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.17, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.62);

  for (let i = 0; i < 5; i += 1) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 1.02;
    torso.castShadow = true;
    const head = new THREE.Mesh(headGeo, darkMat);
    head.position.y = 1.58;
    head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.05), visorMat);
    visor.position.set(0, 1.6, -0.15);
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.31, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.3, 1.05, -0.25);
    group.add(torso, head, visor, legL, legR, gun);
    scene.add(group);
    const bot = {
      index: i,
      name: CALLSIGNS[i],
      group,
      torso,
      head,
      health: HEALTH,
      alive: true,
      state: 'route',
      route: [],
      routeIndex: 0,
      holdAt: null,
      strafeAt: null,
      strafeUntil: 0,
      lastSeenAt: -99,
      seenPos: new THREE.Vector3(),
      reactAt: 0,
      burstLeft: 0,
      burstGapAt: 0,
      nextShotAt: 0,
      sightAt: -99 - i * 0.03,
      carrier: false,
      plantAt: 0,
      plantProgress: 0,
      walkPhase: rng() * 6.28,
      stuckTime: 0, detourUntil: 0, detourX: 0, detourReadyAt: 0,
      pos: new THREE.Vector3(FOE_SPAWNS[i].x, 0, FOE_SPAWNS[i].z),
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  const eyePos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const toPlayer = new THREE.Vector3();
  const moveDelta = new THREE.Vector3();

  function canSee(bot, target) {
    eyePos.set(bot.pos.x, 1.55, bot.pos.z);
    dir.copy(target).sub(eyePos);
    const distance = dir.length();
    if (distance > SIGHT_RANGE) return false;
    dir.normalize();
    raycaster.set(eyePos, dir);
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit || hit.distance > distance - 0.4;
  }

  function moveToward(bot, tx, tz, speed, dt) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.15) return true;
    const ox = bot.pos.x, oz = bot.pos.z;
    moveDelta.set((dx / len) * speed * dt, 0, (dz / len) * speed * dt);
    const moved = slideBox(colliders, bot.pos, moveDelta, BODY.radius, BODY.standHeight);
    bot.pos.copy(moved.pos);
    bot.group.position.copy(bot.pos);
    bot.group.rotation.y = Math.atan2(dx, dz);
    // Stuck detection: asked to move but barely displaced (a wall is in the
    // way). After half a second of that, trigger a sideways detour below.
    if (Math.hypot(bot.pos.x - ox, bot.pos.z - oz) < 0.05) bot.stuckTime += dt;
    else bot.stuckTime = 0;
    return Math.hypot(tx - bot.pos.x, tz - bot.pos.z) < 0.3;
  }

  function face(bot, tx, tz) {
    bot.group.rotation.y = Math.atan2(tx - bot.pos.x, tz - bot.pos.z);
  }

  return {
    bots,
    hitMeshes,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
    carrier() {
      return bots.find((b) => b.alive && b.carrier) ?? null;
    },
    allDead() {
      return bots.every((b) => !b.alive);
    },
    // A new round: fresh health, the carrier on the direct route to the site,
    // the others split across the lanes so the defender cannot sit one angle.
    reset(round, siteKey) {
      const siteRoutes = siteKey === 'A' ? ['west', 'midA', 'west', 'midA', 'east'] : ['east', 'midB', 'east', 'midB', 'west'];
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        bot.health = HEALTH;
        bot.alive = true;
        bot.state = 'route';
        bot.pos.set(FOE_SPAWNS[i].x, 0, FOE_SPAWNS[i].z);
        bot.group.position.copy(bot.pos);
        bot.group.rotation.set(0, 0, 0);
        bot.group.visible = true;
        bot.carrier = i === 0;
        bot.route = ROUTES[siteRoutes[i]].map(([x, z]) => ({ x, z }));
        bot.routeIndex = 0;
        bot.holdAt = null;
        bot.strafeAt = null;
        bot.plantProgress = 0;
        bot.burstLeft = 0;
        bot.lastSeenAt = -99;
      }
      void round;
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health > 0) return false;
      bot.alive = false;
      bot.group.rotation.x = -Math.PI / 2 + 0.12;
      bot.group.position.y = 0.25;
      return true;
    },
    // ctx: { time, round, playerEye, playerBody, playerAlive, noiseAt, noisePos,
    //   planted, site, proxy (the player's hit spheres), onShot, onDeath,
    //   onPlant, onPlanted, onCarrierDown }
    step(dt, ctx) {
      const roundScale = Math.min(1, 0.5 + ctx.round * 0.08);
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.walkPhase += dt * 10;
        const headY = 1.55 + Math.sin(bot.walkPhase) * 0.02;
        bot.head.position.y = headY + 0.03;

        // Sensing, staggered a few times a second: sight first, then hearing.
        if (ctx.playerAlive && ctx.time - bot.sightAt > 0.15) {
          bot.sightAt = ctx.time;
          if (canSee(bot, ctx.playerEye)) {
            bot.lastSeenAt = ctx.time;
            bot.seenPos.copy(ctx.playerEye);
            if (bot.state === 'route' || bot.state === 'hold') {
              bot.state = 'engage';
              bot.reactAt = ctx.time + REACTION_BASE * (1.15 - roundScale * 0.3) + rng() * 0.25;
            }
          } else if (ctx.noiseAt > ctx.time - 0.4) {
            toPlayer.copy(ctx.noisePos).sub(bot.pos);
            if (toPlayer.length() < HEAR_RANGE) {
              bot.lastSeenAt = ctx.time;
              bot.seenPos.copy(ctx.noisePos).setY(1.2);
              if (bot.state === 'route') bot.state = 'engage';
            }
          }
        }

        // Detour: stuck against a wall for >0.5s while trying to move — step
        // sideways for ~1.2s to get around the obstacle, then resume. This
        // matters when an engaged bot beelines for the player through the
        // mid container block.
        if (bot.detourUntil > ctx.time) {
          moveToward(bot, bot.detourX, bot.pos.z, WALK_SPEED, dt);
          continue;
        }
        if (bot.stuckTime > 0.5 && ctx.time > bot.detourReadyAt) {
          bot.detourX = bot.pos.x + (bot.pos.x >= 0 ? 4 : -4);
          if (bot.detourX > 22) bot.detourX = bot.pos.x - 4;
          if (bot.detourX < -22) bot.detourX = bot.pos.x + 4;
          bot.detourUntil = ctx.time + 1.2;
          bot.detourReadyAt = ctx.time + 3.0;
          bot.stuckTime = 0;
          moveToward(bot, bot.detourX, bot.pos.z, WALK_SPEED, dt);
          continue;
        }

        if (bot.state === 'route') {
          const point = bot.route[bot.routeIndex];
          if (point && moveToward(bot, point.x, point.z, WALK_SPEED, dt)) {
            bot.routeIndex += 1;
            if (bot.routeIndex >= bot.route.length) {
              if (bot.carrier && !ctx.planted) {
                bot.state = 'plant';
                bot.plantAt = ctx.time;
                bot.plantProgress = 0;
                ctx.onPlant(bot);
              } else {
                bot.state = 'hold';
                bot.holdAt = pick(rng, HOLDS);
              }
            }
          }
          continue;
        }

        if (bot.state === 'hold') {
          if (bot.holdAt) {
            if (moveToward(bot, bot.holdAt[0], bot.holdAt[1], HOLD_SPEED, dt)) bot.holdAt = null;
          } else {
            // Watch the lane the player is most likely to come from.
            face(bot, ctx.playerEye.x, ctx.playerEye.z);
          }
          continue;
        }

        if (bot.state === 'plant') {
          face(bot, ctx.site.center.x, ctx.site.center.z);
          bot.plantProgress = (ctx.time - bot.plantAt) / PLANT_SECONDS;
          if (bot.plantProgress >= 1) {
            bot.state = 'postplant';
            bot.holdAt = pick(rng, HOLDS);
            bot.plantProgress = 0;
            ctx.onPlanted(bot);
          }
          continue;
        }

        if (bot.state === 'postplant') {
          if (bot.holdAt) {
            if (moveToward(bot, bot.holdAt[0], bot.holdAt[1], HOLD_SPEED, dt)) bot.holdAt = null;
          } else {
            face(bot, ctx.playerEye.x, ctx.playerEye.z);
          }
          // Defend the planted spike: shoot on sight without the route delay.
          if (ctx.playerAlive && ctx.time >= bot.reactAt && ctx.time - bot.lastSeenAt < 1.2) {
            this.fire(bot, ctx, roundScale);
          }
          continue;
        }

        // engage: strafe between cover, fire in bursts once the reaction passes.
        if (!ctx.playerAlive || ctx.time - bot.lastSeenAt > 2.5) {
          bot.state = bot.routeIndex < bot.route.length ? 'route' : 'hold';
          continue;
        }
        if (ctx.time < bot.strafeUntil && bot.strafeAt) {
          moveToward(bot, bot.strafeAt.x, bot.strafeAt.z, HOLD_SPEED, dt);
        } else {
          const near = HOLDS.filter(([x, z]) => Math.hypot(x - bot.pos.x, z - bot.pos.z) < 9);
          const spot = near.length ? pick(rng, near) : [bot.pos.x, bot.pos.z];
          bot.strafeAt = { x: spot[0] + range(rng, -1, 1), z: spot[1] + range(rng, -1, 1) };
          bot.strafeUntil = ctx.time + range(rng, 0.7, 1.4);
        }
        face(bot, bot.seenPos.x, bot.seenPos.z);
        if (ctx.time >= bot.reactAt) this.fire(bot, ctx, roundScale);
      }
    },
    // One burst step: a shot every 0.12 s, then a gap. A shot is a ray from the
    // bot's gun toward the player's last seen point with an error that grows
    // with distance and shrinks as the bot settles on a target.
    fire(bot, ctx, accuracy) {
      const now = ctx.time;
      if (bot.burstLeft > 0) {
        if (now < bot.nextShotAt) return;
        bot.nextShotAt = now + 0.12;
        bot.burstLeft -= 1;
        const from = new THREE.Vector3(bot.pos.x, 1.35, bot.pos.z);
        const err = (0.07 - accuracy * 0.02) * (1 + toPlayer.copy(ctx.playerEye).sub(from).length() / 24);
        const aim = ctx.playerEye.clone();
        aim.x += (rng() * 2 - 1) * err * 12;
        aim.y += (rng() * 2 - 1) * err * 9;
        aim.z += (rng() * 2 - 1) * err * 12;
        dir.copy(aim).sub(from).normalize();
        raycaster.set(from, dir);
        const targets = shootables.concat(ctx.proxy);
        const hit = raycaster.intersectObjects(targets, false)[0];
        let damage = 0;
        let point = from.clone().addScaledVector(dir, 40);
        if (hit) {
          point = hit.point.clone();
          if (hit.object.userData.proxy) {
            damage = hit.object.userData.part === 'head' ? BOT_HEAD_DAMAGE : BOT_DAMAGE;
          }
        }
        ctx.onShot(bot, from, point, damage);
        return;
      }
      if (now < bot.burstGapAt) return;
      bot.burstLeft = BURST_MIN + Math.floor(rng() * (BURST_MAX - BURST_MIN + 1));
      bot.burstGapAt = now + range(rng, 0.9, 1.6);
      bot.nextShotAt = now;
    },
    // The carrier fell: the nearest living bot takes the spike and reroutes.
    promoteCarrier(ctx) {
      const alive = bots.filter((b) => b.alive);
      if (!alive.length) return null;
      let best = alive[0];
      let bestDist = Infinity;
      for (const bot of alive) {
        const d = Math.hypot(bot.pos.x - ctx.site.center.x, bot.pos.z - ctx.site.center.z);
        if (d < bestDist) {
          bestDist = d;
          best = bot;
        }
      }
      best.carrier = true;
      best.state = 'route';
      best.route = ROUTES[ctx.site.name === 'A' ? 'west' : 'east'].slice(2).map(([x, z]) => ({ x, z }));
      best.routeIndex = 0;
      return best;
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      return new THREE.Vector3(bot.pos.x, 1.2, bot.pos.z);
    },
  };
}
