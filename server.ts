import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  CombScaleId,
  ROMANTIC_FLAT_22_TINES,
  CHROMATIC_30_TINES,
  FLAT_MAJOR_18_TINES,
  SANKYO_18_TINES,
} from './src/types';
import { generateProceduralMusic } from './src/utils/proceduralComposer';

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

// In-memory sliding window rate limiter: max 20 compose requests per minute per IP
const composeRateLimiter = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Lazy eviction of expired rate limit entries to prevent memory growth
  if (composeRateLimiter.size > 200) {
    for (const [key, val] of composeRateLimiter.entries()) {
      if (now > val.resetTime) {
        composeRateLimiter.delete(key);
      }
    }
  }

  const entry = composeRateLimiter.get(ip);
  if (!entry || now > entry.resetTime) {
    composeRateLimiter.set(ip, { count: 1, resetTime: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) {
    return false;
  }
  entry.count++;
  return true;
}

// Comb note pitch lookup tables derived from canonical types
const COMB_NOTE_MAPS: Record<CombScaleId, string[]> = {
  'romantic-flat': ROMANTIC_FLAT_22_TINES.map((t) => t.note),
  'chromatic-30': CHROMATIC_30_TINES.map((t) => t.note),
  'flat-major-18': FLAT_MAJOR_18_TINES.map((t) => t.note),
  'sankyo-18': SANKYO_18_TINES.map((t) => t.note),
};

const COMB_TUNINGS: Record<CombScaleId, { name: string; tinesCount: number; tuningText: string; specificHarmonyRules: string }> = {
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
Tine 14: Eb6 / D#6 (1244.5 Hz) - High flat bell (Für Elise signature accidental)
Tine 15: E6 (1318.5 Hz)
Tine 16: F6 (1396.9 Hz)
Tine 17: Gb6 / F#6 (1480.0 Hz)
Tine 18: G6 (1568.0 Hz)
Tine 19: Ab6 / G#6 (1661.2 Hz)
Tine 20: A6 (1760.0 Hz)
Tine 21: Bb6 / A#6 (1864.7 Hz) - High treble flat chime`,
    specificHarmonyRules: 'Take full expressive advantage of the flat accidental tines (Eb5, Eb6, Ab5, Ab6, Bb5, Bb6, Db6) for romantic and impressionistic harmony.',
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
    specificHarmonyRules: 'Utilize the full 2.5 octave chromatic range across C5 to F7 for rich accidentals, modulate smoothly, and voice chord progressions with upper chime harmonics.',
  },
  'sankyo-18': {
    name: 'Vintage Sankyo 18N Comb (18 tines)',
    tinesCount: 18,
    tuningText: `The 18 steel tines are tuned to the standard Sankyo diatonic pitch scale from lowest (tine 0) to highest (tine 17):
Tine 0: C5 (523 Hz), Tine 1: D5 (587 Hz), Tine 2: E5 (659 Hz), Tine 3: F5 (698 Hz), Tine 4: F#5/Gb5 (740 Hz),
Tine 5: G5 (784 Hz), Tine 6: A5 (880 Hz), Tine 7: B5 (988 Hz), Tine 8: C6 (1046 Hz), Tine 9: D6 (1175 Hz),
Tine 10: E6 (1318 Hz), Tine 11: F6 (1397 Hz), Tine 12: F#6/Gb6 (1480 Hz), Tine 13: G6 (1568 Hz), Tine 14: A6 (1760 Hz),
Tine 15: B6 (1976 Hz), Tine 16: C7 (2093 Hz), Tine 17: D7 (2349 Hz)`,
    specificHarmonyRules: 'This comb is tuned in diatonic C-Major / G-Major with F# overtone tines (tines 4 & 12). Arrange in clean diatonic keys (C, G, or A-minor) and use F# for secondary dominants.',
  },
  'flat-major-18': {
    name: 'Flat Major & Lullaby Comb (18 tines)',
    tinesCount: 18,
    tuningText: `The 18 steel tines are tuned to Eb / Bb / Ab Flat Major tuning from lowest (tine 0) to highest (tine 17):
Tine 0: Bb4 (466 Hz), Tine 1: C5 (523 Hz), Tine 2: Db5 (554 Hz), Tine 3: Eb5 (622 Hz), Tine 4: F5 (698 Hz), Tine 5: G5 (784 Hz),
Tine 6: Ab5 (831 Hz), Tine 7: Bb5 (932 Hz), Tine 8: C6 (1046 Hz), Tine 9: Db6 (1109 Hz), Tine 10: Eb6 (1245 Hz), Tine 11: F6 (1397 Hz),
Tine 12: G6 (1568 Hz), Tine 13: Ab6 (1661 Hz), Tine 14: Bb6 (1865 Hz), Tine 15: C7 (2093 Hz), Tine 16: Db7 (2217 Hz), Tine 17: Eb7 (2489 Hz)`,
    specificHarmonyRules: 'This comb is tuned for pure Eb Major, Bb Major, and Ab Major melodies. Arrange with the warm Bb4/Eb5 low roots and soaring Eb7 high treble bell tones.',
  },
};

// Gemini AI Music Box Composer Endpoint
app.post('/api/gemini/compose', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown-client';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'Too many composition requests. Please wait a moment before composing again.',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(403).json({
      error: 'AI Composer is disabled because GEMINI_API_KEY is not configured in the environment.',
    });
  }

  const rawSteps = Number(req.body.totalSteps);
  const totalSteps = Number.isFinite(rawSteps) ? Math.min(Math.max(rawSteps, 16), 256) : 64;
  
  // Prompt Sanitization & Length Limits
  const rawPrompt = typeof req.body.prompt === 'string' ? req.body.prompt : '';
  const sanitizedPrompt = rawPrompt.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, 500);

  if (!sanitizedPrompt) {
    return res.status(400).json({ error: 'A valid melody prompt is required (up to 500 characters).' });
  }

  const rawStyle = typeof req.body.style === 'string' ? req.body.style : 'melodic';
  const style = rawStyle.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, 60) || 'melodic';
  const tempoPreference = Number.isFinite(Number(req.body.tempoPreference)) ? Number(req.body.tempoPreference) : undefined;
  const rawCombScaleId = typeof req.body.combScaleId === 'string' ? req.body.combScaleId : 'romantic-flat';
  const combScaleId: CombScaleId = rawCombScaleId in COMB_TUNINGS ? (rawCombScaleId as CombScaleId) : 'romantic-flat';

  const ai = getGeminiClient();

  const selectedComb = COMB_TUNINGS[combScaleId];
  const tineMax = selectedComb.tinesCount - 1;
  const tuningDescription = selectedComb.tuningText;
  const tineNotes = COMB_NOTE_MAPS[combScaleId] || COMB_NOTE_MAPS['romantic-flat'];

  const systemInstruction = `You are a master horologist and mechanical music box composer who specializes in arranging exquisite, authentic melodies for traditional mechanical music boxes with steel comb tines and a rotating brass pin cylinder drum.

${tuningDescription}

PHYSICS & HARMONY RULES OF THE MECHANICAL MUSIC BOX:
1. Steps range from 0 to ${totalSteps - 1} (one complete rotation of the cylinder drum).
2. Polyphony: A music box can strike 1 to 3 tines simultaneously at a given step (e.g. bass root on lower tines together with a melody note on upper tines), but NEVER strike more than 3 tines at the exact same step.
3. Rapid repetition limit: Plucking the exact same tine twice in a row requires at least 2 steps delay (e.g. if struck at step 4, it cannot be struck at step 5).
4. Melody & Bass layering: Create an enchanting, relaxing music box texture. Place gentle bass roots on strong downbeats and a flowing, sparkling melody taking advantage of the specific tuning of this comb. ${selectedComb.specificHarmonyRules}
5. Ensure the piece loops smoothly and harmonically resolves when the cylinder repeats from step ${totalSteps - 1} back to step 0.`;

  const userMessage = `Compose an original mechanical music box arrangement for the cylinder based on this idea:
"${sanitizedPrompt}"

Musical style: ${style}
Total steps for cylinder rotation: ${totalSteps}
Comb scale: ${selectedComb.name} (${selectedComb.tinesCount} tines, index 0 to ${tineMax})
${tempoPreference ? `Preferred tempo: ~${tempoPreference} BPM` : ''}

Generate a creative title, a short lyrical/poetic note about how the melody evokes the idea, a suitable BPM tempo (between 68 and 130), the mood, and the exact pin coordinates { step: number (0 to ${totalSteps - 1}), tineIndex: number (0 to ${tineMax}), note: string (e.g. "C5", "Eb6") }. Provide between 24 and 56 pins for a rich, sparkling melody.`;

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
            note: {
              type: Type.STRING,
              description: 'Scientific pitch notation for the tine, e.g. "C5", "Eb5", "Db6"',
            },
          },
          required: ['step', 'tineIndex'],
        },
      },
    },
    required: ['title', 'composerNote', 'tempoBpm', 'totalSteps', 'pins', 'mood'],
  };

  const requestedModel = typeof req.body.model === 'string' ? req.body.model : 'auto';

  // If procedural engine requested directly, generate algorithmically and return immediately
  if (requestedModel === 'procedural') {
    const data = generateProceduralMusic(sanitizedPrompt, style, totalSteps, combScaleId);
    return res.json({
      title: data.title,
      composerNote: data.composerNote,
      mood: data.mood,
      tempoBpm: data.tempoBpm,
      totalSteps: data.totalSteps,
      combScaleId: data.combScaleId,
      pins: data.pins,
      modelUsed: 'procedural-musicbox-engine',
    });
  }

  // Determine models to try based on user selection
  const modelsToTry =
    requestedModel === 'gemini-3.7-flash'
      ? ['gemini-3.7-flash']
      : requestedModel === 'gemini-3.1-flash-lite'
      ? ['gemini-3.1-flash-lite']
      : ['gemini-3.7-flash', 'gemini-3.1-flash-lite'];

  if (ai) {
    for (const model of modelsToTry) {
      try {
        console.log(`[AI Composer] Generating music with ${model}...`);

        // Wrap generateContent in a 25s timeout to prevent hanging connections
        const generatePromise = ai.models.generateContent({
          model,
          contents: userMessage,
          config: {
            systemInstruction,
            temperature: 0.8,
            responseMimeType: 'application/json',
            responseSchema,
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after 25s waiting for ${model}`)), 25000)
        );

        const response = await Promise.race([generatePromise, timeoutPromise]);

        const rawText = (response.text || '').trim();
        const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        if (cleanedText) {
          const parsedData = JSON.parse(cleanedText);

          // 1. Sanitize raw pins from Gemini
          const rawPins: { step: number; tineIndex: number; note?: string }[] = (parsedData.pins || [])
            .filter((p: any) => (
              typeof p.step === 'number' &&
              typeof p.tineIndex === 'number' &&
              Number.isFinite(p.step) &&
              Number.isFinite(p.tineIndex) &&
              p.step >= 0 &&
              p.step < totalSteps &&
              p.tineIndex >= 0 &&
              p.tineIndex <= tineMax
            ))
            .map((p: any) => {
              const step = Math.floor(p.step);
              const tineIndex = Math.floor(p.tineIndex);
              const note = typeof p.note === 'string' && p.note.trim().length > 0
                ? p.note.trim()
                : (tineNotes[tineIndex] || 'C5');
              return { step, tineIndex, note };
            });

          // 2. Sort by step ascending, then tineIndex ascending
          rawPins.sort((a, b) => (a.step !== b.step ? a.step - b.step : a.tineIndex - b.tineIndex));

          // 3. Deduplicate exact same (step, tineIndex)
          const deduped: typeof rawPins = [];
          const seenAtStepTine = new Set<string>();
          for (const p of rawPins) {
            const key = `${p.step}:${p.tineIndex}`;
            if (!seenAtStepTine.has(key)) {
              seenAtStepTine.add(key);
              deduped.push(p);
            }
          }

          // 4. Enforce Polyphony Limit (Max 3 pins at the exact same step)
          const stepGroups = new Map<number, typeof rawPins>();
          for (const p of deduped) {
            const group = stepGroups.get(p.step) || [];
            group.push(p);
            stepGroups.set(p.step, group);
          }

          const polyphonyLimitedPins: typeof rawPins = [];
          for (const [, group] of stepGroups.entries()) {
            if (group.length <= 3) {
              polyphonyLimitedPins.push(...group);
            } else {
              // Retain lowest bass note + highest 2 melody notes
              group.sort((a, b) => a.tineIndex - b.tineIndex);
              const bass = group[0];
              const topMelody = group.slice(-2);
              polyphonyLimitedPins.push(bass, ...topMelody);
            }
          }

          polyphonyLimitedPins.sort((a, b) => (a.step !== b.step ? a.step - b.step : a.tineIndex - b.tineIndex));

          // 5. Enforce Tine Restrike Cooldown (>= 2 steps delay for identical tineIndex)
          const cooldownPins: typeof rawPins = [];
          const lastTineStep = new Map<number, number>();
          for (const p of polyphonyLimitedPins) {
            const lastStep = lastTineStep.get(p.tineIndex);
            if (lastStep !== undefined && p.step - lastStep < 2) {
              // Skip rapid physical restrike
              continue;
            }
            cooldownPins.push(p);
            lastTineStep.set(p.tineIndex, p.step);
          }

          // 6. Assign final unique IDs & validated pitch notes
          const sanitizedPins = cooldownPins.map((p, idx) => ({
            id: `ai-pin-${idx}-${p.step}-${p.tineIndex}`,
            step: p.step,
            tineIndex: p.tineIndex,
            note: p.note || tineNotes[p.tineIndex] || 'C5',
          }));

          const parsedTempo = Number(parsedData.tempoBpm);
          const validTempo = Number.isFinite(parsedTempo) ? Math.max(60, Math.min(140, parsedTempo)) : 86;

          return res.json({
            title: parsedData.title || 'Whispering Music Box',
            composerNote: parsedData.composerNote || 'A custom melody composed for your mechanical music box.',
            mood: parsedData.mood || 'Serene',
            tempoBpm: validTempo,
            totalSteps: totalSteps,
            combScaleId: combScaleId,
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
  const fallbackSong = generateProceduralMusic(sanitizedPrompt, style, totalSteps, combScaleId);
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
