import { SANKYO_18_TINES, SoundChamberPreset, NatureAmbienceSettings } from '../types';

class MusicBoxAudioEngine {
  private ctx: AudioContext | null = null;
  private initPromise: Promise<void> | null = null;

  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private chamberFilter: BiquadFilterNode | null = null;
  private chamberToneFilter: BiquadFilterNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;

  // Mechanical background noise nodes
  private gearGain: GainNode | null = null;
  private gearOsc: OscillatorNode | null = null;

  // Nature ambiance nodes
  private natureMasterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private fireGain: GainNode | null = null;
  private forestGain: GainNode | null = null;
  private windChimeGain: GainNode | null = null;
  private streamGain: GainNode | null = null;

  // State tracking
  private activeNatureIntervals: number[] = [];
  public currentPreset: SoundChamberPreset = 'gold-sankyo';
  public currentNatureSettings: NatureAmbienceSettings = {
    rain: 0,
    fire: 0,
    forest: 0,
    windChime: 0,
    stream: 0,
  };
  public currentMasterVolume = 0.9;
  public isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch {
          // ignore
        }
      }
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioContextClass();

        if (this.ctx.state === 'suspended') {
          try {
            await this.ctx.resume();
          } catch {
            // will resume on gesture
          }
        }

        // Master output bus
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.currentMasterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // Music Box bus
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

        // Chamber primary peaking filter (wood/metal coloration)
        this.chamberFilter = this.ctx.createBiquadFilter();
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.value = 2200;
        this.chamberFilter.Q.value = 1.4;
        this.chamberFilter.gain.value = 4;

        // Chamber secondary tone shaping filter (warmth/air)
        this.chamberToneFilter = this.ctx.createBiquadFilter();
        this.chamberToneFilter.type = 'highshelf';
        this.chamberToneFilter.frequency.value = 4500;
        this.chamberToneFilter.gain.value = 1.5;

        // Dry & Wet paths for spatial chamber resonance
        this.dryGain = this.ctx.createGain();
        this.wetGain = this.ctx.createGain();
        this.dryGain.gain.value = 0.85;
        this.wetGain.gain.value = 0.3;

        this.musicGain.connect(this.chamberFilter);
        this.chamberFilter.connect(this.chamberToneFilter);
        this.chamberToneFilter.connect(this.dryGain);
        this.dryGain.connect(this.masterGain);

        // Build convolver with acoustic impulse response
        this.rebuildChamberConvolver(1.5, 0.45, 'gold');
        this.wetGain.connect(this.masterGain);

        // Setup mechanical gear hum
        this.setupGearHum();

        // Setup nature ambiance sub-system
        this.setupNatureAmbiance();

        // Apply any queued preset & nature settings
        this.applyChamberPreset(this.currentPreset);
        this.updateNatureVolumes(this.currentNatureSettings);

        this.isInitialized = true;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public async resumeIfNeeded(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // ignore
      }
    }
  }

  // Create an acoustic impulse response modeled after metallic & wooden resonant music box chambers
  private createMusicBoxImpulseResponse(
    ctx: AudioContext,
    duration: number,
    decay: number,
    coloration: 'gold' | 'wood' | 'crystal' | 'vintage' = 'gold'
  ): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1024, Math.floor(sampleRate * duration));
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // Resonant modes based on chamber body material
    let r1 = 480, r2 = 1250, r3 = 2400, r4 = 4200;
    if (coloration === 'wood') {
      r1 = 320; r2 = 640; r3 = 1100; r4 = 1900;
    } else if (coloration === 'crystal') {
      r1 = 1200; r2 = 2400; r3 = 4800; r4 = 7200;
    } else if (coloration === 'vintage') {
      r1 = 400; r2 = 820; r3 = 1600; r4 = 2800;
    }

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * (decay * 3.6));

      const ring1 = Math.sin(2 * Math.PI * r1 * t) * 0.18;
      const ring2 = Math.sin(2 * Math.PI * r2 * t) * 0.12;
      const ring3 = Math.sin(2 * Math.PI * r3 * t) * 0.08;
      const ring4 = Math.sin(2 * Math.PI * r4 * t) * 0.04;

      const noiseL = (Math.random() * 2 - 1) * 0.6 + ring1 + ring2 + ring3 + ring4;
      const noiseR = (Math.random() * 2 - 1) * 0.6 + ring1 * 0.85 - ring2 + ring3 * 0.9 - ring4 * 0.7;

      left[i] = noiseL * env;
      right[i] = noiseR * env;
    }
    return impulse;
  }

  private rebuildChamberConvolver(duration: number, decay: number, coloration: 'gold' | 'wood' | 'crystal' | 'vintage') {
    if (!this.ctx || !this.chamberToneFilter || !this.wetGain) return;

    try {
      if (this.reverbNode) {
        try {
          this.reverbNode.disconnect();
        } catch {
          // ignore
        }
      }

      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this.createMusicBoxImpulseResponse(this.ctx, duration, decay, coloration);
      this.chamberToneFilter.connect(this.reverbNode);
      this.reverbNode.connect(this.wetGain);
    } catch (e) {
      console.warn('Convolver rebuild error:', e);
    }
  }

  public applyChamberPreset(preset: SoundChamberPreset): void {
    this.currentPreset = preset;
    if (!this.ctx || !this.dryGain || !this.wetGain || !this.chamberFilter || !this.chamberToneFilter) return;

    const now = this.ctx.currentTime;
    switch (preset) {
      case 'gold-sankyo':
        // Crisp, sparkling gold movement chime with clear highs and bell chime resonance
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(2200, now, 0.05);
        this.chamberFilter.gain.setTargetAtTime(4.5, now, 0.05);
        this.chamberFilter.Q.setTargetAtTime(1.4, now, 0.05);

        this.chamberToneFilter.type = 'highshelf';
        this.chamberToneFilter.frequency.setTargetAtTime(4800, now, 0.05);
        this.chamberToneFilter.gain.setTargetAtTime(2.0, now, 0.05);

        this.dryGain.gain.setTargetAtTime(0.85, now, 0.05);
        this.wetGain.gain.setTargetAtTime(0.32, now, 0.05);
        this.rebuildChamberConvolver(1.4, 0.5, 'gold');
        break;

      case 'wooden-box':
        // Deep, rich resonant mahogany box body with warm woody resonance
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(450, now, 0.05);
        this.chamberFilter.gain.setTargetAtTime(6.5, now, 0.05);
        this.chamberFilter.Q.setTargetAtTime(1.1, now, 0.05);

        this.chamberToneFilter.type = 'lowpass';
        this.chamberToneFilter.frequency.setTargetAtTime(4200, now, 0.05);
        this.chamberToneFilter.gain.setTargetAtTime(0, now, 0.05);

        this.dryGain.gain.setTargetAtTime(0.72, now, 0.05);
        this.wetGain.gain.setTargetAtTime(0.48, now, 0.05);
        this.rebuildChamberConvolver(2.3, 0.32, 'wood');
        break;

      case 'crystal-bell':
        // Ethereal crystal bell shimmer with long celestial ring & sparkling sheen
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(3600, now, 0.05);
        this.chamberFilter.gain.setTargetAtTime(5.5, now, 0.05);
        this.chamberFilter.Q.setTargetAtTime(2.2, now, 0.05);

        this.chamberToneFilter.type = 'highshelf';
        this.chamberToneFilter.frequency.setTargetAtTime(5500, now, 0.05);
        this.chamberToneFilter.gain.setTargetAtTime(5.0, now, 0.05);

        this.dryGain.gain.setTargetAtTime(0.68, now, 0.05);
        this.wetGain.gain.setTargetAtTime(0.60, now, 0.05);
        this.rebuildChamberConvolver(2.8, 0.22, 'crystal');
        break;

      case 'vintage-antique':
        // Warm nostalgic antique chime with subtle 19th-century patina
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(950, now, 0.05);
        this.chamberFilter.gain.setTargetAtTime(3.5, now, 0.05);
        this.chamberFilter.Q.setTargetAtTime(1.0, now, 0.05);

        this.chamberToneFilter.type = 'lowpass';
        this.chamberToneFilter.frequency.setTargetAtTime(3200, now, 0.05);
        this.chamberToneFilter.gain.setTargetAtTime(0, now, 0.05);

        this.dryGain.gain.setTargetAtTime(0.80, now, 0.05);
        this.wetGain.gain.setTargetAtTime(0.38, now, 0.05);
        this.rebuildChamberConvolver(1.7, 0.42, 'vintage');
        break;
    }
  }

  // Play a brief harmonic preview chord/arpeggio to audition chamber timbre
  public playAuditionChime(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Play tines 6 (C6), 10 (E6), 13 (G6) in quick arpeggio
    this.playTine(6, 0.75);
    setTimeout(() => this.playTine(10, 0.7), 110);
    setTimeout(() => this.playTine(13, 0.8), 220);
  }

  // Play an authentic steel tine sound when struck by a cylinder pin
  public playTine(tineIndex: number, velocity = 1.0): void {
    if (!this.ctx || !this.musicGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const tine = SANKYO_18_TINES[tineIndex];
    if (!tine) return;

    const now = this.ctx.currentTime;
    const baseFreq = tine.frequency;

    // Realistic steel cantilever physics:
    // f1 = fundamental
    // f2 ≈ 6.27 * f1 (first inharmonic overtone)
    // f3 ≈ 17.55 * f1 (second inharmonic overtone)
    const f1 = baseFreq;
    const f2 = baseFreq * 6.267;
    const f3 = Math.min(baseFreq * 17.54, 18000);

    // Decay rate scales with pitch (lower notes ring ~3.0s, higher notes ring ~1.4s)
    const decayFactor = Math.max(1.1, 3.2 - (tineIndex / 18) * 1.6);

    // 1. Fundamental Oscillator (Warm pure tone)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(f1, now);

    // Slight micro-pitch drift on initial pluck
    osc1.frequency.exponentialRampToValueAtTime(f1 * 0.9992, now + 0.04);
    osc1.frequency.setValueAtTime(f1, now + 0.07);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(0.6 * velocity, now + 0.003); // rapid 3ms attack
    gain1.gain.exponentialRampToValueAtTime(0.00001, now + decayFactor);

    osc1.connect(gain1);
    gain1.connect(this.musicGain);

    osc1.start(now);
    osc1.stop(now + decayFactor + 0.05);

    // 2. First Inharmonic Metallic Ring (Gives music box its unmistakable bell ping)
    if (f2 < 18000) {
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(f2, now);

      const f2Decay = Math.min(decayFactor * 0.28, 0.5);
      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.linearRampToValueAtTime(0.22 * velocity, now + 0.002);
      gain2.gain.exponentialRampToValueAtTime(0.00001, now + f2Decay);

      osc2.connect(gain2);
      gain2.connect(this.musicGain);

      osc2.start(now);
      osc2.stop(now + f2Decay + 0.05);
    }

    // 3. Second High Inharmonic Shimmer
    if (f3 < 19000 && tineIndex < 12) {
      const osc3 = this.ctx.createOscillator();
      const gain3 = this.ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(f3, now);

      const f3Decay = 0.09;
      gain3.gain.setValueAtTime(0.0001, now);
      gain3.gain.linearRampToValueAtTime(0.09 * velocity, now + 0.001);
      gain3.gain.exponentialRampToValueAtTime(0.00001, now + f3Decay);

      osc3.connect(gain3);
      gain3.connect(this.musicGain);

      osc3.start(now);
      osc3.stop(now + f3Decay + 0.02);
    }

    // 4. Mechanical Pluck Transient (The physical contact click of brass pin lifting steel tine)
    this.playPluckClick(now, baseFreq, velocity);
  }

  // Plectrum pluck noise transient
  private playPluckClick(time: number, baseFreq: number, velocity: number): void {
    if (!this.ctx || !this.musicGain) return;

    const bufferSize = Math.floor(this.ctx.sampleRate * 0.018);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.min(baseFreq * 3.2, 7500), time);
    filter.Q.setValueAtTime(3.5, time);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.14 * velocity, time);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);

    noiseSource.connect(filter);
    filter.connect(clickGain);
    clickGain.connect(this.musicGain);

    noiseSource.start(time);
    noiseSource.stop(time + 0.02);
  }

  // Mechanical winding ratchet click sound
  public playWindingClick(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.025);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1850, now);
    filter.Q.setValueAtTime(4.0, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  // Setup gentle mechanical gear / governor whirring hum
  private setupGearHum(): void {
    if (!this.ctx || !this.masterGain) return;

    this.gearGain = this.ctx.createGain();
    this.gearGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.gearOsc = this.ctx.createOscillator();
    this.gearOsc.type = 'sine';
    this.gearOsc.frequency.setValueAtTime(78, this.ctx.currentTime);

    const gearFilter = this.ctx.createBiquadFilter();
    gearFilter.type = 'lowpass';
    gearFilter.frequency.setValueAtTime(220, this.ctx.currentTime);

    this.gearOsc.connect(gearFilter);
    gearFilter.connect(this.gearGain);
    this.gearGain.connect(this.masterGain);
    this.gearOsc.start();
  }

  public setMechanicalHum(active: boolean, speed = 1.0): void {
    if (!this.ctx || !this.gearGain || !this.gearOsc) return;
    const now = this.ctx.currentTime;

    if (active) {
      this.gearOsc.frequency.setTargetAtTime(70 * Math.max(0.5, speed), now, 0.1);
      this.gearGain.gain.setTargetAtTime(0.028, now, 0.15);
    } else {
      this.gearGain.gain.setTargetAtTime(0.00001, now, 0.2);
    }
  }

  // Seamless procedural noise buffer generator
  private createNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
    const bufferSize = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0, b6L = 0;
    let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0, b6R = 0;

    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;

      b0L = 0.99886 * b0L + whiteL * 0.0555179;
      b1L = 0.99332 * b1L + whiteL * 0.0750759;
      b2L = 0.96900 * b2L + whiteL * 0.1538520;
      b3L = 0.86650 * b3L + whiteL * 0.3104856;
      b4L = 0.55000 * b4L + whiteL * 0.5329522;
      b5L = -0.7616 * b5L - whiteL * 0.0168980;
      left[i] = (b0L + b1L + b2L + b3L + b4L + b5L + b6L + whiteL * 0.5362) * 0.11;
      b6L = whiteL * 0.115926;

      b0R = 0.99886 * b0R + whiteR * 0.0555179;
      b1R = 0.99332 * b1R + whiteR * 0.0750759;
      b2R = 0.96900 * b2R + whiteR * 0.1538520;
      b3R = 0.86650 * b3R + whiteR * 0.3104856;
      b4R = 0.55000 * b4R + whiteR * 0.5329522;
      b5R = -0.7616 * b5R - whiteR * 0.0168980;
      right[i] = (b0R + b1R + b2R + b3R + b4R + b5R + b6R + whiteR * 0.5362) * 0.11;
      b6R = whiteR * 0.115926;
    }

    // Crossfade start/end 1500 samples for seamless loop with no click
    const fadeLen = Math.min(2000, Math.floor(bufferSize * 0.05));
    for (let i = 0; i < fadeLen; i++) {
      const alpha = i / fadeLen;
      left[i] = left[i] * alpha + left[bufferSize - fadeLen + i] * (1 - alpha);
      right[i] = right[i] * alpha + right[bufferSize - fadeLen + i] * (1 - alpha);
    }

    return buffer;
  }

  // Setup nature ambiance sub-system
  private setupNatureAmbiance(): void {
    if (!this.ctx || !this.masterGain) return;

    this.natureMasterGain = this.ctx.createGain();
    this.natureMasterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
    this.natureMasterGain.connect(this.masterGain);

    // 1. Rain Bus
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.rainGain.connect(this.natureMasterGain);
    this.initRainGenerator();

    // 2. Fire Bus
    this.fireGain = this.ctx.createGain();
    this.fireGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.fireGain.connect(this.natureMasterGain);
    this.initFireGenerator();

    // 3. Forest Breeze & Birdsong Bus
    this.forestGain = this.ctx.createGain();
    this.forestGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.forestGain.connect(this.natureMasterGain);
    this.initForestGenerator();

    // 4. Wind Chimes Bus
    this.windChimeGain = this.ctx.createGain();
    this.windChimeGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.windChimeGain.connect(this.natureMasterGain);
    this.initWindChimeGenerator();

    // 5. Mountain Stream Bus
    this.streamGain = this.ctx.createGain();
    this.streamGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.streamGain.connect(this.natureMasterGain);
    this.initStreamGenerator();
  }

  // Rain: gentle ambient patter + periodic soft water droplet pings
  private initRainGenerator(): void {
    if (!this.ctx || !this.rainGain) return;

    const noiseBuffer = this.createNoiseBuffer(this.ctx, 4);
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    this.rainFilter = this.ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(180, this.ctx.currentTime);

    source.connect(this.rainFilter);
    this.rainFilter.connect(highpass);
    highpass.connect(this.rainGain);
    source.start();

    // Occasional raindrop droplet plops
    const dropInterval = window.setInterval(() => {
      if (!this.ctx || !this.rainGain || this.currentNatureSettings.rain <= 0.05) return;
      if (Math.random() < 0.45) {
        const now = this.ctx.currentTime;
        const dropOsc = this.ctx.createOscillator();
        const dropGain = this.ctx.createGain();
        dropOsc.type = 'sine';

        const f = 1600 + Math.random() * 1200;
        dropOsc.frequency.setValueAtTime(f, now);
        dropOsc.frequency.exponentialRampToValueAtTime(f * 0.6, now + 0.04);

        dropGain.gain.setValueAtTime(0.0001, now);
        dropGain.gain.linearRampToValueAtTime(0.04 * this.currentNatureSettings.rain, now + 0.002);
        dropGain.gain.exponentialRampToValueAtTime(0.00001, now + 0.045);

        dropOsc.connect(dropGain);
        dropGain.connect(this.rainGain);
        dropOsc.start(now);
        dropOsc.stop(now + 0.05);
      }
    }, 280);

    this.activeNatureIntervals.push(dropInterval);
  }

  // Fire: low soothing hearth rumble + natural wood ember crackles
  private initFireGenerator(): void {
    if (!this.ctx || !this.fireGain) return;

    const noiseBuffer = this.createNoiseBuffer(this.ctx, 4);
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(380, this.ctx.currentTime);

    source.connect(lowpass);
    lowpass.connect(this.fireGain);
    source.start();

    // Natural wood ember pops and crackles (driven by currentNatureSettings.fire)
    const crackleInterval = window.setInterval(() => {
      if (!this.ctx || !this.fireGain || this.currentNatureSettings.fire <= 0.05) return;
      if (Math.random() < 0.48) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const crackleGain = this.ctx.createGain();
        osc.type = Math.random() > 0.5 ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(1200 + Math.random() * 2600, now);

        const popVol = (0.04 + Math.random() * 0.05) * this.currentNatureSettings.fire;
        crackleGain.gain.setValueAtTime(0.0001, now);
        crackleGain.gain.linearRampToValueAtTime(popVol, now + 0.001);
        crackleGain.gain.exponentialRampToValueAtTime(0.00001, now + 0.018);

        osc.connect(crackleGain);
        crackleGain.connect(this.fireGain);
        osc.start(now);
        osc.stop(now + 0.025);
      }
    }, 320);

    this.activeNatureIntervals.push(crackleInterval);
  }

  // Forest: gentle wind rustling in leaves + authentic melodic bird trills
  private initForestGenerator(): void {
    if (!this.ctx || !this.forestGain) return;

    const noiseBuffer = this.createNoiseBuffer(this.ctx, 5);
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.6, this.ctx.currentTime);

    source.connect(filter);
    filter.connect(this.forestGain);
    source.start();

    // Distant sweet birdsong whistles
    const birdInterval = window.setInterval(() => {
      if (!this.ctx || !this.forestGain || this.currentNatureSettings.forest <= 0.05) return;
      if (Math.random() < 0.4) {
        const now = this.ctx.currentTime;
        const birdOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        birdOsc.type = 'sine';

        const baseF = 2200 + Math.random() * 900;
        birdOsc.frequency.setValueAtTime(baseF, now);
        birdOsc.frequency.exponentialRampToValueAtTime(baseF * 1.35, now + 0.07);
        birdOsc.frequency.exponentialRampToValueAtTime(baseF * 0.95, now + 0.16);

        const birdVol = 0.035 * this.currentNatureSettings.forest;
        bGain.gain.setValueAtTime(0.0001, now);
        bGain.gain.linearRampToValueAtTime(birdVol, now + 0.015);
        bGain.gain.exponentialRampToValueAtTime(0.00001, now + 0.18);

        birdOsc.connect(bGain);
        bGain.connect(this.forestGain);
        birdOsc.start(now);
        birdOsc.stop(now + 0.2);
      }
    }, 1400);

    this.activeNatureIntervals.push(birdInterval);
  }

  // Wind Chimes: serene pentatonic bell strikes with spatial shimmer
  private initWindChimeGenerator(): void {
    if (!this.ctx || !this.windChimeGain) return;
    const chimePitches = [1174.66, 1318.51, 1567.98, 1760.00, 2093.00, 2349.32, 2637.02];

    const chimeInterval = window.setInterval(() => {
      if (!this.ctx || !this.windChimeGain || this.currentNatureSettings.windChime <= 0.05) return;
      if (Math.random() < 0.42) {
        const now = this.ctx.currentTime;
        const pitch = chimePitches[Math.floor(Math.random() * chimePitches.length)];

        // Fundamental tube ring
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(pitch, now);

        const chimeVol = 0.055 * this.currentNatureSettings.windChime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(chimeVol, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.00001, now + 2.4);

        osc.connect(gain);
        gain.connect(this.windChimeGain);
        osc.start(now);
        osc.stop(now + 2.5);

        // High metallic overtone
        const overtoneOsc = this.ctx.createOscillator();
        const overtoneGain = this.ctx.createGain();
        overtoneOsc.type = 'triangle';
        overtoneOsc.frequency.setValueAtTime(pitch * 2.76, now);

        overtoneGain.gain.setValueAtTime(0.0001, now);
        overtoneGain.gain.linearRampToValueAtTime(chimeVol * 0.35, now + 0.002);
        overtoneGain.gain.exponentialRampToValueAtTime(0.00001, now + 0.6);

        overtoneOsc.connect(overtoneGain);
        overtoneGain.connect(this.windChimeGain);
        overtoneOsc.start(now);
        overtoneOsc.stop(now + 0.65);
      }
    }, 1100);

    this.activeNatureIntervals.push(chimeInterval);
  }

  // Mountain Stream: dual-band bubbling water noise
  private initStreamGenerator(): void {
    if (!this.ctx || !this.streamGain) return;

    const noiseBuffer = this.createNoiseBuffer(this.ctx, 4);
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter1 = this.ctx.createBiquadFilter();
    filter1.type = 'bandpass';
    filter1.frequency.setValueAtTime(850, this.ctx.currentTime);
    filter1.Q.setValueAtTime(2.2, this.ctx.currentTime);

    const filter2 = this.ctx.createBiquadFilter();
    filter2.type = 'peaking';
    filter2.frequency.setValueAtTime(1400, this.ctx.currentTime);
    filter2.gain.setValueAtTime(5, this.ctx.currentTime);

    source.connect(filter1);
    filter1.connect(filter2);
    filter2.connect(this.streamGain);
    source.start();
  }

  // Update volume levels of all nature ambiance layers in real time
  public updateNatureVolumes(settings: NatureAmbienceSettings): void {
    this.currentNatureSettings = { ...settings };
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const now = this.ctx.currentTime;

    // Gain multipliers calibrated for lush mixing without clipping
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(settings.rain * 0.65, now, 0.05);
    }
    if (this.fireGain) {
      this.fireGain.gain.setTargetAtTime(settings.fire * 0.60, now, 0.05);
    }
    if (this.forestGain) {
      this.forestGain.gain.setTargetAtTime(settings.forest * 0.55, now, 0.05);
    }
    if (this.windChimeGain) {
      this.windChimeGain.gain.setTargetAtTime(settings.windChime * 0.70, now, 0.05);
    }
    if (this.streamGain) {
      this.streamGain.gain.setTargetAtTime(settings.stream * 0.55, now, 0.05);
    }
  }

  public setMasterVolume(vol: number): void {
    this.currentMasterVolume = Math.max(0, Math.min(1, vol));
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(this.currentMasterVolume, this.ctx.currentTime, 0.04);
  }

  public setMusicVolume(vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime, 0.04);
  }

  public cleanup(): void {
    this.activeNatureIntervals.forEach((id) => clearInterval(id));
    this.activeNatureIntervals = [];
  }
}

export const musicBoxAudio = new MusicBoxAudioEngine();
