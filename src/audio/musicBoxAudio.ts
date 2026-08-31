import {
  SANKYO_18_TINES,
  ROMANTIC_FLAT_22_TINES,
  CHROMATIC_NOTE_FREQUENCIES,
  TineNote,
  SoundChamberPreset,
  NatureAmbienceSettings,
  SOUND_CHAMBER_PRESETS,
} from '../types';

class MusicBoxAudioEngine {
  private ctx: AudioContext | null = null;
  private initPromise: Promise<void> | null = null;

  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private chamberFilter: BiquadFilterNode | null = null;
  private chamberToneFilter: BiquadFilterNode | null = null;
  private chamberResonanceBoost: BiquadFilterNode | null = null;
  private vintageWaveShaper: WaveShaperNode | null = null;
  private chamberConvolver: ConvolverNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Mechanical background noise nodes
  private gearGain: GainNode | null = null;
  private gearOsc: OscillatorNode | null = null;
  public isMechanicalHumActive = false;

  // Nature ambiance nodes & lazy state tracking
  private natureMasterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainDropInterval: number | null = null;

  private fireGain: GainNode | null = null;
  private fireSource: AudioBufferSourceNode | null = null;
  private fireCrackleInterval: number | null = null;

  private forestGain: GainNode | null = null;
  private forestSource: AudioBufferSourceNode | null = null;
  private forestBirdInterval: number | null = null;

  private windChimeGain: GainNode | null = null;
  private windChimeInterval: number | null = null;

  private streamGain: GainNode | null = null;
  private streamSource: AudioBufferSourceNode | null = null;

  private cachedNoiseBuffer: AudioBuffer | null = null;

  // Cached pre-generated acoustic impulse responses
  private impulseCache: Map<SoundChamberPreset, AudioBuffer> = new Map();
  private auditionTimeouts: number[] = [];
  private idleSleepTimer: number | null = null;
  private activeVoiceStoppers: Set<(time: number) => void> = new Set();

  // State tracking
  public currentPreset: SoundChamberPreset = 'gold-sankyo';
  public chamberResonanceDepth = 1.0; // 0 to 1.5
  public chamberReverbAmount = 1.0; // 0 to 1.5
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

        // Real-time Waveform / Spectrum Analyser Node
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.75;

        // Master output bus
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.currentMasterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Music Box primary bus
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(0.88, this.ctx.currentTime);

        // Acoustic chamber primary formant resonance filter
        this.chamberFilter = this.ctx.createBiquadFilter();
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.value = 2600;
        this.chamberFilter.gain.value = 6.0;
        this.chamberFilter.Q.value = 1.4;

        // Secondary body resonance filter
        this.chamberResonanceBoost = this.ctx.createBiquadFilter();
        this.chamberResonanceBoost.type = 'peaking';
        this.chamberResonanceBoost.frequency.value = 920;
        this.chamberResonanceBoost.gain.value = 2.0;
        this.chamberResonanceBoost.Q.value = 1.8;

        // Chamber tone shaping filter (shelving/lowpass)
        this.chamberToneFilter = this.ctx.createBiquadFilter();
        this.chamberToneFilter.type = 'highshelf';
        this.chamberToneFilter.frequency.value = 5200;
        this.chamberToneFilter.gain.value = 3.5;

        // Vintage analog soft-saturation waveshaper
        this.vintageWaveShaper = this.ctx.createWaveShaper();
        this.vintageWaveShaper.curve = this.createVintageCurve(1.8);
        this.vintageWaveShaper.oversample = '2x';

        // Acoustic Chamber Impulse Reverbs (Parallel wet/dry network)
        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.setValueAtTime(0.72, this.ctx.currentTime);

        this.wetGain = this.ctx.createGain();
        this.wetGain.gain.setValueAtTime(0.38, this.ctx.currentTime);

        // Generate algorithmic impulse responses for each physical chamber
        const presets: SoundChamberPreset[] = [
          'gold-sankyo',
          'wooden-box',
          'crystal-bell',
          'vintage-antique',
          'retro-8bit',
        ];
        for (const preset of presets) {
          const impulseBuf = this.getOrCreateImpulseResponse(preset);
          if (impulseBuf) {
            this.impulseCache.set(preset, impulseBuf);
          }
        }

        // Single ConvolverNode — buffer is swapped when preset changes
        this.chamberConvolver = this.ctx.createConvolver();
        const currentImpulse = this.impulseCache.get(this.currentPreset);
        if (currentImpulse) {
          this.chamberConvolver.buffer = currentImpulse;
        }
        this.chamberConvolver.normalize = true;

        // Routing topology:
        // musicGain -> chamberFilter -> chamberResonanceBoost -> chamberToneFilter -> vintageWaveShaper
        // -> dryGain -> masterGain
        // -> Convolver -> convGain -> wetGain -> masterGain
        this.musicGain.connect(this.chamberFilter);
        this.chamberFilter.connect(this.chamberResonanceBoost);
        this.chamberResonanceBoost.connect(this.chamberToneFilter);
        this.chamberToneFilter.connect(this.vintageWaveShaper);

        // Split to dry & wet paths
        this.vintageWaveShaper.connect(this.dryGain);
        this.dryGain.connect(this.masterGain);

        // Single convolver wet path
        this.vintageWaveShaper.connect(this.chamberConvolver);
        this.chamberConvolver.connect(this.wetGain);
        this.wetGain.connect(this.masterGain);

        // Mechanical gear hum & governor click generator
        this.setupGearHum();

        // 5-layer Nature Ambience engine
        this.setupNatureAmbiance();

        // Apply initial preset parameters
        this.applyChamberPreset(this.currentPreset);

        this.isInitialized = true;
      } catch (err) {
        console.error('Failed to initialize Web Audio Engine:', err);
      }
    })();

    return this.initPromise;
  }

  public async resumeIfNeeded(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
    if (this.idleSleepTimer) {
      clearTimeout(this.idleSleepTimer);
      this.idleSleepTimer = null;
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // ignore
      }
    }
  }

  public resetIdleSleepTimer(): void {
    if (this.idleSleepTimer) {
      clearTimeout(this.idleSleepTimer);
      this.idleSleepTimer = null;
    }
    // Automatically suspend AudioContext when idle on mobile / iPad to save battery
    this.idleSleepTimer = window.setTimeout(() => {
      const isNaturePlaying = Object.values(this.currentNatureSettings).some((v) => v > 0.01);
      if (!isNaturePlaying && !this.isMechanicalHumActive && this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    }, 8500);
  }

  // Create subtle analog saturation curve for vintage warmth
  private createVintageCurve(amount = 2.0): Float32Array {
    const k = amount;
    const nSamples = 44100;
    const curve = new Float32Array(nSamples);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // Real-time live audio waveform extraction for visualizers
  public getWaveformData(dataArray: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(dataArray);
    } else {
      dataArray.fill(128);
    }
  }

  // Real-time live frequency spectrum data
  public getFrequencyData(dataArray: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(dataArray);
    } else {
      dataArray.fill(0);
    }
  }

  // Get or lazily pre-generate physically differentiated acoustic impulse response for each chamber
  private getOrCreateImpulseResponse(preset: SoundChamberPreset): AudioBuffer | null {
    if (!this.ctx) return null;

    if (this.impulseCache.has(preset)) {
      return this.impulseCache.get(preset)!;
    }

    const sampleRate = this.ctx.sampleRate;
    let duration = 0.45;
    let decayRate = 4.0;

    if (preset === 'gold-sankyo') {
      duration = 0.38;
      decayRate = 4.8;
    } else if (preset === 'wooden-box') {
      duration = 0.55;
      decayRate = 3.2;
    } else if (preset === 'crystal-bell') {
      duration = 0.70;
      decayRate = 2.4;
    } else if (preset === 'vintage-antique') {
      duration = 0.48;
      decayRate = 3.6;
    } else if (preset === 'retro-8bit') {
      duration = 0.22;
      decayRate = 7.2;
    }

    const length = Math.max(512, Math.floor(sampleRate * duration));
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * decayRate);

      if (preset === 'gold-sankyo') {
        const ring1 = Math.sin(2 * Math.PI * 1850 * t) * 0.25;
        const ring2 = Math.sin(2 * Math.PI * 3400 * t) * 0.18;
        const noiseL = (Math.random() * 2 - 1) * 0.4 + ring1 + ring2;
        const noiseR = (Math.random() * 2 - 1) * 0.4 + ring1 * 0.8 - ring2;
        left[i] = noiseL * env * 0.65;
        right[i] = noiseR * env * 0.65;
      } else if (preset === 'wooden-box') {
        const woodDamp = Math.exp(-t * 9.0);
        const ringWood1 = Math.sin(2 * Math.PI * 380 * t) * 0.40;
        const ringWood2 = Math.sin(2 * Math.PI * 720 * t) * 0.25;
        const bodyNoiseL = (Math.random() * 2 - 1) * 0.3 * woodDamp + ringWood1 + ringWood2;
        const bodyNoiseR = (Math.random() * 2 - 1) * 0.3 * woodDamp + ringWood1 * 0.9 - ringWood2 * 0.8;
        left[i] = bodyNoiseL * env * 0.85;
        right[i] = bodyNoiseR * env * 0.85;
      } else if (preset === 'crystal-bell') {
        const glass1 = Math.sin(2 * Math.PI * 1568 * t) * 0.32;
        const glass2 = Math.sin(2 * Math.PI * 3136 * t) * 0.24;
        const shimmerBeat = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.0 * t);
        const glassNoiseL = (Math.random() * 2 - 1) * 0.2 + (glass1 + glass2) * shimmerBeat;
        const glassNoiseR = (Math.random() * 2 - 1) * 0.2 + (glass1 * 0.85 - glass2) * shimmerBeat;
        left[i] = glassNoiseL * env * 0.8;
        right[i] = glassNoiseR * env * 0.8;
      } else if (preset === 'vintage-antique') {
        const flutter = 1.0 + 0.015 * Math.sin(2 * Math.PI * 4.5 * t);
        const antique1 = Math.sin(2 * Math.PI * 440 * flutter * t) * 0.32;
        const antique2 = Math.sin(2 * Math.PI * 880 * flutter * t) * 0.20;
        const antNoiseL = (Math.random() * 2 - 1) * 0.4 + antique1 + antique2;
        const antNoiseR = (Math.random() * 2 - 1) * 0.4 + antique1 * 0.9 - antique2 * 0.85;
        left[i] = antNoiseL * env * 0.7;
        right[i] = antNoiseR * env * 0.7;
      } else if (preset === 'retro-8bit') {
        const blip = (Math.random() > 0.5 ? 1 : -1) * 0.15;
        const cabL = (Math.random() * 2 - 1) * 0.25 + blip;
        const cabR = (Math.random() * 2 - 1) * 0.25 - blip;
        left[i] = cabL * env * 0.35;
        right[i] = cabR * env * 0.35;
      }
    }

    this.impulseCache.set(preset, impulse);
    return impulse;
  }

  // Apply highly differentiated acoustic chamber EQ, filters, and spatial balance
  public applyChamberPreset(preset: SoundChamberPreset): void {
    this.currentPreset = preset;
    if (
      !this.ctx ||
      !this.dryGain ||
      !this.wetGain ||
      !this.chamberFilter ||
      !this.chamberToneFilter ||
      !this.chamberResonanceBoost
    )
      return;

    const now = this.ctx.currentTime;
    const depth = this.chamberResonanceDepth;

    // Swap the single convolver's impulse response buffer
    if (this.chamberConvolver) {
      const newImpulse = this.impulseCache.get(preset);
      if (newImpulse) {
        this.chamberConvolver.buffer = newImpulse;
      }
    }

    switch (preset) {
      case 'gold-sankyo':
        // Option 1: Pure, bright, crystalline-metallic chime with high bell clarity
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(2800, now, 0.03);
        this.chamberFilter.gain.setTargetAtTime(6.0 * depth, now, 0.03);
        this.chamberFilter.Q.setTargetAtTime(1.6, now, 0.03);

        this.chamberResonanceBoost.type = 'peaking';
        this.chamberResonanceBoost.frequency.setTargetAtTime(1400, now, 0.03);
        this.chamberResonanceBoost.gain.setTargetAtTime(2.0 * depth, now, 0.03);
        this.chamberResonanceBoost.Q.setTargetAtTime(1.2, now, 0.03);

        this.chamberToneFilter.type = 'highshelf';
        this.chamberToneFilter.frequency.setTargetAtTime(5200, now, 0.03);
        this.chamberToneFilter.gain.setTargetAtTime(3.5, now, 0.03);

        this.dryGain.gain.setTargetAtTime(0.88, now, 0.03);
        this.wetGain.gain.setTargetAtTime(0.35 * this.chamberReverbAmount, now, 0.03);
        break;

      case 'wooden-box':
        // Option 2: Deep, warm, hollow acoustic mahogany soundboard resonance
        // Strong low-mid body boost at 380Hz and steep high-frequency damping
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(380, now, 0.03);
        this.chamberFilter.gain.setTargetAtTime(9.0 * depth, now, 0.03);
        this.chamberFilter.Q.setTargetAtTime(1.2, now, 0.03);

        this.chamberResonanceBoost.type = 'peaking';
        this.chamberResonanceBoost.frequency.setTargetAtTime(720, now, 0.03);
        this.chamberResonanceBoost.gain.setTargetAtTime(5.5 * depth, now, 0.03);
        this.chamberResonanceBoost.Q.setTargetAtTime(1.0, now, 0.03);

        this.chamberToneFilter.type = 'lowpass';
        this.chamberToneFilter.frequency.setTargetAtTime(3200, now, 0.03);
        this.chamberToneFilter.gain.setTargetAtTime(0, now, 0.03);

        this.dryGain.gain.setTargetAtTime(0.65, now, 0.03);
        this.wetGain.gain.setTargetAtTime(0.58 * this.chamberReverbAmount, now, 0.03);
        break;

      case 'crystal-bell':
        // Option 3: Sparkling celestial glass bell chime with ethereal ring & shimmer
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(4200, now, 0.03);
        this.chamberFilter.gain.setTargetAtTime(7.5 * depth, now, 0.03);
        this.chamberFilter.Q.setTargetAtTime(2.4, now, 0.03);

        this.chamberResonanceBoost.type = 'peaking';
        this.chamberResonanceBoost.frequency.setTargetAtTime(7800, now, 0.03);
        this.chamberResonanceBoost.gain.setTargetAtTime(6.0 * depth, now, 0.03);
        this.chamberResonanceBoost.Q.setTargetAtTime(1.8, now, 0.03);

        this.chamberToneFilter.type = 'highshelf';
        this.chamberToneFilter.frequency.setTargetAtTime(6000, now, 0.03);
        this.chamberToneFilter.gain.setTargetAtTime(6.5, now, 0.03);

        this.dryGain.gain.setTargetAtTime(0.60, now, 0.03);
        this.wetGain.gain.setTargetAtTime(0.70 * this.chamberReverbAmount, now, 0.03);
        break;

      case 'vintage-antique':
        // Option 4: 1880s Victorian antique chime with mellow patina, mid warmth & analog flutter
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(820, now, 0.03);
        this.chamberFilter.gain.setTargetAtTime(5.5 * depth, now, 0.03);
        this.chamberFilter.Q.setTargetAtTime(1.1, now, 0.03);

        this.chamberResonanceBoost.type = 'peaking';
        this.chamberResonanceBoost.frequency.setTargetAtTime(1650, now, 0.03);
        this.chamberResonanceBoost.gain.setTargetAtTime(3.5 * depth, now, 0.03);
        this.chamberResonanceBoost.Q.setTargetAtTime(1.5, now, 0.03);

        this.chamberToneFilter.type = 'lowpass';
        this.chamberToneFilter.frequency.setTargetAtTime(2600, now, 0.03);
        this.chamberToneFilter.gain.setTargetAtTime(0, now, 0.03);

        this.dryGain.gain.setTargetAtTime(0.78, now, 0.03);
        this.wetGain.gain.setTargetAtTime(0.42 * this.chamberReverbAmount, now, 0.03);
        break;

      case 'retro-8bit':
        // Option 5: 8-Bit Retro Arcade / Chiptune NES & Game Boy PSG Sound Engine
        // Warm, mellow retro gaming tones with softened square wave edges and gentle cabinet resonance
        this.chamberFilter.type = 'peaking';
        this.chamberFilter.frequency.setTargetAtTime(800, now, 0.03);
        this.chamberFilter.gain.setTargetAtTime(2.0 * depth, now, 0.03);
        this.chamberFilter.Q.setTargetAtTime(1.0, now, 0.03);

        this.chamberResonanceBoost.type = 'peaking';
        this.chamberResonanceBoost.frequency.setTargetAtTime(1800, now, 0.03);
        this.chamberResonanceBoost.gain.setTargetAtTime(1.2 * depth, now, 0.03);
        this.chamberResonanceBoost.Q.setTargetAtTime(0.9, now, 0.03);

        this.chamberToneFilter.type = 'lowpass';
        this.chamberToneFilter.frequency.setTargetAtTime(3200, now, 0.03);
        this.chamberToneFilter.gain.setTargetAtTime(0, now, 0.03);

        this.dryGain.gain.setTargetAtTime(0.72, now, 0.03);
        this.wetGain.gain.setTargetAtTime(0.26 * this.chamberReverbAmount, now, 0.03);
        break;
    }
  }

  public setChamberResonance(depth: number): void {
    this.chamberResonanceDepth = Math.max(0.1, Math.min(1.8, depth));
    if (!this.ctx || !this.chamberFilter || !this.chamberResonanceBoost) return;
    const now = this.ctx.currentTime;
    const currentDepth = this.chamberResonanceDepth;

    if (this.currentPreset === 'gold-sankyo') {
      this.chamberFilter.gain.setTargetAtTime(6.0 * currentDepth, now, 0.04);
      this.chamberResonanceBoost.gain.setTargetAtTime(2.0 * currentDepth, now, 0.04);
    } else if (this.currentPreset === 'wooden-box') {
      this.chamberFilter.gain.setTargetAtTime(9.0 * currentDepth, now, 0.04);
      this.chamberResonanceBoost.gain.setTargetAtTime(5.5 * currentDepth, now, 0.04);
    } else if (this.currentPreset === 'crystal-bell') {
      this.chamberFilter.gain.setTargetAtTime(7.5 * currentDepth, now, 0.04);
      this.chamberResonanceBoost.gain.setTargetAtTime(6.0 * currentDepth, now, 0.04);
    } else if (this.currentPreset === 'vintage-antique') {
      this.chamberFilter.gain.setTargetAtTime(5.5 * currentDepth, now, 0.04);
      this.chamberResonanceBoost.gain.setTargetAtTime(3.5 * currentDepth, now, 0.04);
    } else if (this.currentPreset === 'retro-8bit') {
      this.chamberFilter.gain.setTargetAtTime(2.0 * currentDepth, now, 0.04);
      this.chamberResonanceBoost.gain.setTargetAtTime(1.2 * currentDepth, now, 0.04);
    }
  }

  public setChamberReverb(amount: number): void {
    this.chamberReverbAmount = Math.max(0.1, Math.min(1.8, amount));
    if (!this.ctx || !this.wetGain) return;
    const now = this.ctx.currentTime;

    const baseWet =
      this.currentPreset === 'gold-sankyo'
        ? 0.35
        : this.currentPreset === 'wooden-box'
        ? 0.58
        : this.currentPreset === 'crystal-bell'
        ? 0.70
        : this.currentPreset === 'retro-8bit'
        ? 0.26
        : 0.42;

    this.wetGain.gain.setTargetAtTime(baseWet * this.chamberReverbAmount, now, 0.04);
  }

  // Play a rich harmonic chord/arpeggio to audition the distinct sound wave of each chamber
  public playAuditionChime(targetPreset?: SoundChamberPreset): void {
    if (targetPreset && targetPreset !== this.currentPreset) {
      this.applyChamberPreset(targetPreset);
    }
    if (!this.ctx) return;

    const now = this.getAudioTime();
    if (this.currentPreset === 'retro-8bit') {
      // Classic 8-bit game victory / coin fanfare arpeggio (gentle velocity)
      this.playTine(0, 0.70, now);
      this.playTine(4, 0.70, now + 0.08);
      this.playTine(7, 0.75, now + 0.16);
      this.playTine(12, 0.80, now + 0.24);
      this.playTine(16, 0.85, now + 0.32);
    } else {
      // Distinct audition arpeggio pattern (C5, G5, C6, E6, G6)
      this.playTine(0, 0.85, now);
      this.playTine(5, 0.80, now + 0.12);
      this.playTine(8, 0.85, now + 0.24);
      this.playTine(10, 0.90, now + 0.36);
      this.playTine(13, 0.95, now + 0.48);
    }
  }

  // Current AudioContext timestamp
  public getAudioTime(): number {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  // Play an authentic steel tine sound with physics tailored directly to the active acoustic chamber
  public playTine(tineIndex: number, velocity = 1.0, when?: number, customTines?: TineNote[]): void {
    if (!this.ctx || !this.musicGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const tinesList = customTines && customTines.length > 0 ? customTines : ROMANTIC_FLAT_22_TINES;
    const tine = tinesList[tineIndex] || SANKYO_18_TINES[tineIndex];
    if (!tine) return;

    this.playFrequency(tine.frequency, velocity, when, tineIndex, tinesList.length);
  }

  // Play a note by standard scientific pitch notation (e.g. 'Eb6', 'D#6', 'Ab5', 'Db6', 'Bb5', 'C5')
  public playNote(noteName: string, velocity = 1.0, when?: number): void {
    const freq = CHROMATIC_NOTE_FREQUENCIES[noteName];
    if (freq) {
      this.playFrequency(freq, velocity, when, 12, 24);
    }
  }

  // Core physical acoustic engine synthesizing steel tine vibration into resonant chamber
  public playFrequency(
    baseFreq: number,
    velocity = 1.0,
    when?: number,
    relativeIndex = 10,
    totalTines = 22
  ): void {
    if (!this.ctx || !this.musicGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    try {
      const now = typeof when === 'number' && when >= this.ctx.currentTime ? when : Math.max(0, this.ctx.currentTime);
      const preset = this.currentPreset;

      // Base decay scales with pitch (lower notes ring longer, higher notes ring shorter)
      const normalizedRatio = Math.max(0, Math.min(1, relativeIndex / Math.max(1, totalTines)));
      let decayFactor = Math.max(1.1, 3.4 - normalizedRatio * 1.7);

      // Differentiated sound generation based on acoustic chamber model:
      if (preset === 'gold-sankyo') {
        // 1. GOLD SANKYO: Pure sine + sharp 6.27x inharmonic bell ping + high shimmer
        const f1 = baseFreq;
        const f2 = baseFreq * 6.267;
        const f3 = Math.min(baseFreq * 17.54, 18000);

        // Fundamental oscillator
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(f1, now);
        osc1.frequency.exponentialRampToValueAtTime(f1 * 0.9992, now + 0.04);
        osc1.frequency.setValueAtTime(f1, now + 0.07);

        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.65 * velocity, now + 0.002); // 2ms crisp attack
        gain1.gain.exponentialRampToValueAtTime(0.00001, now + decayFactor);

        osc1.connect(gain1);
        gain1.connect(this.musicGain);

        let osc2: OscillatorNode | null = null;
        let gain2: GainNode | null = null;
        let osc3: OscillatorNode | null = null;
        let gain3: GainNode | null = null;

        // Inharmonic metallic bell ring (f2)
        if (f2 < 18000) {
          osc2 = this.ctx.createOscillator();
          gain2 = this.ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(f2, now);

          const f2Decay = Math.min(decayFactor * 0.32, 0.55);
          gain2.gain.setValueAtTime(0.0001, now);
          gain2.gain.linearRampToValueAtTime(0.24 * velocity, now + 0.001);
          gain2.gain.exponentialRampToValueAtTime(0.00001, now + f2Decay);

          osc2.connect(gain2);
          gain2.connect(this.musicGain);
          osc2.onended = () => {
            try {
              osc2?.disconnect();
              gain2?.disconnect();
            } catch {}
          };
          osc2.start(now);
          osc2.stop(now + f2Decay + 0.05);
        }

        // High shimmer (f3)
        if (f3 < 19000 && relativeIndex < totalTines * 0.7) {
          osc3 = this.ctx.createOscillator();
          gain3 = this.ctx.createGain();
          osc3.type = 'triangle';
          osc3.frequency.setValueAtTime(f3, now);

          const f3Decay = 0.10;
          gain3.gain.setValueAtTime(0.0001, now);
          gain3.gain.linearRampToValueAtTime(0.10 * velocity, now + 0.001);
          gain3.gain.exponentialRampToValueAtTime(0.00001, now + f3Decay);

          osc3.connect(gain3);
          gain3.connect(this.musicGain);
          osc3.onended = () => {
            try {
              osc3?.disconnect();
              gain3?.disconnect();
            } catch {}
          };
          osc3.start(now);
          osc3.stop(now + f3Decay + 0.02);
        }

        const stopper = (stopTime: number) => {
          try {
            gain1.gain.cancelScheduledValues(stopTime);
            gain1.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
            osc1.stop(stopTime + 0.01);
            if (osc2 && gain2) {
              gain2.gain.cancelScheduledValues(stopTime);
              gain2.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
              osc2.stop(stopTime + 0.01);
            }
            if (osc3 && gain3) {
              gain3.gain.cancelScheduledValues(stopTime);
              gain3.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
              osc3.stop(stopTime + 0.01);
            }
          } catch {}
        };
        this.activeVoiceStoppers.add(stopper);

        osc1.onended = () => {
          this.activeVoiceStoppers.delete(stopper);
          try {
            osc1.disconnect();
            gain1.disconnect();
          } catch {}
        };

        osc1.start(now);
        osc1.stop(now + decayFactor + 0.05);

        // Sharp metallic click
        this.playPluckClick(now, baseFreq, velocity, 'metallic');

      } else if (preset === 'wooden-box') {
        // 2. MAHOGANY BOX: Warm fundamental + rich 2nd & 3rd integer harmonics + softened wooden thud
        decayFactor *= 1.25; // Rich woody body sustain
        const f1 = baseFreq;
        const f2 = baseFreq * 2.0; // 2nd harmonic (octave body)
        const f3 = baseFreq * 3.0; // 3rd harmonic (fifth overtone)

        // Fundamental oscillator
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(f1, now);

        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.55 * velocity, now + 0.007); // Softer 7ms wood attack
        gain1.gain.exponentialRampToValueAtTime(0.00001, now + decayFactor);

        osc1.connect(gain1);
        gain1.connect(this.musicGain);

        // Warm 2nd harmonic body resonance
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(f2, now);

        const f2Decay = decayFactor * 0.65;
        gain2.gain.setValueAtTime(0.0001, now);
        gain2.gain.linearRampToValueAtTime(0.28 * velocity, now + 0.006);
        gain2.gain.exponentialRampToValueAtTime(0.00001, now + f2Decay);

        osc2.connect(gain2);
        gain2.connect(this.musicGain);
        osc2.onended = () => {
          try {
            osc2.disconnect();
            gain2.disconnect();
          } catch {}
        };
        osc2.start(now);
        osc2.stop(now + f2Decay + 0.05);

        let osc3: OscillatorNode | null = null;
        let gain3: GainNode | null = null;

        // Subtle 3rd harmonic woody color
        if (f3 < 12000) {
          osc3 = this.ctx.createOscillator();
          gain3 = this.ctx.createGain();
          osc3.type = 'triangle';
          osc3.frequency.setValueAtTime(f3, now);

          const f3Decay = decayFactor * 0.35;
          gain3.gain.setValueAtTime(0.0001, now);
          gain3.gain.linearRampToValueAtTime(0.12 * velocity, now + 0.005);
          gain3.gain.exponentialRampToValueAtTime(0.00001, now + f3Decay);

          osc3.connect(gain3);
          gain3.connect(this.musicGain);
          osc3.onended = () => {
            try {
              osc3?.disconnect();
              gain3?.disconnect();
            } catch {}
          };
          osc3.start(now);
          osc3.stop(now + f3Decay + 0.05);
        }

        const stopper = (stopTime: number) => {
          try {
            gain1.gain.cancelScheduledValues(stopTime);
            gain1.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
            osc1.stop(stopTime + 0.01);
            gain2.gain.cancelScheduledValues(stopTime);
            gain2.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
            osc2.stop(stopTime + 0.01);
            if (osc3 && gain3) {
              gain3.gain.cancelScheduledValues(stopTime);
              gain3.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
              osc3.stop(stopTime + 0.01);
            }
          } catch {}
        };
        this.activeVoiceStoppers.add(stopper);

        osc1.onended = () => {
          this.activeVoiceStoppers.delete(stopper);
          try {
            osc1.disconnect();
            gain1.disconnect();
          } catch {}
        };

        osc1.start(now);
        osc1.stop(now + decayFactor + 0.05);

        // Softened wooden thud click
        this.playPluckClick(now, baseFreq, velocity, 'wooden');

      } else if (preset === 'crystal-bell') {
        // 3. CRYSTAL BELL: Dual detuned sine wave chorus shimmer (+/- 3 cents) + celestial high octave chime + 4s ring
        decayFactor *= 1.45; // Long celestial ring
        const f1A = baseFreq * 1.0025; // detuned ringer A
        const f1B = baseFreq * 0.9975; // detuned ringer B
        const f2 = baseFreq * 2.0; // pure octave chime
        const f3 = baseFreq * 4.0; // celestial sparkle ping

        // Glass Oscillator A
        const oscA = this.ctx.createOscillator();
        const gainA = this.ctx.createGain();
        oscA.type = 'sine';
        oscA.frequency.setValueAtTime(f1A, now);

        gainA.gain.setValueAtTime(0.0001, now);
        gainA.gain.linearRampToValueAtTime(0.38 * velocity, now + 0.002);
        gainA.gain.exponentialRampToValueAtTime(0.00001, now + decayFactor);

        oscA.connect(gainA);
        gainA.connect(this.musicGain);

        // Glass Oscillator B (Creates beating shimmering chorus)
        const oscB = this.ctx.createOscillator();
        const gainB = this.ctx.createGain();
        oscB.type = 'sine';
        oscB.frequency.setValueAtTime(f1B, now);

        gainB.gain.setValueAtTime(0.0001, now);
        gainB.gain.linearRampToValueAtTime(0.38 * velocity, now + 0.002);
        gainB.gain.exponentialRampToValueAtTime(0.00001, now + decayFactor);

        oscB.connect(gainB);
        gainB.connect(this.musicGain);
        oscB.onended = () => {
          try {
            oscB.disconnect();
            gainB.disconnect();
          } catch {}
        };
        oscB.start(now);
        oscB.stop(now + decayFactor + 0.05);

        let osc2: OscillatorNode | null = null;
        let gain2: GainNode | null = null;
        let osc3: OscillatorNode | null = null;
        let gain3: GainNode | null = null;

        // Pure Glass Octave Chime (f2)
        if (f2 < 16000) {
          osc2 = this.ctx.createOscillator();
          gain2 = this.ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(f2, now);

          const f2Decay = decayFactor * 0.75;
          gain2.gain.setValueAtTime(0.0001, now);
          gain2.gain.linearRampToValueAtTime(0.20 * velocity, now + 0.001);
          gain2.gain.exponentialRampToValueAtTime(0.00001, now + f2Decay);

          osc2.connect(gain2);
          gain2.connect(this.musicGain);
          osc2.onended = () => {
            try {
              osc2?.disconnect();
              gain2?.disconnect();
            } catch {}
          };
          osc2.start(now);
          osc2.stop(now + f2Decay + 0.05);
        }

        // Sparkle Ping (f3)
        if (f3 < 18000 && relativeIndex < totalTines * 0.6) {
          osc3 = this.ctx.createOscillator();
          gain3 = this.ctx.createGain();
          osc3.type = 'sine';
          osc3.frequency.setValueAtTime(f3, now);

          const f3Decay = 0.35;
          gain3.gain.setValueAtTime(0.0001, now);
          gain3.gain.linearRampToValueAtTime(0.14 * velocity, now + 0.001);
          gain3.gain.exponentialRampToValueAtTime(0.00001, now + f3Decay);

          osc3.connect(gain3);
          gain3.connect(this.musicGain);
          osc3.onended = () => {
            try {
              osc3?.disconnect();
              gain3?.disconnect();
            } catch {}
          };
          osc3.start(now);
          osc3.stop(now + f3Decay + 0.05);
        }

        const stopper = (stopTime: number) => {
          try {
            gainA.gain.cancelScheduledValues(stopTime);
            gainA.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
            oscA.stop(stopTime + 0.01);
            gainB.gain.cancelScheduledValues(stopTime);
            gainB.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
            oscB.stop(stopTime + 0.01);
            if (osc2 && gain2) {
              gain2.gain.cancelScheduledValues(stopTime);
              gain2.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
              osc2.stop(stopTime + 0.01);
            }
            if (osc3 && gain3) {
              gain3.gain.cancelScheduledValues(stopTime);
              gain3.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
              osc3.stop(stopTime + 0.01);
            }
          } catch {}
        };
        this.activeVoiceStoppers.add(stopper);

        oscA.onended = () => {
          this.activeVoiceStoppers.delete(stopper);
          try {
            oscA.disconnect();
            gainA.disconnect();
          } catch {}
        };

        oscA.start(now);
        oscA.stop(now + decayFactor + 0.05);

        // Pure crystal strike click
        this.playPluckClick(now, baseFreq, velocity, 'crystal');

      } else if (preset === 'vintage-antique') {
        // 4. VINTAGE ANTIQUE: Fundamental modulated by subtle 4.6Hz flutter LFO + aged tine harmonics
        const f1 = baseFreq;
        const f2 = baseFreq * 2.85; // Antique lead-weighted overtone

        // Vibrato / Flutter LFO (Simulates authentic 1880s spring motor flutter)
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(4.6, now); // 4.6 Hz flutter
        lfoGain.gain.setValueAtTime(f1 * 0.0045, now); // ~0.45% pitch warble
        lfo.connect(lfoGain);

        // Fundamental oscillator
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(f1, now);
        lfoGain.connect(osc1.frequency);

        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.58 * velocity, now + 0.004);
        gain1.gain.exponentialRampToValueAtTime(0.00001, now + decayFactor);

        osc1.connect(gain1);
        gain1.connect(this.musicGain);

        let osc2: OscillatorNode | null = null;
        let gain2: GainNode | null = null;

        // Mellow vintage overtone (f2)
        if (f2 < 16000) {
          osc2 = this.ctx.createOscillator();
          gain2 = this.ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(f2, now);
          lfoGain.connect(osc2.frequency);

          const f2Decay = Math.min(decayFactor * 0.45, 0.7);
          gain2.gain.setValueAtTime(0.0001, now);
          gain2.gain.linearRampToValueAtTime(0.18 * velocity, now + 0.003);
          gain2.gain.exponentialRampToValueAtTime(0.00001, now + f2Decay);

          osc2.connect(gain2);
          gain2.connect(this.musicGain);
          osc2.onended = () => {
            try {
              osc2?.disconnect();
              gain2?.disconnect();
            } catch {}
          };
          osc2.start(now);
          osc2.stop(now + f2Decay + 0.05);
        }

        const stopper = (stopTime: number) => {
          try {
            gain1.gain.cancelScheduledValues(stopTime);
            gain1.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
            osc1.stop(stopTime + 0.01);
            lfo.stop(stopTime + 0.01);
            if (osc2 && gain2) {
              gain2.gain.cancelScheduledValues(stopTime);
              gain2.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
              osc2.stop(stopTime + 0.01);
            }
          } catch {}
        };
        this.activeVoiceStoppers.add(stopper);

        osc1.onended = () => {
          this.activeVoiceStoppers.delete(stopper);
          try {
            osc1.disconnect();
            gain1.disconnect();
            lfo.disconnect();
            lfoGain.disconnect();
          } catch {}
        };

        lfo.start(now);
        osc1.start(now);
        lfo.stop(now + decayFactor + 0.05);
        osc1.stop(now + decayFactor + 0.05);

        // Vintage lead weight click
        this.playPluckClick(now, baseFreq, velocity, 'vintage');
      } else if (preset === 'retro-8bit') {
        // 5. 8-BIT RETRO ARCADE: Programmable Sound Generator (PSG) square / pulse wave synthesis
        // Mellow, nostalgic chiptune synthesis with de-clicked envelope, gentle overtone balance, and warm retro tone
        const f1 = baseFreq;
        const f2 = baseFreq * 2.0; // Octave harmonic pulse

        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'square';

        // Pure, stable pitch from note onset — no pitch chirp or frequency ramp
        osc1.frequency.setValueAtTime(f1, now);

        // Softer, de-clicked 8-bit chiptune envelope with 7ms smooth attack
        const retroDecay = Math.max(0.32, Math.min(1.4, decayFactor * 0.65));
        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.28 * velocity, now + 0.007);
        gain1.gain.exponentialRampToValueAtTime(0.00001, now + retroDecay);

        osc1.connect(gain1);
        gain1.connect(this.musicGain);

        let osc2: OscillatorNode | null = null;
        let gain2: GainNode | null = null;

        // Subtle secondary pulse harmonic for rich, gentle chiptune warmth
        if (f2 < 10000) {
          osc2 = this.ctx.createOscillator();
          gain2 = this.ctx.createGain();
          osc2.type = 'square';
          osc2.frequency.setValueAtTime(f2, now);

          const f2Decay = retroDecay * 0.35;
          gain2.gain.setValueAtTime(0.0001, now);
          gain2.gain.linearRampToValueAtTime(0.045 * velocity, now + 0.007);
          gain2.gain.exponentialRampToValueAtTime(0.00001, now + f2Decay);

          osc2.connect(gain2);
          gain2.connect(this.musicGain);
          osc2.onended = () => {
            try {
              osc2?.disconnect();
              gain2?.disconnect();
            } catch {}
          };
          osc2.start(now);
          osc2.stop(now + f2Decay + 0.03);
        }

        const stopper = (stopTime: number) => {
          try {
            gain1.gain.cancelScheduledValues(stopTime);
            gain1.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
            osc1.stop(stopTime + 0.012);
            if (osc2 && gain2) {
              gain2.gain.cancelScheduledValues(stopTime);
              gain2.gain.linearRampToValueAtTime(0.0001, stopTime + 0.008);
              osc2.stop(stopTime + 0.012);
            }
          } catch {}
        };
        this.activeVoiceStoppers.add(stopper);

        osc1.onended = () => {
          this.activeVoiceStoppers.delete(stopper);
          try {
            osc1.disconnect();
            gain1.disconnect();
          } catch {}
        };

        osc1.start(now);
        osc1.stop(now + retroDecay + 0.04);
      }
    } catch (e) {
      console.warn('playFrequency error:', e);
    }
  }

  // Plectrum pluck noise transient tailored to chamber material
  private playPluckClick(
    time: number,
    baseFreq: number,
    velocity: number,
    material: 'metallic' | 'wooden' | 'crystal' | 'vintage' | 'chiptune' = 'metallic'
  ): void {
    if (!this.ctx || !this.musicGain) return;

    try {
      let clickDuration = 0.016;
      let filterFreq = Math.min(baseFreq * 3.2, 7500);
      let filterQ = 3.5;
      let clickVol = 0.14 * velocity;

      if (material === 'wooden') {
        clickDuration = 0.024;
        filterFreq = Math.min(baseFreq * 1.5, 1200); // Low muffled wood tap
        filterQ = 1.8;
        clickVol = 0.18 * velocity;
      } else if (material === 'crystal') {
        clickDuration = 0.010;
        filterFreq = Math.min(baseFreq * 4.5, 9500); // High crisp glass ping
        filterQ = 5.0;
        clickVol = 0.12 * velocity;
      } else if (material === 'vintage') {
        clickDuration = 0.020;
        filterFreq = Math.min(baseFreq * 2.2, 2800); // Bandpass antique click
        filterQ = 2.4;
        clickVol = 0.16 * velocity;
      } else if (material === 'chiptune') {
        clickDuration = 0.008;
        filterFreq = Math.min(baseFreq * 2.5, 4500); // Gentle 8-bit blip noise
        filterQ = 3.0;
        clickVol = 0.08 * velocity;
      }

      const t = Math.max(time, this.ctx.currentTime);
      const bufferSize = Math.floor(this.ctx.sampleRate * clickDuration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = material === 'wooden' ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, t);
      filter.Q.setValueAtTime(filterQ, t);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(clickVol, t);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + clickDuration);

      noiseSource.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(this.musicGain);

      noiseSource.onended = () => {
        try {
          noiseSource.disconnect();
          filter.disconnect();
          clickGain.disconnect();
        } catch {
          // ignore
        }
      };

      noiseSource.start(t);
      noiseSource.stop(t + clickDuration + 0.01);
    } catch (e) {
      console.warn('playPluckClick error:', e);
    }
  }

  // Mechanical winding ratchet click sound
  public playWindingClick(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    try {
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

      osc.onended = () => {
        try {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };

      osc.start(now);
      osc.stop(now + 0.03);
      this.resetIdleSleepTimer();
    } catch {
      // safe fallback if audio node allocation fails
    }
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

  public setMechanicalHum(active: boolean, speed = 1.0, immediate = false): void {
    this.isMechanicalHumActive = active;
    if (!this.ctx || !this.gearGain || !this.gearOsc) return;
    const now = this.ctx.currentTime;

    if (active) {
      if (this.idleSleepTimer) {
        clearTimeout(this.idleSleepTimer);
        this.idleSleepTimer = null;
      }
      this.gearOsc.frequency.setTargetAtTime(70 * Math.max(0.5, speed), now, 0.1);
      this.gearGain.gain.setTargetAtTime(0.028, now, 0.15);
    } else {
      if (immediate) {
        try {
          this.gearGain.gain.cancelScheduledValues(now);
          this.gearGain.gain.setValueAtTime(0.00001, now);
        } catch {
          this.gearGain.gain.setTargetAtTime(0.00001, now, 0.05);
        }
      } else {
        this.gearGain.gain.setTargetAtTime(0.00001, now, 0.2);
      }
      this.resetIdleSleepTimer();
    }
  }

  // Seamless procedural noise buffer generator (cached for memory & CPU efficiency)
  private getOrCreateNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
    if (this.cachedNoiseBuffer) {
      return this.cachedNoiseBuffer;
    }

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

    // Crossfade start/end for seamless loop with no click
    const fadeLen = Math.min(2000, Math.floor(bufferSize * 0.05));
    for (let i = 0; i < fadeLen; i++) {
      const alpha = i / fadeLen;
      left[i] = left[i] * alpha + left[bufferSize - fadeLen + i] * (1 - alpha);
      right[i] = right[i] * alpha + right[bufferSize - fadeLen + i] * (1 - alpha);
    }

    this.cachedNoiseBuffer = buffer;
    return buffer;
  }

  // Setup nature ambiance sub-system (busses only; nodes are activated lazily on demand)
  private setupNatureAmbiance(): void {
    if (!this.ctx || !this.masterGain) return;

    this.natureMasterGain = this.ctx.createGain();
    this.natureMasterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
    this.natureMasterGain.connect(this.masterGain);

    // 1. Rain Bus
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.rainGain.connect(this.natureMasterGain);

    // 2. Fire Bus
    this.fireGain = this.ctx.createGain();
    this.fireGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.fireGain.connect(this.natureMasterGain);

    // 3. Forest Breeze & Birdsong Bus
    this.forestGain = this.ctx.createGain();
    this.forestGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.forestGain.connect(this.natureMasterGain);

    // 4. Wind Chimes Bus
    this.windChimeGain = this.ctx.createGain();
    this.windChimeGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.windChimeGain.connect(this.natureMasterGain);

    // 5. Mountain Stream Bus
    this.streamGain = this.ctx.createGain();
    this.streamGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.streamGain.connect(this.natureMasterGain);
  }

  // Lazy Rain Generator: starts only when rain slider > 0
  private startRainGenerator(): void {
    if (!this.ctx || !this.rainGain || this.rainSource) return;

    const noiseBuffer = this.getOrCreateNoiseBuffer(this.ctx, 4);
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
    this.rainSource = source;

    // Occasional raindrop droplet plops
    this.rainDropInterval = window.setInterval(() => {
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

        dropOsc.onended = () => {
          try {
            dropOsc.disconnect();
            dropGain.disconnect();
          } catch {
            // ignore
          }
        };

        dropOsc.start(now);
        dropOsc.stop(now + 0.05);
      }
    }, 280);
  }

  private stopRainGenerator(): void {
    if (this.rainDropInterval) {
      clearInterval(this.rainDropInterval);
      this.rainDropInterval = null;
    }
    if (this.rainSource) {
      try {
        this.rainSource.stop();
        this.rainSource.disconnect();
      } catch {
        // ignore
      }
      this.rainSource = null;
    }
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  // Lazy Fire Generator: starts only when fire slider > 0
  private startFireGenerator(): void {
    if (!this.ctx || !this.fireGain || this.fireSource) return;

    const noiseBuffer = this.getOrCreateNoiseBuffer(this.ctx, 4);
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(380, this.ctx.currentTime);

    source.connect(lowpass);
    lowpass.connect(this.fireGain);
    source.start();
    this.fireSource = source;

    // Natural wood ember pops and crackles
    this.fireCrackleInterval = window.setInterval(() => {
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

        osc.onended = () => {
          try {
            osc.disconnect();
            crackleGain.disconnect();
          } catch {
            // ignore
          }
        };

        osc.start(now);
        osc.stop(now + 0.025);
      }
    }, 320);
  }

  private stopFireGenerator(): void {
    if (this.fireCrackleInterval) {
      clearInterval(this.fireCrackleInterval);
      this.fireCrackleInterval = null;
    }
    if (this.fireSource) {
      try {
        this.fireSource.stop();
        this.fireSource.disconnect();
      } catch {
        // ignore
      }
      this.fireSource = null;
    }
    if (this.fireGain && this.ctx) {
      this.fireGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  // Lazy Forest Generator: starts only when forest slider > 0
  private startForestGenerator(): void {
    if (!this.ctx || !this.forestGain || this.forestSource) return;

    const noiseBuffer = this.getOrCreateNoiseBuffer(this.ctx, 5);
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
    this.forestSource = source;

    // Distant sweet birdsong whistles
    this.forestBirdInterval = window.setInterval(() => {
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

        birdOsc.onended = () => {
          try {
            birdOsc.disconnect();
            bGain.disconnect();
          } catch {
            // ignore
          }
        };

        birdOsc.start(now);
        birdOsc.stop(now + 0.2);
      }
    }, 1400);
  }

  private stopForestGenerator(): void {
    if (this.forestBirdInterval) {
      clearInterval(this.forestBirdInterval);
      this.forestBirdInterval = null;
    }
    if (this.forestSource) {
      try {
        this.forestSource.stop();
        this.forestSource.disconnect();
      } catch {
        // ignore
      }
      this.forestSource = null;
    }
    if (this.forestGain && this.ctx) {
      this.forestGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  // Lazy Wind Chime Generator: starts only when windChime slider > 0
  private startWindChimeGenerator(): void {
    if (!this.ctx || !this.windChimeGain || this.windChimeInterval) return;
    const chimePitches = [1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32, 2637.02];

    this.windChimeInterval = window.setInterval(() => {
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

        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch {
            // ignore
          }
        };

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

        overtoneOsc.onended = () => {
          try {
            overtoneOsc.disconnect();
            overtoneGain.disconnect();
          } catch {
            // ignore
          }
        };

        overtoneOsc.start(now);
        overtoneOsc.stop(now + 0.65);
      }
    }, 1100);
  }

  private stopWindChimeGenerator(): void {
    if (this.windChimeInterval) {
      clearInterval(this.windChimeInterval);
      this.windChimeInterval = null;
    }
    if (this.windChimeGain && this.ctx) {
      this.windChimeGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  // Lazy Mountain Stream Generator: starts only when stream slider > 0
  private startStreamGenerator(): void {
    if (!this.ctx || !this.streamGain || this.streamSource) return;

    const noiseBuffer = this.getOrCreateNoiseBuffer(this.ctx, 4);
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
    this.streamSource = source;
  }

  private stopStreamGenerator(): void {
    if (this.streamSource) {
      try {
        this.streamSource.stop();
        this.streamSource.disconnect();
      } catch {
        // ignore
      }
      this.streamSource = null;
    }
    if (this.streamGain && this.ctx) {
      this.streamGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  // Update volume levels of all nature ambiance layers in real time with lazy node activation
  public updateNatureVolumes(settings: NatureAmbienceSettings): void {
    this.currentNatureSettings = { ...settings };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const hasAnyNature =
      settings.rain > 0.01 ||
      settings.fire > 0.01 ||
      settings.forest > 0.01 ||
      settings.windChime > 0.01 ||
      settings.stream > 0.01;

    if (hasAnyNature) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.idleSleepTimer) {
        clearTimeout(this.idleSleepTimer);
        this.idleSleepTimer = null;
      }
    }

    // 1. Rain
    if (settings.rain > 0.01) {
      this.startRainGenerator();
      if (this.rainGain) {
        this.rainGain.gain.setTargetAtTime(settings.rain * 0.65, now, 0.05);
      }
    } else {
      this.stopRainGenerator();
    }

    // 2. Fire
    if (settings.fire > 0.01) {
      this.startFireGenerator();
      if (this.fireGain) {
        this.fireGain.gain.setTargetAtTime(settings.fire * 0.6, now, 0.05);
      }
    } else {
      this.stopFireGenerator();
    }

    // 3. Forest
    if (settings.forest > 0.01) {
      this.startForestGenerator();
      if (this.forestGain) {
        this.forestGain.gain.setTargetAtTime(settings.forest * 0.55, now, 0.05);
      }
    } else {
      this.stopForestGenerator();
    }

    // 4. Wind Chimes
    if (settings.windChime > 0.01) {
      this.startWindChimeGenerator();
      if (this.windChimeGain) {
        this.windChimeGain.gain.setTargetAtTime(settings.windChime * 0.7, now, 0.05);
      }
    } else {
      this.stopWindChimeGenerator();
    }

    // 5. Stream
    if (settings.stream > 0.01) {
      this.startStreamGenerator();
      if (this.streamGain) {
        this.streamGain.gain.setTargetAtTime(settings.stream * 0.55, now, 0.05);
      }
    } else {
      this.stopStreamGenerator();
    }

    if (!hasAnyNature) {
      this.resetIdleSleepTimer();
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

  // Cleanly flush all ringing music box voices and stop mechanical hum
  public stopAllMusicVoices(): void {
    this.auditionTimeouts.forEach((id) => clearTimeout(id));
    this.auditionTimeouts = [];

    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;

    // Explicitly stop all actively ringing voice oscillators
    for (const stopper of this.activeVoiceStoppers) {
      try {
        stopper(now);
      } catch {
        // ignore
      }
    }
    this.activeVoiceStoppers.clear();

    try {
      this.musicGain.gain.cancelScheduledValues(now);
      // Fast 8ms fade down to zero to avoid popping, then restore to ready gain (0.88)
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.008);
      this.musicGain.gain.setValueAtTime(0.88, now + 0.015);
    } catch {
      // safe fallback
    }
    this.resetIdleSleepTimer();
  }

  public cleanup(): void {
    this.stopRainGenerator();
    this.stopFireGenerator();
    this.stopForestGenerator();
    this.stopWindChimeGenerator();
    this.stopStreamGenerator();

    this.auditionTimeouts.forEach((id) => clearTimeout(id));
    this.auditionTimeouts = [];
    this.activeVoiceStoppers.clear();

    if (this.idleSleepTimer) {
      clearTimeout(this.idleSleepTimer);
      this.idleSleepTimer = null;
    }

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch {
        // ignore
      }
    }
  }
}

export const musicBoxAudio = new MusicBoxAudioEngine();
