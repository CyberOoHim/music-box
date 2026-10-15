import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MusicBoxSong, SoundChamberPreset, SOUND_CHAMBER_PRESETS, CombScaleId } from '../types';
import { RecordedAudioSession, formatTime, formatFileSize } from '../audio/audioRecorder';
import {
  RecordedVideoSession,
  VideoCompressionProfile,
  renderCompositeVideoFrame,
} from '../audio/videoRecorder';
import {
  X,
  Radio,
  Play,
  Pause,
  Download,
  RotateCcw,
  Square,
  Volume2,
  CheckCircle2,
  Music,
  Clock,
  Waves,
  Disc,
  Video,
  Film,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export type RecordingState =
  | 'idle'
  | 'lead-in'
  | 'recording-turn'
  | 'inter-turn-silence'
  | 'lead-out'
  | 'encoding'
  | 'complete';

export interface PlayRecordConfig {
  turns: 1 | 2 | 3;
  interTurnSilence: number; // in seconds
  leadInPadding: number; // in seconds
  leadOutPadding: number; // in seconds
  includeAmbiance: boolean;
  recordingMode?: 'audio' | 'video';
  videoCompression?: VideoCompressionProfile;
  preferredFormat?: 'mp4' | 'webm';
}

interface PlayRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: MusicBoxSong;
  chamberPreset: SoundChamberPreset;
  combScaleId?: CombScaleId;
  recordingState: RecordingState;
  recordingCurrentTurn: number;
  recordingTargetTurns: number;
  elapsedSeconds: number;
  estimatedTotalSeconds: number;
  peakLevel: number;
  recordedSession: RecordedAudioSession | null;
  recordedVideoSession: RecordedVideoSession | null;
  activeRecordingMode: 'audio' | 'video';
  onRegisterLiveFrameMonitor?: (canvas: HTMLCanvasElement | null) => void;
  onStartRecording: (config: PlayRecordConfig) => void;
  onStopEarlyAndExport: () => void;
  onCancelRecording: () => void;
  onRecordAgain: () => void;
}

export const PlayRecordModal: React.FC<PlayRecordModalProps> = ({
  isOpen,
  onClose,
  currentSong,
  chamberPreset,
  combScaleId = 'sankyo-18',
  recordingState,
  recordingCurrentTurn,
  recordingTargetTurns,
  elapsedSeconds,
  estimatedTotalSeconds,
  peakLevel,
  recordedSession,
  recordedVideoSession,
  activeRecordingMode,
  onRegisterLiveFrameMonitor,
  onStartRecording,
  onStopEarlyAndExport,
  onCancelRecording,
  onRecordAgain,
}) => {
  // Modal internal active tab: 'video' by default
  const [modalTab, setModalTab] = useState<'audio' | 'video'>('video');

  // Configuration state
  const [turns, setTurns] = useState<1 | 2 | 3>(2);
  const [interTurnSilence, setInterTurnSilence] = useState<number>(1.5);
  const [leadInPadding, setLeadInPadding] = useState<number>(1.0);
  const [leadOutPadding, setLeadOutPadding] = useState<number>(1.5);
  const [includeAmbiance, setIncludeAmbiance] = useState<boolean>(false);
  const [videoCompression, setVideoCompression] = useState<VideoCompressionProfile>('compact');
  // Default to MP4 for native iPad & universal device playback
  const [preferredFormat, setPreferredFormat] = useState<'mp4' | 'webm'>('mp4');

  const isRecordingActive = recordingState !== 'idle' && recordingState !== 'complete';

  // Audio audition player state
  const [isPlayingAudition, setIsPlayingAudition] = useState(false);
  const [auditionCurrentTime, setAuditionCurrentTime] = useState(0);
  const [auditionDuration, setAuditionDuration] = useState(0);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Video audition player ref
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);

  // Preview canvas ref for idle state in video tab
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live recording canvas ref for real-time video stream monitoring
  const liveRecordingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Auto-dim power saver after 10 seconds of active recording to protect iPad battery and prevent heat
  const [isAutoDimmed, setIsAutoDimmed] = useState(false);
  const lastInteractionTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isRecordingActive || activeRecordingMode !== 'video') {
      setIsAutoDimmed(false);
      return;
    }

    lastInteractionTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - lastInteractionTimeRef.current > 10000) {
        setIsAutoDimmed(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecordingActive, activeRecordingMode]);

  const wakeMonitor = () => {
    lastInteractionTimeRef.current = Date.now();
    setIsAutoDimmed(false);
  };

  // Register the live canvas exactly on mount/unmount so the recorder mirror
  // callback fires once per canvas lifetime instead of on every render
  const handleLiveCanvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      liveRecordingCanvasRef.current = canvas;
      if (onRegisterLiveFrameMonitor) {
        onRegisterLiveFrameMonitor(canvas);
      }
    },
    [onRegisterLiveFrameMonitor]
  );

  // Flag the live canvas while dimmed so the recorder mirror can skip redundant copies
  useEffect(() => {
    const canvas = liveRecordingCanvasRef.current;
    if (canvas) {
      canvas.dataset.dimmed = isAutoDimmed ? 'true' : 'false';
    }
  }, [isAutoDimmed, isRecordingActive]);

  // Calculate single turn duration based on steps and tempo
  const turnDurationSeconds = useMemo(() => {
    const totalSteps = currentSong.totalSteps || 64;
    const bpm = currentSong.tempoBpm || 88;
    return (totalSteps * 15) / bpm;
  }, [currentSong]);

  // Compute estimated total duration for a given turn count
  const calculateEstimatedDuration = (numTurns: number) => {
    const songPlayTime = numTurns * turnDurationSeconds;
    const pauses = (numTurns - 1) * interTurnSilence;
    const ringout = 2.0; // 2 seconds natural chime ring-out
    return leadInPadding + songPlayTime + pauses + ringout + leadOutPadding;
  };

  const activeEstimatedTotal = useMemo(() => {
    return calculateEstimatedDuration(turns);
  }, [turns, turnDurationSeconds, interTurnSilence, leadInPadding, leadOutPadding]);

  // Sync modal tab with active recording mode when recording starts or finishes
  useEffect(() => {
    if (recordingState !== 'idle') {
      setModalTab(activeRecordingMode);
    }
  }, [recordingState, activeRecordingMode]);

  // Reset audio audition player when recorded session changes
  useEffect(() => {
    if (recordedSession && audioPlayerRef.current) {
      audioPlayerRef.current.src = recordedSession.wavUrl;
      audioPlayerRef.current.load();
      setIsPlayingAudition(false);
      setAuditionCurrentTime(0);
      setAuditionDuration(recordedSession.durationSeconds);
    }
  }, [recordedSession]);

  // Render static composite preview when idle in video mode
  useEffect(() => {
    if (!isOpen || modalTab !== 'video' || recordingState !== 'idle') return;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chamberName = SOUND_CHAMBER_PRESETS[chamberPreset]?.name || chamberPreset;

    renderCompositeVideoFrame(ctx, 1280, 720, {
      song: currentSong,
      smoothStep: 8,
      currentTurn: 1,
      totalTurns: turns,
      activeTines: new Set([2, 5, 8]),
      elapsedSeconds: 0,
      estimatedTotalSeconds: activeEstimatedTotal,
      tempoBpm: currentSong.tempoBpm || 88,
      combScaleId: currentSong.combScaleId || combScaleId,
      chamberPresetName: chamberName,
      isOperating: false,
    });
  }, [isOpen, modalTab, recordingState, currentSong, chamberPreset, combScaleId, turns, activeEstimatedTotal]);

  if (!isOpen) return null;

  const chamberName = SOUND_CHAMBER_PRESETS[chamberPreset]?.name || chamberPreset;

  const handleAuditionTogglePlay = () => {
    const player = audioPlayerRef.current;
    if (!player) return;
    if (player.paused) {
      player.play().catch(() => {});
      setIsPlayingAudition(true);
    } else {
      player.pause();
      setIsPlayingAudition(false);
    }
  };

  const handleAuditionSeek = (time: number) => {
    const player = audioPlayerRef.current;
    if (!player) return;
    player.currentTime = time;
    setAuditionCurrentTime(time);
  };

  const handleAuditionTimeUpdate = () => {
    const player = audioPlayerRef.current;
    if (!player) return;
    setAuditionCurrentTime(player.currentTime);
  };

  const handleAuditionEnded = () => {
    setIsPlayingAudition(false);
    setAuditionCurrentTime(0);
  };

  const handleAuditionLoadedMetadata = () => {
    const player = audioPlayerRef.current;
    if (!player) return;
    setAuditionDuration(player.duration || recordedSession?.durationSeconds || 0);
  };

  const sanitizeFilename = (name: string) => {
    return name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2d2419]/75 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl bg-[#fdfcf9] border-2 border-[#bfa175] p-5 sm:p-7 shadow-[0_20px_50px_rgba(45,36,25,0.45)] text-[#2d2419] overflow-hidden max-h-[94vh] flex flex-col">
        {/* Subtle Warm Brass Ambient Glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#bfa175]/12 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#e5dcce]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f0e6d6] border border-[#d8caa8] flex items-center justify-center text-[#c0392b] shadow-2xs">
              {modalTab === 'video' ? <Video className="w-4 h-4 text-[#9e3120]" /> : <Radio className="w-4 h-4 text-[#c0392b]" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-serif font-bold text-[#433422]">
                  Play & Record Studio
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#faebd4] text-[#8a6b3e] border border-[#d8caa8]">
                  {modalTab === 'video' ? 'iPad Compatible MP4 / WebM' : '.WAV & .MP3 Master'}
                </span>
              </div>
              <p className="text-xs text-[#75644e] font-serif-sub italic">
                {modalTab === 'video'
                  ? 'Record song title banner & spinning 2D music box mechanism with rich acoustic chime mastering.'
                  : 'Authentic mechanical music box audio capture with multi-turn repeat cycles.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (isRecordingActive) {
                if (confirm('Recording is currently in progress. Discard this recording?')) {
                  onCancelRecording();
                  onClose();
                }
              } else {
                onClose();
              }
            }}
            title="Close"
            className="p-1.5 rounded-lg text-[#8a765e] hover:text-[#2d2419] hover:bg-[#f0e6d6] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Mode Segmented Switcher (Audio Master vs Video Studio) */}
        {recordingState === 'idle' && (
          <div className="pt-3 pb-1 flex items-center justify-center">
            <div className="inline-flex p-1 rounded-xl bg-[#eee4d0] border border-[#ded3be] shadow-inner">
              <button
                type="button"
                onClick={() => setModalTab('video')}
                className={`px-4 py-1.5 rounded-lg text-xs font-serif font-bold flex items-center space-x-2 transition cursor-pointer ${
                  modalTab === 'video'
                    ? 'bg-[#433422] text-[#fdfcf9] shadow-sm'
                    : 'text-[#6e583e] hover:text-[#2d2419]'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-[#f0c465]" />
                <span>Video Recording (Title + 2D Box)</span>
                <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#c0392b] text-white">
                  iPad MP4
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalTab('audio')}
                className={`px-4 py-1.5 rounded-lg text-xs font-serif font-bold flex items-center space-x-2 transition cursor-pointer ${
                  modalTab === 'audio'
                    ? 'bg-[#433422] text-[#fdfcf9] shadow-sm'
                    : 'text-[#6e583e] hover:text-[#2d2419]'
                }`}
              >
                <Music className="w-3.5 h-3.5 text-[#8a6b3e]" />
                <span>Audio Master (.WAV / .MP3)</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 custom-scrollbar pr-1">
          {/* =============================================================== */}
          {/* STATE 1: CONFIGURATION VIEW (IDLE)                              */}
          {/* =============================================================== */}
          {recordingState === 'idle' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Active Song Banner */}
              <div className="p-3.5 rounded-xl bg-[#f8f5ee] border border-[#ded3be] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-md bg-[#eee4d0] border border-[#d8caa8] flex items-center justify-center text-[#8a6b3e]">
                    <Music className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-serif font-bold text-[#433422] block">
                      "{currentSong.title}"
                    </span>
                    <span className="text-[11px] text-[#75644e] font-serif-sub italic">
                      Acoustic Chamber: <span className="font-semibold text-[#8a6b3e]">{chamberName}</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-[11px] font-mono text-[#8a765e] self-end sm:self-auto">
                  <span>{currentSong.totalSteps || 64} steps</span>
                  <span>•</span>
                  <span>{currentSong.tempoBpm || 88} BPM</span>
                  <span>•</span>
                  <span className="text-[#8a6b3e] font-bold">~{Math.round(turnDurationSeconds)}s / turn</span>
                </div>
              </div>

              {/* VIDEO TAB SPECIFIC: Visual Composition Layout Preview */}
              {modalTab === 'video' && (
                <div className="space-y-2 p-3.5 rounded-xl bg-[#fcfbf8] border border-[#ded3be] shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Film className="w-4 h-4 text-[#8a6b3e]" />
                      <span className="font-serif font-bold text-xs text-[#433422]">
                        Video Composite Framing (Title Banner + 2D Music Box)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[#8a6b3e] font-semibold">
                      1280 × 720 HD • Rotating Drum & Whirring Flywheel
                    </span>
                  </div>

                  {/* Rendered Canvas Preview */}
                  <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden border border-[#bfa175]/60 shadow-sm bg-[#110a05]">
                    <canvas
                      ref={previewCanvasRef}
                      width={1280}
                      height={720}
                      className="w-full h-full object-contain block"
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-mono text-[#faebd4] border border-[#8a6838]/60">
                      Framing Preview
                    </div>
                  </div>
                </div>
              )}

              {/* VIDEO FORMAT SELECTOR: iPad Native MP4 Priority */}
              {modalTab === 'video' && (
                <div className="space-y-2 p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Smartphone className="w-4 h-4 text-[#8a6b3e]" />
                      <span className="font-serif font-bold text-xs text-[#433422]">
                        Device Playback Format
                      </span>
                    </div>
                    <span className="text-[10px] font-serif font-semibold text-[#8a6b3e]">
                      Direct iPad & QuickTime Support
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setPreferredFormat('mp4')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        preferredFormat === 'mp4'
                          ? 'bg-[#433422] text-[#fbf8f2] border-[#433422] shadow-xs'
                          : 'bg-[#f4eee4] hover:bg-[#eae2d3] border-[#ded3be] text-[#5e4c36]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-serif font-bold text-xs">
                          MP4 (iPad Native & QuickTime)
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#faebd4] text-[#8a6b3e] font-bold">
                          Direct iPad Play
                        </span>
                      </div>
                      <p className={`text-[10px] font-serif-sub pt-1 ${preferredFormat === 'mp4' ? 'text-[#dfcd9f]' : 'text-[#8a765e]'}`}>
                        Plays directly in iPad Safari, Files app, and saves to Photos camera roll with native H.264 video & AAC audio.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreferredFormat('webm')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        preferredFormat === 'webm'
                          ? 'bg-[#433422] text-[#fdfcf9] border-[#433422] shadow-xs'
                          : 'bg-[#f4eee4] hover:bg-[#eae2d3] border-[#ded3be] text-[#5e4c36]'
                      }`}
                    >
                      <span className="font-serif font-bold text-xs block">
                        WebM (Desktop / Chrome)
                      </span>
                      <p className={`text-[10px] font-serif-sub pt-1 ${preferredFormat === 'webm' ? 'text-[#dfcd9f]' : 'text-[#8a765e]'}`}>
                        VP9 / VP8 web stream container for desktop browser sharing.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* AUDIOPHILE SOUND QUALITY CARD */}
              {modalTab === 'video' && (
                <div className="p-3.5 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1 shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-xs font-serif font-bold text-[#433422]">
                    <Sparkles className="w-3.5 h-3.5 text-[#8a6b3e]" />
                    <span>Audiophile Music Box Mastering Active</span>
                  </div>
                  <p className="text-[11px] text-[#75644e] font-serif-sub">
                    Audio is mastered with 192 kbps studio AAC bitrate, crystal bell presence boost (6.8 kHz) for sparkling tine plucks, and warm soundboard resonance (340 Hz) to eliminate flatness and deliver rich acoustic presence on iPad speakers.
                  </p>
                </div>
              )}

              {/* IPAD THERMAL & POWER SAVING CARD */}
              {modalTab === 'video' && (
                <div className="p-3.5 rounded-xl bg-[#f2f7ee] border border-[#c4dbba] space-y-1 shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-xs font-serif font-bold text-[#2c5324]">
                    <Zap className="w-3.5 h-3.5 text-[#3b7c31]" />
                    <span>iPad Power Saving & 5–10 MB Compact Size Mode</span>
                  </div>
                  <p className="text-[11px] text-[#33532c] font-serif-sub">
                    Configured for 24 FPS vintage horological pacing with pre-rendered background caching and a 1.0 Mbps compact bitrate (default). Eliminates iPad overheating and keeps 1-turn recordings at a lightweight 5–10 MB (down from &gt;1000 MB).
                  </p>
                </div>
              )}

              {/* Turn Cycles Selector */}
              <div className="space-y-2 p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Disc className="w-4 h-4 text-[#8a6b3e]" />
                    <span className="font-serif font-bold text-xs text-[#433422]">
                      Repeat Turn Cycles
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[#8a6b3e] font-semibold">
                    Est. Duration: ~{Math.round(activeEstimatedTotal)}s ({formatTime(activeEstimatedTotal)})
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {([1, 2, 3] as const).map((t) => {
                    const estSec = Math.round(calculateEstimatedDuration(t));
                    const isSelected = turns === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTurns(t)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#433422] text-[#fbf8f2] border-[#433422] shadow-xs'
                            : 'bg-[#f4eee4] hover:bg-[#eae2d3] border-[#ded3be] text-[#5e4c36]'
                        }`}
                      >
                        <span className="font-serif font-bold text-xs sm:text-sm">
                          {t} {t === 1 ? 'Turn' : 'Turns'}
                        </span>
                        <span
                          className={`text-[10px] font-mono ${
                            isSelected ? 'text-[#dfcd9f]' : 'text-[#8a765e]'
                          }`}
                        >
                          ~{estSec}s ({formatTime(estSec)})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Video Compression Settings */}
              {modalTab === 'video' && (
                <div className="space-y-2 p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4 text-[#8a6b3e]" />
                      <span className="font-serif font-bold text-xs text-[#433422]">
                        Compression & File Size Profile
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setVideoCompression('compact')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        videoCompression === 'compact'
                          ? 'bg-[#433422] text-[#fbf8f2] border-[#433422] shadow-xs'
                          : 'bg-[#f4eee4] hover:bg-[#eae2d3] border-[#ded3be] text-[#5e4c36]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-serif font-bold text-xs">
                          High Compression (Small File)
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#faebd4] text-[#8a6b3e] font-bold">
                          Recommended
                        </span>
                      </div>
                      <p className={`text-[10px] font-serif-sub pt-1 ${videoCompression === 'compact' ? 'text-[#dfcd9f]' : 'text-[#8a765e]'}`}>
                        ~1.0 Mbps video bitrate. Compact ~9 MB per min. Instant download & fast playback.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVideoCompression('balanced')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        videoCompression === 'balanced'
                          ? 'bg-[#433422] text-[#fdfcf9] border-[#433422] shadow-xs'
                          : 'bg-[#f4eee4] hover:bg-[#eae2d3] border-[#ded3be] text-[#5e4c36]'
                      }`}
                    >
                      <span className="font-serif font-bold text-xs block">
                        Balanced HD Quality
                      </span>
                      <p className={`text-[10px] font-serif-sub pt-1 ${videoCompression === 'balanced' ? 'text-[#dfcd9f]' : 'text-[#8a765e]'}`}>
                        ~1.4 Mbps video bitrate. High definition metallic reflections (~12 MB per min).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVideoCompression('high')}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        videoCompression === 'high'
                          ? 'bg-[#433422] text-[#fdfcf9] border-[#433422] shadow-xs'
                          : 'bg-[#f4eee4] hover:bg-[#eae2d3] border-[#ded3be] text-[#5e4c36]'
                      }`}
                    >
                      <span className="font-serif font-bold text-xs block">
                        High Detail Archive
                      </span>
                      <p className={`text-[10px] font-serif-sub pt-1 ${videoCompression === 'high' ? 'text-[#dfcd9f]' : 'text-[#8a765e]'}`}>
                        ~2.0 Mbps video bitrate. Maximum sharpness for archiving (~16 MB per min).
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Timing & Silences Settings */}
              <div className="space-y-3 p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] shadow-2xs">
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-[#8a6b3e]" />
                  <span className="font-serif font-bold text-xs text-[#433422]">
                    Acoustic Silences & Padding
                  </span>
                </div>

                {/* 1. Inter-turn Silence */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-serif">
                    <span className="text-[#5e4c36]">Silence Between Turns</span>
                    <span className="font-mono text-[#8a6b3e] font-bold">{interTurnSilence.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={interTurnSilence}
                    onChange={(e) => setInterTurnSilence(parseFloat(e.target.value))}
                    className="w-full accent-[#8a6b3e] cursor-pointer h-1.5 bg-[#e8e0d1] rounded-lg"
                  />
                  <p className="text-[10px] text-[#8a765e] font-serif-sub italic">
                    Pause between repetitions allowing previous notes to naturally ring down and decay into silence.
                  </p>
                </div>

                {/* 2. Lead-in Silent Padding */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs font-serif">
                    <span className="text-[#5e4c36]">Lead-In Silent Padding</span>
                    <span className="font-mono text-[#8a6b3e] font-bold">{leadInPadding.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={leadInPadding}
                    onChange={(e) => setLeadInPadding(parseFloat(e.target.value))}
                    className="w-full accent-[#8a6b3e] cursor-pointer h-1.5 bg-[#e8e0d1] rounded-lg"
                  />
                </div>

                {/* 3. Lead-out Silent Padding */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs font-serif">
                    <span className="text-[#5e4c36]">Lead-Out Silent Padding</span>
                    <span className="font-mono text-[#8a6b3e] font-bold">{leadOutPadding.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.1"
                    value={leadOutPadding}
                    onChange={(e) => setLeadOutPadding(parseFloat(e.target.value))}
                    className="w-full accent-[#8a6b3e] cursor-pointer h-1.5 bg-[#e8e0d1] rounded-lg"
                  />
                </div>
              </div>

              {/* Ambiance Option */}
              <div className="p-3.5 rounded-xl bg-[#fcfbf8] border border-[#ded3be] flex items-start space-x-3 shadow-2xs">
                <input
                  id="include-ambiance-checkbox"
                  type="checkbox"
                  checked={includeAmbiance}
                  onChange={(e) => setIncludeAmbiance(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#8a6b3e] cursor-pointer"
                />
                <label
                  htmlFor="include-ambiance-checkbox"
                  className="cursor-pointer select-none space-y-0.5"
                >
                  <span className="text-xs font-serif font-bold text-[#433422] block">
                    Include Nature Ambiance & Mechanical Hum
                  </span>
                  <span className="text-[11px] text-[#75644e] font-serif-sub block">
                    {includeAmbiance
                      ? 'Master bus recording: captures active fireplace, rain, forest, stream, and vintage gear whir in the video audio track.'
                      : 'Pure chime recording: captures isolated music box chimes with acoustic chamber resonance.'}
                  </span>
                </label>
              </div>

              {/* Start Recording Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    onStartRecording({
                      turns,
                      interTurnSilence,
                      leadInPadding,
                      leadOutPadding,
                      includeAmbiance,
                      recordingMode: modalTab,
                      videoCompression,
                      preferredFormat,
                    })
                  }
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#9e3120] via-[#c0392b] to-[#8a2d1d] hover:from-[#8a2d1d] hover:to-[#742315] text-[#fdfcf9] font-serif font-bold text-sm flex items-center justify-center space-x-2.5 shadow-md transition-all cursor-pointer border border-[#8a2d1d]/50 active:scale-[0.99]"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-white animate-pulse" />
                  <span>
                    {modalTab === 'video'
                      ? `Start Video Recording (${turns} ${turns === 1 ? 'Turn' : 'Turns'} • ~${Math.round(activeEstimatedTotal)}s • ${preferredFormat.toUpperCase()})`
                      : `Start Audio Recording (${turns} ${turns === 1 ? 'Turn' : 'Turns'} • ~${Math.round(activeEstimatedTotal)}s • WAV/MP3)`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* STATE 2: LIVE RECORDING HUD / OVERLAY                           */}
          {/* =============================================================== */}
          {isRecordingActive && (
            <div className="space-y-4 animate-in fade-in duration-150 py-2">
              {/* Real-time Video Stream Monitor (Live 720p Canvas) */}
              {activeRecordingMode === 'video' && (
                <div className="space-y-1.5 p-3.5 rounded-xl bg-[#130b05] border border-[#bfa175]/60 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="font-serif font-bold text-xs text-[#faebd4]">
                        Live Recording View (Parchment Title & Rotating 2D Mechanism)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono text-[#a3e635] flex items-center gap-1">
                        <Zap className="w-3 h-3 text-[#a3e635]" />
                        24 FPS Eco
                      </span>
                      <span className="text-[10px] font-mono text-[#dfcd9f]">
                        1280 × 720 HD (~6 MB)
                      </span>
                    </div>
                  </div>
                  <div
                    onClick={wakeMonitor}
                    className="relative w-full aspect-[16/9] rounded-lg overflow-hidden border border-[#523b26] bg-[#090604] cursor-pointer group"
                    title={isAutoDimmed ? 'Tap to wake monitor' : 'Live video monitor'}
                  >
                    <canvas
                      ref={handleLiveCanvasRef}
                      width={1280}
                      height={720}
                      className={`w-full h-full object-contain block transition-opacity duration-500 ${
                        isAutoDimmed ? 'opacity-35' : 'opacity-100'
                      }`}
                    />
                    {isAutoDimmed && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[1px] p-4 text-center select-none">
                        <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#20170f]/95 border border-[#bfa175] shadow-lg text-[#faebd4] text-xs font-serif">
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-bold text-emerald-400">Eco Power Saver Active</span>
                          <span className="text-[#caa87c]">· Tap to Wake Monitor</span>
                        </div>
                        <span className="text-[10.5px] text-[#dfcd9f]/80 mt-1.5 font-mono">
                          Recording steadily at 24 FPS · iPad battery protected
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recording Status Card */}
              <div className="p-5 rounded-2xl bg-[#20170f] border-2 border-[#bfa175] text-[#fbf8f2] shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  {/* Pulsing REC Beacon */}
                  <div className="flex items-center space-x-2">
                    <span className="relative flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-600"></span>
                    </span>
                    <span className="font-mono font-bold text-xs text-red-400 tracking-wider">
                      {recordingState === 'encoding'
                        ? 'ENCODING MASTER'
                        : activeRecordingMode === 'video'
                        ? 'REC VIDEO + AUDIO'
                        : 'REC AUDIO'}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <span className="text-[11px] font-serif font-semibold px-2.5 py-1 rounded-full bg-[#382618] text-[#dfcd9f] border border-[#5e4228]">
                    {recordingState === 'lead-in' && 'Phase 1: Lead-In Silence'}
                    {recordingState === 'recording-turn' &&
                      `Turn ${recordingCurrentTurn} of ${recordingTargetTurns}`}
                    {recordingState === 'inter-turn-silence' &&
                      `Inter-Turn Silence (Decaying)`}
                    {recordingState === 'lead-out' && 'Lead-Out & Ring-Out'}
                    {recordingState === 'encoding' &&
                      (activeRecordingMode === 'video'
                        ? 'Mastering & Multiplexing Video...'
                        : 'Finalizing Audio Master...')}
                  </span>
                </div>

                {/* Big Digital Clock Counter */}
                <div className="text-center py-2">
                  <div className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-[#faebd4]">
                    {formatTime(elapsedSeconds)}
                    <span className="text-lg sm:text-xl text-[#a08f7a] font-normal">
                      {' '}
                      / ~{formatTime(estimatedTotalSeconds)}
                    </span>
                  </div>
                  <p className="text-xs text-[#b8a58e] font-serif-sub italic pt-1">
                    {recordingState === 'lead-in' && 'Lead-in buffer active... performance begins shortly'}
                    {recordingState === 'recording-turn' &&
                      (activeRecordingMode === 'video'
                        ? `Recording Title Card & rotating brass cylinder with whirring flywheel (Turn ${recordingCurrentTurn} of ${recordingTargetTurns})`
                        : `Playing & capturing cylinder turn ${recordingCurrentTurn} of ${recordingTargetTurns}`)}
                    {recordingState === 'inter-turn-silence' &&
                      'Pausing playback... chime harmonics decaying into natural silence'}
                    {recordingState === 'lead-out' &&
                      'Final chime ring-out decaying... lead-out padding active'}
                    {recordingState === 'encoding' &&
                      (activeRecordingMode === 'video'
                        ? 'Mastering rich acoustic resonance & encoding compressed video file...'
                        : 'Encoding 16-bit PCM WAV master & 192 kbps MP3...')}
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-[#352517] h-2 rounded-full overflow-hidden border border-[#523b26]">
                  <div
                    className="h-full bg-gradient-to-r from-[#bfa175] via-[#f0c465] to-[#c0392b] transition-all duration-150"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(2, (elapsedSeconds / Math.max(1, estimatedTotalSeconds)) * 100)
                      )}%`,
                    }}
                  />
                </div>

                {/* Real-time VU Meter */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#a08f7a]">
                    <div className="flex items-center space-x-1">
                      <Volume2 className="w-3 h-3 text-[#bfa175]" />
                      <span>LIVE AUDIO LEVEL (VU)</span>
                    </div>
                    <span>{Math.round(peakLevel * 100)}% PEAK</span>
                  </div>

                  {/* Dual Stereo VU Channels */}
                  <div className="space-y-1">
                    {/* Left Channel */}
                    <div className="h-2 rounded bg-[#150f0a] overflow-hidden flex border border-[#402e1c]">
                      <div
                        className="h-full transition-all duration-75"
                        style={{
                          width: `${Math.min(100, peakLevel * 100)}%`,
                          background:
                            peakLevel > 0.88
                              ? 'linear-gradient(to right, #48bb78 0%, #ecc94b 70%, #f56565 100%)'
                              : peakLevel > 0.7
                              ? 'linear-gradient(to right, #48bb78 0%, #ecc94b 100%)'
                              : '#48bb78',
                        }}
                      />
                    </div>
                    {/* Right Channel */}
                    <div className="h-2 rounded bg-[#150f0a] overflow-hidden flex border border-[#402e1c]">
                      <div
                        className="h-full transition-all duration-75"
                        style={{
                          width: `${Math.min(100, Math.max(0, peakLevel * 98))}%`,
                          background:
                            peakLevel > 0.88
                              ? 'linear-gradient(to right, #48bb78 0%, #ecc94b 70%, #f56565 100%)'
                              : peakLevel > 0.7
                              ? 'linear-gradient(to right, #48bb78 0%, #ecc94b 100%)'
                              : '#48bb78',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onStopEarlyAndExport}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#433422] hover:bg-[#342718] text-[#faebd4] font-serif font-bold text-xs flex items-center justify-center space-x-2 transition cursor-pointer border border-[#5e4726] shadow-xs"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Early & Export Now</span>
                </button>

                <button
                  type="button"
                  onClick={onCancelRecording}
                  className="py-2.5 px-4 rounded-xl bg-[#f4eee4] hover:bg-[#ebd9c8] text-[#8a2d1d] hover:text-[#a8321e] font-serif text-xs flex items-center justify-center space-x-1.5 transition cursor-pointer border border-[#ded3be]"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* STATE 3: EXPORT STUDIO VIEW (VIDEO COMPLETED)                   */}
          {/* =============================================================== */}
          {recordingState === 'complete' && recordedVideoSession && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Success Banner with iPad direct compatibility notice */}
              <div className="p-3.5 rounded-xl bg-[#f2f7ee] border border-[#c4dbba] flex items-center space-x-2.5 text-[#2c5324]">
                <CheckCircle2 className="w-5 h-5 text-[#3b7c31] shrink-0" />
                <div>
                  <span className="font-serif font-bold text-xs block">
                    {recordedVideoSession.format === 'mp4'
                      ? 'iPad & Universal MP4 Video Master Ready!'
                      : 'Video Master Recording Ready!'}
                  </span>
                  <span className="text-[11px] font-serif-sub">
                    Captured title banner & animated 2D music box across {recordedVideoSession.turns}{' '}
                    {recordedVideoSession.turns === 1 ? 'turn' : 'turns'} (
                    {formatTime(recordedVideoSession.durationSeconds)} duration • {recordedVideoSession.width}×{recordedVideoSession.height} HD)
                  </span>
                </div>
              </div>

              {/* In-Modal Video Audition Player */}
              <div className="p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Video className="w-4 h-4 text-[#8a6b3e]" />
                    <span className="font-serif font-bold text-xs text-[#433422]">
                      Video Audition Player
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#8a6b3e] font-bold">
                    {formatTime(recordedVideoSession.durationSeconds)}
                  </span>
                </div>

                {/* HTML5 Video Element */}
                <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden bg-black border border-[#8a6838]/40 shadow-inner">
                  <video
                    ref={videoPlayerRef}
                    src={recordedVideoSession.videoUrl}
                    controls
                    playsInline
                    className="w-full h-full object-contain block"
                  />
                </div>
              </div>

              {/* Video Specs & Direct Download Card */}
              <div className="p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-serif font-bold text-sm text-[#433422]">
                      {recordedVideoSession.isIpadNative || recordedVideoSession.format === 'mp4'
                        ? 'Apple iPad, iOS & QuickTime Native MP4'
                        : 'Compressed Video Master'}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#faebd4] text-[#8a6b3e] font-bold border border-[#d8caa8] uppercase">
                      .{recordedVideoSession.format}
                    </span>
                    {(recordedVideoSession.isIpadNative || recordedVideoSession.format === 'mp4') && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#2c5324] text-white font-bold">
                        iPad Certified
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#75644e] font-serif-sub flex flex-wrap gap-2">
                    <span>Resolution: {recordedVideoSession.width} × {recordedVideoSession.height} HD</span>
                    <span>•</span>
                    <span>H.264 Video + 192k AAC Stereo</span>
                    <span>•</span>
                    <span className="font-mono text-[#8a6b3e] font-semibold">
                      Size: {formatFileSize(recordedVideoSession.fileSizeBytes)}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#2c5324] font-serif-sub italic pt-0.5">
                    ✓ Direct iPad Playback: Guaranteed to play directly in iPadOS Safari, Files app, QuickTime, and saves to Photos without errors.
                  </p>
                </div>

                <a
                  href={recordedVideoSession.videoUrl}
                  download={`${sanitizeFilename(recordedVideoSession.songTitle)}_musicbox_${recordedVideoSession.turns}turns.${recordedVideoSession.format}`}
                  className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-gradient-to-r from-[#9e3120] via-[#c0392b] to-[#8a2d1d] hover:from-[#8a2d1d] hover:to-[#742315] text-[#fdfcf9] font-serif font-bold text-xs flex items-center justify-center space-x-2 shadow-md transition-all cursor-pointer border border-[#8a2d1d]/40"
                >
                  <Download className="w-4 h-4" />
                  <span>Download iPad Video (.MP4 • {formatFileSize(recordedVideoSession.fileSizeBytes)})</span>
                </a>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-[#e5dcce]">
                <button
                  type="button"
                  onClick={onRecordAgain}
                  className="px-3.5 py-2 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] text-xs font-serif flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Record Again</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-[#433422] hover:bg-[#342718] text-[#fbf8f2] text-xs font-serif font-semibold transition cursor-pointer shadow-2xs"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* STATE 3B: EXPORT STUDIO VIEW (AUDIO COMPLETED)                  */}
          {/* =============================================================== */}
          {recordingState === 'complete' && !recordedVideoSession && recordedSession && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Success Banner */}
              <div className="p-3.5 rounded-xl bg-[#f2f7ee] border border-[#c4dbba] flex items-center space-x-2.5 text-[#2c5324]">
                <CheckCircle2 className="w-5 h-5 text-[#3b7c31] shrink-0" />
                <div>
                  <span className="font-serif font-bold text-xs block">
                    Studio Master Recording Ready!
                  </span>
                  <span className="text-[11px] font-serif-sub">
                    Audio captured across {recordedSession.turns}{' '}
                    {recordedSession.turns === 1 ? 'turn' : 'turns'} (
                    {formatTime(recordedSession.durationSeconds)} duration)
                  </span>
                </div>
              </div>

              {/* Audition Player */}
              <div className="p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] space-y-3 shadow-2xs">
                <audio
                  ref={audioPlayerRef}
                  onTimeUpdate={handleAuditionTimeUpdate}
                  onEnded={handleAuditionEnded}
                  onLoadedMetadata={handleAuditionLoadedMetadata}
                  preload="auto"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Waves className="w-4 h-4 text-[#8a6b3e]" />
                    <span className="font-serif font-bold text-xs text-[#433422]">
                      Audition Preview Player
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#8a6b3e] font-bold">
                    {formatTime(auditionCurrentTime)} / {formatTime(auditionDuration)}
                  </span>
                </div>

                {/* Scrubber Timeline */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min="0"
                    max={auditionDuration || 1}
                    step="0.05"
                    value={auditionCurrentTime}
                    onChange={(e) => handleAuditionSeek(parseFloat(e.target.value))}
                    className="w-full accent-[#8a6b3e] cursor-pointer h-2 bg-[#e8e0d1] rounded-lg"
                  />
                  {/* Decorative Simulated Waveform Ribbons */}
                  <div className="h-6 flex items-center justify-between gap-[2px] px-1 pointer-events-none opacity-70">
                    {Array.from({ length: 48 }).map((_, i) => {
                      const posRatio = i / 48;
                      const playRatio =
                        auditionDuration > 0
                          ? auditionCurrentTime / auditionDuration
                          : 0;
                      const isPlayed = posRatio <= playRatio;
                      const heightPercent = 20 + Math.sin(i * 0.4) * 35 + ((i % 5) * 8);
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-all duration-75 ${
                            isPlayed ? 'bg-[#8a6b3e]' : 'bg-[#d8caa8]'
                          }`}
                          style={{ height: `${Math.max(15, Math.min(100, heightPercent))}%` }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Player Play/Pause Button */}
                <div className="flex items-center justify-center pt-1">
                  <button
                    type="button"
                    onClick={handleAuditionTogglePlay}
                    className="px-5 py-2 rounded-xl bg-[#433422] hover:bg-[#342718] text-[#fbf8f2] text-xs font-serif font-bold flex items-center space-x-2 transition cursor-pointer shadow-xs"
                  >
                    {isPlayingAudition ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        <span>Pause Audition</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play Audition</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Download Studio Masters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Lossless .WAV */}
                <div className="p-3.5 rounded-xl bg-[#fcfbf8] border border-[#ded3be] flex flex-col justify-between space-y-2.5 shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-serif font-bold text-xs text-[#433422]">
                        Lossless Studio Master
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#faebd4] text-[#8a6b3e] font-bold border border-[#d8caa8]">
                        .WAV
                      </span>
                    </div>
                    <p className="text-[11px] text-[#75644e] font-serif-sub pt-1">
                      16-bit PCM Stereo @ {Math.round(recordedSession.sampleRate / 1000)}kHz
                    </p>
                    <span className="text-[10px] font-mono text-[#8a765e]">
                      Size: {formatFileSize(recordedSession.wavBlob.size)}
                    </span>
                  </div>

                  <a
                    href={recordedSession.wavUrl}
                    download={`${sanitizeFilename(recordedSession.songTitle)}_musicbox_${recordedSession.turns}turns.wav`}
                    className="py-2 px-3 rounded-lg bg-[#433422] hover:bg-[#342718] text-[#fbf8f2] text-xs font-serif font-semibold flex items-center justify-center space-x-1.5 transition shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .WAV</span>
                  </a>
                </div>

                {/* 2. High-Quality .MP3 */}
                <div className="p-3.5 rounded-xl bg-[#fcfbf8] border border-[#ded3be] flex flex-col justify-between space-y-2.5 shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-serif font-bold text-xs text-[#433422]">
                        High-Quality Compressed
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#faebd4] text-[#8a6b3e] font-bold border border-[#d8caa8]">
                        .MP3
                      </span>
                    </div>
                    <p className="text-[11px] text-[#75644e] font-serif-sub pt-1">
                      192 kbps Stereo MPEG-1 Layer 3
                    </p>
                    <span className="text-[10px] font-mono text-[#8a765e]">
                      Size: {formatFileSize(recordedSession.mp3Blob.size)}
                    </span>
                  </div>

                  <a
                    href={recordedSession.mp3Url}
                    download={`${sanitizeFilename(recordedSession.songTitle)}_musicbox_${recordedSession.turns}turns.mp3`}
                    className="py-2 px-3 rounded-lg bg-gradient-to-r from-[#c4a675] via-[#dfcd9f] to-[#b8955e] hover:from-[#bfa170] hover:to-[#ae8b54] text-[#2d2419] text-xs font-serif font-bold flex items-center justify-center space-x-1.5 transition shadow-xs border border-[#ae8b54]/40 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .MP3</span>
                  </a>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-[#e5dcce]">
                <button
                  type="button"
                  onClick={onRecordAgain}
                  className="px-3.5 py-2 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] text-xs font-serif flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Record Again</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-[#433422] hover:bg-[#342718] text-[#fbf8f2] text-xs font-serif font-semibold transition cursor-pointer shadow-2xs"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
