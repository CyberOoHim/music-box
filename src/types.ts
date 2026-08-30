export interface MusicBoxPin {
  id?: string;
  tineIndex: number; // 0 to 17 (18 tines)
  step: number; // 0 to totalSteps - 1
}

export interface MusicBoxSong {
  id: string;
  title: string;
  category: 'classic' | 'anime' | 'lullaby' | 'nature' | 'ai' | 'custom';
  description?: string;
  tempoBpm: number;
  totalSteps: number; // usually 64, 96, or 128 steps per rotation
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
}

// Authentic Sankyo 18-note comb tuning (Standard C-Major / G-Major expanded range)
export const SANKYO_18_TINES: TineNote[] = [
  { index: 0, note: 'C5', frequency: 523.25, octave: 5, keyLabel: 'C5' },
  { index: 1, note: 'D5', frequency: 587.33, octave: 5, keyLabel: 'D5' },
  { index: 2, note: 'E5', frequency: 659.25, octave: 5, keyLabel: 'E5' },
  { index: 3, note: 'F5', frequency: 698.46, octave: 5, keyLabel: 'F5' },
  { index: 4, note: 'F#5', frequency: 739.99, octave: 5, keyLabel: 'F#5' },
  { index: 5, note: 'G5', frequency: 783.99, octave: 5, keyLabel: 'G5' },
  { index: 6, note: 'A5', frequency: 880.00, octave: 5, keyLabel: 'A5' },
  { index: 7, note: 'B5', frequency: 987.77, octave: 5, keyLabel: 'B5' },
  { index: 8, note: 'C6', frequency: 1046.50, octave: 6, keyLabel: 'C6' },
  { index: 9, note: 'D6', frequency: 1174.66, octave: 6, keyLabel: 'D6' },
  { index: 10, note: 'E6', frequency: 1318.51, octave: 6, keyLabel: 'E6' },
  { index: 11, note: 'F6', frequency: 1396.91, octave: 6, keyLabel: 'F6' },
  { index: 12, note: 'F#6', frequency: 1479.98, octave: 6, keyLabel: 'F#6' },
  { index: 13, note: 'G6', frequency: 1567.98, octave: 6, keyLabel: 'G6' },
  { index: 14, note: 'A6', frequency: 1760.00, octave: 6, keyLabel: 'A6' },
  { index: 15, note: 'B6', frequency: 1975.53, octave: 6, keyLabel: 'B6' },
  { index: 16, note: 'C7', frequency: 2093.00, octave: 7, keyLabel: 'C7' },
  { index: 17, note: 'D7', frequency: 2349.32, octave: 7, keyLabel: 'D7' },
];

export type SoundChamberPreset = 'gold-sankyo' | 'wooden-box' | 'crystal-bell' | 'vintage-antique';

export interface NatureAmbienceSettings {
  rain: number; // 0 to 1
  fire: number; // 0 to 1
  forest: number; // 0 to 1
  windChime: number; // 0 to 1
  stream: number; // 0 to 1
}

export type PlayMode = 'spring' | 'crank' | 'continuous';
