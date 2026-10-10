// Ruimtelijk geluid: stemmen (ElevenLabs), galm van de ruimte en
// procedureel gemaakte geluidseffecten (heftruck, claxon, remmen, voetstappen, kantine).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.muted = false;
    this._levelBuf = null;
    // Galm van de ruimte: lengte (s), verloop en hoeveel galm. Standaard een grote hal.
    this.room = { seconds: 2.8, decay: 3.0, wet: 0.32 };
  }

  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    // Galm van de ruimte (zie this.room).
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(this.room.seconds, this.room.decay);
    this.wet = ctx.createGain();
    this.wet.gain.value = this.room.wet;
    this.reverb.connect(this.wet).connect(this.master);

    this.noise = this._noiseBuffer(3);
    this.dry = ctx.createGain(); // niet-ruimtelijk (eigen voetstappen, hartslag)
    this.dry.gain.value = 1;
    this.dry.connect(this.master);
    return true;
  }

  get ready() {
    return !!this.ctx;
  }

  resume() {
    return this.ctx?.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const pre = Math.floor(ctx.sampleRate * 0.018);
      for (let i = pre; i < len; i++) {
        const k = (i - pre) / (len - pre);
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, decay) * (i < pre * 3 ? 0.6 : 1);
      }
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Haalt de bytes al op voordat er een AudioContext is (die mag pas na een klik).
  async prefetch(id, url) {
    this._raw = this._raw || new Map();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      this._raw.set(id, await res.arrayBuffer());
      return true;
    } catch (e) {
      console.warn('Geluid niet geladen:', url, e);
      return false;
    }
  }

  async decodeAll() {
    if (!this.ctx || !this._raw) return;
    const jobs = [];
    for (const [id, ab] of this._raw) {
      if (this.buffers.has(id)) continue;
      jobs.push(
        new Promise((ok, fail) => this.ctx.decodeAudioData(ab.slice(0), ok, fail))
          .then((buf) => this.buffers.set(id, buf))
          .catch((e) => console.warn('Geluid niet gedecodeerd:', id, e)),
      );
    }
    await Promise.all(jobs);
  }

  // Een ruimtelijke bron. Geeft een PannerNode terug om op te verplaatsen.
  spatial({ ref = 1.6, rolloff = 1.1, wet = 1 } = {}) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 80;
    p.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = wet;
    p.connect(send).connect(this.reverb);
    p.send = send;
    return p;
  }

  // Uitgang voor de eigen stem van de speler: dichtbij, met een vleugje hal.
  selfOut() {
    const g = this.ctx.createGain();
    g.gain.value = 0.85;
    g.connect(this.master);
    const send = this.ctx.createGain();
    send.gain.value = 0.16;
    g.connect(send).connect(this.reverb);
    return g;
  }

  setWet(panner, wet) {
    if (panner?.send) panner.send.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.1);
  }

  // Ademgeluid: gefilterde ruis, harder bij uitademen (hijgen).
  breather(dest) {
    const ctx = this.ctx;
    const n = this._noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    n.connect(bp).connect(hp).connect(g).connect(dest);
    n.start(0, Math.random() * 2);
    return {
      set(level, out) {
        const t = ctx.currentTime;
        bp.frequency.setTargetAtTime(out ? 1100 : 1700, t, 0.08);
        g.gain.setTargetAtTime(Math.max(0, level) * 0.05, t, 0.06);
      },
    };
  }

  // Omroepgong in de verte (ding-dong).
  chime(dest) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    [[659, 0], [523, 0.55]].forEach(([f, off]) => {
      for (const [mul, amp] of [[1, 0.05], [2, 0.012], [3, 0.006]]) {
        const o = this._osc('sine', f * mul);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0 + off);
        g.gain.linearRampToValueAtTime(amp, t0 + off + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 1.8);
        o.connect(g).connect(dest);
        o.start(t0 + off);
        o.stop(t0 + off + 1.9);
      }
    });
  }

  place(panner, v) {
    if (!panner) return;
    const t = this.ctx.currentTime;
    if (panner.positionX) {
      panner.positionX.setTargetAtTime(v.x, t, 0.03);
      panner.positionY.setTargetAtTime(v.y, t, 0.03);
      panner.positionZ.setTargetAtTime(v.z, t, 0.03);
    } else panner.setPosition(v.x, v.y, v.z);
  }

  updateListener(pos, fwd, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // Speelt een stemregel af op een ruimtelijke bron. Analyser stuurt de lipsync.
  voice(id, panner) {
    const buf = this.buffers.get(id);
    if (!this.ctx || !buf) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1.35;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.2;
    src.connect(g);
    g.connect(an);
    g.connect(panner);
    const ended = new Promise((r) => (src.onended = r));
    const startTime = ctx.currentTime;
    src.start(startTime);
    return { duration: buf.duration, analyser: an, ended, startTime, stop: () => { try { src.stop(); } catch (e) { /* al gestopt */ } } };
  }

  level(an) {
    if (!an) return 0;
    if (!this._levelBuf || this._levelBuf.length !== an.fftSize) this._levelBuf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(this._levelBuf);
    let s = 0;
    for (let i = 0; i < this._levelBuf.length; i++) s += this._levelBuf[i] * this._levelBuf[i];
    return Math.sqrt(s / this._levelBuf.length);
  }

  // Volume en grove klankkleur (laag/hoog) voor de lipsync.
  features(an) {
    const level = this.level(an);
    if (!this._freq || this._freq.length !== an.frequencyBinCount) this._freq = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(this._freq);
    const hz = this.ctx.sampleRate / an.fftSize;
    let low = 0;
    let mid = 0;
    let high = 0;
    for (let i = 1; i < this._freq.length; i++) {
      const f = i * hz;
      const v = this._freq[i];
      if (f < 600) low += v;
      else if (f < 2200) mid += v;
      else if (f < 7000) high += v * 0.8;
    }
    const sum = low + mid + high + 1;
    return { level, low: low / sum, high: high / sum };
  }

  _osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  _noiseSrc(loop = true) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = loop;
    return n;
  }

  // Elektrische heftruck: motorgejank + banden + hydrauliek.
  engine(dest) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(dest);

    const whine = this._osc('triangle', 210);
    const whine2 = this._osc('sine', 420);
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    const w2g = ctx.createGain();
    w2g.gain.value = 0.02;
    whine.connect(wg).connect(out);
    whine2.connect(w2g).connect(out);

    const hum = this._osc('sawtooth', 50);
    const humF = ctx.createBiquadFilter();
    humF.type = 'lowpass';
    humF.frequency.value = 160;
    const hg = ctx.createGain();
    hg.gain.value = 0.12;
    hum.connect(humF).connect(hg).connect(out);

    const tyres = this._noiseSrc();
    const tf = ctx.createBiquadFilter();
    tf.type = 'lowpass';
    tf.frequency.value = 380;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    tyres.connect(tf).connect(tg).connect(out);

    [whine, whine2, hum, tyres].forEach((n) => n.start());
    const self = this;
    return {
      set(speed, on = true) {
        const t = ctx.currentTime;
        const v = Math.min(1, Math.abs(speed) / 4);
        out.gain.setTargetAtTime(on ? 0.55 : 0, t, 0.15);
        whine.frequency.setTargetAtTime(200 + v * 520, t, 0.12);
        whine2.frequency.setTargetAtTime(400 + v * 1040, t, 0.12);
        wg.gain.setTargetAtTime(0.02 + v * 0.07, t, 0.1);
        tg.gain.setTargetAtTime(v * 0.5, t, 0.1);
      },
      ctx: self,
    };
  }

  // Achteruitrijpieper.
  beeper(dest) {
    const ctx = this.ctx;
    const o = this._osc('sine', 1180);
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(dest);
    o.start();
    let timer = null;
    return {
      on() {
        if (timer) return;
        const tick = () => {
          const t = ctx.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.16, t + 0.01);
          g.gain.setValueAtTime(0.16, t + 0.4);
          g.gain.linearRampToValueAtTime(0, t + 0.42);
        };
        tick();
        timer = setInterval(tick, 850);
      },
      off() {
        clearInterval(timer);
        timer = null;
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      },
    };
  }

  horn(dest, at = 0) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    [0, 0.34].forEach((off, i) => {
      const len = i === 0 ? 0.24 : 0.55;
      const o1 = this._osc('square', 392);
      const o2 = this._osc('sawtooth', 494);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0 + off);
      g.gain.linearRampToValueAtTime(0.32, t0 + off + 0.015);
      g.gain.setValueAtTime(0.32, t0 + off + len);
      g.gain.linearRampToValueAtTime(0, t0 + off + len + 0.04);
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(dest);
      [o1, o2].forEach((o) => {
        o.start(t0 + off);
        o.stop(t0 + off + len + 0.1);
      });
    });
  }

  screech(dest, dur = 1.0) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this._noiseSrc();
    const b1 = ctx.createBiquadFilter();
    b1.type = 'bandpass';
    b1.Q.value = 9;
    b1.frequency.setValueAtTime(2900, t);
    b1.frequency.exponentialRampToValueAtTime(1500, t + dur);
    const b2 = ctx.createBiquadFilter();
    b2.type = 'bandpass';
    b2.Q.value = 14;
    b2.frequency.setValueAtTime(4100, t);
    b2.frequency.exponentialRampToValueAtTime(2300, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.06);
    g.gain.setValueAtTime(0.8, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(b1).connect(g);
    n.connect(b2).connect(g);
    g.connect(dest);
    n.start(t);
    n.stop(t + dur + 0.1);
    // Klap van de mast die naar voren zwiept.
    this.clank(dest, dur - 0.05, 160);
  }

  clank(dest, at = 0, freq = 240) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const n = this._noiseSrc(false);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 18;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1.6, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
    n.stop(t + 0.6);
  }

  step(gain = 0.22, dest = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this._noiseSrc(false);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700 + Math.random() * 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    n.connect(f).connect(g);
    g.connect(dest || this.dry);
    if (!dest) {
      const send = ctx.createGain();
      send.gain.value = 0.5;
      g.connect(send).connect(this.reverb);
    }
    n.start(t, Math.random() * 2);
    n.stop(t + 0.15);
  }

  heartbeat(beats = 4, interval = 0.95, gain = 0.7) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < beats; i++) {
      [0, 0.2].forEach((off, j) => {
        const t = t0 + i * interval + off;
        const o = this._osc('sine', 62);
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
        const g = ctx.createGain();
        const a = gain * (j === 0 ? 1 : 0.65) * (1 - i / (beats + 1));
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(this.dry);
        o.start(t);
        o.stop(t + 0.2);
      });
    }
  }

  // Achtergrond van de hal: lage brom, ventilatie en af en toe iets in de verte.
  ambience() {
    if (!this.ctx || this._amb) return;
    const ctx = this.ctx;
    const n = this._noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0.11;
    n.connect(lp).connect(g).connect(this.master);
    const n2 = this._noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.4;
    const g2 = ctx.createGain();
    g2.gain.value = 0.012;
    n2.connect(bp).connect(g2).connect(this.master);
    n.start();
    n2.start(0, 1.3);
    this._amb = true;
  }

  // Willekeurige geluiden ver weg in de hal.
  distantEvent(dest) {
    if (!this.ctx) return;
    const r = Math.random();
    if (r > 0.9) {
      this.chime(dest);
      return;
    }
    if (r < 0.45) {
      // pieper van een andere heftruck
      const ctx = this.ctx;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const o = this._osc('sine', 1060);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.8);
        g.gain.linearRampToValueAtTime(0.05, t + i * 0.8 + 0.01);
        g.gain.setValueAtTime(0.05, t + i * 0.8 + 0.35);
        g.gain.linearRampToValueAtTime(0, t + i * 0.8 + 0.37);
        o.connect(g).connect(dest);
        o.start(t + i * 0.8);
        o.stop(t + i * 0.8 + 0.4);
      }
    } else {
      this.clank(dest, 0, 180 + Math.random() * 200);
    }
  }

  // ---------- Kantine ----------

  // Geroezemoes van een tafel verderop: stemachtig gebrom door twee formantfilters,
  // met lettergreep- en zinsritme (langzame en snelle modulatie door elkaar).
  murmur(dest, level = 1) {
    const ctx = this.ctx;
    // Bron: brommende stem (zaagtand met vibrato) en adem (ruis).
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    const voice = this._osc('sawtooth', 105 + Math.random() * 90);
    const vib = this._osc('sine', 0.7 + Math.random());
    const vibG = ctx.createGain();
    vibG.gain.value = 14;
    vib.connect(vibG).connect(voice.frequency);
    const vg = ctx.createGain();
    vg.gain.value = 0.35;
    voice.connect(vg).connect(mix);
    const breath = this._noiseSrc();
    const bg = ctx.createGain();
    bg.gain.value = 0.5;
    breath.connect(bg).connect(mix);
    // Lettergrepen (twee onregelmatige ritmes) en pauzes tussen zinnen.
    const amp = ctx.createGain();
    amp.gain.value = 0.045 * level;
    amp.connect(dest);
    for (const [f, q, g] of [[480 + Math.random() * 160, 2.2, 1], [1350 + Math.random() * 500, 3, 0.55]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = g;
      mix.connect(bp).connect(fg).connect(amp);
    }
    for (const [f, d] of [[4.1 + Math.random(), 0.022], [6.3 + Math.random() * 1.4, 0.016], [0.17 + Math.random() * 0.1, 0.03]]) {
      const lfo = this._osc('sine', f);
      const lg = ctx.createGain();
      lg.gain.value = d * level;
      lfo.connect(lg).connect(amp.gain);
      lfo.start();
    }
    voice.start();
    vib.start();
    breath.start(0, Math.random() * 2);
  }

  // Lage roomtoon van een kleine ruimte: ventilatie en het brommen van de koelkast.
  roomTone() {
    if (!this.ctx || this._roomTone) return;
    const ctx = this.ctx;
    const n = this._noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    n.connect(lp).connect(g).connect(this.master);
    const hum = this._osc('sine', 100);
    const hg = ctx.createGain();
    hg.gain.value = 0.004;
    hum.connect(hg).connect(this.master);
    n.start(0, 0.7);
    hum.start();
    this._roomTone = true;
  }

  // Bestek tegen een bord of een lepel in een kopje.
  clink(dest, gain = 0.035) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = 2100 + Math.random() * 1300;
    for (const [mul, a, len] of [[1, 1, 0.22], [2.76, 0.45, 0.12], [4.1, 0.25, 0.06]]) {
      const o = this._osc('sine', base * mul);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * a, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + len + 0.02);
    }
  }

  // Stoel die over de vloer schuift.
  scrape(dest, dur = 0.35, gain = 0.22) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this._noiseSrc(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.linearRampToValueAtTime(640, t + dur);
    const rough = this._osc('square', 38);
    const rg = ctx.createGain();
    rg.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.04);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const am = ctx.createGain();
    am.gain.value = 0.5;
    rough.connect(rg).connect(am.gain);
    n.connect(bp).connect(am).connect(g).connect(dest);
    n.start(t, Math.random() * 2);
    rough.start(t);
    n.stop(t + dur + 0.05);
    rough.stop(t + dur + 0.05);
  }

  // Koffieautomaat: bonen malen, daarna stoom en een straaltje koffie.
  coffee(dest) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const grind = this._noiseSrc(false);
    const gb = ctx.createBiquadFilter();
    gb.type = 'bandpass';
    gb.frequency.value = 950;
    gb.Q.value = 1.6;
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(0.07, t + 0.15);
    gg.gain.setValueAtTime(0.07, t + 2.3);
    gg.gain.linearRampToValueAtTime(0, t + 2.5);
    const rattle = this._osc('sawtooth', 31);
    const rg = ctx.createGain();
    rg.gain.value = 0.03;
    rattle.connect(rg).connect(gg.gain);
    grind.connect(gb).connect(gg).connect(dest);
    grind.start(t);
    grind.stop(t + 2.6);
    rattle.start(t);
    rattle.stop(t + 2.6);
    const hiss = this._noiseSrc(false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2400;
    hp.Q.value = 0.8;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0, t + 2.6);
    hg.gain.linearRampToValueAtTime(0.03, t + 2.9);
    hg.gain.setValueAtTime(0.03, t + 4.6);
    hg.gain.linearRampToValueAtTime(0, t + 5.2);
    hiss.connect(hp).connect(hg).connect(dest);
    hiss.start(t + 2.6, 0.5);
    hiss.stop(t + 5.3);
  }
}
