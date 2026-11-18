/* Everything you hear, synthesised. No audio files, no fetches: an engine
   that tracks road speed, a two-tone siren that follows the heat, a noise
   burst for the pistol and for boots on concrete, and a slow pad with a
   heartbeat under it so the city is never silent. The graph is only built
   after the first click or key press, which is what browsers ask for. */

export class Audio {
  constructor() {
    this.ready = false;
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.siren = null;
    this.bed = null;
    this.musicOn = true;
    this.stepTimer = 0;
    this.pulseTimer = 1.4;
    this.sirenClock = 0;
    this.engineLevel = 0;
  }

  /* --- graph ---------------------------------------------------------- */

  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);

      this._noiseBuffer();
      this._engineVoice();
      this._sirenVoice();
      this._bedVoice();
      this.ready = true;
      return true;
    } catch (err) {
      this.ready = false;
      return false;
    }
  }

  _noiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
  }

  _engineVoice() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 4.5;

    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    low.frequency.value = 52;
    const high = ctx.createOscillator();
    high.type = 'square';
    high.frequency.value = 78;

    const highGain = ctx.createGain();
    highGain.gain.value = 0.35;
    low.connect(filter);
    high.connect(highGain).connect(filter);
    filter.connect(gain).connect(this.master);

    // a slow wobble so the note never sits still
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 6.2;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 2.6;
    wobble.connect(wobbleGain);
    wobbleGain.connect(low.frequency);
    wobbleGain.connect(high.frequency);

    low.start();
    high.start();
    wobble.start();
    this.engine = { low, high, filter, gain };
  }

  _sirenVoice() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 660;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 780;
    filter.Q.value = 1.4;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    this.siren = { osc, gain, filter };
  }

  _bedVoice() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(gain).connect(this.master);

    const notes = [110, 146.83, 164.81, 220];
    const oscs = [];
    notes.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = hz;
      const voice = ctx.createGain();
      voice.gain.value = i === 3 ? 0.1 : 0.16;
      osc.connect(voice).connect(filter);
      osc.start();
      oscs.push(osc);
    });

    // the filter breathes; the pad never quite repeats
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    this.bed = { gain, filter, oscs };
  }

  /* --- one-shots ------------------------------------------------------ */

  _burst(duration, frequency, q, level, type = 'lowpass') {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  shot() {
    if (!this.ready) return;
    this._burst(0.22, 1600, 0.7, 0.5);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  footstep(running = false) {
    this._burst(running ? 0.09 : 0.07, running ? 900 : 640, 0.9, running ? 0.12 : 0.07);
  }

  hit() {
    this._burst(0.14, 420, 1.2, 0.22);
  }

  click() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  payout() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz;
      const gain = ctx.createGain();
      const at = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.55);
    });
  }

  startle() {
    this._burst(0.18, 2200, 1.6, 0.09, 'bandpass');
  }

  /* --- the moving parts ----------------------------------------------- */

  update(dt, state) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const speed = Math.max(0, state.speed || 0);
    const driving = Boolean(state.driving);
    const wanted = state.wanted ? 1 : 0;

    const level = driving ? Math.min(1, 0.24 + speed * 0.035) : 0;
    this.engineLevel += (level - this.engineLevel) * Math.min(1, dt * 4);
    this.engine.gain.gain.setTargetAtTime(this.engineLevel * 0.13, now, 0.08);
    this.engine.low.frequency.setTargetAtTime(46 + speed * 2.9, now, 0.1);
    this.engine.high.frequency.setTargetAtTime(70 + speed * 4.4, now, 0.1);
    this.engine.filter.frequency.setTargetAtTime(380 + speed * 58, now, 0.12);

    this.sirenClock += dt;
    const sirenOn = Boolean(state.siren);
    const sirenLevel = sirenOn ? 0.05 : 0;
    this.siren.gain.gain.setTargetAtTime(sirenLevel, now, 0.15);
    if (sirenOn) {
      const tone = Math.floor(this.sirenClock * 2.2) % 2 === 0 ? 660 : 940;
      this.siren.osc.frequency.setTargetAtTime(tone, now, 0.02);
    }

    if (this.bed) {
      const bedLevel = this.musicOn ? 0.055 : 0;
      this.bed.gain.gain.setTargetAtTime(bedLevel, now, 1.2);
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 2.6;
        this._pulse();
      }
    }

    this.stepTimer -= dt;
    if (state.walking && this.stepTimer <= 0) {
      this.stepTimer = state.running ? 0.32 : 0.52;
      this.footstep(state.running);
    }
  }

  _pulse() {
    if (!this.ready || !this.musicOn) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58, now);
    osc.frequency.exponentialRampToValueAtTime(41, now + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  setMuted(muted) {
    this.musicOn = !muted;
    if (this.ready) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.1);
  }
}
