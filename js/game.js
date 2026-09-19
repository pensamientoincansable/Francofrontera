// FRONTERA // Dead Tide — Núcleo: estado, combate, oleadas, clima, UI minimalista y controles adaptativos
import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { FX } from './fx.js';
import { World, SNIPER_EYE, PARAPET_TOP, SHORE_X, FENCE_ZS, FENCE_X0, FENCE_X1, FENCE_LABELS, BUILD_X0, BUILD_X1, BUILD_Z0, BUILD_Z1,
         EYE_HEIGHT, FLOOR_Y, TOWER_ASSAULT, TOWER_FLOORS } from './world.js';
import { Entities, ZTYPES, BOAT_COST, BOAT_MAX } from './entities.js';
import { FENCE_CATALOG, ENEMY_CATALOG, models } from './models.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = n => String(n).padStart(2, '0');

// ---------------- armas ----------------
const WEAPONS = [
  { id: 'rifle',    name: 'MAUSER // SR-98K',    icon: '⌁', desc: '7.62 AP · PRECISIÓN',  dmg: 1, mag: 7,  reload: 1.6, rof: 0.42, zoom: 4.5,  kick: 0.85, sfx: 'rifle',    special: true,  unlock: 1 },
  { id: 'pistol',   name: 'P9 // SECUNDARIA',    icon: '◈', desc: '9MM · CADENCIA',        dmg: 1, mag: 12, reload: 1.1, rof: 0.22, zoom: 1.35, kick: 0.38, sfx: 'pistol',   special: true,  unlock: 1 },
  { id: 'launcher', name: 'LANZAGRANADAS MGL',   icon: '◎', desc: '40MM HE · ÁREA',        dmg: 6, mag: 4,  reload: 2.6, rof: 0.95, zoom: 1.2,  kick: 1.15, sfx: 'launcher', special: false, unlock: 2, radius: 5.5 },
  { id: 'missiles', name: 'MISILES GUIADOS FGM', icon: '✛', desc: 'TELEGUIADO ×4',         dmg: 4, mag: 4,  reload: 6.0, rof: 1.3,  zoom: 1.2,  kick: 1.0,  sfx: 'missiles', special: false, unlock: 4, radius: 3.8 },
];
const SPEC_MODES = ['normal', 'fire', 'shock'];
const SPEC_NAMES = { normal: 'NORMAL', fire: 'INCENDIARIA', shock: 'ELÉCTRICA' };
const UPGRADES = [
  { id: 'dmg',    name: 'Munición perforante', desc: '+25% daño por nivel (todas las armas)', max: 4, base: 300 },
  { id: 'reload', name: 'Manos rápidas',       desc: '−18% tiempo de recarga por nivel',     max: 3, base: 250 },
  { id: 'zoom',   name: 'Óptica de precisión', desc: 'Zoom telescópico: 4.5× → 6.5× → 9.0×', max: 2, base: 200 },
  { id: 'mag',    name: 'Cargadores amplios',  desc: '+30% capacidad por nivel',              max: 3, base: 200 },
  { id: 'fence',  name: 'Blindaje de vallas',  desc: '+25 integridad máx. por capa (×3) y repara 25', max: 3, base: 250 },
];
const ZOOM_LVLS = [4.5, 6.5, 9.0];

// ---------------- estado ----------------
const S = {
  screen: 'menu', playing: false, paused: false, shopOpen: false,
  wave: 1, score: 0, best: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
  curW: 0, spec: 'normal', specPool: { fire: 12, shock: 12 },
  wstate: WEAPONS.map(w => ({ ammo: w.mag, reloading: false, reloadT: 0, cd: 0 })),
  up: { dmg: 0, reload: 0, zoom: 0, mag: 0, fence: 0 },
  fences: FENCE_ZS.map((fz, i) => ({ z: fz, label: FENCE_LABELS[i], hp: 100, max: 100, alive: true })),
  hp: 100, lastHurt: -99,
  strikeCd: 0, strikeUnlocked: false,
  intermission: false, interT: 0,
  fenceEditMode: false,
  fencePanelOpen: true,
  selectedFenceModel: 'chain_link',
  fenceRotationAngle: 0,
  fenceTool: 'build',
  dayT: 0.08, storm: 0, stormState: 'calm', stormT: rand(40, 70), lightning: 0, nextBolt: 0,
  aim: { x: 0, y: 0 }, zoomed: false, firing: false, switchT: 0,
  trauma: 0, time: 0,
  killsTimes: [], streakBest: 0, explosiveKills: 0, headWave: 0, killsWave: 0, civsLostWave: 0,
  objectives: [], pendingSpawns: [], spawnT: 0,
  _lastTurretAlert: 0, _lastSiegeAlert: 0,
  // invertX/invertY: por defecto NO se invierte ninguna dirección (ratón normal).
  // aimSens: multiplicador de sensibilidad SOLO con la mira puesta (antes el zoom
  // dividía la sensibilidad por 4.5×-9× y apuntar se volvía lentísimo).
  settings: { sens: 1, aimSens: 1.2, master: 80, music: 55, sfx: 90, quality: 'high', voice: 'on', invertX: false, invertY: false },
};
try {
  const b = JSON.parse(localStorage.getItem('frtd_best_v1') || '0'); S.best = b | 0;
  const st = JSON.parse(localStorage.getItem('frtd_set_v1') || 'null'); if (st) Object.assign(S.settings, st);
} catch (e) { /* almacenamiento no disponible */ }
function saveSettings() { try { localStorage.setItem('frtd_set_v1', JSON.stringify(S.settings)); } catch (e) {} }
function saveGame() {
  try {
    localStorage.setItem('frtd_save_v1', JSON.stringify({
      wave: S.wave, score: S.score, kills: S.kills, headshots: S.headshots, shots: S.shots, up: S.up,
      // El vallado que coloque el jugador ES parte de la partida guardada: se
      // restaura al CONTINUAR y solo desaparece al empezar de cero o al demolerlo
      // desde el editor de vallado.
      built: (typeof world !== 'undefined' && world && world.serializeCustomFences) ? world.serializeCustomFences() : [],
    }));
  } catch (e) {}
}
function savedFenceCount() {
  const sv = loadSave();
  return (sv && Array.isArray(sv.built)) ? sv.built.length : 0;
}
function loadSave() { try { return JSON.parse(localStorage.getItem('frtd_save_v1') || 'null'); } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem('frtd_save_v1'); } catch (e) {} }

// ---------------- vallas (3 capas) ----------------
function fenceMaxForUp() { return 100 + (S.up.fence | 0) * 25; }
function resetFences() {
  const m = fenceMaxForUp();
  S.fences = FENCE_ZS.map((fz, i) => ({ z: fz, label: FENCE_LABELS[i], hp: m, max: m, alive: true }));
}
function fenceFrac(i) { const f = S.fences[i]; return f && f.alive ? f.hp / f.max : 0; }
function fenceFracs() { return S.fences.map(f => (f.alive ? f.hp / f.max : 0)); }
function fenceAvg() {
  let sum = 0, count = 0;
  for (const f of S.fences) {
    sum += f.alive ? (f.hp / f.max) : 0;
    count++;
  }
  // Solo vallas PERSONALIZADAS (las 3 capas base ya están contadas en S.fences;
  // sus segmentos 3D viven en placedFences con layerIndex >= 0)
  if (world && world.placedFences) {
    for (const pf of world.placedFences) {
      if (pf.layerIndex >= 0) continue;
      sum += pf.alive ? (pf.hp / pf.maxHp) : 0;
      count++;
    }
  }
  return count ? Math.round((sum / count) * 100) : 100;
}
function fencesAllFull() {
  const baseFull = S.fences.every(f => f.alive && f.hp >= f.max);
  const placedFull = !world || !world.placedFences || !world.placedFences.some(f => f.layerIndex < 0)
    || world.placedFences.filter(f => f.layerIndex < 0).every(f => f.alive && f.hp >= f.maxHp);
  return baseFull && placedFull;
}
// Daño a vallas personalizadas (editor de vallado): piedras, golpes cuerpo a
// cuerpo y explosivos del enemigo las deterioran igual que a las capas base.
function damagePlacedFence(pf, amount) {
  if (!pf || !pf.alive) return;
  pf.hp = Math.max(0, pf.hp - amount);
  if (Math.random() < 0.5) audio.fenceHit();
  if (pf.hp <= 0 && pf.alive) {
    pf.alive = false;
    toast('⚠ VALLA DEL PERÍMETRO DERRIBADA ⚠');
    radio('Una valla del perímetro ha sido derribada por el enemigo. Repárala con F o el editor.', 'Valla derribada.');
    audio.alarm();
  }
}

// ---------------- three base ----------------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x08161d, 0.007);
scene.background = new THREE.Color(0x07131a);

// CÁMARA ELEVADA Y ALEJADA (Nido de francotirador en la torre de vigilancia)
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 700);
// Ojo del tirador: de pie tras el parapeto bajo de la torre (apoyado en los sacos).
// La coronación del parapeto queda ~0.81 m por debajo y ~0.95 m por delante, así el
// muro solo ocupa la franja inferior del cuadro y el campo de tiro queda despejado.
camera.position.set(SNIPER_EYE.x, SNIPER_EYE.y, SNIPER_EYE.z);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);

const audio = new AudioEngine();
audio.vol.master = S.settings.master / 100;
audio.vol.music = S.settings.music / 100;
audio.vol.sfx = S.settings.sfx / 100;
audio.voiceOn = S.settings.voice === 'on';
const fx = new FX(scene);
const world = new World(scene, camera, renderer);

// ---------------- entidades + hooks ----------------
const ent = new Entities(scene, fx, {
  fenceDamage(amount, pos, fenceIndex) {
    if (!S.playing || S.paused) return;
    const idx = (fenceIndex !== undefined && fenceIndex !== null) ? fenceIndex : -1;
    // 1) Sin capa base indicada: si el impacto está junto a una valla colocada
    //    (editor de vallado), dañar ESA valla y no a las capas fijas.
    if (idx < 0 && pos && world.placedFences) {
      let best = null, bd = 2.4;
      for (const pf of world.placedFences) {
        if (!pf.alive) continue;
        const fdx = Math.cos(pf.rotation || 0), fdz = Math.sin(pf.rotation || 0);
        const fL = (pf.width || 4) * 0.5;
        const qx0 = pf.x - fdx * fL, qz0 = pf.z - fdz * fL;
        const qx1 = pf.x + fdx * fL, qz1 = pf.z + fdz * fL;
        const d = world.ptSegDist2D(pos.x, pos.z, qx0, qz0, qx1, qz1);
        if (d < bd) { bd = d; best = pf; }
      }
      if (best) { damagePlacedFence(best, amount); return; }
      // Sin valla cercana: dañar la capa base intacta más próxima al impacto
      let b2 = 1e9;
      let baseIdx = -1;
      S.fences.forEach((f, i) => {
        if (!f.alive) return;
        const d = Math.abs(pos.z - f.z);
        if (d < b2) { b2 = d; baseIdx = i; }
      });
      if (baseIdx < 0) return;
      const F = S.fences[baseIdx];
      F.hp = Math.max(0, F.hp - amount);
      if (pos) fx.sparkHit(pos.clone().setY(2.5));
      if (Math.random() < 0.5) audio.fenceHit();
      if (F.hp <= 0 && F.alive) {
        F.alive = false;
        F.hp = 0;
        const fallen = S.fences.filter(f => !f.alive).length;
        if (fallen >= S.fences.length) {
          toast('⚠ TODAS LAS VALLAS HAN CAÍDO ⚠');
          radio('¡Todas las vallas han caído! ¡Repáralas con F o nos superan!', 'Todas las vallas han caído. Repáralas.');
        } else {
          toast(`⚠ VALLA ${F.label} DERRIBADA (${fallen}/${S.fences.length}) ⚠`);
          radio(`¡La valla ${F.label.toLowerCase()} ha caído! Quedan ${S.fences.length - fallen} capas.`, `Valla ${F.label.toLowerCase()} caída.`);
        }
        audio.alarm(); audio.siren(1);
      } else if (F.hp < F.max * 0.3 && !F._warned) {
        F._warned = true;
        radio(`La valla ${F.label.toLowerCase()} está al treinta por ciento. Necesita reparación.`, `Valla ${F.label.toLowerCase()} al treinta por ciento.`);
      }
      if (F.hp >= F.max * 0.35) F._warned = false;
      return;
    }
    if (idx < 0 || !S.fences[idx] || !S.fences[idx].alive) return;
    const F = S.fences[idx];
    F.hp = Math.max(0, F.hp - amount);
    if (pos) fx.sparkHit(pos.clone().setY(2.5));
    if (Math.random() < 0.5) audio.fenceHit();
    if (F.hp <= 0 && F.alive) {
      F.alive = false;
      F.hp = 0;
      const fallen = S.fences.filter(f => !f.alive).length;
      if (fallen >= S.fences.length) {
        toast('⚠ TODAS LAS VALLAS HAN CAÍDO ⚠');
        radio('¡Todas las vallas han caído! ¡Repáralas con F o nos superan!', 'Todas las vallas han caído. Repáralas.');
      } else {
        toast(`⚠ VALLA ${F.label} DERRIBADA (${fallen}/${S.fences.length}) ⚠`);
        radio(`¡La valla ${F.label.toLowerCase()} ha caído! Quedan ${S.fences.length - fallen} capas.`, `Valla ${F.label.toLowerCase()} caída.`);
      }
      audio.alarm(); audio.siren(1);
    } else if (F.hp < F.max * 0.3 && !F._warned) {
      F._warned = true;
      radio(`La valla ${F.label.toLowerCase()} está al treinta por ciento. Necesita reparación.`, `Valla ${F.label.toLowerCase()} al treinta por ciento.`);
    }
    if (F.hp >= F.max * 0.35) F._warned = false;
  },
  stoneThrow() { if (S.playing && !S.paused && Math.random() < 0.5) audio.stoneThrow(); },
  stoneHit(p, kind, amount) {
    if (!S.playing || S.paused) return;
    audio.stoneHit();
    if (kind !== 'player') return;
    // El tirador ahora puede estar a pie de suelo en cualquier punto del sector o
    // en otra planta: la piedra solo hiere si le cae realmente cerca.
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    const dy = Math.abs((p.y || 0) - player.feet);
    if (d < 3.6 && dy < 5) {
      S.hp = Math.max(0, S.hp - (amount || 3));
      S.lastHurt = S.time;
      S.trauma = Math.min(1, S.trauma + 0.18);
      audio.hurt();
      if (S.hp <= 0) gameOver(false);
      updateHUD();
    } else {
      shake(0.04);
    }
  },
  boatDeploy(z) {
    if (!S.playing || S.paused) return;
    audio.boatCreak();
    if (S.time - (S._lastBoatAlert || -99) > 20) {
      S._lastBoatAlert = S.time;
      toast('⚠ LANCHA EN LA ORILLA · 3 s PARA BOTARLA ⚠');
      radio('¡Están botando una lancha en la orilla oeste! ¡Húndelos antes de que salgan!', 'Lancha enemiga en la orilla.');
    }
  },
  boatLaunch(z) {
    if (!S.playing || S.paused) return;
    audio.splash(false);
    if (z && z.g && fx.splash) fx.splash(new THREE.Vector3(z.g.position.x, 0.2, z.g.position.z), 0.8);
  },
  seaLand(z) {
    if (!S.playing || S.paused) return;
    if (S.time - (S._lastLandAlert || -99) > 18) {
      S._lastLandAlert = S.time;
      toast('⚠ DESEMBARCO AL SUR · TRAS LAS VALLAS ⚠');
      radio('¡Desembarco enemigo al sur, tras las vallas! ¡Cubrid el flanco de la torre!', 'Desembarco enemigo al sur.');
    }
  },
  playerDamage(amount) {
    if (!S.playing || S.paused) return;
    S.hp = Math.max(0, S.hp - amount);
    S.lastHurt = S.time;
    S.trauma = Math.min(1, S.trauma + 0.35);
    const dmg = $('dmg');
    if (dmg) {
      dmg.classList.add('hit');
      setTimeout(() => dmg.classList.remove('hit'), 400);
    }
    audio.hurt();
    if (S.hp <= 0) gameOver(false);
  },
  explode(p, radius, dmg, src) { explode(p, radius, dmg, { zombies: true, fence: true, player: true, by: 'volatile' }); },
  groan(big) { if (S.playing && !S.paused && Math.random() < 0.6) audio.groan(big); },
  civDown() {
    S.civsLostWave++;
    addScore(-150, null, 'bad');
    toast('CIVIL CAÍDO // −150');
    radio('Hemos perdido a un civil. Proteged la evacuación.', 'Civil caído.');
    checkObjectives();
  },
  civSafe() {
    addScore(300, null, 'bonus');
    toast('CIVIL EVACUADO // +300');
    audio.buy();
  },
  allyShot() { audio.shoot('ally'); },
  allyKill() {},
  boatShot() { audio.shoot('boat'); },
  boatDown(boat) {
    if (!S.playing || S.paused) return;
    audio.explosion(false);
    toast('⚠ NUESTRA LANCHA HA SIDO DESTRUIDA ⚠');
    radio('Nuestra lancha de defensa ha sido destruida. La playa queda desprotegida.', 'Lancha de defensa perdida.');
    updateHUD();
  },
  towerSiege() {
    // Zombis al pie de la torre: avisar para que el jugador mire hacia abajo
    if (!S.playing || S.paused) return;
    if (S.time - S._lastSiegeAlert < 14) return;
    S._lastSiegeAlert = S.time;
    toast('⚠ INFECTADOS AL PIE DE LA TORRE · MIRA HACIA ABAJO');
    radio('¡Están trepando por los pilares! Mira hacia abajo y dispárales.', 'Infectados al pie de la torre.');
  },
  turretShot() { audio.shoot('turret'); },
  turretKill(z) { onKill(z); },
  summon(boss) {
    audio.bossRoar();
    for (let i = 0; i < 2; i++) {
      const m = ent.spawn('runner', clamp(boss.g.position.x + rand(-4, 4), FENCE_X0, FENCE_X1), boss.g.position.z - rand(1, 4), { forceLand: true });
      fx.blood(m.g.position.clone().setY(1.4), false);
    }
    toast('EL JEFE INVOCA REFUERZOS');
  },
  bossDown() {
    const bb = $('bossbar');
    if (bb) bb.style.display = 'none';
    toast('JEFE ELIMINADO // +2000');
    radio('Objetivo de alto valor eliminado. Buen trabajo.', 'Jefe eliminado.');
  },
});

// ---------------- UI helpers ----------------
let toastTO = null;
function toast(t) {
  const el = $('toast');
  if (!el) return;
  el.textContent = t; el.classList.add('show');
  clearTimeout(toastTO);
  toastTO = setTimeout(() => el.classList.remove('show'), 1600);
}
let radioTO = null;
function radio(text, say) {
  const rt = $('radioText'), r = $('radio');
  if (rt) rt.textContent = text;
  if (r) r.classList.add('show');
  clearTimeout(radioTO);
  radioTO = setTimeout(() => { if (r) r.classList.remove('show'); }, 5200);
  if (S.playing) audio.speak(say || text);
}
function popup(worldPos, text, cls) {
  const layer = $('popups');
  if (!layer) return;
  if (layer.children.length > 14) layer.firstChild.remove();
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return;
  const d = document.createElement('div');
  d.className = 'pop' + (cls ? ' ' + cls : '');
  d.textContent = text;
  d.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
  d.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  layer.appendChild(d);
  setTimeout(() => d.remove(), 900);
}
function hitmarker(head) {
  const h = $('hitmarker');
  if (!h) return;
  h.className = head ? 'head show' : 'show';
  clearTimeout(h._to);
  h._to = setTimeout(() => h.classList.remove('show'), 130);
}
function addScore(n, worldPos, cls) {
  S.score = Math.max(0, S.score + n);
  if (S.score > S.best) {
    S.best = S.score;
    try { localStorage.setItem('frtd_best_v1', String(S.best)); } catch (e) {}
  }
  if (worldPos && n !== 0) popup(worldPos, (n > 0 ? '+' : '') + n, cls);
}
function shake(n) { S.trauma = Math.min(1, S.trauma + n); }

// ---------------- puntuación / rachas / objetivos ----------------
function onKill(z) {
  const last = z.lastHit || {};
  const byPlayer = last.by !== 'ally';
  const head = !!last.head;
  const pos = z.g.position.clone(); pos.y = 1.8 * z.cfg.scale;
  let pts = z.score * (head ? 2 : 1) * (byPlayer ? 1 : 0.6);
  if (last.explosive) { S.explosiveKills++; }
  if (byPlayer) {
    S.killsTimes.push(S.time);
    S.killsTimes = S.killsTimes.filter(t => S.time - t < 4);
    const n = S.killsTimes.length;
    S.streakBest = Math.max(S.streakBest, n);
    const bonus = n >= 10 ? 1000 : n >= 7 ? 600 : n >= 5 ? 350 : n >= 4 ? 200 : n >= 3 ? 120 : n >= 2 ? 50 : 0;
    const names = { 2: 'DOBLE BAJA', 3: 'TRIPLE BAJA', 4: 'RABIA', 5: 'DESPIADADO', 7: 'MASACRE', 10: 'LEYENDA' };
    const streakEl = $('streak');
    if (names[n]) {
      if (streakEl) streakEl.textContent = names[n] + (n > 10 ? ' ×' + n : '');
      pts += bonus;
      popup(pos.clone().add(new THREE.Vector3(0, 1.2, 0)), names[n] + ' +' + bonus, 'bonus');
    } else if (n < 2 && streakEl) streakEl.textContent = '';
    if (head) {
      S.headshots++; S.headWave++;
      popup(pos, 'HEADSHOT ×2 +' + z.score * 2, 'head');
    }
  }
  S.kills++; S.killsWave++;
  addScore(Math.round(pts), head ? null : pos, head ? '' : (last.explosive ? 'bonus' : ''));
  audio.zombieDie();
  checkObjectives();
  updateHUD();
}
function checkObjectives() {
  for (const o of S.objectives) {
    if (o.done) continue;
    let prog = o.prog;
    if (o.id === 'head') prog = S.headWave;
    else if (o.id === 'kill') prog = S.killsWave;
    else if (o.id === 'demo') prog = S.explosiveKills;
    else if (o.id === 'guard') prog = fenceAvg();
    else if (o.id === 'prot') prog = S.civsLostWave === 0 ? 1 : -1;
    o.prog = prog;
    let done = false;
    if (o.id === 'guard') done = false;
    else if (o.id === 'prot') done = false;
    else done = prog >= o.need;
    if (done) {
      o.done = true;
      addScore(o.reward, null, 'bonus');
      toast('OBJETIVO: ' + o.label + ' // +' + o.reward);
      audio.buy();
    }
  }
  renderObjectives();
}
function pickObjectives() {
  const pool = [
    { id: 'head', label: 'HEADHUNTER', desc: 'bajas cabeza', need: 4 + S.wave, reward: 300 },
    { id: 'kill', label: 'EXTERMINADOR', desc: 'bajas totales', need: 10 + S.wave * 2, reward: 200 },
    { id: 'demo', label: 'DEMOLEDOR', desc: 'bajas explosivos', need: 4, reward: 300 },
    { id: 'guard', label: 'GUARDIÁN', desc: 'vallas ≥60% (media)', need: 60, reward: 250 },
    { id: 'prot', label: 'PROTECTOR', desc: 'ningún civil caído', need: 1, reward: 350 },
  ];
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 2);
  S.objectives = shuffled.map(o => ({ ...o, prog: 0, done: false }));
  renderObjectives();
}
function renderObjectives() {
  const el = $('objList');
  if (!el) return;
  el.innerHTML = '';
  for (const o of S.objectives) {
    const d = document.createElement('div');
    d.className = 'obj' + (o.done ? ' done' : '');
    let txt = o.done ? '✔ ' : '◈ ';
    txt += o.label + ': ' + o.desc;
    if (!o.done && o.id !== 'guard' && o.id !== 'prot') txt += ` (${Math.min(o.prog, o.need)}/${o.need})`;
    if (!o.done && o.id === 'guard') txt += ` (${fenceAvg()}%)`;
    txt += `  +${o.reward}`;
    d.textContent = txt;
    el.appendChild(d);
  }
}

// ---------------- oleadas ----------------
function waveComposition(w) {
  const comp = [];
  const push = (t, n) => { for (let i = 0; i < n; i++) comp.push(t); };
  const base = 7 + w * 2;
  push('normal', base);
  if (w >= 2) push('runner', 2 + w);
  if (w >= 3) push('armored', 1 + Math.floor(w / 2));
  if (w >= 4) push('explosive', 1 + Math.floor(w / 3));
  if (w >= 5) push('climber', 1 + Math.floor(w / 3));
  if (w % 5 === 0) push('boss', 1);
  for (let i = comp.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [comp[i], comp[j]] = [comp[j], comp[i]];
  }
  return comp;
}
const RADIO_WAVE = [
  'Oleada {n} en camino. Mantén la línea desde la torre.',
  'Contacto inminente. Oleada {n} aproximándose a la valla.',
  'Puesto de mando: oleada {n}. Abre fuego a discreción.',
  'Alerta: oleada {n} detectada avanzando por la costa.',
];
function startWave(n) {
  S.wave = n;
  S.intermission = false;
  if (S.fenceEditMode) closeFenceEditor();
  const ib = $('interBar');
  if (ib) ib.style.display = 'none';
  for (const f of S.fences) f._warned = false;
  S.headWave = 0; S.killsWave = 0; S.civsLostWave = 0; S.explosiveKills = 0;
  S.specPool.fire = 12 + n; S.specPool.shock = 12 + n;
  S.wstate.forEach((ws, i) => { ws.ammo = magSize(i); ws.reloading = false; });
  for (const w of WEAPONS) {
    if (n === w.unlock && w.unlock > 1) {
      toast('NUEVA ARMA: ' + w.name + ' (tecla ' + (WEAPONS.indexOf(w) + 1) + ')');
      radio('Nuevo armamento disponible: ' + w.name + '.', 'Nueva arma disponible.');
    }
  }
  if (n >= 3 && !S.strikeUnlocked) {
    S.strikeUnlocked = true;
    toast('APOYO AÉREO DISPONIBLE (T)');
    radio('Apoyo aéreo disponible. Pulsa T para solicitarlo.', 'Apoyo aéreo disponible.');
  }
  if (n >= 5 && ent.soldiers.length < 2) {
    ent.spawnSoldier(8, 3.5, 'RUIZ');
    radio('Un segundo soldado se une a la defensa del perímetro.', 'Refuerzos en posición.');
  }
  const nCiv = Math.min(1 + Math.floor(n / 3), 3);
  for (let i = 0; i < nCiv; i++) {
    ent.spawnCivilian(rand(2, 24), rand(-12, -5));
  }
  S.pendingSpawns = waveComposition(n);
  S.spawnT = 0;
  pickObjectives();
  const wv = $('waveVal');
  if (wv) wv.textContent = fmt(n);
  toast('OLEADA ' + fmt(n) + ' // CONTACTO');
  audio.siren(n % 5 === 0 ? 3 : 2);
  if (n === 2) {
    setTimeout(() => {
      if (!S.playing) return;
      toast('⚠ NUEVO: ASALTO ANFIBIO POR EL MAR (OESTE) ⚠');
      radio('Atención: el enemigo bota lanchas por el flanco oeste. Tres segundos para botarlas, dos para salir. ¡Húndelos!', 'Asalto anfibio por el oeste.');
    }, 3500);
    setTimeout(() => {
      if (!S.playing) return;
      toast('NUEVO: LANCHA DE DEFENSA · FABRÍCALA CON [L]');
      radio('Defensa costera lista: pulsa L para fabricar una lancha en nuestra playa (200 puntos). Se quedará en nuestro lado de la frontera y ametrallará a los blancos de mar.', 'Lancha de defensa disponible.');
    }, 9000);
  }
  if (n % 5 === 0) {
    const isTitano = (n % 10 === 0);
    const bName = isTitano ? 'TITANOSAURUS COLOSAL' : 'CARNOTAURUS DEPREDADOR';
    setTimeout(() => { if (S.playing) audio.bossRoar(); }, 1600);
    radio('¡Atención tirador! Un dinosaurio jefe (' + bName + ') avanza hacia el perímetro defensivo. ¡Concentra el fuego en su cabeza!', 'Dinosaurio ' + bName + ' detectado.');
  } else {
    const msg = RADIO_WAVE[(Math.random() * RADIO_WAVE.length) | 0].replace('{n}', n);
    radio('Aquí Puesto de Mando: ' + msg, msg);
  }
  saveGame();
  updateHUD(); renderSlots();
}
function endWave() {
  const fenceBonus = fenceAvg();
  let bonus = 100 + S.wave * 25;
  addScore(bonus, null, 'bonus');
  for (const o of S.objectives) {
    if (o.done) continue;
    if (o.id === 'guard' && fenceBonus >= 60) { o.done = true; addScore(o.reward, null, 'bonus'); toast('OBJETIVO: GUARDIÁN // +' + o.reward); }
    if (o.id === 'prot' && S.civsLostWave === 0) { o.done = true; addScore(o.reward, null, 'bonus'); toast('OBJETIVO: PROTECTOR // +' + o.reward); }
  }
  renderObjectives();
  for (const f of S.fences) { if (f.alive) { f.hp = Math.min(f.max, f.hp + 15); if (f.hp >= f.max * 0.35) f._warned = false; } }
  if (world.placedFences) {
    for (const pf of world.placedFences) { if (pf.layerIndex < 0 && pf.alive) pf.hp = Math.min(pf.maxHp, pf.hp + 20); }
  }
  S.hp = Math.min(100, S.hp + 25);
  S.intermission = true;
  S.interT = 24;
  const ib = $('interBar'), it = $('interText');
  if (ib) ib.style.display = 'flex';
  if (it) it.textContent = `OLEADA ${fmt(S.wave)} SUPERADA · BONUS +${bonus} · SIGUIENTE EN ${Math.ceil(S.interT)}s`;
  toast('ZONA LIMPIA // FORTIFICA EL VALLADO CON [V] O EXTIENDE TIEMPO');
  radio('Zona limpia. Fortifica el vallado, reabastece y repara. Pulsa V para editar el muro o B para mejoras.', 'Zona limpia. Fortifica el vallado.');
  saveGame();
  updateHUD();
}

// ---------------- despliegue de ametralladoras autónomas ----------------
function deployTurret() {
  if (!S.playing || S.paused) return;
  if (ent.turrets.length >= 4) {
    toast('4/4 AMETRALLADORAS DESPLEGADAS (MÁXIMO)');
    audio.denied();
    return;
  }
  const cost = 150;
  const isFree = (ent.turrets.length === 0 && ent.aliveCount() >= 5);
  if (!isFree && S.score < cost) {
    toast('PUNTOS INSUFICIENTES (150 PTS)');
    audio.denied();
    return;
  }
  if (!isFree) S.score -= cost;
  const t = ent.deployTurret();
  if (t) {
    audio.turretDeploy();
    toast(`AMETRALLADORA ${t.index + 1}/4 DESPLEGADA // ${t.slot.label}`);
    radio(`Ametralladora autónoma ${t.index + 1} en línea. Fuego de cobertura iniciado.`, 'Ametralladora en línea.');
    updateHUD();
  }
}

// ---------------- fabricación de lancha de defensa (flanco marítimo) ----------------
// Se fabrica en NUESTRA playa (lado amigo de la frontera): no cruza la orilla, solo
// vigila el mar y ametralla a los objetivos de mar que se acerquen a la frontera.
function deployBoat() {
  if (!S.playing || S.paused) return;
  if (S.wave < 2) {
    toast('LANCHA DE DEFENSA DISPONIBLE DESDE OLEADA 2');
    audio.denied();
    return;
  }
  if (ent.boats.length >= BOAT_MAX) {
    toast(`${BOAT_MAX}/${BOAT_MAX} LANCHAS EN POSICIÓN (MÁXIMO)`);
    audio.denied();
    return;
  }
  if (S.score < BOAT_COST) {
    toast(`PUNTOS INSUFICIENTES (${BOAT_COST} PTS)`);
    audio.denied();
    return;
  }
  S.score -= BOAT_COST;
  const b = ent.deployBoat();
  if (b) {
    audio.boatDeploySfx && audio.boatDeploySfx();
    toast(`LANCHA DE DEFENSA ${b.index + 1}/${BOAT_MAX} FABRICADA // ${b.slot.label}`);
    radio(`Lancha de defensa en posición en nuestra playa (${b.slot.label}). Vigilará el flanco marítimo.`, 'Lancha de defensa en posición.');
    updateHUD();
  }
}

// ---------------- combate ----------------
const _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _m = new THREE.Vector3(), _tmp = new THREE.Vector3();
function dmgMult() { return 1 + S.up.dmg * 0.25; }
function reloadMult() { return Math.pow(0.82, S.up.reload); }
function magSize(i) { return Math.round(WEAPONS[i].mag * (1 + S.up.mag * 0.3)); }
function rifleZoom() { return ZOOM_LVLS[S.up.zoom]; }
function aimDir(out) {
  camera.getWorldDirection(out);
  const w = WEAPONS[S.curW];
  const spread = S.zoomed ? 0.0006 : (S.curW === 1 ? 0.012 : 0.006);
  out.x += rand(-spread, spread); out.y += rand(-spread, spread); out.z += rand(-spread, spread) * 0.25;
  return out.normalize();
}
function rayHit(maxDist) {
  // Detección de impacto de rayo precisa optimizada para la altura del nido y dinosaurios jefes
  aimDir(_dir);
  _o.copy(camera.position);
  let best = null, bestT = maxDist || 180, bestHead = false;
  for (const z of ent.list) {
    if (z.dead) continue;
    const p = z.g.position;
    const hy = p.y + (z.headY || (2.4 * z.cfg.scale));
    const hz = p.z + (z.headZ || 0);
    // cabeza: esfera
    _tmp.set(p.x - _o.x, hy - _o.y, hz - _o.z);
    let t = _tmp.dot(_dir);
    if (t > 0 && t < bestT) {
      const cx = _o.x + _dir.x * t - p.x;
      const cy = _o.y + _dir.y * t - hy;
      const cz = _o.z + _dir.z * t - hz;
      const hr = (z.headR || (0.52 * z.cfg.scale)) * (S.zoomed ? 1.25 : 1.4);
      if (cx * cx + cy * cy + cz * cz < hr * hr) {
        best = z; bestT = t; bestHead = true;
        continue;
      }
    }
    // cuerpo: cilindro o cápsula adaptada a humanoides y dinosaurios
    const bodyBaseY = p.y + 0.15;
    const bodyTopY = p.y + (z.bodyH || (2.2 * z.cfg.scale));
    const bodyMidY = (bodyBaseY + bodyTopY) / 2;
    _tmp.set(p.x - _o.x, bodyMidY - _o.y, p.z - _o.z);
    t = _tmp.dot(_dir);
    if (t > 0 && t < bestT) {
      const px = _o.x + _dir.x * t, py = _o.y + _dir.y * t, pz = _o.z + _dir.z * t;
      if (py > bodyBaseY && py < bodyTopY) {
        const dx = px - p.x, dz = pz - p.z;
        const br = (z.bodyR || (0.65 * z.cfg.scale)) * 1.5;
        if (dx * dx + dz * dz < br * br) {
          best = z; bestT = t; bestHead = false;
        }
      }
    }
  }
  return { target: best, dist: bestT, head: bestHead };
}
function groundAim(out) {
  aimDir(_dir);
  _o.copy(camera.position);
  if (_dir.y < -0.01) {
    const t = -(_o.y - 0.2) / _dir.y;
    if (t > 0 && t < 160) return out.copy(_o).addScaledVector(_dir, t);
  }
  return out.copy(_o).addScaledVector(_dir, 70);
}

const projectiles = [];
const bulletGeo = new THREE.SphereGeometry(0.09, 8, 8);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xaefcff });
const shellGeo = new THREE.SphereGeometry(0.16, 8, 8);
const shellMat = new THREE.MeshBasicMaterial({ color: 0xffc060 });
function fireBullet(target, head, dmg, spec) {
  world.muzzleWorld(_m);
  const mesh = new THREE.Mesh(bulletGeo, bulletMat);
  mesh.position.copy(_m);
  scene.add(mesh);
  const end = target
    ? target.g.position.clone().add(new THREE.Vector3(0, head ? (target.headY || 2.4 * target.cfg.scale) : 1.3 * target.cfg.scale, head ? (target.headZ || 0) : 0))
    : groundAim(new THREE.Vector3());
  projectiles.push({ kind: 'bullet', mesh, from: _m.clone(), to: end, t: 0, dur: _m.distanceTo(end) / 140, target, head, dmg, spec });
}
function fireGrenade(dmg, radius) {
  world.muzzleWorld(_m);
  const mesh = new THREE.Mesh(shellGeo, shellMat);
  mesh.position.copy(_m);
  scene.add(mesh);
  const dest = groundAim(new THREE.Vector3());
  const dir = dest.clone().sub(_m);
  const dist = dir.length(); dir.normalize();
  projectiles.push({
    kind: 'grenade', mesh, vel: dir.multiplyScalar(Math.min(38, 18 + dist * 0.35)).add(new THREE.Vector3(0, 6.0, 0)),
    t: 0, dmg, radius,
  });
}
function fireMissiles(dmg, radius) {
  const cands = ent.list.filter(z => !z.dead)
    .sort((a, b) => a.g.position.distanceTo(camera.position) - b.g.position.distanceTo(camera.position))
    .slice(0, 4);
  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      if (!S.playing || S.paused) return;
      world.muzzleWorld(_m);
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 6), new THREE.MeshBasicMaterial({ color: 0xd8f4ff }));
      mesh.position.copy(_m);
      scene.add(mesh);
      aimDir(_dir);
      projectiles.push({
        kind: 'missile', mesh, vel: _dir.clone().multiplyScalar(16).add(new THREE.Vector3(rand(-2, 2), 5 + i, rand(-2, 2))),
        t: -i * 0.12, dmg, radius, target: cands[i % Math.max(1, cands.length)] || null, smokeT: 0,
      });
      audio.shoot('missiles');
      fx.muzzle(_m.clone(), _dir.clone());
    }, i * 160);
  }
}

function tryFire() {
  if (!S.playing || S.paused || S.shopOpen) return;
  if (S.switchT > 0) return;
  const w = WEAPONS[S.curW];
  const ws = S.wstate[S.curW];
  if (ws.cd > 0 || ws.reloading) return;
  if (ws.ammo <= 0) { audio.dryFire(); startReload(S.curW); return; }
  if (S.wave < w.unlock) return;
  ws.ammo--;
  ws.cd = w.rof;
  S.shots++;
  const dmg = w.dmg * dmgMult();
  world.muzzleWorld(_m);
  aimDir(_dir);
  fx.muzzle(_m.clone(), _dir.clone());
  world.addKick(w.kick * (S.zoomed ? 0.6 : 1));
  shake(0.05 + w.kick * 0.025);
  const fl = $('flash');
  if (fl) {
    fl.classList.add('fire');
    setTimeout(() => fl.classList.remove('fire'), 120);
  }
  const ch = $('crosshair');
  if (ch) {
    ch.style.setProperty('--sp', '20px');
    setTimeout(() => ch.style.setProperty('--sp', S.zoomed ? '6px' : '14px'), 110);
  }

  if (S.curW === 0 || S.curW === 1) {
    audio.shoot(w.sfx);
    let spec = 'normal';
    if (w.special && S.spec !== 'normal' && S.specPool[S.spec] > 0) {
      spec = S.spec;
      S.specPool[S.spec]--;
      if (S.specPool[S.spec] <= 0) { S.spec = 'normal'; toast('MUNICIÓN ESPECIAL AGOTADA'); }
    }
    const { target, head } = rayHit(180);
    if (target) {
      S.hits++;
      fireBullet(target, head, dmg * (head ? 2 : 1), spec);
    } else {
      fireBullet(null, false, 0, spec);
    }
  } else if (S.curW === 2) {
    audio.shoot('launcher');
    fireGrenade(dmg, w.radius);
    S.hits++;
  } else {
    fireMissiles(dmg, w.radius);
    S.hits++;
  }
  updateHUD();
}
function resolveBullet(p) {
  scene.remove(p.mesh);
  if (p.target && !p.target.dead) {
    const z = p.target;
    const hp = z.g.position.clone(); hp.y = z.g.position.y + (p.head ? z.headY : 1.3 * z.cfg.scale);
    if (p.spec === 'shock') {
      fx.electricArc(hp.clone().add(new THREE.Vector3(0, 2, 0)), hp);
      const other = ent.nearestTo(hp, 9);
      if (other && other !== z) {
        const op = other.g.position.clone(); op.y = other.g.position.y + 1.4 * other.cfg.scale;
        fx.electricArc(hp, op);
        ent.damage(other, 1 * dmgMult(), { electric: true, by: 'player' });
      }
    } else if (p.spec === 'fire') {
      fx.fireTick(hp);
    } else {
      fx.sparkHit(hp);
    }
    audio.hit(p.head);
    hitmarker(p.head);
    ent.damage(z, p.dmg, { head: p.head, fire: p.spec === 'fire', electric: p.spec === 'shock', by: 'player' });
  } else {
    if (p.to.x < SHORE_X && fx.splash) fx.splash(p.to.clone().setY(0.15), 0.7);
    else fx.dirtBurst(p.to);
  }
}
function explode(p, radius, dmg, opt) {
  opt = opt || {};
  const inSea = p.x < SHORE_X;
  if (inSea && fx.splash) fx.splash(p.clone().setY(0.2), radius > 5 ? 2.2 : 1.4);
  fx.explosion(p, radius > 5);
  audio.explosion(radius > 5);
  const dCam = p.distanceTo(camera.position);
  shake(clamp(0.45 - dCam * 0.007, 0, 0.4));
  if (opt.zombies !== false) {
    for (const z of [...ent.list]) {
      if (z.dead) continue;
      const zp = z.g.position.clone(); zp.y += 1.2 * z.cfg.scale;
      const d = zp.distanceTo(p);
      if (d < radius) {
        const fall = d < radius * 0.45 ? 1 : 0.55;
        ent.damage(z, dmg * fall, { explosive: true, big: true, by: opt.by || 'player' });
      }
    }
  }
  // La lancha de defensa está anclada en nuestra playa: las explosiones cercanas
  // (también las propias) la dañan.
  for (const bt of [...ent.boats]) {
    const d = bt.g.position.distanceTo(p);
    if (d < radius + 1.2) {
      const fall = d < radius * 0.5 ? 1 : 0.5;
      ent.damageBoat(bt, Math.max(1, Math.round(dmg * fall * 0.4)));
    }
  }
  if (opt.fence) {
    S.fences.forEach((f, i) => {
      if (!f.alive) return;
      if (Math.abs(p.z - f.z) < radius && p.x > FENCE_X0 - radius && p.x < FENCE_X1 + radius) {
        ent.hooks.fenceDamage(dmg * 0.9, p, i);
      }
    });
    // Vallas personalizadas del perímetro: mismo criterio de radio
    if (world.placedFences) {
      for (const pf of world.placedFences) {
        if (!pf.alive) continue;
        const fdx = Math.cos(pf.rotation || 0), fdz = Math.sin(pf.rotation || 0);
        const fL = (pf.width || 4) * 0.5;
        const qx0 = pf.x - fdx * fL, qz0 = pf.z - fdz * fL;
        const qx1 = pf.x + fdx * fL, qz1 = pf.z + fdz * fL;
        if (world.ptSegDist2D(p.x, p.z, qx0, qz0, qx1, qz1) < radius) {
          damagePlacedFence(pf, dmg * 0.9);
        }
      }
    }
  }
  if (opt.player && dCam < radius) {
    ent.hooks.playerDamage(Math.round(dmg * 0.5));
  }
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.kind === 'bullet') {
      p.t += dt;
      const k = Math.min(1, p.t / Math.max(0.01, p.dur));
      p.mesh.position.lerpVectors(p.from, p.to, k);
      if (k >= 1) { resolveBullet(p); projectiles.splice(i, 1); }
    } else if (p.kind === 'grenade') {
      p.t += dt;
      p.vel.y -= 13 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      let boom = p.mesh.position.y <= 0.2 || p.t > 5;
      if (!boom) {
        const near = ent.nearestTo(p.mesh.position, 1.6);
        if (near) boom = true;
      }
      if (boom) {
        const bp = p.mesh.position.clone(); bp.y = Math.max(0.4, bp.y);
        scene.remove(p.mesh); projectiles.splice(i, 1);
        explode(bp, p.radius, p.dmg, { zombies: true, by: 'player' });
      }
    } else if (p.kind === 'missile') {
      p.t += dt;
      if (p.t < 0) continue;
      if (p.target && p.target.dead) p.target = ent.nearestTo(p.mesh.position, 30);
      const speed = Math.min(36, 14 + p.t * 22);
      if (p.target && !p.target.dead) {
        const tp = p.target.g.position.clone(); tp.y += 1.2 * p.target.cfg.scale;
        const want = tp.sub(p.mesh.position).normalize().multiplyScalar(speed);
        p.vel.lerp(want, Math.min(1, dt * 3.2));
      } else {
        p.vel.y -= 6 * dt;
        p.vel.setLength(speed);
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
      p.smokeT += dt;
      if (p.smokeT > 0.03) {
        p.smokeT = 0;
        fx.embers.spawn(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z,
          rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.4, 0.9, 0.85, 0.7, 0, 1);
      }
      let boom = p.mesh.position.y <= 0.25 || p.t > 7;
      if (!boom && p.target && !p.target.dead) {
        const tp = p.target.g.position.clone(); tp.y += 1.2 * p.target.cfg.scale;
        if (tp.distanceTo(p.mesh.position) < 1.8) boom = true;
      }
      if (boom) {
        const bp = p.mesh.position.clone(); bp.y = Math.max(0.4, bp.y);
        scene.remove(p.mesh); projectiles.splice(i, 1);
        explode(bp, p.radius, p.dmg, { zombies: true, by: 'player' });
      }
    }
  }
}

// ---------------- recarga / armas / especial ----------------
function startReload(i) {
  const ws = S.wstate[i];
  if (ws.reloading || ws.ammo >= magSize(i)) return;
  ws.reloading = true;
  ws.reloadT = WEAPONS[i].reload * reloadMult();
  if (i === S.curW) { audio.reload(); world.reloadDip(); }
  const rw = $('reloadWrap');
  if (rw) rw.style.display = 'block';
}
function switchWeapon(i) {
  if (i === S.curW || S.switchT > 0) return;
  if (S.wave < WEAPONS[i].unlock) { audio.denied(); toast('ARMA BLOQUEADA · OLEADA ' + WEAPONS[i].unlock); return; }
  S.curW = i; S.switchT = 0.35;
  world.setWeapon(i);
  audio.click();
  const w = WEAPONS[i];
  const wn = $('weaponName'), wi = $('weaponIcon'), ch = $('crosshair');
  if (wn) wn.textContent = w.name;
  if (wi) wi.textContent = w.icon;
  if (ch) ch.className = i >= 2 ? 'launch' : '';
  renderSlots(); updateHUD();
}
function cycleSpec() {
  const w = WEAPONS[S.curW];
  if (!w.special) { toast('ESTA ARMA NO USA MUNICIÓN ESPECIAL'); audio.denied(); return; }
  const i = (SPEC_MODES.indexOf(S.spec) + 1) % SPEC_MODES.length;
  S.spec = SPEC_MODES[i];
  if (S.spec !== 'normal' && S.specPool[S.spec] <= 0) S.spec = 'normal';
  audio.click();
  toast('MUNICIÓN: ' + SPEC_NAMES[S.spec] + (S.spec === 'normal' ? '' : ' ×' + S.specPool[S.spec]));
  updateHUD();
}
function repairFence() {
  if (!S.playing || S.paused) return;
  const cost = 120;
  if (fencesAllFull()) { toast('LAS VALLAS ESTÁN ÍNTEGRAS'); return; }
  if (S.score < cost) { audio.denied(); toast('PUNTOS INSUFICIENTES (120)'); return; }
  S.score -= cost;
  const hadFallen = S.fences.some(f => !f.alive) || (world.placedFences && world.placedFences.some(f => !f.alive));
  for (const f of S.fences) {
    if (!f.alive) {
      f.alive = true;
      f.hp = Math.round(f.max * 0.4);
    } else {
      f.hp = Math.min(f.max, f.hp + 35);
    }
    if (f.hp >= f.max * 0.35) f._warned = false;
  }
  if (world.placedFences) {
    for (const pf of world.placedFences) {
      if (pf.layerIndex >= 0) continue; // las capas base se reparan arriba (S.fences)
      if (!pf.alive) {
        pf.alive = true;
        pf.hp = Math.round(pf.maxHp * 0.4);
      } else {
        pf.hp = Math.min(pf.maxHp, pf.hp + 40);
      }
    }
  }
  if (hadFallen) {
    toast('VALLAS RECONSTRUIDAS // MEDIA ' + fenceAvg() + '%');
    radio('Vallas reconstruidas parcialmente. Aguantarán un tiempo.', 'Vallas reconstruidas.');
  } else {
    toast('VALLAS REPARADAS // MEDIA ' + fenceAvg() + '%');
  }
  audio.repair();
  for (const f of S.fences) {
    for (let k = 0; k < 3; k++) fx.healSparkle(new THREE.Vector3(rand(FENCE_X0, FENCE_X1), rand(1, 4), f.z));
  }
  if (world.placedFences) {
    for (const pf of world.placedFences) {
      fx.healSparkle(new THREE.Vector3(pf.x, rand(1, 3), pf.z));
    }
  }
  updateHUD();
}

// ---------------- línea de frente (perímetro de aparición) ----------------
// Devuelve la Z de la valla MÁS ALEJADA de nuestro lado: las 3 capas base y los
// tramos colocados por el jugador en el editor. Los asaltantes y los jefes aparecen
// siempre al norte de esta línea, así nunca se materializan dentro de nuestra mitad.
function frontLineZ() {
  let z = FENCE_ZS[0];
  for (const f of S.fences) if (f.alive) z = Math.min(z, f.z);
  if (world && world.placedFences) {
    for (const pf of world.placedFences) {
      if (!pf.alive) continue;
      z = Math.min(z, pf.z);
    }
  }
  return Math.min(z, FENCE_ZS[0]);
}

// ---------------- modo editor de vallado ----------------
function openFenceEditor() {
  if (!S.playing || S.paused) return;
  S.fenceEditMode = true;
  document.body.classList.add('fe-editing');   // la interfaz se recoloca (ver CSS)
  setZoom(false); // Quitar mira telescópica en el editor
  releaseLock();  // en el editor el cursor debe verse (hay botones que tocar)
  const fe = $('fenceEditorHUD');
  if (fe) fe.classList.remove('hidden');
  const fab = $('feFab');
  if (fab) fab.classList.remove('hidden');
  // En móvil el panel se abre ya apartado (solo la barra flotante) para no tapar la
  // retícula; en PC queda atracado a la izquierda, fuera del centro de la pantalla.
  setFencePanel(!isTouchDevice);
  if (world.setEditorOverlay) world.setEditorOverlay(true); // zona construible + retícula
  updateCursorState();
  updateFenceEditorUI();
  toast('MODO EDICIÓN DE VALLADO // COLOCA EN LA RETÍCULA');
  audio.click();
}

function closeFenceEditor() {
  S.fenceEditMode = false;
  document.body.classList.remove('fe-panel-open');
  document.body.classList.remove('fe-editing');
  const fe = $('fenceEditorHUD');
  if (fe) fe.classList.add('hidden');
  const fab = $('feFab');
  if (fab) fab.classList.add('hidden');
  if (world.clearHologram) world.clearHologram();
  if (world.setEditorOverlay) world.setEditorOverlay(false);
  updateCursorState();
  if (lockAllowed()) requestLock(); // de vuelta al combate: re-enganchar el puntero
  audio.click();
}

function toggleFenceEditor() {
  if (S.fenceEditMode) closeFenceEditor();
  else openFenceEditor();
}

// Aparta / muestra el panel del editor. Mientras está apartado solo queda la barra
// flotante (COLOCAR · ROTAR · MODO · MENÚ · SALIR), que no tapa el centro de la
// pantalla ni la retícula: se puede colocar el vallado con la vista limpia.
function setFencePanel(show) {
  S.fencePanelOpen = !!show;
  const fe = $('fenceEditorHUD');
  if (fe) fe.classList.toggle('stowed', !show);
  // la clase del body re-coloca la barra flotante para que nunca tape el panel
  document.body.classList.toggle('fe-panel-open', !!show);
  const st = $('feStowBtn');
  if (st) st.textContent = show ? '◀ APARTAR MENÚ' : '▶ MOSTRAR MENÚ';
  const fb = $('feFabPanel');
  if (fb) fb.classList.toggle('active', show);
}
function toggleFencePanel() {
  setFencePanel(!S.fencePanelOpen);
  try { audio.click(); } catch (e) {}
}

// Punto EXACTO de colocación: intersección del rayo del centro de la pantalla
// (sin dispersión de arma) con el suelo. Si la vista se dispara por encima del
// horizonte, se mantiene el último punto válido (pegajoso) para no perder la
// retícula y poder colocar con precisión.
const fenceAimPoint = new THREE.Vector3(3, 0, -8);
function computeFenceAimPoint(out) {
  camera.getWorldDirection(_dir);
  _o.copy(camera.position);
  if (_dir.y < -0.005) {
    const t = (0.2 - _o.y) / _dir.y;
    if (t > 0.5 && t < 230) {
      out.copy(_o).addScaledVector(_dir, t);
      fenceAimPoint.copy(out);
      return out;
    }
  }
  return out.copy(fenceAimPoint);
}

function extendIntermissionTime(seconds = 30, cost = 50) {
  if (!S.playing || S.paused) return;
  if (S.score < cost) {
    toast(`PUNTOS INSUFICIENTES (${cost} PTS NECESARIOS)`);
    audio.denied();
    return;
  }
  S.score -= cost;
  S.interT = Math.max(S.interT, 0) + seconds;
  audio.buy();
  toast(`⏱ TIEMPO EXTENDIDO // +${seconds}s (-${cost} PTS)`);
  updateHUD();
  updateFenceEditorUI();
}

function setFenceEditorModel(typeId) {
  if (!FENCE_CATALOG[typeId]) return;
  S.selectedFenceModel = typeId;
  document.querySelectorAll('#feModels .fe-card').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-type') === typeId);
  });
  audio.click();
}

const ROTATION_ANGLES = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4];
function cycleFenceRotation() {
  let idx = ROTATION_ANGLES.findIndex(r => Math.abs(r - S.fenceRotationAngle) < 0.05);
  if (idx < 0) idx = 0;
  idx = (idx + 1) % ROTATION_ANGLES.length;
  setFenceRotation(ROTATION_ANGLES[idx]);
}

function setFenceRotation(angle) {
  S.fenceRotationAngle = angle;
  document.querySelectorAll('.fe-btn-rot').forEach(b => {
    const r = parseFloat(b.getAttribute('data-rot'));
    b.classList.toggle('active', Math.abs(r - angle) < 0.05);
  });
  audio.click();
}

function setFenceTool(tool) {
  S.fenceTool = tool;
  const bBuild = $('feToolBuild'), bDemo = $('feToolDemolish'), bRep = $('feToolRepair');
  if (bBuild) bBuild.classList.toggle('active', tool === 'build');
  if (bDemo) bDemo.classList.toggle('active', tool === 'demolish');
  if (bRep) bRep.classList.toggle('active', tool === 'repair');
  updateFenceEditorUI();   // la barra flotante refleja la herramienta al instante
  audio.click();
}

function updateFenceEditorUI() {
  const sc = $('feScore'), tm = $('feTimer');
  if (sc) sc.textContent = S.score;
  if (tm) tm.textContent = S.intermission ? Math.max(0, Math.ceil(S.interT)) + 's' : 'EN COMBATE';
  // barra flotante: estado compacto + herramienta activa
  const fs = $('feFabScore');
  if (fs) fs.textContent = S.score + ' PTS';
  const ft = $('feFabToolName');
  if (ft) {
    const names = { build: 'CONSTRUIR', demolish: 'DEMOLER', repair: 'REPARAR' };
    ft.textContent = names[S.fenceTool] || 'CONSTRUIR';
  }
  const fm = $('feFabModel');
  if (fm) {
    const cfg = FENCE_CATALOG[S.selectedFenceModel] || FENCE_CATALOG.chain_link;
    fm.textContent = cfg.name.toUpperCase() + ' · ' + cfg.cost + ' PTS';
  }
  const fc = $('feFabCount');
  if (fc && world.serializeCustomFences) fc.textContent = world.serializeCustomFences().length + ' TRAMOS';
  const fp = $('fePlaceFloat');
  if (fp) {
    const cfg = FENCE_CATALOG[S.selectedFenceModel] || FENCE_CATALOG.chain_link;
    fp.disabled = (S.fenceTool === 'build' && S.score < cfg.cost);
  }
  const pb = $('fePlaceBtn');
  if (pb) {
    if (S.fenceTool === 'build') {
      const cfg = FENCE_CATALOG[S.selectedFenceModel] || FENCE_CATALOG.chain_link;
      pb.disabled = S.score < cfg.cost;
    } else {
      pb.disabled = false;
    }
  }
}

// COLOCAR (y apartar el menú): botón grande flotante, pensado para el pulgar.
// Devuelve true solo si la acción tuvo efecto (valla colocada / demolida / reparada).
function placeFenceAndStow() {
  const ok = handleFenceEditorClick();
  if (ok) setFencePanel(false);
  return ok;
}
function cycleFenceTool() {
  const order = ['build', 'demolish', 'repair'];
  const i = order.indexOf(S.fenceTool);
  setFenceTool(order[(i + 1) % order.length]);
}

function handleFenceEditorClick() {
  if (!S.fenceEditMode) return false;
  const p = computeFenceAimPoint(new THREE.Vector3());

  // Límites de la zona construible: todo el corredor terrestre por donde
  // avanzan los infectados (costa x=-26 → muro este x=+32, horizonte z=-45 → sacos z=+12)
  const inBounds = (p.x >= BUILD_X0 && p.x <= BUILD_X1 && p.z >= BUILD_Z0 && p.z <= BUILD_Z1);
  if (!inBounds) {
    audio.denied();
    toast('FUERA DE LA ZONA DE CONSTRUCCIÓN');
    return false;
  }

  if (S.fenceTool === 'build') {
    const cfg = FENCE_CATALOG[S.selectedFenceModel] || FENCE_CATALOG.chain_link;
    if (S.score < cfg.cost) {
      audio.denied();
      toast(`PUNTOS INSUFICIENTES (SE REQUIEREN ${cfg.cost} PTS)`);
      return false;
    }
    if (!world.isFenceSpotFree(p.x, p.z, S.fenceRotationAngle, cfg.width, cfg.depth)) {
      audio.denied();
      toast('ZONA OCUPADA: DESPLAZA LA RETÍCULA');
      return false;
    }
    const added = world.addPlacedFence(S.selectedFenceModel, p.x, p.z, S.fenceRotationAngle, cfg.hp, cfg.hp);
    if (!added) {
      audio.denied();
      toast('MODELO DE VALLA AÚN EN CARGA · INTENTA DE NUEVO');
      return false;
    }
    S.score -= cfg.cost; // los puntos solo se descuentan si la valla se colocó
    audio.buy();
    fx.sparkHit(p.clone().setY(1.0));
    toast(`VALLA COLOCADA // ${cfg.name.toUpperCase()} (-${cfg.cost} PTS)`);
    saveGame(); // el vallado colocado queda guardado con la partida
    updateHUD();
    updateFenceEditorUI();
    return true;
  } else if (S.fenceTool === 'demolish') {
    // Buscar la valla personalizada más cercana (las 3 capas base no se demuelen)
    let best = null, bestD = 4.0;
    for (const f of world.placedFences) {
      if (f.layerIndex >= 0) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < bestD) { bestD = d; best = f; }
    }
    if (best) {
      const cfg = FENCE_CATALOG[best.type] || { cost: 80 };
      const refund = Math.floor(cfg.cost * 0.5);
      S.score += refund;
      world.removePlacedFence(best);
      audio.repair();
      fx.dirtBurst(p);
      toast(`VALLA DEMOLIDA // +${refund} PTS RECUPERADOS`);
      saveGame(); // se retira del guardado solo al demolerla desde el editor
      updateHUD();
      updateFenceEditorUI();
      return true;
    } else {
      toast('SIN VALLA PERSONALIZADA EN ESE PUNTO');
      audio.denied();
      return false;
    }
  } else if (S.fenceTool === 'repair') {
    const before = fenceAvg();
    repairFence();
    updateHUD();
    updateFenceEditorUI();
    return fenceAvg() !== before || !fencesAllFull();
  }
  updateHUD();
  updateFenceEditorUI();
  return false;
}
function callStrike() {
  if (!S.playing || S.paused || !S.strikeUnlocked || S.strikeCd > 0) return;
  const c = new THREE.Vector3();
  const alive = ent.list.filter(z => !z.dead);
  if (!alive.length) { toast('SIN BLANCOS PARA EL ATAQUE AÉREO'); return; }
  for (const z of alive) c.add(z.g.position);
  c.divideScalar(alive.length);
  // Centro del ataque sobre tierra firme (frente a las vallas), nunca sobre el mar
  const cx = clamp(c.x, -14, 24), cz = clamp(c.z, -24, 2);
  const ok = world.heliStrike(
    new THREE.Vector3(cx - 26, 0, cz), new THREE.Vector3(cx + 26, 0, cz), 7,
    (i, pos) => {
      pos.y = 0.4;
      setTimeout(() => { if (S.playing && !S.paused) explode(pos.clone(), 6.5, 8 * dmgMult(), { zombies: true, by: 'player' }); }, 250);
    },
    () => radio('Ataque aéreo completado. Evaluando daños.', 'Ataque completado.')
  );
  if (!ok) { toast('HELICÓPTERO EN OTRA MISIÓN'); return; }
  S.strikeCd = 50;
  toast('ATAQUE AÉREO EN CAMINO');
  radio('Apoyo aéreo en camino. Despejen la zona.', 'Apoyo aéreo en camino.');
  updateHUD();
}

// ---------------- HUD MINIMALISTA ----------------
function updateHUD() {
  updateFloorHUD();   // planta actual + aviso de estar a pie de suelo
  const sv = $('scoreVal'), bv = $('bestVal');
  if (sv) sv.textContent = S.score;
  if (bv) bv.textContent = S.best;
  const alive = ent.aliveCount() + S.pendingSpawns.length;
  const rv = $('remainVal');
  if (rv) rv.textContent = alive;
  const threat = clamp(Math.round(10 + S.wave * 4 + ent.aliveCount() * 3 + (ent.boss && !ent.boss.dead ? 18 : 0) + S.storm * 10), 0, 99);
  const tv = $('threatVal'), tf = $('threatFill');
  if (tv) tv.textContent = threat;
  if (tf) tf.style.width = threat + '%';
  audio.intensity = threat / 100;
  const ws = S.wstate[S.curW];
  const av = $('ammoVal'), am = $('ammoMax');
  if (av) av.textContent = fmt(Math.max(0, ws.ammo));
  if (am) am.textContent = fmt(magSize(S.curW));
  const w = WEAPONS[S.curW];
  const zl = S.curW === 0 ? rifleZoom().toFixed(1) : w.zoom.toFixed(1);
  const zt = $('zoomText'), spv = $('specVal');
  if (zt) zt.textContent = 'ZOOM ' + (S.zoomed ? zl : '1.0') + '×';
  if (spv) spv.textContent = w.special ? ('MUN ' + SPEC_NAMES[S.spec] + (S.spec === 'normal' ? '' : ' ×' + S.specPool[S.spec])) : 'OJIVA HE';
  const fracs = fenceFracs();
  S.fences.forEach((f, i) => {
    const fill = $('fenceFill' + i), txt = $('fenceText' + i);
    const pct = Math.round(fracs[i] * 100);
    if (fill) {
      fill.style.width = pct + '%';
      fill.style.background = !f.alive ? '#ff5470' : (pct < 30 ? '#ff7b4d' : '');
    }
    if (txt) txt.textContent = f.alive ? pct : 'CAÍDA';
  });
  const hpf = $('hpFill'), hpt = $('hpText');
  if (hpf) hpf.style.width = S.hp + '%';
  if (hpt) hpt.textContent = Math.ceil(S.hp);
  const lhp = $('lowhp');
  if (lhp) lhp.style.opacity = S.hp < 35 ? (0.4 + Math.sin(S.time * 5) * 0.25) : 0;

  // Ametralladoras autónomas status
  const tCount = ent.turrets ? ent.turrets.length : 0;
  const ts = $('turretStatus'), tcv = $('turretCountVal'), ttc = $('touchTurretCount');
  if (ts) ts.textContent = `${tCount} / 4`;
  if (tcv) tcv.textContent = tCount;
  if (ttc) ttc.textContent = tCount;

  const btnT = $('btnTurret');
  if (btnT) {
    if (tCount >= 4) {
      btnT.disabled = true;
      const th = $('turretHint');
      if (th) th.textContent = '4/4 MÁXIMO';
      btnT.classList.remove('pulse');
    } else {
      btnT.disabled = false;
      const th = $('turretHint');
      if (th) th.innerHTML = `TECLA E · <b>${tCount}</b>/4`;
      if (ent.aliveCount() >= 5) {
        btnT.classList.add('pulse');
        btnT.classList.add('hot');
      } else {
        btnT.classList.remove('pulse');
      }
    }
  }

  // Lanchas de defensa status
  const bCount = ent.boats ? ent.boats.length : 0;
  const bs = $('boatStatus'), btc = $('touchBoatCount');
  if (bs) bs.textContent = `${bCount} / ${BOAT_MAX}`;
  if (btc) btc.textContent = bCount;
  const btnBt = $('btnBoat');
  if (btnBt) {
    const seaThreat = ent.list.some(z => !z.dead && z.role === 'sea' && z.g.position.x < SHORE_X + 4);
    if (S.wave < 2) {
      btnBt.disabled = true;
      const th = $('boatHint');
      if (th) th.innerHTML = 'DESDE OLEADA 2';
      btnBt.classList.remove('pulse', 'hot');
    } else if (bCount >= BOAT_MAX) {
      btnBt.disabled = true;
      const th = $('boatHint');
      if (th) th.textContent = `${BOAT_MAX}/${BOAT_MAX} MÁXIMO`;
      btnBt.classList.remove('pulse', 'hot');
    } else {
      btnBt.disabled = false;
      const th = $('boatHint');
      if (th) th.innerHTML = `TECLA L · <b>${bCount}</b>/${BOAT_MAX} · ${BOAT_COST} PTS`;
      btnBt.classList.toggle('pulse', seaThreat && S.score >= BOAT_COST);
      btnBt.classList.toggle('hot', seaThreat);
    }
  }

  const sb = $('btnStrike'), stxt = $('strikeText');
  if (sb) {
    if (!S.strikeUnlocked) { sb.disabled = true; if (stxt) stxt.textContent = 'OLEADA 3'; }
    else if (S.strikeCd > 0) { sb.disabled = true; if (stxt) stxt.textContent = Math.ceil(S.strikeCd) + 's'; }
    else { sb.disabled = false; if (stxt) stxt.textContent = 'TECLA T'; }
  }

  const bb = $('bossbar');
  if (bb) {
    if (ent.boss && !ent.boss.dead) {
      bb.style.display = 'block';
      const bn = $('bossName'), bf = $('bossFill');
      if (bn) bn.textContent = '⚠ ' + ent.boss.cfg.name + ' ⚠';
      if (bf) bf.style.width = Math.max(0, ent.boss.hp / ent.boss.maxHp * 100) + '%';
    } else bb.style.display = 'none';
  }
}

function renderSlots() {
  renderTouchWeapons();
  const el = $('slots');
  if (!el) return;
  el.innerHTML = '';
  WEAPONS.forEach((w, i) => {
    const d = document.createElement('div');
    const locked = S.wave < w.unlock;
    d.className = 'slot' + (i === S.curW ? ' sel' : '') + (locked ? ' locked' : '');
    d.innerHTML = '<small>' + (i + 1) + '</small>' + (locked ? '🔒' : w.icon);
    d.title = w.name + (locked ? ' (oleada ' + w.unlock + ')' : '');
    d.onclick = () => switchWeapon(i);
    el.appendChild(d);
  });
}

// ---------------- tienda ----------------
function upCost(u) { return u.base * (S.up[u.id] + 1); }
function openShop() {
  if (!S.playing) return;
  S.shopOpen = true; S.paused = true;
  setZoom(false);   // la mira no debe quedarse encima del arsenal
  releaseLock();    // la tienda necesita el cursor
  updateCursorState();
  audio.suspend();
  const sm = $('shopMenu');
  if (sm) sm.classList.remove('hidden');
  renderShop();
}
function closeShop() {
  S.shopOpen = false;
  const sm = $('shopMenu');
  if (sm) sm.classList.add('hidden');
  if (S.screen === 'game') { S.paused = false; audio.resume(); }
  updateCursorState();
  if (lockAllowed()) requestLock();
}
function renderShop() {
  const ss = $('shopScore');
  if (ss) ss.textContent = S.score + ' PTS';
  const el = $('shopItems');
  if (!el) return;
  el.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = S.up[u.id];
    const maxed = lvl >= u.max;
    const cost = upCost(u);
    const d = document.createElement('div');
    d.className = 'shopitem';
    d.innerHTML = `<div class="info"><h4>${u.name} <span class="pips">${'●'.repeat(lvl)}${'○'.repeat(u.max - lvl)}</span></h4><p>${u.desc}</p></div>`;
    const b = document.createElement('button');
    b.className = 'buy';
    b.textContent = maxed ? 'MÁX' : cost + ' PTS';
    b.disabled = maxed || S.score < cost;
    b.onclick = () => buyUpgrade(u);
    d.appendChild(b);
    el.appendChild(d);
  }
}
function buyUpgrade(u) {
  const cost = upCost(u);
  if (S.up[u.id] >= u.max || S.score < cost) { audio.denied(); return; }
  S.score -= cost;
  S.up[u.id]++;
  if (u.id === 'fence') {
    for (const f of S.fences) {
      f.max += 25;
      f.hp = Math.min(f.max, f.hp + 25);
      if (!f.alive && f.hp > 0) f.alive = true;
      if (f.hp >= f.max * 0.35) f._warned = false;
    }
  }
  if (u.id === 'mag') S.wstate.forEach((ws, i) => { ws.ammo = Math.min(ws.ammo + 2, magSize(i)); });
  audio.buy();
  toast('MEJORA: ' + u.name + ' Nv.' + S.up[u.id]);
  saveGame(); renderShop(); updateHUD();
}

// ---------------- flujo de juego ----------------
function resetRun() {
  try { ent.clearAll(); } catch(e){ console.warn('clearAll fallo', e); ent.list=[]; ent.civs=[]; ent.soldiers=[]; ent.turrets=[]; }
  // Partida nueva: se retira TODO el vallado personalizado colocado en la partida
  // anterior (solo vuelve a aparecer si se CONTINÚA una partida guardada).
  try { world.clearCustomFences(); } catch(e){ console.warn('clearCustomFences fallo', e); }
  resetPlayer();
  for (const p of projectiles) { try{ scene.remove(p.mesh); }catch(e){} }
  projectiles.length = 0;
  // Reset completo de estado, incluyendo tokens de entrada y alertas
  Object.assign(S, {
    wave: 1, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
    curW: 0, spec: 'normal', up: { dmg: 0, reload: 0, zoom: 0, mag: 0, fence: 0 },
    hp: 100, lastHurt: -99,
    strikeCd: 0, strikeUnlocked: false, intermission: false, interT: 0,
    dayT: 0.08, storm: 0, stormState: 'calm', stormT: rand(40, 70), lightning: 0, nextBolt: 0,
    aim: { x: 0, y: 0 }, zoomed: false, firing: false, switchT: 0,
    trauma: 0, time: 0,
    killsTimes: [], streakBest: 0, explosiveKills: 0, headWave: 0, killsWave: 0, civsLostWave: 0,
    objectives: [], pendingSpawns: [], spawnT: 0,
    _lastTurretAlert: 0, _lastSiegeAlert: 0, _lastBoatAlert: -99, _lastLandAlert: -99,
  });
  S.specPool = { fire: 13, shock: 13 };
  resetFences();
  S._lastBoatAlert = -99; S._lastLandAlert = -99;
  S.wstate = WEAPONS.map(w => ({ ammo: w.mag, reloading: false, reloadT: 0, cd: 0 }));
  const rw = $('reloadWrap'), st = $('streak');
  if (rw) rw.style.display = 'none';
  if (st) st.textContent = '';
  try { world.setWeapon(0); } catch(e){ console.warn('setWeapon fallo', e); }
  const wn = $('weaponName'), wi = $('weaponIcon'), ch = $('crosshair');
  if (wn) wn.textContent = WEAPONS[0].name;
  if (wi) wi.textContent = WEAPONS[0].icon;
  if (ch) ch.className = '';
  setZoom(false);
}
function startGame(fresh) {
  try{
    try{ audio.init(); }catch(e){ console.warn('audio init fallo', e); }
    try{ audio.resume(); }catch(e){}
    resetRun();
    if (!fresh) {
      const sv = loadSave();
      if (sv) {
        S.wave = Math.max(1, sv.wave | 0) || 1; S.score = Math.max(0, sv.score | 0) || 0;
        S.kills = sv.kills | 0; S.headshots = sv.headshots | 0; S.shots = sv.shots | 0;
        if(sv.up && typeof sv.up === 'object') Object.assign(S.up, sv.up);
        resetFences();
        if (S.wave >= 3) S.strikeUnlocked = true;
        // Restaurar el vallado que el jugador había colocado y guardado
        if (Array.isArray(sv.built) && sv.built.length) {
          try {
            world.restoreCustomFences(sv.built);
            toast('VALLADO GUARDADO RESTAURADO · ' + sv.built.length + ' TRAMOS');
          } catch(e){ console.warn('restoreCustomFences fallo', e); }
        }
      }
    }
    try{ ent.spawnSoldier(-7, 3, 'VEGA'); }catch(e){ console.warn('spawnSoldier fallo', e); }
    S.screen = 'game'; S.playing = true; S.paused = false; S.shopOpen = false;
    for (const id of ['menu', 'pauseMenu', 'over', 'settingsMenu', 'shopMenu', 'helpMenu']) {
      const el = $(id);
      if (el) el.classList.add('hidden');
    }
    // Partida nueva: vista inicial mirando el corredor defensivo
    camYaw = 0; camPitch = CAM_BASE_PITCH;
    updateCursorState();
    requestLock(); // el clic de INICIAR/CONTINUAR/REINTENTAR es gesto de usuario
    radio('Aquí Puesto de Mando: posición elevada asegurada. Mantén la línea.', 'Posición de francotirador asegurada. Buena caza.');
    startWave(S.wave);
  }catch(e){
    console.error('startGame error', e);
    const eb = $('errbox');
    if(eb){ eb.style.display='block'; eb.textContent += '⚠ startGame: '+(e.message||e)+'\n'; }
    // Intentar limpiar tokens corruptos y reintentar una vez
    try{
      localStorage.removeItem('frtd_save_v1');
      localStorage.removeItem('frtd_set_v1');
      localStorage.removeItem('frtd_best_v1');
    }catch(err){}
    toast('ERROR AL INICIAR - TOKENS LIMPIADOS, REINTENTA');
  }
}
function gameOver() {
  if (!S.playing) return;
  S.playing = false; S.screen = 'over';
  setZoom(false);
  releaseLock();
  if (S.fenceEditMode) closeFenceEditor();
  updateCursorState();
  clearSave();
  try { speechSynthesis.cancel(); } catch (e) {}
  audio.siren(2);
  const isBest = S.score >= S.best && S.score > 0;
  const ot = $('overTitle'), ok = $('overKicker'), fs = $('finalScore'), fb = $('finalBest'), fw = $('finalWave'), fk = $('finalKills'), fh = $('finalHead'), fa = $('finalAcc'), nb = $('newBestTag'), ov = $('over');
  if (ot) ot.textContent = 'LA LÍNEA HA CAÍDO';
  if (ok) ok.textContent = 'SECTOR PERDIDO · OLEADA ' + fmt(S.wave);
  if (fs) fs.textContent = S.score;
  if (fb) fb.textContent = S.best;
  if (fw) fw.textContent = fmt(S.wave);
  if (fk) fk.textContent = S.kills;
  if (fh) fh.textContent = S.headshots;
  if (fa) fa.textContent = S.shots ? Math.round(S.hits / S.shots * 100) + '%' : '0%';
  if (nb) nb.style.display = isBest ? 'block' : 'none';
  if (ov) ov.classList.remove('hidden');
  updateMenuBest();
}
function toMenu() {
  S.screen = 'menu'; S.playing = false; S.paused = false; S.shopOpen = false;
  setZoom(false);
  releaseLock();
  if (S.fenceEditMode) closeFenceEditor();
  updateCursorState();
  audio.resume();
  for (const id of ['pauseMenu', 'over', 'settingsMenu', 'shopMenu', 'helpMenu']) {
    const el = $(id); if (el) el.classList.add('hidden');
  }
  const m = $('menu');
  if (m) m.classList.remove('hidden');
  updateMenuBest();
}
function updateMenuBest() {
  const mb = $('menuBest'), bc = $('btnContinue');
  if (mb) mb.textContent = 'RÉCORD LOCAL: ' + S.best + ' PTS';
  const sv = loadSave();
  if (bc) {
    bc.disabled = !sv;
    if (sv) {
      const n = Array.isArray(sv.built) ? sv.built.length : 0;
      bc.textContent = `CONTINUAR · OLEADA ${fmt(sv.wave)} · ${sv.score} PTS` + (n ? ` · ${n} VALLAS` : '');
    } else bc.textContent = 'CONTINUAR';
  }
}
function pauseGame() {
  if (!S.playing || S.screen !== 'game') return;
  if (S.shopOpen) { closeShop(); return; }
  if (S.paused) return;
  S.paused = true;
  S.firing = false;
  // Se suelta toda la entrada de movimiento para que nada siga avanzando al reanudar
  moveKeys.f = moveKeys.b = moveKeys.l = moveKeys.r = moveKeys.sprint = false;
  joy.active = false; joy.dx = joy.dy = joy.mag = 0; hideJoystick();
  setZoom(false);   // la mira no debe quedarse encima del menú de pausa
  releaseLock();    // el menú de pausa necesita el cursor visible
  updateCursorState();
  audio.suspend();  // congela música y efectos (AudioContext suspendido)
  try { speechSynthesis.cancel(); } catch (e) {}
  const pm = $('pauseMenu');
  if (pm) pm.classList.remove('hidden');
  const pt = $('pauseHint');
  if (pt) pt.textContent = `PARTIDA CONGELADA · OLEADA ${fmt(S.wave)} · ${S.score} PTS`;
}
function resumeGame() {
  if (!S.playing) return;
  S.paused = false; S.shopOpen = false;
  // el reloj no debe acumular el tiempo en pausa (ya se recorta a 0.05 s, pero se
  // descarta el delta pendiente para que no haya un salto al reanudar)
  try { clock.getDelta(); } catch (e) {}
  audio.resume();
  for (const id of ['pauseMenu', 'shopMenu', 'settingsMenu']) {
    const el = $(id); if (el) el.classList.add('hidden');
  }
  updateCursorState();
  if (lockAllowed()) requestLock();
}

// ---------------- ajustes ----------------
let settingsFrom = 'menu';
function openSettings(from) {
  settingsFrom = from;
  applySettingsToUI();
  const sm = $('settingsMenu');
  if (sm) sm.classList.remove('hidden');
}
function closeSettings() {
  const sm = $('settingsMenu');
  if (sm) sm.classList.add('hidden');
  saveSettings();
}
function applySettingsToUI() {
  const ss = $('setSens'), sv = $('sensVal');
  if (ss) ss.value = Math.round(S.settings.sens * 100);
  if (sv) sv.textContent = S.settings.sens.toFixed(1);
  const sa = $('setAimSens'), sav = $('aimSensVal');
  if (sa) sa.value = Math.round((S.settings.aimSens || 1.2) * 100);
  if (sav) sav.textContent = (S.settings.aimSens || 1.2).toFixed(1) + '×';
  const sm = $('setMaster'), mv = $('masterVal');
  if (sm) sm.value = S.settings.master; if (mv) mv.textContent = S.settings.master;
  const smu = $('setMusic'), muv = $('musicVal');
  if (smu) smu.value = S.settings.music; if (muv) muv.textContent = S.settings.music;
  const ssf = $('setSfx'), sfv = $('sfxVal');
  if (ssf) ssf.value = S.settings.sfx; if (sfv) sfv.textContent = S.settings.sfx;
  const sq = $('setQuality'); if (sq) sq.value = S.settings.quality;
  const svo = $('setVoice'); if (svo) svo.value = S.settings.voice;
  const sxi = $('setInvertX'); if (sxi) sxi.checked = !!S.settings.invertX;
  const syi = $('setInvertY'); if (syi) syi.checked = !!S.settings.invertY;
  const vxi = $('invertXVal'); if (vxi) vxi.textContent = S.settings.invertX ? 'SÍ' : 'NO';
  const vyi = $('invertYVal'); if (vyi) vyi.textContent = S.settings.invertY ? 'SÍ' : 'NO';
}
function applyQuality() {
  world.setQuality(S.settings.quality);
  fx.setQuality(S.settings.quality);
}

// ---------------- zoom telescópico con desenfoque periférico ----------------
function setZoom(v) {
  if (!S.playing || S.paused) v = false;
  if (S.zoomed === v) return;
  S.zoomed = v;
  world.setZoomed(v && S.curW <= 1);
  if (world.vm) {
    // Cuando el francotirador mira por la mira telescópica, ocultamos el viewmodel para optimizar recursos y despejar la visión
    world.vm.visible = !(v && S.curW === 0);
  }
  const sc = $('scopeView');
  const hud = $('hud');
  const btnScope = $('btnTouchScope');
  if (v) {
    audio.scopeIn();
    if (sc) sc.classList.remove('hidden');
    if (hud) hud.classList.add('hud-scoped');
    if (btnScope) btnScope.classList.add('active');
  } else {
    audio.scopeOut();
    if (sc) sc.classList.add('hidden');
    if (hud) hud.classList.remove('hud-scoped');
    if (btnScope) btnScope.classList.remove('active');
  }
  const ch = $('crosshair');
  if (ch) ch.style.setProperty('--sp', v ? '6px' : '14px');
  updateHUD();
}

// ---------------- entrada adaptativa (PC y Android) ----------------
const cvs = renderer.domElement;
// Detección de dispositivo táctil. Un portátil con pantalla táctil tiene
// 'ontouchstart' y maxTouchPoints > 0 pero su puntero PRINCIPAL es el ratón: debe
// recibir la interfaz de PC. Solo los dispositivos de puntero grueso (móvil,
// tableta) entran en el modo táctil; si aun así se toca la pantalla, el primer
// toque añade body.is-touch y aparecen los controles táctiles igualmente.
const _mq = (typeof matchMedia === 'function') ? matchMedia.bind(window) : null;
const _coarse = !!(_mq && _mq('(pointer: coarse)').matches);
const _fine = !!(_mq && _mq('(pointer: fine)').matches);
const _touchCapable = ('ontouchstart' in window) || ((navigator.maxTouchPoints | 0) > 0);
const isTouchDevice = _coarse || (_touchCapable && !_fine);
if (isTouchDevice) document.body.classList.add('is-touch');

// Ratón en PC
addEventListener('mousemove', e => {
  // S.aim se conserva por compatibilidad (debug), pero la cámara usa la
  // puntería RELATIVA 360° (applyLook) con la misma convención que el ratón
  // normal: derecha = mira a la derecha, arriba = mira hacia arriba.
  S.aim.x = (e.clientX / innerWidth) * 2 - 1;
  S.aim.y = -((e.clientY / innerHeight) * 2 - 1);
  if (isTouchDevice) return;
  if (!S.playing || S.paused || S.screen !== 'game') return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  if (dx || dy) applyLook(dx, dy, false);
});
cvs.addEventListener('mousedown', e => {
  if (e.button === 0 && S.fenceEditMode) { handleFenceEditorClick(); return; }
  if (e.button === 2 && S.fenceEditMode) { cycleFenceRotation(); return; }
  // Re-enganchar el puntero si se había soltado (por ejemplo tras mantener ALT)
  if (!isTouchDevice && !pointerLocked && lockAllowed()) requestLock();
  if (e.button === 0) { S.firing = true; tryFire(); }
  if (e.button === 2) setZoom(true);
});
addEventListener('mouseup', e => {
  if (e.button === 0) S.firing = false;
  if (e.button === 2) setZoom(false);
});
cvs.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => {
  if (!S.playing || S.paused) return;
  if (S.fenceEditMode) {
    cycleFenceRotation();
    return;
  }
  const d = e.deltaY > 0 ? 1 : -1;
  let i = S.curW;
  for (let k = 0; k < 4; k++) {
    i = (i + d + 4) % 4;
    if (S.wave >= WEAPONS[i].unlock) { switchWeapon(i); break; }
  }
}, { passive: true });

// Teclado en PC
addEventListener('keydown', e => {
  // ALT (PC): muestra el cursor mientras se mantiene pulsado
  if (e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'AltGraph') {
    if (!altHeld) {
      altHeld = true;
      if (pointerLocked) releaseLock();
      updateCursorState();
    }
    return;
  }
  const k0 = e.code;
  // Movimiento a pie (WASD / flechas / Shift para correr): se registra SIEMPRE,
  // incluso con repeticiones, para no perder el estado de la tecla.
  if (setMoveKey(k0, true)) {
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  const k = k0;
  if (k === 'Space') {
    e.preventDefault();
    if (S.fenceEditMode) { placeFenceAndStow(); return; }
    setZoom(true);
  }
  if (S.screen === 'menu') {
    if (k === 'Enter') startGame(true);
    return;
  }
  if (S.screen === 'over') {
    if (k === 'Enter') startGame(true);
    return;
  }
  if (k === 'Escape' || k === 'KeyP') {
    if (S.fenceEditMode) { closeFenceEditor(); return; }
    if (!$('settingsMenu').classList.contains('hidden')) closeSettings();
    else if (!$('helpMenu').classList.contains('hidden')) $('helpMenu').classList.add('hidden');
    else if (k === 'Escape' && S.zoomed) setZoom(false);   // ESC sale de la mira antes que pausar
    else if (S.paused && !S.shopOpen) resumeGame();
    else pauseGame();
    return;
  }
  if (k === 'KeyM') {
    audio.init();
    audio.setMuted(!audio.muted);
    $('btnMute').textContent = audio.muted ? '✕' : '♪';
    toast(audio.muted ? 'AUDIO SILENCIADO' : 'AUDIO ACTIVADO');
    return;
  }
  if (!S.playing || S.paused) return;
  if (k === 'KeyV') {
    toggleFenceEditor();
    return;
  }
  if (S.fenceEditMode) {
    if (k === 'KeyR') { cycleFenceRotation(); return; }
    if (k === 'KeyH') { toggleFencePanel(); return; }
    if (k === 'Enter') { placeFenceAndStow(); return; }
    if (k === 'Digit1') { setFenceEditorModel('chain_link'); return; }
    if (k === 'Digit2') { setFenceEditorModel('tileable'); return; }
    if (k === 'Digit3') { setFenceEditorModel('concrete'); return; }
    if (k === 'Digit4') { setFenceEditorModel('metal'); return; }
    if (k === 'KeyE') { setFenceTool('build'); return; }
    if (k === 'KeyX') { setFenceTool('demolish'); return; }
  }
  if (k === 'Digit1') switchWeapon(0);
  else if (k === 'Digit2') switchWeapon(1);
  else if (k === 'Digit3') switchWeapon(2);
  else if (k === 'Digit4') switchWeapon(3);
  else if (k === 'KeyE' || k === 'KeyC') deployTurret();
  else if (k === 'KeyL') deployBoat();
  else if (k === 'KeyQ') cycleSpec();
  else if (k === 'KeyR') startReload(S.curW);
  else if (k === 'KeyF') repairFence();
  else if (k === 'KeyB') openShop();
  else if (k === 'KeyT') callStrike();
  else if (k === 'Enter' && S.intermission) startWave(S.wave + 1);
});
addEventListener('keyup', e => {
  if (setMoveKey(e.code, false)) return;
  if (e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'AltGraph') {
    if (altHeld) {
      altHeld = false;
      updateCursorState();
      if (lockAllowed()) requestLock(); // re-enganchar el puntero (el gesto aún está activo)
    }
    return;
  }
  if (e.code === 'Space') setZoom(false);
});

// ---------------- ENTRADA TÁCTIL UNIFICADA (móvil) ----------------
// Un único gestor a nivel de ventana decide, para cada dedo nuevo, si cae en la
// zona de movimiento (mitad izquierda → joystick) o en la de puntería (resto de
// la pantalla libre). Las capas #touchAimPad y #moveZone son solo visuales
// (pointer-events:none), así que nada bloquea el ratón en PC ni depende del
// z-index: los toques que empiezan sobre un botón o un menú se ignoran aquí.
const aimTouch = { id: null, x: 0, y: 0, tapX: 0, tapY: 0, tapT: 0, moved: false };
const MOVE_ZONE_FRAC = 0.44;   // mitad izquierda = zona de movimiento
const JOY_R = 58;              // radio útil del joystick en px

function showJoystick() { const b = $('joyBase'); if (b) b.classList.add('show'); }
function hideJoystick() {
  const b = $('joyBase'); if (b) b.classList.remove('show');
  const k = $('joyKnob'); if (k) k.style.transform = 'translate(-50%,-50%)';
}
function positionJoy(cx, cy, dx, dy) {
  const b = $('joyBase');
  if (b) { b.style.left = cx + 'px'; b.style.top = cy + 'px'; }
  const k = $('joyKnob');
  if (k) k.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
}

const UI_TOUCH_SELECTOR = 'button, .tbtn, .wbtn, .slot, .ib-btn, .iconbtn, .fe-card,' +
  ' .fe-btn-rot, .fe-btn-tool, .fe-btn-place, .fe-btn-time, .fe-fab-btn, .fe-fab-place,' +
  ' .action, .screen, #fenceEditorHUD, #feFab, #interBar';

function touchStartsOnUI(t) {
  const el = document.elementFromPoint(t.clientX, t.clientY);
  if (!el) return true;
  if (el === cvs || el === document.body || el.id === 'hud' || el.id === 'world' ||
      el.id === 'touchAimPad' || el.id === 'moveZone') return false;
  return !!(el.closest && el.closest(UI_TOUCH_SELECTOR));
}

function touchPlayActive() {
  return S.playing && !S.paused && S.screen === 'game' && !modalsOpen();
}

addEventListener('touchstart', e => {
  // Defensa: algún WebView/herramienta de accesibilidad puede disparar un evento
  // táctil sintético sin changedTouches; sin esta guarda el bucle petaría.
  if (!e || !e.changedTouches) return;
  if (!document.body.classList.contains('is-touch')) document.body.classList.add('is-touch');
  if (!touchPlayActive()) return;
  for (const t of e.changedTouches) {
    if (touchStartsOnUI(t)) continue;
    const inMoveZone = t.clientX < innerWidth * MOVE_ZONE_FRAC;
    if (inMoveZone && joy.id === null) {
      // el joystick aparece justo donde apoyas el pulgar
      joy.id = t.identifier; joy.active = true;
      joy.ox = t.clientX; joy.oy = t.clientY;
      joy.dx = 0; joy.dy = 0; joy.mag = 0;
      positionJoy(joy.ox, joy.oy, 0, 0);
      showJoystick();
    } else if (aimTouch.id === null) {
      // resto de la pantalla (o la izquierda si el joystick ya está en uso): puntería
      aimTouch.id = t.identifier;
      aimTouch.x = t.clientX; aimTouch.y = t.clientY;
      aimTouch.tapX = t.clientX; aimTouch.tapY = t.clientY;
      aimTouch.tapT = performance.now(); aimTouch.moved = false;
    } else continue;
    if (e.cancelable) e.preventDefault();
  }
}, { passive: false });

addEventListener('touchmove', e => {
  if (!e || !e.changedTouches) return;
  if (!touchPlayActive()) return;
  for (const t of e.changedTouches) {
    if (joy.id !== null && t.identifier === joy.id) {
      let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
      joy.dx = dx / JOY_R; joy.dy = dy / JOY_R; joy.mag = Math.min(1, d / JOY_R);
      positionJoy(joy.ox, joy.oy, dx, dy);
      if (e.cancelable) e.preventDefault();
    } else if (aimTouch.id !== null && t.identifier === aimTouch.id) {
      const dx = t.clientX - aimTouch.x, dy = t.clientY - aimTouch.y;
      // distinguir TOC corto (colocar valla) de arrastre (girar la vista)
      if (Math.hypot(t.clientX - aimTouch.tapX, t.clientY - aimTouch.tapY) > 12) aimTouch.moved = true;
      aimTouch.x = t.clientX; aimTouch.y = t.clientY;
      applyLook(dx, dy, true);
      if (e.cancelable) e.preventDefault();
    }
  }
}, { passive: false });

function endTouches(e) {
  if (!e || !e.changedTouches) return;
  for (const t of e.changedTouches) {
    if (joy.id !== null && t.identifier === joy.id) {
      joy.id = null; joy.active = false; joy.dx = 0; joy.dy = 0; joy.mag = 0;
      hideJoystick();          // el joystick desaparece al soltar
    } else if (aimTouch.id !== null && t.identifier === aimTouch.id) {
      if (S.fenceEditMode && !aimTouch.moved && (performance.now() - aimTouch.tapT) < 350) {
        handleFenceEditorClick();
      }
      aimTouch.id = null;
    }
  }
}
addEventListener('touchend', endTouches, { passive: true });
addEventListener('touchcancel', endTouches, { passive: true });

// ---------------- SELECTOR DE ARMA TÁCTIL (botones grandes, no se colapsan) ----------------
// Sustituye a las ranuras diminutas del HUD: 4 botones de 46 px en una rejilla 2×2
// junto al botón de fuego, siempre visibles y separados para el pulgar.
function renderTouchWeapons() {
  const bar = $('touchWeaponBar');
  if (!bar) return;
  bar.innerHTML = '';
  WEAPONS.forEach((w, i) => {
    const locked = S.wave < w.unlock;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wbtn' + (i === S.curW ? ' sel' : '') + (locked ? ' locked' : '');
    b.setAttribute('aria-label', w.name);
    b.innerHTML = '<i>' + (locked ? '🔒' : w.icon) + '</i><small>' + (i + 1) + '</small>';
    let touched = false;
    const fn = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      touched = true;
      setTimeout(() => { touched = false; }, 400);
      if (!S.playing || S.paused) return;
      if (locked) { try { audio.denied(); } catch (err) {} toast('ARMA BLOQUEADA · OLEADA ' + w.unlock); return; }
      switchWeapon(i);
    };
    b.addEventListener('touchstart', fn, { passive: false });
    b.addEventListener('click', e => { if (touched) { e.preventDefault(); return; } fn(e); });
    bar.appendChild(b);
  });
}

// Botones táctiles específicos - manejo robusto de tokens táctiles y fallback a click
function bindTouchBtn(id, fn, opts){
  const el = $(id);
  if(!el) return;
  opts = opts || {};
  let touchActive = false;
  el.addEventListener('touchstart', e=>{
    e.preventDefault();
    touchActive = true;
    try{ fn(e); }catch(err){ console.warn(id, err); }
    // Evitar que el click fantasma dispare dos veces
    setTimeout(()=>{ touchActive=false; }, 400);
  }, {passive:false});
  if(opts.end !== false){
    el.addEventListener('touchend', e=>{ e.preventDefault(); if(opts.onEnd) opts.onEnd(e); }, {passive:false});
  }
  el.addEventListener('click', e=>{
    if(touchActive) { e.preventDefault(); return; }
    try{ fn(e); }catch(err){ console.warn(id, err); }
  });
}

bindTouchBtn('btnTouchFire', ()=>{ S.firing=true; tryFire(); }, {
  onEnd: ()=>{ S.firing=false; }
});
// Sobrescribir el comportamiento de fin de fuego para que siempre pare
(function(){
  const el = $('btnTouchFire');
  if(el){
    el.addEventListener('touchend', e=>{ e.preventDefault(); S.firing=false; }, {passive:false});
    el.addEventListener('touchcancel', e=>{ S.firing=false; }, {passive:true});
  }
})();

bindTouchBtn('btnTouchScope', ()=> setZoom(!S.zoomed));
// Botón dentro de la propia mira telescópica para quitarla sin soltar el ratón/el dedo
bindTouchBtn('btnScopeExit', ()=> setZoom(false));
bindTouchBtn('btnTouchReload', ()=> startReload(S.curW));
bindTouchBtn('btnTouchTurret', ()=> deployTurret());
bindTouchBtn('btnTouchBoat', ()=> deployBoat());
bindTouchBtn('btnTouchRepair', ()=> repairFence());
bindTouchBtn('btnTouchStrike', ()=> callStrike());
bindTouchBtn('btnTouchAmmo', ()=> cycleSpec());
bindTouchBtn('btnTouchFence', ()=> toggleFenceEditor());

// Pantalla completa (Android / Móvil)
const btnFs = $('btnFullscreen');
if (btnFs) {
  const fsFn = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };
  btnFs.onclick = fsFn;
  btnFs.addEventListener('touchstart', e=>{ e.preventDefault(); fsFn(); }, {passive:false});
}

// Helper para botones estándar con soporte táctil robusto (evita bloqueo por tokens táctiles)
function bindBtn(id, fn){
  const el = $(id);
  if(!el) { console.warn('Botón no encontrado:', id); return; }
  let touched = false;
  el.addEventListener('touchstart', e=>{
    e.preventDefault();
    touched = true;
    try{ fn(e); }catch(err){ console.error(id, err); }
    setTimeout(()=> touched=false, 500);
  }, {passive:false});
  el.addEventListener('click', e=>{
    if(touched) return;
    try{ fn(e); }catch(err){ console.error(id, err); }
  });
  // Guardar referencia para fallback de index.html
  el._originalClick = fn;
}

bindBtn('btnStart', () => { try{ audio.init(); audio.click(); }catch(e){} startGame(true); });
bindBtn('btnContinue', () => { try{ audio.init(); audio.click(); }catch(e){} startGame(false); });
bindBtn('btnRetry', () => { try{ audio.click(); }catch(e){} startGame(true); });
bindBtn('btnMenu', () => { try{ audio.click(); }catch(e){} toMenu(); });
bindBtn('btnResume', () => { try{ audio.click(); }catch(e){} resumeGame(); });
bindBtn('btnSaveExit', () => { saveGame(); try{ audio.click(); }catch(e){} toMenu(); });
bindBtn('btnSettings', () => { try{ audio.init(); audio.click(); }catch(e){} openSettings('menu'); });
bindBtn('btnSettings2', () => { try{ audio.click(); }catch(e){} openSettings('pause'); });
bindBtn('btnCloseSettings', () => { try{ audio.click(); }catch(e){} closeSettings(); });
bindBtn('btnHelp', () => { try{ audio.init(); audio.click(); }catch(e){} const hm=$('helpMenu'); if(hm) hm.classList.remove('hidden'); });
bindBtn('btnCloseHelp', () => { try{ audio.click(); }catch(e){} const hm=$('helpMenu'); if(hm) hm.classList.add('hidden'); });
bindBtn('btnShop', () => { try{ audio.click(); }catch(e){} openShop(); });
bindBtn('btnShopTop', () => { try{ audio.click(); }catch(e){} openShop(); });
bindBtn('btnShop2', () => { try{ audio.click(); }catch(e){} const pm=$('pauseMenu'); if(pm) pm.classList.add('hidden'); openShop(); });
bindBtn('btnCloseShop', () => { try{ audio.click(); }catch(e){} closeShop(); });
bindBtn('btnTurret', () => deployTurret());
bindBtn('btnRepair', () => repairFence());
bindBtn('btnStrike', () => callStrike());
bindBtn('btnNextWave', () => { try{ audio.click(); }catch(e){} if (S.intermission) startWave(S.wave + 1); });
bindBtn('btnFenceAction', () => toggleFenceEditor());
bindBtn('btnEditFence', () => openFenceEditor());
bindBtn('btnExtendTime', () => extendIntermissionTime(30, 50));
bindBtn('feExtendTime', () => extendIntermissionTime(30, 50));
bindBtn('btnCloseFenceEditor', () => closeFenceEditor());
// Barra flotante del editor: COLOCAR (y apartar el menú), ROTAR, MODO, MENÚ, SALIR
bindBtn('fePlaceFloat', () => placeFenceAndStow());
bindBtn('feFabRot', () => cycleFenceRotation());
bindBtn('feFabTool', () => cycleFenceTool());
bindBtn('feFabPanel', () => toggleFencePanel());
bindBtn('feFabExit', () => closeFenceEditor());
bindBtn('feStowBtn', () => toggleFencePanel());
// Pausa también en grande para el pulgar (además del icono de la barra superior)
bindBtn('btnTouchPause', () => { S.paused ? resumeGame() : pauseGame(); });

// Tarjetas del catálogo de vallas: se identifican por data-type (las tarjetas de
// index.html NO tienen id; el antiguo vínculo por id era la causa del "no hace nada").
document.querySelectorAll('#feModels .fe-card').forEach(card => {
  const type = card.getAttribute('data-type');
  if (!type) return;
  card.style.pointerEvents = 'auto';
  card.addEventListener('click', () => setFenceEditorModel(type));
  card.addEventListener('touchstart', e => {
    e.preventDefault();
    e.stopPropagation();
    setFenceEditorModel(type);
  }, { passive: false });
});

// Botones de rotación: por data-rot (misma causa que las tarjetas).
document.querySelectorAll('#feRotBtns .fe-btn-rot').forEach(btn => {
  const r = parseFloat(btn.getAttribute('data-rot'));
  if (isNaN(r)) return;
  btn.style.pointerEvents = 'auto';
  btn.addEventListener('click', () => setFenceRotation(r));
  btn.addEventListener('touchstart', e => {
    e.preventDefault();
    e.stopPropagation();
    setFenceRotation(r);
  }, { passive: false });
});

// Botón COLOCAR del panel del editor
bindBtn('fePlaceBtn', () => handleFenceEditorClick());

bindBtn('feToolBuild', () => setFenceTool('build'));
bindBtn('feToolDemolish', () => setFenceTool('demolish'));
bindBtn('feToolRepair', () => setFenceTool('repair'));

bindBtn('btnPause', () => { S.paused ? resumeGame() : pauseGame(); });
bindBtn('btnMute', () => {
  try{ audio.init(); }catch(e){}
  try{
    audio.setMuted(!audio.muted);
    const bm=$('btnMute'); if(bm) bm.textContent = audio.muted ? '✕' : '♪';
  }catch(e){}
});

// Sliders
$('setSens').oninput = e => { S.settings.sens = e.target.value / 100; $('sensVal').textContent = S.settings.sens.toFixed(1); saveSettings(); };
if ($('setAimSens')) $('setAimSens').oninput = e => {
  S.settings.aimSens = e.target.value / 100;
  const v = $('aimSensVal'); if (v) v.textContent = S.settings.aimSens.toFixed(1) + '×';
  saveSettings();
};
$('setMaster').oninput = e => { S.settings.master = +e.target.value; $('masterVal').textContent = S.settings.master; audio.setVol('master', S.settings.master / 100); saveSettings(); };
$('setMusic').oninput = e => { S.settings.music = +e.target.value; $('musicVal').textContent = S.settings.music; audio.setVol('music', S.settings.music / 100); saveSettings(); };
$('setSfx').oninput = e => { S.settings.sfx = +e.target.value; $('sfxVal').textContent = S.settings.sfx; audio.setVol('sfx', S.settings.sfx / 100); saveSettings(); };
$('setQuality').onchange = e => { S.settings.quality = e.target.value; applyQuality(); saveSettings(); };
$('setVoice').onchange = e => { S.settings.voice = e.target.value; audio.voiceOn = S.settings.voice === 'on'; saveSettings(); };
// Inversión de la puntería (desactivada por defecto: ratón/dedo en dirección natural)
if ($('setInvertX')) $('setInvertX').onchange = e => { S.settings.invertX = e.target.checked; const v = $('invertXVal'); if (v) v.textContent = S.settings.invertX ? 'SÍ' : 'NO'; saveSettings(); toast('INVERSIÓN HORIZONTAL: ' + (S.settings.invertX ? 'SÍ' : 'NO')); };
if ($('setInvertY')) $('setInvertY').onchange = e => { S.settings.invertY = e.target.checked; const v = $('invertYVal'); if (v) v.textContent = S.settings.invertY ? 'SÍ' : 'NO'; saveSettings(); toast('INVERSIÓN VERTICAL: ' + (S.settings.invertY ? 'SÍ' : 'NO')); };
document.addEventListener('visibilitychange', () => { if (document.hidden && S.playing && !S.paused) pauseGame(); });
addEventListener('blur', () => {
  moveKeys.f = moveKeys.b = moveKeys.l = moveKeys.r = moveKeys.sprint = false;
  joy.active = false; joy.dx = joy.dy = joy.mag = 0; hideJoystick();
  S.firing = false;
});

// ---------------- clima ----------------
function updateStorm(dt) {
  S.stormT -= dt;
  if (S.stormState === 'calm') {
    S.storm = Math.max(0, S.storm - dt * 0.2);
    if (S.stormT <= 0) {
      S.stormState = 'warn';
      S.stormT = 5;
      toast('⛈ TORMENTA EN CAMINO ⛈');
      radio('Tormenta acercándose al sector. Visibilidad reducida.', 'Tormenta en camino.');
      audio.siren(1);
    }
  } else if (S.stormState === 'warn') {
    if (S.stormT <= 0) {
      S.stormState = 'storm'; S.stormT = rand(22, 32); S.nextBolt = 1;
      toast('⛈ TORMENTA SOBRE EL SECTOR ⛈');
    }
  } else {
    S.storm = Math.min(1, S.storm + dt * 0.3);
    S.nextBolt -= dt;
    if (S.nextBolt <= 0) {
      S.nextBolt = rand(1.8, 6.5);
      S.lightning = 1;
      audio.thunder(rand(0.3, 1.6));
    }
    if (S.stormT <= 0) {
      S.stormState = 'calm'; S.stormT = rand(50, 90);
      radio('La tormenta amaina. Buen trabajo, operador.', 'Tormenta amainando.');
    }
  }
  S.lightning = Math.max(0, S.lightning - dt * 5);
}

// ---------------- cámara / puntería 360° desde la torre elevada ----------------
// Yaw ILIMITADO (360° completos) y pitch con recorrido amplio (de mirar casi al
// horizonte/al cielo a mirar de lleno al pie de la torre). La puntería es
// RELATIVA al movimiento del ratón/dedo, con la convención estándar:
//   ratón a la derecha → la vista gira a la derecha
//   ratón hacia arriba → la vista sube
// Sin invertir ninguna dirección por defecto (AJUSTES permite invertir X e Y).
const FENCE_Z = -1;
const CAM_BASE_PITCH = -Math.atan2(SNIPER_EYE.y, SNIPER_EYE.z - FENCE_Z) * 0.72; // ≈ -16.5°
const CAM_PITCH_MIN = -1.45, CAM_PITCH_MAX = 1.15;
let camYaw = 0, camPitch = CAM_BASE_PITCH, camFov = 62;

// ---- cursor / pointer lock (PC) ----
// En combate el puntero queda OCULTO (estilo pointer lock). Mantener ALT lo
// muestra para alcanzar botones de pantalla; al soltarlo (o al volver a hacer
// clic) se vuelve a ocultar/enganchar.
let pointerLocked = false;
let altHeld = false;
function modalsOpen() {
  return ['menu', 'pauseMenu', 'shopMenu', 'settingsMenu', 'helpMenu', 'over'].some(id => {
    const el = $(id);
    return el && !el.classList.contains('hidden');
  });
}
function lockAllowed() {
  return !isTouchDevice && S.playing && !S.paused && S.screen === 'game'
    && !modalsOpen() && !S.fenceEditMode && !altHeld;
}
function requestLock() {
  if (!lockAllowed() || pointerLocked) return;
  try {
    const p = cvs.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* el navegador puede denegar el lock; el cursor visible sigue funcionando */ }
}
let unlockIntentional = false;
function releaseLock() {
  unlockIntentional = true;
  if (pointerLocked && document.exitPointerLock) {
    try { document.exitPointerLock(); } catch (e) {}
  }
}
document.addEventListener('pointerlockchange', () => {
  const was = pointerLocked;
  pointerLocked = (document.pointerLockElement === cvs);
  updateCursorState();
  // ESC libera el bloqueo del puntero y el navegador se come la tecla (no llega al
  // juego). Si el bloqueo se pierde en pleno combate sin que nadie lo pida, se
  // pausa la partida: así "pausa" siempre detiene el juego.
  if (was && !pointerLocked && !unlockIntentional && S.playing && !S.paused
      && S.screen === 'game' && !modalsOpen() && !S.fenceEditMode) {
    pauseGame();
  }
  unlockIntentional = false;
});
document.addEventListener('pointerlockerror', () => {
  pointerLocked = false;
  updateCursorState();
});
function updateCursorState() {
  const hide = !isTouchDevice && S.playing && !S.paused && S.screen === 'game'
    && !modalsOpen() && !S.fenceEditMode && !altHeld;
  document.body.classList.toggle('hide-cursor', hide);
}

// Aplica un delta de puntería (px) a la cámara 360°.
function applyLook(dx, dy, touch) {
  if (!S.playing || S.paused || S.screen !== 'game') return;
  if (S.shopOpen) return;
  const w = WEAPONS[S.curW];
  const zl = S.zoomed ? (S.curW === 0 ? rifleZoom() : w.zoom) : 1;
  // Antes se dividía por el aumento completo (4.5×-9×) y apuntar con la mira puesta
  // iba lentísimo. Ahora el divisor es una potencia fraccionaria y se aplica la
  // sensibilidad de mira de AJUSTES: el zoom sigue siendo preciso pero ágil.
  const zoomDiv = Math.pow(zl, 0.62);
  const aimBoost = S.zoomed ? (S.settings.aimSens || 1.2) : 1;
  const base = (touch ? 0.0068 : 0.0022) * S.settings.sens * aimBoost / zoomDiv;
  const ix = S.settings.invertX ? -1 : 1;
  const iy = S.settings.invertY ? -1 : 1;
  camYaw -= dx * base * ix;
  camPitch -= dy * base * iy;
  camPitch = clamp(camPitch, CAM_PITCH_MIN, CAM_PITCH_MAX);
}

function updateAim(dt) {
  const w = WEAPONS[S.curW];
  const zl = S.zoomed ? (S.curW === 0 ? rifleZoom() : w.zoom) : 1;
  const targetFov = 62 / zl;
  camFov += (targetFov - camFov) * Math.min(1, dt * 10);
  camera.fov = camFov;
  camera.updateProjectionMatrix();
  S.trauma = Math.max(0, S.trauma - dt * 1.6);
  const sh = S.trauma * S.trauma;
  camera.rotation.y = camYaw + (Math.random() - 0.5) * sh * 0.08;
  camera.rotation.x = camPitch + (Math.random() - 0.5) * sh * 0.08;
  camera.rotation.z = (Math.random() - 0.5) * sh * 0.025;
}

// ---------------- JUGADOR A PIE: WASD (PC) + JOYSTICK VIRTUAL (MÓVIL) ----------------
// El tirador ya no está clavado en el nido: recorre las 4 plantas de la torre,
// sube y baja por la caja de escaleras y puede pisar el suelo de nuestro lado de
// la frontera. La altura del apoyo la resuelve world.sampleWalk() sobre las
// superficies registradas al construir la torre (plantas, rellanos, puentes y
// tramos de escalera), así que las escaleras son funcionales de verdad: se sube
// caminando y no se puede uno caer por los bordes.
const PLAYER_EYE = EYE_HEIGHT;
const WALK_SPEED = 3.15, WALK_SPRINT = 5.4;
const player = {
  x: SNIPER_EYE.x, z: SNIPER_EYE.z,
  feet: FLOOR_Y.nido, y: SNIPER_EYE.y,
  floor: 1, label: 'NIDO · P1', moving: false, sprint: false,
  phase: 0, bob: 0, grounded: false,
};
const moveKeys = { f: false, b: false, l: false, r: false, sprint: false };
const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };

function floorInfoFor(feetY) {
  if (feetY < 1.2) return { id: 0, label: 'BASE · P0' };
  if (feetY < FLOOR_Y.nido - 1.7) return { id: -1, label: 'ESCALERA' };
  if (feetY < FLOOR_Y.obs - 1.7) return { id: 1, label: 'NIDO · P1' };
  if (feetY < FLOOR_Y.vigia - 1.7) return { id: 2, label: 'OBSERVATORIO · P2' };
  return { id: 3, label: 'VIGÍA · P3' };
}
function updateFloorHUD(force) {
  const el = $('floorVal');
  if (el) el.textContent = player.label;
  const warn = $('groundWarn');
  if (warn) warn.classList.toggle('show', !!player.grounded && S.playing && !S.paused);
  const hv = $('moveHintVal');
  if (hv) hv.textContent = isTouchDevice ? 'JOYSTICK IZQ.' : 'W A S D';
  if (force && el) el.classList.add('bump');
  if (force) setTimeout(() => { const e2 = $('floorVal'); if (e2) e2.classList.remove('bump'); }, 260);
}
function resetPlayer() {
  player.x = SNIPER_EYE.x; player.z = SNIPER_EYE.z;
  player.feet = FLOOR_Y.nido; player.y = SNIPER_EYE.y;
  player.moving = false; player.bob = 0; player.phase = 0; player.grounded = false;
  moveKeys.f = moveKeys.b = moveKeys.l = moveKeys.r = moveKeys.sprint = false;
  joy.active = false; joy.id = null; joy.dx = joy.dy = joy.mag = 0;
  hideJoystick();
  const info = floorInfoFor(player.feet);
  player.floor = info.id; player.label = info.label;
  camera.position.set(player.x, player.y, player.z);
  updateFloorHUD();
}
function setMoveKey(code, down) {
  switch (code) {
    case 'KeyW': case 'ArrowUp': moveKeys.f = down; return true;
    case 'KeyS': case 'ArrowDown': moveKeys.b = down; return true;
    case 'KeyA': case 'ArrowLeft': moveKeys.l = down; return true;
    case 'KeyD': case 'ArrowRight': moveKeys.r = down; return true;
    case 'ShiftLeft': case 'ShiftRight': moveKeys.sprint = down; return true;
    default: return false;
  }
}
function updatePlayer(dt) {
  let ix = (moveKeys.r ? 1 : 0) - (moveKeys.l ? 1 : 0);
  let iz = (moveKeys.b ? 1 : 0) - (moveKeys.f ? 1 : 0);
  if (joy.active && joy.mag > 0.14) { ix += joy.dx; iz += joy.dy; }
  const mag = Math.hypot(ix, iz);
  const moving = mag > 0.08;
  player.sprint = !!moveKeys.sprint;
  if (moving) {
    const n = Math.max(1, mag);
    const ux = ix / n, uz = iz / n;
    const speed = (player.sprint ? WALK_SPRINT : WALK_SPEED) * Math.min(1, mag);
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    // delante = -Z local de la cámara; derecha = +X local (misma convención que la vista)
    const fwd = -uz, str = ux;
    const dx = (-sy * fwd + cy * str) * speed * dt;
    const dz = (-cy * fwd - sy * str) * speed * dt;
    const px = player.x, pz = player.z, py = player.feet;
    const s2 = world.sampleWalk(px + dx, pz + dz, py);
    if (s2 && !world.walkBlocked(px + dx, pz + dz, s2.y)) {
      player.x = px + dx; player.z = pz + dz; player.feet = s2.y;
    } else {
      // deslizamiento por el borde (barandillas, parapetos, pilares, sacos)
      const sa = world.sampleWalk(px + dx, pz, py);
      if (sa && !world.walkBlocked(px + dx, pz, sa.y)) { player.x = px + dx; player.feet = sa.y; }
      const sb = world.sampleWalk(player.x, pz + dz, py);
      if (sb && !world.walkBlocked(player.x, pz + dz, sb.y)) { player.z = pz + dz; player.feet = sb.y; }
    }
  }
  player.moving = moving;
  const wasGrounded = player.grounded;
  player.grounded = player.feet < 1.2;
  player.phase += dt * (moving ? (player.sprint ? 11.5 : 8.2) : 0);
  const bobT = moving ? Math.sin(player.phase) * 0.042 : 0;
  player.bob += (bobT - player.bob) * Math.min(1, dt * 12);
  const eyeY = player.feet + PLAYER_EYE + player.bob;
  player.y += (eyeY - player.y) * Math.min(1, dt * 18);
  camera.position.set(player.x, player.y, player.z);
  const info = floorInfoFor(player.feet);
  if (info.label !== player.label) {
    player.label = info.label; player.floor = info.id;
    updateFloorHUD(true);
    if (info.id >= 0 && S.playing && !S.paused) {
      try { audio.click(); } catch (e) {}
      toast('PLANTA: ' + info.label);
    }
  }
  if (player.grounded !== wasGrounded) updateFloorHUD();
}

// ---------------- bucle principal ----------------
const clock = new THREE.Clock();
let fpsN = 0, fpsT = 0, hudT = 0;
let menuT = 0;
function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(0.05, clock.getDelta());
  // PAUSA REAL: con la partida en pausa (o con cualquier menú modal abierto) no
  // avanza NADA: ni entidades, ni proyectiles, ni clima, ni agua, ni helicóptero,
  // ni audio. Solo se redibuja el fotograma congelado detrás del menú.
  const frozen = S.paused || modalsOpen();
  const paused = frozen || !S.playing;
  const dt = paused ? 0 : rawDt;

  if (dt > 0) {
    S.time += dt;
    S.dayT = (S.dayT + dt / 240) % 1;
    updateStorm(dt);

    // Aparición escalonada
    if (S.pendingSpawns.length) {
      S.spawnT -= dt;
      const alive = ent.aliveCount();
      if (S.spawnT <= 0 && alive < 30) {
        S.spawnT = 0.45;
        for (let k = 0; k < 3 && S.pendingSpawns.length && ent.aliveCount() < 32; k++) {
          const t = S.pendingSpawns.shift();
          ent.wave = S.wave;
          // Corredor terrestre entre la orilla y el flanco este; los objetivos
          // llegan desde el horizonte (z ≈ -45) por la playa hasta las vallas.
          // Los roles de mar reposicionan su aparición en el agua dentro de spawn().
          const isBoss = (t === 'boss');
          const isTitano = isBoss && (S.wave % 10 === 0);
          // PERÍMETRO DE APARICIÓN: se calcula desde la valla MÁS ALEJADA de nuestro
          // lado (las 3 capas base o las que haya colocado el jugador). Nada —ni los
          // jefes— puede aparecer al sur de esa línea.
          const front = frontLineZ();
          const opt = { frontZ: front };
          if (isBoss) opt.bossVariant = isTitano ? 'titanosaurus' : 'carnotaurus';
          const spawnX = isBoss ? rand(SHORE_X + 6, FENCE_X1 - 4) : rand(FENCE_X0, FENCE_X1);
          const spawnZ = isBoss ? front - rand(20, 34) : front - rand(11, 26);
          const z = ent.spawn(t, spawnX, Math.min(spawnZ, -18), opt);
          if (t === 'boss') {
            const bb = $('bossbar');
            if (bb) bb.style.display = 'block';
          }
        }
        updateHUD();
      }
    }

    // Alerta de ametralladoras cuando se acumulan demasiados zombis
    const aliveZombies = ent.aliveCount();
    if (aliveZombies >= 5 && ent.turrets.length < 4 && S.time - S._lastTurretAlert > 24) {
      S._lastTurretAlert = S.time;
      toast('⚠ HORDA MASIVA: DESPLIEGA AMETRALLADORAS AUTÓNOMAS CON [E]');
      radio('¡Demasiados infectados para un solo tirador! Despliega ametralladoras autónomas con E.', 'Despliega ametralladoras con E.');
    }

    // Fin de oleada
    if (!S.intermission && !S.pendingSpawns.length && ent.aliveCount() === 0 && S.playing) endWave();
    if (S.intermission) {
      S.interT -= dt;
      const it = $('interText');
      if (it) it.textContent = `OLEADA ${fmt(S.wave)} SUPERADA · SIGUIENTE EN ${Math.max(0, Math.ceil(S.interT))}s`;
      if (S.interT <= 0) startWave(S.wave + 1);
    }

    // Armas: cds y recargas
    S.wstate.forEach((ws, i) => {
      if (ws.cd > 0) ws.cd -= dt;
      if (ws.reloading) {
        ws.reloadT -= dt;
        if (i === S.curW) {
          const rf = $('reloadFill');
          if (rf) rf.style.width = (100 * (1 - ws.reloadT / (WEAPONS[i].reload * reloadMult()))) + '%';
        }
        if (ws.reloadT <= 0) {
          ws.reloading = false; ws.ammo = magSize(i);
          if (i === S.curW) {
            const rw = $('reloadWrap');
            if (rw) rw.style.display = 'none';
            toast('ARMA LISTA');
          }
          updateHUD();
        }
      }
    });

    if (S.switchT > 0) S.switchT -= dt;
    if (S.firing && S.curW === 1) tryFire();
    if (S.strikeCd > 0) { S.strikeCd -= dt; if ((S.strikeCd * 2 | 0) % 2 === 0) updateHUD(); }
    if (S.time - S.lastHurt > 5 && S.hp < 100) S.hp = Math.min(100, S.hp + 4 * dt);

    // Actualización de entidades (zombis, torretas, civiles, soldados, lanchas, piedras)
    ent.update(dt, S.time, {
      fences: S.fences,
      placedFences: world.placedFences,
      fenceAlive: S.fences.some(f => f.alive) || (world.placedFences && world.placedFences.some(f => f.alive)),
      playerPos: camera.position,
      playerGrounded: player.grounded,
      towerBase: TOWER_ASSAULT,
      extract: { x: 26, z: 2 },
    });

    updateProjectiles(dt);
    updatePlayer(dt);
    world.fenceVisual(fenceFracs());

    const hd = world.heliPosV.distanceTo(camera.position);
    audio.setRotor(clamp(1 - hd / 120, 0, 1) * (world.heliTask ? 1.4 : 1));
    if (Math.random() < dt * 0.5 && ent.aliveCount() > 0) audio.groan(false);

    updateAim(dt);

    // Telemetría en la mira telescópica en tiempo real
    if (S.zoomed) {
      const hit = rayHit(180);
      const rEl = $('scopeRng'), tEl = $('scopeTarget'), mEl = $('scopeMag');
      if (rEl) rEl.innerHTML = `RNG: <b>${Math.round(hit.dist)}M</b>`;
      if (tEl) {
        if (hit.target && !hit.target.dead) {
          tEl.innerHTML = `BLANCO: <b style="color:${hit.head ? '#ff5470' : '#7cf8ff'}">${hit.target.cfg.name}${hit.head ? ' [CABEZA]' : ''}</b>`;
        } else {
          tEl.innerHTML = 'BLANCO: <b>NINGUNO</b>';
        }
      }
      const zl = S.curW === 0 ? rifleZoom() : WEAPONS[S.curW].zoom;
      if (mEl) mEl.innerHTML = `ZOOM: <b>${zl.toFixed(1)}×</b>`;
    }

    // HUD periódico
    hudT += dt;
    if (hudT > 0.4) { hudT = 0; updateHUD(); renderObjectives(); }
    audio.updateMusic(dt);
  }

  if (!paused) {
    world.updateEnv(dt, S.time, S.dayT, S.storm, S.lightning);
    fx.update(dt);
    world.updateViewmodel(dt, S.time, S.firing);
  } else if (!S.playing) {
    // En el menú principal el fondo sigue vivo (agua, lluvia, bandera) con un reloj
    // propio que NO toca el estado de la partida.
    menuT += rawDt;
    world.updateEnv(rawDt, menuT, S.dayT, S.storm, 0);
  }

  if (S.fenceEditMode && !frozen) {
    // Holograma + retícula en el punto EXACTO de colocación (rayo central,
    // sin dispersión) sobre todo el corredor construible.
    computeFenceAimPoint(_tmp);
    const cfg = FENCE_CATALOG[S.selectedFenceModel] || FENCE_CATALOG.chain_link;
    const inBounds = (_tmp.x >= BUILD_X0 && _tmp.x <= BUILD_X1 && _tmp.z >= BUILD_Z0 && _tmp.z <= BUILD_Z1);
    const free = world.isFenceSpotFree(_tmp.x, _tmp.z, S.fenceRotationAngle, cfg.width, cfg.depth);
    const canAfford = S.score >= cfg.cost;
    const valid = S.fenceTool === 'build' ? (inBounds && free && canAfford) : inBounds;
    world.setHologram(S.selectedFenceModel, _tmp.x, _tmp.z, S.fenceRotationAngle, valid);
    updateFenceEditorUI();
  } else if (world.clearHologram) {
    world.clearHologram();
  }

  renderer.render(scene, camera);
  fpsN++; fpsT += rawDt;
  if (fpsT >= 0.5) {
    const fpsEl = $('fps');
    if (fpsEl) fpsEl.textContent = Math.round(fpsN / fpsT);
    fpsN = 0; fpsT = 0;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Inicialización
applyQuality();
applySettingsToUI();
audio.voiceOn = S.settings.voice === 'on';
resetPlayer();
updateMenuBest();
renderSlots();
updateHUD();
updateFenceEditorUI();
animate();

// ---------------- gancho de depuración ----------------
// Expone el estado real del juego para la consola del navegador y los tests automáticos.
// No afecta al funcionamiento: es solo una referencia de lectura.
if (typeof window !== 'undefined') {
  window.__FRTD__ = {
    S, camera, scene, world, ent, fx, WEAPONS,
    SNIPER_EYE, PARAPET_TOP, CAM_BASE_PITCH, FENCE_Z, CAM_PITCH_MIN, CAM_PITCH_MAX,
    SHORE_X, FENCE_ZS, FENCE_LABELS, BUILD_X0, BUILD_X1, BUILD_Z0, BUILD_Z1,
    BOAT_COST, BOAT_MAX, fenceFracs, fenceAvg, damagePlacedFence,
    setZoom, startGame, startWave, updateAim, rayHit, tryFire, deployTurret, deployBoat, switchWeapon,
    applyLook, updateCursorState, requestLock, releaseLock, lockAllowed,
    openFenceEditor, closeFenceEditor, toggleFenceEditor, extendIntermissionTime,
    setFenceEditorModel, cycleFenceRotation, setFenceRotation, setFenceTool,
    handleFenceEditorClick, computeFenceAimPoint,
    // movimiento a pie, editor apartable y perímetro de aparición
    player, moveKeys, joy, updatePlayer, resetPlayer, floorInfoFor,
    setFencePanel, toggleFencePanel, placeFenceAndStow, cycleFenceTool,
    frontLineZ, pauseGame, resumeGame, saveGame, loadSave,
    EYE_HEIGHT, FLOOR_Y, TOWER_ASSAULT, TOWER_FLOORS,
  };
}
