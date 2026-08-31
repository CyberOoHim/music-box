import { MusicBoxPin } from '../types';

export interface ProceduralMusicResult {
  title: string;
  composerNote: string;
  mood: string;
  tempoBpm: number;
  totalSteps: number;
  pins: MusicBoxPin[];
  modelUsed: string;
}

export function generateProceduralMusic(
  prompt: string,
  style: string,
  totalSteps: number = 64
): ProceduralMusicResult {
  const isWaltz = style === 'waltz' || /waltz|3\/4/i.test(prompt) || /waltz/i.test(style);
  const isCeltic = style === 'celtic' || /celtic|irish|folk/i.test(prompt) || /celtic|folk/i.test(style);
  const isLullaby = style === 'lullaby' || /lullaby|sleep|baby|star/i.test(prompt) || /lullaby|sleep/i.test(style);
  const isNostalgic = style === 'nostalgic' || /ghibli|nostalg/i.test(prompt) || /nostalg/i.test(style);

  // Scales mapped to Sankyo 18 tines:
  // 0:C5, 1:D5, 2:E5, 3:F5, 4:F#5, 5:G5, 6:A5, 7:B5, 8:C6, 9:D6, 10:E6, 11:F6, 12:F#6, 13:G6, 14:A6, 15:B6, 16:C7, 17:D7
  const melodyPitches = [8, 10, 13, 14, 16, 15, 13, 10, 8, 9, 10, 13, 14, 16, 17, 16];
  const bassPitches = [0, 5, 2, 5, 0, 6, 1, 5];

  const pins: MusicBoxPin[] = [];
  let pinId = 0;

  const measureSteps = isWaltz ? 12 : 16;
  const numMeasures = Math.max(2, Math.floor(totalSteps / measureSteps));

  // 1. Bass accompaniment
  for (let m = 0; m < numMeasures; m++) {
    const rootStep = m * measureSteps;
    const bass = bassPitches[m % bassPitches.length];
    if (rootStep < totalSteps) {
      pins.push({ id: `pin-p-${pinId++}`, step: rootStep, tineIndex: bass });
      if (isWaltz) {
        // Oom-pah-pah
        if (rootStep + 4 < totalSteps) pins.push({ id: `pin-p-${pinId++}`, step: rootStep + 4, tineIndex: 8 });
        if (rootStep + 8 < totalSteps) pins.push({ id: `pin-p-${pinId++}`, step: rootStep + 8, tineIndex: 10 });
      } else {
        // Arpeggiated bass pattern
        if (rootStep + 4 < totalSteps) pins.push({ id: `pin-p-${pinId++}`, step: rootStep + 4, tineIndex: 5 });
        if (rootStep + 8 < totalSteps) pins.push({ id: `pin-p-${pinId++}`, step: rootStep + 8, tineIndex: 8 });
        if (rootStep + 12 < totalSteps) pins.push({ id: `pin-p-${pinId++}`, step: rootStep + 12, tineIndex: 10 });
      }
    }
  }

  // 2. Sparkling treble melody line
  const stepHop = isLullaby ? 4 : isCeltic ? 2 : 3;
  let melodyIdx = 0;
  for (let s = 0; s < totalSteps; s += stepHop) {
    if (s % measureSteps === 0 && !isWaltz) continue; // let bass ring
    const note = melodyPitches[melodyIdx % melodyPitches.length];
    pins.push({ id: `pin-p-${pinId++}`, step: s, tineIndex: note });
    melodyIdx++;

    // Occasional sweet chime harmony
    if (s % 8 === 0 && s + 1 < totalSteps && (isNostalgic || isLullaby)) {
      pins.push({ id: `pin-p-${pinId++}`, step: s + 1, tineIndex: 16 });
    }
  }

  const formattedStyle = style ? style.charAt(0).toUpperCase() + style.slice(1) : 'Music Box';
  let title = 'Whispering Music Box';
  if (isLullaby) title = 'Starlit Lullaby';
  else if (isNostalgic) title = 'Nostalgic Clockwork Meadow';
  else if (isCeltic) title = 'Enchanted Glen Air';
  else if (isWaltz) title = 'Montmartre Carousel Waltz';
  else if (style && style !== 'melodic') title = `${formattedStyle} Chime`;

  const mood = isLullaby
    ? 'Peaceful Lullaby'
    : isWaltz
    ? 'Vintage Waltz'
    : isCeltic
    ? 'Mystical Folk'
    : isNostalgic
    ? 'Nostalgic'
    : formattedStyle;

  return {
    title,
    composerNote: `Composed for 18-note cylinder movement in ${style || 'melodic'} style inspired by: "${prompt}".`,
    mood,
    tempoBpm: isLullaby ? 74 : isWaltz ? 96 : 88,
    totalSteps,
    pins,
    modelUsed: 'procedural-musicbox-engine',
  };
}
