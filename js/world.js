// FRONTERA // Dead Tide — Mundo 3D: entorno, clima, valla, helicóptero y armas en vista
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { models, FENCE_CATALOG } from './models.js';

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

// ---------- TORRE AMPLIADA: PLANTAS Y COTAS ----------
// La torre gana DOS alturas hacia arriba (OBSERVATORIO y VIGÍA) y UNA hacia abajo
// (BASE, a nivel de suelo). EYE_HEIGHT es la altura del ojo del tirador sobre el
// suelo de la planta: SNIPER_EYE.y (13.95) = FLOOR_Y.nido (12.325) + 1.625.
export const EYE_HEIGHT = 1.625;
export const TOWER_X = 0;
export const TOWER_Z = 34;
export const FLOOR_Y = Object.freeze({ base: 0, nido: 12.325, obs: 16.43, vigia: 20.535, roof: 24.14 });
export const TOWER_FLOORS = Object.freeze([
  { id: 0, label: 'BASE',         y: FLOOR_Y.base },
  { id: 1, label: 'NIDO',         y: FLOOR_Y.nido },
  { id: 2, label: 'OBSERVATORIO', y: FLOOR_Y.obs },
  { id: 3, label: 'VIGÍA',        y: FLOOR_Y.vigia },
]);
// Punto donde se amontonan los infectados al pie de la torre (asalto cuerpo a cuerpo)
export const TOWER_ASSAULT = Object.freeze({ x: 0, z: 30.2 });

// ---------- GEOGRAFÍA DEL SECTOR COSTERO (costa 25/75) ----------
// El mar queda a la IZQUIERDA (oeste, x < SHORE_X) y está DELIMITADO A LA COSTA: el
// plano de agua termina exactamente en x = SHORE_X y no se solapa con el terreno.
// SHORE_X = -26 encuadra el mar en ≈25 % del campo de visión (a 16:9, verificado por
// proyección de la cámara SNIPER_EYE, pitch ≈ -16,5°, VFOV 62°) sobre el tramo de
// juego (vallas y aproximación, 40-60 m): el 75 % restante es tierra firme.
// La costa corre de norte a sur PARALELA al frente de la torre: la cámara mira al
// horizonte (−Z) y se enfrenta a los invasores de frente, que vienen por la playa.
// Las vallas se extienden solo en tierra firme (FENCE_X0..FENCE_X1, con 16 m de
// margen a la orilla); el flanco marítimo queda abierto para el asalto en lancha
// enemiga y para la lancha de defensa que patrulla nuestra playa.
export const SHORE_X = -26;
export const FENCE_ZS = Object.freeze([-14, -7, -1]); // exterior → interior
export const FENCE_X0 = -26;
export const FENCE_X1 = 32;
export const FENCE_LABELS = Object.freeze(['EXTERIOR', 'MEDIA', 'INTERIOR']);
// Zona construible del editor de vallado: todo el corredor terrestre por donde
// avanzan los infectados, desde el horizonte de aparición hasta los sacos que hay
// detrás de la valla interior. (En tierra firme: el mar queda fuera por x < SHORE_X.)
export const BUILD_X0 = FENCE_X0;  // -26 (línea de costa)
export const BUILD_X1 = FENCE_X1;  // +32 (muro este)
export const BUILD_Z0 = -45;       // horizonte de aparición
export const BUILD_Z1 = 12;        // sacos / zona de extracción
// Límites del paseo a pie por NUESTRO lado de la frontera (playa propia + torre):
// desde la orilla hasta el muro este, y desde la valla interior hacia el sur.
export const WALK_BOUNDS = Object.freeze({ x0: SHORE_X + 0.9, x1: 31.4, z0: -1.6, z1: 62 });
// Tiempos del asalto anfibio: 3 s para poner la lancha + 2 s para salir de la orilla.
export const BOAT_DEPLOY_TIME = 3.0;
export const BOAT_LAUNCH_TIME = 2.0;

export class World {
  constructor(scene, camera, renderer) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.tmpC = new THREE.Color();
    this.lampLights = []; this.lampMats = [];
    this.fencePosts = []; this.fenceRails = [];
    this.placedFences = [];
    // Superficies por las que el jugador puede caminar a pie (plantas de la torre,
    // rellanos, puentes, tramos de escalera y suelo de nuestro lado de la frontera).
    this.walk = { plates: [], ramps: [], obstacles: [], tolerance: 0.85 };
    this.walk.plates.push({ x0: WALK_BOUNDS.x0, x1: WALK_BOUNDS.x1, z0: WALK_BOUNDS.z0, z1: WALK_BOUNDS.z1, y: 0, floor: 0 });
    // Sacos terreros y línea de la valla interior: no se atraviesan a pie
    this.walk.obstacles.push(
      { x0: -8.7, x1: 12.4, z0: 2.7, z1: 3.75, y0: -1, y1: 1.25 },
      { x0: FENCE_X0, x1: FENCE_X1, z0: -1.35, z1: -0.65, y0: -1, y1: 6 },
      { x0: 25.6, x1: 26.4, z0: 1.6, z1: 2.4, y0: -1, y1: 5 },
    );
    this.hologramGroup = new THREE.Group();
    this.hologramGroup.name = 'fenceHologram';
    this.scene.add(this.hologramGroup);
    this.time = 0;
    this.buildLights();
    this.buildSky();
    this.buildTerrain();
    this.buildRightWall();
    this.buildFence();
    this.buildProps();
    this.buildHeli();
    this.buildRain();
    this.buildEditorOverlay();
    this.buildViewmodels();
  }

  // ---------- SUPERVISIÓN DE EDICIÓN DE VALLADO ----------
  // Rejilla + retícula en el terreno que marca la zona construible y el punto
  // exacto de colocación. Solo visible en modo edición (setEditorOverlay).
  buildEditorOverlay() {
    const w = BUILD_X1 - BUILD_X0, d = BUILD_Z1 - BUILD_Z0;
    const cx = (BUILD_X0 + BUILD_X1) / 2, cz = (BUILD_Z0 + BUILD_Z1) / 2;
    const g = new THREE.Group();
    g.name = 'fenceEditorOverlay';

    // Suelo translúcido sobre la zona construible
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: 0x7cf8ff, transparent: true, opacity: 0.045, depthWrite: false })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.02, cz);
    floor.renderOrder = 2;
    g.add(floor);

    // Líneas de rejilla cada 4 m
    const pts = [];
    for (let x = BUILD_X0; x <= BUILD_X1 + 0.01; x += 4) {
      pts.push(x, 0.035, BUILD_Z0, x, 0.035, BUILD_Z1);
    }
    for (let z = BUILD_Z0; z <= BUILD_Z1 + 0.01; z += 4) {
      pts.push(BUILD_X0, 0.035, z, BUILD_X1, 0.035, z);
    }
    const ggeo = new THREE.BufferGeometry();
    ggeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(ggeo, new THREE.LineBasicMaterial({ color: 0x7cf8ff, transparent: true, opacity: 0.14, depthWrite: false }));
    grid.renderOrder = 3;
    g.add(grid);

    // Perímetro resaltado
    const bb = [[BUILD_X0, BUILD_Z0], [BUILD_X1, BUILD_Z0], [BUILD_X1, BUILD_Z1], [BUILD_X0, BUILD_Z1], [BUILD_X0, BUILD_Z0]];
    const bpts = [];
    for (let i = 0; i < bb.length - 1; i++) {
      bpts.push(bb[i][0], 0.04, bb[i][1], bb[i + 1][0], 0.04, bb[i + 1][1]);
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bpts, 3));
    const border = new THREE.LineSegments(bgeo, new THREE.LineBasicMaterial({ color: 0xffb84c, transparent: true, opacity: 0.55, depthWrite: false }));
    border.renderOrder = 3;
    g.add(border);

    g.visible = false;
    this.editorOverlay = g;
    this.scene.add(g);

    // Retícula de punto exacto (anillo + cruz + punto central)
    const ret = new THREE.Group();
    ret.name = 'fenceAimReticle';
    this.reticleMat = new THREE.MeshBasicMaterial({ color: 0x7cf8ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), this.reticleMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.09;
    ring.renderOrder = 4;
    ret.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), this.reticleMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.09;
    dot.renderOrder = 4;
    ret.add(dot);
    for (let i = 0; i < 2; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.055), this.reticleMat);
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = i * Math.PI / 2;
      tick.position.y = 0.085;
      tick.renderOrder = 4;
      ret.add(tick);
    }
    ret.visible = false;
    this.aimReticle = ret;
    this.scene.add(ret);
  }

  setEditorOverlay(v) {
    if (this.editorOverlay) this.editorOverlay.visible = !!v;
    if (this.aimReticle && !v) this.aimReticle.visible = false;
  }

  setReticle(x, z, valid) {
    const r = this.aimReticle;
    if (!r) return;
    r.visible = true;
    r.position.set(x, 0, z);
    if (this.reticleMat) this.reticleMat.color.setHex(valid ? 0x7cf8ff : 0xff5470);
  }

  // Distancia punto-segmento en el plano XZ (para colisiones de vallas)
  ptSegDist2D(px, pz, ax, az, bx, bz) {
    const abx = bx - ax, abz = bz - az;
    const apx = px - ax, apz = pz - az;
    const len2 = abx * abx + abz * abz;
    let t = len2 > 1e-9 ? (apx * abx + apz * abz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = px - (ax + abx * t), dz = pz - (az + abz * t);
    return Math.hypot(dx, dz);
  }

  // ¿Puede colocarse una valla nueva en (x, z) con esa rotación/anchura?
  // Rechaza solapamientos con vallas ya colocadas (capas base y personalizadas).
  isFenceSpotFree(x, z, rot, width, depth) {
    if (!this.placedFences || !this.placedFences.length) return true;
    const dx = Math.cos(rot || 0), dz = Math.sin(rot || 0);
    const hL = (width || 4) * 0.5;
    const px0 = x - dx * hL, pz0 = z - dz * hL;
    const px1 = x + dx * hL, pz1 = z + dz * hL;
    const N = 9;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const sx = px0 + (px1 - px0) * t;
      const sz = pz0 + (pz1 - pz0) * t;
      for (const f of this.placedFences) {
        if (!f.alive) continue;
        const fdx = Math.cos(f.rotation || 0), fdz = Math.sin(f.rotation || 0);
        const fL = (f.width || 4) * 0.5;
        const qx0 = f.x - fdx * fL, qz0 = f.z - fdz * fL;
        const qx1 = f.x + fdx * fL, qz1 = f.z + fdz * fL;
        const d = this.ptSegDist2D(sx, sz, qx0, qz0, qx1, qz1);
        const gap = ((depth || 0.5) + (f.depth || 0.5)) * 0.5 + 0.35;
        if (d < gap) return false;
      }
    }
    return true;
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

  // ---------- terreno: mar delimitado a la costa (izquierda) + playa (derecha) ----------
  buildTerrain() {
    // MAR (oeste): plano de agua animada a la izquierda de la orilla. Su borde este
    // queda EXACTAMENTE en x = SHORE_X: el agua no se solapa con el terreno.
    this.waterGeo = new THREE.PlaneGeometry(160, 340, 40, 56);
    this.waterGeo.rotateX(-Math.PI / 2);
    this.waterBase = this.waterGeo.attributes.position.array.slice();
    this.water = new THREE.Mesh(this.waterGeo, new THREE.MeshPhongMaterial({
      color: 0x0a343c, shininess: 110, transparent: true, opacity: 0.93
    }));
    // x: SHORE_X-160..SHORE_X (borde este justo en la orilla), z: -180..160
    this.water.position.set(SHORE_X - 80, -0.15, -10);
    this.scene.add(this.water);
    // Fondo marino bajo el agua para dar profundidad (mismo alcance que el agua;
    // nunca más allá de la orilla, para no asomarse bajo la arena)
    this.seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 340),
      new THREE.MeshStandardMaterial({ color: 0x3a4a44, roughness: 1 })
    );
    this.seabed.rotation.x = -Math.PI / 2;
    this.seabed.position.set(SHORE_X - 80, -0.9, -10);
    this.scene.add(this.seabed);
    // TIERRA (este): arena que cubre todo el corredor terrestre y bajo la torre,
    // desde la orilla (x = SHORE_X) hacia el este: sin huecos ni solapamientos.
    this.sand = new THREE.Mesh(
      new THREE.PlaneGeometry(156, 340),
      new THREE.MeshStandardMaterial({ color: 0x8e7757, roughness: 1 })
    );
    this.sand.rotation.x = -Math.PI / 2;
    // x: SHORE_X..138, z: -180..160
    this.sand.position.set(SHORE_X + 78, 0, -10);
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
    // Rocas: escollos en el mar (profundidad, lejos de la playa) + peñascos en tierra
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x1c3536, roughness: 0.95 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 4, 0.8 + Math.random() * 2.2, 2 + Math.random() * 3), rockMat);
      m.position.set(SHORE_X - 44 + Math.random() * 24, 0.2, -40 + Math.random() * 70);
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

  // ---------- muro perimetral fortificado en el flanco derecho ----------
  buildRightWall() {
    const wallGroup = new THREE.Group();
    wallGroup.name = 'rightPerimeterWall';
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x475156, roughness: 0.92, metalness: 0.1 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x242d32, roughness: 0.5, metalness: 0.8 });
    const hazardMat = new THREE.MeshBasicMaterial({ color: 0xffb84c });

    const wallX = 32.5;
    const zMin = -65, zMax = 25;
    const totalLen = zMax - zMin;
    const wallH = 4.8;
    const wallThick = 0.85;

    // Bloque continuo de hormigón armado
    const mainWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, totalLen), concreteMat);
    mainWall.position.set(wallX, wallH / 2, (zMin + zMax) / 2);
    mainWall.castShadow = true;
    mainWall.receiveShadow = true;
    wallGroup.add(mainWall);

    // Coronación superior con remate metálico
    const cap = new THREE.Mesh(new THREE.BoxGeometry(wallThick + 0.35, 0.28, totalLen), steelMat);
    cap.position.set(wallX, wallH + 0.14, (zMin + zMax) / 2);
    wallGroup.add(cap);

    // Pilares y contrafuertes cada 6 metros a lo largo del muro
    for (let z = zMin; z <= zMax; z += 6) {
      const pilar = new THREE.Mesh(new THREE.BoxGeometry(wallThick + 0.65, wallH + 0.9, 0.95), concreteMat);
      pilar.position.set(wallX, (wallH + 0.9) / 2, z);
      pilar.castShadow = true;
      pilar.receiveShadow = true;
      wallGroup.add(pilar);

      // Franja reflectante de seguridad
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(wallThick + 0.68, 0.32, 0.72), hazardMat);
      stripe.position.set(wallX, 2.2, z);
      wallGroup.add(stripe);

      // Lámparas de vigilancia en el sector de vallas
      if (z >= -22 && z <= 12) {
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xff7043 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), lampMat);
        lamp.position.set(wallX - 0.48, wallH + 0.65, z);
        wallGroup.add(lamp);
        this.lampMats.push(lampMat);
      }
    }

    this.scene.add(wallGroup);
  }

  // ---------- vallas destructibles y modelos 3D (desde la costa izquierda al muro derecho) ----------
  buildFence() {
    this.fence = new THREE.Group();
    this.fenceLayers = []; // [{ z, label, posts: [], rails: [], gltfMeshes: [] }]
    this.fencePosts = []; this.fenceRails = [];
    this.fence3DGroup = new THREE.Group();
    this.fence3DGroup.name = 'fence3DModels';
    this.scene.add(this.fence3DGroup);

    const metal = new THREE.MeshStandardMaterial({ color: 0x687b79, metalness: 0.7, roughness: 0.45 });
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xb3c3b8 });
    const fenceW = FENCE_X1 - FENCE_X0;
    const fenceCX = (FENCE_X0 + FENCE_X1) / 2;

    FENCE_ZS.forEach((fz, li) => {
      const layer = { z: fz, label: FENCE_LABELS[li], posts: [], rails: [], gltfMeshes: [] };
      for (let x = FENCE_X0; x <= FENCE_X1 + 0.01; x += 3) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.8, 0.16), metal);
        post.position.set(x, 2.9, fz);
        post.castShadow = true;
        this.fence.add(post);
        const rec = {
          mesh: post, x, baseY: 2.9, layer: li,
          fallAt: 0.15 + Math.random() * 0.8,
          dir: Math.random() < 0.5 ? -1 : 1,
          tilt: 0
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

    // Cargar y sustituir con modelos 3D de /resources/construcción
    this.populate3DFences();

    // Farolas de perímetro distribuidas de costa (x=-26) a muro (x=32).
    // NOTA: se retiran las bombillas esféricas amarillas (los "circulitos" que
    // flotaban sobre las vallas). Solo queda el báculo oscuro + la luz que baña
    // el terreno, sin ningún punto amarillo visible en el horizonte.
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x2b3439, metalness: 0.6, roughness: 0.6 });
    for (const fz of FENCE_ZS) {
      for (const x of [-20, -7, 6, 19]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6, 6), lampPoleMat);
        pole.position.set(x, 3, fz + 0.9);
        this.scene.add(pole);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.28), lampPoleMat);
        head.position.set(x, 5.95, fz + 0.75);
        this.scene.add(head);
        const l = new THREE.PointLight(0xffbf60, 2.5, 15, 1.4);
        l.position.set(x, 5.8, fz + 0.6);
        this.scene.add(l); this.lampLights.push(l);
      }
    }
    // Focos potentes de vigilancia hacia el área de aproximación
    FENCE_ZS.forEach((fz) => {
      for (const fx of [-14, 2, 18]) {
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
    // Baliza luminosa en el extremo marítimo de la costa (x = SHORE_X - 0.8)
    for (const fz of FENCE_ZS) {
      const buoyMat = new THREE.MeshBasicMaterial({ color: 0x36c8ff });
      const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), buoyMat);
      buoy.position.set(FENCE_X0 - 0.8, 0.6, fz);
      this.scene.add(buoy);
      this.lampMats.push(buoyMat);
    }
  }

  // Sustituir vallas iniciales con modelos 3D de alta definición
  populate3DFences() {
    return models.loadAll().then(() => {
      if (!this.fenceLayers || !this.fenceLayers.length) return;
      // Ocultar postes y alambres procedurales antiguos para lucir los modelos 3D
      this.fence.visible = false;

      // Capa 0 (Exterior z = -14): Malla modular perimetral y tela metálica
      this.build3DLayer(0, FENCE_ZS[0], 'tileable', 11.5);
      // Capa 1 (Media z = -7): Muros blindados de hormigón
      this.build3DLayer(1, FENCE_ZS[1], 'concrete', 3.9);
      // Capa 2 (Interior z = -1): Vallas de hierro forjado reforzadas
      this.build3DLayer(2, FENCE_ZS[2], 'metal', 3.4);
      // Los modelos ya están listos: reintentar las vallas guardadas que no se
      // pudieron instanciar durante la carga de la partida.
      this.flushPendingRestore();
    }).catch(err => {
      console.warn('Fallback a vallas procedurales:', err);
    });
  }

  build3DLayer(layerIdx, fz, modelType, stepW) {
    const layer = this.fenceLayers[layerIdx];
    if (!layer) return;

    for (let x = FENCE_X0 + stepW / 2; x <= FENCE_X1 - stepW / 2 + 0.1; x += stepW) {
      const mesh = models.createFence(modelType);
      if (!mesh) continue;
      mesh.position.set(x, 0, fz);
      this.fence3DGroup.add(mesh);
      const segObj = {
        id: `layer_${layerIdx}_${x.toFixed(1)}`,
        layerIndex: layerIdx,
        type: modelType,
        x, z: fz,
        rotation: 0,
        width: stepW,
        depth: (FENCE_CATALOG[modelType] && FENCE_CATALOG[modelType].depth) || 0.5,
        mesh,
        baseY: 0,
        tiltDir: Math.random() < 0.5 ? 1 : -1,
        hp: 100, maxHp: 100,
        alive: true
      };
      layer.gltfMeshes.push(segObj);
      this.placedFences.push(segObj);
    }
  }

  // Añade una valla personalizada colocada por el jugador en el editor
  addPlacedFence(type, x, z, rotation, hp, maxHp) {
    const cfg = FENCE_CATALOG[type] || FENCE_CATALOG.chain_link;
    const mesh = models.createFence(type);
    if (!mesh) return null;

    mesh.position.set(x, 0, z);
    mesh.rotation.y = rotation;
    this.fence3DGroup.add(mesh);

    const fenceObj = {
      id: 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      layerIndex: -1,
      type,
      name: cfg.name,
      x, z,
      rotation,
      width: cfg.width,
      depth: cfg.depth || 0.5,
      mesh,
      baseY: 0,
      tiltDir: Math.random() < 0.5 ? 1 : -1,
      hp: hp || cfg.hp,
      maxHp: maxHp || cfg.hp,
      alive: true
    };

    this.placedFences.push(fenceObj);
    return fenceObj;
  }

  // Elimina una valla colocada (la marca como muerta para que los asaltantes
  // que la estén atacando dejen de golpearla)
  removePlacedFence(fenceObj) {
    const idx = this.placedFences.indexOf(fenceObj);
    if (idx >= 0) this.placedFences.splice(idx, 1);
    if (fenceObj) fenceObj.alive = false;
    if (fenceObj.mesh) this.fence3DGroup.remove(fenceObj.mesh);
  }

  // ---------- PERSISTENCIA DE LAS VALLAS COLOCADAS POR EL JUGADOR ----------
  // Solo se serializan las personalizadas (layerIndex < 0): las 3 capas base se
  // reconstruyen solas al cargar el mundo.
  serializeCustomFences() {
    return this.placedFences
      .filter(f => f.layerIndex < 0)
      .map(f => ({
        t: f.type,
        x: Math.round(f.x * 100) / 100,
        z: Math.round(f.z * 100) / 100,
        r: Math.round((f.rotation || 0) * 1000) / 1000,
        hp: Math.max(0, Math.round(f.hp)),
        mhp: Math.max(1, Math.round(f.maxHp)),
      }));
  }

  // Borra TODAS las vallas personalizadas (partida nueva desde cero)
  clearCustomFences() {
    this._pendingRestore = [];
    for (const f of [...this.placedFences]) {
      if (f.layerIndex < 0) this.removePlacedFence(f);
    }
  }

  // Restaura las vallas guardadas. Si los modelos 3D aún no han terminado de
  // cargar se dejan en cola y se reintentan al terminar (populate3DFences).
  restoreCustomFences(list) {
    if (!Array.isArray(list) || !list.length) return;
    this._pendingRestore = [];
    for (const it of list) {
      if (!it || !FENCE_CATALOG[it.t]) continue;
      const made = this.addPlacedFence(it.t, it.x, it.z, it.r || 0, it.hp || FENCE_CATALOG[it.t].hp, it.mhp || FENCE_CATALOG[it.t].hp);
      if (!made) this._pendingRestore.push(it);
    }
  }

  flushPendingRestore() {
    if (!this._pendingRestore || !this._pendingRestore.length) return;
    const pending = this._pendingRestore;
    this._pendingRestore = [];
    this.restoreCustomFences(pending);
  }

  // Muestra el holograma de previsualización para colocar vallas.
  // El holograma y la retícula de suelo van SIEMPRE en el mismo punto exacto,
  // que es el punto donde realmente se colocará la valla al hacer clic/tocar.
  setHologram(type, x, z, rotation, isValid) {
    while (this.hologramGroup.children.length) {
      this.hologramGroup.remove(this.hologramGroup.children[0]);
    }
    const holo = models.createHologram(type, isValid);
    if (holo) {
      holo.position.set(x, 0, z);
      holo.rotation.y = rotation;
      this.hologramGroup.add(holo);
      this.hologramGroup.visible = true;
    }
    this.setReticle(x, z, isValid);
  }

  clearHologram() {
    this.hologramGroup.visible = false;
    while (this.hologramGroup.children.length) {
      this.hologramGroup.remove(this.hologramGroup.children[0]);
    }
    if (this.aimReticle) this.aimReticle.visible = false;
  }
  fenceVisual(frac) {
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
    }

    // Actualizar visuales de todos los modelos 3D de vallas (capas y personalizadas)
    for (const f of this.placedFences) {
      if (!f.mesh) continue;
      let hpFrac = 1;
      if (f.layerIndex >= 0 && fracs[f.layerIndex] !== undefined) {
        hpFrac = fracs[f.layerIndex];
      } else if (f.maxHp > 0) {
        hpFrac = Math.max(0, f.hp / f.maxHp);
      }
      if (hpFrac < 0.01 || !f.alive) {
        // Colapso completo en el suelo
        f.mesh.rotation.x = THREE.MathUtils.lerp(f.mesh.rotation.x, (f.tiltDir || 1) * 1.35, 0.08);
        f.mesh.position.y = THREE.MathUtils.lerp(f.mesh.position.y, -0.6, 0.08);
      } else if (hpFrac < 0.95) {
        // Daño parcial: ligera inclinación y hundimiento
        const tilt = (1 - hpFrac) * 0.35 * (f.tiltDir || 1);
        f.mesh.rotation.x = THREE.MathUtils.lerp(f.mesh.rotation.x, tilt, 0.08);
        f.mesh.position.y = THREE.MathUtils.lerp(f.mesh.position.y, -(1 - hpFrac) * 0.25, 0.08);
      } else {
        // Íntegra / Reparada
        f.mesh.rotation.x = THREE.MathUtils.lerp(f.mesh.rotation.x, 0, 0.1);
        f.mesh.position.y = THREE.MathUtils.lerp(f.mesh.position.y, 0, 0.1);
      }
    }
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

    // ========== TORRE AMPLIADA (4 plantas + escaleras funcionales) ==========
    this.buildTower(metalMat, darkWood, sandMat, camoMat);

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

  // ========== TORRE DE VIGILANCIA AMPLIADA: 4 PLANTAS + ESCALERAS FUNCIONALES ==========
  // Planta 0 (BASE, a nivel de suelo) + NIDO (la plataforma original del tirador)
  // + DOS plantas nuevas hacia arriba (OBSERVATORIO y VIGÍA). Todas se recorren a
  // pie: la caja de escaleras adosada a la cara sur (z > 37.2) conecta los niveles
  // con tramos en tijera y rellanos. Las superficies caminables se registran en
  // this.walk para que el controlador del jugador (game.js) resuelva la altura del
  // suelo, bloquee los bordes y suba/baje por las escaleras.
  buildTower(metalMat, darkWood, sandMat, camoMat) {
    const TZ = TOWER_Z;
    const Y1 = FLOOR_Y.nido, Y2 = FLOOR_Y.obs, Y3 = FLOOR_Y.vigia, YR = FLOOR_Y.roof;
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x555855, roughness: 0.9 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x39474d, metalness: 0.7, roughness: 0.4 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x2e4a32, roughness: 0.6 });
    const radioMat = new THREE.MeshStandardMaterial({ color: 0x1d2426, metalness: 0.8, roughness: 0.3 });
    const tower = new THREE.Group();
    tower.name = 'sniperTower';
    this.tower = tower;
    const W = this.walk;
    const plate = (x0, x1, z0, z1, y, floor) => W.plates.push({ x0, x1, z0, z1, y, floor });
    // rampa: se normalizan los extremos (x0 < x1) para que sampleWalk pueda
    // evaluar tanto los tramos que suben hacia el este como hacia el oeste.
    const rampDef = (xa, xb, z0, z1, ya, yb, floor) => {
      if (xa <= xb) W.ramps.push({ x0: xa, x1: xb, z0, z1, ya, yb, axis: 'x', floor });
      else W.ramps.push({ x0: xb, x1: xa, z0, z1, ya: yb, yb: ya, axis: 'x', floor });
    };
    const box = (w, h, d, mat, x, y, z, shadow) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (shadow) { m.castShadow = true; m.receiveShadow = true; }
      tower.add(m);
      return m;
    };

    // ---- estructura vertical: pilares principales + pilares de la caja de escaleras ----
    const pillarCoords = [[-3.4, TZ - 2.6], [3.4, TZ - 2.6], [-3.4, TZ + 2.6], [3.4, TZ + 2.6]];
    for (const [px, pz] of pillarCoords) {
      box(0.55, YR, 0.55, metalMat, px, YR / 2, pz, true);
      box(1.2, 0.5, 1.2, concreteMat, px, 0.25, pz);
      W.obstacles.push({ x0: px - 0.34, x1: px + 0.34, z0: pz - 0.34, z1: pz + 0.34, y0: -1, y1: YR + 2 });
    }
    for (const [px, pz] of [[-3.9, 37.4], [3.9, 37.4], [-3.9, 41.4], [3.9, 41.4]]) {
      box(0.42, YR, 0.42, metalMat, px, YR / 2, pz, true);
      box(1.0, 0.45, 1.0, concreteMat, px, 0.22, pz);
    }
    // vigas cruzadas de refuerzo en cada nivel + arriostrado inclinado
    for (const yLevel of [3.5, 7.5, 11.2, Y1, Y2, Y3]) {
      box(6.8, 0.25, 0.25, metalMat, 0, yLevel, TZ - 2.6);
      box(6.8, 0.25, 0.25, metalMat, 0, yLevel, TZ + 2.6);
      box(0.25, 0.25, 5.2, metalMat, -3.4, yLevel, TZ);
      box(0.25, 0.25, 5.2, metalMat, 3.4, yLevel, TZ);
    }
    for (const s of [-1, 1]) {
      const brace = box(0.14, 13.4, 0.14, metalMat, s * 3.4, 6.5, TZ);
      brace.rotation.x = s * 0.42;
    }

    // ---- suelos de planta (superficie superior = cota caminable) ----
    box(7.6, 0.35, 6.4, metalMat, 0, Y1 - 0.175, TZ, true);
    box(7.6, 0.30, 6.4, metalMat, 0, Y2 - 0.15, TZ, true);
    box(7.6, 0.30, 6.4, metalMat, 0, Y3 - 0.15, TZ, true);
    plate(-3.55, 3.55, TZ - 2.5, TZ + 3.15, Y1, 1);
    plate(-3.55, 3.55, TZ - 2.5, TZ + 3.15, Y2, 2);
    plate(-3.55, 3.55, TZ - 2.5, TZ + 3.15, Y3, 3);

    // ---- parapetos de tiro y barandillas en cada planta elevada ----
    const levels = [
      { y: Y1, doorEast: true },
      { y: Y2, doorEast: false },
      { y: Y3, doorEast: true },
    ];
    for (const lv of levels) {
      const y = lv.y;
      const wallH = 0.375;
      box(7.4, wallH, 0.45, darkWood, 0, y + 0.44 + wallH / 2, PARAPET_Z, true);
      for (let i = 0; i < 9; i++) {
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 3, 6), sandMat);
        bag.rotation.z = Math.PI / 2;
        bag.position.set(-3.0 + i * 0.75, y + 0.815 - 0.24, PARAPET_Z);
        bag.castShadow = true;
        tower.add(bag);
      }
      for (const sx of [-3.7, 3.7]) {
        box(0.12, 1.1, 6.2, railMat, sx, y + 0.55, TZ);
        box(0.06, 0.06, 6.2, metalMat, sx, y + 0.95, TZ);
      }
      // barandilla trasera con hueco de paso hacia el puente de la escalera
      if (lv.doorEast) box(5.9, 1.1, 0.12, railMat, -0.75, y + 0.55, TZ + 3.1);
      else box(5.9, 1.1, 0.12, railMat, 0.75, y + 0.55, TZ + 3.1);
    }

    // ---- techo / marquesina sobre la planta superior + mástil y baliza ----
    for (const [lx, lz] of pillarCoords) box(0.2, YR - Y3, 0.2, metalMat, lx, Y3 + (YR - Y3) / 2, lz);
    box(8.6, 0.18, 7.6, camoMat, 0, YR, TZ, true);
    box(8.9, 0.12, 0.35, metalMat, 0, YR - 0.12, TZ - 3.7);
    box(0.16, 3.6, 0.16, metalMat, -3.2, YR + 1.8, TZ - 2.4);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), this.beaconMat);
    beacon.position.set(-3.2, YR + 3.7, TZ - 2.4);
    tower.add(beacon);

    // ---- focos: los del nido (como antes) + uno largo desde la planta superior ----
    for (const fx of [-3.2, 3.2]) {
      const towerSpot = new THREE.SpotLight(0xffeed0, 5.0, 80, 0.6, 0.3, 1.2);
      towerSpot.position.set(fx, Y1 + 1.3, TZ - 2.8);
      const tgt = new THREE.Object3D();
      tgt.position.set(fx * 1.5, 0, TZ - 9);
      this.scene.add(tgt);
      towerSpot.target = tgt;
      tower.add(towerSpot);
      this.lampLights.push(towerSpot);
    }
    const hiSpot = new THREE.SpotLight(0xffeed0, 3.4, 120, 0.72, 0.4, 1.2);
    hiSpot.position.set(0, Y3 + 1.2, TZ - 2.8);
    const hiTgt = new THREE.Object3D();
    hiTgt.position.set(0, 0, TZ - 30);
    this.scene.add(hiTgt);
    hiSpot.target = hiTgt;
    tower.add(hiSpot);
    this.lampLights.push(hiSpot);

    // ---- equipo táctico (silueta habitada en cada planta) ----
    box(0.8, 0.45, 0.5, crateMat, -2.2, Y1 + 0.22, TZ - 1.8, true);
    box(0.6, 0.5, 0.4, radioMat, 2.4, Y1 + 0.25, TZ - 1.8);
    const radioAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), metalMat);
    radioAnt.position.set(2.6, Y1 + 0.9, TZ - 1.9); tower.add(radioAnt);
    box(0.7, 0.4, 0.45, crateMat, -2.6, Y2 + 0.2, TZ - 1.6);
    box(0.55, 0.9, 0.55, radioMat, 2.7, Y2 + 0.45, TZ + 1.2);
    box(0.75, 0.4, 0.5, crateMat, 2.3, Y3 + 0.2, TZ - 1.7);

    // ========== CAJA DE ESCALERAS (cara sur, z > 37.2) ==========
    // Tramos en tijera: cada uno sube 4.105 m en 6.8 m de recorrido (~31°).
    const B1 = { z0: 37.3, z1: 39.4 }, B2 = { z0: 39.4, z1: 41.5 };
    const XB = 3.4;
    const RISE = Y2 - Y1;
    const flights = [
      { xa: -XB, xb: XB,  band: B1, ya: 0,        yb: RISE,     floor: 0 },
      { xa: XB,  xb: -XB, band: B2, ya: RISE,     yb: RISE * 2, floor: 0 },
      { xa: -XB, xb: XB,  band: B1, ya: RISE * 2, yb: Y1,       floor: 1 },
      { xa: XB,  xb: -XB, band: B2, ya: Y1,       yb: Y2,       floor: 2 },
      { xa: -XB, xb: XB,  band: B1, ya: Y2,       yb: Y3,       floor: 3 },
    ];
    const landings = [
      { east: true,  y: RISE,     floor: 0, bridge: false },
      { east: false, y: RISE * 2, floor: 0, bridge: false },
      { east: true,  y: Y1,       floor: 1, bridge: true },
      { east: false, y: Y2,       floor: 2, bridge: true },
      { east: true,  y: Y3,       floor: 3, bridge: true },
    ];
    const STEPS_PER_FLIGHT = 17;
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x4a545a, metalness: 0.55, roughness: 0.55 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const steps = new THREE.InstancedMesh(unit, stepMat, flights.length * STEPS_PER_FLIGHT);
    steps.name = 'stairSteps'; steps.receiveShadow = true;
    const posts = new THREE.InstancedMesh(unit, railMat, flights.length * 8);
    posts.name = 'stairRailPosts';
    const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), po = new THREE.Vector3();
    const idEuler = new THREE.Euler(0, 0, 0);
    let si = 0, pi = 0;
    for (const fl of flights) {
      const bandW = fl.band.z1 - fl.band.z0;
      const bandCZ = (fl.band.z0 + fl.band.z1) / 2;
      const run = fl.xb - fl.xa;
      const ang = Math.atan2(fl.yb - fl.ya, run);
      const treadW = Math.abs(run) / STEPS_PER_FLIGHT;
      for (let i = 0; i < STEPS_PER_FLIGHT; i++) {
        const t1 = (i + 1) / STEPS_PER_FLIGHT;
        const topY = fl.ya + (fl.yb - fl.ya) * t1;
        const cx = fl.xa + run * (t1 - 0.5 / STEPS_PER_FLIGHT);
        po.set(cx, topY - 0.31, bandCZ); qq.setFromEuler(idEuler);
        sc.set(treadW + 0.03, 0.62, bandW);
        steps.setMatrixAt(si++, mtx.compose(po, qq, sc));
        // Zona sin altura libre bajo el tramo: se bloquea el paso a nivel de suelo
        // para que nadie atraviese los peldaños con la cabeza (solo donde toca).
        const under = topY - 0.62;
        if (under < 1.8 && topY > 0.6) {
          W.obstacles.push({ x0: cx - treadW / 2, x1: cx + treadW / 2, z0: fl.band.z0, z1: fl.band.z1, y0: -2, y1: topY - 0.67 });
        }
      }
      const len = Math.hypot(run, fl.yb - fl.ya);
      for (const s of [-1, 1]) {
        const zSide = bandCZ + s * (bandW / 2 + 0.03);
        const stringer = box(len, 0.34, 0.1, metalMat, (fl.xa + fl.xb) / 2, (fl.ya + fl.yb) / 2 - 0.24, zSide);
        stringer.rotation.z = ang;
        const rail = box(len, 0.08, 0.08, railMat, (fl.xa + fl.xb) / 2, (fl.ya + fl.yb) / 2 + 0.95, zSide);
        rail.rotation.z = ang;
        for (let k = 0; k < 4; k++) {
          const t = (k + 0.5) / 4;
          po.set(fl.xa + run * t, fl.ya + (fl.yb - fl.ya) * t + 0.45, zSide);
          qq.setFromEuler(idEuler); sc.set(0.06, 1.0, 0.06);
          posts.setMatrixAt(pi++, mtx.compose(po, qq, sc));
        }
      }
      rampDef(fl.xa, fl.xb, fl.band.z0, fl.band.z1, fl.ya, fl.yb, fl.floor);
    }
    steps.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    steps.computeBoundingSphere();
    posts.computeBoundingSphere();
    tower.add(steps); tower.add(posts);

    // rellanos de giro + puentes de acceso a cada planta
    for (const ld of landings) {
      const x0 = ld.east ? 2.6 : -3.9, x1 = ld.east ? 3.9 : -2.6;
      const cz = (B1.z0 + B2.z1) / 2, depth = B2.z1 - B1.z0;
      box(x1 - x0, 0.22, depth, metalMat, (x0 + x1) / 2, ld.y - 0.11, cz, true);
      plate(x0, x1, B1.z0, B2.z1, ld.y, ld.floor);
      box(0.08, 1.05, depth, railMat, ld.east ? x1 : x0, ld.y + 0.52, cz);
      if (ld.bridge) {
        const bx0 = ld.east ? 2.2 : -3.6, bx1 = ld.east ? 3.6 : -2.2;
        box(bx1 - bx0, 0.22, 2.9, metalMat, (bx0 + bx1) / 2, ld.y - 0.11, TZ + 1.7, true);
        plate(bx0, bx1, TZ - 2.4, B1.z0 + 1.1, ld.y, ld.floor);
        box(0.07, 1.0, 2.9, railMat, ld.east ? bx0 : bx1, ld.y + 0.5, TZ + 1.7);
      }
    }
    // solera de la caja de escaleras + zócalos de seguridad
    box(7.9, 0.14, 4.4, concreteMat, 0, 0.07, (B1.z0 + B2.z1) / 2);
    box(0.14, 1.0, 4.4, railMat, -3.94, 0.5, (B1.z0 + B2.z1) / 2);
    box(0.14, 1.0, 4.4, railMat, 3.94, 0.5, (B1.z0 + B2.z1) / 2);

    // marcas de suelo en la entrada de la escalera (lado oeste, cota 0)
    this.stairArrowMat = new THREE.MeshBasicMaterial({ color: 0x7cf8ff, transparent: true, opacity: 0.45, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), this.stairArrowMat);
      a.rotation.x = -Math.PI / 2;
      a.position.set(-3.0, 0.06, 43.0 + i * 0.75);
      a.renderOrder = 3;
      tower.add(a);
    }
    box(0.1, 2.2, 0.1, metalMat, -4.6, 1.1, 43.0);
    box(1.6, 0.75, 0.09, new THREE.MeshBasicMaterial({ color: 0x0d2a33 }), -4.6, 2.0, 43.0);

    this.scene.add(tower);
  }

  // ---------- SUPERFICIES CAMINABLES: consulta de altura y obstáculos ----------
  // Devuelve la superficie de apoyo en (x, z) para un jugador con los pies en
  // refY. Entre las candidatas dentro de la tolerancia se elige la MÁS ALTA (así
  // se sube a los peldaños al pisarlos), lo que permite recorrer las rampas de la
  // escalera pero impide caerse de una planta o "engancharte" al pasar por debajo.
  // Devuelve null si no hay apoyo alcanzable → el movimiento queda bloqueado.
  sampleWalk(x, z, refY) {
    const W = this.walk;
    if (!W) return null;
    const tol = W.tolerance;
    let bestY = null, bestFloor = 0;
    for (let i = 0; i < W.plates.length; i++) {
      const p = W.plates[i];
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      if (Math.abs(p.y - refY) > tol) continue;
      if (bestY === null || p.y > bestY) { bestY = p.y; bestFloor = p.floor; }
    }
    for (let i = 0; i < W.ramps.length; i++) {
      const r = W.ramps[i];
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      const t = r.axis === 'x'
        ? (x - r.x0) / Math.max(1e-6, r.x1 - r.x0)
        : (z - r.z0) / Math.max(1e-6, r.z1 - r.z0);
      const y = r.ya + (r.yb - r.ya) * t;
      if (Math.abs(y - refY) > tol) continue;
      if (bestY === null || y > bestY) { bestY = y; bestFloor = r.floor; }
    }
    if (bestY === null) return null;
    return { y: bestY, floor: bestFloor | 0 };
  }

  // Obstáculos que bloquean el paso (pilares, sacos terreros, peldaños bajos…)
  walkBlocked(x, z, feetY) {
    const W = this.walk;
    if (!W) return false;
    for (let i = 0; i < W.obstacles.length; i++) {
      const o = W.obstacles[i];
      if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
      if (feetY < o.y0 || feetY > o.y1) continue;
      return true;
    }
    return false;
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
      const origin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
        ? `${window.location.origin}/`
        : '';
      const mauserUrl = origin + 'resources/gltf-Sniper/Mauser_98K.gltf';
      loader.load(mauserUrl, (gltf) => {
        const model = gltf.scene;
        // analizar geometría: recentrar y orientar el cañón directamente al horizonte (-Z)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const wrap = new THREE.Group();
        // recentrar el modelo en su centro de masa
        model.position.sub(center);
        // El cañón del modelo Mauser apunta originalmente hacia +Z en coordenadas locales;
        // para orientarlo hacia el horizonte (eje -Z en vista de cámara), rotamos 180° (Math.PI) sobre Y:
        model.rotation.y = Math.PI;
        wrap.add(model);

        const longest = Math.max(size.x, size.y, size.z);
        const s = 1.55 / longest;
        wrap.scale.setScalar(s);
        wrap.position.set(0, 0, 0);
        wrap.rotation.y = 0;
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
