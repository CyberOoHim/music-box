import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  MusicBoxPin,
  SANKYO_18_TINES,
  PlayMode,
  CombScaleId,
  TineNote,
  COMB_SCALES_MAP,
  PowerSaveMode,
  SoundChamberPreset,
  isIpadOrMobileDevice,
} from '../types';
import {
  Keyboard,
  Disc,
  Play,
  Pause,
  Gauge,
  RotateCw,
  Zap,
  Leaf,
  Box,
  Layers,
} from 'lucide-react';
import { musicBoxAudio } from '../audio/musicBoxAudio';
import { MusicBox3DViewport } from './MusicBox3DViewport';

const KEYBOARD_SHORTCUTS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
  'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';',
];

interface MusicBoxMovementProps {
  currentStep: number;
  totalSteps: number;
  pins: MusicBoxPin[];
  isPlaying: boolean;
  tempoBpm: number;
  playMode: PlayMode;
  springTension: number;
  activeTines: Set<number>;
  crankRpm?: number;
  combScaleId?: CombScaleId;
  customTines?: TineNote[];
  powerSaveMode?: PowerSaveMode;
  soundPreset?: SoundChamberPreset;
  onChangeCombScale?: (scaleId: CombScaleId) => void;
  onPluckTine: (tineIndex: number) => void;
  onTogglePin?: (step: number, tineIndex: number) => void;
  onSubscribeStep?: (cb: (step: number) => void) => () => void;
  onTogglePlay?: () => void;
  onWindSpring?: (addedTension: number) => void;
  onSetSpringTension?: (tension: number) => void;
  onChangePlayMode?: (mode: PlayMode) => void;
  onManualCrankAdvance?: (deltaAngle: number, currentRpm: number) => void;
}

export const MusicBoxMovement: React.FC<MusicBoxMovementProps> = React.memo(({
  currentStep,
  totalSteps,
  pins,
  isPlaying,
  tempoBpm,
  playMode,
  springTension,
  activeTines,
  crankRpm = 0,
  combScaleId = 'sankyo-18',
  customTines,
  powerSaveMode = 'auto',
  soundPreset = 'gold-sankyo',
  onChangeCombScale,
  onPluckTine,
  onSubscribeStep,
  onTogglePlay,
  onWindSpring,
  onChangePlayMode,
  onManualCrankAdvance,
}) => {
  const [hoveredTine, setHoveredTine] = useState<number | null>(null);
  const [smoothStep, setSmoothStep] = useState<number>(currentStep);
  const [viewportMode, setViewportMode] = useState<'3d' | '2d'>('3d');
  const governorFanRef = useRef<SVGGElement | null>(null);
  const nylonGearRef = useRef<SVGGElement | null>(null);
  const ratchetWheelSvgRef = useRef<SVGGElement | null>(null);
  const governorAngleRef = useRef<number>(0);

  // Dynamic Eco / Power Saver Mode check for iPad & low-power configurations
  const isEco = useMemo(() => {
    if (powerSaveMode === 'battery-saver') return true;
    if (powerSaveMode === 'performance') return false;
    return isIpadOrMobileDevice();
  }, [powerSaveMode]);

  // Miniature Rotary Jog Dial State & Handlers
  const miniJogRef = useRef<HTMLDivElement | null>(null);
  const [isJogDragging, setIsJogDragging] = useState(false);
  const isJogDraggingRef = useRef(false);
  const lastJogAngleRef = useRef(0);
  const lastJogTimeRef = useRef(0);
  const jogCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const jogRatchetAccumRef = useRef(0);
  const [jogRotationAngle, setJogRotationAngle] = useState(0);
  const totalJogDeltaRef = useRef(0);

  // Keyboard Glissando Multi-Touch State & Handlers
  const isKeyboardPointerDownRef = useRef(false);
  const lastPluckedTineRef = useRef<number | null>(null);

  const handleKeyboardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isKeyboardPointerDownRef.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const target = (e.target as HTMLElement).closest('[data-tine-idx]') as HTMLElement | null;
    if (target) {
      const idx = Number(target.dataset.tineIdx);
      if (Number.isFinite(idx)) {
        lastPluckedTineRef.current = idx;
        onPluckTine(idx);
      }
    }
  };

  const handleKeyboardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isKeyboardPointerDownRef.current) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const target = element?.closest('[data-tine-idx]') as HTMLElement | null;
    if (target) {
      const idx = Number(target.dataset.tineIdx);
      if (Number.isFinite(idx) && idx !== lastPluckedTineRef.current) {
        lastPluckedTineRef.current = idx;
        onPluckTine(idx);
      }
    }
  };

  const handleKeyboardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isKeyboardPointerDownRef.current = false;
    lastPluckedTineRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleJogPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!miniJogRef.current) return;
    const rect = miniJogRef.current.getBoundingClientRect();
    jogCenterRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    lastJogAngleRef.current = Math.atan2(
      e.clientY - jogCenterRef.current.y,
      e.clientX - jogCenterRef.current.x
    );
    lastJogTimeRef.current = performance.now();
    totalJogDeltaRef.current = 0;
    setIsJogDragging(true);
    isJogDraggingRef.current = true;

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleJogPointerMove = (e: React.PointerEvent) => {
    if (!isJogDraggingRef.current) return;
    const now = performance.now();
    const currentAngle = Math.atan2(
      e.clientY - jogCenterRef.current.y,
      e.clientX - jogCenterRef.current.x
    );

    let delta = currentAngle - lastJogAngleRef.current;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta -= Math.PI * 2;

    const dtSec = Math.max(0.008, (now - lastJogTimeRef.current) / 1000);
    lastJogAngleRef.current = currentAngle;
    lastJogTimeRef.current = now;
    totalJogDeltaRef.current += Math.abs(delta);

    if (delta !== 0) {
      setJogRotationAngle((prev) => prev + delta);
    }

    if (playMode === 'spring') {
      if (delta > 0) {
        const addedTension = delta / (3 * 2 * Math.PI);
        onWindSpring?.(addedTension);

        jogRatchetAccumRef.current += delta;
        const RATCHET_STEP_RAD = (2 * Math.PI) / 16;
        if (jogRatchetAccumRef.current >= RATCHET_STEP_RAD) {
          musicBoxAudio.playRatchetClick(0.9);
          jogRatchetAccumRef.current %= RATCHET_STEP_RAD;
        }
      } else if (delta < -0.05) {
        jogRatchetAccumRef.current += Math.abs(delta);
        if (jogRatchetAccumRef.current > 0.35) {
          musicBoxAudio.playRatchetClick(0.7);
          jogRatchetAccumRef.current = 0;
        }
      }
    } else if (playMode === 'crank') {
      if (delta > 0) {
        const instantVel = delta / dtSec;
        const currentRpm = Math.min(120, Math.round((instantVel * 60) / (2 * Math.PI)));
        onManualCrankAdvance?.(delta, currentRpm);
      }
    }
  };

  const handleJogPointerUp = (e: React.PointerEvent) => {
    const wasTapped = totalJogDeltaRef.current < 0.12;
    setIsJogDragging(false);
    isJogDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (wasTapped) {
      if (playMode === 'spring') {
        musicBoxAudio.playRatchetClick(1.0);
        onWindSpring?.(0.334);
      } else if (playMode === 'crank') {
        onManualCrankAdvance?.(0.2, 30);
      }
    }
  };

  const handleCyclePlayMode = () => {
    if (!onChangePlayMode) return;
    musicBoxAudio.playLeverClick(true);
    const modeCycle: PlayMode[] = ['spring', 'crank', 'continuous'];
    const nextIndex = (modeCycle.indexOf(playMode) + 1) % modeCycle.length;
    onChangePlayMode(modeCycle[nextIndex]);
  };

  // Active tines list based on comb scale or custom notes
  const tinesList: TineNote[] = useMemo(() => {
    if (customTines && customTines.length > 0) return customTines;
    if (combScaleId && COMB_SCALES_MAP[combScaleId]) return COMB_SCALES_MAP[combScaleId].tines;
    return SANKYO_18_TINES;
  }, [customTines, combScaleId]);

  const tinesCount = tinesList.length;

  // Step subscription for high-frequency updates
  useEffect(() => {
    if (!onSubscribeStep) return;
    const unsubscribe = onSubscribeStep((step) => {
      setSmoothStep(step);
    });
    return unsubscribe;
  }, [onSubscribeStep]);

  useEffect(() => {
    setSmoothStep(currentStep);
  }, [currentStep]);

  // High-performance Air-Friction Governor & Gear Train Animation Loop (for 2D SVG mode)
  useEffect(() => {
    if (viewportMode !== '2d') return;
    const isCranking = playMode === 'crank' && crankRpm > 0.5;
    const shouldSpin = isPlaying || isCranking;

    if (!shouldSpin) {
      return;
    }

    let animId: number | null = null;
    const targetFps = isEco ? 30 : 60;
    const frameInterval = 1000 / targetFps;
    let lastRenderTime = performance.now();
    let lastCalcTime = performance.now();

    const updateGovernor = (time: number) => {
      if (document.hidden) {
        animId = null;
        return;
      }

      const elapsed = time - lastRenderTime;
      if (elapsed >= frameInterval) {
        lastRenderTime = time - (elapsed % frameInterval);

        const deltaSec = Math.min(0.1, (time - lastCalcTime) / 1000);
        lastCalcTime = time;

        let speed = 0;
        if (playMode === 'crank' && crankRpm > 0.5) {
          speed = (crankRpm / 60) * Math.PI * 4.5;
        } else {
          const speedFactor = playMode === 'spring' ? Math.max(0.4, springTension) : 1.0;
          speed = (tempoBpm / 90) * speedFactor * Math.PI * 3.8;
        }

        governorAngleRef.current += speed * deltaSec;

        if (governorFanRef.current) {
          governorFanRef.current.style.transform = `rotate(${governorAngleRef.current}rad)`;
        }
        if (nylonGearRef.current) {
          nylonGearRef.current.style.transform = `rotate(${-governorAngleRef.current * 0.32}rad)`;
        }
        if (ratchetWheelSvgRef.current) {
          ratchetWheelSvgRef.current.style.transform = `rotate(${governorAngleRef.current * 0.08}rad)`;
        }
      }

      animId = requestAnimationFrame(updateGovernor);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
      } else if (!animId) {
        lastRenderTime = performance.now();
        lastCalcTime = performance.now();
        animId = requestAnimationFrame(updateGovernor);
      }
    };

    const handleWindowFocus = () => {
      if (!animId) {
        lastRenderTime = performance.now();
        lastCalcTime = performance.now();
        animId = requestAnimationFrame(updateGovernor);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);
    animId = requestAnimationFrame(updateGovernor);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      if (animId) {
        cancelAnimationFrame(animId);
      }
    };
  }, [viewportMode, isPlaying, playMode, crankRpm, tempoBpm, springTension, isEco]);

  // Physical computer keyboard shortcuts handler to pluck tines
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const shortcutIndex = KEYBOARD_SHORTCUTS.indexOf(key);
      if (shortcutIndex !== -1 && shortcutIndex < tinesCount) {
        e.preventDefault();
        onPluckTine(shortcutIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tinesCount, onPluckTine]);

  // Dynamic layout calculations for 2D orthographic drum & comb coordinates
  const drumLeft = 190;
  const drumWidth = 560;
  const drumHeight = 105;
  const drumTop = 36;
  const strikeLineY = drumTop + drumHeight - 8; // y = 133
  const cylinderCenterY = drumTop + drumHeight / 2; // y = 88.5
  const cylinderRadius = drumHeight / 2; // R = 52.5
  const phiStrike = Math.asin((strikeLineY - cylinderCenterY) / cylinderRadius);

  const visiblePins = useMemo(() => {
    if (viewportMode !== '2d') return [];
    const visible: {
      pin: MusicBoxPin;
      x: number;
      y: number;
      opacity: number;
      scale: number;
      isStriking: boolean;
    }[] = [];

    const slotWidth = drumWidth / tinesCount;

    pins.forEach((pin) => {
      if (pin.tineIndex < 0 || pin.tineIndex >= tinesCount) return;

      let stepDelta = (pin.step - smoothStep) % totalSteps;
      if (stepDelta < -totalSteps / 2) stepDelta += totalSteps;
      if (stepDelta > totalSteps / 2) stepDelta -= totalSteps;

      const angleDelta = (stepDelta / totalSteps) * Math.PI * 2;
      const phi = phiStrike - angleDelta;

      if (phi >= -1.22 && phi <= 1.25) {
        const py = cylinderCenterY + cylinderRadius * Math.sin(phi);
        const px = drumLeft + (pin.tineIndex + 0.5) * slotWidth;
        const isStriking = Math.abs(stepDelta) < 0.65;
        const cosPhi = Math.max(0.18, Math.cos(phi));
        const opacity = Math.min(1.0, cosPhi * 1.15 + (phi > 0 ? 0.15 : 0));
        const scale = isStriking ? 1.35 : 0.72 + cosPhi * 0.35;

        visible.push({
          pin,
          x: px,
          y: py,
          opacity,
          scale,
          isStriking,
        });
      }
    });

    return visible;
  }, [viewportMode, pins, smoothStep, totalSteps, tinesCount, drumLeft, drumWidth, cylinderCenterY, cylinderRadius, phiStrike]);

  const isRunning = isPlaying || (playMode === 'crank' && crankRpm > 0.5);

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* Heirloom Burl-Walnut Acoustic Cradle */}
      <div className="relative w-full rounded-3xl burl-walnut-cradle p-3 sm:p-5 border-2 border-[#8a6838]/80 shadow-[0_22px_55px_rgba(14,9,5,0.8)] overflow-hidden">
        {/* Antique Cast Brass Mitered Corner Reinforcement Brackets with Slotted Screws */}
        <div className="absolute top-1 left-1 w-10 h-10 pointer-events-none z-20 brass-corner-bracket">
          <svg viewBox="0 0 40 40" className="w-full h-full">
            <path d="M 2,2 L 38,2 L 38,8 L 10,8 Q 8,8 8,10 L 8,38 L 2,38 Z" fill="#d4af62" stroke="#4a3210" strokeWidth="1" />
            <circle cx="18" cy="5" r="2" fill="#e8eef5" stroke="#2c1d0b" strokeWidth="0.6" />
            <line x1="16.5" y1="4.5" x2="19.5" y2="5.5" stroke="#1c1206" strokeWidth="0.7" />
            <circle cx="5" cy="18" r="2" fill="#e8eef5" stroke="#2c1d0b" strokeWidth="0.6" />
            <line x1="4.5" y1="16.5" x2="5.5" y2="19.5" stroke="#1c1206" strokeWidth="0.7" />
          </svg>
        </div>
        <div className="absolute top-1 right-1 w-10 h-10 pointer-events-none z-20 brass-corner-bracket -scale-x-100">
          <svg viewBox="0 0 40 40" className="w-full h-full">
            <path d="M 2,2 L 38,2 L 38,8 L 10,8 Q 8,8 8,10 L 8,38 L 2,38 Z" fill="#d4af62" stroke="#4a3210" strokeWidth="1" />
            <circle cx="18" cy="5" r="2" fill="#e8eef5" stroke="#2c1d0b" strokeWidth="0.6" />
            <line x1="16.5" y1="4.5" x2="19.5" y2="5.5" stroke="#1c1206" strokeWidth="0.7" />
            <circle cx="5" cy="18" r="2" fill="#e8eef5" stroke="#2c1d0b" strokeWidth="0.6" />
            <line x1="4.5" y1="16.5" x2="5.5" y2="19.5" stroke="#1c1206" strokeWidth="0.7" />
          </svg>
        </div>
        <div className="absolute bottom-1 left-1 w-10 h-10 pointer-events-none z-20 brass-corner-bracket -scale-y-100">
          <svg viewBox="0 0 40 40" className="w-full h-full">
            <path d="M 2,2 L 38,2 L 38,8 L 10,8 Q 8,8 8,10 L 8,38 L 2,38 Z" fill="#d4af62" stroke="#4a3210" strokeWidth="1" />
            <circle cx="18" cy="5" r="2" fill="#e8eef5" stroke="#2c1d0b" strokeWidth="0.6" />
            <line x1="16.5" y1="4.5" x2="19.5" y2="5.5" stroke="#1c1206" strokeWidth="0.7" />
            <circle cx="5" cy="18" r="2" fill="#e8eef5" stroke="#2c1d0b" strokeWidth="0.6" />
            <line x1="4.5" y1="16.5" x2="5.5" y2="19.5" stroke="#1c1206" strokeWidth="0.7" />
          </svg>
        </div>
        <div className="absolute bottom-1 right-1 w-10 h-10 pointer-events-none z-20 brass-corner-bracket -scale-100">
          <svg viewBox="0 0 40 40" className="w-full h-full">
            <path d="M 2,2 L 38,2 L 38,8 L 10,8 Q 8,8 8,10 L 8,38 L 2,38 Z" fill="#d4af62" stroke="#4a3210" strokeWidth="1" />
            <circle cx="18" cy="5" r="2" fill="#e8eef5" stroke="#2c1d0b" strokeWidth="0.6" />
            <line x1="16.5" y1="4.5" x2="19.5" y2="5.5" stroke="#1c1206" strokeWidth="0.7" />
            <circle cx="5" cy="18" r="2" fill="#e8eef5" stroke="#2c1d0b" strokeWidth="0.6" />
            <line x1="4.5" y1="16.5" x2="5.5" y2="19.5" stroke="#1c1206" strokeWidth="0.7" />
          </svg>
        </div>

        {/* Top Header: Horological Movement Spec, 3D/2D Mode Switcher, Mini Winding Jog & Quick Brake Lever */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1 text-xs sm:text-sm text-[#caa87c]">
          <div className="flex items-center flex-wrap gap-2">
            {/* Faceted Synthetic Ruby Bearing Indicator (Static horological jewel, no pulsing dot) */}
            <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0">
              <circle cx="8" cy="8" r="7" fill="#d4af62" stroke="#593f18" strokeWidth="1" />
              <circle cx="8" cy="8" r="4.5" fill={isRunning ? '#10b981' : '#e11d48'} />
              <circle cx="6.5" cy="6.5" r="1.5" fill="#ffffff" opacity="0.85" />
            </svg>

            <span className="font-serif tracking-wider text-[#faebd4] font-bold">
              {COMB_SCALES_MAP[combScaleId]?.name || 'Sankyo 18N'}
            </span>
            <span className="text-[#8a6838]" aria-hidden="true">·</span>
            <span className="text-xs text-[#d8be98] font-mono tabular-nums">
              {tinesCount} Tines ({COMB_SCALES_MAP[combScaleId]?.rangeLabel || ''})
            </span>

            {isEco && (
              <>
                <span className="text-[#8a6838]" aria-hidden="true">·</span>
                <span
                  className="inline-flex items-center gap-1 text-[#86efac] text-[11px] font-serif"
                  title="Eco Power Saving Mode active"
                >
                  <Leaf className="w-3 h-3 text-[#4ade80]" />
                  <span className="hidden xs:inline">Eco</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2 text-xs font-serif text-[#a68d72]">
            {/* 3D Studio vs 2D Orthographic Blueprint Segmented Switcher */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#160f08] border border-[#5c4020] shadow-inner">
              <button
                onClick={() => setViewportMode('3d')}
                className={`px-2 py-1 rounded-md text-[11px] font-serif flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  viewportMode === '3d'
                    ? 'bg-gradient-to-b from-[#f0c465] to-[#b88932] text-[#1c1208] font-bold shadow-2xs'
                    : 'text-[#caa87c] hover:text-[#faebd4]'
                }`}
                title="Interactive 3D WebGL Horological Movement with Orbit, Camera Presets & Exploded View"
              >
                <Box className="w-3 h-3" />
                <span>3D Studio</span>
              </button>
              <button
                onClick={() => setViewportMode('2d')}
                className={`px-2 py-1 rounded-md text-[11px] font-serif flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  viewportMode === '2d'
                    ? 'bg-gradient-to-b from-[#f0c465] to-[#b88932] text-[#1c1208] font-bold shadow-2xs'
                    : 'text-[#caa87c] hover:text-[#faebd4]'
                }`}
                title="2D Orthographic Horological Blueprint View"
              >
                <Layers className="w-3 h-3" />
                <span>2D Plan</span>
              </button>
            </div>

            {/* Step & Governed Tempo Readout */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#d8be98] font-mono tabular-nums">
              <span>
                Step {Math.round(smoothStep) + 1}/{totalSteps}
              </span>
              <span className="text-[#8a6838]" aria-hidden="true">·</span>
              <span>
                {playMode === 'crank' && crankRpm > 0 ? `≈${Math.round(crankRpm * 1.35)}` : tempoBpm} BPM
              </span>
            </div>

            {/* Machined Brass Quick Drive Mode & Rotary Winding Jog Dial */}
            {(onWindSpring || onChangePlayMode) && (
              <div
                className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-gradient-to-b from-[#2b1d10] to-[#170f07] border border-[#6e4f26] text-xs shadow-inner"
                title={
                  playMode === 'spring'
                    ? `Spring Tension: ${Math.round(springTension * 100)}% (${(springTension * 3).toFixed(1)} / 3.0 Rounds)\n• Click or drag knurled brass wheel to wind\n• Click mode cam button to switch drive mode`
                    : playMode === 'crank'
                    ? 'Hand Crank Jog Wheel:\n• Drag clockwise to advance cylinder\n• Click mode cam button to switch drive mode'
                    : 'Continuous Synchronous Drive:\n• Click mode cam button to switch drive mode'
                }
              >
                {onChangePlayMode && (
                  <button
                    id="header-drive-mode-btn"
                    onClick={handleCyclePlayMode}
                    title={`Current Drive: ${
                      playMode === 'spring'
                        ? 'Wind-Up Spring (Click for Hand Crank)'
                        : playMode === 'crank'
                        ? 'Hand Crank (Click for Continuous)'
                        : 'Continuous Motor (Click for Spring)'
                    }`}
                    className="p-1 rounded bg-gradient-to-b from-[#3d2a16] to-[#1c1208] hover:from-[#52391f] hover:to-[#281b0d] text-[#faebd4] border border-[#8a6838] transition cursor-pointer flex items-center justify-center shadow-2xs"
                  >
                    {playMode === 'spring' ? (
                      <RotateCw className="w-3 h-3 text-[#f0c465]" />
                    ) : playMode === 'crank' ? (
                      <Disc className="w-3 h-3 text-[#f0c465]" />
                    ) : (
                      <Zap className="w-3 h-3 text-[#f0c465]" />
                    )}
                  </button>
                )}

                {/* Tactile Knurled Brass Rotary Jog Wheel */}
                <div
                  ref={miniJogRef}
                  onPointerDown={handleJogPointerDown}
                  onPointerMove={handleJogPointerMove}
                  onPointerUp={handleJogPointerUp}
                  onPointerCancel={handleJogPointerUp}
                  className={`relative w-6 h-6 rounded-full bg-gradient-to-tr from-[#3a2818] via-[#5c4226] to-[#26190e] border border-[#d4af62] hover:border-[#ffeaa7] shadow-inner flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none transition-transform shrink-0 ${
                    isJogDragging ? 'scale-105 ring-2 ring-[#f0c465]/50' : ''
                  }`}
                >
                  {playMode === 'spring' && (
                    <svg
                      className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                      viewBox="0 0 32 32"
                    >
                      <circle
                        cx="16"
                        cy="16"
                        r="13"
                        fill="none"
                        stroke="#3d2a17"
                        strokeWidth="2.5"
                      />
                      <circle
                        cx="16"
                        cy="16"
                        r="13"
                        fill="none"
                        stroke={springTension > 0.33 ? '#f0c465' : '#e68470'}
                        strokeWidth="2.5"
                        strokeDasharray="81.68"
                        strokeDashoffset={81.68 * (1 - springTension)}
                        strokeLinecap="round"
                        className="transition-all duration-75"
                      />
                    </svg>
                  )}

                  {/* Miniature Brass Butterfly Key Wing Bar */}
                  <div
                    className="relative z-10 w-4 h-1.5 rounded-full bg-gradient-to-r from-[#9e7b36] via-[#fff2b8] to-[#9e7b36] border border-[#ffe787]/70 pointer-events-none shadow-2xs flex items-center justify-center"
                    style={{ transform: `rotate(${jogRotationAngle}rad)` }}
                  >
                    <div className="w-1 h-1 rounded-full bg-[#24180b]" />
                  </div>
                </div>

                {/* Tension % or Mode Label */}
                <div
                  className="flex items-center space-x-1 cursor-pointer select-none"
                  onClick={() => {
                    if (playMode === 'spring' && onWindSpring) {
                      musicBoxAudio.playWindingClick();
                      onWindSpring(0.334);
                    }
                  }}
                >
                  {playMode === 'spring' ? (
                    <span className="font-mono text-[10px] text-[#faebd4] font-bold tabular-nums">
                      {Math.round(springTension * 100)}%
                    </span>
                  ) : playMode === 'crank' ? (
                    <span className="font-mono text-[10px] text-[#faebd4] font-bold">
                      Crank
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-[#faebd4] font-bold">
                      Auto
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Quick Mechanical Stop-Arm Brake Release Toggle Button */}
            {onTogglePlay && (
              <button
                id="movement-quick-play-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  musicBoxAudio.playLeverClick(!isPlaying);
                  onTogglePlay();
                }}
                title={
                  isPlaying
                    ? 'Engage mechanical governor whip brake (Stop / Pause)'
                    : playMode === 'spring' && springTension <= 0.005
                    ? 'Auto-wind & release mechanical governor brake (Play)'
                    : 'Release mechanical governor whip brake (Play)'
                }
                className={`px-3 py-1 rounded-lg border text-xs font-serif font-bold flex items-center space-x-1.5 transition-all duration-150 cursor-pointer select-none active:scale-95 shadow-sm whitespace-nowrap ${
                  isPlaying
                    ? 'bg-gradient-to-b from-[#fae29c] via-[#e2b44d] to-[#9e6f18] text-[#1c1208] border-[#fff2b8] shadow-[0_2px_10px_rgba(240,196,101,0.45)]'
                    : 'bg-gradient-to-b from-[#362515] via-[#24180c] to-[#160e07] hover:from-[#47311c] hover:to-[#22160b] text-[#faebd4] border-[#8a6838] hover:border-[#dfc282]'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3 fill-current" />
                    <span className="text-[10px] sm:text-[11px] tracking-wide font-bold">Brake Off</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current text-[#f0c465]" />
                    <span className="text-[10px] sm:text-[11px] tracking-wide font-bold text-[#faebd4]">Release</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* PRIMARY VIEWPORT: 3D HOROLOGICAL STUDIO OR 2D ORTHOGRAPHIC BLUEPRINT */}
        {viewportMode === '3d' ? (
          <MusicBox3DViewport
            currentStep={currentStep}
            totalSteps={totalSteps}
            pins={pins}
            tinesList={tinesList}
            isPlaying={isPlaying}
            tempoBpm={tempoBpm}
            playMode={playMode}
            springTension={springTension}
            activeTines={activeTines}
            crankRpm={crankRpm}
            isEco={isEco}
            soundPreset={soundPreset}
            onPluckTine={onPluckTine}
            onSubscribeStep={onSubscribeStep}
            onTogglePlay={onTogglePlay}
            onWindSpring={onWindSpring}
            onChangePlayMode={onChangePlayMode}
            onManualCrankAdvance={onManualCrankAdvance}
            onSwitchTo2D={() => setViewportMode('2d')}
          />
        ) : (
          /* ENHANCED 2D TOP-VIEW ORTHOGRAPHIC HOROLOGICAL BLUEPRINT */
          <div className="relative w-full aspect-[780/285] bg-[#0d0905] rounded-2xl border-2 border-[#6e4f26] overflow-hidden shadow-[inset_0_4px_24px_rgba(0,0,0,0.95),0_6px_20px_rgba(0,0,0,0.5)] ring-1 ring-[#c99f52]/40 flex items-center justify-center">
            <button
              onClick={() => setViewportMode('3d')}
              className="absolute top-2.5 right-3 z-10 px-2.5 py-1 rounded-lg bg-[#1c130a]/95 hover:bg-[#2e2011] border border-[#8a6838] hover:border-[#f0c465] text-[11px] font-serif font-semibold text-[#faebd4] shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
              title="Return to 3D Interactive Horological Viewport"
            >
              <Box className="w-3.5 h-3.5 text-[#f0c465]" />
              <span>Switch to 3D View</span>
            </button>

            <svg
              viewBox="0 0 780 285"
              className="w-full h-full block"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Cast Brass Bedplate Gradient */}
                <radialGradient id="brassBedplateGrad" cx="50%" cy="50%" r="65%">
                  <stop offset="0%" stopColor="#c4a264" />
                  <stop offset="55%" stopColor="#9e7d43" />
                  <stop offset="100%" stopColor="#634a22" />
                </radialGradient>

                {/* Polished Gold Cylinder Lathe Gradient with 3D Specular Highlight Sweep */}
                <linearGradient id="drumLatheGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#fdf2b8" />
                  <stop offset="8%" stopColor="#dfbf6d" />
                  <stop offset="22%" stopColor="#fff9de" />
                  <stop offset="38%" stopColor="#c79f4c" />
                  <stop offset="65%" stopColor="#9e7b36" />
                  <stop offset="82%" stopColor="#e8cf83" />
                  <stop offset="100%" stopColor="#5c3f12" />
                </linearGradient>

                {/* Mainspring Drum Cap Gradient */}
                <radialGradient id="springCapGrad" cx="45%" cy="45%" r="55%">
                  <stop offset="0%" stopColor="#fff2c2" />
                  <stop offset="50%" stopColor="#d4af62" />
                  <stop offset="85%" stopColor="#9e7b36" />
                  <stop offset="100%" stopColor="#523912" />
                </radialGradient>

                {/* Brushed Steel Comb Base Gradient */}
                <linearGradient id="combBaseGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#eef2f7" />
                  <stop offset="35%" stopColor="#c8d0d8" />
                  <stop offset="70%" stopColor="#98a1ab" />
                  <stop offset="100%" stopColor="#5d656e" />
                </linearGradient>

                {/* Steel Tine Normal Gradient */}
                <linearGradient id="steelTineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="22%" stopColor="#dbe2ea" />
                  <stop offset="75%" stopColor="#9aa1a9" />
                  <stop offset="100%" stopColor="#5f666f" />
                </linearGradient>

                {/* Blued Steel Accidental Tine Gradient */}
                <linearGradient id="bluedTineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#6c8ebc" />
                  <stop offset="25%" stopColor="#2e4568" />
                  <stop offset="75%" stopColor="#1b2a42" />
                  <stop offset="100%" stopColor="#0f1826" />
                </linearGradient>

                {/* Vibrating / Plucked Steel Tine Golden Glow Gradient */}
                <linearGradient id="tineGlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="18%" stopColor="#fff0b3" />
                  <stop offset="55%" stopColor="#f0c465" />
                  <stop offset="100%" stopColor="#c98e28" />
                </linearGradient>

                {/* Slotted Chrome Screw Head */}
                <radialGradient id="chromeScrewGrad" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#e4ecf3" />
                  <stop offset="75%" stopColor="#98a4b0" />
                  <stop offset="100%" stopColor="#4a535c" />
                </radialGradient>

                {/* Synthetic Ruby Jewel Bearing */}
                <radialGradient id="rubyJewelGrad" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#ff8da1" />
                  <stop offset="45%" stopColor="#e11d48" />
                  <stop offset="80%" stopColor="#9f1239" />
                  <stop offset="100%" stopColor="#4c0519" />
                </radialGradient>

                {/* Helical Worm Gear Spindle Gradient */}
                <linearGradient id="wormScrewGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#523d20" />
                  <stop offset="35%" stopColor="#dfbf6d" />
                  <stop offset="65%" stopColor="#fff2ba" />
                  <stop offset="100%" stopColor="#7a5518" />
                </linearGradient>

                {/* Brass Pin Bead Shading */}
                <radialGradient id="pinBeadGrad" cx="30%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#fffdf0" />
                  <stop offset="45%" stopColor="#f0c465" />
                  <stop offset="80%" stopColor="#b88320" />
                  <stop offset="100%" stopColor="#543706" />
                </radialGradient>

                {/* Spark Glow Filter */}
                <filter id="sparkGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* 0. ACOUSTIC RESONANCE CHAMBER & ROSETTE UNDER BEDPLATE */}
              <circle cx="470" cy="142" r="95" fill="#170d06" stroke="#422a14" strokeWidth="2" opacity="0.7" />
              <circle cx="470" cy="142" r="82" fill="none" stroke="#8a6838" strokeWidth="1" strokeDasharray="6 3" opacity="0.45" />

              {/* 1. CAST BRASS BEDPLATE BASE */}
              <rect
                x="12"
                y="12"
                width="756"
                height="261"
                rx="16"
                fill="url(#brassBedplateGrad)"
                stroke="#dfbe7e"
                strokeWidth="2.5"
                filter="drop-shadow(0 8px 16px rgba(0,0,0,0.6))"
              />
              {/* Stippled / Beveled Inner Border */}
              <rect
                x="20"
                y="20"
                width="740"
                height="245"
                rx="12"
                fill="none"
                stroke="#593f18"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                opacity="0.65"
              />

              {/* Traditional Cast Inscription Plaque ("聲 盒 仔" & Authentic Seal) */}
              <g transform="translate(36, 236)">
                <rect
                  x="0"
                  y="0"
                  width="122"
                  height="22"
                  rx="4"
                  fill="#422d10"
                  stroke="#d4af62"
                  strokeWidth="1.2"
                />
                <text
                  x="66"
                  y="15"
                  textAnchor="middle"
                  fill="#f8e5ab"
                  fontFamily='"Noto Serif TC", "Songti TC", serif'
                  fontSize="11.5"
                  fontWeight="bold"
                  letterSpacing="3"
                >
                  聲 盒 仔 · 18001
                </text>
                <circle cx="11" cy="11" r="5.5" fill="#d4af62" opacity="0.8" />
                <text x="11" y="14" textAnchor="middle" fill="#2d1c08" fontSize="8" fontWeight="bold">
                  安
                </text>
              </g>

              {/* 4 Bedplate Mounting Bolts with Brass Washers */}
              {[
                { cx: 32, cy: 32, rot: 25 },
                { cx: 748, cy: 32, rot: -40 },
                { cx: 748, cy: 252, rot: 15 },
                { cx: 32, cy: 214, rot: -20 },
              ].map((screw, sIdx) => (
                <g key={`bed-screw-${sIdx}`} transform={`translate(${screw.cx}, ${screw.cy})`}>
                  <circle r="11" fill="#8a6838" stroke="#422c0c" strokeWidth="1" />
                  <circle r="8.5" fill="url(#chromeScrewGrad)" stroke="#2b2011" strokeWidth="1" />
                  <line
                    x1="-6"
                    y1="0"
                    x2="6"
                    y2="0"
                    stroke="#1c1409"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    transform={`rotate(${screw.rot})`}
                  />
                </g>
              ))}

              {/* 2. MAINSPRING BARREL, CUTAWAY SPRING COIL & RATCHET PAWL (LEFT) */}
              <g
                transform="translate(92, 88)"
                className="cursor-pointer group select-none"
                onClick={() => {
                  if (playMode === 'spring' && onWindSpring) {
                    musicBoxAudio.playWindingClick();
                    onWindSpring(0.334);
                  } else if (playMode === 'crank') {
                    onManualCrankAdvance?.(0.3, 35);
                  }
                }}
              >
                <circle r="60" fill="#2d1f0c" opacity="0.75" />
                <circle r="56" fill="url(#springCapGrad)" stroke="#523912" strokeWidth="2.5" />
                <circle r="49" fill="none" stroke="#fae7b5" strokeWidth="1.2" opacity="0.6" strokeDasharray="3 3" />

                {/* Cutaway Exhibition Window showing Coiled Blued-Steel Mainspring */}
                <circle r="38" fill="#17120c" stroke="#422c0b" strokeWidth="1.5" />
                {[33, 28, 23, 18].map((rVal, idx) => {
                  const tightR = rVal - springTension * (idx + 1) * 1.6;
                  return (
                    <circle
                      key={`coil-ring-${idx}`}
                      r={Math.max(10, tightR)}
                      fill="none"
                      stroke="#3b608c"
                      strokeWidth="2.2"
                      strokeDasharray="48 6"
                      opacity="0.9"
                    />
                  );
                })}

                {/* 16-Tooth Steel Ratchet Wheel around Winding Arbor */}
                <g ref={ratchetWheelSvgRef}>
                  <circle r="16" fill="#d0d8e0" stroke="#3b424c" strokeWidth="1.2" />
                  {Array.from({ length: 16 }).map((_, rIdx) => {
                    const ang = (rIdx / 16) * Math.PI * 2;
                    const x1 = Math.cos(ang) * 15;
                    const y1 = Math.sin(ang) * 15;
                    const x2 = Math.cos(ang + 0.14) * 19.5;
                    const y2 = Math.sin(ang + 0.14) * 19.5;
                    const x3 = Math.cos(ang + 0.36) * 15;
                    const y3 = Math.sin(ang + 0.36) * 15;
                    return (
                      <polygon
                        key={`ratchet-t-${rIdx}`}
                        points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`}
                        fill="#cfd8e3"
                        stroke="#454e59"
                        strokeWidth="0.6"
                      />
                    );
                  })}
                </g>

                {/* Spring-Loaded Click Pawl (Detent Dog) engaging Ratchet Teeth */}
                <g transform="translate(22, -14)">
                  <path
                    d="M 0,0 L -8,7 L -4,11 L 4,4 Z"
                    fill="#263c5c"
                    stroke="#0f1826"
                    strokeWidth="0.9"
                  />
                  {/* Brass recoil wire spring */}
                  <path
                    d="M 2,2 Q 12,-4 16,8"
                    fill="none"
                    stroke="#f0c465"
                    strokeWidth="1.4"
                  />
                  <circle cx="0" cy="0" r="3" fill="url(#chromeScrewGrad)" stroke="#1c1409" strokeWidth="0.7" />
                </g>

                {/* Center Square Winding Arbor & Screw */}
                <rect x="-6" y="-6" width="12" height="12" rx="2" fill="#7a5822" stroke="#fae7b5" strokeWidth="1" />
                <circle r="4.5" fill="url(#chromeScrewGrad)" stroke="#2b2011" strokeWidth="0.8" />
              </g>

              {/* 3. HOROLOGICAL SPEED GOVERNOR, GEAR TRAIN & STOP-ARM BRAKE (BOTTOM LEFT) */}
              <g transform="translate(96, 186)">
                {/* Intermediate Ivory Nylon / Phosphor Bronze Meshing Gear */}
                <g ref={nylonGearRef} style={{ willChange: 'transform' }}>
                  <circle r="25" fill="#f8f4e2" stroke="#d5caa8" strokeWidth="1.5" />
                  {Array.from({ length: 18 }).map((_, gIdx) => {
                    const gAngle = (gIdx / 18) * Math.PI * 2;
                    const tx = Math.cos(gAngle) * 25;
                    const ty = Math.sin(gAngle) * 25;
                    return (
                      <circle
                        key={`gear-tooth-${gIdx}`}
                        cx={tx}
                        cy={ty}
                        r="2.4"
                        fill="#e6dbc0"
                        stroke="#ab9f7a"
                        strokeWidth="0.8"
                      />
                    );
                  })}
                  <circle r="10" fill="#caa35c" stroke="#6e4f26" strokeWidth="1" />
                  <circle r="3.5" fill="url(#chromeScrewGrad)" stroke="#3a2a16" strokeWidth="0.6" />
                </g>

                {/* Helical Worm Screw Spindle Meshing with Cylinder Spur Gear */}
                <g transform="translate(24, -4)">
                  <rect x="-3.5" y="-18" width="7" height="36" rx="2" fill="url(#wormScrewGrad)" stroke="#4a3418" strokeWidth="0.8" />
                  {[-13, -7, -1, 5, 11].map((sy, i) => (
                    <line key={`worm-thread-${i}`} x1="-3.5" y1={sy} x2="3.5" y2={sy + 3} stroke="#fae7b5" strokeWidth="1.2" />
                  ))}
                  <circle cx="0" cy="-18" r="3.2" fill="url(#rubyJewelGrad)" stroke="#590d22" strokeWidth="0.7" />
                  <circle cx="0" cy="18" r="3.2" fill="url(#rubyJewelGrad)" stroke="#590d22" strokeWidth="0.7" />
                </g>

                {/* Governor Flywheel Spindle & Air-Friction Butterfly Fan */}
                <g transform="translate(46, -6)">
                  <path
                    d="M -16,0 C -16,-10 16,-10 16,0 L 8,16 L -8,16 Z"
                    fill="#d4af62"
                    stroke="#684f27"
                    strokeWidth="1.2"
                  />
                  <circle cx="0" cy="11" r="2.2" fill="url(#chromeScrewGrad)" stroke="#3a2a16" strokeWidth="0.5" />

                  <g ref={governorFanRef} id="governorFan" style={{ willChange: 'transform' }}>
                    <rect
                      x="-23"
                      y="-4.5"
                      width="46"
                      height="9"
                      rx="2"
                      fill="#d4af62"
                      stroke="#593f18"
                      strokeWidth="0.9"
                    />
                    <rect
                      x="-4.5"
                      y="-23"
                      width="9"
                      height="46"
                      rx="2"
                      fill="#242933"
                      stroke="#6c7a89"
                      strokeWidth="0.9"
                    />
                    <circle r="6" fill="#f0c465" stroke="#7a5518" strokeWidth="1" />
                  </g>

                  <circle r="3.5" fill="url(#rubyJewelGrad)" stroke="#4c0519" strokeWidth="0.8" />
                  <circle cx="-1" cy="-1" r="1.2" fill="#ffffff" opacity="0.85" />
                </g>

                {/* MECHANICAL STOP-ARM / WHIP BRAKE WIRE (Engages Governor Fan when Paused!) */}
                <g
                  transform={`translate(46, 30) rotate(${isRunning ? 24 : 0})`}
                  className="cursor-pointer transition-transform duration-200"
                  onClick={() => {
                    if (onTogglePlay) {
                      musicBoxAudio.playLeverClick(!isPlaying);
                      onTogglePlay();
                    }
                  }}
                >
                  {/* Spring-steel brake wire finger reaching up to butterfly fan blade */}
                  <path
                    d="M 0,0 Q -6,-14 -3,-26"
                    fill="none"
                    stroke={isRunning ? '#a3b1bf' : '#ff8a75'}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Brass Pivot Lever Collar */}
                  <rect x="-8" y="-4" width="16" height="8" rx="3" fill="#d4af62" stroke="#4a3210" strokeWidth="1" />
                  <circle r="2.5" fill="url(#chromeScrewGrad)" />
                </g>
              </g>

              {/* 4. REVOLVING BRASS CYLINDER (DRUM) & LEFT INVOLUTE DRIVE GEAR */}
              <g>
                {/* Left Pillow Block Bearing Stand */}
                <rect
                  x={drumLeft - 28}
                  y={drumTop + 18}
                  width="12"
                  height={drumHeight - 36}
                  rx="2"
                  fill="#9e7b36"
                  stroke="#4a3210"
                  strokeWidth="1.2"
                />

                {/* Cylinder Cast Shadow */}
                <rect
                  x={drumLeft - 4}
                  y={drumTop + 4}
                  width={drumWidth + 8}
                  height={drumHeight + 6}
                  rx="8"
                  fill="#1a1007"
                  opacity="0.75"
                />

                {/* Left Involute Bronze Drive Spur Gear */}
                <rect
                  x={drumLeft - 16}
                  y={drumTop - 4}
                  width="16"
                  height={drumHeight + 8}
                  rx="3"
                  fill="#8a6336"
                  stroke="#4a3210"
                  strokeWidth="1.5"
                />
                {Array.from({ length: 15 }).map((_, i) => (
                  <rect
                    key={`cyl-gear-tooth-${i}`}
                    x={drumLeft - 19}
                    y={drumTop - 1 + i * 7.5}
                    width="4.5"
                    height="4.2"
                    rx="1"
                    fill="#dfbe7e"
                  />
                ))}

                {/* Main Golden Brass Cylinder Surface */}
                <rect
                  x={drumLeft}
                  y={drumTop}
                  width={drumWidth}
                  height={drumHeight}
                  rx="6"
                  fill="url(#drumLatheGrad)"
                  stroke="#684f27"
                  strokeWidth="2"
                />

                {/* Right Axle Journal Bearing & Ruby Endstone Cap */}
                <rect
                  x={drumLeft + drumWidth}
                  y={drumTop - 6}
                  width="18"
                  height={drumHeight + 12}
                  rx="4"
                  fill="#b6955c"
                  stroke="#593f18"
                  strokeWidth="1.5"
                />
                <g transform={`translate(${drumLeft + drumWidth + 9}, ${drumTop + drumHeight / 2})`}>
                  <circle r="7" fill="url(#chromeScrewGrad)" stroke="#2b2011" strokeWidth="1" />
                  <circle r="2.8" fill="url(#rubyJewelGrad)" />
                </g>

                {/* Lathe Polishing Lines */}
                {[0.2, 0.4, 0.6, 0.8].map((frac, lIdx) => (
                  <line
                    key={`lathe-line-${lIdx}`}
                    x1={drumLeft + 6}
                    y1={drumTop + drumHeight * frac}
                    x2={drumLeft + drumWidth - 6}
                    y2={drumTop + drumHeight * frac}
                    stroke="#fae7b5"
                    strokeWidth="0.8"
                    opacity="0.35"
                  />
                ))}

                {/* Stamped Model Number (18001 Sankyo Patent Mark) */}
                <text
                  x={drumLeft + drumWidth - 36}
                  y={drumTop + 22}
                  fill="#5c3f14"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                  opacity="0.85"
                >
                  18001
                </text>

                {/* Dynamic Vertical Tine Alignment Grid Guides */}
                {Array.from({ length: tinesCount }).map((_, tIdx) => {
                  const tx = drumLeft + (tIdx + 0.5) * (drumWidth / tinesCount);
                  const isActive = activeTines.has(tIdx);
                  return (
                    <line
                      key={`tine-track-${tIdx}`}
                      x1={tx}
                      y1={drumTop + 4}
                      x2={tx}
                      y2={drumTop + drumHeight - 4}
                      stroke={isActive ? '#ffe599' : '#8f6e33'}
                      strokeWidth={isActive ? '1.5' : '0.8'}
                      strokeDasharray={isActive ? 'none' : '3 3'}
                      opacity={isActive ? 0.9 : 0.25}
                    />
                  );
                })}

                {/* Revolving Brass Song Pins on Drum */}
                {visiblePins.map((item, pIdx) => (
                  <g key={`pin-bead-${pIdx}`} transform={`translate(${item.x}, ${item.y})`}>
                    <ellipse
                      cx={1.8 * item.scale}
                      cy={2.8 * item.scale}
                      rx={3.2 * item.scale}
                      ry={1.6 * item.scale}
                      fill="#140b04"
                      opacity={item.opacity * 0.65}
                    />
                    {item.isStriking && (
                      <circle
                        r={isEco ? 8 : 11}
                        fill="#ffeb99"
                        opacity={isEco ? 0.95 : 0.85}
                        filter={isEco ? undefined : 'url(#sparkGlow)'}
                      />
                    )}
                    <circle
                      r={3.8 * item.scale}
                      fill="url(#pinBeadGrad)"
                      stroke="#5e3e07"
                      strokeWidth="0.75"
                      opacity={item.opacity}
                    />
                    <circle
                      cx={-1.2 * item.scale}
                      cy={-1.2 * item.scale}
                      r={1.2 * item.scale}
                      fill="#ffffff"
                      opacity={item.opacity * 0.9}
                    />
                  </g>
                ))}

                {/* Comb Strike Contact Line Highlight */}
                <line
                  x1={drumLeft}
                  y1={strikeLineY}
                  x2={drumLeft + drumWidth}
                  y2={strikeLineY}
                  stroke="#fae7b5"
                  strokeWidth="1.2"
                  strokeDasharray="4 2"
                  opacity="0.45"
                />
              </g>

              {/* 5. TUNED SPRING-STEEL COMB WITH ACOUSTIC ANGLED ROOT UNDERCUT */}
              <g>
                {/* Tuned Spring Steel Tines Extending Upwards to Drum with Physical Length & Width Graduation */}
                {tinesList.map((tine, idx) => {
                  const slotW = drumWidth / tinesCount;
                  const tx = drumLeft + (idx + 0.5) * slotW;
                  const frac = idx / Math.max(1, tinesCount - 1);
                  const taperRatio = 0.84 - frac * 0.26;
                  const tineWidth = Math.max(4, slotW * taperRatio);
                  const isActive = activeTines.has(idx);
                  const isHovered = hoveredTine === idx;
                  const isBass = frac < 0.36;
                  const isAccidental = Boolean(tine.isFlat || tine.note.includes('b') || tine.note.includes('#'));

                  // Authentic comb geometry: all tips meet the cylinder strikeLineY (133),
                  // while the comb root line slopes from y=230 on bass (left) to y=208 on treble (right)!
                  const tineTopY = strikeLineY + (isActive ? 2.4 : 0);
                  const tineRootY = 230 - frac * 22;

                  return (
                    <g
                      key={`steel-tine-${idx}`}
                      onClick={() => onPluckTine(idx)}
                      onMouseEnter={() => setHoveredTine(idx)}
                      onMouseLeave={() => setHoveredTine(null)}
                      className="cursor-pointer"
                    >
                      {isActive && (
                        <rect
                          x={tx - tineWidth / 2 - 3}
                          y={tineTopY - 4}
                          width={tineWidth + 6}
                          height={tineRootY - tineTopY + 8}
                          rx="3"
                          fill="#ffea8a"
                          opacity={isEco ? 0.6 : 0.45}
                          filter={isEco ? undefined : 'url(#sparkGlow)'}
                        />
                      )}

                      {/* Sub-Tine Feather Damper Nib */}
                      <rect
                        x={tx - tineWidth * 0.62}
                        y={tineTopY + 3}
                        width={tineWidth * 0.3}
                        height="9"
                        rx="1"
                        fill="#e8dcc4"
                        opacity="0.75"
                      />

                      {/* Main Steel Tine Cantilever Beam */}
                      <rect
                        x={tx - tineWidth / 2}
                        y={tineTopY}
                        width={tineWidth}
                        height={tineRootY - tineTopY + 4}
                        rx="1.5"
                        fill={
                          isActive
                            ? 'url(#tineGlowGrad)'
                            : isHovered
                            ? '#f0f3f6'
                            : isAccidental
                            ? 'url(#bluedTineGrad)'
                            : 'url(#steelTineGrad)'
                        }
                        stroke={isActive ? '#ffe58f' : isAccidental ? '#1c2b42' : '#454c54'}
                        strokeWidth={isActive ? '1.5' : '1'}
                      />

                      {/* Specular Bevel Stripe */}
                      <line
                        x1={tx - tineWidth / 4}
                        y1={tineTopY + 2}
                        x2={tx - tineWidth / 4}
                        y2={tineRootY}
                        stroke="#ffffff"
                        strokeWidth={Math.max(0.9, tineWidth * 0.18)}
                        opacity={isActive ? 0.95 : 0.55}
                      />

                      {/* Lead Tuning Counterweights Soldered Underneath Low Bass Tines */}
                      {isBass && (
                        <g>
                          <rect
                            x={tx - tineWidth / 2 + 0.5}
                            y={tineTopY + 9}
                            width={tineWidth - 1}
                            height={12 + (0.36 - frac) * 32}
                            rx="1"
                            fill="#262a30"
                            stroke="#14171c"
                            strokeWidth="0.8"
                            opacity="0.95"
                          />
                          <rect
                            x={tx - tineWidth / 2 + 1}
                            y={tineTopY + 8.2}
                            width={tineWidth - 2}
                            height="1.4"
                            fill="#98a0aa"
                            opacity="0.85"
                          />
                        </g>
                      )}

                      {/* Tine Tip Pin Contact Bevel */}
                      <path
                        d={`M ${tx - tineWidth / 2},${tineTopY + 3} L ${tx},${tineTopY} L ${tx + tineWidth / 2},${tineTopY + 3} Z`}
                        fill={isActive ? '#ffffff' : isAccidental ? '#f0c465' : '#e2e8f0'}
                      />
                    </g>
                  );
                })}

                {/* Solid Brushed Steel Comb Base Plate with Acoustic Angled Undercut */}
                <path
                  d={`M ${drumLeft - 10},228 L ${drumLeft + drumWidth + 10},206 L ${drumLeft + drumWidth + 6},260 L ${drumLeft - 6},260 Z`}
                  fill="url(#combBaseGrad)"
                  stroke="#3b424a"
                  strokeWidth="2"
                  filter="drop-shadow(0 6px 12px rgba(0,0,0,0.65))"
                />

                {/* Engraved Comb Tuning Stamp */}
                <text
                  x={drumLeft + drumWidth / 2}
                  y="246"
                  textAnchor="middle"
                  fill="#3b424a"
                  fontSize="9.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  letterSpacing="2"
                >
                  TEMPERED SPRING STEEL · {tinesCount} NOTES
                </text>

                {/* Two Large Slotted Dome Screws + Brass Belleville Washers on Comb Base Clamp */}
                <g transform={`translate(${drumLeft + 38}, 244)`}>
                  <circle r="14.5" fill="#b58338" stroke="#4a3210" strokeWidth="1" />
                  <circle r="11.5" fill="url(#chromeScrewGrad)" stroke="#2b3138" strokeWidth="1.2" />
                  <line x1="-8" y1="-1" x2="8" y2="1" stroke="#16181b" strokeWidth="2.5" strokeLinecap="round" />
                </g>
                <g transform={`translate(${drumLeft + drumWidth - 38}, 236)`}>
                  <circle r="14.5" fill="#b58338" stroke="#4a3210" strokeWidth="1" />
                  <circle r="11.5" fill="url(#chromeScrewGrad)" stroke="#2b3138" strokeWidth="1.2" />
                  <line x1="-8" y1="1" x2="8" y2="-1" stroke="#16181b" strokeWidth="2.5" strokeLinecap="round" />
                </g>

                {/* Striking Pin Highlight Overlay */}
                {visiblePins.filter((item) => item.isStriking).map((item, pIdx) => (
                  <g key={`striking-pin-overlay-${pIdx}`} transform={`translate(${item.x}, ${item.y})`}>
                    <circle
                      r={isEco ? 8 : 11}
                      fill="#ffeb99"
                      opacity={isEco ? 0.95 : 0.9}
                      filter={isEco ? undefined : 'url(#sparkGlow)'}
                    />
                    <circle
                      r={4.2}
                      fill="url(#pinBeadGrad)"
                      stroke="#ffe58f"
                      strokeWidth="1.2"
                    />
                    <circle cx={-1.3} cy={-1.3} r={1.4} fill="#ffffff" />
                  </g>
                ))}
              </g>
            </svg>
          </div>
        )}

        {/* 6. DEDICATED INTERACTIVE COMB KEYBOARD & MECHANICAL SCALE SELECTOR */}
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[#5c4020]/80 flex flex-col space-y-2.5 w-full">
          {/* Header Row: Title & Active Count + Machined Brass Comb Scale Toggles */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-1">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <Keyboard className="w-4 h-4 text-[#f0c465]" />
              <span className="font-serif text-xs sm:text-sm font-semibold text-[#faebd4]">
                Tuned Spring-Steel Comb Manual
              </span>
              <span className="text-[#8a6838]" aria-hidden="true">·</span>
              <span className="text-xs text-[#caa87c] font-mono tabular-nums">
                {tinesCount} Notes ({COMB_SCALES_MAP[combScaleId]?.rangeLabel || ''})
              </span>
            </div>

            {/* Machined Brass Comb Scale Cam-Toggle Bank */}
            {onChangeCombScale && (
              <div className="flex items-center space-x-1 p-1 rounded-xl bg-[#140d07] border border-[#6e4f26] overflow-x-auto max-w-full shadow-inner">
                <span className="text-[10px] font-serif text-[#b89972] px-1.5 hidden lg:inline shrink-0">
                  Comb Tuning:
                </span>
                {(Object.keys(COMB_SCALES_MAP) as CombScaleId[]).map((scaleKey) => {
                  const scale = COMB_SCALES_MAP[scaleKey];
                  const isSelected = combScaleId === scaleKey;
                  return (
                    <button
                      key={scale.id}
                      id={`keyboard-comb-pill-${scale.id}`}
                      onClick={() => {
                        musicBoxAudio.playLeverClick(true);
                        onChangeCombScale(scaleKey);
                      }}
                      title={`${scale.name} (${scale.tinesCount} Tines · ${scale.rangeLabel})\n${scale.description}`}
                      className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-serif shrink-0 transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                        isSelected
                          ? 'bg-gradient-to-b from-[#fae29c] via-[#e5b852] to-[#a87920] text-[#1c1208] font-bold shadow-xs border border-[#fff2b8]'
                          : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#261a0e] border border-transparent'
                      }`}
                    >
                      <span>{scale.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Subheader: Physical Keyboard Shortcuts Hint & Alignment Note */}
          <div className="flex items-center justify-between px-1 text-[11px] text-[#caa87c]">
            <span className="font-serif text-[#b89972]">
              Glissando drag across keys, click 3D tines, or press{' '}
              <kbd className="px-1.5 py-0.5 bg-[#17110a] border border-[#5c4020] rounded text-[10px] font-mono text-[#f0c465] font-semibold">1-0</kbd>{' '}
              <kbd className="px-1.5 py-0.5 bg-[#17110a] border border-[#5c4020] rounded text-[10px] font-mono text-[#f0c465] font-semibold">Q-P</kbd>{' '}
              {tinesCount > 20 && (
                <kbd className="px-1.5 py-0.5 bg-[#17110a] border border-[#5c4020] rounded text-[10px] font-mono text-[#f0c465] font-semibold">A-;</kbd>
              )}
            </span>
            <span className="text-[10px] font-serif text-[#caa87c] hidden sm:inline">
              Tempered Blued-Steel (♭/♯) accidentals · Lead-weighted bass tines
            </span>
          </div>

          {/* Dynamic Keyboard Keys Rack with Elevated Spring-Steel Comb Tines & Glissando Multi-Touch Support */}
          <div className="w-full pt-1.5 pb-1">
            {/* Machined Steel & Brass Comb Clamping Bar with Slotted Bolts */}
            <div className="w-full h-3 rounded-t-lg bg-gradient-to-r from-[#5a3e1b] via-[#d4af62] to-[#5a3e1b] border-b border-[#2d1e0c] flex justify-between px-3 sm:px-6 items-center shadow-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#e4ecf3] border border-[#2d3138] inline-block shadow-2xs" />
                <span className="text-[8px] font-mono text-[#2b1c08] font-bold tracking-widest uppercase hidden sm:inline">
                  BASS · LEAD WEIGHTED
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#e4ecf3] border border-[#2d3138] inline-block shadow-2xs" />
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-[#2b1c08] font-bold tracking-widest uppercase hidden sm:inline">
                  TREBLE · FINE TAPER
                </span>
                <span className="w-2 h-2 rounded-full bg-[#e4ecf3] border border-[#2d3138] inline-block shadow-2xs" />
              </div>
            </div>

            <div
              onPointerDown={handleKeyboardPointerDown}
              onPointerMove={handleKeyboardPointerMove}
              onPointerUp={handleKeyboardPointerUp}
              className="w-full flex items-end gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-b-xl bg-[#0e0905] border-x border-b border-[#5c4020] shadow-inner select-none touch-none"
            >
              {tinesList.map((tine, idx) => {
                const isActive = activeTines.has(idx);
                const isHovered = hoveredTine === idx;
                const shortcut = KEYBOARD_SHORTCUTS[idx]?.toUpperCase();
                const isAccidental = Boolean(tine.isFlat || tine.note.includes('b') || tine.note.includes('#'));

                return (
                  <button
                    key={`${tine.note}-${idx}`}
                    id={`keyboard-tine-key-${idx}`}
                    data-tine-idx={idx}
                    onClick={() => onPluckTine(idx)}
                    onMouseEnter={() => setHoveredTine(idx)}
                    onMouseLeave={() => setHoveredTine(null)}
                    title={`Tine #${idx + 1}: ${tine.note} (${tine.frequency ? tine.frequency.toFixed(1) + ' Hz' : ''})${tine.flatEnharmonic ? ` · ${tine.flatEnharmonic}` : ''} · Shortcut: [${shortcut || ''}]`}
                    className={`group relative flex-1 min-w-0 flex flex-col items-center justify-between px-0.5 sm:px-1 py-1 sm:py-1.5 rounded sm:rounded-lg border transition-all select-none cursor-pointer ${
                      isAccidental
                        ? 'h-22 sm:h-26 md:h-28 -translate-y-2 sm:-translate-y-2.5 z-20 blued-steel-key border-[#476085]'
                        : 'h-19 sm:h-23 md:h-25 translate-y-0 z-10 spring-steel-key border-[#88929e]'
                    } ${
                      isActive
                        ? 'bg-gradient-to-b from-[#fff0b3] via-[#f0c465] to-[#c99432]! text-[#1c1208]! border-[#ffe8a3]! shadow-[0_0_16px_rgba(240,196,101,0.95)]! ring-2 ring-[#ffe082] translate-y-1 z-30 tine-vibrating'
                        : isHovered
                        ? isAccidental
                          ? 'brightness-125 border-[#7da1d4] shadow-md'
                          : 'brightness-110 border-[#b8c2cc] shadow-sm'
                        : ''
                    }`}
                  >
                    {/* Top Tuned Pin Contact Tip Bevel */}
                    <div
                      className={`w-2 sm:w-2.5 h-1 rounded-full mb-0.5 transition-colors ${
                        isActive
                          ? 'bg-[#7a5416]'
                          : isAccidental
                          ? 'bg-[#f0c465] shadow-[0_0_4px_rgba(240,196,101,0.8)]'
                          : 'bg-[#5a6572]'
                      }`}
                    />

                    {/* Tine Index (#1, #2, etc.) */}
                    <span
                      className={`text-[8px] sm:text-[9px] md:text-[10px] font-mono font-bold leading-none tabular-nums ${
                        isActive
                          ? 'text-[#3d2706]'
                          : isAccidental
                          ? 'text-[#a5c4eb]'
                          : 'text-[#363e47]'
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    {/* Musical Note Name with Accidental Symbol */}
                    <div className="flex flex-col items-center min-w-0 w-full overflow-hidden my-0.5">
                      <span
                        className={`text-[9px] sm:text-[11px] md:text-xs font-serif font-bold tracking-tight leading-tight truncate w-full text-center ${
                          isActive
                            ? 'text-[#241604]'
                            : isAccidental
                            ? 'text-[#f0f4f8]'
                            : 'text-[#1e2329]'
                        }`}
                      >
                        {tine.note}
                      </span>
                      {isAccidental && (
                        <span
                          className={`text-[8px] sm:text-[9px] font-sans font-bold leading-none mt-0.5 ${
                            isActive ? 'text-[#5a3b08]' : 'text-[#f0c465]'
                          }`}
                        >
                          ♭
                        </span>
                      )}
                    </div>

                    {/* Engraved Instrument Keycap Shortcut */}
                    {shortcut && (
                      <div
                        className={`px-0.5 sm:px-1 py-0.5 rounded text-[7px] sm:text-[8px] md:text-[9px] font-mono font-bold uppercase transition-colors shadow-xs leading-none ${
                          isActive
                            ? 'bg-[#1c1208] text-[#f0c465]'
                            : isAccidental
                            ? 'bg-[#0b1017] text-[#a5c3e8] border border-[#2b3a50]'
                            : 'bg-[#e2e7ed] text-[#424b55] border border-[#b4bec8]'
                        }`}
                      >
                        {shortcut}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
