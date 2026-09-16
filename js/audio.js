// FRONTERA // Dead Tide — Motor de audio procedural (Web Audio API)
// Sin assets externos: síntesis de disparos, explosiones, sirenas, zombis, radio y música dinámica.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null; this.musicBus = null; this.sfxBus = null;
    this.muted = false;
    this.vol = { master: 0.8, music: 0.55, sfx: 0.9 };
    this.noiseBuf = null;
    this.musicTimer = 0; this.step = 0;
    this.intensity = 0.2; // 0..1 nivel de amenaza musical
    this.playing = false;
    this.rotorGain = null; this.rotorSrc = null;
    this.voiceOn = true;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    // buffer de ruido reutilizable (2s)
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.playing = true;
    this.startRotor();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const m = this.muted ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, this.ctx.currentTime, 0.05);
  }
  setMuted(m) { this.muted = m; this.applyVolumes(); }
  setVol(k, v) { this.vol[k] = v; this.applyVolumes(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---- primitivas ----
  osc(type, f0, f1, t0, dur, gain, dest) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noise(t0, dur, gain, filterType, freq, q, dest) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter(); f.type = filterType || 'lowpass';
    f.frequency.value = freq || 1000; f.Q.value = q || 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxBus);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  // ---- SFX de armas ----
  shoot(kind) {
    if (!this.ctx) return; const t = this.now();
    if (kind === 'rifle') {
      this.noise(t, 0.28, 0.9, 'highpass', 900);
      this.noise(t, 0.4, 0.7, 'lowpass', 900);
      this.osc('sine', 160, 38, t, 0.32, 0.9);
      this.osc('square', 1400, 300, t, 0.05, 0.18);
    } else if (kind === 'pistol') {
      this.noise(t, 0.14, 0.7, 'highpass', 1400);
      this.osc('sine', 220, 60, t, 0.16, 0.7);
    } else if (kind === 'launcher') {
      this.osc('sine', 95, 30, t, 0.5, 1.0);
      this.noise(t, 0.35, 0.5, 'lowpass', 500);
    } else if (kind === 'missiles') {
      this.noise(t, 0.7, 0.5, 'bandpass', 1800, 1.5);
      this.osc('sawtooth', 200, 700, t, 0.5, 0.12);
    } else if (kind === 'ally') {
      this.noise(t, 0.1, 0.25, 'highpass', 1600);
      this.osc('sine', 260, 80, t, 0.1, 0.3);
    } else if (kind === 'turret') {
      this.noise(t, 0.08, 0.4, 'bandpass', 1900, 2.5);
      this.osc('square', 340, 90, t, 0.07, 0.28);
      this.osc('sine', 150, 48, t, 0.1, 0.4);
    }
  }
  dryFire() { if (!this.ctx) return; const t = this.now(); this.osc('square', 1800, 1200, t, 0.04, 0.15); }
  reload() {
    if (!this.ctx) return; const t = this.now();
    this.noise(t, 0.06, 0.5, 'bandpass', 2500, 2);
    this.noise(t + 0.18, 0.06, 0.5, 'bandpass', 1800, 2);
    this.noise(t + 0.45, 0.09, 0.6, 'bandpass', 3200, 2);
  }
  explosion(big) {
    if (!this.ctx) return; const t = this.now(); const s = big ? 1.4 : 1.0;
    this.osc('sine', 70, 20, t, 1.1 * s, 1.2);
    this.noise(t, 0.9 * s, 1.0, 'lowpass', 700);
    this.noise(t, 0.25, 0.6, 'highpass', 2000);
    this.noise(t + 0.12, 0.6, 0.4, 'lowpass', 300);
  }
  hit(head) {
    if (!this.ctx) return; const t = this.now();
    this.osc('square', head ? 2400 : 1700, head ? 1800 : 1400, t, 0.06, 0.22);
  }
  hurt() {
    if (!this.ctx) return; const t = this.now();
    this.osc('sawtooth', 130, 55, t, 0.35, 0.5);
    this.noise(t, 0.25, 0.4, 'lowpass', 600);
  }
  fenceHit() {
    if (!this.ctx) return; const t = this.now();
    this.osc('square', 300, 120, t, 0.12, 0.25);
    this.noise(t, 0.1, 0.3, 'bandpass', 900, 2);
  }
  stoneThrow() {
    if (!this.ctx) return; const t = this.now();
    this.noise(t, 0.18, 0.22, 'bandpass', 1400, 1.5);
    this.osc('sine', 500, 900, t, 0.12, 0.08);
  }
  stoneHit() {
    if (!this.ctx) return; const t = this.now();
    this.noise(t, 0.09, 0.4, 'bandpass', 2400, 2);
    this.osc('triangle', 320, 140, t, 0.09, 0.25);
  }
  splash(big) {
    if (!this.ctx) return; const t = this.now(); const s = big ? 1.4 : 1.0;
    this.noise(t, 0.5 * s, 0.4, 'highpass', 1200);
    this.noise(t + 0.05, 0.4 * s, 0.3, 'bandpass', 800, 1);
  }
  boatCreak() {
    if (!this.ctx) return; const t = this.now();
    this.osc('sawtooth', 140, 90, t, 0.25, 0.12);
    this.noise(t, 0.2, 0.15, 'lowpass', 500);
  }
  repair() {
    if (!this.ctx) return; const t = this.now();
    for (let i = 0; i < 4; i++) this.noise(t + i * 0.16, 0.07, 0.5, 'bandpass', 2200 + i * 500, 3);
    this.osc('sine', 180, 320, t + 0.7, 0.25, 0.3);
  }
  buy() {
    if (!this.ctx) return; const t = this.now();
    [660, 880, 1320].forEach((f, i) => this.osc('triangle', f, f, t + i * 0.08, 0.18, 0.3));
  }
  turretDeploy() {
    if (!this.ctx) return; const t = this.now();
    this.osc('triangle', 180, 440, t, 0.18, 0.3);
    this.noise(t + 0.08, 0.16, 0.35, 'bandpass', 1200, 2);
    this.osc('sine', 480, 640, t + 0.2, 0.12, 0.2);
  }
  scopeIn() {
    if (!this.ctx) return; const t = this.now();
    this.osc('sine', 550, 1050, t, 0.05, 0.14);
    this.noise(t, 0.04, 0.16, 'highpass', 2400);
  }
  scopeOut() {
    if (!this.ctx) return; const t = this.now();
    this.osc('sine', 950, 480, t, 0.05, 0.12);
  }
  denied() { if (!this.ctx) return; const t = this.now(); this.osc('square', 220, 140, t, 0.18, 0.25); }
  click() { if (!this.ctx) return; const t = this.now(); this.osc('triangle', 900, 700, t, 0.05, 0.2); }

  // ---- sirenas / alarmas ----
  siren(cycles) {
    if (!this.ctx) return;
    const t0 = this.now(); const n = cycles || 2;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 1.6;
      this.osc('triangle', 620, 880, t, 0.75, 0.28);
      this.osc('triangle', 880, 620, t + 0.78, 0.75, 0.28);
    }
  }
  alarm() {
    if (!this.ctx) return; const t = this.now();
    for (let i = 0; i < 3; i++) this.osc('square', 520, 520, t + i * 0.22, 0.12, 0.16);
  }

  // ---- zombis ----
  groan(big) {
    if (!this.ctx) return; const t = this.now();
    const f = big ? 55 + Math.random() * 20 : 75 + Math.random() * 60;
    const dur = 0.7 + Math.random() * 0.8;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), v = this.ctx.createOscillator(), vg = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.3), t + dur);
    v.type = 'sine'; v.frequency.value = 5 + Math.random() * 4; vg.gain.value = f * 0.18;
    v.connect(vg); vg.connect(o.frequency);
    const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = big ? 350 : 500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? 0.5 : 0.22, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.sfxBus);
    o.start(t); v.start(t); o.stop(t + dur + 0.05); v.stop(t + dur + 0.05);
  }
  zombieDie() {
    if (!this.ctx) return; const t = this.now();
    this.osc('sawtooth', 200 + Math.random() * 120, 50, t, 0.4, 0.25);
    this.noise(t, 0.2, 0.25, 'lowpass', 800);
  }
  bossRoar() {
    if (!this.ctx) return; const t = this.now();
    this.osc('sawtooth', 48, 32, t, 1.6, 0.8);
    this.osc('sawtooth', 72, 40, t + 0.1, 1.4, 0.6);
    this.noise(t, 1.2, 0.5, 'lowpass', 400);
  }

  // ---- trueno / tormenta ----
  thunder(delay) {
    if (!this.ctx) return; const t = this.now() + (delay || 0);
    this.noise(t, 2.2, 0.7, 'lowpass', 220);
    this.osc('sine', 55, 24, t, 2.0, 0.6);
  }

  // ---- radio militar ----
  radioBeep() {
    if (!this.ctx) return; const t = this.now();
    this.noise(t, 0.08, 0.2, 'highpass', 3000);
    this.osc('sine', 1200, 1200, t + 0.08, 0.09, 0.18);
    this.noise(t + 0.2, 0.06, 0.12, 'highpass', 3000);
  }
  speak(text) {
    this.radioBeep();
    if (!this.voiceOn || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES'; u.rate = 1.08; u.pitch = 0.85; u.volume = Math.min(1, this.vol.sfx);
      speechSynthesis.speak(u);
    } catch (e) { /* sin síntesis */ }
  }

  // ---- rotor del helicóptero (bucle) ----
  startRotor() {
    if (!this.ctx || this.rotorSrc) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const g = this.ctx.createGain(); g.gain.value = 0;
    const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 13;
    const lg = this.ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(); lfo.start();
    this.rotorSrc = s; this.rotorGain = g;
  }
  setRotor(level) {
    if (this.rotorGain && this.ctx) this.rotorGain.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.3);
  }

  // ---- música dinámica generativa ----
  // Secuenciador por pasos: bajo + pad en calma; + percusión y arpegio con amenaza alta.
  updateMusic(dt) {
    if (!this.ctx || !this.playing) return;
    const stepDur = 0.24 - this.intensity * 0.07;
    this.musicTimer += dt;
    if (this.musicTimer < stepDur) return;
    this.musicTimer = 0;
    const t = this.now() + 0.02;
    const s = this.step++;
    const minor = [110, 110, 130.8, 98, 110, 164.8, 146.8, 130.8]; // A2 C3 G2...
    const root = minor[(s >> 1) % minor.length];
    // bajo pulsante
    if (s % 2 === 0) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = root / 2;
      f.type = 'lowpass'; f.frequency.value = 220 + this.intensity * 600;
      g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 2.2);
      o.connect(f); f.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + stepDur * 2.4);
    }
    // pad turbio cada 16 pasos
    if (s % 16 === 0) {
      [root, root * 1.189, root * 1.498].forEach(fr => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = fr;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 16);
        o.connect(g); g.connect(this.musicBus);
        o.start(t); o.stop(t + stepDur * 16 + 0.1);
      });
    }
    // percusión con amenaza
    if (this.intensity > 0.35) {
      if (s % 2 === 1) this.pNoise(t, 0.05, 0.10 + this.intensity * 0.12, 'highpass', 6000); // hat
      if (s % 4 === 0) this.pOsc(t, 'sine', 120, 40, 0.18, 0.28); // kick
      if (s % 8 === 6) this.pNoise(t, 0.12, 0.16, 'bandpass', 2000, 1); // caja
    }
    // arpegio tenso con amenaza alta
    if (this.intensity > 0.65 && s % 2 === 1) {
      const arp = [root * 2, root * 2.378, root * 2.996, root * 4];
      this.pOsc(t, 'square', arp[(s >> 1) % 4], arp[(s >> 1) % 4], 0.12, 0.05);
    }
  }
  pOsc(t, type, f0, f1, dur, gain) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  pNoise(t, dur, gain, type, freq, q) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.musicBus);
    s.start(t); s.stop(t + dur + 0.05);
  }
}
