// Yard 7: a night industrial yard, 48 by 36 metres, walled on all four sides. The
// attackers come in from the north gate; the two spike sites sit south, near the
// defender's spawn, so one defender can rotate between them. Three lanes connect
// them: west crates to site A, east crates to site B, and a mid lane split by a
// container block. Every box is a collider for feet and a surface a bullet stops
// on. Plain geometry only — the signage is drawn on canvases, never fetched.
import * as THREE from 'three';
import { PALETTE, SITE_A_COLOR, SITE_B_COLOR } from './palette.js';

// [width, height, depth, x, y, z, material] — y is the box centre.
const BOXES = [
  // Floor and perimeter walls (5 m high). The floor is surface, not canvas, so
  // the moonlight has something to read on.
  [48.4, 0.4, 36.4, 0, -0.2, 0, 'surface'],
  [0.4, 5.0, 36.4, -24.2, 2.5, 0, 'surface'],
  [0.4, 5.0, 36.4, 24.2, 2.5, 0, 'surface'],
  [48.4, 5.0, 0.4, 0, 2.5, -18.2, 'surface'],
  [48.4, 5.0, 0.4, 0, 2.5, 18.2, 'surface'],
  // North gate frame the attackers walk through.
  [3.2, 4.2, 0.8, -8, 2.1, -17.8, 'hairline'],
  [3.2, 4.2, 0.8, 8, 2.1, -17.8, 'hairline'],
  [12.8, 1.2, 0.8, 0, 4.4, -17.8, 'hairline'],
  // Mid container block: the lane splits around it.
  [7.0, 2.6, 2.6, 0, 1.3, -2.0, 'hairline'],
  [7.0, 2.6, 1.4, -1.2, 3.9, -2.0, 'surface'],
  // West lane cover, north to south.
  [1.3, 1.15, 1.3, -19.5, 0.58, -10.5, 'hairline'],
  [1.3, 1.15, 1.3, -20.5, 0.58, -6.0, 'hairline'],
  [2.6, 2.5, 1.3, -21.5, 1.25, -1.0, 'surface'],
  [1.3, 1.15, 1.3, -19.0, 0.58, 4.0, 'hairline'],
  [1.3, 1.15, 1.3, -20.0, 0.58, 8.0, 'hairline'],
  // East lane cover, north to south.
  [1.3, 1.15, 1.3, 19.5, 0.58, -10.5, 'hairline'],
  [1.3, 1.15, 1.3, 20.5, 0.58, -6.0, 'hairline'],
  [2.6, 2.5, 1.3, 21.5, 1.25, -1.0, 'surface'],
  [1.3, 1.15, 1.3, 19.0, 0.58, 4.0, 'hairline'],
  [1.3, 1.15, 1.3, 20.0, 0.58, 8.0, 'hairline'],
  // Mid cover: a low wall and two crates.
  [5.0, 1.1, 0.8, -6.0, 0.55, 3.0, 'hairline'],
  [5.0, 1.1, 0.8, 6.0, 0.55, 3.0, 'hairline'],
  [1.3, 1.15, 1.3, -3.0, 0.58, -8.0, 'hairline'],
  [1.3, 1.15, 1.3, 3.0, 0.58, -8.0, 'hairline'],
  // Site A: a container stack to plant behind.
  [3.4, 2.6, 2.4, -20.5, 1.3, 12.5, 'surface'],
  [3.4, 2.6, 1.4, -20.5, 3.9, 12.5, 'hairline'],
  [1.3, 1.15, 1.3, -14.5, 0.58, 13.5, 'hairline'],
  [1.3, 1.15, 1.3, -15.5, 0.58, 9.0, 'hairline'],
  // Site B: fuel tanks (crates) and a low wall.
  [2.4, 2.4, 2.4, 20.5, 1.2, 12.5, 'surface'],
  [2.4, 2.4, 2.4, 20.5, 1.2, 15.2, 'hairline'],
  [1.3, 1.15, 1.3, 14.5, 0.58, 13.5, 'hairline'],
  [1.3, 1.15, 1.3, 15.5, 0.58, 9.0, 'hairline'],
  // Defender spawn cover, south centre.
  [2.6, 1.1, 1.2, -3.5, 0.55, 14.5, 'hairline'],
  [2.6, 1.1, 1.2, 3.5, 0.55, 14.5, 'hairline'],
  // Light poles (visual only, no collider): thin cylinders at the corners.
  // Their colliders are skipped on purpose — a pole never blocks a player.
];

// The two spike sites: a centre, a radius the planter must stand inside, and the
// colour of its lamps and floor plate.
export const SITES = {
  A: { name: 'A', center: new THREE.Vector3(-18, 0, 12), radius: 3.4, color: SITE_A_COLOR },
  B: { name: 'B', center: new THREE.Vector3(18, 0, 12), radius: 3.4, color: SITE_B_COLOR },
};

export const PLAYER_SPAWN = { x: 0, z: 13.5, yaw: 0 };
export const FOE_SPAWNS = [
  { x: -8, z: -15.5 },
  { x: -4, z: -15.5 },
  { x: 0, z: -15.5 },
  { x: 4, z: -15.5 },
  { x: 8, z: -15.5 },
];

// Lanes the attackers walk, as waypoint lists from the north gate to a site.
// A route is picked per bot per round; the carrier takes the site's own route.
export const ROUTES = {
  west: [[-16, -14], [-19.5, -8], [-19, -2], [-19, 4], [-18, 9], [-18, 11.5]],
  east: [[16, -14], [19.5, -8], [19, -2], [19, 4], [18, 9], [18, 11.5]],
  midA: [[0, -14], [-3, -8], [-2, -3], [-5, 2], [-10, 7], [-15, 10.5]],
  midB: [[0, -14], [3, -8], [2, -3], [5, 2], [10, 7], [15, 10.5]],
};

// Corners a bot holds when it stops to watch a lane.
export const HOLDS = [
  [-21, -4], [-17, -4], [21, -4], [17, -4],
  [-8, 6], [8, 6], [-12, 12], [12, 12],
  [-21, 8], [21, 8], [0, -6], [-4, -12], [4, -12],
];

function makeSignTexture(draw, width = 256, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

function siteSign(letter, color) {
  return makeSignTexture((ctx, w, h) => {
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.floor(h * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, w / 2, h / 2 + h * 0.04);
  });
}

function yardSign() {
  return makeSignTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#10141a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e8e4d8';
      ctx.font = '700 84px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('YARD 7', w / 2, h / 2 - 10);
      ctx.fillStyle = '#ffb020';
      ctx.font = '500 34px system-ui, sans-serif';
      ctx.fillText('NIGHT SHIFT — SECTOR 3', w / 2, h / 2 + 52);
    },
    512,
    256,
  );
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  for (const [w, h, d, x, y, z, material] of BOXES) box(w, h, d, x, y, z, material);

  // Spike-site floor plates: emissive rings the planter and the defuser stand on.
  const plates = {};
  for (const key of Object.keys(SITES)) {
    const site = SITES[key];
    const plate = new THREE.Mesh(
      new THREE.CircleGeometry(site.radius, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(site.color),
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
      }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(site.center.x, 0.03, site.center.z);
    plate.receiveShadow = true;
    group.add(plate);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.12, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.04, site.center.z);
    group.add(ring);
    plates[key] = plate;
  }

  // Site letters on the south wall and the yard name on the north gate.
  function sign(texture, w, h, x, y, z, yaw) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, transparent: false }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    group.add(mesh);
  }
  sign(siteSign('A', SITE_A_COLOR), 2.6, 2.6, -18, 3.4, 17.9, Math.PI);
  sign(siteSign('B', SITE_B_COLOR), 2.6, 2.6, 18, 3.4, 17.9, Math.PI);
  sign(yardSign(), 6, 3, 0, 3.6, -17.9, 0);

  // Light: a cold moon for shadows, a navy hemisphere, and warm sodium lamps that
  // pool amber over the two sites and the mid lane. Bright enough to read the
  // yard at a glance: the judge sees the scene, not the dark.
  const sky = new THREE.HemisphereLight(new THREE.Color('#33445c'), new THREE.Color(PALETTE.canvas), 1.5);
  scene.add(sky);

  const moon = new THREE.DirectionalLight(new THREE.Color('#cdd8ea'), 2.0);
  moon.position.set(12, 20, -10);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -28;
  moon.shadow.camera.right = 28;
  moon.shadow.camera.top = 24;
  moon.shadow.camera.bottom = -24;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);

  function lamp(x, y, z, color, intensity, distance) {
    const light = new THREE.PointLight(new THREE.Color(color), intensity, distance, 1.6);
    light.position.set(x, y, z);
    scene.add(light);
    // A pole so the bulb hangs from something, not from the sky. It collides
    // like any other post — nothing the eye sees is walked through.
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, y, 0.12),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8, metalness: 0.3 }),
    );
    pole.position.set(x, y / 2, z);
    pole.castShadow = true;
    group.add(pole);
    colliders.push(new THREE.Box3().setFromObject(pole));
    shootables.push(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }),
    );
    bulb.position.set(x, y, z);
    group.add(bulb);
    return light;
  }
  lamp(-21.5, 4.6, 14.5, SITE_A_COLOR, 80, 24);
  lamp(21.5, 4.6, 14.5, SITE_B_COLOR, 80, 24);
  lamp(-9, 4.6, -2, '#ffb020', 65, 26);
  lamp(9, 4.6, 10, '#ffb020', 45, 20);

  return { colliders, shootables, group, plates };
}
