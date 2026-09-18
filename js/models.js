// FRONTERA // Dead Tide — Gestor centralizado de modelos 3D y texturas GLTF
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Clonador profundo de jerarquías Three.js con soporte completo para SkinnedMesh y huesos
function parallelTraverse(a, b, callback) {
  callback(a, b);
  for (let i = 0; i < a.children.length; i++) {
    parallelTraverse(a.children[i], b.children[i], callback);
  }
}

export function cloneModel(source) {
  if (!source) return null;
  const sourceLookup = new Map();
  const cloneLookup = new Map();

  const clone = source.clone();

  parallelTraverse(source, clone, function (sourceNode, clonedNode) {
    sourceLookup.set(clonedNode, sourceNode);
    cloneLookup.set(sourceNode, clonedNode);
  });

  clone.traverse(function (node) {
    if (!node.isSkinnedMesh) return;
    const clonedMesh = node;
    const sourceMesh = sourceLookup.get(node);
    if (!sourceMesh || !sourceMesh.skeleton) return;
    const sourceBones = sourceMesh.skeleton.bones;

    clonedMesh.skeleton = sourceMesh.skeleton.clone();
    clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix);

    clonedMesh.skeleton.bones = sourceBones.map(function (bone) {
      return cloneLookup.get(bone) || bone;
    });

    clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix);
  });

  return clone;
}

// Configuración y especificaciones de las vallas disponibles
export const FENCE_CATALOG = {
  chain_link: {
    id: 'chain_link',
    name: 'Malla Metálica',
    desc: 'Valla clásica de seguridad con alambrada y postes de acero.',
    path: 'resources/construcción/chain_link_fence/scene.gltf',
    hp: 150,
    cost: 60,
    targetH: 3.2,
    width: 5.8,
    depth: 0.4
  },
  tileable: {
    id: 'tileable',
    name: 'Perímetro Modular',
    desc: 'Malla perimetral de gran alcance y contención modular.',
    path: 'resources/construcción/chainlink_fence_tileable/scene.gltf',
    hp: 220,
    cost: 90,
    targetH: 3.0,
    width: 12.0,
    depth: 0.5
  },
  concrete: {
    id: 'concrete',
    name: 'Barrera de Hormigón',
    desc: 'Bloque blindado de hormigón armado, máxima durabilidad.',
    path: 'resources/construcción/fence_concrete-_15mb/scene.gltf',
    hp: 350,
    cost: 120,
    targetH: 2.8,
    width: 4.0,
    depth: 0.6
  },
  metal: {
    id: 'metal',
    name: 'Hierro Forjado',
    desc: 'Barrotes verticales pesados antiasalto de alta resistencia.',
    path: 'resources/construcción/metal_fence_-_vurvur_house_5/scene.gltf',
    hp: 200,
    cost: 80,
    targetH: 2.8,
    width: 3.5,
    depth: 0.5
  }
};

// Configuración y especificaciones de los personajes enemigos y dinosaurios jefes
export const ENEMY_CATALOG = {
  normal: {
    id: 'normal',
    path: 'resources/asaltantes/dead_frontier_male_zombie_casual2/scene.gltf',
    targetH: 2.05,
    headY: 1.85,
    headR: 0.42,
    headZ: 0.08,
    bodyR: 0.55
  },
  runner: {
    id: 'runner',
    path: 'resources/asaltantes/terrorist_3_rigged/scene.gltf',
    targetH: 1.95,
    headY: 1.78,
    headR: 0.38,
    headZ: 0.05,
    bodyR: 0.50
  },
  armored: {
    id: 'armored',
    path: 'resources/asaltantes/dead_frontier_male_zombie_fat2/scene.gltf',
    targetH: 2.15,
    headY: 1.95,
    headR: 0.45,
    headZ: 0.12,
    bodyR: 0.70
  },
  explosive: {
    id: 'explosive',
    path: 'resources/asaltantes/dead_frontier_male_zombie_fat1/scene.gltf',
    targetH: 2.05,
    headY: 1.85,
    headR: 0.45,
    headZ: 0.10,
    bodyR: 0.65
  },
  climber: {
    id: 'climber',
    path: 'resources/asaltantes/dead_frontier_male_zombie_casual2/scene.gltf',
    targetH: 2.0,
    headY: 1.85,
    headR: 0.40,
    headZ: 0.08,
    bodyR: 0.55
  },
  carnotaurus: {
    id: 'carnotaurus',
    path: 'resources/asaltantes/jefes/carnotaurus/scene.gltf',
    targetH: 6.2,
    headY: 5.2,
    headR: 0.95,
    headZ: 4.2,
    bodyR: 2.4,
    name: 'CARNOTAURUS'
  },
  titanosaurus: {
    id: 'titanosaurus',
    path: 'resources/asaltantes/jefes/titanosaurus_b/scene.gltf',
    targetH: 10.0,
    headY: 9.2,
    headR: 1.15,
    headZ: 7.5,
    bodyR: 3.4,
    name: 'TITANOSAURUS'
  }
};

class ModelManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.templates = new Map();
    this.loadingPromises = new Map();
    this.ready = false;
  }

  // Pre-carga todos los modelos de vallas, enemigos y dinosaurios
  loadAll(baseUrl = '') {
    const list = [
      ...Object.values(FENCE_CATALOG).map(cfg => ({ id: 'fence_' + cfg.id, path: cfg.path, targetH: cfg.targetH })),
      ...Object.values(ENEMY_CATALOG).map(cfg => ({ id: 'enemy_' + cfg.id, path: cfg.path, targetH: cfg.targetH }))
    ];

    const promises = list.map(item => this.loadSingle(item.id, item.path, item.targetH, baseUrl));
    return Promise.allSettled(promises).then((results) => {
      this.ready = true;
      const loaded = results.filter(r => r.status === 'fulfilled').map(r => r.value.id);
      return { ready: true, loaded, total: list.length };
    });
  }

  loadSingle(id, urlPath, targetH, baseUrl = '') {
    if (this.templates.has(id)) return Promise.resolve(this.templates.get(id));
    if (this.loadingPromises.has(id)) return this.loadingPromises.get(id);

    const p = new Promise((resolve, reject) => {
      let combined = baseUrl ? (baseUrl.replace(/\/+$/, '') + '/' + urlPath.replace(/^\/+/, '')) : urlPath;
      let safePath = combined;
      try {
        safePath = encodeURI(decodeURI(combined));
      } catch (e) {
        safePath = combined;
      }
      this.loader.load(safePath, (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Contenedor normalizado:
        // Centrado en X y Z, apoyado exactamente en Y=0 (suelo)
        const wrap = new THREE.Group();
        wrap.name = 'template_' + id;
        scene.position.set(-center.x, -box.min.y, -center.z);
        wrap.add(scene);

        // Escalado a la altura objetivo
        const s = targetH / Math.max(0.01, size.y);
        wrap.scale.setScalar(s);
        wrap.updateMatrixWorld(true);

        // Optimizar materiales y sombras
        wrap.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) {
              if (Array.isArray(o.material)) {
                o.material.forEach(m => { m.side = THREE.DoubleSide; });
              } else {
                o.material.side = THREE.DoubleSide;
              }
            }
          }
        });

        const entry = {
          id,
          mesh: wrap,
          gltf,
          size: size.clone().multiplyScalar(s),
          targetH
        };

        this.templates.set(id, entry);
        resolve(entry);
      }, undefined, (err) => {
        console.warn(`[ModelManager] No se pudo cargar modelo ${id} (${urlPath}):`, err);
        reject(err);
      });
    });

    this.loadingPromises.set(id, p);
    return p;
  }

  // Obtiene una instancia clonada de una valla
  createFence(typeId) {
    const key = 'fence_' + typeId;
    const entry = this.templates.get(key);
    if (!entry) return null;
    return cloneModel(entry.mesh);
  }

  // Obtiene una instancia clonada de un enemigo
  createEnemy(typeId) {
    const key = 'enemy_' + typeId;
    const entry = this.templates.get(key);
    if (!entry) return null;
    return cloneModel(entry.mesh);
  }

  // Obtiene un holograma semitransparente para previsualización de colocación
  createHologram(typeId, isValid = true) {
    const mesh = this.createFence(typeId);
    if (!mesh) {
      // Fallback procedural simple de previsualización
      const g = new THREE.Group();
      const cfg = FENCE_CATALOG[typeId] || FENCE_CATALOG.chain_link;
      const mat = new THREE.MeshBasicMaterial({
        color: isValid ? 0x7cf8ff : 0xff5470,
        transparent: true,
        opacity: 0.55,
        wireframe: true
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(cfg.width, cfg.targetH, 0.2), mat);
      box.position.y = cfg.targetH / 2;
      g.add(box);
      return g;
    }

    const holoColor = isValid ? 0x7cf8ff : 0xff5470;
    const holoMat = new THREE.MeshStandardMaterial({
      color: holoColor,
      emissive: holoColor,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.65,
      roughness: 0.3,
      metalness: 0.1,
      wireframe: false
    });

    mesh.traverse((o) => {
      if (o.isMesh) {
        o.material = holoMat;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });

    return mesh;
  }
}

export const models = new ModelManager();
