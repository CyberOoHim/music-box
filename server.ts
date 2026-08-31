import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '100kb' }));

// Lazy getter for GoogleGenAI
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Check if Gemini AI composer is enabled (API key configured)
app.get('/api/gemini/status', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isEnabled = Boolean(apiKey && apiKey.trim().length > 0);
  res.json({ enabled: isEnabled });
});

// Helper: Procedural algorithmic music box generator (used as graceful fallback if API is unavailable)
function generateProceduralMusic(prompt: string, style: string, totalSteps: number) {
  const isWaltz = style === 'waltz' || /waltz|3\/4/i.test(prompt) || /waltz/i.test(style);
  const isCeltic = style === 'celtic' || /celtic|irish|folk/i.test(prompt) || /celtic|folk/i.test(style);
  const isLullaby = style === 'lullaby' || /lullaby|sleep|baby|star/i.test(prompt) || /lullaby|sleep/i.test(style);
  const isNostalgic = style === 'nostalgic' || /ghibli|nostalg/i.test(prompt) || /nostalg/i.test(style);

  // Scales mapped to Sankyo 18 tines:
  // 0:C5, 1:D5, 2:E5, 3:F5, 4:F#5, 5:G5, 6:A5, 7:B5, 8:C6, 9:D6, 10:E6, 11:F6, 12:F#6, 13:G6, 14:A6, 15:B6, 16:C7, 17:D7
  const melodyPitches = [8, 10, 13, 14, 16, 15, 13, 10, 8, 9, 10, 13, 14, 16, 17, 16];
  const bassPitches = [0, 5, 2, 5, 0, 6, 1, 5];

  const pins: { id: string; step: number; tineIndex: number }[] = [];
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

// Gemini AI Music Box Composer Endpoint
app.post('/api/gemini/compose', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(403).json({
      error: 'AI Composer is disabled because GEMINI_API_KEY is not configured in the environment.',
    });
  }

  const rawSteps = Number(req.body.totalSteps);
  const totalSteps = Number.isFinite(rawSteps) ? Math.min(Math.max(rawSteps, 16), 256) : 64;
  const { prompt, style = 'melodic', tempoPreference, combScaleId = 'romantic-flat' } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const ai = getGeminiClient();

  const COMB_TUNINGS: Record<string, { name: string; tinesCount: number; tuningText: string }> = {
    'romantic-flat': {
      name: 'Romantic Flat Repertoire Scale (22 tines)',
      tinesCount: 22,
      tuningText: `The 22 steel tines are tuned to the Romantic Flat Repertoire Scale from lowest (tine 0) to highest (tine 21):
Tine 0: C5 (523.3 Hz) - Bass root
Tine 1: D5 (587.3 Hz)
Tine 2: Eb5 / D#5 (622.3 Hz) - Flat romantic
Tine 3: E5 (659.3 Hz)
Tine 4: F5 (698.5 Hz)
Tine 5: Gb5 / F#5 (740.0 Hz) - Flat harmonic
Tine 6: G5 (784.0 Hz) - Central fifth
Tine 7: Ab5 / G#5 (830.6 Hz) - Tender flat chime
Tine 8: A5 (880.0 Hz)
Tine 9: Bb5 / A#5 (932.3 Hz) - Flat nocturne
Tine 10: B5 (987.8 Hz)
Tine 11: C6 (1046.5 Hz) - High melody root
Tine 12: Db6 / C#6 (1108.7 Hz) - Crystalline flat
Tine 13: D6 (1174.7 Hz)
Tine 14: Eb6 / D#6 (1244.5 Hz) - High flat bell (Für Elise signature accidental!)
Tine 15: E6 (1318.5 Hz)
Tine 16: F6 (1396.9 Hz)
Tine 17: Gb6 / F#6 (1480.0 Hz)
Tine 18: G6 (1568.0 Hz)
Tine 19: Ab6 / G#6 (1661.2 Hz)
Tine 20: A6 (1760.0 Hz)
Tine 21: Bb6 / A#6 (1864.7 Hz) - High treble flat chime`,
    },
    'chromatic-30': {
      name: 'Deluxe Chromatic Comb (30 tines)',
      tinesCount: 30,
      tuningText: `The 30 steel tines cover the full 12-tone chromatic semitone spectrum from C5 (tine 0) to F7 (tine 29):
Tine 0: C5 (523.3 Hz), Tine 1: Db5/C#5 (554.4 Hz), Tine 2: D5 (587.3 Hz), Tine 3: Eb5/D#5 (622.3 Hz), Tine 4: E5 (659.3 Hz), Tine 5: F5 (698.5 Hz),
Tine 6: Gb5/F#5 (740.0 Hz), Tine 7: G5 (784.0 Hz), Tine 8: Ab5/G#5 (830.6 Hz), Tine 9: A5 (880.0 Hz), Tine 10: Bb5/A#5 (932.3 Hz), Tine 11: B5 (987.8 Hz),
Tine 12: C6 (1046.5 Hz), Tine 13: Db6/C#6 (1108.7 Hz), Tine 14: D6 (1174.7 Hz), Tine 15: Eb6/D#6 (1244.5 Hz), Tine 16: E6 (1318.5 Hz), Tine 17: F6 (1396.9 Hz),
Tine 18: Gb6/F#6 (1480.0 Hz), Tine 19: G6 (1568.0 Hz), Tine 20: Ab6/G#6 (1661.2 Hz), Tine 21: A6 (1760.0 Hz), Tine 22: Bb6/A#6 (1864.7 Hz), Tine 23: B6 (1975.5 Hz),
Tine 24: C7 (2093.0 Hz), Tine 25: Db7/C#7 (2217.5 Hz), Tine 26: D7 (2349.3 Hz), Tine 27: Eb7/D#7 (2489.0 Hz), Tine 28: E7 (2637.0 Hz), Tine 29: F7 (2793.8 Hz)`,
    },
    'sankyo-18': {
      name: 'Vintage Sankyo 18N Comb (18 tines)',
      tinesCount: 18,
      tuningText: `The 18 steel tines are tuned to the standard Sankyo diatonic pitch scale from lowest (tine 0) to highest (tine 17):
Tine 0: C5 (523 Hz), Tine 1: D5 (587 Hz), Tine 2: E5 (659 Hz), Tine 3: F5 (698 Hz), Tine 4: F#5/Gb5 (740 Hz),
Tine 5: G5 (784 Hz), Tine 6: A5 (880 Hz), Tine 7: B5 (988 Hz), Tine 8: C6 (1046 Hz), Tine 9: D6 (1175 Hz),
Tine 10: E6 (1318 Hz), Tine 11: F6 (1397 Hz), Tine 12: F#6/Gb6 (1480 Hz), Tine 13: G6 (1568 Hz), Tine 14: A6 (1760 Hz),
Tine 15: B6 (1976 Hz), Tine 16: C7 (2093 Hz), Tine 17: D7 (2349 Hz)`,
    },
    'flat-major-18': {
      name: 'Flat Major & Lullaby Comb (18 tines)',
      tinesCount: 18,
      tuningText: `The 18 steel tines are tuned to Eb / Bb / Ab Flat Major tuning from lowest (tine 0) to highest (tine 17):
Tine 0: Bb4 (466 Hz), Tine 1: C5 (523 Hz), Tine 2: Db5 (554 Hz), Tine 3: Eb5 (622 Hz), Tine 4: F5 (698 Hz), Tine 5: G5 (784 Hz),
Tine 6: Ab5 (831 Hz), Tine 7: Bb5 (932 Hz), Tine 8: C6 (1046 Hz), Tine 9: Db6 (1109 Hz), Tine 10: Eb6 (1245 Hz), Tine 11: F6 (1397 Hz),
Tine 12: G6 (1568 Hz), Tine 13: Ab6 (1661 Hz), Tine 14: Bb6 (1865 Hz), Tine 15: C7 (2093 Hz), Tine 16: Db7 (2217 Hz), Tine 17: Eb7 (2489 Hz)`,
    },
  };

  const selectedComb = COMB_TUNINGS[combScaleId] || COMB_TUNINGS['romantic-flat'];
  const tineMax = selectedComb.tinesCount - 1;
  const tuningDescription = selectedComb.tuningText;

  const systemInstruction = `You are a master horologist and mechanical music box composer who specializes in arranging exquisite, authentic melodies for traditional mechanical music boxes with steel comb tines and a rotating brass pin cylinder drum.

${tuningDescription}

PHYSICS & HARMONY RULES OF THE MECHANICAL MUSIC BOX:
1. Steps range from 0 to ${totalSteps - 1} (one complete rotation of the cylinder drum).
2. Polyphony: A music box can strike 1 to 3 tines simultaneously at a given step (e.g. bass root on lower tines together with a melody note on upper tines), but never more than 3 at the exact same step.
3. Rapid repetition limit: Plucking the same tine twice in a row requires at least 2 steps delay.
4. Melody & Bass layering: Create an enchanting, relaxing music box texture. Place gentle bass roots on strong downbeats and a flowing, sparkling melody taking advantage of flat accidentals where appropriate.
5. Ensure the piece loops smoothly when the cylinder repeats from step ${totalSteps - 1} back to step 0.`;

  const userMessage = `Compose an original mechanical music box arrangement for the cylinder based on this idea:
"${prompt}"

Musical style: ${style}
Total steps for cylinder rotation: ${totalSteps}
Comb scale: ${selectedComb.name}
${tempoPreference ? `Preferred tempo: ~${tempoPreference} BPM` : ''}

Generate a creative title, a short lyrical/poetic note about the tune, a suitable BPM tempo (between 68 and 130), the mood, and the exact pin coordinates { step: number (0 to ${totalSteps - 1}), tineIndex: number (0 to ${tineMax}) }. Provide between 24 and 56 pins for a rich, sparkling melody.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'The title of the composed music box piece',
      },
      composerNote: {
        type: Type.STRING,
        description: 'A poetic note about how this melody evokes the prompt',
      },
      mood: {
        type: Type.STRING,
        description: 'Mood tag (e.g., Nostalgic, Whimsical, Peaceful Lullaby, Rainy Evening, Joyful Waltz)',
      },
      tempoBpm: {
        type: Type.INTEGER,
        description: 'Suggested tempo in BPM (between 68 and 130)',
      },
      totalSteps: {
        type: Type.INTEGER,
        description: `Total steps in loop, should be ${totalSteps}`,
      },
      pins: {
        type: Type.ARRAY,
        description: 'List of pins on the rotating cylinder drum',
        items: {
          type: Type.OBJECT,
          properties: {
            step: {
              type: Type.INTEGER,
              description: `Step index (0 to ${totalSteps - 1})`,
            },
            tineIndex: {
              type: Type.INTEGER,
              description: `Tine index (0 to ${tineMax})`,
            },
          },
          required: ['step', 'tineIndex'],
        },
      },
    },
    required: ['title', 'tempoBpm', 'totalSteps', 'pins', 'mood'],
  };

  // Try models in cascade: gemini-3.1-flash-lite (fastest & most available) or gemini-3.7-flash
  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.7-flash'];

  if (ai) {
    for (const model of modelsToTry) {
      try {
        console.log(`[AI Composer] Generating music with ${model}...`);
        const response = await ai.models.generateContent({
          model,
          contents: userMessage,
          config: {
            systemInstruction,
            temperature: 0.8,
            responseMimeType: 'application/json',
            responseSchema,
          },
        });

        const rawText = (response.text || '').trim();
        // Remove markdown backticks if any
        const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        if (cleanedText) {
          const parsedData = JSON.parse(cleanedText);

          // Validate and sanitize pins
          const sanitizedPins = (parsedData.pins || [])
            .filter((p: { step: number; tineIndex: number }) => (
              typeof p.step === 'number' &&
              typeof p.tineIndex === 'number' &&
              p.step >= 0 &&
              p.step < totalSteps &&
              p.tineIndex >= 0 &&
              p.tineIndex <= tineMax
            ))
            .map((p: { step: number; tineIndex: number }, idx: number) => ({
              id: `ai-pin-${idx}-${p.step}-${p.tineIndex}`,
              step: Math.floor(p.step),
              tineIndex: Math.floor(p.tineIndex),
            }));

          const parsedTempo = Number(parsedData.tempoBpm);
          const validTempo = Number.isFinite(parsedTempo) ? Math.max(60, Math.min(140, parsedTempo)) : 86;

          return res.json({
            title: parsedData.title || 'Whispering Music Box',
            composerNote: parsedData.composerNote || 'A custom melody composed for your mechanical music box.',
            mood: parsedData.mood || 'Serene',
            tempoBpm: validTempo,
            totalSteps: totalSteps,
            combScaleId: combScaleId || 'romantic-flat',
            pins: sanitizedPins,
            modelUsed: model,
          });
        }
      } catch (err: unknown) {
        console.warn(`[AI Composer] Model ${model} attempt error:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Graceful procedural fallback if API surges occur
  console.log('[AI Composer] Using acoustic procedural music generator fallback.');
  const fallbackSong = generateProceduralMusic(prompt, style, totalSteps);
  return res.json({ ...fallbackSong, combScaleId: 'sankyo-18' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Music Box Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
