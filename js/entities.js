// FRONTERA // Dead Tide — Entidades: zombis, jefes, civiles y soldados
import * as THREE from 'three';

export const ZTYPES = {
  normal:    { hp: 1,  speed: 1.7, dmg: 4,  score: 100,  scale: 1.0,  eye: 0xff3650, name: 'INFECTADO' },
  runner:    { hp: 1,  speed: 4.4, dmg: 3,  score: 150,  scale: 0.92, eye: 0xffb02e, name: 'CORREDOR' },
  armored:   { hp: 4,  speed: 1.05, dmg: 9,  score: 250,  scale: 1.16, eye: 0xff5b2e, name: 'BLINDADO' },
  explosive: { hp: 1,  speed: 2.3, dmg: 26, score: 200,  scale: 1.0,  eye: 0xff7a1a, name: 'VOLÁTIL' },
  climber:   { hp: 2,  speed: 2.1, dmg: 5,  score: 225,  scale: 0.95, eye: 0x7dff9e, name: 'TREPADOR' },
  boss:      { hp: 46, speed: 0.8, dmg: 22, score: 2000, scale: 2.25, eye: 0xc44dff, name: 'ABOMINACIÓN' },
};

export class Entities {
  constructor(scene, fx, hooks) {
    this.scene = scene; this.fx = fx; this.hooks = hooks; // {fenceDamage, playerDamage, explode, groan, civDown, civSafe, allyShot, summon, bossDown}
    this.list = []; this.civs = []; this.soldiers = [];
    this.boss = null;
    this.mats = {
      skin: [0x172020, 0x1d2620, 0x201d22].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })),
      cloth: [0x10171a, 0x191410, 0x141a16].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })),
      armor: new THREE.MeshStandardMaterial({ color: 0x4a5248, metalness: 0.8, roughness: 0.4 }),
      belly: new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff5a00, emissiveIntensity: 1.6, roughness: 0.6 }),
      blood: new THREE.MeshBasicMaterial({ color: 0x4a0508, transparent: true, opacity: 0.85 }),
    };
    this.pool = new THREE.CircleGeometry(0.8, 10);
  }

  // ---------- construcción ----------
  buildZombie(type) {
    const cfg = ZTYPES[type];
    const g = new THREE.Group();
    const skin = this.mats.skin[(Math.random() * 3) | 0];
    const cloth = this.mats.cloth[(Math.random() * 3) | 0];
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.25, 4, 8), cloth);
    body.position.y = 1.35; body.scale.set(1, 0.95, 0.6); body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 12, 8), skin);
    head.position.y = 2.43; head.castShadow = true; g.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: cfg.eye });
    for (const s of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), eyeMat);
      eye.position.set(s, 2.48, 0.4); g.add(eye);
    }
    const armL = 0.9, armR = type === 'climber' ? 1.5 : 0.9;
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, s < 0 ? armL : armR, 4, 6), skin);
      arm.position.set(s * 0.58, 1.45, 0.02);
      arm.rotation.z = s * 0.8; arm.rotation.x = -0.2; g.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.95, 4, 6), cloth);
      leg.position.set(s * 0.24, 0.5, 0); leg.rotation.z = s * 0.08; g.add(leg);
    }
    if (type === 'runner') { g.rotation.x = 0.12; }
    if (type === 'armored') {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.28), this.mats.armor);
      plate.position.set(0, 1.4, 0.28); g.add(plate);
      for (const s of [-1, 1]) {
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), this.mats.armor);
        pad.position.set(s * 0.62, 1.95, 0); g.add(pad);
      }
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.armor);
      helm.position.y = 2.5; g.add(helm);
    }
    if (type === 'explosive') {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), this.mats.belly);
      belly.position.set(0, 1.15, 0.35); g.add(belly);
    }
    if (type === 'climber') {
      const clawM = new THREE.MeshStandardMaterial({ color: 0x9aa38f, roughness: 0.5 });
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), clawM);
        claw.position.set(s * 0.95, 0.9 - i * 0.12, 0.35); claw.rotation.x = Math.PI; g.add(claw);
      }
    }
    if (type === 'boss') {
      const spikeM = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.5 });
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), spikeM);
        sp.position.set(s * (0.6 + i * 0.18), 2.0 - i * 0.28, -0.2); sp.rotation.z = s * 0.7; g.add(sp);
      }
      const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x220011, emissive: 0xc44dff, emissiveIntensity: 2 }));
      chest.position.set(0, 1.5, 0.42); g.add(chest);
    }
    g.scale.setScalar(cfg.scale);
    return { g, head };
  }

  spawn(type, x, z) {
    const cfg = ZTYPES[type];
    const { g, head } = this.buildZombie(type);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const waveBonus = Math.max(0, (this.wave || 1) - 6) * 0.12;
    const z0 = {
      type, cfg, g, head,
      hp: cfg.hp, maxHp: cfg.hp,
      speed: cfg.speed * (1 + Math.min(0.5, (this.wave || 1) * 0.02)),
      dmg: Math.round(cfg.dmg * (1 + waveBonus)),
      score: cfg.score,
      headY: 2.43 * cfg.scale, headR: 0.5 * cfg.scale, bodyR: 0.62 * cfg.scale,
      state: 'advance', phase: Math.random() * 7,
      lane: x, attackT: 0, climbT: 0, summonT: 6,
      burnT: 0, shockT: 0, groanT: 3 + Math.random() * 9,
      dead: false, deathT: 0, flashT: 0,
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

  // ---------- daño ----------
  damage(z, amount, opt) {
    if (!z || z.dead) return false;
    opt = opt || {};
    z.hp -= amount;
    z.flashT = 0.08;
    if (opt.fire) { z.burnT = 3; }
    if (opt.electric) { z.shockT = 2; }
    if (!opt.burn) z.lastHit = opt; // la quemadura conserva el contexto original
    if (z.hp <= 0) { this.kill(z, opt); return true; }
    return false;
  }
  kill(z, opt) {
    if (z.dead) return;
    opt = opt || {};
    z.dead = true; z.deathT = 0.8;
    const p = z.g.position.clone(); p.y = 1.4 * z.cfg.scale;
    this.fx.blood(p, z.type === 'boss' || opt.big);
    if (z.type === 'explosive' && !opt.noChain) {
      // el volátil detona al morir
      this.hooks.explode && this.hooks.explode(p, 4.5, 30, z);
    }
    if (z.type === 'boss') { this.hooks.bossDown && this.hooks.bossDown(z); }
    // charco de sangre
    const pool = new THREE.Mesh(this.pool, this.mats.blood.clone());
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(z.g.position.x, 0.03, z.g.position.z);
    pool.scale.setScalar(z.cfg.scale);
    this.scene.add(pool);
    z.pool = pool;
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
    for (const z of this.list) { this.scene.remove(z.g); if (z.pool) this.scene.remove(z.pool); }
    for (const c of this.civs) this.scene.remove(c.g);
    for (const s of this.soldiers) this.scene.remove(s.g);
    this.list = []; this.civs = []; this.soldiers = []; this.boss = null;
  }

  // ---------- actualización ----------
  update(dt, t, ctx) {
    // ctx: {fenceAlive, playerPos, extract:{x,z}, soldiersFire:true}
    const H = this.hooks;
    this.mats.belly.emissiveIntensity = 1.3 + Math.sin(t * 9) * 0.9;
    // --- zombis ---
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i], g = z.g;
      if (z.dead) {
        z.deathT -= dt;
        const k = 1 - Math.max(0, z.deathT) / 0.8;
        g.rotation.x = -k * Math.PI / 2 * 0.9;
        g.position.y = -k * 0.5;
        if (z.pool) z.pool.material.opacity = 0.85 * (1 - k * 0.4);
        if (z.deathT <= 0) {
          this.scene.remove(g);
          setTimeout(() => { if (z.pool) this.scene.remove(z.pool); }, 4000);
          this.list.splice(i, 1);
        }
        continue;
      }
      // quemadura / electrocución
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
      // gruñidos aleatorios
      z.groanT -= dt;
      if (z.groanT <= 0) { z.groanT = 6 + Math.random() * 10; H.groan && H.groan(z.type === 'boss'); }
      // desviarse a por civiles cercanos
      let prey = null;
      if (z.state === 'advance' || z.state === 'invade') {
        for (const c of this.civs) {
          if (c.dead || c.state !== 'run') continue;
          if (g.position.distanceTo(c.g.position) < 7) { prey = c; break; }
        }
      }
      const attackAnim = z.attackT > 0;
      if (attackAnim) z.attackT -= dt;

      if (z.state === 'advance') {
        const target = prey ? prey.g.position : null;
        const dirX = target ? Math.sign(target.x - g.position.x) * 0.8 : Math.sin(t * 0.6 + z.phase) * 0.25;
        g.position.x += dirX * dt * z.speed * slowed;
        g.position.x = THREE.MathUtils.clamp(g.position.x, -33, 33);
        const dz = target ? Math.sign(target.z - g.position.z) * 0.6 : 1;
        g.position.z += dz * dt * z.speed * slowed * (prey ? 0.9 : 1);
        g.position.y = Math.abs(Math.sin(t * (z.type === 'runner' ? 7 : 2.6) + z.phase)) * (z.type === 'runner' ? 0.3 : 0.16);
        g.rotation.y = Math.sin(t * 1.4 + z.phase) * 0.14;
        if (prey && g.position.distanceTo(prey.g.position) < 1.6) {
          // atrapar civil
          prey.dead = true; prey.state = 'dead';
          const cp = prey.g.position.clone(); cp.y = 1.2;
          this.fx.blood(cp, true);
          this.scene.remove(prey.g);
          H.civDown && H.civDown(prey);
        }
        // llegar a la valla
        if (z.type === 'explosive' && g.position.z >= -3.6 && ctx.fenceAlive !== false) {
          const p = g.position.clone(); p.y = 1.2;
          z.dead = true; z.deathT = 0.01;
          this.scene.remove(g); this.list.splice(i, 1);
          H.explode && H.explode(p, 5.5, 34, z);
          continue;
        }
        if (g.position.z >= -2.5) {
          if (!ctx.fenceAlive) { z.state = 'invade'; }
          else if (z.type === 'climber') { z.state = 'climb'; z.climbT = 0; }
          else { z.state = 'fence'; z.attackT = 0; }
        }
      } else if (z.state === 'fence') {
        if (!ctx.fenceAlive) { z.state = 'invade'; continue; }
        g.position.z += (-2.3 - g.position.z) * Math.min(1, dt * 4);
        g.position.y = Math.abs(Math.sin(t * 5 + z.phase)) * 0.1;
        g.rotation.x = attackAnim ? -0.35 : 0;
        z.fenceTick = (z.fenceTick || 0) + dt;
        if (z.fenceTick > 0.95) {
          z.fenceTick = 0; z.attackT = 0.35;
          H.fenceDamage && H.fenceDamage(z.dmg, g.position.clone());
        }
        if (z.type === 'boss') {
          z.summonT -= dt;
          if (z.summonT <= 0) { z.summonT = 9; H.summon && H.summon(z); }
        }
      } else if (z.state === 'climb') {
        z.climbT += dt;
        const k = Math.min(1, z.climbT / 1.4);
        g.position.y = Math.sin(k * Math.PI) * 6.2;
        g.position.z = -2.5 + k * 3.4;
        g.rotation.x = -0.5;
        if (k >= 1) { z.state = 'invade'; g.position.y = 0; g.rotation.x = 0; }
      } else if (z.state === 'invade') {
        const pp = ctx.playerPos;
        const dx = pp.x - g.position.x, dz = (pp.z - 3.5) - g.position.z;
        const d = Math.hypot(dx, dz);
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
        } else if (d > 4.5) {
          g.position.x += (dx / d) * dt * z.speed * slowed;
          g.position.z += (dz / d) * dt * z.speed * slowed;
          g.position.y = Math.abs(Math.sin(t * 3.2 + z.phase)) * 0.18;
        } else {
          z.attackT = z.attackT > 0 ? z.attackT : 0;
          z.playerTick = (z.playerTick || 0) + dt;
          g.rotation.x = -0.3;
          if (z.playerTick > 1.0) {
            z.playerTick = 0; z.attackT = 0.4;
            H.playerDamage && H.playerDamage(z.dmg, z);
          }
        }
        g.rotation.y = Math.atan2(dx, dz);
      }
    }
    // --- civiles: correr a la extracción ---
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
      // huir de zombis cercanos
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
    // --- soldados aliados: fuego automático ---
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
