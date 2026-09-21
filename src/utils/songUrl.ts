import { MusicBoxSong, MusicBoxPin, CombScaleId, COMB_SCALES_MAP } from '../types';
import { DEFAULT_SONGS } from '../data/defaultSongs';

/**
 * Ultra-compact wire format for music box scores.
 * Pins are stored as simple integer pairs [tineIndex, step].
 * Redundant note strings (e.g. 'Eb6') are omitted and automatically hydrated from the comb scale.
 */
export interface CompactMusicBoxWireFormat {
  v: 1; // Wire format version
  t: string; // Title
  b: number; // Tempo BPM
  s: number; // Total steps (typically 64, 96, 128)
  k?: CombScaleId; // Comb scale ID (defaults to 'romantic-flat')
  c?: MusicBoxSong['category']; // Category
  d?: string; // Optional description
  p: [number, number][]; // Pins as [tineIndex, step] pairs
  ai?: {
    gen: boolean;
    m?: string; // Model name if AI-composed
  };
}

const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024; // 2 MB guard against decompression bombs
const MAX_URL_PAYLOAD_CHARS = 150000;

/**
 * Converts a full MusicBoxSong into a compact, sorted wire format.
 */
export function packMusicBoxSong(song: MusicBoxSong): CompactMusicBoxWireFormat {
  // Sort pins by step, then tineIndex for maximum DEFLATE run-length efficiency
  const sortedPins = [...(song.pins || [])].sort((a, b) => {
    if (a.step !== b.step) return a.step - b.step;
    return a.tineIndex - b.tineIndex;
  });

  const pinTuples: [number, number][] = sortedPins.map((p) => [p.tineIndex, p.step]);

  const compact: CompactMusicBoxWireFormat = {
    v: 1,
    t: (song.title || 'Untitled Cylinder').trim(),
    b: Math.round(song.tempoBpm || 88),
    s: song.totalSteps || 128,
    p: pinTuples,
  };

  if (song.combScaleId && song.combScaleId !== 'romantic-flat') {
    compact.k = song.combScaleId;
  }

  if (song.category && song.category !== 'custom') {
    compact.c = song.category;
  }

  if (song.description && song.description.trim().length > 0) {
    compact.d = song.description.trim().slice(0, 300);
  }

  if (song.isAiGenerated || song.modelUsed) {
    compact.ai = {
      gen: !!song.isAiGenerated,
      m: song.modelUsed || undefined,
    };
  }

  return compact;
}

/**
 * Unpacks the compact wire format back into a fully formed MusicBoxSong with explicit note names.
 */
export function unpackMusicBoxSong(compact: CompactMusicBoxWireFormat): MusicBoxSong {
  const scaleId: CombScaleId =
    compact.k && compact.k in COMB_SCALES_MAP ? compact.k : 'romantic-flat';
  const combInfo = COMB_SCALES_MAP[scaleId] || COMB_SCALES_MAP['romantic-flat'];
  const maxTines = combInfo.tines.length;
  const totalSteps = compact.s && compact.s > 0 ? compact.s : 128;

  // Hydrate pins with note names from comb scale
  const pins: MusicBoxPin[] = (compact.p || [])
    .filter(([tineIndex, step]) => tineIndex >= 0 && tineIndex < maxTines && step >= 0 && step < totalSteps)
    .map(([tineIndex, step]) => {
      const tine = combInfo.tines[tineIndex];
      return {
        tineIndex,
        step,
        note: tine ? tine.note : undefined,
      };
    });

  const uniqueId = `shared-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  return {
    id: uniqueId,
    title: compact.t || 'Shared Cylinder',
    category: compact.c || 'custom',
    description: compact.d || 'Shared via Mechanical Music Box link',
    tempoBpm: Math.max(30, Math.min(240, compact.b || 88)),
    totalSteps,
    combScaleId: scaleId,
    pins,
    createdAt: Date.now(),
    isAiGenerated: compact.ai?.gen,
    modelUsed: compact.ai?.m,
  };
}

/**
 * Checks whether a song matches an unmodified factory preset in DEFAULT_SONGS.
 */
export function isSongModifiedFromPreset(song: MusicBoxSong): boolean {
  const preset = DEFAULT_SONGS.find((p) => p.id === song.id);
  if (!preset) return true; // Not a preset

  if (song.title !== preset.title) return true;
  if (song.tempoBpm !== preset.tempoBpm) return true;
  if (song.totalSteps !== preset.totalSteps) return true;
  if ((song.combScaleId || 'romantic-flat') !== (preset.combScaleId || 'romantic-flat')) return true;

  if (song.pins.length !== preset.pins.length) return true;

  // Sort and compare pin coordinates
  const sortPins = (pins: MusicBoxPin[]) =>
    [...pins].sort((a, b) => a.step - b.step || a.tineIndex - b.tineIndex);

  const aPins = sortPins(song.pins);
  const bPins = sortPins(preset.pins);

  for (let i = 0; i < aPins.length; i++) {
    if (aPins[i].step !== bPins[i].step || aPins[i].tineIndex !== bPins[i].tineIndex) {
      return true;
    }
  }

  return false;
}

/**
 * RFC 4648 §5 Base64URL string encoder (browser-safe).
 */
export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * RFC 4648 §5 Base64URL string decoder (browser-safe).
 */
export function base64UrlToUint8Array(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compresses a string using native browser CompressionStream with fallback tiers.
 */
export async function compressString(input: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(input);

  // Check for native CompressionStream support
  if (typeof CompressionStream !== 'undefined') {
    const formats: CompressionFormat[] = ['deflate-raw', 'gzip', 'deflate'];
    for (const format of formats) {
      try {
        const cs = new CompressionStream(format);
        const writer = cs.writable.getWriter();
        writer.write(bytes);
        writer.close();

        const chunks: Uint8Array[] = [];
        const reader = cs.readable.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        return merged;
      } catch {
        // Try next format
      }
    }
  }

  // Fallback: uncompressed UTF-8 bytes
  return bytes;
}

/**
 * Decompresses raw bytes using native browser DecompressionStream with security guards.
 */
export async function decompressBytes(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream !== 'undefined') {
    const formats: CompressionFormat[] = ['deflate-raw', 'gzip', 'deflate'];
    for (const format of formats) {
      try {
        const ds = new DecompressionStream(format);
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        const reader = ds.readable.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.length;
            if (totalBytes > MAX_DECOMPRESSED_BYTES) {
              await reader.cancel();
              throw new Error('Decompressed stream exceeded safe memory limit');
            }
            chunks.push(value);
          }
        }

        const merged = new Uint8Array(totalBytes);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        return new TextDecoder().decode(merged);
      } catch {
        // Try next decompression format
      }
    }
  }

  // Fallback: direct UTF-8 decode
  return new TextDecoder().decode(bytes);
}

export interface ShareableUrlResult {
  url: string;
  isPreset: boolean;
  presetId?: string;
  payloadSize: number;
  originalSize: number;
  compressionRatio: number;
}

/**
 * Creates a shareable URL for a music box song.
 * Uses #preset=id for factory presets, or #song=payload for custom/edited cylinders.
 */
export async function createShareableCylinderUrl(
  song: MusicBoxSong,
  baseUrl?: string
): Promise<ShareableUrlResult> {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');

  // 1. Check if it's an unmodified factory preset
  if (!isSongModifiedFromPreset(song)) {
    const url = `${base}#preset=${encodeURIComponent(song.id)}`;
    return {
      url,
      isPreset: true,
      presetId: song.id,
      payloadSize: song.id.length,
      originalSize: JSON.stringify(song).length,
      compressionRatio: 98,
    };
  }

  // 2. Custom or modified song: compact, stringify, and compress
  const compact = packMusicBoxSong(song);
  const jsonStr = JSON.stringify(compact);
  const originalSize = jsonStr.length;

  const compressedBytes = await compressString(jsonStr);
  const base64UrlPayload = uint8ArrayToBase64Url(compressedBytes);
  const url = `${base}#song=${base64UrlPayload}`;

  const payloadSize = base64UrlPayload.length;
  const compressionRatio = Math.max(0, Math.round((1 - payloadSize / Math.max(originalSize, 1)) * 100));

  return {
    url,
    isPreset: false,
    payloadSize,
    originalSize,
    compressionRatio,
  };
}

/**
 * Extracts preset ID or song payload from URL (prioritizing hash, then query params).
 */
export function extractCylinderParamsFromUrl(urlStringOrLocation?: Location | string): {
  presetId?: string;
  songPayload?: string;
} {
  try {
    let url: URL;
    if (typeof urlStringOrLocation === 'string') {
      url = new URL(urlStringOrLocation, 'http://localhost');
    } else if (typeof window !== 'undefined' && urlStringOrLocation) {
      url = new URL(urlStringOrLocation.href);
    } else if (typeof window !== 'undefined') {
      url = new URL(window.location.href);
    } else {
      return {};
    }

    // 1. Prioritize Hash Fragment
    const hash = url.hash.replace(/^#/, '');
    if (hash) {
      const params = new URLSearchParams(hash);
      const preset = params.get('preset');
      const song = params.get('song') || params.get('data');
      if (preset) return { presetId: preset };
      if (song) return { songPayload: song };

      // Handle raw '#preset=id' or '#song=payload'
      if (hash.startsWith('preset=')) {
        return { presetId: hash.slice(7) };
      }
      if (hash.startsWith('song=')) {
        return { songPayload: hash.slice(5) };
      }
    }

    // 2. Fallback to Search Query Parameter (e.g. ?preset= or ?song=)
    const preset = url.searchParams.get('preset');
    const song = url.searchParams.get('song') || url.searchParams.get('data');
    if (preset) return { presetId: preset };
    if (song) return { songPayload: song };
  } catch (e) {
    console.warn('Failed to extract cylinder params from URL:', e);
  }

  return {};
}

/**
 * Parses and reconstructs a MusicBoxSong from the current or provided URL.
 */
export async function parseCylinderFromUrl(
  urlStringOrLocation?: Location | string
): Promise<{ song: MusicBoxSong; isPreset: boolean } | null> {
  const { presetId, songPayload } = extractCylinderParamsFromUrl(urlStringOrLocation);

  // 1. Check for Preset ID
  if (presetId) {
    const preset = DEFAULT_SONGS.find((s) => s.id === presetId);
    if (preset) {
      return { song: { ...preset }, isPreset: true };
    }
  }

  // 2. Check for Compressed Song Payload
  if (songPayload) {
    if (songPayload.length > MAX_URL_PAYLOAD_CHARS) {
      throw new Error('Shared cylinder link exceeds maximum safe size');
    }

    const compressedBytes = base64UrlToUint8Array(songPayload);
    const jsonStr = await decompressBytes(compressedBytes);
    const parsed = JSON.parse(jsonStr) as CompactMusicBoxWireFormat;

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.p)) {
      throw new Error('Invalid cylinder score structure in shared link');
    }

    const song = unpackMusicBoxSong(parsed);
    return { song, isPreset: false };
  }

  return null;
}

/**
 * Sanitizes and bounds-checks any imported or loaded song to prevent runtime errors.
 */
export function sanitizeMusicBoxSong(song: Partial<MusicBoxSong>): MusicBoxSong {
  const scaleId: CombScaleId =
    song.combScaleId && song.combScaleId in COMB_SCALES_MAP ? song.combScaleId : 'romantic-flat';
  const combInfo = COMB_SCALES_MAP[scaleId];
  const maxTines = combInfo.tines.length;
  const totalSteps = Math.max(16, Math.min(256, song.totalSteps || 128));

  const cleanPins: MusicBoxPin[] = (song.pins || [])
    .filter((p) => p && typeof p.step === 'number' && typeof p.tineIndex === 'number')
    .filter((p) => p.tineIndex >= 0 && p.tineIndex < maxTines && p.step >= 0 && p.step < totalSteps)
    .map((p) => ({
      tineIndex: p.tineIndex,
      step: p.step,
      note: p.note || combInfo.tines[p.tineIndex]?.note,
    }));

  return {
    id: song.id || `cylinder-${Date.now()}`,
    title: (song.title || 'Untitled Cylinder').trim().slice(0, 100),
    category: song.category || 'custom',
    description: (song.description || '').trim().slice(0, 300),
    tempoBpm: Math.max(30, Math.min(240, song.tempoBpm || 88)),
    totalSteps,
    combScaleId: scaleId,
    pins: cleanPins,
    createdAt: song.createdAt || Date.now(),
    isAiGenerated: !!song.isAiGenerated,
    modelUsed: song.modelUsed,
  };
}

/**
 * Cleans the URL address bar hash to prevent re-hydrating old shared links on reload.
 */
export function cleanUrlAddressBar() {
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('song');
    url.searchParams.delete('preset');
    url.searchParams.delete('data');
    window.history.replaceState(null, '', url.pathname + (url.search || ''));
  }
}
