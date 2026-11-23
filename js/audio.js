import { attackSounds, defeatSounds } from './sound-profiles.js';

// Original procedural sound: no recordings, external assets, or autoplay.
// Sources use the AudioContext clock; each capture owns a cancellable group.
export const DEFEAT_CRY_DURATION = 2;

export const footstepStyles = {
  p: { frequency: 155, level: .12, grit: .08, duration: .09, steps: [.08, .52] },
  n: { frequency: 125, level: .18, grit: .1, duration: .085, steps: [.02, .22, .52, .72] },
  r: { frequency: 90, level: .3, grit: .2, duration: .13, steps: [.06, .52] },
  q: { frequency: 200, level: .075, grit: .04, duration: .075, steps: [.08, .5] },
  k: { frequency: 105, level: .24, grit: .15, duration: .12, steps: [.08, .54] },
};

export class BattleAudio {
  constructor({ contextFactory = () => {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('Web Audio unavailable');
    return new Context();
  }, setIntervalFn = setInterval, clearIntervalFn = clearInterval, onStateChange = () => {} } = {}) {
    this.contextFactory = contextFactory; this.onStateChange = onStateChange; this.lastError = null;
    // Firefox checks the receiver of native Window timers. Calling a saved
    // timer as this.setInterval() would incorrectly pass the BattleAudio object.
    this.setInterval = (callback, delay) => setIntervalFn.call(globalThis, callback, delay);
    this.clearInterval = id => clearIntervalFn.call(globalThis, id);
    this.context = null; this.enabled = false; this.hidden = false;
    this.ambienceEnabled = true; this.screamsEnabled = true; this.shoutsEnabled = true;
    this.volume = .65; this.ambienceVolume = .6; this.effectsVolume = .85; this.voicesVolume = .8;
    this.effects = new Set(); this.ambient = new Set(); this.cries = new Set(); this.shouts = new Set(); this.revision = 0;
    this.timer = null; this.waves = new Map(); this.noise = null;
  }

  init() {
    if (this.context) return;
    const context = this.contextFactory();
    this.context = context;
    this.master = context.createGain();
    this.ambientBus = context.createGain(); this.effectsBus = context.createGain(); this.voicesBus = context.createGain();
    context.onstatechange = () => this.onStateChange();
    // Dry playback is the essential path. Optional room effects must never
    // prevent sound on browsers/devices with restricted audio processing.
    try {
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12; limiter.knee.value = 16; limiter.ratio.value = 8;
      this.master.connect(limiter); limiter.connect(context.destination);
    } catch { this.master.disconnect(); this.master.connect(context.destination); }
    this.ambientBus.connect(this.master); this.effectsBus.connect(this.master); this.voicesBus.connect(this.master);
    try {
      const reverb = context.createConvolver();
      const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 1.1), context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3) * .35;
      }
      reverb.buffer = impulse;
      const wet = context.createGain(); wet.gain.value = .18;
      this.ambientBus.connect(reverb); this.effectsBus.connect(reverb); this.voicesBus.connect(reverb);
      reverb.connect(wet); wet.connect(this.master);
    } catch { /* Direct sound remains available without reverb. */ }
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.context) return;
    const time = this.context.currentTime;
    for (const [node, value] of [[this.master, this.enabled && !this.hidden ? this.volume : 0],
      [this.ambientBus, this.ambienceVolume], [this.effectsBus, this.effectsVolume], [this.voicesBus, this.voicesVolume]]) {
      if (!node) continue;
      node.gain.cancelScheduledValues(time);
      node.gain.setTargetAtTime(value, time, .025);
    }
  }
  setVolume(kind, value) {
    if (!['volume', 'ambienceVolume', 'effectsVolume', 'voicesVolume'].includes(kind) || !Number.isFinite(value)) return;
    this[kind] = Math.max(0, Math.min(1, value)); this.applyVolumes(); this.onStateChange();
  }
  async setEnabled(enabled) {
    const revision = ++this.revision;
    this.enabled = enabled; this.lastError = null;
    if (!enabled) {
      this.stopAll(); this.applyVolumes();
      await this.context?.suspend().catch(() => {});
      this.onStateChange(); return false;
    }
    try {
      this.init();
      // Called directly from a click, before yielding to any other async work.
      if (!this.hidden) await this.context.resume();
      if (revision !== this.revision) return this.enabled;
      if (!this.hidden && this.context.state !== 'running') throw new Error(`Audio is ${this.context.state}. Tap Enable audio to retry.`);
      this.applyVolumes(); this.startAmbience(); this.onStateChange(); return true;
    } catch (error) {
      if (revision === this.revision) {
        this.enabled = false;
        this.lastError = `${error.name || 'Audio error'}: ${error.message || 'The browser could not start sound.'}`.slice(0, 240);
        this.stopAll(); this.applyVolumes();
        const failedContext = this.context; this.context = null;
        this.waves.clear(); this.noise = null;
        await failedContext?.close().catch(() => {});
        this.onStateChange();
      }
      return false;
    }
  }
  setAmbience(enabled) { this.ambienceEnabled = enabled; if (enabled) this.startAmbience(); else this.stopAmbience(); }
  setScreams(enabled) {
    this.screamsEnabled = enabled;
    if (!enabled) for (const stop of [...this.cries]) stop();
  }
  setShouts(enabled) {
    this.shoutsEnabled = enabled;
    if (!enabled) for (const stop of [...this.shouts]) stop();
  }
  async setHidden(hidden) {
    this.hidden = hidden;
    if (hidden) { this.stopAll(); this.applyVolumes(); await this.context?.suspend().catch(() => {}); }
    else if (this.enabled) await this.setEnabled(true);
  }

  group(bus, collection, signal) {
    const gain = this.context.createGain(); gain.connect(bus);
    const sources = new Set(); let stopped = false;
    const cancel = () => {
      if (stopped) return;
      stopped = true;
      signal?.removeEventListener('abort', cancel);
      gain.disconnect(); collection.delete(cancel);
      for (const source of [...sources]) {
        try { source.stop(); } catch { /* Already ended. */ }
        source.onended?.();
      }
    };
    cancel.add = (source, nodes) => {
      sources.add(source);
      source.onended = () => {
        sources.delete(source);
        for (const node of nodes) node.disconnect();
        if (!sources.size) cancel();
      };
    };
    cancel.output = gain; collection.add(cancel);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    return cancel;
  }
  tone(group, { frequency, endFrequency = frequency, when, duration, level = .1, type = 'sine', wave, detune = 0, sustain = false, vibrato = 0 }) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    if (wave) oscillator.setPeriodicWave(wave); else oscillator.type = type;
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), when + duration);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(level, when + Math.min(.045, duration * .15));
    if (sustain) {
      envelope.gain.setValueAtTime(level, when + duration * .78);
      envelope.gain.linearRampToValueAtTime(0, when + duration);
    } else envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    oscillator.connect(envelope); envelope.connect(group.output);
    group.add(oscillator, [oscillator, envelope]);
    if (vibrato) {
      const modulation = this.context.createOscillator();
      const depth = this.context.createGain();
      modulation.frequency.value = 11; depth.gain.value = vibrato;
      modulation.connect(depth); depth.connect(oscillator.detune);
      group.add(modulation, [modulation, depth]);
      modulation.start(when); modulation.stop(when + duration + .01);
    }
    oscillator.start(when); oscillator.stop(when + duration + .01);
  }
  breath(group, { when, duration, level = .1, frequency = 1500 }) {
    if (!this.noise) {
      this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = this.context.createBufferSource(); source.buffer = this.noise;
    source.loop = duration > 1;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .8;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, when); envelope.gain.linearRampToValueAtTime(level, when + duration * .2);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(group.output);
    group.add(source, [source, filter, envelope]); source.start(when); source.stop(when + duration + .01);
  }

  footstep(group, type, when, maximumDuration = Infinity) {
    const style = footstepStyles[type];
    if (!style) return;
    const duration = Math.min(style.duration, maximumDuration);
    if (duration <= .015) return;
    // Low thump plus an audible midrange boot/armor knock for phone speakers.
    this.tone(group, { frequency: style.frequency, endFrequency: style.frequency * .55, when, duration, level: style.level });
    this.tone(group, { frequency: style.frequency * 2.4, endFrequency: style.frequency * 1.8, when, duration: duration * .75, level: style.level * .5, type: 'triangle' });
    this.breath(group, { when, duration: duration * .7, level: style.grit, frequency: type === 'n' ? 1700 : 1000 });
  }
  walk(group, type, start, seconds) {
    const style = footstepStyles[type];
    if (!style) return; // Mages glide without boot sounds.
    for (const offset of seconds > 0 ? style.steps : [0]) {
      const at = offset * seconds;
      this.footstep(group, type, start + at, seconds > 0 ? seconds - at - .025 : style.duration);
    }
  }
  move(types, durationMs, signal) {
    if (!this.enabled || this.hidden || this.context?.state !== 'running' || signal?.aborted) return () => {};
    const group = this.group(this.effectsBus, this.effects, signal);
    try {
      const start = this.context.currentTime + .015;
      for (const type of types) this.walk(group, type, start, durationMs / 1000);
      if (types.every(type => !footstepStyles[type])) group();
      return group;
    } catch { group(); return () => {}; }
  }
  preview() {
    if (!this.enabled || this.hidden || this.context?.state !== 'running') return false;
    this.stopEffects();
    const group = this.group(this.effectsBus, this.effects);
    try {
      const start = this.context.currentTime + .02;
      this.tone(group, { frequency: 440, when: start, duration: .18, level: .18, type: 'triangle' });
      this.tone(group, { frequency: 660, when: start + .18, duration: .18, level: .16, type: 'triangle' });
      this.footstep(group, 'r', start + .4);
      return true;
    } catch (error) {
      group(); this.lastError = `Sound test failed: ${error.message}`.slice(0, 240); this.onStateChange(); return false;
    }
  }

  // Formant-shaped harmonics approximate low male "ah/oh" vowels. The melody
  // uses D Dorian and unison voices, with no sampled singing or sung lyrics.
  vowel(frequency, open = false) {
    const key = `${frequency}:${open}`;
    if (this.waves.has(key)) return this.waves.get(key);
    const real = new Float32Array(49); const imaginary = new Float32Array(49);
    const formants = open ? [[700, 180], [1100, 230], [2500, 350]] : [[400, 130], [850, 180], [2400, 300]];
    for (let harmonic = 1; harmonic < imaginary.length; harmonic++) {
      const hz = frequency * harmonic;
      imaginary[harmonic] = (.08 + formants.reduce((sum, [center, width]) => sum + Math.exp(-.5 * ((hz - center) / width) ** 2), 0)) / harmonic;
    }
    const wave = this.context.createPeriodicWave(real, imaginary);
    this.waves.set(key, wave); return wave;
  }

  metalStrike(group, base, when, duration, weight) {
    // Inharmonic resonances, a low blade/shield body hit, and a rough scrape
    // create weight rather than a single bell-like note.
    for (const [ratio, level] of [[1, .17], [1.53, .11], [2.47, .065], [4.13, .035]]) {
      this.tone(group, { frequency: base * ratio, endFrequency: base * ratio * .96,
        when, duration: duration / Math.sqrt(ratio), level, type: 'triangle' });
    }
    this.tone(group, { frequency: base * .48, endFrequency: 65, when, duration: .14, level: weight });
    this.breath(group, { when, duration: .09, level: .19, frequency: 2400 });
    this.breath(group, { when: when + .045, duration: .14, level: .1, frequency: 1700 });
  }
  attackSound(group, type, start, seconds) {
    const profile = attackSounds[type];
    const impact = start + seconds * .6;
    const swish = at => this.breath(group, { when: at, duration: .12, level: .16, frequency: 1900 });
    if (seconds > 0) this.walk(group, type, start, seconds * .25);
    if (type === 'b') {
      this.tone(group, { frequency: 220, endFrequency: 1100, when: Math.max(start, impact - .22), duration: .24, level: .12 });
      for (const frequency of [730, 1120, 1530]) this.tone(group, { frequency, endFrequency: frequency * .6, when: impact, duration: .24, level: .065 });
      this.breath(group, { when: impact, duration: .19, level: .15, frequency: 2800 });
    } else {
      swish(Math.max(start, impact - .14));
      if (type === 'q') {
        swish(start + seconds * .34);
        this.metalStrike(group, profile.metal, start + seconds * .44, .16, .12);
      }
      this.metalStrike(group, profile.metal, impact, profile.ring, profile.weight);
      if (type === 'n') this.breath(group, { when: impact, duration: .12, level: .22, frequency: 650 });
      if (type === 'r') {
        this.tone(group, { frequency: 95, endFrequency: 32, when: impact, duration: .26, level: .3 });
        this.breath(group, { when: impact, duration: .2, level: .23, frequency: 450 });
      }
      if (type === 'k') this.tone(group, { frequency: 196, endFrequency: 98, when: impact, duration: .23, level: .14, type: 'triangle' });
    }
  }
  attackShout(group, type, when) {
    const [frequency, endFrequency, duration] = attackSounds[type].shout;
    this.tone(group, { frequency, endFrequency, when, duration, level: .14,
      wave: this.vowel(frequency, true), vibrato: 18, sustain: true });
    this.breath(group, { when, duration: duration * .85, level: .075, frequency: 1100 });
  }
  defeatCry(group, type, when) {
    const profile = defeatSounds[type];
    const overlap = .035;
    const total = profile.segments.reduce((sum, segment) => sum + segment[2], 0);
    const scale = (DEFEAT_CRY_DURATION + overlap * (profile.segments.length - 1)) / total;
    let offset = 0;
    for (const [frequency, endFrequency, weight] of profile.segments) {
      const duration = weight * scale;
      this.tone(group, { frequency, endFrequency, when: when + offset, duration, level: type === 'r' ? .2 : .17,
        wave: this.vowel(frequency, profile.open), vibrato: type === 'r' ? 48 : 38, sustain: true });
      offset += duration - overlap;
    }
    // Ragged breaths under the held voice, fading into a last gasp.
    for (const [delay, level] of [[0, 1], [.5, .8], [1, .65], [1.5, .4]]) {
      this.breath(group, { when: when + delay, duration: .35, level: profile.grit * level, frequency: type === 'r' ? 650 : 1200 });
    }
    if (profile.horse) {
      this.tone(group, { frequency: 680, endFrequency: 250, when: when + .03, duration: .65,
        level: .075, wave: this.vowel(420, false), vibrato: 45, sustain: true });
    }
    if (profile.magic) this.tone(group, { frequency: 880, endFrequency: 160, when: when + .025, duration: 1.7, level: .055 });
  }
  wetImpact(group, when) {
    // Short low squelches and irregular splatter transients, without assets.
    for (const [delay, pitch, level] of [[0, 170, .15], [.045, 115, .1], [.09, 85, .065]]) {
      this.tone(group, { frequency: pitch, endFrequency: 38, when: when + delay, duration: .11, level });
      this.breath(group, { when: when + delay, duration: .09, level: level * .8, frequency: 550 });
    }
  }
  fallSound(group, type, when) {
    const profile = defeatSounds[type];
    if (profile.magic) this.breath(group, { when, duration: .14, level: .1, frequency: 2400 });
    else {
      this.tone(group, { frequency: profile.fall, endFrequency: profile.fall * .55, when,
        duration: .14, level: type === 'r' ? .16 : .085, type: 'triangle' });
      this.breath(group, { when, duration: .1, level: type === 'r' ? .17 : .06, frequency: type === 'n' ? 1700 : 900 });
    }
  }
  capture(type, durationMs, signal, victimType = 'p') {
    if (!this.enabled || this.hidden || this.context?.state !== 'running' || signal?.aborted
      || !attackSounds[type] || !defeatSounds[victimType]) return () => {};
    const group = this.group(this.effectsBus, this.effects, signal);
    const voices = [];
    const cancel = () => { group(); for (const voice of voices) voice(); };
    try {
      const start = this.context.currentTime + .015;
      const seconds = durationMs / 1000;
      const impact = start + seconds * .6;
      this.attackSound(group, type, start, seconds);
      this.wetImpact(group, impact + .015);
      this.fallSound(group, victimType, start + seconds * .82);
      if (this.shoutsEnabled) {
        const shout = this.group(this.voicesBus, this.shouts, signal); voices.push(shout);
        this.attackShout(shout, type, start + seconds * .28);
      }
      if (this.screamsEnabled) {
        // Two overlapping tails are enough for rapid play on modest devices.
        while (this.cries.size >= 2) this.cries.values().next().value();
        const cry = this.group(this.voicesBus, this.cries, signal); voices.push(cry);
        this.defeatCry(cry, victimType, impact + .035);
      }
      return cancel;
    } catch { cancel(); return () => {}; }
  }
  previewBattle(type = 'p', victimType = 'p') {
    this.stopEffects();
    return this.capture(type, 1200, undefined, victimType);
  }

  startAmbience() {
    if (this.timer !== null || !this.enabled || !this.ambienceEnabled || this.hidden || this.context?.state !== 'running') return;
    this.noteIndex = 0; this.nextNote = this.context.currentTime + .05;
    const melody = [[50, 2], [53, 1], [55, 1], [57, 2], [59, 1], [57, 1], [55, 2], [52, 1], [50, 3]];
    const schedule = () => {
      if (this.hidden || !this.enabled || !this.ambienceEnabled) return;
      const now = this.context.currentTime;
      // A stalled tab never queues a burst of old notes on return.
      if (this.nextNote < now) this.nextNote = now + .05;
      try {
        while (this.nextNote < now + .5) {
          const [midi, beats] = melody[this.noteIndex % melody.length];
          const duration = beats * .62;
          const frequency = 440 * 2 ** ((midi - 69) / 12);
          const group = this.group(this.ambientBus, this.ambient);
          for (const detune of [-7, 0, 6]) this.tone(group, {
            frequency, when: this.nextNote, duration: duration * 1.03, level: .045,
            wave: this.vowel(frequency, this.noteIndex % 3 === 0), detune, sustain: true,
          });
          this.tone(group, { frequency: 73.42, when: this.nextNote, duration: duration * 1.03, level: .018, sustain: true });
          if (this.noteIndex % 4 === 0) this.tone(group, { frequency: 75, endFrequency: 34, when: this.nextNote, duration: .32, level: .055 });
          this.nextNote += duration; this.noteIndex++;
        }
      } catch { this.stopAmbience(); }
    };
    // Set first, so an error during initial scheduling can clear the interval.
    this.timer = this.setInterval(schedule, 200); schedule();
  }
  stopAmbience() {
    if (this.timer !== null) this.clearInterval(this.timer);
    this.timer = null;
    for (const stop of [...this.ambient]) stop();
  }
  stopEffects() { for (const stop of [...this.effects, ...this.cries, ...this.shouts]) stop(); }
  stopAll() { this.stopAmbience(); this.stopEffects(); }
  async destroy() { this.enabled = false; this.revision++; this.stopAll(); await this.context?.close(); }
}
