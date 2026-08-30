import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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

// Helper: Procedural algorithmic music box generator (used as graceful fallback if API is unavailable)
function generateProceduralMusic(prompt: string, style: string, totalSteps: number) {
  const isWaltz = style === 'waltz' || /waltz|3\/4/i.test(prompt);
  const isCeltic = style === 'celtic' || /celtic|irish|folk/i.test(prompt);
  const isLullaby = style === 'lullaby' || /lullaby|sleep|baby|star/i.test(prompt);
  const isNostalgic = style === 'nostalgic' || /ghibli|nostalg/i.test(prompt);

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

  let title = 'Whispering Music Box';
  if (isLullaby) title = 'Starlit Lullaby';
  else if (isNostalgic) title = 'Nostalgic Clockwork Meadow';
  else if (isCeltic) title = 'Enchanted Glen Air';
  else if (isWaltz) title = 'Montmartre Carousel Waltz';

  return {
    title,
    composerNote: `Composed for 18-note cylinder movement inspired by: "${prompt}".`,
    mood: isLullaby ? 'Peaceful Lullaby' : isWaltz ? 'Vintage Waltz' : isCeltic ? 'Mystical Folk' : 'Nostalgic',
    tempoBpm: isLullaby ? 74 : isWaltz ? 96 : 88,
    totalSteps,
    pins,
    modelUsed: 'procedural-musicbox-engine',
  };
}

// Gemini AI Music Box Composer Endpoint
app.post('/api/gemini/compose', async (req, res) => {
  const { prompt, style = 'melodic', totalSteps = 64, tempoPreference } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const ai = getGeminiClient();

  const systemInstruction = `You are a master horologist and mechanical music box composer who specializes in arranging exquisite, authentic melodies for traditional 18-note mechanical music boxes (like the vintage gold Sankyo movement).

The 18 steel tines are tuned to the following diatonic pitch scale from lowest (tine 0) to highest (tine 17):
Tine 0: C5 (523 Hz) - Bass root
Tine 1: D5 (587 Hz)
Tine 2: E5 (659 Hz)
Tine 3: F5 (698 Hz)
Tine 4: F#5 (740 Hz)
Tine 5: G5 (784 Hz)
Tine 6: A5 (880 Hz)
Tine 7: B5 (988 Hz)
Tine 8: C6 (1046 Hz) - Mid melody root
Tine 9: D6 (1175 Hz)
Tine 10: E6 (1318 Hz)
Tine 11: F6 (1397 Hz)
Tine 12: F#6 (1480 Hz)
Tine 13: G6 (1568 Hz)
Tine 14: A6 (1760 Hz)
Tine 15: B6 (1976 Hz)
Tine 16: C7 (2093 Hz) - High crystal chime
Tine 17: D7 (2349 Hz) - High bell top

PHYSICS & HARMONY RULES OF AN 18-NOTE MECHANICAL MUSIC BOX:
1. Steps range from 0 to ${totalSteps - 1} (one complete rotation of the cylinder drum).
2. Polyphony: A music box can strike 1 to 3 tines simultaneously at a given step (e.g. bass root on tine 0 or 5 together with a melody note on tine 8-14), but never more than 3 at the exact same step.
3. Rapid repetition limit: Plucking the same tine twice in a row requires at least 2 steps delay.
4. Melody & Bass layering: Create an enchanting, relaxing music box texture. Place gentle bass roots on strong downbeats and a flowing, sparkling treble melody.
5. Ensure the piece loops smoothly when the cylinder repeats from step ${totalSteps - 1} back to step 0.`;

  const userMessage = `Compose an original 18-note mechanical music box arrangement for the cylinder based on this idea:
"${prompt}"

Musical style: ${style}
Total steps for cylinder rotation: ${totalSteps}
${tempoPreference ? `Preferred tempo: ~${tempoPreference} BPM` : ''}

Generate a creative title, a short lyrical/poetic note about the tune, a suitable BPM tempo (between 68 and 130), the mood, and the exact pin coordinates { step: number (0 to ${totalSteps - 1}), tineIndex: number (0 to 17) }. Provide between 24 and 56 pins for a rich, sparkling melody.`;

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
              description: 'Tine index (0 to 17)',
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
              p.tineIndex <= 17
            ))
            .map((p: { step: number; tineIndex: number }, idx: number) => ({
              id: `ai-pin-${idx}-${p.step}-${p.tineIndex}`,
              step: Math.floor(p.step),
              tineIndex: Math.floor(p.tineIndex),
            }));

          return res.json({
            title: parsedData.title || 'Whispering Music Box',
            composerNote: parsedData.composerNote || 'A custom melody composed for your mechanical music box.',
            mood: parsedData.mood || 'Serene',
            tempoBpm: Math.max(60, Math.min(140, parsedData.tempoBpm || 86)),
            totalSteps: totalSteps,
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
  return res.json(fallbackSong);
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
