export interface MusicBoxPin {
  id?: string;
  tineIndex: number; // 0 to comb tines count - 1
  step: number; // 0 to totalSteps - 1
  note?: string; // optional explicit note name like 'Eb6', 'Ab5', 'C6'
}

export type CombScaleId = 'romantic-flat' | 'chromatic-30' | 'flat-major-18' | 'sankyo-18';

export interface MusicBoxSong {
  id: string;
  title: string;
  category: 'classic' | 'anime' | 'lullaby' | 'nature' | 'ai' | 'custom';
  description?: string;
  tempoBpm: number;
  totalSteps: number; // usually 64, 96, or 128 steps per rotation
  combScaleId?: CombScaleId;
  pins: MusicBoxPin[];
  createdAt?: number;
  isAiGenerated?: boolean;
}

export interface TineNote {
  index: number;
  note: string;
  frequency: number;
  octave: number;
  keyLabel: string;
  flatEnharmonic?: string;
  isFlat?: boolean;
}

// Master scientific pitch frequencies (A4 = 440Hz Equal Temperament)
export const CHROMATIC_NOTE_FREQUENCIES: Record<string, number> = {
  // Octave 4
  C4: 261.63,
  'C#4': 277.18,
  Db4: 277.18,
  D4: 293.66,
  'D#4': 311.13,
  Eb4: 311.13,
  E4: 329.63,
  F4: 349.23,
  'F#4': 369.99,
  Gb4: 369.99,
  G4: 392.0,
  'G#4': 415.3,
  Ab4: 415.3,
  A4: 440.0,
  'A#4': 466.16,
  Bb4: 466.16,
  B4: 493.88,

  // Octave 5
  C5: 523.25,
  'C#5': 554.37,
  Db5: 554.37,
  D5: 587.33,
  'D#5': 622.25,
  Eb5: 622.25,
  E5: 659.25,
  F5: 698.46,
  'F#5': 739.99,
  Gb5: 739.99,
  G5: 783.99,
  'G#5': 830.61,
  Ab5: 830.61,
  A5: 880.0,
  'A#5': 932.33,
  Bb5: 932.33,
  B5: 987.77,

  // Octave 6
  C6: 1046.5,
  'C#6': 1108.73,
  Db6: 1108.73,
  D6: 1174.66,
  'D#6': 1244.51,
  Eb6: 1244.51,
  E6: 1318.51,
  F6: 1396.91,
  'F#6': 1479.98,
  Gb6: 1479.98,
  G6: 1567.98,
  'G#6': 1661.22,
  Ab6: 1661.22,
  A6: 1760.0,
  'A#6': 1864.66,
  Bb6: 1864.66,
  B6: 1975.53,

  // Octave 7
  C7: 2093.0,
  'C#7': 2217.46,
  Db7: 2217.46,
  D7: 2349.32,
  'D#7': 2489.02,
  Eb7: 2489.02,
  E7: 2637.02,
  F7: 2793.83,
  'F#7': 2959.96,
  Gb7: 2959.96,
  G7: 3135.96,
  'G#7': 3322.44,
  Ab7: 3322.44,
  A7: 3520.0,
  'A#7': 3729.31,
  Bb7: 3729.31,
  B7: 3951.07,
  C8: 4186.01,
};

// 1. Romantic Flat & Minor Scale Comb (22 Tines) - Perfectly covers Beethoven's Für Elise, Chopin, Debussy, and all flat scale pieces
export const ROMANTIC_FLAT_22_TINES: TineNote[] = [
  { index: 0, note: 'C5', frequency: 523.25, octave: 5, keyLabel: 'C5' },
  { index: 1, note: 'D5', frequency: 587.33, octave: 5, keyLabel: 'D5' },
  { index: 2, note: 'Eb5', frequency: 622.25, octave: 5, keyLabel: 'Eb5', flatEnharmonic: 'D#5 / Eb5', isFlat: true },
  { index: 3, note: 'E5', frequency: 659.25, octave: 5, keyLabel: 'E5' },
  { index: 4, note: 'F5', frequency: 698.46, octave: 5, keyLabel: 'F5' },
  { index: 5, note: 'Gb5', frequency: 739.99, octave: 5, keyLabel: 'Gb5', flatEnharmonic: 'F#5 / Gb5', isFlat: true },
  { index: 6, note: 'G5', frequency: 783.99, octave: 5, keyLabel: 'G5' },
  { index: 7, note: 'Ab5', frequency: 830.61, octave: 5, keyLabel: 'Ab5', flatEnharmonic: 'G#5 / Ab5', isFlat: true },
  { index: 8, note: 'A5', frequency: 880.0, octave: 5, keyLabel: 'A5' },
  { index: 9, note: 'Bb5', frequency: 932.33, octave: 5, keyLabel: 'Bb5', flatEnharmonic: 'A#5 / Bb5', isFlat: true },
  { index: 10, note: 'B5', frequency: 987.77, octave: 5, keyLabel: 'B5' },
  { index: 11, note: 'C6', frequency: 1046.5, octave: 6, keyLabel: 'C6' },
  { index: 12, note: 'Db6', frequency: 1108.73, octave: 6, keyLabel: 'Db6', flatEnharmonic: 'C#6 / Db6', isFlat: true },
  { index: 13, note: 'D6', frequency: 1174.66, octave: 6, keyLabel: 'D6' },
  { index: 14, note: 'Eb6', frequency: 1244.51, octave: 6, keyLabel: 'Eb6', flatEnharmonic: 'D#6 / Eb6', isFlat: true }, // Für Elise signature!
  { index: 15, note: 'E6', frequency: 1318.51, octave: 6, keyLabel: 'E6' },
  { index: 16, note: 'F6', frequency: 1396.91, octave: 6, keyLabel: 'F6' },
  { index: 17, note: 'Gb6', frequency: 1479.98, octave: 6, keyLabel: 'Gb6', flatEnharmonic: 'F#6 / Gb6', isFlat: true },
  { index: 18, note: 'G6', frequency: 1567.98, octave: 6, keyLabel: 'G6' },
  { index: 19, note: 'Ab6', frequency: 1661.22, octave: 6, keyLabel: 'Ab6', flatEnharmonic: 'G#6 / Ab6', isFlat: true },
  { index: 20, note: 'A6', frequency: 1760.0, octave: 6, keyLabel: 'A6' },
  { index: 21, note: 'Bb6', frequency: 1864.66, octave: 6, keyLabel: 'Bb6', flatEnharmonic: 'A#6 / Bb6', isFlat: true },
];

// 2. Full 30-Note Chromatic Comb (Complete 12-semitone spectrum from C5 to F7)
export const CHROMATIC_30_TINES: TineNote[] = [
  { index: 0, note: 'C5', frequency: 523.25, octave: 5, keyLabel: 'C5' },
  { index: 1, note: 'Db5', frequency: 554.37, octave: 5, keyLabel: 'Db5', flatEnharmonic: 'C#5 / Db5', isFlat: true },
  { index: 2, note: 'D5', frequency: 587.33, octave: 5, keyLabel: 'D5' },
  { index: 3, note: 'Eb5', frequency: 622.25, octave: 5, keyLabel: 'Eb5', flatEnharmonic: 'D#5 / Eb5', isFlat: true },
  { index: 4, note: 'E5', frequency: 659.25, octave: 5, keyLabel: 'E5' },
  { index: 5, note: 'F5', frequency: 698.46, octave: 5, keyLabel: 'F5' },
  { index: 6, note: 'Gb5', frequency: 739.99, octave: 5, keyLabel: 'Gb5', flatEnharmonic: 'F#5 / Gb5', isFlat: true },
  { index: 7, note: 'G5', frequency: 783.99, octave: 5, keyLabel: 'G5' },
  { index: 8, note: 'Ab5', frequency: 830.61, octave: 5, keyLabel: 'Ab5', flatEnharmonic: 'G#5 / Ab5', isFlat: true },
  { index: 9, note: 'A5', frequency: 880.0, octave: 5, keyLabel: 'A5' },
  { index: 10, note: 'Bb5', frequency: 932.33, octave: 5, keyLabel: 'Bb5', flatEnharmonic: 'A#5 / Bb5', isFlat: true },
  { index: 11, note: 'B5', frequency: 987.77, octave: 5, keyLabel: 'B5' },
  { index: 12, note: 'C6', frequency: 1046.5, octave: 6, keyLabel: 'C6' },
  { index: 13, note: 'Db6', frequency: 1108.73, octave: 6, keyLabel: 'Db6', flatEnharmonic: 'C#6 / Db6', isFlat: true },
  { index: 14, note: 'D6', frequency: 1174.66, octave: 6, keyLabel: 'D6' },
  { index: 15, note: 'Eb6', frequency: 1244.51, octave: 6, keyLabel: 'Eb6', flatEnharmonic: 'D#6 / Eb6', isFlat: true },
  { index: 16, note: 'E6', frequency: 1318.51, octave: 6, keyLabel: 'E6' },
  { index: 17, note: 'F6', frequency: 1396.91, octave: 6, keyLabel: 'F6' },
  { index: 18, note: 'Gb6', frequency: 1479.98, octave: 6, keyLabel: 'Gb6', flatEnharmonic: 'F#6 / Gb6', isFlat: true },
  { index: 19, note: 'G6', frequency: 1567.98, octave: 6, keyLabel: 'G6' },
  { index: 20, note: 'Ab6', frequency: 1661.22, octave: 6, keyLabel: 'Ab6', flatEnharmonic: 'G#6 / Ab6', isFlat: true },
  { index: 21, note: 'A6', frequency: 1760.0, octave: 6, keyLabel: 'A6' },
  { index: 22, note: 'Bb6', frequency: 1864.66, octave: 6, keyLabel: 'Bb6', flatEnharmonic: 'A#6 / Bb6', isFlat: true },
  { index: 23, note: 'B6', frequency: 1975.53, octave: 6, keyLabel: 'B6' },
  { index: 24, note: 'C7', frequency: 2093.0, octave: 7, keyLabel: 'C7' },
  { index: 25, note: 'Db7', frequency: 2217.46, octave: 7, keyLabel: 'Db7', flatEnharmonic: 'C#7 / Db7', isFlat: true },
  { index: 26, note: 'D7', frequency: 2349.32, octave: 7, keyLabel: 'D7' },
  { index: 27, note: 'Eb7', frequency: 2489.02, octave: 7, keyLabel: 'Eb7', flatEnharmonic: 'D#7 / Eb7', isFlat: true },
  { index: 28, note: 'E7', frequency: 2637.02, octave: 7, keyLabel: 'E7' },
  { index: 29, note: 'F7', frequency: 2793.83, octave: 7, keyLabel: 'F7' },
];

// 3. Flat Major Scale Comb (18 Tines) - Tuned for Eb Major / Bb Major / Ab Major / Db Major pieces
export const FLAT_MAJOR_18_TINES: TineNote[] = [
  { index: 0, note: 'Bb4', frequency: 466.16, octave: 4, keyLabel: 'Bb4', flatEnharmonic: 'A#4 / Bb4', isFlat: true },
  { index: 1, note: 'C5', frequency: 523.25, octave: 5, keyLabel: 'C5' },
  { index: 2, note: 'Db5', frequency: 554.37, octave: 5, keyLabel: 'Db5', flatEnharmonic: 'C#5 / Db5', isFlat: true },
  { index: 3, note: 'Eb5', frequency: 622.25, octave: 5, keyLabel: 'Eb5', flatEnharmonic: 'D#5 / Eb5', isFlat: true },
  { index: 4, note: 'F5', frequency: 698.46, octave: 5, keyLabel: 'F5' },
  { index: 5, note: 'G5', frequency: 783.99, octave: 5, keyLabel: 'G5' },
  { index: 6, note: 'Ab5', frequency: 830.61, octave: 5, keyLabel: 'Ab5', flatEnharmonic: 'G#5 / Ab5', isFlat: true },
  { index: 7, note: 'Bb5', frequency: 932.33, octave: 5, keyLabel: 'Bb5', flatEnharmonic: 'A#5 / Bb5', isFlat: true },
  { index: 8, note: 'C6', frequency: 1046.5, octave: 6, keyLabel: 'C6' },
  { index: 9, note: 'Db6', frequency: 1108.73, octave: 6, keyLabel: 'Db6', flatEnharmonic: 'C#6 / Db6', isFlat: true },
  { index: 10, note: 'Eb6', frequency: 1244.51, octave: 6, keyLabel: 'Eb6', flatEnharmonic: 'D#6 / Eb6', isFlat: true },
  { index: 11, note: 'F6', frequency: 1396.91, octave: 6, keyLabel: 'F6' },
  { index: 12, note: 'G6', frequency: 1567.98, octave: 6, keyLabel: 'G6' },
  { index: 13, note: 'Ab6', frequency: 1661.22, octave: 6, keyLabel: 'Ab6', flatEnharmonic: 'G#6 / Ab6', isFlat: true },
  { index: 14, note: 'Bb6', frequency: 1864.66, octave: 6, keyLabel: 'Bb6', flatEnharmonic: 'A#6 / Bb6', isFlat: true },
  { index: 15, note: 'C7', frequency: 2093.0, octave: 7, keyLabel: 'C7' },
  { index: 16, note: 'Db7', frequency: 2217.46, octave: 7, keyLabel: 'Db7', flatEnharmonic: 'C#7 / Db7', isFlat: true },
  { index: 17, note: 'Eb7', frequency: 2489.02, octave: 7, keyLabel: 'Eb7', flatEnharmonic: 'D#7 / Eb7', isFlat: true },
];

// 4. Authentic Sankyo 18-note comb tuning (Standard C-Major / G-Major expanded range)
export const SANKYO_18_TINES: TineNote[] = [
  { index: 0, note: 'C5', frequency: 523.25, octave: 5, keyLabel: 'C5' },
  { index: 1, note: 'D5', frequency: 587.33, octave: 5, keyLabel: 'D5' },
  { index: 2, note: 'E5', frequency: 659.25, octave: 5, keyLabel: 'E5' },
  { index: 3, note: 'F5', frequency: 698.46, octave: 5, keyLabel: 'F5' },
  { index: 4, note: 'Gb5', frequency: 739.99, octave: 5, keyLabel: 'Gb5', flatEnharmonic: 'F#5 / Gb5', isFlat: true },
  { index: 5, note: 'G5', frequency: 783.99, octave: 5, keyLabel: 'G5' },
  { index: 6, note: 'A5', frequency: 880.0, octave: 5, keyLabel: 'A5' },
  { index: 7, note: 'B5', frequency: 987.77, octave: 5, keyLabel: 'B5' },
  { index: 8, note: 'C6', frequency: 1046.5, octave: 6, keyLabel: 'C6' },
  { index: 9, note: 'D6', frequency: 1174.66, octave: 6, keyLabel: 'D6' },
  { index: 10, note: 'E6', frequency: 1318.51, octave: 6, keyLabel: 'E6' },
  { index: 11, note: 'F6', frequency: 1396.91, octave: 6, keyLabel: 'F6' },
  { index: 12, note: 'Gb6', frequency: 1479.98, octave: 6, keyLabel: 'Gb6', flatEnharmonic: 'F#6 / Gb6', isFlat: true },
  { index: 13, note: 'G6', frequency: 1567.98, octave: 6, keyLabel: 'G6' },
  { index: 14, note: 'A6', frequency: 1760.0, octave: 6, keyLabel: 'A6' },
  { index: 15, note: 'B6', frequency: 1975.53, octave: 6, keyLabel: 'B6' },
  { index: 16, note: 'C7', frequency: 2093.0, octave: 7, keyLabel: 'C7' },
  { index: 17, note: 'D7', frequency: 2349.32, octave: 7, keyLabel: 'D7' },
];

export interface CombScaleInfo {
  id: CombScaleId;
  name: string;
  subtitle: string;
  description: string;
  tinesCount: number;
  tines: TineNote[];
  badge: string;
}

export const COMB_SCALES_MAP: Record<CombScaleId, CombScaleInfo> = {
  'romantic-flat': {
    id: 'romantic-flat',
    name: 'Romantic Flat Scale Comb',
    subtitle: '22-Tine Flat Scale Tuning (Eb5, Eb6, Ab, Bb, Gb)',
    description: 'Specially engineered comb with dedicated flat accidental tines for authentic Für Elise, Clair de Lune, and Romantic masterpieces.',
    tinesCount: 22,
    tines: ROMANTIC_FLAT_22_TINES,
    badge: 'Flat Scales Active',
  },
  'chromatic-30': {
    id: 'chromatic-30',
    name: 'Deluxe Chromatic Comb',
    subtitle: '30-Tine Full 12-Tone Semitone Spectrum (C5 - F7)',
    description: 'Master studio comb with every flat, sharp, and natural pitch across 2.5 full octaves for unrestricted musical realism.',
    tinesCount: 30,
    tines: CHROMATIC_30_TINES,
    badge: 'Full Chromatic 30N',
  },
  'flat-major-18': {
    id: 'flat-major-18',
    name: 'Flat Major & Lullaby Comb',
    subtitle: '18-Tine Eb / Bb / Ab Flat Scale Tuning',
    description: 'Rich resonant tuning in pure flat major keys, ideal for peaceful nocturnal lullabies and impressionistic compositions.',
    tinesCount: 18,
    tines: FLAT_MAJOR_18_TINES,
    badge: 'Eb / Bb Flat Scale',
  },
  'sankyo-18': {
    id: 'sankyo-18',
    name: 'Vintage Sankyo 18N',
    subtitle: 'Standard 18-Tine Classical Comb',
    description: 'Traditional standard 18-note mechanical comb tuned in C-Major with F# overtones.',
    tinesCount: 18,
    tines: SANKYO_18_TINES,
    badge: 'Standard 18N',
  },
};

export function getCombTines(scaleId?: CombScaleId): TineNote[] {
  if (scaleId && COMB_SCALES_MAP[scaleId]) {
    return COMB_SCALES_MAP[scaleId].tines;
  }
  return ROMANTIC_FLAT_22_TINES;
}

export type SoundChamberPreset = 'gold-sankyo' | 'wooden-box' | 'crystal-bell' | 'vintage-antique';

export interface SoundChamberInfo {
  id: SoundChamberPreset;
  name: string;
  subtitle: string;
  material: string;
  harmonicProfile: string;
  resonanceDescription: string;
  waveformType: 'metallic-bell' | 'warm-body' | 'crystal-shimmer' | 'vintage-warble';
  color: string;
  accentColor: string;
  badgeBg: string;
  samplePoints: number[]; // characteristic waveform profile normalized between -1 and 1
}

export const SOUND_CHAMBER_PRESETS: Record<SoundChamberPreset, SoundChamberInfo> = {
  'gold-sankyo': {
    id: 'gold-sankyo',
    name: 'Gold Sankyo 18N',
    subtitle: 'Classic Precision Brass Chassis',
    material: 'Cast Brass & High-Carbon Steel',
    harmonicProfile: 'Sharp metallic transient + 6.27x inharmonic overtones',
    resonanceDescription: 'Bright, crisp mechanical chime with bright high-frequency bell resonance and snappy decay.',
    waveformType: 'metallic-bell',
    color: '#d4af37',
    accentColor: '#f3e18a',
    badgeBg: 'rgba(212, 175, 55, 0.15)',
    samplePoints: [
      0, 0.95, -0.75, 0.82, -0.65, 0.58, -0.48, 0.42, -0.35, 0.28, -0.22, 0.18, -0.14, 0.11, -0.08, 0.05, -0.03, 0.01, 0
    ],
  },
  'wooden-box': {
    id: 'wooden-box',
    name: 'Mahogany Soundboard',
    subtitle: 'Warm Acoustic Cedar Box',
    material: 'Honduran Mahogany & Solid Spruce Top',
    harmonicProfile: 'Rich 2nd & 3rd even integer harmonics (2f, 3f) + warm low resonant body',
    resonanceDescription: 'Deep, mellow, woody resonance with softened attack, warm 400Hz cavity swell, and lush acoustic sustain.',
    waveformType: 'warm-body',
    color: '#c86432',
    accentColor: '#e89467',
    badgeBg: 'rgba(200, 100, 50, 0.15)',
    samplePoints: [
      0, 0.45, 0.85, 0.92, 0.65, 0.18, -0.38, -0.78, -0.88, -0.65, -0.22, 0.25, 0.55, 0.60, 0.40, 0.12, -0.15, -0.32, -0.35, -0.22, -0.05, 0.10, 0.18, 0.12, 0
    ],
  },
  'crystal-bell': {
    id: 'crystal-bell',
    name: 'Crystal Glass Dome',
    subtitle: 'Celestial Bell & Shimmering Glass',
    material: 'Fused Quartz Glass & Silver Chime Tines',
    harmonicProfile: 'Dual detuned glass partials (chorus beat) + airy high-shelf sparkle',
    resonanceDescription: 'Ultra-pure ethereal glass tone with dual-detuned beating harmonics, shimmering high tail, and 4.2s celestial ring.',
    waveformType: 'crystal-shimmer',
    color: '#4aa8d8',
    accentColor: '#97d6f8',
    badgeBg: 'rgba(74, 168, 216, 0.15)',
    samplePoints: [
      0, 0.35, 0.72, 0.98, 0.82, 0.42, -0.12, -0.65, -0.96, -0.88, -0.45, 0.15, 0.68, 0.95, 0.80, 0.38, -0.18, -0.70, -0.92, -0.78, -0.35, 0.22, 0.65, 0.85, 0.68, 0.25, -0.25, -0.65, -0.80, -0.60, -0.20, 0.20, 0.50, 0.60, 0.45, 0.15, -0.15, -0.38, -0.45, -0.32, 0
    ],
  },
  'vintage-antique': {
    id: 'vintage-antique',
    name: '1880s Victorian Antique',
    subtitle: 'Aged Music Box with Analog Flutter',
    material: 'Aged Brass, Lead Weights & Antique Oak Box',
    harmonicProfile: '4.8Hz analog wow/flutter + tape-like soft saturation + mid-patina',
    resonanceDescription: 'Nostalgic antique chime with subtle pitch-drift vibrato on decay, mellow band-limited patina, and mechanical charm.',
    waveformType: 'vintage-warble',
    color: '#a07840',
    accentColor: '#cca870',
    badgeBg: 'rgba(160, 120, 64, 0.15)',
    samplePoints: [
      0, 0.78, -0.52, 0.64, -0.42, 0.58, -0.35, 0.48, -0.30, 0.38, -0.25, 0.32, -0.20, 0.26, -0.16, 0.20, -0.12, 0.15, -0.09, 0.10, -0.06, 0.06, -0.03, 0
    ],
  },
};

export interface NatureAmbienceSettings {
  rain: number; // 0 to 1
  fire: number; // 0 to 1
  forest: number; // 0 to 1
  windChime: number; // 0 to 1
  stream: number; // 0 to 1
}

export type PlayMode = 'spring' | 'crank' | 'continuous';

export interface UserSettings {
  soundPreset: SoundChamberPreset;
  combScaleId?: CombScaleId;
  natureSettings: NatureAmbienceSettings;
  masterVolume: number;
  isMuted: boolean;
  playMode: PlayMode;
  tempoBpm?: number;
  currentSongId?: string;
  fontZoom: number; // e.g. 100 (percentage)
}

export interface MusicBoxExportBundle {
  format: 'musicbox-backup-v1';
  exportedAt: number;
  appName: string;
  songs: MusicBoxSong[];
  settings?: Partial<UserSettings>;
}
