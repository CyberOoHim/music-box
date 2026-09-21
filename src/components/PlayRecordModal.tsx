import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MusicBoxSong, SoundChamberPreset, SOUND_CHAMBER_PRESETS } from '../types';
import { RecordedAudioSession, formatTime, formatFileSize } from '../audio/audioRecorder';
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
  Sparkles,
  Music,
  Sliders,
  Clock,
  Waves,
  ShieldCheck,
  Disc,
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
}

interface PlayRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: MusicBoxSong;
  chamberPreset: SoundChamberPreset;
  recordingState: RecordingState;
  recordingCurrentTurn: number;
  recordingTargetTurns: number;
  elapsedSeconds: number;
  estimatedTotalSeconds: number;
  peakLevel: number;
  recordedSession: RecordedAudioSession | null;
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
  recordingState,
  recordingCurrentTurn,
  recordingTargetTurns,
  elapsedSeconds,
  estimatedTotalSeconds,
  peakLevel,
  recordedSession,
  onStartRecording,
  onStopEarlyAndExport,
  onCancelRecording,
  onRecordAgain,
}) => {
  // Configuration state
  const [turns, setTurns] = useState<1 | 2 | 3>(2);
  const [interTurnSilence, setInterTurnSilence] = useState<number>(1.5);
  const [leadInPadding, setLeadInPadding] = useState<number>(1.0);
  const [leadOutPadding, setLeadOutPadding] = useState<number>(1.5);
  const [includeAmbiance, setIncludeAmbiance] = useState<boolean>(false);

  // Audition player state
  const [isPlayingAudition, setIsPlayingAudition] = useState(false);
  const [auditionCurrentTime, setAuditionCurrentTime] = useState(0);
  const [auditionDuration, setAuditionDuration] = useState(0);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

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

  // Reset audition player when recorded session changes
  useEffect(() => {
    if (recordedSession && audioPlayerRef.current) {
      audioPlayerRef.current.src = recordedSession.wavUrl;
      audioPlayerRef.current.load();
      setIsPlayingAudition(false);
      setAuditionCurrentTime(0);
      setAuditionDuration(recordedSession.durationSeconds);
    }
  }, [recordedSession]);

  if (!isOpen) return null;

  const chamberName =
    SOUND_CHAMBER_PRESETS[chamberPreset]?.name || chamberPreset;

  const isRecordingActive =
    recordingState !== 'idle' && recordingState !== 'complete';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2d2419]/70 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#fdfcf9] border-2 border-[#bfa175] p-5 sm:p-7 shadow-[0_20px_50px_rgba(45,36,25,0.4)] text-[#2d2419] overflow-hidden max-h-[92vh] flex flex-col">
        {/* Subtle Warm Brass Ambient Glow */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#bfa175]/12 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e5dcce]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f0e6d6] border border-[#d8caa8] flex items-center justify-center text-[#c0392b] shadow-2xs">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-serif font-bold text-[#433422]">
                  Play & Record Studio
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#faebd4] text-[#8a6b3e] border border-[#d8caa8]">
                  .WAV & .MP3
                </span>
              </div>
              <p className="text-xs text-[#75644e] font-serif-sub italic">
                Authentic mechanical music box audio capture with multi-turn repeat cycles.
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 custom-scrollbar pr-1">
          {/* =============================================================== */}
          {/* STATE 1: CONFIGURATION VIEW                                    */}
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
                  <p className="text-[10px] text-[#8a765e] font-serif-sub italic">
                    Silent headroom before the cylinder begins rotating and plucking notes.
                  </p>
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
                  <p className="text-[10px] text-[#8a765e] font-serif-sub italic">
                    Silent padding after 2.0s chime ring-out so audio fades gracefully to zero.
                  </p>
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
                      ? 'Master bus recording: captures active fireplace, rain, forest, stream, and vintage gear whir.'
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
                    })
                  }
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#9e3120] via-[#c0392b] to-[#8a2d1d] hover:from-[#8a2d1d] hover:to-[#742315] text-[#fdfcf9] font-serif font-bold text-sm flex items-center justify-center space-x-2 shadow-md transition-all cursor-pointer border border-[#8a2d1d]/50 active:scale-[0.99]"
                >
                  <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                  <span>Start Play & Record ({turns} {turns === 1 ? 'Turn' : 'Turns'} • ~{Math.round(activeEstimatedTotal)}s)</span>
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* STATE 2: LIVE RECORDING HUD / OVERLAY                           */}
          {/* =============================================================== */}
          {isRecordingActive && (
            <div className="space-y-4 animate-in fade-in duration-150 py-2">
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
                      {recordingState === 'encoding' ? 'ENCODING' : 'REC'}
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
                    {recordingState === 'encoding' && 'Finalizing Audio Master'}
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
                    {recordingState === 'lead-in' && 'Lead-in silent buffer active... music starts shortly'}
                    {recordingState === 'recording-turn' &&
                      `Playing & capturing cylinder turn ${recordingCurrentTurn} of ${recordingTargetTurns}`}
                    {recordingState === 'inter-turn-silence' &&
                      'Pausing playback... chime harmonics decaying into natural silence'}
                    {recordingState === 'lead-out' &&
                      'Final chime ring-out decaying... lead-out padding active'}
                    {recordingState === 'encoding' &&
                      'Encoding 16-bit PCM WAV master & 192 kbps MP3...'}
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
          {/* STATE 3: EXPORT STUDIO VIEW                                    */}
          {/* =============================================================== */}
          {recordingState === 'complete' && recordedSession && (
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
