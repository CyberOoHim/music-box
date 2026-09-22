import QRCode from 'qrcode';
import { MusicBoxSong, MusicBoxPin, CombScaleId, getCombTines } from '../types';
import { DEFAULT_SONGS } from '../data/defaultSongs';

/**
 * Maximum character length allowed for URL share payloads to prevent denial of service.
 */
export const MAX_URL_PAYLOAD_CHARS = 300_000; // 300 KB

/**
 * Maximum decompressed size allowed to prevent memory exhaustion (Zip-bomb defense).
 */
export const MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024; // 5 MB

export const COMB_SCALE_IDS: CombScaleId[] = [
  'romantic-flat',
  'chromatic-30',
  'flat-major-18',
  'sankyo-18',
];

/**
 * Tier 2 Differential Preset Schema (_d: 1).
 * Serializes only modified metadata and measure-level pin diffs against a factory preset.
 */
export interface PresetDeltaSchema {
  _d: 1;
  bId: string; // Base Preset ID (e.g. 'fur-elise')
  t?: string; // Overridden title
  b?: number; // Overridden tempoBpm
  s?: number; // Overridden totalSteps
  c?: number | CombScaleId; // Overridden comb scale (index or id)
  d?: string; // Overridden description
  m?: Record<number, [number, number, number?][]>; // Measure index -> array of pins [stepInMeasure (0..15), tineIndex, flags?]
}

/**
 * Tier 3 Compact Positional Tuple Schema (_c: 2).
 * Positional tuples: [step, tineIndex, flags?]
 * Note names are derived deterministically from combScaleId + tineIndex and omitted entirely.
 */
export interface CompactSongSchema {
  _c: 2;
  t: string; // title
  b?: number; // tempoBpm (omitted if default 88)
  s?: number; // totalSteps (omitted if default 64)
  c?: number | string; // combScale index 0..3 or id string
  g?: string; // category (omitted if 'custom')
  d?: string; // description (omitted if empty)
  a?: 1; // 1 if AI-generated
  u?: string; // model used
  p: [number, number, number?][]; // [step, tineIndex, flags?]
}

export type CompressionTier = 'preset' | 'delta' | 'compact';

export interface ScoreShareResult {
  url: string;
  hash: string;
  tier: CompressionTier;
  originalJsonBytes: number;
  compactJsonBytes: number;
  compressedBinaryBytes: number;
  urlChars: number;
  compressionRatio: number; // e.g. 0.88 for 88% reduction vs raw JSON
}

// ----------------------------------------------------------------------------
// 1. Structural Comparison & Base Preset Identification
// ----------------------------------------------------------------------------

/**
 * Sorts pins deterministically by step, then by tineIndex.
 */
export function sortPins(pins: MusicBoxPin[]): MusicBoxPin[] {
  return [...pins].sort((a, b) => {
    if (a.step !== b.step) return a.step - b.step;
    return a.tineIndex - b.tineIndex;
  });
}

/**
 * Checks whether the given song is an unmodified factory preset.
 */
export function isUnmodifiedPreset(song: MusicBoxSong, basePreset?: MusicBoxSong): boolean {
  const preset = basePreset || DEFAULT_SONGS.find((p) => p.id === song.id);
  if (!preset) return false;

  if (song.tempoBpm !== preset.tempoBpm) return false;
  if ((song.totalSteps || 64) !== (preset.totalSteps || 64)) return false;
  if ((song.combScaleId || 'romantic-flat') !== (preset.combScaleId || 'romantic-flat')) return false;
  if (song.pins.length !== preset.pins.length) return false;

  const sortedA = sortPins(song.pins);
  const sortedB = sortPins(preset.pins);

  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i].step !== sortedB[i].step || sortedA[i].tineIndex !== sortedB[i].tineIndex) {
      return false;
    }
  }

  return true;
}

/**
 * Detects the closest matching base preset for a given song (by exact ID or pin overlap).
 */
export function findBasePresetForSong(song: MusicBoxSong): MusicBoxSong | null {
  // 1. Direct ID match
  const directMatch = DEFAULT_SONGS.find((p) => p.id === song.id);
  if (directMatch) return directMatch;

  // 2. ID prefix match (e.g. fur-elise-copy or fur-elise-v2)
  const prefixMatch = DEFAULT_SONGS.find((p) => song.id.startsWith(p.id));
  if (prefixMatch) return prefixMatch;

  // 3. Pin overlap heuristic
  if (song.pins.length < 8) return null;

  const songPinSet = new Set(song.pins.map((p) => `${p.step}:${p.tineIndex}`));
  let bestPreset: MusicBoxSong | null = null;
  let highestOverlap = 0;

  for (const preset of DEFAULT_SONGS) {
    let overlapCount = 0;
    for (const p of preset.pins) {
      if (songPinSet.has(`${p.step}:${p.tineIndex}`)) {
        overlapCount++;
      }
    }

    const overlapRatio = overlapCount / Math.max(song.pins.length, preset.pins.length);
    if (overlapRatio >= 0.45 && overlapCount >= 12 && overlapRatio > highestOverlap) {
      highestOverlap = overlapRatio;
      bestPreset = preset;
    }
  }

  return bestPreset;
}

// ----------------------------------------------------------------------------
// 2. Tier 2: Differential Preset Delta Serialization (_d: 1)
// ----------------------------------------------------------------------------

/**
 * Creates a differential delta against a base preset.
 * Groups pins by 16-step measures and only serializes measures that differ.
 */
export function createPresetDelta(song: MusicBoxSong, basePreset: MusicBoxSong): PresetDeltaSchema {
  const delta: PresetDeltaSchema = {
    _d: 1,
    bId: basePreset.id,
  };

  // Check metadata overrides
  if (song.title && song.title !== basePreset.title) {
    delta.t = song.title;
  }
  if (song.tempoBpm !== basePreset.tempoBpm) {
    delta.b = song.tempoBpm;
  }
  if ((song.totalSteps || 64) !== (basePreset.totalSteps || 64)) {
    delta.s = song.totalSteps;
  }
  if ((song.combScaleId || 'romantic-flat') !== (basePreset.combScaleId || 'romantic-flat')) {
    const idx = COMB_SCALE_IDS.indexOf(song.combScaleId || 'romantic-flat');
    delta.c = idx >= 0 ? idx : song.combScaleId;
  }
  if (song.description && song.description !== basePreset.description) {
    delta.d = song.description;
  }

  // Measure-based pin diffing (16 steps per measure)
  const stepsPerMeasure = 16;
  const maxSteps = Math.max(song.totalSteps || 64, basePreset.totalSteps || 64);
  const totalMeasures = Math.ceil(maxSteps / stepsPerMeasure);

  // Group pins by measure
  const songMeasures: Map<number, MusicBoxPin[]> = new Map();
  for (const pin of song.pins) {
    const m = Math.floor(pin.step / stepsPerMeasure);
    if (!songMeasures.has(m)) songMeasures.set(m, []);
    songMeasures.get(m)!.push(pin);
  }

  const baseMeasures: Map<number, MusicBoxPin[]> = new Map();
  for (const pin of basePreset.pins) {
    const m = Math.floor(pin.step / stepsPerMeasure);
    if (!baseMeasures.has(m)) baseMeasures.set(m, []);
    baseMeasures.get(m)!.push(pin);
  }

  const measureDiff: Record<number, [number, number, number?][]> = {};
  let hasDiff = false;

  for (let m = 0; m < totalMeasures; m++) {
    const sPins = sortPins(songMeasures.get(m) || []);
    const bPins = sortPins(baseMeasures.get(m) || []);

    let isSame = sPins.length === bPins.length;
    if (isSame) {
      for (let i = 0; i < sPins.length; i++) {
        if (sPins[i].step !== bPins[i].step || sPins[i].tineIndex !== bPins[i].tineIndex) {
          isSame = false;
          break;
        }
      }
    }

    if (!isSame) {
      hasDiff = true;
      // Store compact pins for this measure [stepInMeasure (0..15), tineIndex]
      measureDiff[m] = sPins.map((p) => [p.step % stepsPerMeasure, p.tineIndex]);
    }
  }

  if (hasDiff) {
    delta.m = measureDiff;
  }

  return delta;
}

/**
 * Decodes a differential delta and merges it onto the base preset.
 */
export function decodePresetDelta(delta: PresetDeltaSchema): MusicBoxSong {
  const basePreset = DEFAULT_SONGS.find((p) => p.id === delta.bId) || DEFAULT_SONGS[0];

  const combScaleId: CombScaleId =
    typeof delta.c === 'number'
      ? COMB_SCALE_IDS[delta.c] || 'romantic-flat'
      : (delta.c as CombScaleId) || basePreset.combScaleId || 'romantic-flat';

  const totalSteps = delta.s ?? basePreset.totalSteps ?? 64;
  const tempoBpm = delta.b ?? basePreset.tempoBpm ?? 88;
  const title = delta.t ?? `${basePreset.title} (Fork)`;
  const description = delta.d ?? basePreset.description;

  const combTines = getCombTines(combScaleId);
  const stepsPerMeasure = 16;

  // Build reconstructed pins
  const newPins: MusicBoxPin[] = [];
  const modifiedMeasures = delta.m ? new Set(Object.keys(delta.m).map(Number)) : new Set<number>();

  // 1. Keep base pins from unmodified measures (within totalSteps bound)
  for (const pin of basePreset.pins) {
    const m = Math.floor(pin.step / stepsPerMeasure);
    if (!modifiedMeasures.has(m) && pin.step < totalSteps) {
      newPins.push({
        step: pin.step,
        tineIndex: pin.tineIndex,
        note: combTines[pin.tineIndex]?.note || pin.note,
      });
    }
  }

  // 2. Add modified measure pins
  if (delta.m) {
    for (const [mStr, measurePins] of Object.entries(delta.m)) {
      const m = Number(mStr);
      for (const [stepInMeasure, tineIndex] of measurePins) {
        const step = m * stepsPerMeasure + stepInMeasure;
        if (step < totalSteps && tineIndex >= 0 && tineIndex < combTines.length) {
          newPins.push({
            step,
            tineIndex,
            note: combTines[tineIndex]?.note,
          });
        }
      }
    }
  }

  return sanitizeSong({
    id: `forked-${delta.bId}-${Date.now().toString(36)}`,
    title,
    category: 'custom',
    description,
    tempoBpm,
    totalSteps,
    combScaleId,
    pins: sortPins(newPins),
    createdAt: Date.now(),
  });
}

// ----------------------------------------------------------------------------
// 3. Tier 3: Compact V2 Schema Encoding (_c: 2)
// ----------------------------------------------------------------------------

/**
 * Converts a standard song into a compact positional tuple representation.
 */
export function encodeCompactSong(song: MusicBoxSong): CompactSongSchema {
  const sortedPins = sortPins(song.pins);
  const compactPins: [number, number, number?][] = sortedPins.map((p) => [p.step, p.tineIndex]);

  const scaleId = song.combScaleId || 'romantic-flat';
  const scaleIdx = COMB_SCALE_IDS.indexOf(scaleId);

  const compact: CompactSongSchema = {
    _c: 2,
    t: song.title || 'Untitled Melody',
    p: compactPins,
  };

  if (song.tempoBpm && song.tempoBpm !== 88) {
    compact.b = song.tempoBpm;
  }

  if (song.totalSteps && song.totalSteps !== 64) {
    compact.s = song.totalSteps;
  }

  if (scaleIdx >= 0) {
    if (scaleIdx !== 0) compact.c = scaleIdx; // 0 ('romantic-flat') is default
  } else {
    compact.c = scaleId;
  }

  if (song.category && song.category !== 'custom') {
    compact.g = song.category;
  }

  if (song.description && song.description.trim()) {
    compact.d = song.description.trim();
  }

  if (song.isAiGenerated || song.category === 'ai') {
    compact.a = 1;
  }

  if (song.modelUsed) {
    compact.u = song.modelUsed;
  }

  return compact;
}

/**
 * Reconstitutes a full MusicBoxSong from a compact schema.
 */
export function decodeCompactSong(compact: CompactSongSchema): MusicBoxSong {
  let combScaleId: CombScaleId = 'romantic-flat';
  if (typeof compact.c === 'number') {
    combScaleId = COMB_SCALE_IDS[compact.c] || 'romantic-flat';
  } else if (typeof compact.c === 'string' && compact.c) {
    combScaleId = compact.c as CombScaleId;
  }

  const combTines = getCombTines(combScaleId);
  const totalSteps = compact.s ?? 64;
  const tempoBpm = compact.b ?? 88;

  const pins: MusicBoxPin[] = (compact.p || [])
    .filter(([step, tineIndex]) => step >= 0 && step < totalSteps && tineIndex >= 0 && tineIndex < combTines.length)
    .map(([step, tineIndex]) => ({
      step,
      tineIndex,
      note: combTines[tineIndex]?.note,
    }));

  const isAi = Boolean(compact.a);

  return sanitizeSong({
    id: `shared-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: compact.t || 'Shared Melody',
    category: (compact.g as any) || (isAi ? 'ai' : 'custom'),
    description: compact.d || '',
    tempoBpm,
    totalSteps,
    combScaleId,
    pins: sortPins(pins),
    createdAt: Date.now(),
    isAiGenerated: isAi,
    modelUsed: compact.u,
  });
}

/**
 * Strips default values and unused properties prior to JSON serialization.
 */
export function cleanSongForUrl(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

// ----------------------------------------------------------------------------
// 4. Native Stream Compression & Decompression
// ----------------------------------------------------------------------------

/**
 * Compresses a string using the browser's native CompressionStream.
 * Format precedence: 'deflate-raw' -> 'gzip' -> 'deflate'.
 */
export async function compressString(text: string, timeoutMs = 500): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    // If CompressionStream is not available (e.g. older environment), return UTF-8 bytes directly
    return new TextEncoder().encode(text);
  }

  const bytes = new TextEncoder().encode(text);

  const formats: CompressionFormat[] = ['deflate-raw', 'gzip', 'deflate'];

  return new Promise<Uint8Array>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Stream compression timed out'));
    }, timeoutMs);

    const tryCompress = async (formatIdx: number): Promise<Uint8Array> => {
      if (formatIdx >= formats.length) {
        // Fallback to uncompressed raw UTF-8 bytes if all stream formats fail
        return bytes;
      }

      const format = formats[formatIdx];
      try {
        const cs = new CompressionStream(format);
        const writer = cs.writable.getWriter();
        writer.write(bytes);
        writer.close();

        const reader = cs.readable.getReader();
        const chunks: Uint8Array[] = [];
        let totalLen = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            totalLen += value.length;
          }
        }

        // Header byte prefix: 0 = deflate-raw, 1 = gzip, 2 = deflate
        const result = new Uint8Array(totalLen + 1);
        result[0] = formatIdx;
        let offset = 1;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        return result;
      } catch {
        return tryCompress(formatIdx + 1);
      }
    };

    tryCompress(0)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Decompresses binary bytes using native DecompressionStream with memory safety guards.
 */
export async function decompressBytes(bytes: Uint8Array, timeoutMs = 500): Promise<string> {
  if (bytes.length === 0) {
    throw new Error('Cannot decompress empty byte buffer');
  }

  if (typeof DecompressionStream === 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }

  const formatCode = bytes[0];
  const formats: CompressionFormat[] = ['deflate-raw', 'gzip', 'deflate'];
  const format: CompressionFormat = formats[formatCode] || 'deflate-raw';
  const payload = bytes.slice(1);

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Decompression stream timed out'));
    }, timeoutMs);

    const runDecompress = async () => {
      try {
        const ds = new DecompressionStream(format);
        const writer = ds.writable.getWriter();
        writer.write(payload);
        writer.close();

        const reader = ds.readable.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.length;
            if (totalBytes > MAX_DECOMPRESSED_BYTES) {
              throw new Error(`Decompressed size exceeds safety ceiling of 5 MB (Zip-bomb defense)`);
            }
            chunks.push(value);
          }
        }

        const fullBuffer = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          fullBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        return new TextDecoder('utf-8').decode(fullBuffer);
      } catch (err) {
        // Fallback: if formatCode failed, attempt deflate-raw directly on original bytes
        try {
          const fallbackDs = new DecompressionStream('deflate-raw');
          const fbWriter = fallbackDs.writable.getWriter();
          fbWriter.write(bytes);
          fbWriter.close();

          const fbReader = fallbackDs.readable.getReader();
          const fbChunks: Uint8Array[] = [];
          let fbTotal = 0;
          while (true) {
            const { value, done } = await fbReader.read();
            if (done) break;
            if (value) {
              fbTotal += value.length;
              if (fbTotal > MAX_DECOMPRESSED_BYTES) {
                throw new Error('Decompressed size exceeds 5 MB');
              }
              fbChunks.push(value);
            }
          }
          const fbBuf = new Uint8Array(fbTotal);
          let fbOffset = 0;
          for (const c of fbChunks) {
            fbBuf.set(c, fbOffset);
            fbOffset += c.length;
          }
          return new TextDecoder('utf-8').decode(fbBuf);
        } catch {
          // Last resort: raw UTF-8 string
          try {
            return new TextDecoder('utf-8').decode(bytes);
          } catch {
            throw err;
          }
        }
      }
    };

    runDecompress()
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ----------------------------------------------------------------------------
// 5. RFC 4648 §5 Base64URL Encoding & Decoding
// ----------------------------------------------------------------------------

/**
 * Converts a Uint8Array to RFC 4648 §5 URL-Safe Base64 (- and _, without = padding).
 */
export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts an RFC 4648 §5 URL-Safe Base64 string back to Uint8Array.
 */
export function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Reconstruct modulo-4 padding
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ----------------------------------------------------------------------------
// 6. Complete Pipeline: URL Construction & Decompression
// ----------------------------------------------------------------------------

/**
 * Generates an optimized shareable direct URL and QR payload for any score.
 */
export async function generateSongShareUrl(
  song: MusicBoxSong,
  baseUrl?: string
): Promise<ScoreShareResult> {
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://musicbox.app/');

  const rawJson = JSON.stringify(song);
  const originalJsonBytes = new TextEncoder().encode(rawJson).length;

  // Tier 1: Unmodified Factory Preset Check
  if (isUnmodifiedPreset(song)) {
    const hash = `#preset=${encodeURIComponent(song.id)}`;
    const url = `${origin}${hash}`;
    return {
      url,
      hash,
      tier: 'preset',
      originalJsonBytes,
      compactJsonBytes: 0,
      compressedBinaryBytes: 0,
      urlChars: url.length,
      compressionRatio: 0.98,
    };
  }

  // Check if eligible for Tier 2: Differential Preset Delta
  const basePreset = findBasePresetForSong(song);
  let chosenTier: CompressionTier = 'compact';
  let jsonToCompress = '';

  const compactObj = cleanSongForUrl(encodeCompactSong(song) as unknown as Record<string, unknown>);
  const compactJson = JSON.stringify(compactObj);

  if (basePreset) {
    const deltaObj = cleanSongForUrl(createPresetDelta(song, basePreset) as unknown as Record<string, unknown>);
    const deltaJson = JSON.stringify(deltaObj);

    // Pick delta only if strictly smaller than compact
    if (deltaJson.length < compactJson.length) {
      chosenTier = 'delta';
      jsonToCompress = deltaJson;
    } else {
      jsonToCompress = compactJson;
    }
  } else {
    jsonToCompress = compactJson;
  }

  const compactJsonBytes = new TextEncoder().encode(jsonToCompress).length;
  const compressedBytes = await compressString(jsonToCompress);
  const base64Url = uint8ArrayToBase64Url(compressedBytes);

  const hash = `#song=${base64Url}`;
  const url = `${origin}${hash}`;

  const compressionRatio =
    originalJsonBytes > 0
      ? Math.max(0, 1 - (compressedBytes.length / originalJsonBytes))
      : 0;

  return {
    url,
    hash,
    tier: chosenTier,
    originalJsonBytes,
    compactJsonBytes,
    compressedBinaryBytes: compressedBytes.length,
    urlChars: url.length,
    compressionRatio,
  };
}

/**
 * Extracts payload string from URL hash or query parameters.
 */
export function extractSongParamsFromUrl(urlOrHash?: string): {
  type: 'preset' | 'song';
  payload: string;
} | null {
  const target =
    urlOrHash ||
    (typeof window !== 'undefined' && window.location
      ? `${window.location.hash || ''}${window.location.search || ''}`
      : '');

  if (!target) return null;

  if (target.length > MAX_URL_PAYLOAD_CHARS) {
    console.warn('URL payload exceeds max safety threshold of 300 KB');
    return null;
  }

  // 1. Check hash: #preset=<id>
  const presetHashMatch = target.match(/#preset=([^&]+)/);
  if (presetHashMatch) {
    return { type: 'preset', payload: decodeURIComponent(presetHashMatch[1]) };
  }

  // 2. Check hash: #song=<base64url> or #data=<base64url>
  const songHashMatch = target.match(/#(?:song|data)=([^&]+)/);
  if (songHashMatch) {
    return { type: 'song', payload: songHashMatch[1] };
  }

  // 3. Check query param: ?preset=<id>
  const presetQueryMatch = target.match(/[?&]preset=([^&]+)/);
  if (presetQueryMatch) {
    return { type: 'preset', payload: decodeURIComponent(presetQueryMatch[1]) };
  }

  // 4. Check query param: ?song=<base64url>
  const songQueryMatch = target.match(/[?&]song=([^&]+)/);
  if (songQueryMatch) {
    return { type: 'song', payload: songQueryMatch[1] };
  }

  return null;
}

/**
 * Parses and hydrates a MusicBoxSong directly from a URL string or current window location.
 */
export async function parseSongFromUrl(urlOrHash?: string): Promise<MusicBoxSong | null> {
  const extracted = extractSongParamsFromUrl(urlOrHash);
  if (!extracted) return null;

  if (extracted.type === 'preset') {
    const preset = DEFAULT_SONGS.find((p) => p.id === extracted.payload);
    if (preset) {
      return {
        ...preset,
        id: `preset-${preset.id}-${Date.now().toString(36)}`,
      };
    }
    return null;
  }

  try {
    const bytes = base64UrlToUint8Array(extracted.payload);
    const jsonStr = await decompressBytes(bytes);
    const parsed = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Parsed payload is not an object');
    }

    // Branching format:
    // Case 1: Tier 2 Delta (_d: 1)
    if (parsed._d === 1 && parsed.bId) {
      return decodePresetDelta(parsed as PresetDeltaSchema);
    }

    // Case 2: Tier 3 Compact V2 (_c: 2)
    if (parsed._c === 2 && Array.isArray(parsed.p)) {
      return decodeCompactSong(parsed as CompactSongSchema);
    }

    // Case 3: Legacy full MusicBoxSong JSON { title, pins }
    if (parsed.title && Array.isArray(parsed.pins)) {
      return sanitizeSong({
        id: parsed.id || `shared-${Date.now().toString(36)}`,
        title: parsed.title,
        category: parsed.category || 'custom',
        description: parsed.description || '',
        tempoBpm: parsed.tempoBpm || 88,
        totalSteps: parsed.totalSteps || 64,
        combScaleId: parsed.combScaleId || 'romantic-flat',
        pins: parsed.pins,
        createdAt: Date.now(),
        isAiGenerated: !!parsed.isAiGenerated,
        modelUsed: parsed.modelUsed,
      });
    }

    throw new Error('Unrecognized score format in URL payload');
  } catch (err) {
    console.error('Failed to parse song from URL payload:', err);
    return null;
  }
}

/**
 * Verifies and normalizes score integrity (bounds check on steps, tines, and valid notes).
 */
export function sanitizeSong(song: MusicBoxSong): MusicBoxSong {
  const combScaleId: CombScaleId =
    song.combScaleId && COMB_SCALE_IDS.includes(song.combScaleId)
      ? song.combScaleId
      : 'romantic-flat';

  const combTines = getCombTines(combScaleId);
  const totalSteps = Math.max(16, Math.min(256, song.totalSteps || 64));
  const tempoBpm = Math.max(40, Math.min(240, song.tempoBpm || 88));

  // Deduplicate and filter pins
  const pinKeySet = new Set<string>();
  const validPins: MusicBoxPin[] = [];

  for (const pin of song.pins || []) {
    if (typeof pin.step !== 'number' || typeof pin.tineIndex !== 'number') continue;
    if (pin.step < 0 || pin.step >= totalSteps) continue;
    if (pin.tineIndex < 0 || pin.tineIndex >= combTines.length) continue;

    const key = `${pin.step}:${pin.tineIndex}`;
    if (!pinKeySet.has(key)) {
      pinKeySet.add(key);
      validPins.push({
        step: pin.step,
        tineIndex: pin.tineIndex,
        note: combTines[pin.tineIndex]?.note || pin.note,
      });
    }
  }

  return {
    id: song.id || `song-${Date.now().toString(36)}`,
    title: (song.title || 'Untitled Melody').slice(0, 100),
    category: song.category || 'custom',
    description: (song.description || '').slice(0, 300),
    tempoBpm,
    totalSteps,
    combScaleId,
    pins: sortPins(validPins),
    createdAt: song.createdAt || Date.now(),
    isAiGenerated: !!song.isAiGenerated,
    modelUsed: song.modelUsed,
  };
}

// ----------------------------------------------------------------------------
// 7. QR Code Generation with Level L Error Correction, Song Title & Footer
// ----------------------------------------------------------------------------

export type GenerateScoreQrOptions = QRCode.QRCodeToDataURLOptions & {
  title?: string;
  footerText?: string;
};

/**
 * Wraps canvas text into lines if it exceeds maxWidth.
 */
function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = 2
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return ['Untitled Cylinder'];
  if (ctx.measureText(trimmed).width <= maxWidth) {
    return [trimmed];
  }

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        let chunk = '';
        for (const char of word) {
          if (ctx.measureText(chunk + char).width <= maxWidth) {
            chunk += char;
          } else {
            lines.push(chunk);
            chunk = char;
            if (lines.length >= maxLines) break;
          }
        }
        currentLine = chunk;
      }

      if (lines.length >= maxLines) {
        break;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // Add ellipsis if text was truncated
  const accountedWords = lines.join(' ').split(/\s+/).length;
  if (accountedWords < words.length && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }

  return lines;
}

/**
 * Draws a rounded rectangle path on Canvas 2D context.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }
}

/**
 * Generates an all-in-one collectible QR code image with the song title at the top,
 * the scannable QR code in the middle, and "music-box" footer at the bottom.
 */
export async function generateSongQrCodeImage(
  url: string,
  title?: string,
  footerText: string = 'music-box',
  options?: {
    darkColor?: string;
    lightColor?: string;
    scale?: number;
    errorCorrectionLevel?: QRCode.QRCodeErrorCorrectionLevel;
  }
): Promise<string> {
  const darkColor = options?.darkColor || '#433422';
  const lightColor = options?.lightColor || '#fbf9f4';
  const displayTitle = (title || 'Music Box Cylinder').trim();
  const displayFooter = (footerText || 'music-box').trim();

  // Guard against non-browser/Node environments without DOM Canvas
  if (typeof document === 'undefined') {
    return QRCode.toDataURL(url, {
      errorCorrectionLevel: options?.errorCorrectionLevel || 'L',
      margin: 2,
      scale: options?.scale || 6,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    });
  }

  // Wait briefly for custom fonts if available
  if (document.fonts && document.fonts.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 150)),
      ]);
    } catch {
      // ignore
    }
  }

  const scale = options?.scale || 2;
  const cardWidth = 320;
  const qrSize = 240;
  const qrX = (cardWidth - qrSize) / 2;
  const maxTextWidth = cardWidth - 32;

  // Create temporary offscreen canvas for QR matrix
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, url, {
    width: qrSize * scale,
    margin: 1.5,
    color: {
      dark: darkColor,
      light: '#ffffff',
    },
    errorCorrectionLevel: options?.errorCorrectionLevel || 'L',
  });

  // Measure title block
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d')!;
  measureCtx.font = 'bold 16px "Playfair Display", "Cinzel", Georgia, serif';
  const titleLines = wrapCanvasText(measureCtx, displayTitle, maxTextWidth, 2);
  const titleLineHeight = 22;
  const titleBlockHeight = titleLines.length * titleLineHeight;

  // Layout calculations (logical dimensions)
  const topPadding = 20;
  const dividerY = topPadding + titleBlockHeight + 6;
  const qrY = dividerY + 14;
  const fy = qrY + qrSize + 18;
  const bottomPadding = 18;
  const cardHeight = fy + bottomPadding;

  // Create main composite canvas
  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = cardWidth * scale;
  mainCanvas.height = cardHeight * scale;
  const ctx = mainCanvas.getContext('2d')!;

  ctx.scale(scale, scale);

  // 1. Background Card
  ctx.fillStyle = lightColor;
  drawRoundedRect(ctx, 0, 0, cardWidth, cardHeight, 16);
  ctx.fill();

  // 2. Subtle Antique Inner Border
  ctx.strokeStyle = 'rgba(180, 150, 105, 0.35)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 8, 8, cardWidth - 16, cardHeight - 16, 12);
  ctx.stroke();

  // 3. Song Title at Top
  ctx.fillStyle = darkColor;
  ctx.font = 'bold 16px "Playfair Display", "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const startTitleY = topPadding + titleLineHeight / 2;
  titleLines.forEach((line, index) => {
    ctx.fillText(line, cardWidth / 2, startTitleY + index * titleLineHeight);
  });

  // 4. Subtle Decorative Accent Divider
  ctx.strokeStyle = 'rgba(180, 150, 105, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardWidth / 2 - 28, dividerY);
  ctx.lineTo(cardWidth / 2 + 28, dividerY);
  ctx.stroke();

  // Tiny center ornament
  ctx.fillStyle = '#8a6b3e';
  ctx.beginPath();
  ctx.arc(cardWidth / 2, dividerY, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // 5. White Rounded Panel Behind QR Code for Contrast
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 8);
  ctx.fill();
  ctx.strokeStyle = '#e8dfcf';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw QR code
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // 6. "music-box" Footer at Bottom
  ctx.font = '600 11px "Cinzel", "Playfair Display", Georgia, serif';
  ctx.fillStyle = '#8a6b3e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const tw = ctx.measureText(displayFooter).width;
  const cx = cardWidth / 2;

  // Flanking antique dashes
  ctx.strokeStyle = 'rgba(180, 150, 105, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2 - 18, fy);
  ctx.lineTo(cx - tw / 2 - 6, fy);
  ctx.moveTo(cx + tw / 2 + 6, fy);
  ctx.lineTo(cx + tw / 2 + 18, fy);
  ctx.stroke();

  ctx.fillText(displayFooter, cx, fy);

  return mainCanvas.toDataURL('image/png');
}

/**
 * Generates a high-density QR Code Data URL with Level L Error Correction (~7% redundancy).
 * If options.title is supplied, generates a card with the title on top and footer at bottom.
 */
export async function generateScoreQrCode(
  url: string,
  options?: GenerateScoreQrOptions
): Promise<string> {
  if (options?.title) {
    return generateSongQrCodeImage(
      url,
      options.title,
      options.footerText || 'music-box',
      {
        darkColor: (options.color?.dark as string) || '#433422',
        lightColor: (options.color?.light as string) || '#fbf9f4',
        scale: typeof options.scale === 'number' ? Math.min(options.scale, 4) : 2,
        errorCorrectionLevel: options.errorCorrectionLevel || 'L',
      }
    );
  }

  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'L',
    margin: 2,
    scale: 6,
    color: {
      dark: '#2d2419', // Vintage antique ink
      light: '#fdfcf9', // Parchment paper background
    },
    ...options,
  });
}
