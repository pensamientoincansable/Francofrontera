// FRONTERA // Dead Tide — Núcleo: estado, combate, oleadas, clima, UI y bucle principal
import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { FX } from './fx.js';
import { World } from './world.js';
import { Entities, ZTYPES } from './entities.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = n => String(n).padStart(2, '0');

// ---------------- armas ----------------
const WEAPONS = [
  { id: 'rifle',    name: 'MAUSER // SR-98K',    icon: '⌁', desc: '7.62 AP · PRECISIÓN',  dmg: 1, mag: 7,  reload: 1.6, rof: 0.42, zoom: 3,    kick: 0.85, sfx: 'rifle',    special: true,  unlock: 1 },
  { id: 'pistol',   name: 'P9 // SECUNDARIA',    icon: '◈', desc: '9MM · CADENCIA',        dmg: 1, mag: 12, reload: 1.1, rof: 0.22, zoom: 1.35, kick: 0.38, sfx: 'pistol',   special: true,  unlock: 1 },
  { id: 'launcher', name: 'LANZAGRANADAS MGL',   icon: '◎', desc: '40MM HE · ÁREA',        dmg: 6, mag: 4,  reload: 2.6, rof: 0.95, zoom: 1.2,  kick: 1.15, sfx: 'launcher', special: false, unlock: 2, radius: 5.5 },
  { id: 'missiles', name: 'MISILES GUIADOS FGM', icon: '✛', desc: 'TELEGUIADO ×4',         dmg: 4, mag: 4,  reload: 6.0, rof: 1.3,  zoom: 1.2,  kick: 1.0,  sfx: 'missiles', special: false, unlock: 4, radius: 3.8 },
];
const SPEC_MODES = ['normal', 'fire', 'shock'];
const SPEC_NAMES = { normal: 'NORMAL', fire: 'INCENDIARIA', shock: 'ELÉCTRICA' };
const UPGRADES = [
  { id: 'dmg',    name: 'Munición perforante', desc: '+25% daño por nivel (todas las armas)', max: 4, base: 300 },
  { id: 'reload', name: 'Manos rápidas',       desc: '−18% tiempo de recarga por nivel',     max: 3, base: 250 },
  { id: 'zoom',   name: 'Óptica de precisión', desc: 'Zoom rifle: 3× → 4.5× → 6.5×',          max: 2, base: 200 },
  { id: 'mag',    name: 'Cargadores amplios',  desc: '+30% capacidad por nivel',              max: 3, base: 200 },
  { id: 'fence',  name: 'Blindaje de valla',   desc: '+25 integridad máxima y repara 25',    max: 3, base: 250 },
];
const ZOOM_LVLS = [3, 4.5, 6.5];

// ---------------- estado ----------------
const S = {
  screen: 'menu', playing: false, paused: false, shopOpen: false,
  wave: 1, score: 0, best: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
  curW: 0, spec: 'normal', specPool: { fire: 12, shock: 12 },
  wstate: WEAPONS.map(w => ({ ammo: w.mag, reloading: false, reloadT: 0, cd: 0 })),
  up: { dmg: 0, reload: 0, zoom: 0, mag: 0, fence: 0 },
  fence: 100, fenceMax: 100, fenceAlive: true,
  hp: 100, lastHurt: -99,
  strikeCd: 0, strikeUnlocked: false,
  intermission: false, interT: 0,
  dayT: 0.08, storm: 0, stormState: 'calm', stormT: rand(40, 70), lightning: 0, nextBolt: 0,
  aim: { x: 0, y: 0 }, zoomed: false, firing: false, switchT: 0,
  trauma: 0, time: 0,
  killsTimes: [], streakBest: 0, explosiveKills: 0, headWave: 0, killsWave: 0, civsLostWave: 0,
  objectives: [], pendingSpawns: [], spawnT: 0,
  settings: { sens: 1, master: 80, music: 55, sfx: 90, quality: 'high', voice: 'on' },
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
    }));
  } catch (e) {}
}
function loadSave() { try { return JSON.parse(localStorage.getItem('frtd_save_v1') || 'null'); } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem('frtd_save_v1'); } catch (e) {} }

// ---------------- three base ----------------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x08161d, 0.009);
scene.background = new THREE.Color(0x07131a);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 4.2, 17);
camera.rotation.order = 'YXZ';
scene.add(camera);
const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  fenceDamage(amount, pos) {
    if (!S.playing || S.paused || !S.fenceAlive) return;
    S.fence = Math.max(0, S.fence - amount);
    fx.sparkHit(pos.clone().setY(2.5));
    if (Math.random() < 0.5) audio.fenceHit();
    if (S.fence <= 0 && S.fenceAlive) {
      S.fenceAlive = false;
      toast('⚠ LA VALLA HA CAÍDO ⚠');
      radio('¡La valla ha caído! ¡Repárala con F o nos superan!', 'La valla ha caído. Repárala.');
      audio.alarm(); audio.siren(1);
    } else if (S.fence < S.fenceMax * 0.3 && !S._warn30) {
      S._warn30 = true;
      radio('La valla está al treinta por ciento. Necesita reparación.', 'Valla al treinta por ciento.');
    }
  },
  playerDamage(amount) {
    if (!S.playing || S.paused) return;
    S.hp = Math.max(0, S.hp - amount);
    S.lastHurt = S.time;
    S.trauma = Math.min(1, S.trauma + 0.35);
    $('dmg').classList.add('hit');
    setTimeout(() => $('dmg').classList.remove('hit'), 450);
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
  kill(z) { onKill(z); },
  summon(boss) {
    audio.bossRoar();
    for (let i = 0; i < 2; i++) {
      const m = ent.spawn('runner', clamp(boss.g.position.x + rand(-4, 4), -32, 32), boss.g.position.z - rand(1, 4));
      fx.blood(m.g.position.clone().setY(1.4), false);
    }
    toast('EL JEFE INVOCA REFUERZOS');
  },
  bossDown() {
    $('bossbar').style.display = 'none';
    toast('JEFE ELIMINADO // +2000');
    radio('Objetivo de alto valor eliminado. Buen trabajo.', 'Jefe eliminado.');
  },
});

// ---------------- UI helpers ----------------
let toastTO = null;
function toast(t) {
  const el = $('toast');
  el.textContent = t; el.classList.add('show');
  clearTimeout(toastTO);
  toastTO = setTimeout(() => el.classList.remove('show'), 1500);
}
let radioTO = null;
function radio(text, say) {
  $('radioText').textContent = text;
  $('radio').classList.add('show');
  clearTimeout(radioTO);
  radioTO = setTimeout(() => $('radio').classList.remove('show'), 5200);
  if (S.playing) audio.speak(say || text);
}
function popup(worldPos, text, cls) {
  const layer = $('popups');
  if (layer.children.length > 14) layer.firstChild.remove();
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return;
  const d = document.createElement('div');
  d.className = 'pop' + (cls ? ' ' + cls : '');
  d.textContent = text;
  d.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
  d.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  layer.appendChild(d);
  setTimeout(() => d.remove(), 950);
}
function hitmarker(head) {
  const h = $('hitmarker');
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
  const byPlayer = last.by !== 'ally' && last.by !== 'volatile';
  const head = !!last.head;
  const pos = z.g.position.clone(); pos.y = 1.8 * z.cfg.scale;
  let pts = z.score * (head ? 2 : 1) * (byPlayer ? 1 : 0.5);
  if (last.explosive) { S.explosiveKills++; }
  if (byPlayer) {
    S.killsTimes.push(S.time);
    S.killsTimes = S.killsTimes.filter(t => S.time - t < 4);
    const n = S.killsTimes.length;
    S.streakBest = Math.max(S.streakBest, n);
    const bonus = n >= 10 ? 1000 : n >= 7 ? 600 : n >= 5 ? 350 : n >= 4 ? 200 : n >= 3 ? 120 : n >= 2 ? 50 : 0;
    const names = { 2: 'DOBLE BAJA', 3: 'TRIPLE BAJA', 4: 'RABIA', 5: 'DESPIADADO', 7: 'MASACRE', 10: 'LEYENDA' };
    if (names[n]) {
      $('streak').textContent = names[n] + (n > 10 ? ' ×' + n : '');
      pts += bonus;
      popup(pos.clone().add(new THREE.Vector3(0, 1, 0)), names[n] + ' +' + bonus, 'bonus');
    } else if (n < 2) $('streak').textContent = '';
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
    else if (o.id === 'guard') prog = Math.round(S.fence / S.fenceMax * 100);
    else if (o.id === 'prot') prog = S.civsLostWave === 0 ? 1 : -1;
    o.prog = prog;
    let done = false;
    if (o.id === 'guard') done = false; // se evalúa al final de oleada
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
    { id: 'head', label: 'HEADHUNTER', desc: 'bajas por tiro a la cabeza', need: 4 + S.wave, reward: 300 },
    { id: 'kill', label: 'EXTERMINADOR', desc: 'bajas totales', need: 10 + S.wave * 2, reward: 200 },
    { id: 'demo', label: 'DEMOLEDOR', desc: 'bajas con explosivos', need: 4, reward: 300 },
    { id: 'guard', label: 'GUARDIÁN', desc: 'valla ≥60% al final', need: 60, reward: 250 },
    { id: 'prot', label: 'PROTECTOR', desc: 'ningún civil muerto', need: 1, reward: 350 },
  ];
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 2);
  S.objectives = shuffled.map(o => ({ ...o, prog: 0, done: false }));
  renderObjectives();
}
function renderObjectives() {
  const el = $('objList');
  el.innerHTML = '';
  for (const o of S.objectives) {
    const d = document.createElement('div');
    d.className = 'obj' + (o.done ? ' done' : '');
    let txt = o.done ? '✔ ' : '◈ ';
    txt += o.label + ': ' + o.desc;
    if (!o.done && o.id !== 'guard' && o.id !== 'prot') txt += ` (${Math.min(o.prog, o.need)}/${o.need})`;
    if (!o.done && o.id === 'guard') txt += ` (${Math.round(S.fence / S.fenceMax * 100)}%)`;
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
  // mezclar
  for (let i = comp.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [comp[i], comp[j]] = [comp[j], comp[i]];
  }
  return comp;
}
const RADIO_WAVE = [
  'Oleada {n} en camino. Mantengan la línea.',
  'Contacto inminente. Oleada {n} aproximándose a la valla.',
  'Puesto de mando: oleada {n}. No dejen que pasen.',
  'Alerta: oleada {n} detectada en la costa.',
];
function startWave(n) {
  S.wave = n;
  S.intermission = false;
  $('interBar').style.display = 'none';
  S._warn30 = false;
  S.headWave = 0; S.killsWave = 0; S.civsLostWave = 0; S.explosiveKills = 0;
  S.specPool.fire = 12 + n; S.specPool.shock = 12 + n;
  // rellenar munición
  S.wstate.forEach((ws, i) => { ws.ammo = magSize(i); ws.reloading = false; });
  // desbloqueos
  for (const w of WEAPONS) {
    if (n === w.unlock && w.unlock > 1) {
      toast('NUEVA ARMA: ' + w.name + ' (tecla ' + (WEAPONS.indexOf(w) + 1) + ')');
      radio('Nuevo armamento disponible: ' + w.name + '.', 'Nueva arma disponible.');
    }
  }
  if (n >= 3 && !S.strikeUnlocked) {
    S.strikeUnlocked = true;
    toast('APOYO AÉREO DESBLOQUEADO (T)');
    radio('Apoyo aéreo disponible. Pulsa T para solicitarlo.', 'Apoyo aéreo disponible.');
  }
  if (n >= 5 && ent.soldiers.length < 2) {
    ent.spawnSoldier(8, 3.5, 'RUIZ');
    radio('Un segundo soldado se une a la defensa.', 'Refuerzos en posición.');
    updateCivs();
  }
  // civiles a proteger
  const nCiv = Math.min(1 + Math.floor(n / 3), 3);
  for (let i = 0; i < nCiv; i++) {
    const side = (i % 2 === 0 ? -1 : 1);
    ent.spawnCivilian(side * rand(18, 28), rand(-9, -4));
  }
  updateCivs();
  // cola de aparición escalonada
  S.pendingSpawns = waveComposition(n);
  S.spawnT = 0;
  pickObjectives();
  $('waveVal').textContent = fmt(n);
  toast('OLEADA ' + fmt(n) + ' // CONTACTO');
  audio.siren(n % 5 === 0 ? 3 : 2);
  if (n % 5 === 0) {
    setTimeout(() => { if (S.playing) audio.bossRoar(); }, 1600);
    radio('Atención: una abominación se acerca a la valla. Concentrad el fuego.', 'Jefe detectado. Concentrad el fuego.');
  } else {
    const msg = RADIO_WAVE[(Math.random() * RADIO_WAVE.length) | 0].replace('{n}', n);
    radio('Aquí Puesto de Mando: ' + msg, msg);
  }
  saveGame();
  updateHUD(); renderSlots();
}
function endWave() {
  const fenceBonus = Math.round(S.fence / S.fenceMax * 100);
  let bonus = 100 + S.wave * 25;
  addScore(bonus, null, 'bonus');
  // objetivos de fin de oleada
  for (const o of S.objectives) {
    if (o.done) continue;
    if (o.id === 'guard' && fenceBonus >= 60) { o.done = true; addScore(o.reward, null, 'bonus'); toast('OBJETIVO: GUARDIÁN // +' + o.reward); }
    if (o.id === 'prot' && S.civsLostWave === 0) { o.done = true; addScore(o.reward, null, 'bonus'); toast('OBJETIVO: PROTECTOR // +' + o.reward); }
  }
  renderObjectives();
  // reparar un poco la valla entre oleadas
  if (S.fenceAlive) S.fence = Math.min(S.fenceMax, S.fence + 10);
  S.hp = Math.min(100, S.hp + 25);
  S.intermission = true;
  S.interT = 16;
  $('interBar').style.display = 'flex';
  $('interText').textContent = `OLEADA ${fmt(S.wave)} SUPERADA · BONUS +${bonus} · SIGUIENTE EN ${Math.ceil(S.interT)}s`;
  toast('ZONA LIMPIA // BONUS +' + bonus);
  radio('Zona limpia. Reabasteced y reparad la valla. Pulsa B para mejoras.', 'Zona limpia. Reabasteced.');
  saveGame();
  updateHUD();
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
  const spread = S.zoomed ? 0.0008 : (S.curW === 1 ? 0.012 : 0.006);
  out.x += rand(-spread, spread); out.y += rand(-spread, spread); out.z += rand(-spread, spread) * 0.3;
  return out.normalize();
}
function rayHit(maxDist) {
  // intersección manual rayo vs zombis (cabeza = esfera, cuerpo = segmento)
  aimDir(_dir);
  _o.copy(camera.position);
  let best = null, bestT = maxDist || 140, bestHead = false;
  for (const z of ent.list) {
    if (z.dead) continue;
    const p = z.g.position;
    const hy = p.y + z.headY;
    // cabeza
    _tmp.set(p.x - _o.x, hy - _o.y, p.z - _o.z);
    let t = _tmp.dot(_dir);
    if (t > 0 && t < bestT) {
      const cx = _o.x + _dir.x * t - p.x, cy = _o.y + _dir.y * t - hy, cz = _o.z + _dir.z * t - p.z;
      if (cx * cx + cy * cy + cz * cz < z.headR * z.headR * (S.zoomed ? 1 : 1.35)) {
        best = z; bestT = t; bestHead = true;
        continue;
      }
    }
    // cuerpo
    _tmp.set(p.x - _o.x, (p.y + 1.2 * z.cfg.scale) - _o.y, p.z - _o.z);
    t = _tmp.dot(_dir);
    if (t > 0 && t < bestT) {
      const px = _o.x + _dir.x * t, py = _o.y + _dir.y * t, pz = _o.z + _dir.z * t;
      const y0 = p.y + 0.25, y1 = p.y + 2.0 * z.cfg.scale;
      if (py > y0 - 0.3 && py < y1 + 0.2) {
        const dx = px - p.x, dz = pz - p.z;
        if (dx * dx + dz * dz < z.bodyR * z.bodyR * 1.5) { best = z; bestT = t; bestHead = false; }
      }
    }
  }
  return { target: best, dist: bestT, head: bestHead };
}
function groundAim(out) {
  aimDir(_dir);
  _o.copy(camera.position);
  if (_dir.y < -0.02) {
    const t = -(_o.y - 0.2) / _dir.y;
    if (t > 0 && t < 120) return out.copy(_o).addScaledVector(_dir, t);
  }
  return out.copy(_o).addScaledVector(_dir, 55);
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
    ? target.g.position.clone().setY(target.g.position.y + (head ? target.headY : 1.3 * target.cfg.scale))
    : groundAim(new THREE.Vector3());
  projectiles.push({ kind: 'bullet', mesh, from: _m.clone(), to: end, t: 0, dur: _m.distanceTo(end) / 130, target, head, dmg, spec });
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
    kind: 'grenade', mesh, vel: dir.multiplyScalar(Math.min(34, 16 + dist * 0.35)).add(new THREE.Vector3(0, 5.5, 0)),
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
        kind: 'missile', mesh, vel: _dir.clone().multiplyScalar(14).add(new THREE.Vector3(rand(-2, 2), 4 + i, rand(-2, 2))),
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
  // arma bloqueada por oleada
  if (S.wave < w.unlock) return;
  ws.ammo--;
  ws.cd = w.rof;
  S.shots++;
  const dmg = w.dmg * dmgMult();
  world.muzzleWorld(_m);
  aimDir(_dir);
  fx.muzzle(_m.clone(), _dir.clone());
  world.addKick(w.kick * (S.zoomed ? 0.7 : 1));
  shake(0.06 + w.kick * 0.03);
  $('flash').classList.add('fire');
  setTimeout(() => $('flash').classList.remove('fire'), 140);
  $('crosshair').style.setProperty('--sp', '22px');
  setTimeout(() => $('crosshair').style.setProperty('--sp', S.zoomed ? '8px' : '14px'), 120);

  if (S.curW === 0 || S.curW === 1) {
    audio.shoot(w.sfx);
    // munición especial
    let spec = 'normal';
    if (w.special && S.spec !== 'normal' && S.specPool[S.spec] > 0) {
      spec = S.spec;
      S.specPool[S.spec]--;
      if (S.specPool[S.spec] <= 0) { S.spec = 'normal'; toast('MUNICIÓN ESPECIAL AGOTADA'); }
    }
    const { target, head } = rayHit(140);
    if (target) {
      S.hits++;
      fireBullet(target, head, dmg * (head ? 2 : 1), spec);
    } else {
      fireBullet(null, false, 0, spec);
    }
  } else if (S.curW === 2) {
    audio.shoot('launcher');
    fireGrenade(dmg, w.radius);
    S.hits++; // el área siempre "impacta"
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
      // cadena a un cercano
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
    fx.dirtBurst(p.to);
  }
}
function explode(p, radius, dmg, opt) {
  opt = opt || {};
  fx.explosion(p, radius > 5);
  audio.explosion(radius > 5);
  const dCam = p.distanceTo(camera.position);
  shake(clamp(0.5 - dCam * 0.008, 0, 0.45));
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
  if (opt.fence && S.fenceAlive && Math.abs(p.z - (-1)) < radius) {
    ent.hooks.fenceDamage(dmg * 0.9, p);
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
  $('reloadWrap').style.display = 'block';
}
function switchWeapon(i) {
  if (i === S.curW || S.switchT > 0) return;
  if (S.wave < WEAPONS[i].unlock) { audio.denied(); toast('ARMA BLOQUEADA · SE DESBLOQUEA EN OLEADA ' + WEAPONS[i].unlock); return; }
  S.curW = i; S.switchT = 0.35;
  world.setWeapon(i);
  audio.click();
  const w = WEAPONS[i];
  $('weaponName').textContent = w.name;
  $('weaponIcon').textContent = w.icon;
  $('crosshair').className = i >= 2 ? 'launch' : '';
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
// reparación de valla
function repairFence() {
  if (!S.playing || S.paused) return;
  const cost = 120;
  if (S.fenceAlive && S.fence >= S.fenceMax) { toast('LA VALLA ESTÁ ÍNTEGRA'); return; }
  if (S.score < cost) { audio.denied(); toast('PUNTOS INSUFICIENTES (120)'); return; }
  S.score -= cost;
  if (!S.fenceAlive) {
    S.fenceAlive = true;
    S.fence = Math.round(S.fenceMax * 0.4);
    toast('VALLA RECONSTRUIDA // 40%');
    radio('Valla reconstruida parcialmente. Aguantará un tiempo.', 'Valla reconstruida.');
  } else {
    S.fence = Math.min(S.fenceMax, S.fence + 35);
    toast('VALLA REPARADA // ' + Math.round(S.fence / S.fenceMax * 100) + '%');
  }
  S._warn30 = S.fence < S.fenceMax * 0.3;
  audio.repair();
  for (let k = 0; k < 6; k++) fx.healSparkle(new THREE.Vector3(rand(-20, 20), rand(1, 4), -1));
  updateHUD();
}
// ataque aéreo
function callStrike() {
  if (!S.playing || S.paused || !S.strikeUnlocked || S.strikeCd > 0) return;
  const c = new THREE.Vector3();
  const alive = ent.list.filter(z => !z.dead);
  if (!alive.length) { toast('SIN BLANCOS PARA EL ATAQUE AÉREO'); return; }
  for (const z of alive) c.add(z.g.position);
  c.divideScalar(alive.length);
  const cx = clamp(c.x, -20, 20), cz = clamp(c.z, -24, -6);
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

// ---------------- HUD ----------------
function updateHUD() {
  $('scoreVal').textContent = S.score;
  $('bestVal').textContent = S.best;
  const alive = ent.aliveCount() + S.pendingSpawns.length;
  $('remainVal').textContent = alive;
  const threat = clamp(Math.round(10 + S.wave * 4 + ent.aliveCount() * 3 + (ent.boss && !ent.boss.dead ? 18 : 0) + S.storm * 10), 0, 99);
  $('threatVal').textContent = threat;
  $('threatFill').style.width = threat + '%';
  audio.intensity = threat / 100;
  const ws = S.wstate[S.curW];
  $('ammoVal').textContent = fmt(Math.max(0, ws.ammo));
  $('ammoMax').textContent = fmt(magSize(S.curW));
  const w = WEAPONS[S.curW];
  const zl = S.curW === 0 ? rifleZoom().toFixed(1) : w.zoom.toFixed(1);
  $('zoomText').textContent = 'ZOOM ' + (S.zoomed ? zl : '1.0') + '×';
  $('specVal').textContent = w.special ? ('MUN ' + SPEC_NAMES[S.spec] + (S.spec === 'normal' ? '' : ' ×' + S.specPool[S.spec])) : 'OJIVA HE';
  const ff = S.fenceAlive ? S.fence / S.fenceMax : 0;
  $('fenceFill').style.width = (ff * 100) + '%';
  $('fenceText').textContent = Math.round(ff * 100);
  $('hpFill').style.width = S.hp + '%';
  $('hpText').textContent = Math.ceil(S.hp);
  $('lowhp').style.opacity = S.hp < 35 ? (0.4 + Math.sin(S.time * 5) * 0.25) : 0;
  const sb = $('btnStrike');
  if (!S.strikeUnlocked) { sb.disabled = true; $('strikeText').textContent = 'DESBLOQUEA EN OLEADA 3'; }
  else if (S.strikeCd > 0) { sb.disabled = true; $('strikeText').textContent = 'RECARGA ' + Math.ceil(S.strikeCd) + 's'; }
  else { sb.disabled = false; $('strikeText').textContent = 'TECLA T · LISTO'; }
  if (ent.boss && !ent.boss.dead) {
    $('bossbar').style.display = 'block';
    $('bossName').textContent = '⚠ ' + ent.boss.cfg.name + ' ⚠';
    $('bossFill').style.width = Math.max(0, ent.boss.hp / ent.boss.maxHp * 100) + '%';
  } else $('bossbar').style.display = 'none';
}
function renderSlots() {
  const el = $('slots');
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
function updateCivs() {
  $('civVal').textContent = ent.civs.filter(c => !c.dead && c.state === 'run').length;
  $('solVal').textContent = ent.soldiers.length;
}

// ---------------- tienda ----------------
function upCost(u) { return u.base * (S.up[u.id] + 1); }
function openShop() {
  if (!S.playing) return;
  S.shopOpen = true; S.paused = true;
  audio.suspend();
  $('shopMenu').classList.remove('hidden');
  renderShop();
}
function closeShop() {
  S.shopOpen = false;
  $('shopMenu').classList.add('hidden');
  if (S.screen === 'game') { S.paused = false; audio.resume(); }
}
function renderShop() {
  $('shopScore').textContent = S.score + ' PTS';
  const el = $('shopItems');
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
    S.fenceMax += 25;
    S.fence = Math.min(S.fenceMax, S.fence + 25);
    if (!S.fenceAlive && S.fence > 0) S.fenceAlive = true;
  }
  if (u.id === 'mag') S.wstate.forEach((ws, i) => { ws.ammo = Math.min(ws.ammo + 2, magSize(i)); });
  audio.buy();
  toast('MEJORA: ' + u.name + ' Nv.' + S.up[u.id]);
  saveGame(); renderShop(); updateHUD();
}

// ---------------- flujo de juego ----------------
function resetRun() {
  ent.clearAll();
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  Object.assign(S, {
    wave: 1, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0,
    curW: 0, spec: 'normal', up: { dmg: 0, reload: 0, zoom: 0, mag: 0, fence: 0 },
    fence: 100, fenceMax: 100, fenceAlive: true, hp: 100,
    strikeCd: 0, strikeUnlocked: false, intermission: false,
    dayT: 0.08, storm: 0, stormState: 'calm', stormT: rand(40, 70), lightning: 0,
    killsTimes: [], streakBest: 0, objectives: [], pendingSpawns: [],
  });
  S.specPool = { fire: 13, shock: 13 };
  S.wstate = WEAPONS.map(w => ({ ammo: w.mag, reloading: false, reloadT: 0, cd: 0 }));
  $('reloadWrap').style.display = 'none';
  $('streak').textContent = '';
  world.setWeapon(0);
  $('weaponName').textContent = WEAPONS[0].name;
  $('weaponIcon').textContent = WEAPONS[0].icon;
  $('crosshair').className = '';
}
function startGame(fresh) {
  audio.init(); audio.resume();
  resetRun();
  if (!fresh) {
    const sv = loadSave();
    if (sv) {
      S.wave = sv.wave || 1; S.score = sv.score || 0;
      S.kills = sv.kills || 0; S.headshots = sv.headshots || 0; S.shots = sv.shots || 0;
      Object.assign(S.up, sv.up || {});
      S.fenceMax = 100 + S.up.fence * 25; S.fence = S.fenceMax;
      if (S.wave >= 3) S.strikeUnlocked = true;
    }
  }
  ent.spawnSoldier(-7, 3, 'VEGA');
  S.screen = 'game'; S.playing = true; S.paused = false; S.shopOpen = false;
  for (const id of ['menu', 'pauseMenu', 'over', 'settingsMenu', 'shopMenu', 'helpMenu']) $(id).classList.add('hidden');
  radio('Aquí Puesto de Mando: defiende la valla y protege a los civiles. Buena caza.', 'Defiende la valla. Buena caza.');
  startWave(S.wave);
}
function gameOver() {
  if (!S.playing) return;
  S.playing = false; S.screen = 'over';
  clearSave();
  try { speechSynthesis.cancel(); } catch (e) {}
  audio.siren(2);
  const isBest = S.score >= S.best && S.score > 0;
  $('overTitle').textContent = 'LA LÍNEA HA CAÍDO';
  $('overKicker').textContent = 'SECTOR PERDIDO · OLEADA ' + fmt(S.wave);
  $('finalScore').textContent = S.score;
  $('finalBest').textContent = S.best;
  $('finalWave').textContent = fmt(S.wave);
  $('finalKills').textContent = S.kills;
  $('finalHead').textContent = S.headshots;
  $('finalAcc').textContent = S.shots ? Math.round(S.hits / S.shots * 100) + '%' : '0%';
  $('newBestTag').style.display = isBest ? 'block' : 'none';
  $('over').classList.remove('hidden');
  updateMenuBest();
}
function toMenu() {
  S.screen = 'menu'; S.playing = false; S.paused = false; S.shopOpen = false;
  audio.resume();
  for (const id of ['pauseMenu', 'over', 'settingsMenu', 'shopMenu', 'helpMenu']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  updateMenuBest();
}
function updateMenuBest() {
  $('menuBest').textContent = 'RÉCORD LOCAL: ' + S.best + ' PTS';
  const sv = loadSave();
  $('btnContinue').disabled = !sv;
  $('btnContinue').textContent = sv ? `CONTINUAR · OLEADA ${fmt(sv.wave)} · ${sv.score} PTS` : 'CONTINUAR';
}
function pauseGame() {
  if (!S.playing || S.screen !== 'game') return;
  if (S.shopOpen) { closeShop(); return; }
  S.paused = true;
  audio.suspend();
  try { speechSynthesis.cancel(); } catch (e) {}
  $('pauseMenu').classList.remove('hidden');
}
function resumeGame() {
  if (!S.playing) return;
  S.paused = false; S.shopOpen = false;
  audio.resume();
  $('pauseMenu').classList.add('hidden');
  $('shopMenu').classList.add('hidden');
  $('settingsMenu').classList.add('hidden');
}

// ---------------- ajustes ----------------
let settingsFrom = 'menu';
function openSettings(from) {
  settingsFrom = from;
  applySettingsToUI();
  $('settingsMenu').classList.remove('hidden');
}
function closeSettings() {
  $('settingsMenu').classList.add('hidden');
  saveSettings();
}
function applySettingsToUI() {
  $('setSens').value = Math.round(S.settings.sens * 100);
  $('sensVal').textContent = S.settings.sens.toFixed(1);
  $('setMaster').value = S.settings.master; $('masterVal').textContent = S.settings.master;
  $('setMusic').value = S.settings.music; $('musicVal').textContent = S.settings.music;
  $('setSfx').value = S.settings.sfx; $('sfxVal').textContent = S.settings.sfx;
  $('setQuality').value = S.settings.quality;
  $('setVoice').value = S.settings.voice;
}
function applyQuality() {
  world.setQuality(S.settings.quality);
  fx.setQuality(S.settings.quality);
}

// ---------------- entrada ----------------
const cvs = renderer.domElement;
addEventListener('mousemove', e => {
  S.aim.x = (e.clientX / innerWidth) * 2 - 1;
  S.aim.y = -((e.clientY / innerHeight) * 2 - 1);
});
cvs.addEventListener('mousedown', e => {
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
  const d = e.deltaY > 0 ? 1 : -1;
  let i = S.curW;
  for (let k = 0; k < 4; k++) {
    i = (i + d + 4) % 4;
    if (S.wave >= WEAPONS[i].unlock) { switchWeapon(i); break; }
  }
}, { passive: true });
function setZoom(v) {
  if (!S.playing || S.paused) v = false;
  S.zoomed = v;
  world.setZoomed(v && S.curW <= 1);
  $('crosshair').style.setProperty('--sp', v ? '8px' : '14px');
  updateHUD();
}
addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.code;
  if (k === 'Space') { e.preventDefault(); setZoom(true); }
  if (S.screen === 'menu') {
    if (k === 'Enter') startGame(true);
    return;
  }
  if (S.screen === 'over') {
    if (k === 'Enter') startGame(true);
    return;
  }
  if (k === 'Escape' || k === 'KeyP') {
    if (!$('settingsMenu').classList.contains('hidden')) closeSettings();
    else if (!$('helpMenu').classList.contains('hidden')) $('helpMenu').classList.add('hidden');
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
  if (k === 'Digit1') switchWeapon(0);
  else if (k === 'Digit2') switchWeapon(1);
  else if (k === 'Digit3') switchWeapon(2);
  else if (k === 'Digit4') switchWeapon(3);
  else if (k === 'KeyQ') cycleSpec();
  else if (k === 'KeyR') startReload(S.curW);
  else if (k === 'KeyF') repairFence();
  else if (k === 'KeyB') openShop();
  else if (k === 'KeyT') callStrike();
  else if (k === 'Enter' && S.intermission) startWave(S.wave + 1);
});
addEventListener('keyup', e => { if (e.code === 'Space') setZoom(false); });
// táctil básico: tocar = disparar, arrastrar = apuntar
cvs.addEventListener('touchstart', e => {
  const t = e.touches[0];
  S.aim.x = (t.clientX / innerWidth) * 2 - 1;
  S.aim.y = -((t.clientY / innerHeight) * 2 - 1);
  tryFire();
}, { passive: true });
cvs.addEventListener('touchmove', e => {
  const t = e.touches[0];
  S.aim.x = (t.clientX / innerWidth) * 2 - 1;
  S.aim.y = -((t.clientY / innerHeight) * 2 - 1);
}, { passive: true });

// botones
$('btnStart').onclick = () => { audio.init(); audio.click(); startGame(true); };
$('btnContinue').onclick = () => { audio.init(); audio.click(); startGame(false); };
$('btnRetry').onclick = () => { audio.click(); startGame(true); };
$('btnMenu').onclick = () => { audio.click(); toMenu(); };
$('btnResume').onclick = () => { audio.click(); resumeGame(); };
$('btnSaveExit').onclick = () => { saveGame(); audio.click(); toMenu(); };
$('btnSettings').onclick = () => { audio.init(); audio.click(); openSettings('menu'); };
$('btnSettings2').onclick = () => { audio.click(); openSettings('pause'); };
$('btnCloseSettings').onclick = () => { audio.click(); closeSettings(); };
$('btnHelp').onclick = () => { audio.init(); audio.click(); $('helpMenu').classList.remove('hidden'); };
$('btnCloseHelp').onclick = () => { audio.click(); $('helpMenu').classList.add('hidden'); };
$('btnShop').onclick = () => { audio.click(); openShop(); };
$('btnShop2').onclick = () => { audio.click(); $('pauseMenu').classList.add('hidden'); openShop(); };
$('btnCloseShop').onclick = () => {
  audio.click(); closeShop();
  if (S.playing && S.screen === 'game' && !S.intermission && ent.aliveCount() > 0) { /* sigue el combate */ }
};
$('btnRepair').onclick = () => repairFence();
$('btnStrike').onclick = () => callStrike();
$('btnNextWave').onclick = () => { audio.click(); if (S.intermission) startWave(S.wave + 1); };
$('btnPause').onclick = () => { S.paused ? resumeGame() : pauseGame(); };
$('btnMute').onclick = () => {
  audio.init();
  audio.setMuted(!audio.muted);
  $('btnMute').textContent = audio.muted ? '✕' : '♪';
};
// sliders
$('setSens').oninput = e => { S.settings.sens = e.target.value / 100; $('sensVal').textContent = S.settings.sens.toFixed(1); saveSettings(); };
$('setMaster').oninput = e => { S.settings.master = +e.target.value; $('masterVal').textContent = S.settings.master; audio.setVol('master', S.settings.master / 100); saveSettings(); };
$('setMusic').oninput = e => { S.settings.music = +e.target.value; $('musicVal').textContent = S.settings.music; audio.setVol('music', S.settings.music / 100); saveSettings(); };
$('setSfx').oninput = e => { S.settings.sfx = +e.target.value; $('sfxVal').textContent = S.settings.sfx; audio.setVol('sfx', S.settings.sfx / 100); saveSettings(); };
$('setQuality').onchange = e => { S.settings.quality = e.target.value; applyQuality(); saveSettings(); };
$('setVoice').onchange = e => { S.settings.voice = e.target.value; audio.voiceOn = S.settings.voice === 'on'; saveSettings(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && S.playing && !S.paused) pauseGame(); });

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

// ---------------- cámara / puntería ----------------
let camYaw = 0, camPitch = -0.06, camFov = 62;
function updateAim(dt) {
  const w = WEAPONS[S.curW];
  const zl = S.zoomed ? (S.curW === 0 ? rifleZoom() : w.zoom) : 1;
  const range = 0.55 / Math.sqrt(zl), rangeV = 0.34 / Math.sqrt(zl);
  const ty = -S.aim.x * range, tp = -0.06 + S.aim.y * rangeV;
  const sp = Math.min(1, dt * 6 * S.settings.sens);
  camYaw += (ty - camYaw) * sp;
  camPitch += (tp - camPitch) * sp;
  const targetFov = 62 / zl;
  camFov += (targetFov - camFov) * Math.min(1, dt * 10);
  camera.fov = camFov;
  camera.updateProjectionMatrix();
  S.trauma = Math.max(0, S.trauma - dt * 1.6);
  const sh = S.trauma * S.trauma;
  camera.rotation.y = camYaw + (Math.random() - 0.5) * sh * 0.09;
  camera.rotation.x = camPitch + (Math.random() - 0.5) * sh * 0.09;
  camera.rotation.z = (Math.random() - 0.5) * sh * 0.03;
}

// ---------------- bucle ----------------
const clock = new THREE.Clock();
let fpsN = 0, fpsT = 0, hudT = 0;
function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(0.05, clock.getDelta());
  const paused = S.paused || !S.playing;
  const dt = paused ? 0 : rawDt;
  if (dt > 0) {
    S.time += dt;
    S.dayT = (S.dayT + dt / 240) % 1;
    updateStorm(dt);
    // aparición escalonada
    if (S.pendingSpawns.length) {
      S.spawnT -= dt;
      const alive = ent.aliveCount();
      if (S.spawnT <= 0 && alive < 30) {
        S.spawnT = 0.45;
        for (let k = 0; k < 3 && S.pendingSpawns.length && ent.aliveCount() < 32; k++) {
          const t = S.pendingSpawns.shift();
          const x = rand(-30, 30) * (0.2 + Math.random() * 0.8);
          ent.wave = S.wave;
          const z = ent.spawn(t, clamp(x, -31, 31), rand(-36, -11));
          if (t === 'boss') { $('bossbar').style.display = 'block'; }
        }
        updateHUD();
      }
    }
    // fin de oleada
    if (!S.intermission && !S.pendingSpawns.length && ent.aliveCount() === 0 && S.playing) endWave();
    if (S.intermission) {
      S.interT -= dt;
      $('interText').textContent = `OLEADA ${fmt(S.wave)} SUPERADA · SIGUIENTE EN ${Math.max(0, Math.ceil(S.interT))}s`;
      if (S.interT <= 0) startWave(S.wave + 1);
    }
    // armas: cds y recargas
    S.wstate.forEach((ws, i) => {
      if (ws.cd > 0) ws.cd -= dt;
      if (ws.reloading) {
        ws.reloadT -= dt;
        if (i === S.curW) $('reloadFill').style.width = (100 * (1 - ws.reloadT / (WEAPONS[i].reload * reloadMult()))) + '%';
        if (ws.reloadT <= 0) {
          ws.reloading = false; ws.ammo = magSize(i);
          if (i === S.curW) { $('reloadWrap').style.display = 'none'; toast('ARMA LISTA'); }
          updateHUD();
        }
      }
    });
    if (S.switchT > 0) S.switchT -= dt;
    // pistola en ráfaga manteniendo
    if (S.firing && S.curW === 1) tryFire();
    if (S.strikeCd > 0) { S.strikeCd -= dt; if ((S.strikeCd * 2 | 0) % 2 === 0) updateHUD(); }
    // regen salud
    if (S.time - S.lastHurt > 5 && S.hp < 100) S.hp = Math.min(100, S.hp + 4 * dt);
    // entidades
    ent.update(dt, S.time, {
      fenceAlive: S.fenceAlive,
      playerPos: camera.position,
      extract: { x: 26, z: 2 },
    });
    updateProjectiles(dt);
    world.fenceVisual(S.fenceAlive ? S.fence / S.fenceMax : 0);
    // rotor audible por cercanía
    const hd = world.heliPosV.distanceTo(camera.position);
    audio.setRotor(clamp(1 - hd / 110, 0, 1) * (world.heliTask ? 1.4 : 1));
    // gruñidos ambiente
    if (Math.random() < dt * 0.5 && ent.aliveCount() > 0) audio.groan(false);
    updateAim(dt);
    // HUD periódico
    hudT += dt;
    if (hudT > 0.5) { hudT = 0; updateHUD(); renderObjectives(); updateCivs(); }
    audio.updateMusic(dt);
  }
  world.updateEnv(paused ? 0 : dt, S.time, S.dayT, S.storm, S.lightning);
  if (dt > 0) {
    fx.update(dt);
    world.updateViewmodel(dt, S.time, S.firing);
  }
  renderer.render(scene, camera);
  fpsN++; fpsT += rawDt;
  if (fpsT >= 0.5) { $('fps').textContent = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// init
applyQuality();
applySettingsToUI();
audio.voiceOn = S.settings.voice === 'on';
updateMenuBest();
renderSlots();
updateHUD();
animate();
