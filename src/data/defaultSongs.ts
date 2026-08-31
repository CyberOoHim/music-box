import { MusicBoxSong } from '../types';

export const DEFAULT_SONGS: MusicBoxSong[] = [
  {
    id: 'fur-elise',
    title: 'Für Elise (WoO 59)',
    category: 'classic',
    description: 'Ludwig van Beethoven - The immortal Bagatelle with authentic E6-Eb6 chromatic motifs and resonant A-minor chords.',
    tempoBpm: 108,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      // Measure 1: The famous E - D#(Eb) - E - D#(Eb) - E - B - D - C motif
      { step: 0, tineIndex: 15, note: 'E6' },
      { step: 2, tineIndex: 14, note: 'Eb6' }, // Authentic Eb6 / D#6 flat accidental!
      { step: 4, tineIndex: 15, note: 'E6' },
      { step: 6, tineIndex: 14, note: 'Eb6' }, // Authentic Eb6 / D#6 flat accidental!
      { step: 8, tineIndex: 15, note: 'E6' },
      { step: 10, tineIndex: 10, note: 'B5' },
      { step: 12, tineIndex: 13, note: 'D6' },
      { step: 14, tineIndex: 11, note: 'C6' },

      // Measure 2: A minor resolution + Left Hand arpeggio (A - C - E - A)
      { step: 16, tineIndex: 8, note: 'A5' },
      { step: 16, tineIndex: 0, note: 'C5' },  // Bass downbeat
      { step: 20, tineIndex: 3, note: 'E5' },
      { step: 24, tineIndex: 8, note: 'A5' },
      { step: 28, tineIndex: 10, note: 'B5' },

      // Measure 3: E Major chord with authentic G#(Ab) leading tone
      { step: 32, tineIndex: 3, note: 'E5' },  // Bass downbeat
      { step: 32, tineIndex: 7, note: 'Ab5' }, // Authentic G#5 / Ab5 leading tone!
      { step: 36, tineIndex: 10, note: 'B5' },
      { step: 40, tineIndex: 11, note: 'C6' },
      { step: 44, tineIndex: 3, note: 'E5' },

      // Measure 4: Motif return into repeat
      { step: 48, tineIndex: 15, note: 'E6' },
      { step: 48, tineIndex: 0, note: 'C5' },
      { step: 50, tineIndex: 14, note: 'Eb6' },
      { step: 52, tineIndex: 15, note: 'E6' },
      { step: 54, tineIndex: 14, note: 'Eb6' },
      { step: 56, tineIndex: 15, note: 'E6' },
      { step: 58, tineIndex: 10, note: 'B5' },
      { step: 60, tineIndex: 13, note: 'D6' },
      { step: 62, tineIndex: 11, note: 'C6' },
    ],
  },
  {
    id: 'clair-de-lune',
    title: 'Clair de Lune (Suite Bergamasque)',
    category: 'classic',
    description: 'Claude Debussy - Impressionist masterpiece in D-flat Major with shimmering flat scale harmonies.',
    tempoBpm: 76,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      // Measure 1: Db Major & Ab shimmering chords
      { step: 0, tineIndex: 16, note: 'F6' },
      { step: 0, tineIndex: 12, note: 'Db6' }, // Db6 flat
      { step: 0, tineIndex: 7, note: 'Ab5' },  // Ab5 flat bass
      { step: 6, tineIndex: 14, note: 'Eb6' }, // Eb6 flat
      { step: 10, tineIndex: 12, note: 'Db6' },// Db6 flat
      // Measure 2
      { step: 16, tineIndex: 16, note: 'F6' },
      { step: 16, tineIndex: 19, note: 'Ab6' },// Ab6 flat
      { step: 16, tineIndex: 2, note: 'Eb5' },  // Eb5 flat bass
      { step: 22, tineIndex: 14, note: 'Eb6' },// Eb6 flat
      { step: 26, tineIndex: 11, note: 'C6' },
      // Measure 3
      { step: 32, tineIndex: 13, note: 'D6' },
      { step: 32, tineIndex: 21, note: 'Bb6' },// Bb6 flat
      { step: 32, tineIndex: 9, note: 'Bb5' },  // Bb5 flat bass
      { step: 38, tineIndex: 19, note: 'Ab6' },// Ab6 flat
      { step: 42, tineIndex: 16, note: 'F6' },
      // Measure 4
      { step: 48, tineIndex: 7, note: 'Ab5' },  // Ab5 flat
      { step: 48, tineIndex: 14, note: 'Eb6' },// Eb6 flat
      { step: 48, tineIndex: 19, note: 'Ab6' },// Ab6 flat
      { step: 54, tineIndex: 12, note: 'Db6' },// Db6 flat
      { step: 58, tineIndex: 14, note: 'Eb6' },// Eb6 flat
      { step: 62, tineIndex: 16, note: 'F6' },
    ],
  },
  {
    id: 'chopin-nocturne',
    title: 'Nocturne in E-flat Major (Op. 9 No. 2)',
    category: 'classic',
    description: 'Frédéric Chopin - Romantic piano jewel bathed in lyrical flat major bells and tender ornamentation.',
    tempoBpm: 80,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      // Measure 1: Bb5 - G6 - F6 - Eb6 - D6 - Eb6
      { step: 0, tineIndex: 9, note: 'Bb5' },  // Bb5 flat
      { step: 0, tineIndex: 2, note: 'Eb5' },  // Eb5 flat root bass
      { step: 6, tineIndex: 18, note: 'G6' },
      { step: 10, tineIndex: 16, note: 'F6' },
      { step: 14, tineIndex: 14, note: 'Eb6' },// Eb6 flat
      { step: 18, tineIndex: 13, note: 'D6' },
      { step: 22, tineIndex: 14, note: 'Eb6' },// Eb6 flat
      // Measure 2: C6 - Bb5 - G5 - Ab5
      { step: 26, tineIndex: 11, note: 'C6' },
      { step: 32, tineIndex: 9, note: 'Bb5' },  // Bb5 flat
      { step: 32, tineIndex: 6, note: 'G5' },
      { step: 32, tineIndex: 2, note: 'Eb5' },  // Eb5 flat bass
      { step: 38, tineIndex: 7, note: 'Ab5' },  // Ab5 flat
      { step: 42, tineIndex: 9, note: 'Bb5' },  // Bb5 flat
      { step: 46, tineIndex: 11, note: 'C6' },
      // Measure 3: Eb6 - F6 - G6 - Ab6
      { step: 50, tineIndex: 14, note: 'Eb6' },// Eb6 flat
      { step: 54, tineIndex: 16, note: 'F6' },
      { step: 58, tineIndex: 18, note: 'G6' },
      { step: 62, tineIndex: 19, note: 'Ab6' },// Ab6 flat
    ],
  },
  {
    id: 'canon-in-d',
    title: 'Canon in D',
    category: 'classic',
    description: 'Johann Pachelbel - The quintessential classic mechanical music box melody with cascading arpeggios.',
    tempoBpm: 92,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      // Measure 1: D A B F#
      { step: 0, tineIndex: 13, note: 'D6' },
      { step: 0, tineIndex: 1, note: 'D5' },
      { step: 2, tineIndex: 17, note: 'Gb6' }, // F#6
      { step: 4, tineIndex: 20, note: 'A6' },
      { step: 6, tineIndex: 17, note: 'Gb6' },
      { step: 8, tineIndex: 8, note: 'A5' },
      { step: 8, tineIndex: 18, note: 'G6' },
      { step: 10, tineIndex: 15, note: 'E6' },
      { step: 12, tineIndex: 17, note: 'Gb6' },
      { step: 14, tineIndex: 15, note: 'E6' },
      // Measure 2: G D G A
      { step: 16, tineIndex: 10, note: 'B5' },
      { step: 16, tineIndex: 15, note: 'E6' },
      { step: 18, tineIndex: 11, note: 'C6' },
      { step: 20, tineIndex: 13, note: 'D6' },
      { step: 22, tineIndex: 15, note: 'E6' },
      { step: 24, tineIndex: 5, note: 'Gb5' }, // F#5
      { step: 24, tineIndex: 17, note: 'Gb6' },
      { step: 26, tineIndex: 15, note: 'E6' },
      { step: 28, tineIndex: 13, note: 'D6' },
      { step: 30, tineIndex: 11, note: 'C6' },
      // Measure 3
      { step: 32, tineIndex: 6, note: 'G5' },
      { step: 32, tineIndex: 10, note: 'B5' },
      { step: 34, tineIndex: 11, note: 'C6' },
      { step: 36, tineIndex: 13, note: 'D6' },
      { step: 38, tineIndex: 15, note: 'E6' },
      { step: 40, tineIndex: 1, note: 'D5' },
      { step: 40, tineIndex: 13, note: 'D6' },
      { step: 42, tineIndex: 11, note: 'C6' },
      { step: 44, tineIndex: 10, note: 'B5' },
      { step: 46, tineIndex: 8, note: 'A5' },
      // Measure 4
      { step: 48, tineIndex: 6, note: 'G5' },
      { step: 48, tineIndex: 10, note: 'B5' },
      { step: 50, tineIndex: 8, note: 'A5' },
      { step: 52, tineIndex: 6, note: 'G5' },
      { step: 54, tineIndex: 5, note: 'Gb5' },
      { step: 56, tineIndex: 8, note: 'A5' },
      { step: 56, tineIndex: 15, note: 'E6' },
      { step: 58, tineIndex: 13, note: 'D6' },
      { step: 60, tineIndex: 17, note: 'Gb6' },
      { step: 62, tineIndex: 20, note: 'A6' },
    ],
  },
  {
    id: 'castle-in-the-sky',
    title: 'Castle in the Sky (Carrying You)',
    category: 'anime',
    description: 'Joe Hisaishi - Nostalgic and soaring theme from the Studio Ghibli masterpiece.',
    tempoBpm: 84,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      { step: 0, tineIndex: 8, note: 'A5' },
      { step: 0, tineIndex: 1, note: 'D5' },
      { step: 4, tineIndex: 10, note: 'B5' },
      { step: 8, tineIndex: 11, note: 'C6' },
      { step: 8, tineIndex: 4, note: 'F5' },
      { step: 12, tineIndex: 10, note: 'B5' },
      { step: 16, tineIndex: 11, note: 'C6' },
      { step: 16, tineIndex: 6, note: 'G5' },
      { step: 20, tineIndex: 15, note: 'E6' },
      { step: 24, tineIndex: 10, note: 'B5' },
      { step: 24, tineIndex: 3, note: 'E5' },
      { step: 32, tineIndex: 8, note: 'A5' },
      { step: 32, tineIndex: 0, note: 'C5' },
      { step: 36, tineIndex: 10, note: 'B5' },
      { step: 40, tineIndex: 11, note: 'C6' },
      { step: 40, tineIndex: 4, note: 'F5' },
      { step: 44, tineIndex: 15, note: 'E6' },
      { step: 48, tineIndex: 10, note: 'B5' },
      { step: 48, tineIndex: 3, note: 'E5' },
      { step: 52, tineIndex: 11, note: 'C6' },
      { step: 56, tineIndex: 8, note: 'A5' },
      { step: 56, tineIndex: 1, note: 'D5' },
      { step: 60, tineIndex: 10, note: 'B5' },
    ],
  },
  {
    id: 'always-with-me',
    title: 'Always With Me (Spirited Away)',
    category: 'anime',
    description: 'Yumi Kimura - Heartwarming and gentle music box melody from Spirited Away.',
    tempoBpm: 88,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      { step: 0, tineIndex: 11, note: 'C6' },
      { step: 0, tineIndex: 0, note: 'C5' },
      { step: 4, tineIndex: 13, note: 'D6' },
      { step: 8, tineIndex: 15, note: 'E6' },
      { step: 8, tineIndex: 6, note: 'G5' },
      { step: 12, tineIndex: 11, note: 'C6' },
      { step: 16, tineIndex: 18, note: 'G6' },
      { step: 16, tineIndex: 3, note: 'E5' },
      { step: 20, tineIndex: 15, note: 'E6' },
      { step: 24, tineIndex: 16, note: 'F6' },
      { step: 24, tineIndex: 4, note: 'F5' },
      { step: 28, tineIndex: 15, note: 'E6' },
      { step: 32, tineIndex: 13, note: 'D6' },
      { step: 32, tineIndex: 1, note: 'D5' },
      { step: 36, tineIndex: 11, note: 'C6' },
      { step: 40, tineIndex: 10, note: 'B5' },
      { step: 40, tineIndex: 6, note: 'G5' },
      { step: 44, tineIndex: 8, note: 'A5' },
      { step: 48, tineIndex: 11, note: 'C6' },
      { step: 48, tineIndex: 0, note: 'C5' },
      { step: 52, tineIndex: 13, note: 'D6' },
      { step: 56, tineIndex: 15, note: 'E6' },
      { step: 56, tineIndex: 6, note: 'G5' },
      { step: 60, tineIndex: 13, note: 'D6' },
    ],
  },
  {
    id: 'brahms-lullaby',
    title: "Brahms' Lullaby (Wiegenlied)",
    category: 'lullaby',
    description: 'Johannes Brahms - A soothing, gentle lullaby to drift off to sleep.',
    tempoBpm: 78,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      { step: 0, tineIndex: 15, note: 'E6' },
      { step: 0, tineIndex: 0, note: 'C5' },
      { step: 4, tineIndex: 15, note: 'E6' },
      { step: 8, tineIndex: 18, note: 'G6' },
      { step: 8, tineIndex: 6, note: 'G5' },
      { step: 16, tineIndex: 15, note: 'E6' },
      { step: 16, tineIndex: 3, note: 'E5' },
      { step: 20, tineIndex: 15, note: 'E6' },
      { step: 24, tineIndex: 18, note: 'G6' },
      { step: 24, tineIndex: 6, note: 'G5' },
      { step: 32, tineIndex: 15, note: 'E6' },
      { step: 32, tineIndex: 0, note: 'C5' },
      { step: 36, tineIndex: 18, note: 'G6' },
      { step: 40, tineIndex: 11, note: 'C6' },
      { step: 48, tineIndex: 10, note: 'B5' },
      { step: 52, tineIndex: 20, note: 'A6' },
      { step: 56, tineIndex: 20, note: 'A6' },
      { step: 56, tineIndex: 8, note: 'A5' },
      { step: 60, tineIndex: 18, note: 'G6' },
    ],
  },
  {
    id: 'over-the-rainbow',
    title: 'Over the Rainbow',
    category: 'classic',
    description: 'Harold Arlen - Dreamy, yearning ballad arranged for shimmering steel chime.',
    tempoBpm: 80,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      { step: 0, tineIndex: 0, note: 'C5' },
      { step: 0, tineIndex: 11, note: 'C6' },
      { step: 8, tineIndex: 11, note: 'C6' },
      { step: 16, tineIndex: 10, note: 'B5' },
      { step: 20, tineIndex: 18, note: 'G6' },
      { step: 24, tineIndex: 20, note: 'A6' },
      { step: 28, tineIndex: 10, note: 'B5' },
      { step: 32, tineIndex: 11, note: 'C6' },
      { step: 32, tineIndex: 0, note: 'C5' },
      { step: 40, tineIndex: 20, note: 'A6' },
      { step: 44, tineIndex: 18, note: 'G6' },
      { step: 48, tineIndex: 15, note: 'E6' },
      { step: 48, tineIndex: 3, note: 'E5' },
      { step: 52, tineIndex: 16, note: 'F6' },
      { step: 56, tineIndex: 18, note: 'G6' },
      { step: 60, tineIndex: 20, note: 'A6' },
    ],
  },
  {
    id: 'gymnopedie-1',
    title: 'Gymnopédie No. 1',
    category: 'nature',
    description: 'Erik Satie - Hypnotic, minimalist waltz bathed in tranquil stillness and flat overtones.',
    tempoBpm: 72,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: [
      { step: 0, tineIndex: 6, note: 'G5' },
      { step: 4, tineIndex: 10, note: 'B5' },
      { step: 4, tineIndex: 15, note: 'E6' },
      { step: 8, tineIndex: 20, note: 'A6' },
      { step: 16, tineIndex: 1, note: 'D5' },
      { step: 20, tineIndex: 5, note: 'Gb5' },
      { step: 20, tineIndex: 11, note: 'C6' },
      { step: 24, tineIndex: 17, note: 'Gb6' },
      { step: 32, tineIndex: 6, note: 'G5' },
      { step: 36, tineIndex: 10, note: 'B5' },
      { step: 36, tineIndex: 15, note: 'E6' },
      { step: 40, tineIndex: 18, note: 'G6' },
      { step: 48, tineIndex: 1, note: 'D5' },
      { step: 52, tineIndex: 5, note: 'Gb5' },
      { step: 52, tineIndex: 11, note: 'C6' },
      { step: 56, tineIndex: 15, note: 'E6' },
    ],
  },
];

