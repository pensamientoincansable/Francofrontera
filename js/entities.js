// FRONTERA // Dead Tide — Entidades: zombis, jefes, civiles, soldados, torretas, lanchas y piedras
import * as THREE from 'three';
import { models, ENEMY_CATALOG } from './models.js';

// Geografía — DEBE coincidir con js/world.js (duplicado para evitar dependencia circular)
const SHORE_X = -26;              // mar a la izquierda, delimitado a la costa: x < SHORE_X
const FENCE_ZS = [-14, -7, -1];   // 3 capas: exterior → interior
const FENCE_X0 = -26, FENCE_X1 = 32; // de la costa izquierda al muro derecho
const BOAT_DEPLOY_TIME = 3.0;     // 3 s para poner la lancha
const BOAT_LAUNCH_TIME = 2.0;     // 2 s para salir de la orilla
const STONE_DMG_FENCE = 2;
const STONE_DMG_PLAYER = 3;

export const ZTYPES = {
  normal:    { hp: 1,  speed: 1.7, dmg: 4,  score: 100,  scale: 1.0,  eye: 0xff3b52, name: 'INFECTADO' },
  runner:    { hp: 1,  speed: 4.4, dmg: 3,  score: 150,  scale: 1.0,  eye: 0xffb833, name: 'ASALTANTE' },
  armored:   { hp: 4,  speed: 1.05, dmg: 9, score: 250,  scale: 1.0,  eye: 0xff6633, name: 'BLINDADO' },
  explosive: { hp: 1,  speed: 2.3, dmg: 26, score: 200,  scale: 1.0,  eye: 0xff8811, name: 'VOLÁTIL' },
  climber:   { hp: 2,  speed: 2.1, dmg: 5,  score: 225,  scale: 1.0,  eye: 0x44ff99, name: 'TREPADOR' },
  boss:      { hp: 75, speed: 1.2, dmg: 35, score: 3500, scale: 1.0,  eye: 0xd955ff, name: 'DINOSAURIO JEFE' },
};

// Roles de asalto: rompen vallas / trepan vallas / cruzan por el mar en lancha
export const ROLES = Object.freeze(['breaker', 'climber', 'sea']);

// Puestos en tierra firme (el flanco izquierdo vigila la orilla, nunca dentro del mar)
export const TURRET_SLOTS = [
  { x: -7,  z: 1.2, label: 'FLANCO MAR' },
  { x: 3,   z: 1.2, label: 'CENTRO IZQ' },
  { x: 13,  z: 1.2, label: 'CENTRO DER' },
  { x: 23,  z: 1.2, label: 'FLANCO DER' },
];

// Puestos de atraque de la LANCHA DE DEFENSA del jugador: en NUESTRO lado de la
// frontera (playa, en tierra, a 0,6 m de la línea de agua), proa hacia el mar.
export const BOAT_SLOTS = Object.freeze([
  { x: SHORE_X + 0.6, z: -14, label: 'COSTA NORTE' },
  { x: SHORE_X + 0.6, z: 3,   label: 'COSTA SUR' },
]);
// Coste en puntos y tope de lanchas fabricables
export const BOAT_COST = 200;
export const BOAT_MAX = 2;

export class Entities {
  constructor(scene, fx, hooks) {
    this.scene = scene; this.fx = fx; this.hooks = hooks;
    this.list = []; this.civs = []; this.soldiers = []; this.turrets = [];
    this.stones = []; this.beached = []; this.boats = [];
    this.boss = null;
    this.wave = 1;
    this.mats = {
      skin: [0x263333, 0x2e3b33, 0x3b2d35].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
      cloth: [0x1d2830, 0x30241b, 0x243026, 0x4a3b2c].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
      armor: new THREE.MeshStandardMaterial({ color: 0x5a6358, metalness: 0.85, roughness: 0.35 }),
      belly: new THREE.MeshStandardMaterial({ color: 0x5a200a, emissive: 0xff6a00, emissiveIntensity: 2.2, roughness: 0.5 }),
      blood: new THREE.MeshBasicMaterial({ color: 0x5a070a, transparent: true, opacity: 0.85 }),
      turretMetal: new THREE.MeshStandardMaterial({ color: 0x2d353b, metalness: 0.8, roughness: 0.3 }),
      turretDark: new THREE.MeshStandardMaterial({ color: 0x181c20, metalness: 0.9, roughness: 0.25 }),
      turretAccent: new THREE.MeshStandardMaterial({ color: 0x445b53, metalness: 0.6, roughness: 0.4 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.85 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8a9296, metalness: 0.8, roughness: 0.35 }),
      pipe: new THREE.MeshStandardMaterial({ color: 0x4a5054, metalness: 0.7, roughness: 0.5 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x7a756a, roughness: 1 }),
      boatHull: new THREE.MeshStandardMaterial({ color: 0x33414a, roughness: 0.7 }),
      boatTube: new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 0.8 }),
      boatMotor: new THREE.MeshStandardMaterial({ color: 0x1c1f22, metalness: 0.6, roughness: 0.4 }),
    };
    this.pool = new THREE.CircleGeometry(0.8, 10);
    this.stoneGeo = new THREE.DodecahedronGeometry(0.16, 0);
    // Geometrías compartidas de la lancha (una por barco, reutilizables)
    this.boatGeos = {
      hull: new THREE.BoxGeometry(1.6, 0.3, 3.0),
      tube: new THREE.CapsuleGeometry(0.25, 2.6, 3, 8),
      bench: new THREE.BoxGeometry(1.2, 0.08, 0.3),
      motor: new THREE.BoxGeometry(0.3, 0.45, 0.25),
    };
  }

  // ---------- ametralladoras autónomas ----------
  deployTurret() {
    if (this.turrets.length >= 4) return null;
    const idx = this.turrets.length;
    const slot = TURRET_SLOTS[idx];
    const g = new THREE.Group();
    g.position.set(slot.x, 0, slot.z);

    const baseHub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.45, 8), this.mats.turretDark);
    baseHub.position.y = 0.55;
    g.add(baseHub);

    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.95, 6), this.mats.turretMetal);
      leg.position.set(Math.sin(ang) * 0.45, 0.4, Math.cos(ang) * 0.45);
      leg.rotation.x = Math.cos(ang) * 0.5;
      leg.rotation.z = -Math.sin(ang) * 0.5;
      leg.castShadow = true;
      g.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), this.mats.turretDark);
      foot.position.set(Math.sin(ang) * 0.72, 0.04, Math.cos(ang) * 0.72);
      g.add(foot);
    }

    const swivel = new THREE.Group();
    swivel.position.y = 0.85;
    g.add(swivel);

    const turretBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.7), this.mats.turretMetal);
    turretBody.position.y = 0.22;
    turretBody.castShadow = true;
    swivel.add(turretBody);

    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.45), this.mats.turretAccent);
    ammoBox.position.set(0.38, 0.22, 0);
    swivel.add(ammoBox);

    const gunMount = new THREE.Group();
    gunMount.position.set(0, 0.25, 0.1);
    swivel.add(gunMount);

    const barrels = [];
    const muzzleNodes = [];
    for (const sx of [-0.14, 0.14]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 1.15, 8), this.mats.turretDark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(sx, 0, -0.6);
      gunMount.add(barrel);
      barrels.push(barrel);

      const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 8), this.mats.turretDark);
      brake.rotation.x = Math.PI / 2;
      brake.position.set(sx, 0, -1.18);
      gunMount.add(brake);

      const mz = new THREE.Object3D();
      mz.position.set(sx, 0, -1.26);
      gunMount.add(mz);
      muzzleNodes.push(mz);
    }

    const sensorMat = new THREE.MeshBasicMaterial({ color: 0x2bff88 });
    const sensorLens = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), sensorMat);
    sensorLens.position.set(0, 0.16, -0.36);
    gunMount.add(sensorLens);

    const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.16, -0.4), new THREE.Vector3(0, 0.16, -24)]);
    const laserMat = new THREE.LineBasicMaterial({ color: 0x2bff88, transparent: true, opacity: 0.65 });
    const laserLine = new THREE.Line(laserGeo, laserMat);
    gunMount.add(laserLine);

    this.scene.add(g);
    this.fx.sparkHit(g.position.clone().setY(0.6));
    for (let k = 0; k < 8; k++) this.fx.healSparkle(g.position.clone().setY(0.8));

    const turret = {
      index: idx,
      slot,
      g,
      swivel,
      gunMount,
      barrels,
      muzzleNodes,
      sensorMat,
      laserMat,
      target: null,
      fireCd: 0.2,
      burstCount: 0,
      burstCd: 0,
      curBarrel: 0,
      recoil: [0, 0],
      range: 48,
      baseYaw: Math.PI,
    };
    this.turrets.push(turret);
    return turret;
  }

  // ---------- armas cuerpo a cuerpo (la mayoría de los infectados) ----------
  buildMeleeWeapon() {
    const kind = (Math.random() * 4) | 0;
    const w = new THREE.Group();
    if (kind === 0) {
      // Bate de madera
      const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.0, 8), this.mats.wood);
      bat.position.y = 0.35; w.add(bat);
    } else if (kind === 1) {
      // Machete
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 6), this.mats.wood);
      grip.position.y = 0.05; w.add(grip);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.025), this.mats.steel);
      blade.position.y = 0.48; w.add(blade);
    } else if (kind === 2) {
      // Tubería de acero
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), this.mats.pipe);
      pipe.position.y = 0.4; w.add(pipe);
    } else {
      // Hacha improvisada
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), this.mats.wood);
      grip.position.y = 0.3; w.add(grip);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.05), this.mats.steel);
      head.position.set(0.1, 0.68, 0); w.add(head);
    }
    // En la mano derecha, ladeada hacia fuera
    w.position.set(0.92, 0.95, 0.3);
    w.rotation.set(0.5, 0, -0.5);
    return w;
  }

  // ---------- construcción zombis y dinosaurios jefes ----------
  buildZombie(type, bossVariant) {
    const cfg = ZTYPES[type];
    const g = new THREE.Group();
    let head = null;
    let headY = 2.43 * cfg.scale;
    let headZ = 0;
    let headR = 0.52 * cfg.scale;
    let bodyR = 0.65 * cfg.scale;
    let bodyH = 2.2 * cfg.scale;
    let hasMelee = false;
    let bossName = cfg.name;
    let gltfRoot = null;      // raíz del modelo GLTF (para el mixer de animación)
    let mixer = null;         // AnimationMixer real (si el modelo trae un clip con claves)
    let action = null;

    const markerMat = new THREE.MeshBasicMaterial({ color: cfg.eye, transparent: true, opacity: 0 });
    const threatMarker = new THREE.Mesh(new THREE.OctahedronGeometry(type === 'boss' ? 0.45 : 0.24, 0), markerMat);

    if (type === 'boss') {
      const bVar = bossVariant || (Math.random() < 0.5 ? 'carnotaurus' : 'titanosaurus');
      const gltfMesh = models.createEnemy(bVar);
      if (gltfMesh) {
        gltfRoot = gltfMesh;
        g.add(gltfMesh);
        if (bVar === 'carnotaurus') {
          headY = 5.2; headZ = 4.2; headR = 0.95; bodyR = 2.4; bodyH = 5.8;
          bossName = 'CARNOTAURUS';
        } else {
          headY = 9.2; headZ = 7.5; headR = 1.15; bodyR = 3.4; bodyH = 9.5;
          bossName = 'TITANOSAURUS';
        }
      } else {
        // Fallback procedural de jefe mientras carga el modelo
        const skin = this.mats.skin[2];
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 3.2, 4, 8), this.mats.cloth[0]);
        body.position.y = 2.6; body.castShadow = true; g.add(body);
        head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), skin);
        head.position.y = 4.6; head.castShadow = true; g.add(head);
        headY = 4.6; headR = 0.9; bodyR = 1.8; bodyH = 4.8;
      }
    } else {
      // Sustituir con modelos de /resources/asaltantes
      const gltfMesh = models.createEnemy(type);
      if (gltfMesh) {
        gltfRoot = gltfMesh;
        g.add(gltfMesh);
        const catCfg = ENEMY_CATALOG[type] || ENEMY_CATALOG.normal;
        headY = catCfg.headY;
        headZ = catCfg.headZ || 0;
        headR = catCfg.headR;
        bodyR = catCfg.bodyR;
        bodyH = catCfg.targetH;

        if (type === 'explosive') {
          // Vientre tóxico reactivo brillante
          const bellyGlow = new THREE.Mesh(
            new THREE.SphereGeometry(0.38, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x5a200a, emissive: 0xff6a00, emissiveIntensity: 2.5, roughness: 0.5 })
          );
          bellyGlow.position.set(0, 1.15, 0.35);
          g.add(bellyGlow);
        }
      } else {
        // Fallback procedural de infectado mientras carga el modelo
        const skin = this.mats.skin[(Math.random() * this.mats.skin.length) | 0];
        const cloth = this.mats.cloth[(Math.random() * this.mats.cloth.length) | 0];
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.25, 4, 8), cloth);
        body.position.y = 1.35; body.scale.set(1, 0.95, 0.6); body.castShadow = true; g.add(body);
        head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 12, 8), skin);
        head.position.y = 2.43; head.castShadow = true; g.add(head);
        const eyeMat = new THREE.MeshBasicMaterial({ color: cfg.eye });
        for (const s of [-0.15, 0.15]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), eyeMat);
          eye.position.set(s, 2.48, 0.4); g.add(eye);
        }
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.9, 4, 6), skin);
          arm.position.set(s * 0.58, 1.45, 0.02);
          arm.rotation.z = s * 0.8; arm.rotation.x = -0.2; g.add(arm);
          const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.95, 4, 6), cloth);
          leg.position.set(s * 0.24, 0.5, 0); leg.rotation.z = s * 0.08; g.add(leg);
        }
      }

      // La mayoría de infectados porta arma cuerpo a cuerpo (excepto volátiles)
      if (type !== 'explosive' && Math.random() < 0.65) {
        g.add(this.buildMeleeWeapon());
        hasMelee = true;
      }
    }

    // Posición del marcador táctico sobre la cabeza
    threatMarker.position.set(0, headY + 0.85, headZ);
    g.add(threatMarker);

    // Animación real del modelo (si el GLTF trae un clip con más de una clave,
    // p.ej. un walk de Mixamo): un AnimationMixer sobre la raíz clonada.
    // Los modelos actuales son poses estáticas, así que aquí predomina la marcha
    // procedural (applyWalk), pero el soporte queda listo para modelos animados.
    if (gltfRoot) {
      const clip = models.getAnimation(type === 'boss' ? (bossName === 'CARNOTAURUS' ? 'carnotaurus' : 'titanosaurus') : type);
      if (clip) {
        try {
          mixer = new THREE.AnimationMixer(gltfRoot);
          action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
        } catch (e) { mixer = null; action = null; }
      }
    }

    return { g, head, threatMarker, markerMat, hasMelee, headY, headZ, headR, bodyR, bodyH, bossName, mixer, action };
  }

  // ---------- MARCHA PROCEDURAL (los modelos insertados caminan) ----------
  // Los modelos GLTF actuales no incluyen ciclo de andar, así que la "caminata"
  // se aplica sobre el grupo completo: balanceo vertical al paso, oscilación
  // lateral de cadera, inclinación del torso hacia delante y cabeceo. La fase se
  // acumula con la distancia REAL recorrida en el frame, por lo que la cadencia
  // acompaña al paso de cada asaltante (corredores pisan más rápido, jefes más
  // lento y pesado) y se detiene con suavidad al frenar contra una valla.
  applyWalk(z, dt, stepDist, dxMove, dzMove) {
    const g = z.g;
    const isBoss = z.type === 'boss';

    // 1) Fase de paso: 2π por ciclo completo (2 zancadas)
    const stride = isBoss
      ? (z.bossVariant === 'titanosaurus' ? 5.5 : 2.6)
      : (z.type === 'runner' ? 1.2 : 0.95);
    z.walkPhase = (z.walkPhase || 0) + (stepDist / Math.max(0.2, stride)) * Math.PI;

    // 2) Amplitud con fundido (no se "congela" en seco al detenerse)
    const moving = stepDist > 1e-4;
    z.walkAmp = (z.walkAmp || 0) + ((moving ? 1 : 0) - (z.walkAmp || 0)) * Math.min(1, dt * 5);
    const amp = z.walkAmp;
    const ph = z.walkPhase || 0;

    // 3) Dirección suavizada de la marcha (mira hacia donde avanza)
    if (moving) {
      const dl = Math.hypot(dxMove, dzMove) || 1;
      const ndx = dxMove / dl, ndz = dzMove / dl;
      if (z.moveDX === undefined) { z.moveDX = ndx; z.moveDZ = ndz; }
      else { z.moveDX = z.moveDX * 0.82 + ndx * 0.18; z.moveDZ = z.moveDZ * 0.82 + ndz * 0.18; }
      const ml = Math.hypot(z.moveDX, z.moveDZ) || 1;
      z.moveDX /= ml; z.moveDZ /= ml;
    }
    const fdx = z.moveDX || 0, fdz = z.moveDZ || 1;

    // 4) Parámetros por tipo (zombis de arrastre, corredor presuroso, jefes)
    let bobAmp, swayAmp, pitchOsc, lean, wobble;
    if (isBoss) {
      if (z.bossVariant === 'titanosaurus') { bobAmp = 0.5; swayAmp = 0.03; pitchOsc = 0.02; lean = 0.0; wobble = 0.03; }
      else { bobAmp = 0.85; swayAmp = 0.05; pitchOsc = 0.05; lean = 0.06; wobble = 0.05; }
    } else if (z.type === 'runner') {
      bobAmp = 0.16; swayAmp = 0.055; pitchOsc = 0.055; lean = 0.15; wobble = 0.11;
    } else if (z.type === 'armored') {
      bobAmp = 0.07; swayAmp = 0.03; pitchOsc = 0.03; lean = 0.09; wobble = 0.05;
    } else if (z.type === 'explosive') {
      bobAmp = 0.10; swayAmp = 0.04; pitchOsc = 0.04; lean = 0.10; wobble = 0.08;
    } else if (z.type === 'climber') {
      bobAmp = 0.12; swayAmp = 0.045; pitchOsc = 0.045; lean = 0.10; wobble = 0.09;
    } else {
      bobAmp = 0.11; swayAmp = 0.04; pitchOsc = 0.04; lean = 0.09; wobble = 0.08;
    }

    if (z.state === 'fence') {
      // Postura de asalto a la valla: inclinación al golpeo (no hay pasos)
      const atk = z.attackT > 0 ? 1 : 0;
      z.atkAmp = (z.atkAmp || 0) + (atk - (z.atkAmp || 0)) * Math.min(1, dt * 12);
      // Mirar a la valla (apuntado a su punto más cercano)
      const fx0 = z.blockedX !== undefined ? z.blockedX : g.position.x;
      const fz0 = z.blockedZ !== undefined ? z.blockedZ
        : (z.blockedFence ? z.blockedFence.z : (z.fenceIndex >= 0 ? -1 : g.position.z));
      const tyaw = Math.atan2(fx0 - g.position.x, fz0 - g.position.z);
      let dy = tyaw - g.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      g.rotation.y += dy * Math.min(1, dt * 8);
      g.rotation.x = THREE.MathUtils.lerp(lean * 0.6, -0.42, z.atkAmp);
      g.rotation.z = Math.sin(ph) * 0.03 * amp;
      g.position.y = Math.abs(Math.sin(ph)) * 0.06 * z.atkAmp;
      return;
    }

    // 5) Aplicar la marcha: balanceo al paso, cadera, torso, cabeceo
    const bob = Math.abs(Math.sin(ph)) * bobAmp * amp;
    const sway = Math.sin(ph) * swayAmp * amp;
    const pitch = lean + Math.sin(ph) * pitchOsc * amp;
    const yaw = Math.atan2(fdx, fdz) + Math.sin(ph * 0.5 + (z.phase || 0)) * wobble * (0.5 + amp * 0.5);

    let dy = yaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 8);
    g.rotation.x = pitch;
    g.rotation.z = sway;
    g.position.y = bob;
  }

  pickRole(type, forceLand) {
    if (type === 'boss' || type === 'explosive' || type === 'armored') return 'breaker';
    if (type === 'climber') return 'climber';
    const seaP = (!forceLand && (this.wave || 1) >= 2) ? 0.20 : 0; // el asalto en lancha empieza en oleada 2
    const r = Math.random();
    if (r < seaP) return 'sea';
    if (r < seaP + 0.30) return 'climber';
    return 'breaker';
  }

  spawn(type, x, z, opt) {
    const cfg = ZTYPES[type];
    const bossVariant = (opt && opt.bossVariant) || (Math.random() < 0.5 ? 'carnotaurus' : 'titanosaurus');
    const { g, head, threatMarker, markerMat, hasMelee, headY, headZ, headR, bodyR, bodyH, bossName, mixer, action } = this.buildZombie(type, bossVariant);
    const forceLand = !!(opt && opt.forceLand);
    // LÍNEA DE FRENTE: la valla más alejada de nuestro lado (capas base + las que
    // coloque el jugador). Todo aparece SIEMPRE al norte de esa línea: así ningún
    // jefe ni asaltante puede materializarse dentro de nuestra mitad del sector.
    const frontZ = (opt && typeof opt.frontZ === 'number' && isFinite(opt.frontZ))
      ? Math.min(opt.frontZ, FENCE_ZS[0]) : FENCE_ZS[0];
    const role = this.pickRole(type, forceLand);
    let sx = x, sz = z, state = 'advance';
    let embark = null, land = null, sailX = -19;
    if (role === 'sea') {
      // Asalto anfibio: aparece en el mar (a la izquierda, desde el horizonte) y
      // rema hasta su punto de botadura en la franja costera norte.
      sx = SHORE_X - 9 + Math.random() * 8;       // en el agua, a 1-9 m de la orilla
      sz = frontZ - 10 - Math.random() * 18;      // siempre por delante de la línea
      state = 'to_shore';
      const embarkZ = Math.min(-18, frontZ - 4) - Math.random() * 8;
      embark = { x: SHORE_X - 1.2, z: embarkZ };  // justo en la línea de agua
      sailX = SHORE_X - 5 - Math.random() * 3;    // canal de navegación, mar adentro
      land = { x: FENCE_X0 - 0.5, z: 5 + Math.random() * 3 }; // playa sur, tras la valla interior
    } else {
      sx = THREE.MathUtils.clamp(x, FENCE_X0, FENCE_X1);
      // Red de seguridad: aunque el emisor se equivoque, jamás al sur del frente.
      sz = Math.min(z, frontZ - 2 - (type === 'boss' ? 6 : 0));
    }
    g.position.set(sx, 0, sz);
    this.scene.add(g);
    const waveBonus = Math.max(0, (this.wave || 1) - 6) * 0.12;
    const meleeBonus = hasMelee ? 1 : 0;
    const specificCfg = Object.assign({}, cfg);
    if (type === 'boss' && bossName) specificCfg.name = bossName;
    const z0 = {
      type, cfg: specificCfg, g, head, threatMarker, markerMat,
      role, hasMelee, bossVariant,
      modelType: (type === 'boss' ? bossVariant : type),
      name: (type === 'boss' ? bossName : cfg.name),
      thrower: (type !== 'explosive' && type !== 'boss') && Math.random() < 0.7,
      stoneCd: 2 + Math.random() * 3,
      hp: cfg.hp, maxHp: cfg.hp,
      speed: cfg.speed * (1 + Math.min(0.5, (this.wave || 1) * 0.02)),
      dmg: Math.round(cfg.dmg * (1 + waveBonus)) + meleeBonus,
      score: cfg.score + (role === 'sea' ? 50 : 0),
      headY, headZ, headR, bodyR, bodyH,
      state, phase: Math.random() * 7,
      lane: sx, attackT: 0, climbT: 0, summonT: 6,
      fenceIndex: -1, climbFromZ: 0, climbToZ: 0, blockedFence: null, blockedX: undefined,
      embark, land, sailX, boat: null, boatT: 0, landT: 0,
      burnT: 0, shockT: 0, groanT: 3 + Math.random() * 9,
      dead: false, deathT: 0, flashT: 0,
      // Estado de la marcha procedural
      mixer, action,
      walkPhase: Math.random() * Math.PI * 2, walkAmp: 0, atkAmp: 0,
      moveDX: 0, moveDZ: 1,
    };
    if (type === 'boss') { this.boss = z0; }
    this.list.push(z0);
    return z0;
  }

  spawnCivilian(x, z) {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a181, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: [0x3a6ea5, 0xa5433a, 0x6aa53a][(Math.random() * 3) | 0], roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 8), shirt);
    body.position.y = 1.15; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
    head.position.y = 2.0; g.add(head);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const c = { g, state: 'run', phase: Math.random() * 7, speed: 2.8 + Math.random() * 0.8, dead: false };
    this.civs.push(c);
    return c;
  }

  spawnSoldier(x, z, name) {
    const g = new THREE.Group();
    const uni = new THREE.MeshStandardMaterial({ color: 0x3d5240, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb08a68, roughness: 0.8 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.35), uni);
    legs.position.y = 0.4; g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.4), uni);
    torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
    head.position.y = 1.85; g.add(head);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c382e, roughness: 0.7 }));
    helm.position.y = 1.92; g.add(helm);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: 0x1c1f22, metalness: 0.6, roughness: 0.4 }));
    gun.position.set(0.25, 1.25, -0.4); g.add(gun);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const s = { g, name: name || 'VEGA', cd: 1 + Math.random(), muzzleV: new THREE.Vector3() };
    this.soldiers.push(s);
    return s;
  }

  // ---------- lanchas de asalto ----------
  buildBoat() {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(this.boatGeos.hull, this.mats.boatHull);
    hull.position.y = 0.15; hull.castShadow = true; b.add(hull);
    for (const s of [-0.72, 0.72]) {
      const tube = new THREE.Mesh(this.boatGeos.tube, this.mats.boatTube);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(s, 0.35, 0); tube.castShadow = true; b.add(tube);
    }
    for (const bz of [-0.5, 0.5]) {
      const bench = new THREE.Mesh(this.boatGeos.bench, this.mats.wood);
      bench.position.set(0, 0.38, bz); b.add(bench);
    }
    const motor = new THREE.Mesh(this.boatGeos.motor, this.mats.boatMotor);
    motor.position.set(0, 0.45, 1.6); b.add(motor);
    return b;
  }
  removeBoat(z) {
    if (z && z.boat) {
      try { this.scene.remove(z.boat); } catch (e) {}
      z.boat = null;
    }
  }
  beachBoat(z) {
    if (!z || !z.boat) return;
    // La lancha queda varada donde la arrastró el asaltante (playa, en tierra)
    // como resto (máx. 8, se reciclan)
    const b = z.boat; z.boat = null;
    b.position.set(z.g.position.x, 0.06, z.g.position.z);
    b.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    this.beached.push(b);
    while (this.beached.length > 8) {
      const old = this.beached.shift();
      try { this.scene.remove(old); } catch (e) {}
    }
  }

  // ---------- lancha de DEFENSA del jugador (nuestro lado de la frontera) ----------
  // Se fabrica con puntos (game.js) y queda en nuestro lado de la orilla: no cruza
  // la frontera, solo vigila el flanco marítimo y abre fuego automático contra los
  // objetivos de mar (nadar / botar lancha / navegar) que se acerquen a la frontera.
  buildPlayerBoat() {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(this.boatGeos.hull, this.mats.boatTube); // verde militar
    hull.position.y = 0.15; hull.castShadow = true; b.add(hull);
    // Cabina / torreta giratoria
    const turret = new THREE.Group();
    turret.position.set(0, 0.42, 0);
    b.add(turret);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 1.1), this.mats.turretAccent);
    base.position.y = 0.05; base.castShadow = true; turret.add(base);
    // Cañón (apunta a -Z en espacio local)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 8), this.mats.turretDark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.16, -0.7); turret.add(barrel);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.16, -1.4);
    turret.add(muzzle);
    // Baliza superior
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x36c8ff });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), beaconMat);
    beacon.position.set(0, 0.5, 0); turret.add(beacon);
    // Proa: punta hacia el mar
    b.rotation.y = Math.PI / 2;
    return { g: b, turret, muzzle, beaconMat };
  }
  deployBoat() {
    if (this.boats.length >= BOAT_MAX) return null;
    const idx = this.boats.length;
    const slot = BOAT_SLOTS[idx];
    const { g, turret, muzzle, beaconMat } = this.buildPlayerBoat();
    g.position.set(slot.x, 0.1, slot.z);
    this.scene.add(g);
    this.fx.sparkHit(g.position.clone().setY(0.6));
    for (let k = 0; k < 8; k++) this.fx.healSparkle(g.position.clone().setY(0.8));
    if (this.fx.splash) this.fx.splash(g.position.clone().setY(0.2), 1.0);
    const boat = {
      index: idx, slot, g, turret, muzzle, beaconMat,
      hp: 60, maxHp: 60,
      yaw: Math.PI / 2,
      fireCd: 0.4,
      target: null,
      phase: Math.random() * 6,
      alive: true,
    };
    this.boats.push(boat);
    return boat;
  }
  damageBoat(boat, amount, opt) {
    if (!boat || !boat.alive) return false;
    boat.hp = Math.max(0, boat.hp - amount);
    if (boat.hp <= 0 && boat.alive) {
      boat.alive = false;
      const p = boat.g.position.clone(); p.y = 0.4;
      if (this.fx.explosion) this.fx.explosion(p, false);
      this.hooks.boatDown && this.hooks.boatDown(boat);
      this.scene.remove(boat.g);
      this.boats.splice(this.boats.indexOf(boat), 1);
    }
    return boat.hp <= 0;
  }
  updateBoats(dt, t, ctx) {
    for (const boat of [...this.boats]) {
      if (!boat.alive) continue;
      const g = boat.g;
      // Mece suave en el agua, siempre en su lado de la frontera
      const bob = Math.sin(t * 1.8 + boat.phase) * 0.06;
      g.position.y = 0.1 + bob;
      g.rotation.z = Math.sin(t * 1.3 + boat.phase) * 0.02;
      // Baliza parpadeante
      boat.beaconMat.color.setHex((t % 1.2) < 0.6 ? 0x36c8ff : 0x0a3440);
      // Objetivo: el objetivo de mar más cercano dentro del alcance
      let best = null, bd = 48;
      for (const z of this.list) {
        if (z.dead || z.role !== 'sea') continue;
        const d = g.position.distanceTo(z.g.position);
        if (d < bd) { bd = d; best = z; }
      }
      boat.target = best;
      let desiredYaw = Math.sin(t * 0.5 + boat.phase) * 0.4; // sin blanco: patrulla la orilla (local; el casco ya mira al mar)
      if (best) {
        const dx = best.g.position.x - g.position.x;
        const dz = best.g.position.z - g.position.z;
        desiredYaw = Math.atan2(-dx, -dz) - Math.PI / 2; // compensar el yaw del casco (proa al mar)
        // Disparo automático en ráfagas
        boat.fireCd -= dt;
        if (boat.fireCd <= 0) {
          boat.fireCd = 0.2;
          const from = new THREE.Vector3(); boat.muzzle.getWorldPosition(from);
          const to = best.g.position.clone(); to.y += 1.3 * best.cfg.scale;
          this.fx.tracer(from, to, 0x7cf8ff);
          this.fx.sparkHit(to);
          this.hooks.boatShot && this.hooks.boatShot();
          this.damage(best, 1.0, { by: 'boat' });
        }
      }
      // Suavizado del giro de la torreta (normalizar diferencial de ángulo)
      let dAng = desiredYaw - boat.yaw;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      boat.yaw += dAng * Math.min(1, dt * 6);
      boat.turret.rotation.y = boat.yaw;
    }
  }

  // ---------- piedras ----------
  throwStone(z, targetPos, targetKind, fenceIndex) {
    const from = z.g.position.clone();
    from.y += 1.9 * z.cfg.scale;
    const mesh = new THREE.Mesh(this.stoneGeo, this.mats.stone);
    mesh.position.copy(from);
    this.scene.add(mesh);
    const dist = from.distanceTo(targetPos);
    this.stones.push({
      mesh, from, to: targetPos.clone(),
      t: 0, dur: Math.max(0.35, dist / 22),
      arcH: 2.2 + dist * 0.12,
      targetKind, fenceIndex: fenceIndex !== undefined ? fenceIndex : -1,
    });
    z.attackT = 0.35;
    this.hooks.stoneThrow && this.hooks.stoneThrow(z);
  }
  updateStones(dt) {
    const H = this.hooks;
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      s.mesh.position.lerpVectors(s.from, s.to, k);
      s.mesh.position.y += Math.sin(k * Math.PI) * s.arcH;
      s.mesh.rotation.x += dt * 9; s.mesh.rotation.z += dt * 7;
      if (k >= 1) {
        const p = s.to.clone();
        try { this.scene.remove(s.mesh); } catch (e) {}
        this.stones.splice(i, 1);
        if (s.targetKind === 'fence') {
          this.fx.sparkHit(p.clone().setY(2.2));
          H.fenceDamage && H.fenceDamage(STONE_DMG_FENCE, p, s.fenceIndex);
          H.stoneHit && H.stoneHit(p, 'fence');
        } else {
          this.fx.dirtBurst(p);
          // El daño por piedra lo resuelve game.js: solo cuenta si el tirador está
          // realmente cerca del impacto (ahora puede moverse por todo el sector).
          H.stoneHit && H.stoneHit(p, 'player', STONE_DMG_PLAYER);
        }
      }
    }
  }

  // ---------- vallas (multi-capa y colocadas en 3D) ----------
  getFences(ctx) {
    if (ctx && Array.isArray(ctx.fences) && ctx.fences.length) return ctx.fences;
    const alive = !(ctx && ctx.fenceAlive === false);
    return FENCE_ZS.map(() => ({ alive }));
  }
  nextFenceIndex(zPos, fences) {
    for (let i = 0; i < FENCE_ZS.length; i++) {
      if (fences[i] && fences[i].alive !== false && FENCE_ZS[i] > zPos - 0.5) return i;
    }
    return -1;
  }
  findBlockingFence(gx, gz, fencesOrCtx, placedFencesArg) {
    let fences = fencesOrCtx;
    let placedFences = placedFencesArg;
    if (fencesOrCtx && !Array.isArray(fencesOrCtx) && typeof fencesOrCtx === 'object') {
      fences = fencesOrCtx.fences;
      placedFences = fencesOrCtx.placedFences || placedFencesArg;
    }
    // Comprobar vallas 3D y personalizadas (soporta cualquier ángulo: vertical, horizontal, diagonal).
    // Se elige SIEMPRE la valla viva más próxima por delante del asaltante (orden por
    // distancia real, no por orden del array), para que no se salte vallas intermedias.
    let best = null, bestAhead = 1e9;
    if (placedFences && placedFences.length) {
      for (let i = 0; i < placedFences.length; i++) {
        const f = placedFences[i];
        if (!f.alive) continue;
        const dx = Math.cos(f.rotation || 0), dz = Math.sin(f.rotation || 0);
        const hL = (f.width || 4.0) * 0.5;
        const proj = THREE.MathUtils.clamp((gx - f.x) * dx + (gz - f.z) * dz, -hL, hL);
        const cx = f.x + proj * dx, cz = f.z + proj * dz;
        const dist = Math.hypot(gx - cx, gz - cz);
        const ahead = cz - gz;
        if (dist < 1.45 && ahead >= -0.6 && ahead < bestAhead) {
          bestAhead = ahead;
          best = { fenceObj: f, fenceIndex: f.layerIndex !== undefined ? f.layerIndex : -1, z: cz, x: cx };
        }
      }
    }
    const ni = this.nextFenceIndex(gz, fences);
    if (ni >= 0 && fences[ni] && fences[ni].alive !== false) {
      const ahead = FENCE_ZS[ni] - gz;
      if (ahead >= -0.6 && (best === null || ahead < bestAhead)) {
        return { fenceObj: null, fenceIndex: ni, z: FENCE_ZS[ni], x: gx };
      }
    }
    return best;
  }

  damage(z, amount, opt) {
    if (!z || z.dead) return false;
    opt = opt || {};
    z.hp -= amount;
    z.flashT = 0.08;
    if (opt.fire) { z.burnT = 3; }
    if (opt.electric) { z.shockT = 2; }
    if (!opt.burn) z.lastHit = opt;
    if (z.hp <= 0) { this.kill(z, opt); return true; }
    return false;
  }

  kill(z, opt) {
    if (z.dead) return;
    opt = opt || {};
    z.dead = true; z.deathT = 0.8;
    const p = z.g.position.clone(); p.y = 1.4 * z.cfg.scale;
    this.fx.blood(p, z.type === 'boss' || opt.big);
    if (z.threatMarker) z.threatMarker.visible = false;
    this.removeBoat(z);
    if (z.type === 'explosive' && !opt.noChain) {
      this.hooks.explode && this.hooks.explode(p, 4.5, 30, z);
    }
    if (z.type === 'boss') { this.hooks.bossDown && this.hooks.bossDown(z); }
    if (z.g.position.x < SHORE_X) {
      // Muerte en el agua: chapoteo en vez de charco de sangre
      if (this.fx.splash) this.fx.splash(new THREE.Vector3(z.g.position.x, 0.2, z.g.position.z), 1.2);
    } else {
      const pool = new THREE.Mesh(this.pool, this.mats.blood.clone());
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(z.g.position.x, 0.03, z.g.position.z);
      pool.scale.setScalar(z.cfg.scale);
      this.scene.add(pool);
      z.pool = pool;
    }
  }

  nearestTo(pos, maxD, filter) {
    let best = null, bd = maxD || 1e9;
    for (const z of this.list) {
      if (z.dead) continue;
      if (filter && !filter(z)) continue;
      const d = z.g.position.distanceTo(pos);
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  aliveCount() { let n = 0; for (const z of this.list) if (!z.dead) n++; return n; }

  clearAll() {
    for (const z of this.list) { this.scene.remove(z.g); if (z.pool) this.scene.remove(z.pool); this.removeBoat(z); }
    for (const c of this.civs) this.scene.remove(c.g);
    for (const s of this.soldiers) this.scene.remove(s.g);
    for (const t of this.turrets) this.scene.remove(t.g);
    for (const st of this.stones) { try { this.scene.remove(st.mesh); } catch (e) {} }
    for (const b of this.beached) { try { this.scene.remove(b); } catch (e) {} }
    for (const bt of this.boats) { try { this.scene.remove(bt.g); } catch (e) {} }
    this.list = []; this.civs = []; this.soldiers = []; this.turrets = [];
    this.stones = []; this.beached = []; this.boats = []; this.boss = null;
  }

  update(dt, t, ctx) {
    const H = this.hooks;
    this.mats.belly.emissiveIntensity = 1.3 + Math.sin(t * 9) * 0.9;
    const fences = this.getFences(ctx);

    for (const turret of this.turrets) {
      for (let b = 0; b < 2; b++) {
        turret.recoil[b] = Math.max(0, turret.recoil[b] - dt * 2.5);
        turret.barrels[b].position.z = -0.6 + turret.recoil[b];
      }
      // Las torretas cubren hasta la zona de desembarco (z <= 5), sin girarse hacia la torre
      const tgt = this.nearestTo(turret.g.position, turret.range, z => !z.dead && z.g.position.z <= 5);
      turret.target = tgt;
      if (tgt) {
        const tx = tgt.g.position.x - turret.g.position.x;
        const ty = (tgt.g.position.y + 1.2 * tgt.cfg.scale) - (turret.g.position.y + 1.1);
        const tz = tgt.g.position.z - turret.g.position.z;
        const targetYaw = Math.atan2(-tx, -tz);
        const horizDist = Math.hypot(tx, tz);
        const targetPitch = Math.atan2(ty, horizDist);
        turret.swivel.rotation.y += (targetYaw - turret.swivel.rotation.y) * Math.min(1, dt * 8);
        turret.gunMount.rotation.x += (targetPitch - turret.gunMount.rotation.x) * Math.min(1, dt * 8);
        turret.sensorMat.color.setHex(0xff2244);
        turret.laserMat.color.setHex(0xff2244);
        turret.burstCd -= dt;
        if (turret.burstCd <= 0) {
          turret.fireCd -= dt;
          if (turret.fireCd <= 0) {
            turret.fireCd = 0.11;
            turret.burstCount++;
            if (turret.burstCount >= 4) {
              turret.burstCount = 0;
              turret.burstCd = 0.75;
            }
            const bIdx = turret.curBarrel = (turret.curBarrel + 1) % 2;
            turret.recoil[bIdx] = 0.12;
            const muzzlePos = new THREE.Vector3();
            turret.muzzleNodes[bIdx].getWorldPosition(muzzlePos);
            const hitPos = tgt.g.position.clone();
            hitPos.y += 1.2 * tgt.cfg.scale + (Math.random() - 0.5) * 0.3;
            hitPos.x += (Math.random() - 0.5) * 0.3;
            this.fx.tracer(muzzlePos, hitPos, 0xffbb44);
            const fDir = hitPos.clone().sub(muzzlePos).normalize();
            this.fx.muzzle(muzzlePos, fDir);
            this.fx.sparkHit(hitPos);
            H.turretShot && H.turretShot();
            const isHead = Math.random() < 0.2;
            const killed = this.damage(tgt, 1.2, { by: 'turret', head: isHead });
            if (killed && H.turretKill) H.turretKill(tgt);
          }
        }
      } else {
        turret.sensorMat.color.setHex(0x2bff88);
        turret.laserMat.color.setHex(0x2bff88);
        const scanYaw = Math.sin(t * 1.2 + turret.index) * 0.35;
        turret.swivel.rotation.y += (scanYaw - turret.swivel.rotation.y) * Math.min(1, dt * 3);
        turret.gunMount.rotation.x += (-0.08 - turret.gunMount.rotation.x) * Math.min(1, dt * 3);
      }
    }

    // Lancha de defensa del jugador: mece en nuestra playa y ametralla los objetivos de mar
    this.updateBoats(dt, t, ctx);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i], g = z.g;
      if (z.dead) {
        z.deathT -= dt;
        const k = 1 - Math.max(0, z.deathT) / 0.8;
        g.rotation.x = -k * Math.PI / 2 * 0.9;
        if (z.role !== 'sea' || z.state === 'invade' || z.state === 'advance') {
          g.position.y = -k * 0.5;
        }
        if (z.pool) z.pool.material.opacity = 0.85 * (1 - k * 0.4);
        if (z.deathT <= 0) {
          this.scene.remove(g);
          setTimeout(() => { if (z.pool) this.scene.remove(z.pool); }, 4000);
          this.list.splice(i, 1);
        }
        continue;
      }

      // Posición previa al frame (para medir el paso real de la marcha)
      const _px0 = g.position.x, _pz0 = g.position.z;

      if (z.threatMarker) {
        let distFence;
        if (z.role === 'sea' && (z.state === 'sail' || z.state === 'launch' || z.state === 'deploy' || z.state === 'to_shore')) {
          distFence = Math.max(0, 6 - g.position.z);
        } else {
          const ni = this.nextFenceIndex(g.position.z, fences);
          distFence = ni >= 0 ? Math.max(0, FENCE_ZS[ni] - g.position.z) : 0;
        }
        if (distFence < 20) {
          z.threatMarker.visible = true;
          const k = 1 - distFence / 20;
          z.markerMat.opacity = 0.35 + k * 0.6 + Math.sin(t * 6 + z.phase) * 0.15;
          z.threatMarker.rotation.y += dt * 3;
        } else {
          z.threatMarker.visible = false;
        }
      }

      if (z.burnT > 0) {
        z.burnT -= dt;
        z.burnTick = (z.burnTick || 0) + dt;
        const fp = g.position.clone(); fp.y = 1.5 * z.cfg.scale;
        this.fx.fireTick(fp);
        if (z.burnTick > 0.5) { z.burnTick = 0; this.damage(z, 0.5, { noChain: false }); if (z.dead) continue; }
      }
      if (z.shockT > 0) z.shockT -= dt;
      if (z.flashT > 0) z.flashT -= dt;
      const slowed = z.shockT > 0 ? 0.45 : 1;
      z.groanT -= dt;
      if (z.groanT <= 0) { z.groanT = 6 + Math.random() * 10; H.groan && H.groan(z.type === 'boss'); }

      let prey = null;
      if (z.state === 'advance' || z.state === 'invade') {
        for (const c of this.civs) {
          if (c.dead || c.state !== 'run') continue;
          if (g.position.distanceTo(c.g.position) < 7) { prey = c; break; }
        }
      }
      const attackAnim = z.attackT > 0;
      if (attackAnim) z.attackT -= dt;
      if (z.stoneCd > 0) z.stoneCd -= dt;

      // Lanzamiento de piedras: la mayoría hostiga vallas y torre a distancia
      if (z.thrower && z.stoneCd <= 0 && (z.state === 'advance' || z.state === 'fence' || z.state === 'invade')) {
        if (z.state === 'invade') {
          const pp = ctx.playerPos;
          const tb = ctx.towerBase || { x: pp.x, z: pp.z - 13 };
          const towerBase = ctx.playerGrounded
            ? new THREE.Vector3(pp.x, Math.max(1.2, pp.y - 1.2), pp.z)
            : new THREE.Vector3(tb.x, 2, tb.z);
          const d = g.position.distanceTo(towerBase);
          if (d > 3.5 && d < 30) {
            this.throwStone(z, towerBase, 'player');
            z.stoneCd = 3.5 + Math.random() * 2;
          } else {
            z.stoneCd = 0.8;
          }
        } else {
          const blocker = this.findBlockingFence(g.position.x, g.position.z, fences, ctx && ctx.placedFences);
          if (blocker) {
            const fp = new THREE.Vector3(blocker.x, 2.4, blocker.z);
            const d = g.position.distanceTo(fp);
            if (d < 26) {
              this.throwStone(z, fp, 'fence', blocker.fenceIndex);
              z.stoneCd = 3 + Math.random() * 2.5;
            } else {
              z.stoneCd = 1.0;
            }
          } else {
            z.stoneCd = 1.5;
          }
        }
      }

      if (z.state === 'advance') {
        const target = prey ? prey.g.position : null;
        const dirX = target ? Math.sign(target.x - g.position.x) * 0.8 : Math.sin(t * 0.6 + z.phase) * 0.25;
        g.position.x += dirX * dt * z.speed * slowed;
        g.position.x = THREE.MathUtils.clamp(g.position.x, FENCE_X0 - 1, FENCE_X1 + 1);
        const dz = target ? Math.sign(target.z - g.position.z) * 0.6 : 1;
        g.position.z += dz * dt * z.speed * slowed * (prey ? 0.9 : 1);
        // Balanceo y orientación: la marcha procedural (applyWalk) los aplica al
        // final del frame usando la distancia real recorrida.
        if (prey && g.position.distanceTo(prey.g.position) < 1.6) {
          prey.dead = true; prey.state = 'dead';
          const cp = prey.g.position.clone(); cp.y = 1.2;
          this.fx.blood(cp, true);
          this.scene.remove(prey.g);
          H.civDown && H.civDown(prey);
        }
        const blocker = this.findBlockingFence(g.position.x, g.position.z, fences, ctx && ctx.placedFences);
        if (z.type === 'explosive' && blocker && g.position.z >= blocker.z - 2.1) {
          const p = g.position.clone(); p.y = 1.2;
          z.dead = true; z.deathT = 0.01;
          this.scene.remove(g); this.list.splice(i, 1);
          H.explode && H.explode(p, 5.5, 34, z);
          if (blocker.fenceObj) {
            blocker.fenceObj.hp = Math.max(0, blocker.fenceObj.hp - 35);
            if (blocker.fenceObj.hp <= 0) blocker.fenceObj.alive = false;
          }
          if (blocker.fenceIndex >= 0) {
            H.fenceDamage && H.fenceDamage(35, p, blocker.fenceIndex);
          }
          continue;
        }
        if (!blocker) {
          // Sin vallas por delante: si ya rebasó la línea interior, invade la torre
          if (g.position.z >= FENCE_ZS[FENCE_ZS.length - 1] - 1.0) z.state = 'invade';
        } else if (g.position.z >= blocker.z - 1.5) {
          // Punto de bloqueo = punto MÁS CERCANO del segmento de valla (funciona
          // con vallas horizontales, verticales y diagonales). El zombi se queda
          // a 1.2 m de ese punto, del lado por donde viene.
          const bdx = g.position.x - blocker.x, bdz = g.position.z - blocker.z;
          const bdl = Math.hypot(bdx, bdz) || 1;
          z.blockedX = blocker.x; z.blockedZ = blocker.z;
          z.stopX = blocker.x + (bdx / bdl) * 1.2;
          z.stopZ = blocker.z + (bdz / bdl) * 1.2;
          if (z.role === 'climber' || z.type === 'climber') {
            z.state = 'climb'; z.climbT = 0; z.fenceIndex = blocker.fenceIndex;
            z.blockedFence = blocker.fenceObj;
            z.climbFromZ = g.position.z; z.climbToZ = blocker.z + 1.9;
          } else {
            z.state = 'fence'; z.fenceIndex = blocker.fenceIndex;
            z.blockedFence = blocker.fenceObj;
            z.attackT = 0;
          }
        }
      } else if (z.state === 'fence') {
        const fi = z.fenceIndex;
        const bf = z.blockedFence;
        if (bf && !bf.alive) { z.state = 'advance'; z.blockedFence = null; continue; }
        if (!bf && (fi < 0 || !fences[fi] || fences[fi].alive === false)) { z.state = 'advance'; continue; }
        // Mantener la posición de asalto: 1.2 m delante del punto más cercano de
        // la valla (funciona con cualquier orientación de la valla colocada)
        if (z.stopX !== undefined) {
          g.position.x += (z.stopX - g.position.x) * Math.min(1, dt * 4);
          g.position.z += (z.stopZ - g.position.z) * Math.min(1, dt * 4);
        } else {
          const fz = bf ? bf.z : (fi >= 0 ? FENCE_ZS[fi] : g.position.z);
          g.position.z += ((fz - 1.2) - g.position.z) * Math.min(1, dt * 4);
        }
        // La pose de asalto (inclinación al golpeo) la aplica applyWalk()
        z.fenceTick = (z.fenceTick || 0) + dt;
        if (z.fenceTick > 0.95) {
          z.fenceTick = 0; z.attackT = 0.35;
          if (bf) {
            bf.hp = Math.max(0, bf.hp - z.dmg);
            if (bf.hp <= 0) {
              bf.alive = false;
              z.state = 'advance';
              z.blockedFence = null;
            }
          }
          if (fi >= 0) {
            H.fenceDamage && H.fenceDamage(z.dmg, g.position.clone(), fi);
          }
        }
        if (z.type === 'boss') {
          z.summonT -= dt;
          if (z.summonT <= 0) { z.summonT = 9; H.summon && H.summon(z); }
        }
      } else if (z.state === 'climb') {
        z.climbT += dt;
        const k = Math.min(1, z.climbT / 1.4);
        g.position.y = Math.sin(k * Math.PI) * 6.2;
        g.position.z = z.climbFromZ + (z.climbToZ - z.climbFromZ) * k;
        g.rotation.x = -0.5;
        if (k >= 1) { z.state = 'advance'; g.position.y = 0; g.rotation.x = 0; }
      } else if (z.state === 'to_shore') {
        // Marcha hacia el punto de embarque en la orilla
        const ex = z.embark.x - g.position.x, ez = z.embark.z - g.position.z;
        const d = Math.hypot(ex, ez);
        if (d < 1.0) {
          z.state = 'deploy'; z.boatT = 0;
          z.boat = this.buildBoat();
          z.boat.position.set(z.embark.x, 0.1, z.embark.z);
          z.boat.scale.setScalar(0.1);
          this.scene.add(z.boat);
          g.position.set(z.embark.x + 0.8, 0, z.embark.z);
          g.rotation.y = -Math.PI / 2;
          H.boatDeploy && H.boatDeploy(z);
        } else {
          g.position.x += (ex / d) * dt * z.speed * slowed * 1.1;
          g.position.z += (ez / d) * dt * z.speed * slowed * 1.1;
          // balanceo/orientación: applyWalk()
        }
      } else if (z.state === 'deploy') {
        // 3 s para poner la lancha en el agua
        z.boatT += dt;
        const k = Math.min(1, z.boatT / BOAT_DEPLOY_TIME);
        if (z.boat) {
          z.boat.scale.setScalar(0.1 + k * 0.9);
          z.boat.position.y = 0.1 + Math.sin(t * 3) * 0.05;
        }
        g.position.y = Math.abs(Math.sin(t * 5 + z.phase)) * 0.08;
        g.rotation.y = -Math.PI / 2;
        if (z.boatT >= BOAT_DEPLOY_TIME) {
          z.state = 'launch'; z.boatT = 0;
          if (z.boat) z.boat.scale.setScalar(1);
          H.boatLaunch && H.boatLaunch(z);
        }
      } else if (z.state === 'launch') {
        // 2 s para salir de la orilla hacia el mar
        z.boatT += dt;
        const k = Math.min(1, z.boatT / BOAT_LAUNCH_TIME);
        const bx = z.embark.x + (z.sailX - z.embark.x) * k;
        if (z.boat) {
          z.boat.position.set(bx, 0.15 + Math.sin(t * 2.5) * 0.08, z.embark.z);
          z.boat.rotation.y = Math.PI / 2;
        }
        g.position.set(bx, 0.55 + Math.sin(t * 2.5) * 0.08, z.embark.z);
        g.rotation.y = 0;
        if (z.boatT >= BOAT_LAUNCH_TIME) {
          z.state = 'sail';
          if (this.fx.splash) this.fx.splash(new THREE.Vector3(bx, 0.2, z.embark.z), 1.0);
        }
      } else if (z.state === 'sail') {
        // Travesía hacia el sur, rodeando las vallas por el mar
        const targetZ = z.land.z;
        const dz = targetZ - g.position.z;
        const sailSpeed = 4.5 * slowed;
        const step = Math.min(Math.abs(dz), sailSpeed * dt);
        const nz = g.position.z + Math.sign(dz) * step;
        const bob = Math.sin(t * 2.2 + z.phase) * 0.1;
        if (z.boat) z.boat.position.set(z.sailX, 0.15 + bob, nz);
        g.position.set(z.sailX, 0.55 + bob, nz);
        g.rotation.y = 0;
        z.wakeT = (z.wakeT || 0) + dt;
        if (z.wakeT > 0.4) {
          z.wakeT = 0;
          if (this.fx.splash) this.fx.splash(new THREE.Vector3(z.sailX, 0.15, nz - 1.5), 0.45);
        }
        if (Math.abs(dz) < 0.6) { z.state = 'land'; z.landT = 0; }
      } else if (z.state === 'land') {
        // Varada final hasta la playa sur (tras la valla interior)
        z.landT += dt;
        const dx = z.land.x - g.position.x;
        const step = Math.min(Math.abs(dx), 3.5 * dt * slowed);
        const nx = g.position.x + Math.sign(dx || 1) * step;
        const bob = Math.sin(t * 2.5) * 0.06;
        if (z.boat) z.boat.position.set(nx, 0.12 + bob, z.land.z);
        g.position.set(nx, 0.5 + bob, z.land.z);
        if (Math.abs(dx) < 0.6 || z.landT > 4) {
          this.beachBoat(z);
          g.position.set(z.land.x, 0, z.land.z);
          g.rotation.y = 0;
          z.state = 'invade';
          H.seaLand && H.seaLand(z);
        }
      } else if (z.state === 'invade') {
        const pp = ctx.playerPos;
        // Si el tirador ha bajado y está A PIE en el sector, van a por él (cuerpo a
        // cuerpo real). Si está en una planta de la torre no pueden subir: se
        // amontonan al pie de los pilares (punto fijo de asalto).
        const tb = ctx.towerBase || { x: pp.x, z: pp.z - 13 };
        const ax = ctx.playerGrounded ? pp.x : tb.x;
        const az = ctx.playerGrounded ? pp.z : tb.z;
        const dx = ax - g.position.x, dz = az - g.position.z;
        const d = Math.hypot(dx, dz);
        if (!z.siegeWarned) { z.siegeWarned = true; H.towerSiege && H.towerSiege(z); }
        z.sieging = (d <= 3);
        if (prey) {
          g.position.x += Math.sign(prey.g.position.x - g.position.x) * dt * z.speed * slowed;
          g.position.z += Math.sign(prey.g.position.z - g.position.z) * dt * z.speed * slowed;
          if (g.position.distanceTo(prey.g.position) < 1.6) {
            prey.dead = true; prey.state = 'dead';
            const cp = prey.g.position.clone(); cp.y = 1.2;
            this.fx.blood(cp, true);
            this.scene.remove(prey.g);
            H.civDown && H.civDown(prey);
          }
        } else if (d > 3) {
          g.position.x += (dx / d) * dt * z.speed * slowed;
          g.position.z += (dz / d) * dt * z.speed * slowed;
          // balanceo: applyWalk()
        } else {
          z.attackT = z.attackT > 0 ? z.attackT : 0;
          z.playerTick = (z.playerTick || 0) + dt;
          g.rotation.x = -0.3;
          g.position.y = 0;
          if (z.playerTick > 1.0) {
            z.playerTick = 0; z.attackT = 0.4;
            // A pie de suelo es un mordisco cuerpo a cuerpo real: hace la mitad de
            // daño que el castigo de asalto a la torre (puedes huir y defenderte).
            const meleeDmg = ctx.playerGrounded ? Math.max(2, Math.round(z.dmg * 0.5)) : z.dmg;
            H.playerDamage && H.playerDamage(meleeDmg, z);
          }
        }
        if (z.sieging) {
          // Asaltando la torre: mirar a los pilares (la marcha no interfiere)
          let dy = Math.atan2(dx, dz) - g.rotation.y;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          g.rotation.y += dy * Math.min(1, dt * 8);
        }
      }

      // ---- MARCHA: animación real (mixer) + marcha procedural de las piernas/torso ----
      if (z.mixer) z.mixer.update(dt);
      const walking = z.state === 'advance' || z.state === 'fence' || z.state === 'to_shore' || (z.state === 'invade' && !z.sieging);
      if (walking && !z.dead) {
        this.applyWalk(z, dt,
          Math.hypot(g.position.x - _px0, g.position.z - _pz0),
          g.position.x - _px0, g.position.z - _pz0);
      }
    }

    this.updateStones(dt);

    for (let i = this.civs.length - 1; i >= 0; i--) {
      const c = this.civs[i];
      if (c.dead) { this.civs.splice(i, 1); continue; }
      if (c.state !== 'run') continue;
      const dx = ctx.extract.x - c.g.position.x, dz = ctx.extract.z - c.g.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.4) {
        c.state = 'safe';
        this.fx.healSparkle(c.g.position.clone().setY(1.5));
        this.scene.remove(c.g);
        this.civs.splice(i, 1);
        H.civSafe && H.civSafe(c);
        continue;
      }
      let fx = dx / d, fz = dz / d;
      const threat = this.nearestTo(c.g.position, 6);
      if (threat) {
        const ax = c.g.position.x - threat.g.position.x, az = c.g.position.z - threat.g.position.z;
        const ad = Math.hypot(ax, az) || 1;
        fx = fx * 0.4 + (ax / ad) * 0.9; fz = fz * 0.4 + (az / ad) * 0.9;
        const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      }
      c.g.position.x += fx * dt * c.speed;
      c.g.position.z += fz * dt * c.speed;
      c.g.position.y = Math.abs(Math.sin(t * 8 + c.phase)) * 0.22;
      c.g.rotation.y = Math.atan2(fx, fz);
    }

    if (ctx.soldiersFire !== false) {
      for (const s of this.soldiers) {
        s.cd -= dt;
        if (s.cd > 0) continue;
        const tgt = this.nearestTo(s.g.position, 46);
        if (!tgt) { s.cd = 0.4; continue; }
        s.cd = 1.25 + Math.random() * 0.4;
        const from = s.g.position.clone(); from.y = 1.4;
        const to = tgt.g.position.clone(); to.y = 1.5 * tgt.cfg.scale;
        s.g.lookAt(to.x, s.g.position.y, to.z);
        this.fx.tracer(from, to, 0xaef3ff);
        this.fx.sparkHit(to);
        H.allyShot && H.allyShot();
        this.damage(tgt, 1, { by: 'ally' });
        if (tgt.dead && H.allyKill) H.allyKill(tgt);
      }
    }
  }
}
