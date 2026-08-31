import React, { useState, useEffect, useRef } from 'react';
import { NatureAmbienceSettings, SoundChamberPreset, SOUND_CHAMBER_PRESETS } from '../types';
import { musicBoxAudio } from '../audio/musicBoxAudio';
import {
  CloudRain,
  Flame,
  Trees,
  Bell,
  Waves,
  Volume2,
  Sparkles,
  Activity,
  Music,
  Sliders,
  Play,
  RotateCcw,
  Radio,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface NatureAmbianceMixerProps {
  settings: NatureAmbienceSettings;
  onChangeSettings: (settings: NatureAmbienceSettings) => void;
  soundPreset: SoundChamberPreset;
  onChangeSoundPreset: (preset: SoundChamberPreset) => void;
  masterVolume: number;
  onChangeMasterVolume: (vol: number) => void;
  isPlaying?: boolean;
}

export const NatureAmbianceMixer: React.FC<NatureAmbianceMixerProps> = React.memo(({
  settings,
  onChangeSettings,
  soundPreset,
  onChangeSoundPreset,
  masterVolume,
  onChangeMasterVolume,
  isPlaying = false,
}) => {
  const [resonanceDepth, setResonanceDepth] = useState(1.0);
  const [reverbAmount, setReverbAmount] = useState(1.0);
  const [visualizerMode, setVisualizerMode] = useState<'wave' | 'spectrum' | 'impulse'>('wave');
  const [auditioningPreset, setAuditioningPreset] = useState<SoundChamberPreset | null>(null);
  const [isComparingAll, setIsComparingAll] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const compareTimeoutsRef = useRef<number[]>([]);
  const renderTriggerRef = useRef<(() => void) | null>(null);

  const activePresetInfo = SOUND_CHAMBER_PRESETS[soundPreset];

  const clearAllCompareTimeouts = () => {
    compareTimeoutsRef.current.forEach((id) => clearTimeout(id));
    compareTimeoutsRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearAllCompareTimeouts();
    };
  }, []);

  const wakeVisualizer = () => {
    if (renderTriggerRef.current) {
      renderTriggerRef.current();
    }
  };

  // Handle Chamber Resonance Depth adjustment
  const handleResonanceChange = (val: number) => {
    setResonanceDepth(val);
    musicBoxAudio.setChamberResonance(val);
    wakeVisualizer();
  };

  // Handle Chamber Reverb Amount adjustment
  const handleReverbChange = (val: number) => {
    setReverbAmount(val);
    musicBoxAudio.setChamberReverb(val);
    wakeVisualizer();
  };

  // Handle single preset audition
  const handleAudition = (presetKey: SoundChamberPreset) => {
    clearAllCompareTimeouts();
    setIsComparingAll(false);
    setAuditioningPreset(presetKey);
    onChangeSoundPreset(presetKey);
    musicBoxAudio.playAuditionChime(presetKey);
    wakeVisualizer();

    const t = window.setTimeout(() => {
      setAuditioningPreset(null);
    }, 1800);
    compareTimeoutsRef.current.push(t);
  };

  // Compare all 5 chambers sequentially with 2.2s delay between each
  const handleCompareAll = () => {
    if (isComparingAll) return;
    clearAllCompareTimeouts();
    setIsComparingAll(true);
    wakeVisualizer();

    const presets: SoundChamberPreset[] = [
      'gold-sankyo',
      'wooden-box',
      'crystal-bell',
      'vintage-antique',
      'retro-8bit',
      'kalimba-mbira',
      'cathedral-bell',
      'fm-digital',
    ];

    presets.forEach((presetKey, idx) => {
      const t = window.setTimeout(() => {
        setAuditioningPreset(presetKey);
        onChangeSoundPreset(presetKey);
        musicBoxAudio.playAuditionChime(presetKey);
        wakeVisualizer();

        const subT = window.setTimeout(() => {
          setAuditioningPreset(null);
          if (idx === presets.length - 1) {
            setIsComparingAll(false);
          }
        }, 2000);
        compareTimeoutsRef.current.push(subT);
      }, idx * 2200);

      compareTimeoutsRef.current.push(t);
    });
  };

  // Nature ambiance slider
  const handleSlider = (key: keyof NatureAmbienceSettings, val: number) => {
    onChangeSettings({
      ...settings,
      [key]: val,
    });
    wakeVisualizer();
  };

  // Apply quick atmosphere preset
  const applyPreset = (preset: {
    rain: number;
    fire: number;
    forest: number;
    windChime: number;
    stream: number;
  }) => {
    onChangeSettings(preset);
    wakeVisualizer();
  };

  // Real-time Canvas Waveform / Frequency Spectrum Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const timeData = new Uint8Array(512);
    const freqData = new Uint8Array(256);
    let lastRenderTime = performance.now();
    const frameInterval = 1000 / 24; // 24 FPS cap for mobile & iPad thermal efficiency
    let silentFrameCount = 0;
    let isTabVisible = !document.hidden;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        silentFrameCount = 0;
        lastRenderTime = performance.now();
        if (!animationFrameRef.current) {
          animationFrameRef.current = requestAnimationFrame(render);
        }
      } else if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const render = (timestamp: number) => {
      if (!isTabVisible) {
        animationFrameRef.current = null;
        return;
      }

      // For static impulse response mode, draw once and don't loop
      if (visualizerMode === 'impulse') {
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        // Subtle background grid
        ctx.strokeStyle = 'rgba(142, 110, 60, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < width; x += 40) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = 0; y < height; y += 24) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Center baseline
        ctx.strokeStyle = 'rgba(142, 110, 60, 0.18)';
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        const themeColor = activePresetInfo.color || '#a68656';
        ctx.lineWidth = 2;
        ctx.strokeStyle = themeColor;
        ctx.beginPath();

        const points = activePresetInfo.samplePoints;
        const stepX = width / (points.length - 1);

        for (let i = 0; i < points.length; i++) {
          const px = i * stepX;
          const py = height / 2 - points[i] * (height * 0.4);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();

        // Fill under impulse curve
        ctx.lineTo(width, height / 2);
        ctx.lineTo(0, height / 2);
        ctx.fillStyle = activePresetInfo.badgeBg || 'rgba(166, 134, 86, 0.08)';
        ctx.fill();
        animationFrameRef.current = null;
        return; // Single render for static curve
      }

      const elapsed = timestamp - lastRenderTime;
      if (elapsed < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastRenderTime = timestamp - (elapsed % frameInterval);

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Subtle background grid
      ctx.strokeStyle = 'rgba(142, 110, 60, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < width; x += 40) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += 24) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Center baseline
      ctx.strokeStyle = 'rgba(142, 110, 60, 0.18)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      const themeColor = activePresetInfo.color || '#a68656';
      const accentColor = activePresetInfo.accentColor || '#d6be8e';

      if (visualizerMode === 'wave') {
        musicBoxAudio.getWaveformData(timeData);

        // Check if there is active audio signal
        let isSilent = true;
        for (let i = 0; i < timeData.length; i++) {
          if (Math.abs(timeData[i] - 128) > 2) {
            isSilent = false;
            break;
          }
        }

        if (isSilent) {
          silentFrameCount++;
        } else {
          silentFrameCount = 0;
        }

        // Waveform Path
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = themeColor;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = isSilent ? 0 : 8;
        ctx.beginPath();

        const sliceWidth = width / timeData.length;
        let x = 0;

        for (let i = 0; i < timeData.length; i++) {
          let v = timeData[i] / 128.0;

          // If silent, show a gentle static harmonic curve representing current chamber profile
          if (isSilent) {
            const t = (i / timeData.length) * Math.PI * 4;
            let idleMod = 0;
            if (soundPreset === 'gold-sankyo') {
              idleMod = Math.sin(t * 3) * 0.15 + Math.sin(t * 7) * 0.08;
            } else if (soundPreset === 'wooden-box') {
              idleMod = Math.sin(t) * 0.22 + Math.sin(t * 2) * 0.1;
            } else if (soundPreset === 'crystal-bell') {
              idleMod = Math.sin(t * 4) * Math.sin(t * 0.5) * 0.2;
            } else if (soundPreset === 'vintage-antique') {
              idleMod = (Math.sin(t * 2.2) + Math.sin(t * 4.8) * 0.3) * 0.18;
            } else if (soundPreset === 'retro-8bit') {
              idleMod = (Math.sin(t * 3) >= 0 ? 0.22 : -0.22) + (Math.sin(t * 6) >= 0 ? 0.08 : -0.08);
            } else if (soundPreset === 'kalimba-mbira') {
              idleMod = Math.sin(t * 1.5) * 0.25 + Math.sin(t * 5.5) * 0.06;
            } else if (soundPreset === 'cathedral-bell') {
              idleMod = Math.sin(t * 0.75) * 0.28 + Math.sin(t * 2.25) * 0.14 + Math.sin(t * 4.5) * 0.08;
            } else if (soundPreset === 'fm-digital') {
              idleMod = Math.sin(t * 2.0 + Math.sin(t * 7.0) * 1.5) * 0.22;
            }
            v = 1.0 + idleMod * 0.4;
          }

          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;

        // Subtle gradient fill under wave
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fillStyle = activePresetInfo.badgeBg || 'rgba(166, 134, 86, 0.08)';
        ctx.fill();

        // If audio has been silent for > 6 frames (approx 250ms), sleep the canvas loop to save power!
        if (silentFrameCount > 6) {
          animationFrameRef.current = null;
          return;
        }
      } else if (visualizerMode === 'spectrum') {
        musicBoxAudio.getFrequencyData(freqData);

        let maxVal = 0;
        for (let i = 0; i < freqData.length; i++) {
          if (freqData[i] > maxVal) maxVal = freqData[i];
        }

        if (maxVal < 3) {
          silentFrameCount++;
        } else {
          silentFrameCount = 0;
        }

        const barWidth = (width / freqData.length) * 2.2;
        let barX = 0;

        for (let i = 0; i < freqData.length; i++) {
          const barHeight = (freqData[i] / 255) * height * 0.92;

          const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
          grad.addColorStop(0, themeColor);
          grad.addColorStop(1, accentColor);

          ctx.fillStyle = grad;
          ctx.fillRect(barX, height - barHeight, barWidth - 1, barHeight);

          barX += barWidth;
        }

        if (silentFrameCount > 6) {
          animationFrameRef.current = null;
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    renderTriggerRef.current = () => {
      silentFrameCount = 0;
      lastRenderTime = performance.now();
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(render);
      }
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      renderTriggerRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [soundPreset, visualizerMode, activePresetInfo, isPlaying]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 text-[#2d2419]">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-[#fcfbf8] via-[#f7f3eb] to-[#f2ecdf] border border-[#e5dcce] p-5 sm:p-6 shadow-[0_4px_24px_rgba(67,52,34,0.06)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-[#8a6b3e]/10 text-[#8a6b3e]">
                <Sparkles className="w-4 h-4" />
              </span>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#3d2f1f] tracking-wide">
                Acoustic Sound Chamber & Waveform Studio
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#7a6852] font-serif-sub">
              Physically differentiated acoustic resonances, custom impulse responses, and overtone modeling.
            </p>
          </div>

          {/* Quick Audition All Chambers Button */}
          <button
            onClick={handleCompareAll}
            disabled={isComparingAll}
            className={`px-4 py-2.5 rounded-xl font-serif text-xs font-semibold flex items-center gap-2 transition-all shadow-sm ${
              isComparingAll
                ? 'bg-[#8a6b3e] text-white cursor-wait animate-pulse'
                : 'bg-[#433422] hover:bg-[#2d2419] text-[#fbf8f2] hover:shadow-md active:scale-98'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isComparingAll ? 'Auditioning 5 Chambers...' : 'Compare All 5 Chambers'}</span>
          </button>
        </div>
      </div>

      {/* Real-time Oscilloscope & Waveform Spectrum Display */}
      <div className="rounded-2xl bg-[#1e1913] border border-[#3e3427] p-4 sm:p-5 shadow-inner space-y-3 text-[#ded3be]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#352c20] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full animate-ping" style={{ backgroundColor: activePresetInfo.color }} />
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#e8dcce]">
              Live Oscilloscope: <span style={{ color: activePresetInfo.color }}>{activePresetInfo.name}</span>
            </span>
          </div>

          {/* Visualizer Mode Tabs */}
          <div className="flex items-center gap-1 bg-[#14100c] p-1 rounded-lg border border-[#2e251b]">
            <button
              onClick={() => setVisualizerMode('wave')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                visualizerMode === 'wave'
                  ? 'bg-[#3d3224] text-[#faedd9] font-bold shadow-xs'
                  : 'text-[#8f806e] hover:text-[#e8dcce]'
              }`}
            >
              Waveform
            </button>
            <button
              onClick={() => setVisualizerMode('spectrum')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                visualizerMode === 'spectrum'
                  ? 'bg-[#3d3224] text-[#faedd9] font-bold shadow-xs'
                  : 'text-[#8f806e] hover:text-[#e8dcce]'
              }`}
            >
              FFT Spectrum
            </button>
            <button
              onClick={() => setVisualizerMode('impulse')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                visualizerMode === 'impulse'
                  ? 'bg-[#3d3224] text-[#faedd9] font-bold shadow-xs'
                  : 'text-[#8f806e] hover:text-[#e8dcce]'
              }`}
            >
              Impulse Curve
            </button>
          </div>
        </div>

        {/* Canvas Display */}
        <div className="relative w-full h-32 sm:h-40 rounded-xl overflow-hidden bg-[#120f0c] border border-[#2d2419]">
          <canvas
            ref={canvasRef}
            width={800}
            height={160}
            className="w-full h-full object-cover block"
          />

          {/* Overlay info badges */}
          <div className="absolute top-2.5 left-3 flex flex-wrap gap-2 pointer-events-none">
            <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-mono text-[#d6be8e] border border-[#433422]/60">
              Waveform: {activePresetInfo.waveformType}
            </span>
            <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-mono text-[#d6be8e] border border-[#433422]/60">
              Material: {activePresetInfo.material.split('&')[0]}
            </span>
          </div>

          <div className="absolute bottom-2.5 right-3 pointer-events-none">
            <span className="text-[10px] font-mono text-[#8a765e]">
              44.1kHz • 18-Tine Physical Model
            </span>
          </div>
        </div>

        {/* Live Acoustic Profile Caption */}
        <div className="text-xs font-serif text-[#b8a68f] bg-[#16120e] p-2.5 rounded-lg border border-[#2b2218] flex items-center justify-between">
          <span className="italic">{activePresetInfo.resonanceDescription}</span>
          <span className="font-mono text-[10px] text-[#e0c699] shrink-0 ml-2">
            Harmonics: {activePresetInfo.harmonicProfile.split('+')[0]}
          </span>
        </div>
      </div>

      {/* The 4 Distinct Acoustic Sound Chamber Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-serif tracking-wider text-[#8a6b3e] font-semibold flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#8a6b3e]" />
            <span>Select Chamber Material & Resonance Model</span>
          </span>
          <span className="text-[11px] text-[#8a765e] font-serif-sub italic">
            Click card or 'Audition Chime' to hear distinct timbre
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(Object.keys(SOUND_CHAMBER_PRESETS) as SoundChamberPreset[]).map((presetKey) => {
            const preset = SOUND_CHAMBER_PRESETS[presetKey];
            const isSelected = soundPreset === presetKey;
            const isAuditioning = auditioningPreset === presetKey;

            return (
              <div
                key={preset.id}
                id={`chamber-card-${preset.id}`}
                onClick={() => {
                  onChangeSoundPreset(presetKey);
                }}
                className={`relative p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between overflow-hidden group ${
                  isSelected
                    ? 'bg-[#fcfaf4] border-[#8a6b3e] shadow-[0_6px_20px_rgba(138,107,62,0.18)] ring-2 ring-[#8a6b3e]/30'
                    : 'bg-[#fbf9f4] border-[#ded3be] hover:border-[#bfa175] hover:shadow-sm'
                }`}
              >
                {/* Active Indicator Strip */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 transition-all"
                  style={{
                    backgroundColor: isSelected ? preset.color : 'transparent',
                  }}
                />

                <div>
                  {/* Title & Badge */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif font-bold text-sm sm:text-base text-[#2d2419]">
                          {preset.name}
                        </h3>
                        {isSelected && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider text-white"
                            style={{ backgroundColor: preset.color }}
                          >
                            Active Chamber
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#8a6b3e] font-serif font-semibold">
                        {preset.subtitle}
                      </p>
                    </div>

                    {/* Audition Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAudition(presetKey);
                      }}
                      className={`p-2 rounded-xl border transition-all text-xs font-serif flex items-center gap-1.5 shrink-0 ${
                        isAuditioning
                          ? 'bg-[#433422] text-[#fbf8f2] scale-105 shadow-sm'
                          : 'bg-[#f2ece0] hover:bg-[#e6dccb] text-[#5e4c36] border-[#ded3be]'
                      }`}
                      title="Audition full chord chime"
                    >
                      <Play className="w-3 h-3 fill-current text-[#8a6b3e]" />
                      <span className="font-semibold">{isAuditioning ? 'Chiming...' : 'Audition'}</span>
                    </button>
                  </div>

                  {/* Material & Physics Details */}
                  <div className="text-xs text-[#5e4c36] space-y-1 mb-3">
                    <p className="flex items-center gap-1 text-[11px] text-[#7a6852]">
                      <span className="font-semibold text-[#3d2f1f]">Acoustic Construction:</span>{' '}
                      {preset.material}
                    </p>
                    <p className="text-[11px] text-[#6e5a44] italic">
                      "{preset.resonanceDescription}"
                    </p>
                  </div>
                </div>

                {/* Sound Wave Graphic Simulation */}
                <div className="mt-2 pt-2.5 border-t border-[#e8dfd0] flex items-center justify-between gap-3">
                  {/* Mini Sound Waveform Preview */}
                  <div className="flex-1 h-8 rounded-lg bg-[#efe9dc] p-1 flex items-center justify-center overflow-hidden border border-[#ded3be]/60">
                    <svg viewBox="0 0 160 30" className="w-full h-full">
                      <path
                        d={
                          presetKey === 'gold-sankyo'
                            ? 'M0,15 Q10,2 20,15 T40,15 T60,15 T80,15 T100,15 T120,15 T140,15 T160,15'
                            : presetKey === 'wooden-box'
                            ? 'M0,15 C20,0 40,30 60,15 C80,3 100,27 120,15 C140,8 150,20 160,15'
                            : presetKey === 'crystal-bell'
                            ? 'M0,15 Q8,0 16,15 T32,15 T48,15 T64,15 T80,15 T96,15 T112,15 T128,15 T144,15 T160,15'
                            : presetKey === 'vintage-antique'
                            ? 'M0,15 Q15,4 30,15 T60,16 T90,14 T120,16 T150,15 T160,15'
                            : 'M0,15 L10,15 L10,6 L25,6 L25,24 L40,24 L40,6 L55,6 L55,24 L70,24 L70,6 L85,6 L85,24 L100,24 L100,6 L115,6 L115,24 L130,24 L130,6 L145,6 L145,24 L160,24'
                        }
                        fill="none"
                        stroke={preset.color}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        className={isSelected ? 'animate-pulse' : ''}
                      />
                    </svg>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono uppercase tracking-wider block text-[#8a765e]">
                      Profile Mode
                    </span>
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: preset.color }}
                    >
                      {preset.waveformType}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chamber Acoustic Customization Sliders & Master Volume */}
      <div className="rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-6 shadow-[0_4px_24px_rgba(67,52,34,0.06)] space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Slider 1: Chamber Resonance Depth */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-serif uppercase tracking-wider text-[#8a6b3e] font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#8a6b3e]" />
                <span>Body Resonance Depth</span>
              </span>
              <span className="font-mono text-[#8a6b3e] font-bold">
                {Math.round(resonanceDepth * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.8"
              step="0.05"
              value={resonanceDepth}
              onChange={(e) => handleResonanceChange(parseFloat(e.target.value))}
              className="w-full accent-[#8a6b3e] cursor-pointer h-2 bg-[#eae2d3] rounded-lg appearance-none border border-[#ded3be]"
            />
            <p className="text-[10px] text-[#8a765e] font-serif-sub">
              Amplifies the physical resonance cavity and formants.
            </p>
          </div>

          {/* Slider 2: Spatial Chamber Reverb */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-serif uppercase tracking-wider text-[#8a6b3e] font-semibold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#8a6b3e]" />
                <span>Chamber Reverb & Decay</span>
              </span>
              <span className="font-mono text-[#8a6b3e] font-bold">
                {Math.round(reverbAmount * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.8"
              step="0.05"
              value={reverbAmount}
              onChange={(e) => handleReverbChange(parseFloat(e.target.value))}
              className="w-full accent-[#8a6b3e] cursor-pointer h-2 bg-[#eae2d3] rounded-lg appearance-none border border-[#ded3be]"
            />
            <p className="text-[10px] text-[#8a765e] font-serif-sub">
              Controls the spatial room reflections and tail length.
            </p>
          </div>

          {/* Slider 3: Master Output Volume */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-serif uppercase tracking-wider text-[#8a6b3e] font-semibold flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#8a6b3e]" />
                <span>Master Volume</span>
              </span>
              <span className="font-mono text-[#8a6b3e] font-bold">
                {Math.round(masterVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => onChangeMasterVolume(parseFloat(e.target.value))}
              className="w-full accent-[#8a6b3e] cursor-pointer h-2 bg-[#eae2d3] rounded-lg appearance-none border border-[#ded3be]"
            />
            <p className="text-[10px] text-[#8a765e] font-serif-sub">
              Master gain bus feeding the audio output stage.
            </p>
          </div>
        </div>
      </div>

      {/* Nature Soundscape Mixers */}
      <div className="rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-6 shadow-[0_4px_24px_rgba(67,52,34,0.06)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e5dcce] pb-3">
          <div>
            <span className="text-xs uppercase font-serif tracking-wider text-[#8a6b3e] font-semibold flex items-center gap-1.5">
              <Trees className="w-3.5 h-3.5 text-[#8a6b3e]" />
              <span>Nature & Calming Sound Layers</span>
            </span>
            <p className="text-[11px] text-[#8a765e] font-serif-sub">
              Blended seamlessly with the mechanical music box chimes.
            </p>
          </div>

          {/* Quick Atmosphere Shortcuts */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => applyPreset({ rain: 0.6, fire: 0, forest: 0.1, windChime: 0.2, stream: 0 })}
              className="px-2.5 py-1 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] text-[11px] font-serif border border-[#ded3be] transition shadow-2xs"
            >
              🌧️ Rainy Evening
            </button>
            <button
              onClick={() => applyPreset({ rain: 0, fire: 0.7, forest: 0, windChime: 0.3, stream: 0 })}
              className="px-2.5 py-1 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] text-[11px] font-serif border border-[#ded3be] transition shadow-2xs"
            >
              🔥 Cozy Fireplace
            </button>
            <button
              onClick={() => applyPreset({ rain: 0, fire: 0, forest: 0.6, windChime: 0.4, stream: 0.5 })}
              className="px-2.5 py-1 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] text-[11px] font-serif border border-[#ded3be] transition shadow-2xs"
            >
              🌿 Forest Stream
            </button>
            <button
              onClick={() => applyPreset({ rain: 0, fire: 0, forest: 0, windChime: 0, stream: 0 })}
              className="px-2.5 py-1 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#8a765e] text-[11px] font-serif border border-[#ded3be] transition shadow-2xs"
            >
              🔇 Pure Music Box
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Rain */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <CloudRain className="w-3.5 h-3.5 text-[#5889a7]" />
                <span>Soft Rain</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">
                {Math.round(settings.rain * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.rain}
              onChange={(e) => handleSlider('rain', parseFloat(e.target.value))}
              className="w-full accent-[#5889a7] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>

          {/* Fire */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <Flame className="w-3.5 h-3.5 text-[#a8583b]" />
                <span>Hearth Fire</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">
                {Math.round(settings.fire * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.fire}
              onChange={(e) => handleSlider('fire', parseFloat(e.target.value))}
              className="w-full accent-[#a8583b] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>

          {/* Forest & Birds */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <Trees className="w-3.5 h-3.5 text-[#5b804e]" />
                <span>Forest Breeze</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">
                {Math.round(settings.forest * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.forest}
              onChange={(e) => handleSlider('forest', parseFloat(e.target.value))}
              className="w-full accent-[#5b804e] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>

          {/* Wind Chimes */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <Bell className="w-3.5 h-3.5 text-[#8b6598]" />
                <span>Wind Chimes</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">
                {Math.round(settings.windChime * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.windChime}
              onChange={(e) => handleSlider('windChime', parseFloat(e.target.value))}
              className="w-full accent-[#8b6598] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>

          {/* Stream */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <Waves className="w-3.5 h-3.5 text-[#4e8e9c]" />
                <span>Mountain Stream</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">
                {Math.round(settings.stream * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.stream}
              onChange={(e) => handleSlider('stream', parseFloat(e.target.value))}
              className="w-full accent-[#4e8e9c] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
