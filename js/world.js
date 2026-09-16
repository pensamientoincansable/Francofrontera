// FRONTERA // Dead Tide — Mundo 3D: entorno, clima, valla, helicóptero y armas en vista
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function lerpColor(a, b, f, out) {
  out.setHex(a).lerp(new THREE.Color(b), f);
  return out;
}

// keyframes del ciclo día/noche: t, cielo, niebla, densidad, sol, intSol, intHemi, agua, lámparas, estrellas
const DAY_KEYS = [
  { t: 0.00, sky: 0x51687c, fog: 0x1a2e38, den: 0.0065, sun: 0xffb37a, sunI: 2.2, hemi: 1.35, water: 0x14505c, lamp: 1.6, stars: 0 },
  { t: 0.25, sky: 0x2e6b84, fog: 0x14323e, den: 0.0055, sun: 0xfff2d8, sunI: 3.0, hemi: 1.9, water: 0x0e7c8c, lamp: 0.4, stars: 0 },
  { t: 0.50, sky: 0x4a3a52, fog: 0x201a26, den: 0.0070, sun: 0xff7b4d, sunI: 1.8, hemi: 1.1, water: 0x0a3c50, lamp: 2.5, stars: 0.15 },
  { t: 0.75, sky: 0x081320, fog: 0x08121c, den: 0.0072, sun: 0x8fb7ff, sunI: 0.75, hemi: 0.65, water: 0x06222e, lamp: 3.8, stars: 1 },
];
function dayFrame(dayT) {
  const K = DAY_KEYS; let a = K[K.length - 1], b = K[0];
  for (let i = 0; i < K.length; i++) {
    const n = K[(i + 1) % K.length];
    const t0 = K[i].t, t1 = (i === K.length - 1) ? 1 : n.t;
    if (dayT >= t0 && dayT < t1) { a = K[i]; b = n; const f = (dayT - t0) / (t1 - t0); return { a, b, f }; }
  }
  return { a, b, f: 0 };
}

// ---------- GEOMETRÍA DEL NIDO DE FRANCOTIRADOR ----------
// Fuente única de verdad: la cámara (game.js) y la torre (buildTower) usan estos valores.
// SNIPER_EYE   → ojo del tirador, de pie tras el parapeto.
// PARAPET_TOP  → coronación de los sacos de arena (queda ~0.81 m bajo el ojo).
// PARAPET_Z    → cara exterior del parapeto.
export const SNIPER_EYE = Object.freeze({ x: 0, y: 13.95, z: 32.0 });
export const PARAPET_TOP = 13.14;
export const PARAPET_Z = 31.05;

// ---------- GEOGRAFÍA DEL SECTOR COSTERO ----------
// El mar queda a la IZQUIERDA (oeste, x < SHORE_X). La playa/orilla corre de norte a
// sur sobre x = SHORE_X. Las vallas bloquean el corredor terrestre (FENCE_X0..FENCE_X1)
// en 3 capas de profundidad; el flanco marítimo queda abierto para el asalto en lancha.
export const SHORE_X = -12;
export const FENCE_ZS = Object.freeze([-14, -7, -1]); // exterior → interior
export const FENCE_X0 = -10;
export const FENCE_X1 = 31;
export const FENCE_LABELS = Object.freeze(['EXTERIOR', 'MEDIA', 'INTERIOR']);
// Tiempos del asalto anfibio: 3 s para poner la lancha + 2 s para salir de la orilla.
export const BOAT_DEPLOY_TIME = 3.0;
export const BOAT_LAUNCH_TIME = 2.0;

export class World {
  constructor(scene, camera, renderer) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.tmpC = new THREE.Color();
    this.lampLights = []; this.lampMats = [];
    this.fencePosts = []; this.fenceRails = [];
    this.time = 0;
    this.buildLights();
    this.buildSky();
    this.buildTerrain();
    this.buildFence();
    this.buildProps();
    this.buildHeli();
    this.buildRain();
    this.buildViewmodels();
  }

  // ---------- luces base ----------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0x9cc8d0, 0x102021, 1.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc68b, 2.4);
    this.sun.position.set(-25, 30, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -45; this.sun.shadow.camera.right = 45;
    this.sun.shadow.camera.top = 45; this.sun.shadow.camera.bottom = -45;
    this.sun.shadow.camera.far = 140;
    this.scene.add(this.sun);
    this.flashDir = new THREE.DirectionalLight(0xcfe4ff, 0);
    this.flashDir.position.set(10, 40, -20);
    this.scene.add(this.flashDir);
  }

  // ---------- cielo y estrellas ----------
  buildSky() {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x193845, side: THREE.BackSide, fog: false })
    );
    this.scene.add(this.sky);
    const n = 500, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
      p[i*3] = Math.cos(th) * Math.cos(ph) * 200;
      p[i*3+1] = 12 + Math.sin(ph) * 190;
      p[i*3+2] = Math.sin(th) * Math.cos(ph) * 200;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xcfe8ff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.scene.add(this.stars);
  }

  // ---------- terreno: mar a la izquierda + playa + orilla ----------
  buildTerrain() {
    // MAR (oeste): plano de agua animada a la izquierda de la orilla.
    this.waterGeo = new THREE.PlaneGeometry(160, 340, 40, 56);
    this.waterGeo.rotateX(-Math.PI / 2);
    this.waterBase = this.waterGeo.attributes.position.array.slice();
    this.water = new THREE.Mesh(this.waterGeo, new THREE.MeshPhongMaterial({
      color: 0x0a343c, shininess: 110, transparent: true, opacity: 0.93
    }));
    // x: -172..-12 (borde este justo en la orilla), z: -180..160
    this.water.position.set(SHORE_X - 80, -0.15, -10);
    this.scene.add(this.water);
    // Fondo marino bajo el agua para dar profundidad
    this.seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 340),
      new THREE.MeshStandardMaterial({ color: 0x3a4a44, roughness: 1 })
    );
    this.seabed.rotation.x = -Math.PI / 2;
    this.seabed.position.set(SHORE_X - 80, -0.9, -10);
    this.scene.add(this.seabed);
    // TIERRA (este): arena que cubre todo el corredor terrestre y bajo la torre.
    this.sand = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 340),
      new THREE.MeshStandardMaterial({ color: 0x8e7757, roughness: 1 })
    );
    this.sand.rotation.x = -Math.PI / 2;
    // x: -12..138, z: -180..160
    this.sand.position.set(SHORE_X + 75, 0, -10);
    this.sand.receiveShadow = true;
    this.scene.add(this.sand);
    // Franja de arena húmeda en la orilla (marca visual de la línea de costa)
    this.wetSand = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 340),
      new THREE.MeshStandardMaterial({ color: 0x6b5c40, roughness: 1 })
    );
    this.wetSand.rotation.x = -Math.PI / 2;
    this.wetSand.position.set(SHORE_X + 1.6, 0.02, -10);
    this.wetSand.receiveShadow = true;
    this.scene.add(this.wetSand);
    // Línea de espuma animada justo en el borde del agua
    this.foamMat = new THREE.MeshBasicMaterial({ color: 0xd8f4f0, transparent: true, opacity: 0.55 });
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 340), this.foamMat);
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.set(SHORE_X - 0.4, 0.06, -10);
    this.scene.add(this.foam);
    // Rocas: escollos en el mar + peñascos en tierra firme (lejos del campo de tiro)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x1c3536, roughness: 0.95 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 4, 0.8 + Math.random() * 2.2, 2 + Math.random() * 3), rockMat);
      m.position.set(-46 + Math.random() * 28, 0.2, -40 + Math.random() * 70);
      m.castShadow = true;
      this.scene.add(m);
    }
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 5, 1 + Math.random() * 3, 3), rockMat);
      m.position.set(44 + Math.random() * 30, 0.5, -40 + Math.random() * 60);
      m.castShadow = true;
      this.scene.add(m);
    }
  }

  // ---------- vallas destructibles (3 capas en profundidad) ----------
  buildFence() {
    this.fence = new THREE.Group();
    this.fenceLayers = []; // [{ z, label, posts: [], rails: [] }]
    this.fencePosts = []; this.fenceRails = [];
    const metal = new THREE.MeshStandardMaterial({ color: 0x687b79, metalness: 0.7, roughness: 0.45 });
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xb3c3b8 });
    const fenceW = FENCE_X1 - FENCE_X0;
    const fenceCX = (FENCE_X0 + FENCE_X1) / 2;
    FENCE_ZS.forEach((fz, li) => {
      const layer = { z: fz, label: FENCE_LABELS[li], posts: [], rails: [] };
      for (let x = FENCE_X0; x <= FENCE_X1 + 0.01; x += 3) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.8, 0.16), metal);
        post.position.set(x, 2.9, fz);
        post.castShadow = true;
        this.fence.add(post);
        const rec = {
          mesh: post, x, baseY: 2.9, layer: li,
          fallAt: 0.15 + Math.random() * 0.8,   // fracción de HP bajo la que cae
          dir: Math.random() < 0.5 ? -1 : 1,
          tilt: 0 // 0 vertical .. 1 caído
        };
        layer.posts.push(rec);
        this.fencePosts.push(rec);
      }
      for (let y = 1.2; y < 5.5; y += 1.1) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(fenceW + 2, 0.09, 0.09), metal);
        rail.position.set(fenceCX, y, fz);
        this.fence.add(rail);
        layer.rails.push(rail); this.fenceRails.push(rail);
      }
      for (let x = FENCE_X0; x < FENCE_X1; x += 2.1) {
        const wire = new THREE.Mesh(new THREE.BoxGeometry(0.035, 5.5, 0.035), wireMat);
        wire.position.set(x, 2.8, fz - 0.12);
        wire.rotation.z = 0.1;
        this.fence.add(wire);
      }
      this.fenceLayers.push(layer);
    });
    this.scene.add(this.fence);
    // Farolas de perímetro: 3 por capa para no saturar de luces (mismo total que antes)
    for (const fz of FENCE_ZS) {
      for (const x of [-6, 8, 22]) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffe290 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mat);
        lamp.position.set(x, 6, fz);
        this.scene.add(lamp); this.lampMats.push(mat);
        const l = new THREE.PointLight(0xffbf60, 2.5, 15, 1.4);
        l.position.copy(lamp.position);
        this.scene.add(l); this.lampLights.push(l);
      }
    }
    // Focos potentes de vigilancia: 2 por capa hacia su área de aproximación
    FENCE_ZS.forEach((fz) => {
      for (const fx of [-4, 16]) {
        const spot = new THREE.SpotLight(0xfff3d0, 4.5, 44, 0.75, 0.45, 1.2);
        spot.position.set(fx, 6.2, fz);
        const spotTgt = new THREE.Object3D();
        spotTgt.position.set(fx * 0.9, 0, fz - 13);
        this.scene.add(spotTgt);
        spot.target = spotTgt;
        this.scene.add(spot);
        this.lampLights.push(spot);
      }
    });
    // Baliza luminosa en el extremo marítimo de cada capa (marca el flanco del mar)
    for (const fz of FENCE_ZS) {
      const buoyMat = new THREE.MeshBasicMaterial({ color: 0x36c8ff });
      const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), buoyMat);
      buoy.position.set(FENCE_X0 - 0.8, 0.6, fz);
      this.scene.add(buoy);
      this.lampMats.push(buoyMat);
    }
  }
  fenceVisual(frac) {
    // Acepta un número (compatibilidad: se aplica a las 3 capas) o un array por capa.
    const fracs = Array.isArray(frac) ? frac : [frac, frac, frac];
    const layers = this.fenceLayers && this.fenceLayers.length ? this.fenceLayers : null;
    if (layers) {
      layers.forEach((layer, li) => {
        const f = (fracs[li] !== undefined && fracs[li] !== null) ? fracs[li] : 1;
        for (const p of layer.posts) {
          const target = f >= 0.99 ? 0 : (f < p.fallAt ? 1 : (f < p.fallAt + 0.15 ? 0.45 : 0));
          p.tilt += (target - p.tilt) * 0.06;
          p.mesh.rotation.z = p.tilt * p.dir * 1.35;
          p.mesh.rotation.x = p.tilt * 0.3;
          p.mesh.position.y = p.baseY - p.tilt * 2.2;
        }
        const sag = (1 - f) * 0.5;
        layer.rails.forEach((r, i) => { r.rotation.z = (i % 2 ? 1 : -1) * sag * 0.06; });
      });
      return;
    }
    // Fallback legado (una sola valla)
    const f0 = fracs[0];
    for (const p of this.fencePosts) {
      const target = f0 >= 0.99 ? 0 : (f0 < p.fallAt ? 1 : (f0 < p.fallAt + 0.15 ? 0.45 : 0));
      p.tilt += (target - p.tilt) * 0.06;
      p.mesh.rotation.z = p.tilt * p.dir * 1.35;
      p.mesh.rotation.x = p.tilt * 0.3;
      p.mesh.position.y = p.baseY - p.tilt * 2.2;
    }
    const sag = (1 - f0) * 0.5;
    this.fenceRails.forEach((r, i) => { r.rotation.z = (i % 2 ? 1 : -1) * sag * 0.06; });
  }

  // ---------- props: sacos, barriles, nido de francotirador elevado, extracción ----------
  buildProps() {
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x9a8a64, roughness: 1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3d454a, metalness: 0.75, roughness: 0.35 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3b2d1d, roughness: 0.9 });
    const camoMat = new THREE.MeshStandardMaterial({ color: 0x2b3b32, roughness: 0.8 });

    // sacos defensivos tras la valla interior (en tierra firme, nunca en el mar)
    for (let r = 0; r < 2; r++) for (let i = 0; i < 18; i++) {
      const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 3, 6), sandMat);
      s.rotation.z = Math.PI / 2;
      s.position.set(-8 + i * 1.15 + (r ? 0.5 : 0), 0.32 + r * 0.55, 3.2);
      s.castShadow = true;
      this.scene.add(s);
    }
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3d5a44, roughness: 0.7, metalness: 0.3 });
    const barrelMat2 = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.7, metalness: 0.3 });
    [[-8, 5], [-7.2, 5.6], [18, 4.6], [18.9, 5.1], [17.4, 5.8], [-4, 28], [4, 28], [-5, 36], [5, 36]].forEach(([x, z], i) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 10), i % 2 ? barrelMat2 : barrelMat);
      b.position.set(x, 0.7, z); b.castShadow = true;
      this.scene.add(b);
    });

    // ========== GRAN TORRE / NIDO ELEVADO DEL FRANCOTIRADOR ==========
    // (grupo en x=0, z=34 · ojo del tirador SNIPER_EYE = y 13.95, z 32.0 en game.js)
    const tower = new THREE.Group();
    tower.name = 'sniperTower';
    tower.position.set(0, 0, 34);
    this.tower = tower;

    // 4 pilares estructurales de acero desde el suelo hasta la plataforma
    const pillarCoords = [[-3.4, -2.6], [3.4, -2.6], [-3.4, 2.6], [3.4, 2.6]];
    for (const [lx, lz] of pillarCoords) {
      const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 12.4, 0.55), metalMat);
      pilar.position.set(lx, 6.2, lz);
      pilar.castShadow = true;
      tower.add(pilar);
      // zapata de hormigón
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x555855, roughness: 0.9 }));
      base.position.set(lx, 0.25, lz);
      tower.add(base);
    }
    // vigas cruzadas de refuerzo
    for (const yLevel of [3.5, 7.5, 11.2]) {
      const bFront = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.25, 0.25), metalMat);
      bFront.position.set(0, yLevel, -2.6); tower.add(bFront);
      const bBack = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.25, 0.25), metalMat);
      bBack.position.set(0, yLevel, 2.6); tower.add(bBack);
      const bLeft = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 5.2), metalMat);
      bLeft.position.set(-3.4, yLevel, 0); tower.add(bLeft);
      const bRight = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 5.2), metalMat);
      bRight.position.set(3.4, yLevel, 0); tower.add(bRight);
    }

    // Suelo de la plataforma del francotirador a y = 12.15 (superior en 12.325)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.35, 6.4), metalMat);
    deck.position.set(0, 12.15, 0);
    deck.receiveShadow = true;
    tower.add(deck);

    // ---- PARAPETO BAJO DE TIRO (apoyo del francotirador) ----
    // Geometría calculada para que el ojo del tirador (SNIPER_EYE) quede ~0.8 m POR
    // ENCIMA de la coronación: así el muro solo entra en cuadro en la franja inferior
    // (y al bajar la vista), sin tapar nunca la valla ni a los zombis.
    const wallH = PARAPET_TOP - 0.44 - 12.325;          // muro de madera bajo los sacos
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(7.4, wallH, 0.45), darkWood);
    frontWall.position.set(0, 12.325 + wallH / 2, PARAPET_Z - 34);
    frontWall.castShadow = true;
    tower.add(frontWall);

    // Hilera de sacos de arena en el frontal del nido (apoyo para el cañón)
    for (let i = 0; i < 9; i++) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 3, 6), sandMat);
      bag.rotation.z = Math.PI / 2;
      bag.position.set(-3.0 + i * 0.75, PARAPET_TOP - 0.24, PARAPET_Z - 34);
      bag.castShadow = true;
      tower.add(bag);
    }

    // Barandillas laterales y traseras
    for (const sx of [-3.7, 3.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 6.2), metalMat);
      rail.position.set(sx, 12.8, 0); tower.add(rail);
    }
    const backRail = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.1, 0.12), metalMat);
    backRail.position.set(0, 12.8, 3.1); tower.add(backRail);

    // Techo / marquesina militar
    const roofPillarCoords = [[-3.4, -2.6], [3.4, -2.6], [-3.4, 2.6], [3.4, 2.6]];
    for (const [lx, lz] of roofPillarCoords) {
      const rp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 0.2), metalMat);
      rp.position.set(lx, 14.3, lz); tower.add(rp);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.18, 7.0), camoMat);
    canopy.position.set(0, 16.4, 0);
    canopy.castShadow = true;
    tower.add(canopy);

    // Mástil de comunicaciones y baliza roja superior
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 6), metalMat);
    mast.position.set(-3.2, 18.2, -2.4); tower.add(mast);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), this.beaconMat);
    beacon.position.set(-3.2, 20.0, -2.4); tower.add(beacon);

    // Focos frontales de la torre apuntando hacia el terreno / valla
    for (const fx of [-3.2, 3.2]) {
      const towerSpot = new THREE.SpotLight(0xffeed0, 5.0, 80, 0.6, 0.3, 1.2);
      towerSpot.position.set(fx, 13.6, -2.8);
      const tgt = new THREE.Object3D();
      tgt.position.set(fx * 1.5, 0, -5);
      this.scene.add(tgt);
      towerSpot.target = tgt;
      tower.add(towerSpot);
      this.lampLights.push(towerSpot);
    }

    // Equipo táctico dentro del nido (cajas de munición, radio)
    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: 0x2e4a32, roughness: 0.6 }));
    ammoBox.position.set(-2.2, 12.5, -1.8); ammoBox.castShadow = true; tower.add(ammoBox);
    const radioMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.4), new THREE.MeshStandardMaterial({ color: 0x1d2426, metalness: 0.8, roughness: 0.3 }));
    radioMesh.position.set(2.4, 12.5, -1.8); tower.add(radioMesh);
    const radioAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), metalMat);
    radioAnt.position.set(2.6, 13.3, -1.9); tower.add(radioAnt);

    this.scene.add(tower);

    // punto de extracción (bandera verde)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), metalMat);
    pole.position.set(26, 2.5, 2); this.scene.add(pole);
    this.flagMat = new THREE.MeshBasicMaterial({ color: 0x2bd96a, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), this.flagMat);
    flag.position.set(26.85, 4.4, 2); this.scene.add(flag);
    this.flag = flag;
    const ex = new THREE.PointLight(0x2bd96a, 1.8, 10, 1.8);
    ex.position.set(26, 3, 2); this.scene.add(ex);
  }

  // ---------- helicóptero ----------
  buildHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x44523e, roughness: 0.55, metalness: 0.35 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x232a24, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.6, 4, 10), bodyMat);
    body.rotation.z = Math.PI / 2; body.castShadow = true; g.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0x101c22, roughness: 0.2, metalness: 0.7 }));
    nose.rotation.z = -Math.PI / 2; nose.position.x = 2.2; g.add(nose);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 4.6, 8), bodyMat);
    tail.rotation.z = Math.PI / 2; tail.position.x = -4; g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.9), bodyMat);
    fin.position.set(-6.1, 0.7, 0); g.add(fin);
    this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.22), darkMat);
    this.tailRotor.position.set(-6.2, 0.7, 0.3); g.add(this.tailRotor);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), darkMat);
    mast.position.y = 1.3; g.add(mast);
    this.rotor = new THREE.Group(); this.rotor.position.y = 1.8;
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.6 });
    for (let i = 0; i < 2; i++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), bladeMat);
      bl.rotation.y = i * Math.PI / 2; this.rotor.add(bl);
    }
    g.add(this.rotor);
    for (const s of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.12), darkMat);
      skid.position.set(0.2, -1.5, s * 1.2); g.add(skid);
      for (const sx of [-1, 1]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), darkMat);
        strut.position.set(0.2 + sx, -1.0, s * 1.2); strut.rotation.z = sx * 0.25; g.add(strut);
      }
    }
    this.navL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    this.navR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0x22ff44 }));
    this.navL.position.set(0, -0.4, 1.35); this.navR.position.set(0, -0.4, -1.35);
    g.add(this.navL, this.navR);
    // foco de búsqueda
    this.spot = new THREE.SpotLight(0xfff6d8, 0, 60, 0.35, 0.5, 1.2);
    this.spot.position.set(1.5, -1, 0);
    g.add(this.spot);
    this.spotTarget = new THREE.Object3D();
    g.add(this.spotTarget);
    this.spotTarget.position.set(6, -14, 0);
    this.spot.target = this.spotTarget;
    this.scene.add(g);
    this.heli = g;
    this.heliAngle = 0;
    this.heliTask = null; // {phase, t, from, to, drops, di, onDrop, onDone}
    this.heliPosV = new THREE.Vector3();
  }
  heliStrike(lineA, lineB, nDrops, onDrop, onDone) {
    if (this.heliTask) return false;
    this.heliTask = { phase: 'ingress', t: 0, from: lineA.clone(), to: lineB.clone(), n: nDrops, di: 0, onDrop, onDone };
    return true;
  }
  updateHeli(dt, night) {
    const h = this.heli, T = this.heliTask;
    this.rotor.rotation.y += dt * 22;
    this.tailRotor.rotation.x += dt * 30;
    const blink = (this.time % 1.1) < 0.15;
    this.navL.visible = blink; this.navR.visible = !blink;
    this.spot.intensity += (((night ? 260 : 0)) - this.spot.intensity) * Math.min(1, dt * 2);
    if (!T) {
      this.heliAngle += dt * 0.13;
      const r = 46, y = 24 + Math.sin(this.time * 0.4) * 2;
      const tx = Math.cos(this.heliAngle) * r, tz = Math.sin(this.heliAngle) * r * 0.6 - 12;
      h.position.x += (tx - h.position.x) * Math.min(1, dt * 1.5);
      h.position.z += (tz - h.position.z) * Math.min(1, dt * 1.5);
      h.position.y += (y - h.position.y) * Math.min(1, dt * 1.5);
      const nx = Math.cos(this.heliAngle + 0.1) * r, nz = Math.sin(this.heliAngle + 0.1) * r * 0.6 - 12;
      const targetYaw = Math.atan2(-(nx - h.position.x), -(nz - h.position.z)) + Math.PI / 2;
      let d = targetYaw - h.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      h.rotation.y += d * Math.min(1, dt * 3);
      h.rotation.z = 0.12;
    } else {
      T.t += dt;
      // orientación con el morro (+X local) hacia el objetivo
      const faceYaw = (tx, tz) => {
        const dx = tx - h.position.x, dz = tz - h.position.z;
        if (dx * dx + dz * dz < 0.04) return;
        const ty = Math.atan2(-dx, -dz) + Math.PI / 2;
        let d = ty - h.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        h.rotation.y += d * Math.min(1, dt * 3);
      };
      if (T.phase === 'ingress') {
        // volar hasta el inicio de la pasada
        const p = T.from.clone(); p.y = 20;
        h.position.lerp(p, Math.min(1, dt * 1.2));
        faceYaw(p.x, p.z);
        if (T.t > 2.6 || h.position.distanceTo(p) < 3) { T.phase = 'run'; T.t = 0; }
      } else if (T.phase === 'run') {
        const dur = 3.2, k = Math.min(1, T.t / dur);
        h.position.lerpVectors(T.from.clone().setY(20), T.to.clone().setY(20), k);
        faceYaw(T.to.x, T.to.z);
        h.rotation.z = 0;
        const should = Math.floor(k * T.n);
        while (T.di < should) {
          const pos = T.from.clone().lerp(T.to, (T.di + 0.5) / T.n);
          pos.y = 0; T.onDrop && T.onDrop(T.di, pos); T.di++;
        }
        if (k >= 1) { T.phase = 'egress'; T.t = 0; T.onDone && T.onDone(); }
      } else {
        h.position.y += (26 - h.position.y) * Math.min(1, dt);
        if (T.t > 2.5) this.heliTask = null;
      }
    }
    this.heliPosV.copy(h.position);
  }

  // ---------- lluvia ----------
  buildRain() {
    const n = 1800;
    this.rainN = n;
    this.rainPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.rainPos[i*3] = (Math.random() - 0.5) * 90;
      this.rainPos[i*3+1] = Math.random() * 26;
      this.rainPos[i*3+2] = 20 - Math.random() * 65;
    }
    const g = new THREE.BufferGeometry();
    this.rainAttr = new THREE.BufferAttribute(this.rainPos, 3);
    g.setAttribute('position', this.rainAttr);
    this.rainMat = new THREE.PointsMaterial({ color: 0x9fbecd, size: 0.14, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.Points(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }
  updateRain(dt, storm) {
    this.rain.visible = storm > 0.02;
    if (!this.rain.visible) return;
    this.rainMat.opacity = storm * 0.75;
    const v = 26 * dt, w = storm * 9 * dt;
    for (let i = 0; i < this.rainN; i++) {
      this.rainPos[i*3+1] -= v * (0.8 + (i % 5) * 0.08);
      this.rainPos[i*3] -= w * 0.6;
      if (this.rainPos[i*3+1] < 0) {
        this.rainPos[i*3+1] = 24 + Math.random() * 3;
        this.rainPos[i*3] = (Math.random() - 0.5) * 90;
        this.rainPos[i*3+2] = 20 - Math.random() * 65;
      }
    }
    this.rainAttr.needsUpdate = true;
  }

  // ---------- armas en vista (viewmodels) ----------
  buildViewmodels() {
    this.vm = new THREE.Group();
    this.vmBase = V3(0.34, -0.32, -0.7);
    this.vmAim = V3(0, -0.238, -0.5);
    this.vm.position.copy(this.vmBase);
    this.camera.add(this.vm);
    this.weapons3d = [null, null, null, null];
    this.muzzles = [null, null, null, null];
    this.curW = 0; this.zoomBlend = 0; this.zoomTarget = 0;
    this.kick = 0; this.reloadDipT = 0;
    // rifle procedural de respaldo: crear ANTES de intentar la carga GLTF
    // para que el callback de error nunca lo encuentre indefinido
    this.fallbackRifle = this.buildFallbackRifle();
    this.fallbackRifle.visible = false;
    this.vm.add(this.fallbackRifle);
    this.loadMauser();
    this.weapons3d[1] = this.buildPistol();
    this.weapons3d[2] = this.buildLauncher();
    this.weapons3d[3] = this.buildMissiles();
    for (let i = 1; i < 4; i++) { this.weapons3d[i].visible = false; this.vm.add(this.weapons3d[i]); }
  }
  gunMetal(c, m, r) { return new THREE.MeshStandardMaterial({ color: c, metalness: (m !== undefined && m !== null) ? m : 0.75, roughness: (r !== undefined && r !== null) ? r : 0.35 }); }
  useFallbackRifle() {
    // Rifle procedural de respaldo (misma API que el GLTF: visible + muzzle)
    if (this.weapons3d[0] && this.weapons3d[0] !== this.fallbackRifle) return; // GLTF ya cargado
    this.weapons3d[0] = this.fallbackRifle;
    this.fallbackRifle.visible = (this.curW === 0);
    if (!this.muzzles[0]) {
      const mz = new THREE.Object3D(); mz.position.set(0, 0.03, -0.95); this.fallbackRifle.add(mz);
      this.muzzles[0] = mz;
    }
  }
  loadMauser() {
    let loader;
    try {
      loader = new GLTFLoader();
    } catch (e) {
      console.warn('GLTFLoader no disponible, usando rifle procedural', e);
      this.useFallbackRifle();
      return;
    }
    try {
    loader.load('resources/gltf-Sniper/Mauser_98K.gltf', (gltf) => {
      const model = gltf.scene;
      // analizar geometría: normalizar escala y orientar el cañón (extremo fino) hacia -Z
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      let geo = null;
      model.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
      let barrelSign = 1;
      try {
        const posA = geo.attributes.position;
        let rPos = 0, nPos = 0, rNeg = 0, nNeg = 0;
        const step = Math.max(1, Math.floor(posA.count / 1200));
        for (let i = 0; i < posA.count; i += step) {
          const x = posA.getX(i) - center.x, y = posA.getY(i) - center.y, z = posA.getZ(i) - center.z;
          const r = Math.sqrt(y * y + z * z);
          if (x >= 0) { rPos += r; nPos++; } else { rNeg += r; nNeg++; }
        }
        barrelSign = (rPos / Math.max(1, nPos)) < (rNeg / Math.max(1, nNeg)) ? 1 : -1;
      } catch (e) { barrelSign = 1; }
      const wrap = new THREE.Group();
      // recentrar
      model.position.sub(center);
      wrap.add(model);
      const longest = Math.max(size.x, size.y, size.z);
      const s = 1.55 / longest;
      wrap.scale.setScalar(s);
      // el modelo mide a lo largo de X: rotar para apuntar a -Z
      wrap.rotation.y = barrelSign > 0 ? Math.PI / 2 : -Math.PI / 2;
      wrap.rotation.x = 0.015;
      model.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
      this.weapons3d[0] = wrap;
      this.vm.add(wrap);
      this.weapons3d[0].visible = (this.curW === 0);
      const mz = new THREE.Object3D(); mz.position.set(0, 0.045, -1.05); wrap.add(mz);
      this.muzzles[0] = mz;
    }, undefined, () => {
      // fallo de carga (404, file://, CDN bloqueado…) → rifle procedural
      this.useFallbackRifle();
    });
    } catch (e) {
      // Throw síncrono (p. ej. URL relativa inválida fuera del navegador):
      // usar el rifle procedural sin romper la construcción del mundo.
      console.warn('No se pudo iniciar la carga del Mauser, usando rifle procedural', e);
      this.useFallbackRifle();
    }
  }
  buildFallbackRifle() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.8 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.1, 8), this.gunMetal(0x2a2f33));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.35); g.add(barrel);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), wood);
    stock.position.set(0, -0.03, 0.32); stock.rotation.x = 0.08; g.add(stock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), this.gunMetal(0x33393e));
    body.position.set(0, 0.01, -0.05); g.add(body);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), this.gunMetal(0x1c2124));
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.1, 0.02); g.add(scope);
    return g;
  }
  buildPistol() {
    const g = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.42), this.gunMetal(0x2b3136));
    slide.position.set(0, 0.02, -0.12); g.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.24, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.85 }));
    grip.position.set(0, -0.13, 0.05); grip.rotation.x = 0.18; g.add(grip);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.03), this.gunMetal(0x111417));
    sight.position.set(0, 0.08, -0.3); g.add(sight);
    const mz = new THREE.Object3D(); mz.position.set(0, 0.02, -0.36); g.add(mz);
    this.muzzles[1] = mz;
    return g;
  }
  buildLauncher() {
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.95, 12), this.gunMetal(0x4a5240, 0.5, 0.5));
    tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.02, -0.2); g.add(tube);
    const ringM = this.gunMetal(0x22271f);
    for (const z of [-0.6, 0.2]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 8, 16), ringM);
      r.position.set(0, 0.02, z); g.add(r);
    }
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), new THREE.MeshStandardMaterial({ color: 0x2c2318, roughness: 0.9 }));
    grip.position.set(0, -0.12, 0.05); g.add(grip);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.06), ringM);
    sight.position.set(0, 0.12, -0.1); g.add(sight);
    const mz = new THREE.Object3D(); mz.position.set(0, 0.02, -0.7); g.add(mz);
    this.muzzles[2] = mz;
    return g;
  }
  buildMissiles() {
    const g = new THREE.Group();
    const boxM = this.gunMetal(0x39423a, 0.55, 0.45);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.6), boxM);
    pod.position.set(0, 0.03, -0.2); g.add(pod);
    const tubeM = this.gunMetal(0x151917);
    for (const [ox, oy] of [[-0.06, 0.09], [0.06, 0.09], [-0.06, -0.03], [0.06, -0.03]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.64, 10), tubeM);
      t.rotation.x = Math.PI / 2; t.position.set(ox, oy, -0.2); g.add(t);
    }
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0x2bff88 }));
    screen.position.set(0.0, 0.2, -0.05); screen.rotation.x = -0.3; g.add(screen);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), new THREE.MeshStandardMaterial({ color: 0x2c2318, roughness: 0.9 }));
    grip.position.set(0, -0.14, 0.02); g.add(grip);
    const mz = new THREE.Object3D(); mz.position.set(0, 0.03, -0.55); g.add(mz);
    this.muzzles[3] = mz;
    return g;
  }
  setWeapon(i) {
    this.curW = i;
    // Ocultar todas las armas primero
    for (let k = 0; k < 4; k++) {
      if (this.weapons3d[k]) this.weapons3d[k].visible = (k === i);
    }
    // Lógica robusta para el rifle: si aún no ha cargado el GLTF, usar fallback
    if (this.weapons3d[0] === null) {
      if (this.fallbackRifle) this.fallbackRifle.visible = (i === 0);
    } else {
      // Si ya hay modelo GLTF, asegurar que fallback esté oculto
      if (this.fallbackRifle && this.weapons3d[0] !== this.fallbackRifle) {
        this.fallbackRifle.visible = false;
      }
    }
    this.kick = Math.max(this.kick, 0.35);
    this.swapT = 0.35;
  }
  setZoomed(z) { this.zoomTarget = z ? 1 : 0; }
  addKick(s) { this.kick = Math.min(1.4, this.kick + s); }
  reloadDip() { this.reloadDipT = 0.6; }
  muzzleWorld(out) {
    try{
      const idx = Math.max(0, Math.min(3, this.curW|0));
      const mz = this.muzzles[idx];
      if (mz) return mz.getWorldPosition(out);
    }catch(e){}
    return out.copy(this.camera.position);
  }
  updateViewmodel(dt, t, firing) {
    this.zoomBlend += (this.zoomTarget - this.zoomBlend) * Math.min(1, dt * 9);
    const zb = this.zoomBlend;
    // Con el rifle (curW === 0), al hacer zoom el arma se repliega hacia abajo para despejar la mira telescópica
    const aimPos = (this.curW === 0)
      ? V3(0, -0.65, -0.4)
      : (this.curW === 1 ? this.vmAim : V3(0.14, -0.27, -0.6));
    const sway = firing ? 0 : 1;
    this.vm.position.lerpVectors(this.vmBase, aimPos, zb);
    this.vm.position.y += Math.sin(t * 1.7) * 0.004 * sway;
    this.vm.position.x += Math.cos(t * 1.3) * 0.003 * sway;
    this.kick = Math.max(0, this.kick - dt * 5);
    this.vm.position.z += this.kick * 0.14;
    this.vm.rotation.x = this.kick * 0.16;
    if (this.reloadDipT > 0) {
      this.reloadDipT -= dt;
      this.vm.position.y -= Math.sin((0.6 - this.reloadDipT) / 0.6 * Math.PI) * 0.12;
      this.vm.rotation.z = Math.sin((0.6 - this.reloadDipT) / 0.6 * Math.PI) * 0.35;
    } else this.vm.rotation.z *= 0.8;
    if (this.swapT > 0) {
      this.swapT -= dt;
      this.vm.position.y -= Math.sin((0.35 - Math.max(0, this.swapT)) / 0.35 * Math.PI) * 0.18;
    }
    const s = 1 - zb * 0.12;
    this.vm.scale.set(s, s, s);
  }

  // ---------- entorno (día/noche + tormenta) ----------
  updateEnv(dt, t, dayT, storm, lightning) {
    this.time = t;
    const { a, b, f } = dayFrame(dayT);
    const C = this.tmpC;
    // cielo + niebla
    lerpColor(a.sky, b.sky, f, C);
    if (storm > 0) C.lerp(new THREE.Color(0x232e33), storm * 0.75);
    if (lightning > 0) C.lerp(new THREE.Color(0xbcd6ff), lightning * 0.65);
    this.sky.material.color.copy(C);
    this.scene.background = this.scene.background || new THREE.Color();
    this.scene.background.copy(C).multiplyScalar(0.55);
    lerpColor(a.fog, b.fog, f, C);
    if (storm > 0) C.lerp(new THREE.Color(0x1c262a), storm * 0.7);
    this.scene.fog.color.copy(C);
    this.scene.fog.density = (a.den + (b.den - a.den) * f) * (1 + storm * 0.55);
    // sol
    lerpColor(a.sun, b.sun, f, C);
    this.sun.color.copy(C);
    this.sun.intensity = (a.sunI + (b.sunI - a.sunI) * f) * (1 - storm * 0.55);
    const ang = dayT * Math.PI * 2;
    this.sun.position.set(Math.cos(ang) * 38, Math.max(7, 16 + Math.sin(ang) * 22), 20);
    this.hemi.intensity = (a.hemi + (b.hemi - a.hemi) * f) * (1 - storm * 0.3) + lightning * 2.5;
    this.flashDir.intensity = lightning * 5;
    // agua
    lerpColor(a.water, b.water, f, C);
    if (storm > 0) C.multiplyScalar(1 - storm * 0.35);
    this.water.material.color.copy(C);
    this.updateWater(t, storm);
    // lámparas y estrellas
    const lampI = (a.lamp + (b.lamp - a.lamp) * f) * (1 + storm * 0.25);
    for (const l of this.lampLights) l.intensity = lampI;
    this.starMat.opacity = (a.stars + (b.stars - a.stars) * f) * (1 - storm * 0.95);
    // baliza y bandera
    const bl = (t % 1.4) < 0.2;
    this.beaconMat.color.setHex(bl ? 0xff3344 : 0x440a10);
    this.flag.rotation.y = Math.sin(t * (2 + storm * 6)) * (0.15 + storm * 0.3);
    this.updateRain(dt, storm);
    const night = (a.stars + (b.stars - a.stars) * f);
    this.updateHeli(dt, night > 0.4 || storm > 0.5);
  }
  updateWater(t, storm) {
    const p = this.waterGeo.attributes.position, base = this.waterBase;
    const amp = 0.1 + storm * 0.55 + Math.sin(t * 0.5) * 0.03;
    for (let i = 0; i < p.count; i++) {
      const x = base[i*3], z = base[i*3+2];
      p.array[i*3+1] = Math.sin(x * 0.22 + t * (1.5 + storm * 2.2)) * amp
        + Math.cos(z * 0.19 + t * (1.0 + storm * 1.6)) * amp
        + Math.sin((x + z) * 0.08 + t * 0.7) * amp * 0.7;
    }
    p.needsUpdate = true;
    this.waterGeo.computeVertexNormals();
    // Resaca: la espuma oscila sobre la orilla
    if (this.foam) {
      this.foam.position.x = SHORE_X - 0.4 + Math.sin(t * 1.1) * 0.5;
      if (this.foamMat) this.foamMat.opacity = 0.45 + Math.sin(t * 1.1) * 0.12 + storm * 0.15;
    }
  }
  isSea(x) { return x < SHORE_X; }
  setQuality(q) {
    const dpr = (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) ? devicePixelRatio : 1;
    if (q === 'high') { this.renderer.setPixelRatio(Math.min(dpr, 2)); this.renderer.shadowMap.enabled = true; }
    else if (q === 'med') { this.renderer.setPixelRatio(Math.min(dpr, 1.5)); this.renderer.shadowMap.enabled = true; }
    else { this.renderer.setPixelRatio(1); this.renderer.shadowMap.enabled = false; }
    this.sun.castShadow = (q !== 'low');
  }
}
