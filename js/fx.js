// FRONTERA // Dead Tide — Sistema de partículas y efectos (pools reutilizables)
import * as THREE from 'three';

class PointPool {
  constructor(scene, max, size, additive, opacity) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);      // restante
    this.life0 = new Float32Array(max);     // inicial
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseCol = new Float32Array(max * 3);
    for (let k = 0; k < max; k++) { this.pos[k * 3 + 1] = -100; }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.colAttr = new THREE.BufferAttribute(this.col, 3);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    this.mat = new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, opacity: (opacity !== undefined && opacity !== null) ? opacity : 1,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false, sizeAttenuation: true
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.scale = 1; // multiplicador de calidad
  }
  spawn(x, y, z, vx, vy, vz, life, r, g, b, grav, drag) {
    if (Math.random() > this.scale) return;
    const k = this.i; this.i = (this.i + 1) % this.max;
    this.pos[k*3] = x; this.pos[k*3+1] = y; this.pos[k*3+2] = z;
    this.vel[k*3] = vx; this.vel[k*3+1] = vy; this.vel[k*3+2] = vz;
    this.life[k] = life; this.life0[k] = life;
    this.baseCol[k*3] = r; this.baseCol[k*3+1] = g; this.baseCol[k*3+2] = b;
    this.grav[k] = (grav !== undefined && grav !== null) ? grav : 9; this.drag[k] = (drag !== undefined && drag !== null) ? drag : 1;
  }
  burst(p, n, opt) {
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = (opt.speed || 6) * (0.3 + Math.random() * 0.9);
      const c = opt.colors[(Math.random() * opt.colors.length) | 0];
      this.spawn(p.x, p.y, p.z,
        Math.sin(ph) * Math.cos(th) * sp + (opt.vx || 0),
        Math.abs(Math.cos(ph)) * sp * ((opt.up !== undefined && opt.up !== null) ? opt.up : 0.9) + (opt.vy || 0),
        Math.sin(ph) * Math.sin(th) * sp + (opt.vz || 0),
        (opt.life || 0.8) * (0.5 + Math.random()),
        c[0], c[1], c[2], (opt.grav !== undefined && opt.grav !== null) ? opt.grav : 9, (opt.drag !== undefined && opt.drag !== null) ? opt.drag : 1.2);
    }
  }
  update(dt) {
    const { pos, vel, life, life0, baseCol, col, grav, drag, max } = this;
    for (let k = 0; k < max; k++) {
      if (life[k] <= 0) continue;
      life[k] -= dt;
      if (life[k] <= 0) { pos[k*3+1] = -100; continue; }
      const dr = 1 - Math.min(0.95, drag[k] * dt);
      vel[k*3] *= dr; vel[k*3+2] *= dr;
      vel[k*3+1] = vel[k*3+1] * dr - grav[k] * dt;
      pos[k*3] += vel[k*3] * dt; pos[k*3+1] += vel[k*3+1] * dt; pos[k*3+2] += vel[k*3+2] * dt;
      if (pos[k*3+1] < 0.02) { pos[k*3+1] = 0.02; vel[k*3+1] *= -0.3; vel[k*3] *= 0.7; vel[k*3+2] *= 0.7; }
      const f = life[k] / life0[k];
      col[k*3] = baseCol[k*3] * f; col[k*3+1] = baseCol[k*3+1] * f; col[k*3+2] = baseCol[k*3+2] * f;
    }
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new PointPool(scene, 2600, 0.32, true, 1);
    this.embers = new PointPool(scene, 900, 0.5, true, 0.9);
    this.smoke = new PointPool(scene, 700, 1.5, false, 0.42);
    this.flashLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 30, 1.8);
      scene.add(l); this.flashLights.push({ l, t: 0 });
    }
    this.flashes = [];   // esferas de destello
    this.rings = [];     // ondas de choque
    this.lines = [];     // trazadoras / arcos eléctricos
    this.flashGeo = new THREE.SphereGeometry(1, 12, 10);
    this.ringGeo = new THREE.TorusGeometry(1, 0.07, 8, 40);
  }
  setQuality(q) {
    const m = q === 'high' ? 1 : q === 'med' ? 0.7 : 0.4;
    this.sparks.scale = m; this.embers.scale = m; this.smoke.scale = m;
  }
  light(p, color, power) {
    let f = this.flashLights.find(f => f.t <= 0) || this.flashLights[0];
    f.l.position.copy(p); f.l.color.set(color); f.l.intensity = power; f.t = 0.28;
  }
  blood(p, big) {
    this.sparks.burst(p, big ? 42 : 22, {
      colors: [[0.6, 0.02, 0.05], [0.4, 0, 0.02], [0.8, 0.1, 0.1]],
      speed: big ? 8 : 5.5, life: 0.9, grav: 14, up: 0.8
    });
  }
  sparkHit(p) {
    this.sparks.burst(p, 10, { colors: [[1, 0.9, 0.6], [0.5, 0.9, 1]], speed: 7, life: 0.35, grav: 6 });
  }
  muzzle(p, dir) {
    this.sparks.burst(p, 8, {
      colors: [[1, 0.85, 0.4], [1, 0.6, 0.2]], speed: 4, life: 0.16, grav: 0,
      vx: dir.x * 6, vy: dir.y * 6, vz: dir.z * 6
    });
    this.light(p, 0xffc060, 26);
  }
  fireTick(p) {
    this.embers.spawn(p.x + (Math.random()-.5)*.5, p.y + Math.random()*.6, p.z + (Math.random()-.5)*.5,
      (Math.random()-.5)*1.2, 2.2 + Math.random()*1.5, (Math.random()-.5)*1.2,
      0.5 + Math.random()*0.3, 1, 0.35 + Math.random()*0.3, 0.08, -2, 1);
  }
  electricArc(a, b) {
    const pts = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      pts.push(new THREE.Vector3(
        a.x + (b.x - a.x) * f + (i > 0 && i < n ? (Math.random()-.5)*1.2 : 0),
        a.y + (b.y - a.y) * f + (i > 0 && i < n ? (Math.random()-.5)*1.2 : 0),
        a.z + (b.z - a.z) * f + (i > 0 && i < n ? (Math.random()-.5)*1.2 : 0)));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 1 });
    const line = new THREE.Line(g, m);
    this.scene.add(line);
    this.lines.push({ line, t: 0.22 });
    this.sparks.burst(b, 10, { colors: [[0.5, 0.8, 1], [0.8, 0.95, 1]], speed: 5, life: 0.3, grav: 4 });
  }
  tracer(a, b, color) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const m = new THREE.LineBasicMaterial({ color: color || 0xffe0a0, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(g, m);
    this.scene.add(line);
    this.lines.push({ line, t: 0.12 });
  }
  explosion(p, big) {
    const s = big ? 1.5 : 1;
    // bola de fuego volumétrica por capas
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: [0xfff3c0, 0xff9a3c, 0xff4d1e][i],
        transparent: true, opacity: 0.85 - i * 0.2, blending: THREE.AdditiveBlending, depthWrite: false
      });
      const mesh = new THREE.Mesh(this.flashGeo, m);
      mesh.position.copy(p); mesh.position.y += 0.6;
      mesh.scale.setScalar(0.4);
      this.scene.add(mesh);
      this.flashes.push({ mesh, t: 0.5 + i * 0.08, max: (2.6 - i * 0.5) * s });
    }
    // onda de choque
    const rm = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.ringGeo, rm);
    ring.position.copy(p); ring.position.y = Math.max(0.3, p.y * 0.3);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.rings.push({ mesh: ring, t: 0.55, max: 7 * s });
    // partículas
    this.sparks.burst(p, Math.round(46 * s), {
      colors: [[1, 0.9, 0.55], [1, 0.55, 0.15], [1, 0.3, 0.08], [0.9, 0.9, 0.9]],
      speed: 11 * s, life: 0.9, grav: 10, up: 1.1
    });
    this.embers.burst(p, Math.round(16 * s), {
      colors: [[1, 0.4, 0.1], [1, 0.7, 0.25]], speed: 4 * s, life: 1.4, grav: -1.5, up: 1.4
    });
    this.smoke.burst(p, Math.round(14 * s), {
      colors: [[0.16, 0.15, 0.14], [0.25, 0.23, 0.2]], speed: 3.2 * s, life: 2.2, grav: -1.2, up: 1.5
    });
    this.light(p, 0xff9040, 90 * s);
  }
  dirtBurst(p) {
    this.sparks.burst(p, 12, { colors: [[0.45, 0.36, 0.24], [0.3, 0.24, 0.16]], speed: 5, life: 0.7, grav: 12 });
    this.smoke.burst(p, 4, { colors: [[0.2, 0.18, 0.15]], speed: 2, life: 1.2, grav: -0.5, up: 1.2 });
  }
  healSparkle(p) {
    this.sparks.burst(p, 14, { colors: [[0.4, 1, 0.6], [0.7, 1, 0.8]], speed: 2.5, life: 0.8, grav: -2, up: 1 });
  }
  update(dt) {
    this.sparks.update(dt); this.embers.update(dt); this.smoke.update(dt);
    for (const f of this.flashLights) {
      if (f.t > 0) { f.t -= dt; f.l.intensity *= Math.pow(0.001, dt * 3); if (f.t <= 0) f.l.intensity = 0; }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.t -= dt;
      const k = 1 - Math.max(0, f.t) / 0.6;
      f.mesh.scale.setScalar(0.4 + k * f.max);
      f.mesh.material.opacity = Math.max(0, 0.85 * (f.t / 0.6));
      if (f.t <= 0) { this.scene.remove(f.mesh); f.mesh.material.dispose(); this.flashes.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t -= dt;
      const k = 1 - Math.max(0, r.t) / 0.55;
      const s = 0.5 + k * r.max;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = Math.max(0, 0.9 * (r.t / 0.55));
      if (r.t <= 0) { this.scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]; l.t -= dt;
      l.line.material.opacity = Math.max(0, l.t * 6);
      if (l.t <= 0) { this.scene.remove(l.line); l.line.geometry.dispose(); l.line.material.dispose(); this.lines.splice(i, 1); }
    }
  }
}
