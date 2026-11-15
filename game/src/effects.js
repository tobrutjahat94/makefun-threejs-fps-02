// Pooled effects: nothing is allocated in a hot frame. Tracers are twelve line
// objects reused in a ring; impact sparks are one Points cloud whose positions
// are rewritten; the frag's blast is a single expanding shell. A pool that runs
// out simply reuses its oldest member, so the frame rate never pays for a fight.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 12;
const SPARKS = 240;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
  const foeMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ff5a3c'), transparent: true, opacity: 0 });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, i % 2 === 0 ? tracerMat.clone() : foeMat.clone());
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerAt = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.06, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARKS * 3);
  let sparkLife = 0;
  let sparkCount = 0;

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 14);
  scene.add(blastLight);
  let blastLife = 0;

  function spawnTracer(from, to, foe) {
    const slot = tracers[tracerAt];
    tracerAt = (tracerAt + 1) % TRACERS;
    const attr = slot.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    slot.line.material.color.set(foe ? '#ff5a3c' : PALETTE.accent);
    slot.line.visible = true;
    slot.life = 0.09;
  }

  return {
    tracer(from, to, foe = false) {
      spawnTracer(from, to, foe);
    },
    impact(point, normal) {
      sparkCount = 14;
      sparkLife = 0.28;
      for (let i = 0; i < sparkCount; i += 1) {
        sparkPos[i * 3] = point.x;
        sparkPos[i * 3 + 1] = point.y;
        sparkPos[i * 3 + 2] = point.z;
        sparkVel[i * 3] = normal.x * 2 + (Math.random() * 2 - 1) * 2.4;
        sparkVel[i * 3 + 1] = Math.abs(normal.y) * 2 + Math.random() * 2.6;
        sparkVel[i * 3 + 2] = normal.z * 2 + (Math.random() * 2 - 1) * 2.4;
      }
      sparkGeo.getAttribute('position').needsUpdate = true;
      sparks.visible = true;
    },
    explosion(point) {
      blast.position.copy(point);
      blast.visible = true;
      blastLife = 0.4;
      blastLight.position.copy(point);
      blastLight.position.y += 0.6;
      blastLight.intensity = 90;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.line.material.opacity = Math.max(0, slot.life / 0.09) * 0.85;
        if (slot.life <= 0) slot.line.visible = false;
      }
      if (sparkLife > 0) {
        sparkLife -= dt;
        for (let i = 0; i < sparkCount; i += 1) {
          sparkPos[i * 3] += sparkVel[i * 3] * dt;
          sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
          sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
          sparkVel[i * 3 + 1] -= 9 * dt;
        }
        sparkGeo.getAttribute('position').needsUpdate = true;
        sparks.material.opacity = Math.max(0, sparkLife / 0.28) * 0.9;
        if (sparkLife <= 0) sparks.visible = false;
      }
      if (blastLife > 0) {
        blastLife -= dt;
        const t = 1 - blastLife / 0.4;
        const radius = 0.4 + t * 3.4;
        blast.scale.setScalar(radius);
        blast.material.opacity = (1 - t) * 0.55;
        blastLight.intensity = (1 - t) * 90;
        if (blastLife <= 0) {
          blast.visible = false;
          blastLight.intensity = 0;
        }
      }
    },
  };
}
