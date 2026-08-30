import { MusicBoxSong } from '../types';

export const DEFAULT_SONGS: MusicBoxSong[] = [
  {
    id: 'canon-in-d',
    title: 'Canon in D',
    category: 'classic',
    description: 'Johann Pachelbel - The quintessential classic mechanical music box melody with cascading arpeggios.',
    tempoBpm: 92,
    totalSteps: 64,
    pins: [
      // Measure 1: D A B F#
      { step: 0, tineIndex: 9 }, // D6
      { step: 0, tineIndex: 1 }, // D5 (bass)
      { step: 2, tineIndex: 12 }, // F#6
      { step: 4, tineIndex: 14 }, // A6
      { step: 6, tineIndex: 12 }, // F#6
      { step: 8, tineIndex: 6 },  // A5
      { step: 8, tineIndex: 13 }, // G6
      { step: 10, tineIndex: 10 }, // E6
      { step: 12, tineIndex: 12 }, // F#6
      { step: 14, tineIndex: 10 }, // E6
      // Measure 2: G D G A
      { step: 16, tineIndex: 7 }, // B5
      { step: 16, tineIndex: 10 }, // E6
      { step: 18, tineIndex: 8 }, // C6
      { step: 20, tineIndex: 9 }, // D6
      { step: 22, tineIndex: 10 }, // E6
      { step: 24, tineIndex: 4 }, // F#5
      { step: 24, tineIndex: 12 }, // F#6
      { step: 26, tineIndex: 10 }, // E6
      { step: 28, tineIndex: 9 }, // D6
      { step: 30, tineIndex: 8 }, // C6
      // Measure 3: G D G A
      { step: 32, tineIndex: 5 }, // G5
      { step: 32, tineIndex: 7 }, // B5
      { step: 34, tineIndex: 8 }, // C6
      { step: 36, tineIndex: 9 }, // D6
      { step: 38, tineIndex: 10 }, // E6
      { step: 40, tineIndex: 1 }, // D5
      { step: 40, tineIndex: 9 }, // D6
      { step: 42, tineIndex: 8 }, // C6
      { step: 44, tineIndex: 7 }, // B5
      { step: 46, tineIndex: 6 }, // A5
      // Measure 4: G A D
      { step: 48, tineIndex: 5 }, // G5
      { step: 48, tineIndex: 7 }, // B5
      { step: 50, tineIndex: 6 }, // A5
      { step: 52, tineIndex: 5 }, // G5
      { step: 54, tineIndex: 4 }, // F#5
      { step: 56, tineIndex: 6 }, // A5
      { step: 56, tineIndex: 10 }, // E6
      { step: 58, tineIndex: 9 }, // D6
      { step: 60, tineIndex: 12 }, // F#6
      { step: 62, tineIndex: 14 }, // A6
    ]
  },
  {
    id: 'castle-in-the-sky',
    title: 'Castle in the Sky (Carrying You)',
    category: 'anime',
    description: 'Joe Hisaishi - Nostalgic and soaring theme from the Studio Ghibli masterpiece.',
    tempoBpm: 84,
    totalSteps: 64,
    pins: [
      // Intro / Theme: A B C B C E B
      { step: 0, tineIndex: 6 },  // A5
      { step: 0, tineIndex: 1 },  // D5
      { step: 4, tineIndex: 7 },  // B5
      { step: 8, tineIndex: 8 },  // C6
      { step: 8, tineIndex: 3 },  // F5
      { step: 12, tineIndex: 7 }, // B5
      { step: 16, tineIndex: 8 }, // C6
      { step: 16, tineIndex: 5 }, // G5
      { step: 20, tineIndex: 10 },// E6
      { step: 24, tineIndex: 7 }, // B5
      { step: 24, tineIndex: 2 }, // E5
      { step: 32, tineIndex: 6 }, // A5
      { step: 32, tineIndex: 0 }, // C5
      { step: 36, tineIndex: 7 }, // B5
      { step: 40, tineIndex: 8 }, // C6
      { step: 40, tineIndex: 3 }, // F5
      { step: 44, tineIndex: 10 },// E6
      { step: 48, tineIndex: 7 }, // B5
      { step: 48, tineIndex: 2 }, // E5
      { step: 52, tineIndex: 8 }, // C6
      { step: 56, tineIndex: 6 }, // A5
      { step: 56, tineIndex: 1 }, // D5
      { step: 60, tineIndex: 7 }, // B5
    ]
  },
  {
    id: 'clair-de-lune',
    title: 'Clair de Lune',
    category: 'classic',
    description: 'Claude Debussy - Gentle moonlight cascading through quiet waters.',
    tempoBpm: 76,
    totalSteps: 64,
    pins: [
      { step: 0, tineIndex: 11 }, // F6
      { step: 0, tineIndex: 15 }, // B6
      { step: 0, tineIndex: 3 },  // F5
      { step: 6, tineIndex: 10 }, // E6
      { step: 10, tineIndex: 8 }, // C6
      { step: 16, tineIndex: 11 }, // F6
      { step: 16, tineIndex: 13 }, // G6
      { step: 16, tineIndex: 5 },  // G5
      { step: 22, tineIndex: 10 }, // E6
      { step: 26, tineIndex: 8 },  // C6
      { step: 32, tineIndex: 9 },  // D6
      { step: 32, tineIndex: 14 }, // A6
      { step: 32, tineIndex: 1 },  // D5
      { step: 38, tineIndex: 8 },  // C6
      { step: 42, tineIndex: 6 },  // A5
      { step: 48, tineIndex: 5 },  // G5
      { step: 48, tineIndex: 10 }, // E6
      { step: 48, tineIndex: 13 }, // G6
      { step: 54, tineIndex: 8 },  // C6
      { step: 58, tineIndex: 10 }, // E6
      { step: 62, tineIndex: 16 }, // C7
    ]
  },
  {
    id: 'always-with-me',
    title: 'Always With Me (Spirited Away)',
    category: 'anime',
    description: 'Yumi Kimura - Heartwarming and gentle music box melody from Spirited Away.',
    tempoBpm: 88,
    totalSteps: 64,
    pins: [
      { step: 0, tineIndex: 8 },  // C6
      { step: 0, tineIndex: 0 },  // C5
      { step: 4, tineIndex: 9 },  // D6
      { step: 8, tineIndex: 10 }, // E6
      { step: 8, tineIndex: 5 },  // G5
      { step: 12, tineIndex: 8 }, // C6
      { step: 16, tineIndex: 13 },// G6
      { step: 16, tineIndex: 2 }, // E5
      { step: 20, tineIndex: 10 },// E6
      { step: 24, tineIndex: 11 },// F6
      { step: 24, tineIndex: 3 }, // F5
      { step: 28, tineIndex: 10 },// E6
      { step: 32, tineIndex: 9 }, // D6
      { step: 32, tineIndex: 1 }, // D5
      { step: 36, tineIndex: 8 }, // C6
      { step: 40, tineIndex: 7 }, // B5
      { step: 40, tineIndex: 5 }, // G5
      { step: 44, tineIndex: 6 }, // A5
      { step: 48, tineIndex: 8 }, // C6
      { step: 48, tineIndex: 0 }, // C5
      { step: 52, tineIndex: 9 }, // D6
      { step: 56, tineIndex: 10 },// E6
      { step: 56, tineIndex: 5 }, // G5
      { step: 60, tineIndex: 9 }, // D6
    ]
  },
  {
    id: 'fur-elise',
    title: 'Für Elise',
    category: 'classic',
    description: 'Ludwig van Beethoven - The timeless miniature beloved by generations of music boxes.',
    tempoBpm: 104,
    totalSteps: 64,
    pins: [
      { step: 0, tineIndex: 10 }, // E6
      { step: 2, tineIndex: 12 }, // F#6 (or D#)
      { step: 4, tineIndex: 10 }, // E6
      { step: 6, tineIndex: 12 }, // F#6
      { step: 8, tineIndex: 10 }, // E6
      { step: 10, tineIndex: 7 }, // B5
      { step: 12, tineIndex: 9 }, // D6
      { step: 14, tineIndex: 8 }, // C6
      { step: 16, tineIndex: 6 }, // A5
      { step: 16, tineIndex: 1 }, // D5
      { step: 20, tineIndex: 0 }, // C5
      { step: 24, tineIndex: 2 }, // E5
      { step: 28, tineIndex: 6 }, // A5
      { step: 32, tineIndex: 7 }, // B5
      { step: 32, tineIndex: 2 }, // E5
      { step: 36, tineIndex: 2 }, // E5
      { step: 40, tineIndex: 4 }, // F#5
      { step: 44, tineIndex: 7 }, // B5
      { step: 48, tineIndex: 8 }, // C6
      { step: 48, tineIndex: 0 }, // C5
      { step: 52, tineIndex: 2 }, // E5
      { step: 56, tineIndex: 10 },// E6
      { step: 58, tineIndex: 12 },// F#6
      { step: 60, tineIndex: 10 },// E6
      { step: 62, tineIndex: 12 },// F#6
    ]
  },
  {
    id: 'brahms-lullaby',
    title: "Brahms' Lullaby (Wiegenlied)",
    category: 'lullaby',
    description: 'Johannes Brahms - A soothing, gentle lullaby to drift off to sleep.',
    tempoBpm: 78,
    totalSteps: 64,
    pins: [
      { step: 0, tineIndex: 10 }, // E6
      { step: 0, tineIndex: 0 },  // C5
      { step: 4, tineIndex: 10 }, // E6
      { step: 8, tineIndex: 13 }, // G6
      { step: 8, tineIndex: 5 },  // G5
      { step: 16, tineIndex: 10 },// E6
      { step: 16, tineIndex: 2 }, // E5
      { step: 20, tineIndex: 10 },// E6
      { step: 24, tineIndex: 13 },// G6
      { step: 24, tineIndex: 5 }, // G5
      { step: 32, tineIndex: 10 },// E6
      { step: 32, tineIndex: 0 }, // C5
      { step: 36, tineIndex: 13 },// G6
      { step: 40, tineIndex: 16 },// C7
      { step: 40, tineIndex: 8 }, // C6
      { step: 48, tineIndex: 15 },// B6
      { step: 48, tineIndex: 7 }, // B5
      { step: 52, tineIndex: 14 },// A6
      { step: 56, tineIndex: 14 },// A6
      { step: 56, tineIndex: 6 }, // A5
      { step: 60, tineIndex: 13 },// G6
    ]
  },
  {
    id: 'over-the-rainbow',
    title: 'Over the Rainbow',
    category: 'classic',
    description: 'Harold Arlen - Dreamy, yearning ballad arranged for shimmering steel chime.',
    tempoBpm: 80,
    totalSteps: 64,
    pins: [
      { step: 0, tineIndex: 0 },  // C5
      { step: 0, tineIndex: 8 },  // C6
      { step: 8, tineIndex: 16 }, // C7
      { step: 16, tineIndex: 7 }, // B5
      { step: 16, tineIndex: 15 },// B6
      { step: 20, tineIndex: 13 },// G6
      { step: 24, tineIndex: 14 },// A6
      { step: 28, tineIndex: 15 },// B6
      { step: 32, tineIndex: 8 }, // C6
      { step: 32, tineIndex: 16 },// C7
      { step: 32, tineIndex: 0 }, // C5
      { step: 40, tineIndex: 14 },// A6
      { step: 44, tineIndex: 13 },// G6
      { step: 48, tineIndex: 10 },// E6
      { step: 48, tineIndex: 2 }, // E5
      { step: 52, tineIndex: 11 },// F6
      { step: 56, tineIndex: 13 },// G6
      { step: 60, tineIndex: 14 },// A6
    ]
  },
  {
    id: 'gymnopedie-1',
    title: 'Gymnopédie No. 1',
    category: 'nature',
    description: 'Erik Satie - Hypnotic, minimalist waltz bathed in tranquil stillness.',
    tempoBpm: 72,
    totalSteps: 64,
    pins: [
      { step: 0, tineIndex: 5 },  // G5 (bass)
      { step: 4, tineIndex: 7 },  // B5 (chord)
      { step: 4, tineIndex: 10 }, // E6
      { step: 8, tineIndex: 14 }, // A6 (melody)
      { step: 16, tineIndex: 1 }, // D5 (bass)
      { step: 20, tineIndex: 4 }, // F#5
      { step: 20, tineIndex: 8 }, // C6
      { step: 24, tineIndex: 12 },// F#6
      { step: 32, tineIndex: 5 }, // G5 (bass)
      { step: 36, tineIndex: 7 }, // B5
      { step: 36, tineIndex: 10 },// E6
      { step: 40, tineIndex: 13 },// G6
      { step: 48, tineIndex: 1 }, // D5
      { step: 52, tineIndex: 4 }, // F#5
      { step: 52, tineIndex: 8 }, // C6
      { step: 56, tineIndex: 10 },// E6
    ]
  }
];
