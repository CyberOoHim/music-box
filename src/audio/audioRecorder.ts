import { Mp3Encoder } from '@breezystack/lamejs';

export interface RecordedAudioSession {
  wavBlob: Blob;
  mp3Blob: Blob;
  wavUrl: string;
  mp3Url: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  songTitle: string;
  turns: number;
  chamberPreset: string;
}

export interface AudioRecorderOptions {
  sourceNode: AudioNode;
  audioContext: AudioContext;
  onLevelUpdate?: (peakLevel: number) => void;
}

/**
 * High-fidelity Web Audio stereo recorder capturing Float32Array PCM buffers.
 */
export class AudioRecorder {
  private processorNode: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private leftChunks: Float32Array[] = [];
  private rightChunks: Float32Array[] = [];
  private totalSampleCount = 0;
  private isRecordingInternal = false;
  private sampleRate = 44100;
  private sourceNode: AudioNode | null = null;
  private audioCtx: AudioContext | null = null;

  public get isRecording(): boolean {
    return this.isRecordingInternal;
  }

  public start(options: AudioRecorderOptions): void {
    if (this.isRecordingInternal) {
      this.cancel();
    }

    const { sourceNode, audioContext, onLevelUpdate } = options;
    this.audioCtx = audioContext;
    this.sourceNode = sourceNode;
    this.sampleRate = audioContext.sampleRate;
    this.leftChunks = [];
    this.rightChunks = [];
    this.totalSampleCount = 0;
    this.isRecordingInternal = true;

    // Buffer size 4096 gives ~92ms slices at 44.1kHz with minimal overhead
    const bufferSize = 4096;
    this.processorNode = audioContext.createScriptProcessor(bufferSize, 2, 2);

    // Muted gain node to keep Web Audio pull graph active without routing duplicate audio to speakers
    this.silentGain = audioContext.createGain();
    this.silentGain.gain.setValueAtTime(0, audioContext.currentTime);

    this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.isRecordingInternal) return;

      const inputL = e.inputBuffer.getChannelData(0);
      const inputR = e.inputBuffer.getChannelData(1);

      // Clone buffers into storage
      const chunkL = new Float32Array(inputL.length);
      const chunkR = new Float32Array(inputR.length);
      chunkL.set(inputL);
      chunkR.set(inputR);

      this.leftChunks.push(chunkL);
      this.rightChunks.push(chunkR);
      this.totalSampleCount += inputL.length;

      // Real-time VU meter peak detection (stride of 4 for speed)
      if (onLevelUpdate) {
        let maxPeak = 0;
        const len = inputL.length;
        for (let i = 0; i < len; i += 4) {
          const absL = Math.abs(inputL[i]);
          const absR = Math.abs(inputR[i]);
          if (absL > maxPeak) maxPeak = absL;
          if (absR > maxPeak) maxPeak = absR;
        }
        onLevelUpdate(Math.min(1.0, maxPeak));
      }
    };

    sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.silentGain);
    this.silentGain.connect(audioContext.destination);
  }

  public async stop(): Promise<{
    leftBuffer: Float32Array;
    rightBuffer: Float32Array;
    durationSeconds: number;
    sampleRate: number;
  }> {
    this.isRecordingInternal = false;
    this.cleanupNodes();

    const sampleRate = this.sampleRate;
    const totalSamples = this.totalSampleCount;
    const leftBuffer = new Float32Array(totalSamples);
    const rightBuffer = new Float32Array(totalSamples);

    let offset = 0;
    for (let i = 0; i < this.leftChunks.length; i++) {
      leftBuffer.set(this.leftChunks[i], offset);
      rightBuffer.set(this.rightChunks[i], offset);
      offset += this.leftChunks[i].length;
    }

    const durationSeconds = totalSamples / sampleRate;
    return { leftBuffer, rightBuffer, durationSeconds, sampleRate };
  }

  public cancel(): void {
    this.isRecordingInternal = false;
    this.cleanupNodes();
    this.leftChunks = [];
    this.rightChunks = [];
    this.totalSampleCount = 0;
  }

  private cleanupNodes(): void {
    if (this.sourceNode && this.processorNode) {
      try {
        this.sourceNode.disconnect(this.processorNode);
      } catch {
        // ignore
      }
    }
    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode = null;
    }
    if (this.silentGain) {
      try {
        this.silentGain.disconnect();
      } catch {
        // ignore
      }
      this.silentGain = null;
    }
  }
}

/**
 * Pure TypeScript RIFF 16-bit stereo PCM WAV encoder.
 * Writes standard 44-byte canonical WAV header with interleaved 16-bit little-endian samples.
 */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const numSamples = Math.min(left.length, right.length);
  const headerSize = 44;
  const bytesPerSample = 2; // 16-bit
  const numChannels = 2; // Stereo
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeString = (v: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // 1. RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // 2. fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size = 16 for PCM
  view.setUint16(20, 1, true); // AudioFormat = 1 (Linear PCM)
  view.setUint16(22, numChannels, true); // NumChannels = 2
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // ByteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign = 4
  view.setUint16(34, 16, true); // BitsPerSample = 16

  // 3. data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleaved 16-bit signed PCM samples
  let byteOffset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1, Math.min(1, left[i]));
    const sR = Math.max(-1, Math.min(1, right[i]));

    const intL = sL < 0 ? Math.floor(sL * 0x8000) : Math.floor(sL * 0x7fff);
    const intR = sR < 0 ? Math.floor(sR * 0x8000) : Math.floor(sR * 0x7fff);

    view.setInt16(byteOffset, intL, true);
    view.setInt16(byteOffset + 2, intR, true);
    byteOffset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Encodes stereo Float32Array PCM buffers to high-quality MP3 using @breezystack/lamejs.
 */
export function encodeMp3(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  bitrateKbps = 192
): Blob {
  const numSamples = Math.min(left.length, right.length);
  const leftInt16 = new Int16Array(numSamples);
  const rightInt16 = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1, Math.min(1, left[i]));
    const sR = Math.max(-1, Math.min(1, right[i]));
    leftInt16[i] = sL < 0 ? Math.floor(sL * 0x8000) : Math.floor(sL * 0x7fff);
    rightInt16[i] = sR < 0 ? Math.floor(sR * 0x8000) : Math.floor(sR * 0x7fff);
  }

  const mp3encoder = new Mp3Encoder(2, sampleRate, bitrateKbps);
  const mp3Data: Uint8Array[] = [];

  // Feed in chunks of 1152 samples (standard MPEG frame size)
  const chunkSize = 1152;
  for (let i = 0; i < numSamples; i += chunkSize) {
    const end = Math.min(i + chunkSize, numSamples);
    const leftChunk = leftInt16.subarray(i, end);
    const rightChunk = rightInt16.subarray(i, end);
    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
  }

  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(new Uint8Array(endBuf));
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
}

/**
 * Format time in mm:ss format.
 */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format human-readable file sizes (e.g. "1.4 MB").
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Safely clean up recorded session object URLs to prevent browser memory leaks.
 */
export function cleanupRecordedSession(session: RecordedAudioSession | null): void {
  if (!session) return;
  try {
    if (session.wavUrl) URL.revokeObjectURL(session.wavUrl);
    if (session.mp3Url) URL.revokeObjectURL(session.mp3Url);
  } catch {
    // ignore
  }
}
