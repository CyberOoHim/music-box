import { CombScaleId, MusicBoxPin, COMB_SCALES_MAP, ROMANTIC_FLAT_22_TINES } from '../types';

export interface ProceduralMusicResult {
  title: string;
  composerNote: string;
  mood: string;
  tempoBpm: number;
  totalSteps: number;
  combScaleId: CombScaleId;
  pins: MusicBoxPin[];
  modelUsed: string;
}

// Simple deterministic hash for seeding PRNG from string
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Seedable linear congruential generator
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed > 0 ? seed : 123456789;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

interface CombProfileDef {
  bassTines: number[];
  midHarmonyTines: number[];
  melodyTines: number[];
  highChimeTines: number[];
  tinesCount: number;
}

const COMB_PROFILES: Record<CombScaleId, CombProfileDef> = {
  'romantic-flat': {
    // 0:C5, 1:D5, 2:Eb5, 3:E5, 4:F5, 5:Gb5, 6:G5, 7:Ab5, 8:A5, 9:Bb5, 10:B5, 11:C6, 12:Db6, 13:D6, 14:Eb6, 15:E6, 16:F6, 17:Gb6, 18:G6, 19:Ab6, 20:A6, 21:Bb6
    bassTines: [0, 2, 4, 6, 7, 9], // C5, Eb5, F5, G5, Ab5, Bb5
    midHarmonyTines: [6, 7, 9, 11, 12, 14], // G5, Ab5, Bb5, C6, Db6, Eb6
    melodyTines: [11, 13, 14, 15, 16, 18, 19, 21], // C6, D6, Eb6, E6, F6, G6, Ab6, Bb6
    highChimeTines: [18, 19, 20, 21],
    tinesCount: 22,
  },
  'chromatic-30': {
    // 0:C5 to 29:F7
    bassTines: [0, 3, 5, 7, 8, 10, 12], // C5, Eb5, F5, G5, Ab5, Bb5, C6
    midHarmonyTines: [7, 10, 12, 15, 17, 19], // G5, Bb5, C6, Eb6, F6, G6
    melodyTines: [12, 14, 15, 17, 19, 20, 22, 24, 26, 27], // C6 to Eb7
    highChimeTines: [24, 26, 27, 28, 29], // C7 to F7
    tinesCount: 30,
  },
  'flat-major-18': {
    // 0:Bb4, 1:C5, 2:Db5, 3:Eb5, 4:F5, 5:G5, 6:Ab5, 7:Bb5, 8:C6, 9:Db6, 10:Eb6, 11:F6, 12:G6, 13:Ab6, 14:Bb6, 15:C7, 16:Db7, 17:Eb7
    bassTines: [0, 1, 3, 4, 6, 7], // Bb4, C5, Eb5, F5, Ab5, Bb5
    midHarmonyTines: [5, 6, 7, 8, 10, 11],
    melodyTines: [8, 10, 11, 12, 13, 14, 15, 17],
    highChimeTines: [14, 15, 16, 17],
    tinesCount: 18,
  },
  'sankyo-18': {
    // 0:C5, 1:D5, 2:E5, 3:F5, 4:Gb5(F#5), 5:G5, 6:A5, 7:B5, 8:C6, 9:D6, 10:E6, 11:F6, 12:Gb6(F#6), 13:G6, 14:A6, 15:B6, 16:C7, 17:D7
    bassTines: [0, 1, 2, 3, 5, 6],
    midHarmonyTines: [5, 6, 7, 8, 9, 10],
    melodyTines: [8, 9, 10, 11, 13, 14, 15, 16, 17],
    highChimeTines: [13, 14, 15, 16, 17],
    tinesCount: 18,
  },
};

export function generateProceduralMusic(
  prompt: string,
  style: string,
  totalSteps: number = 64,
  combScaleId: CombScaleId = 'romantic-flat',
  mode?: string
): ProceduralMusicResult {
  const lowerPrompt = prompt.toLowerCase().trim();
  const isMoonlight = lowerPrompt.includes('moonlight') || (lowerPrompt.includes('beethoven') && lowerPrompt.includes('sonata'));
  const isFurElise = lowerPrompt.includes('fur elise') || lowerPrompt.includes('elise');
  const isCanon = lowerPrompt.includes('canon') || lowerPrompt.includes('pachelbel');
  const isClairDeLune = lowerPrompt.includes('clair de lune') || lowerPrompt.includes('debussy');

  // 1. Classical Masterpiece Deterministic Transcriptions for Procedural Fallback
  if (isMoonlight) {
    const is30 = combScaleId === 'chromatic-30';
    const pins: MusicBoxPin[] = [];
    let pId = 0;

    // Measure 1: Db5 Bass + rolling Ab5 - Db6 - E6 triplets
    pins.push({ id: `p-${pId++}`, step: 0, tineIndex: is30 ? 1 : 0, note: is30 ? 'Db5' : 'C5' });
    pins.push({ id: `p-${pId++}`, step: 0, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 1, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    pins.push({ id: `p-${pId++}`, step: 2, tineIndex: is30 ? 16 : 15, note: 'E6' });

    pins.push({ id: `p-${pId++}`, step: 4, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 5, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    pins.push({ id: `p-${pId++}`, step: 6, tineIndex: is30 ? 16 : 15, note: 'E6' });

    pins.push({ id: `p-${pId++}`, step: 8, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 9, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    pins.push({ id: `p-${pId++}`, step: 10, tineIndex: is30 ? 16 : 15, note: 'E6' });

    pins.push({ id: `p-${pId++}`, step: 12, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 13, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    pins.push({ id: `p-${pId++}`, step: 14, tineIndex: is30 ? 16 : 15, note: 'E6' });

    // Measure 2: B Bass downbeat + Ab5 - Db6 - E6
    pins.push({ id: `p-${pId++}`, step: 16, tineIndex: is30 ? 0 : 10, note: is30 ? 'C5' : 'B5' });
    pins.push({ id: `p-${pId++}`, step: 16, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 17, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    pins.push({ id: `p-${pId++}`, step: 18, tineIndex: is30 ? 16 : 15, note: 'E6' });

    pins.push({ id: `p-${pId++}`, step: 20, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 21, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    pins.push({ id: `p-${pId++}`, step: 22, tineIndex: is30 ? 16 : 15, note: 'E6' });

    pins.push({ id: `p-${pId++}`, step: 24, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 25, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    pins.push({ id: `p-${pId++}`, step: 26, tineIndex: is30 ? 16 : 15, note: 'E6' });

    pins.push({ id: `p-${pId++}`, step: 28, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 29, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    pins.push({ id: `p-${pId++}`, step: 30, tineIndex: is30 ? 16 : 15, note: 'E6' });

    // Measure 3: A Bass + A5 - D6 - F6
    pins.push({ id: `p-${pId++}`, step: 32, tineIndex: is30 ? 9 : 8, note: 'A5' });
    pins.push({ id: `p-${pId++}`, step: 32, tineIndex: is30 ? 14 : 13, note: 'D6' });
    pins.push({ id: `p-${pId++}`, step: 33, tineIndex: is30 ? 17 : 16, note: 'F6' });
    pins.push({ id: `p-${pId++}`, step: 36, tineIndex: is30 ? 9 : 8, note: 'A5' });
    pins.push({ id: `p-${pId++}`, step: 37, tineIndex: is30 ? 14 : 13, note: 'D6' });
    pins.push({ id: `p-${pId++}`, step: 38, tineIndex: is30 ? 17 : 16, note: 'F6' });

    // Measure 4: Ab Bass + G#5 - C#6 - E6 transition
    pins.push({ id: `p-${pId++}`, step: 48, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
    pins.push({ id: `p-${pId++}`, step: 48, tineIndex: is30 ? 16 : 15, note: 'E6' });
    pins.push({ id: `p-${pId++}`, step: 49, tineIndex: is30 ? 20 : 19, note: 'Ab6' });
    pins.push({ id: `p-${pId++}`, step: 60, tineIndex: is30 ? 16 : 15, note: 'E6' });
    pins.push({ id: `p-${pId++}`, step: 61, tineIndex: is30 ? 20 : 19, note: 'Ab6' });
    pins.push({ id: `p-${pId++}`, step: 62, tineIndex: is30 ? 24 : 11, note: is30 ? 'C7' : 'C6' });

    // If extended steps (96 or 128 steps), add Measure 5-8 singing melody entrance
    if (totalSteps >= 96) {
      pins.push({ id: `p-${pId++}`, step: 64, tineIndex: is30 ? 1 : 0, note: is30 ? 'Db5' : 'C5' });
      pins.push({ id: `p-${pId++}`, step: 64, tineIndex: is30 ? 8 : 7, note: 'Ab5' });
      pins.push({ id: `p-${pId++}`, step: 65, tineIndex: is30 ? 13 : 12, note: 'Db6' });
      pins.push({ id: `p-${pId++}`, step: 66, tineIndex: is30 ? 16 : 15, note: 'E6' });
      pins.push({ id: `p-${pId++}`, step: 68, tineIndex: is30 ? 20 : 19, note: 'Ab6' }); // Melody entrance!
      pins.push({ id: `p-${pId++}`, step: 72, tineIndex: is30 ? 20 : 19, note: 'Ab6' });
      pins.push({ id: `p-${pId++}`, step: 76, tineIndex: is30 ? 20 : 19, note: 'Ab6' });
      pins.push({ id: `p-${pId++}`, step: 80, tineIndex: is30 ? 20 : 19, note: 'Ab6' });
      pins.push({ id: `p-${pId++}`, step: 84, tineIndex: is30 ? 16 : 15, note: 'E6' });
      pins.push({ id: `p-${pId++}`, step: 88, tineIndex: is30 ? 15 : 14, note: 'Eb6' });
      pins.push({ id: `p-${pId++}`, step: 92, tineIndex: is30 ? 13 : 12, note: 'Db6' });
    }

    return {
      title: 'Moonlight Sonata (Adagio sostenuto)',
      composerNote: 'Ludwig van Beethoven - Faithful transcription of the opening Adagio sostenuto with rolling triplet accompaniment and C# minor bass octave chimes.',
      mood: 'Nocturnal & Poetic',
      tempoBpm: 68,
      totalSteps,
      combScaleId,
      pins,
      modelUsed: 'procedural-classical-transcriber',
    };
  }

  const seed = hashString(`${prompt.toLowerCase().trim()}::${style.toLowerCase().trim()}::${combScaleId}::${totalSteps}`);
  const rng = new SeededRandom(seed);

  const isWaltz = style === 'waltz' || /waltz|3\/4/i.test(prompt) || /waltz/i.test(style);
  const isCeltic = style === 'celtic' || /celtic|irish|folk/i.test(prompt) || /celtic|folk/i.test(style);
  const isLullaby = style === 'lullaby' || /lullaby|sleep|baby|star|bedtime/i.test(prompt) || /lullaby|sleep/i.test(style);
  const isNostalgic = style === 'nostalgic' || /ghibli|nostalg|memory|dream/i.test(prompt) || /nostalg/i.test(style);
  const isBaroque = /baroque|classical|bach|mozart/i.test(prompt) || style === 'classical';

  const profile = COMB_PROFILES[combScaleId] || COMB_PROFILES['romantic-flat'];

  const measureSteps = isWaltz ? 12 : 16;
  const numMeasures = Math.max(2, Math.floor(totalSteps / measureSteps));

  const pins: MusicBoxPin[] = [];
  let pinId = 0;

  // Track last step each tine was struck to strictly enforce the >= 2 steps cooldown
  const lastTineStep = new Map<number, number>();
  // O(1) polyphony tracking per step
  const stepPinCount = new Map<number, number>();
  // O(1) deduplication tracking
  const stepTineSet = new Set<string>();

  const activeScale = COMB_SCALES_MAP[combScaleId];
  const tinesList = activeScale ? activeScale.tines : ROMANTIC_FLAT_22_TINES;

  const canStrikeTine = (tine: number, step: number): boolean => {
    const last = lastTineStep.get(tine);
    if (last !== undefined && step - last < 2) return false;
    return true;
  };

  const addPin = (step: number, tine: number) => {
    if (step < 0 || step >= totalSteps || tine < 0 || tine >= profile.tinesCount) return false;
    if (!canStrikeTine(tine, step)) return false;

    // Polyphony check: O(1) max 3 pins per step
    const countAtStep = stepPinCount.get(step) || 0;
    if (countAtStep >= 3) return false;

    // Deduplication check: O(1)
    const key = `${step}:${tine}`;
    if (stepTineSet.has(key)) return false;

    const noteName = tinesList[tine]?.note || 'C5';
    pins.push({ id: `pin-p-${pinId++}`, step, tineIndex: tine, note: noteName });

    stepTineSet.add(key);
    stepPinCount.set(step, countAtStep + 1);
    lastTineStep.set(tine, step);
    return true;
  };

  // 1. Generate Harmonic Progression / Bass Accompaniment
  const chordRoots: number[] = [];
  for (let m = 0; m < numMeasures; m++) {
    // Choose bass root based on variation and measure position
    const bassOptions = profile.bassTines;
    const root = bassOptions[m % bassOptions.length];
    chordRoots.push(root);
  }

  for (let m = 0; m < numMeasures; m++) {
    const rootStep = m * measureSteps;
    const bass = chordRoots[m];

    // Downbeat bass strike
    addPin(rootStep, bass);

    if (isWaltz) {
      // 3/4 Oom-pah-pah at beats 2 and 3 (step + 4, step + 8)
      const mid1 = rng.choice(profile.midHarmonyTines);
      const mid2 = rng.choice(profile.midHarmonyTines);
      if (rootStep + 4 < totalSteps) addPin(rootStep + 4, mid1);
      if (rootStep + 8 < totalSteps) addPin(rootStep + 8, mid2);
    } else {
      // 4/4 Arpeggio pattern (beats 2, 3, 4)
      const midA = rng.choice(profile.midHarmonyTines);
      const midB = rng.choice(profile.midHarmonyTines);
      if (rootStep + 4 < totalSteps && rng.next() > 0.15) addPin(rootStep + 4, midA);
      if (rootStep + 8 < totalSteps && rng.next() > 0.1) addPin(rootStep + 8, midB);
      if (rootStep + 12 < totalSteps && rng.next() > 0.25) addPin(rootStep + 12, midA);
    }
  }

  // 2. Generate Sparkling Melodic Contour
  const melodyPool = profile.melodyTines;
  // Create an authentic motif with seed
  const motifLength = isWaltz ? 6 : 8;
  const motif: number[] = [];
  for (let i = 0; i < motifLength; i++) {
    motif.push(rng.choice(melodyPool));
  }

  const stepHop = isLullaby ? 4 : isCeltic ? 2 : isBaroque ? 2 : 3;

  for (let s = 0; s < totalSteps; s += stepHop) {
    // Leave some space on bass downbeats unless waltz
    if (s % measureSteps === 0 && !isWaltz && rng.next() > 0.4) continue;

    const motifIdx = Math.floor((s / stepHop) % motif.length);
    let note = motif[motifIdx];

    // Apply phrase variation in second half
    if (s >= Math.floor(totalSteps / 2) && rng.next() > 0.35) {
      note = rng.choice(melodyPool);
    }

    addPin(s, note);

    // Occasional celestial chime overtone
    if (s % (measureSteps / 2) === 0 && s + 1 < totalSteps && (isNostalgic || isLullaby || rng.next() > 0.7)) {
      const highChime = rng.choice(profile.highChimeTines);
      addPin(s + 1, highChime);
    }
  }

  // 3. Cadential Resolution (Smooth Loop back to step 0)
  const lastMeasureStart = (numMeasures - 1) * measureSteps;
  if (lastMeasureStart + (measureSteps - 2) < totalSteps) {
    const resolutionChime = profile.highChimeTines[0];
    addPin(lastMeasureStart + (measureSteps - 2), resolutionChime);
  }

  const formattedStyle = style ? style.charAt(0).toUpperCase() + style.slice(1) : 'Music Box';
  let title = 'Whispering Music Box';
  if (isLullaby) title = rng.choice(['Starlit Lullaby', 'Cradle of Night', 'Slumbering Starlight', 'Velvet Slumber']);
  else if (isNostalgic) title = rng.choice(['Clockwork Meadow', 'Nostalgic Wind', 'Memories of Laputa', 'Forgotten Garden']);
  else if (isCeltic) title = rng.choice(['Enchanted Glen Air', 'Whispers of Erin', 'Loch Lomond Chime', 'Heather & Mist']);
  else if (isWaltz) title = rng.choice(['Montmartre Carousel', 'Clockwork Waltz', 'Viennese Promenade', 'Ballerina in Brass']);
  else if (isBaroque) title = rng.choice(['Sonata in Steel', 'Clockmaker\'s Minuet', 'Bourrée in G', 'Harpsichord Chime']);
  else if (style && style !== 'melodic') title = `${formattedStyle} Chime`;

  const mood = isLullaby
    ? 'Peaceful Lullaby'
    : isWaltz
    ? 'Vintage Waltz'
    : isCeltic
    ? 'Mystical Folk'
    : isNostalgic
    ? 'Nostalgic & Poetic'
    : isBaroque
    ? 'Classical Elegance'
    : formattedStyle;

  return {
    title,
    composerNote: `Procedural music box arrangement in ${style || 'melodic'} style crafted for ${combScaleId} (${profile.tinesCount} tines) inspired by "${prompt.slice(0, 80)}".`,
    mood,
    tempoBpm: isLullaby ? 72 : isWaltz ? 96 : isCeltic ? 92 : 84,
    totalSteps,
    combScaleId,
    pins,
    modelUsed: 'procedural-musicbox-engine',
  };
}
