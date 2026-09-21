import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  MusicBoxPin,
  SANKYO_18_TINES,
  PlayMode,
  CombScaleId,
  TineNote,
  COMB_SCALES_MAP,
  PowerSaveMode,
  isIpadOrMobileDevice,
} from '../types';
import {
  Keyboard,
  Wind,
  Disc,
  Play,
  Pause,
  Gauge,
  RotateCw,
  Zap,
  Sparkles,
  Leaf,
} from 'lucide-react';
import { musicBoxAudio } from '../audio/musicBoxAudio';

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
  onChangeCombScale,
  onPluckTine,
  onSubscribeStep,
  onTogglePlay,
  onWindSpring,
  onSetSpringTension,
  onChangePlayMode,
  onManualCrankAdvance,
}) => {
  const [hoveredTine, setHoveredTine] = useState<number | null>(null);
  const [smoothStep, setSmoothStep] = useState<number>(currentStep);
  const governorFanRef = useRef<SVGGElement | null>(null);
  const nylonGearRef = useRef<SVGGElement | null>(null);
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

  // Step subscription for high-frequency updates without full component re-render overhead
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

  // High-performance Air-Friction Governor & Gear Train Animation Loop with adaptive frame pacing
  useEffect(() => {
    const isCranking = playMode === 'crank' && crankRpm > 0.5;
    const shouldSpin = isPlaying || isCranking;

    if (!shouldSpin) {
      return;
    }

    let animId: number | null = null;
    const targetFps = isEco ? 30 : 60; // 30 FPS for iPad / Eco battery saving; 60 FPS cap on 120Hz ProMotion
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

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animId = requestAnimationFrame(updateGovernor);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animId) {
        cancelAnimationFrame(animId);
      }
    };
  }, [isPlaying, playMode, crankRpm, tempoBpm, springTension, isEco]);

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

  // Dynamic layout calculations for drum & comb top-view coordinates
  // Drum cylinder occupies coordinates: x: 190 to 760 (width 570), y: 40 to 145 (height 105)
  // Comb clamp base: y: 220 to 255 (height 35)
  // Tines extend from comb base (y: 220) upwards to drum strike line (y: 135)
  const drumLeft = 190;
  const drumWidth = 570;
  const drumHeight = 105;
  const drumTop = 40;
  const strikeLineY = drumTop + drumHeight - 8; // y = 137
  const cylinderCenterY = drumTop + drumHeight / 2; // y = 92.5
  const cylinderRadius = drumHeight / 2; // R = 52.5
  // Exact angular position on the cylinder corresponding to comb tine tips (strike line)
  // sin(phiStrike) = (strikeLineY - cylinderCenterY) / cylinderRadius
  const phiStrike = Math.asin((strikeLineY - cylinderCenterY) / cylinderRadius);

  // Calculate visible pins on the revolving drum surface
  // Cylinder wraps totalSteps across 360 degrees.
  // Visible hemisphere in top-down projection corresponds to steps near currentStep.
  const visiblePins = useMemo(() => {
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

      // Angular distance from the comb strike line (radians, cylinder turns top -> comb)
      const angleDelta = (stepDelta / totalSteps) * Math.PI * 2;
      // Pin cylinder surface angle (phi: 0 at horizontal equator, negative towards top, positive towards bottom)
      const phi = phiStrike - angleDelta;

      // Visible arc on the front face of the revolving cylinder:
      // From near top edge (phi ≈ -1.22 rad) to just past comb strike line (phi ≈ 1.25 rad)
      if (phi >= -1.22 && phi <= 1.25) {
        // Authentic orthographic projection of the curved cylindrical surface
        // When stepDelta === 0, angleDelta === 0, phi === phiStrike, and py === strikeLineY exactly
        const py = cylinderCenterY + cylinderRadius * Math.sin(phi);
        const px = drumLeft + (pin.tineIndex + 0.5) * slotWidth;

        // Pin is striking exactly at the comb tine tip
        const isStriking = Math.abs(stepDelta) < 0.65;

        // Surface normal cos(phi) provides natural 3D foreshortening & shading
        const cosPhi = Math.max(0.18, Math.cos(phi));
        // Pins appear foreshortened near top horizon, bright and distinct near strike line
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
  }, [pins, smoothStep, totalSteps, tinesCount, drumLeft, drumWidth, drumHeight, drumTop, cylinderCenterY, cylinderRadius, phiStrike]);

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* Top-View Mechanical Movement Card in Heirloom Burl-Walnut Acoustic Cradle */}
      <div className="relative w-full rounded-3xl burl-walnut-cradle p-3 sm:p-5 border-2 border-[#8a6838]/70 shadow-[0_20px_50px_rgba(14,9,5,0.75)] overflow-hidden">
        {/* Antique Cast Brass Corner Reinforcement Brackets */}
        <div className="absolute top-1 left-1 w-10 h-10 pointer-events-none z-20 brass-corner-bracket">
          <svg viewBox="0 0 40 40" className="w-full h-full">
            <path d="M 2,2 L 38,2 L 38,7 L 9,7 Q 7,7 7,9 L 7,38 L 2,38 Z" fill="#d4af62" stroke="#593f18" strokeWidth="0.9" />
            <circle cx="16" cy="4.5" r="1.5" fill="#fff3c4" stroke="#4a3212" strokeWidth="0.6" />
            <circle cx="4.5" cy="16" r="1.5" fill="#fff3c4" stroke="#4a3212" strokeWidth="0.6" />
          </svg>
        </div>
        <div className="absolute top-1 right-1 w-10 h-10 pointer-events-none z-20 brass-corner-bracket -scale-x-100">
          <svg viewBox="0 0 40 40" className="w-full h-full">
            <path d="M 2,2 L 38,2 L 38,7 L 9,7 Q 7,7 7,9 L 7,38 L 2,38 Z" fill="#d4af62" stroke="#593f18" strokeWidth="0.9" />
            <circle cx="16" cy="4.5" r="1.5" fill="#fff3c4" stroke="#4a3212" strokeWidth="0.6" />
            <circle cx="4.5" cy="16" r="1.5" fill="#fff3c4" stroke="#4a3212" strokeWidth="0.6" />
          </svg>
        </div>
        <div className="absolute bottom-1 left-1 w-10 h-10 pointer-events-none z-20 brass-corner-bracket -scale-y-100">
          <svg viewBox="0 0 40 40" className="w-full h-full">
            <path d="M 2,2 L 38,2 L 38,7 L 9,7 Q 7,7 7,9 L 7,38 L 2,38 Z" fill="#d4af62" stroke="#593f18" strokeWidth="0.9" />
            <circle cx="16" cy="4.5" r="1.5" fill="#fff3c4" stroke="#4a3212" strokeWidth="0.6" />
            <circle cx="4.5" cy="16" r="1.5" fill="#fff3c4" stroke="#4a3212" strokeWidth="0.6" />
          </svg>
        </div>
        <div className="absolute bottom-1 right-1 w-10 h-10 pointer-events-none z-20 brass-corner-bracket -scale-100">
          <svg viewBox="0 0 40 40" className="w-full h-full">
            <path d="M 2,2 L 38,2 L 38,7 L 9,7 Q 7,7 7,9 L 7,38 L 2,38 Z" fill="#d4af62" stroke="#593f18" strokeWidth="0.9" />
            <circle cx="16" cy="4.5" r="1.5" fill="#fff3c4" stroke="#4a3212" strokeWidth="0.6" />
            <circle cx="4.5" cy="16" r="1.5" fill="#fff3c4" stroke="#4a3212" strokeWidth="0.6" />
          </svg>
        </div>

        {/* Ambient Warm Golden Glows */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#c99f52]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-[#a67c3b]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header: Model Badge, Real Tone Count, Quick Play Control & Live Movement Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-xs sm:text-sm text-[#caa87c]">
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f0c465] shadow-sm shadow-[#f0c465]/70 animate-pulse" />
            <span className="font-serif tracking-wider uppercase text-[#faebd4] font-bold">
              {COMB_SCALES_MAP[combScaleId]?.name || 'Sankyo 18N'} • Top-View Movement
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2b1e13] border border-[#523c24] text-[#caa87c] font-mono">
              {tinesCount} Tines • {COMB_SCALES_MAP[combScaleId]?.rangeLabel || ''}
            </span>
            {isEco && (
              <span
                className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-[#1b2b18] border border-[#3b5e28] text-[#86efac] text-[10px] font-serif font-semibold"
                title="Eco Power Saving Mode active: 30 FPS governor pacing, GPU-optimized glows, and Web Audio auto-sleep"
              >
                <Leaf className="w-3 h-3 text-[#4ade80]" />
                <span className="hidden xs:inline">Eco</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 sm:space-x-2.5 text-xs font-serif text-[#a68d72]">
            <div className="flex items-center space-x-1">
              <Disc className="w-3.5 h-3.5 text-[#f0c465]" />
              <span>Step:</span>
              <span className="font-mono text-[#faebd4] font-bold">
                {Math.round(smoothStep) + 1} / {totalSteps}
              </span>
            </div>

            {/* Live Governed Tempo Badge */}
            <div
              className="hidden sm:flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-[#2b1e13] border border-[#523c24] text-[#caa87c] text-[11px]"
              title={`Governed Tempo: ${tempoBpm} BPM (Regulated by the air-friction speed governor)`}
            >
              <Gauge className="w-3 h-3 text-[#f0c465]" />
              <span className="font-serif text-[#a68d72]">Tempo:</span>
              <span className="font-mono text-[#faebd4] font-bold">
                {playMode === 'crank' && crankRpm > 0 ? `≈ ${Math.round(crankRpm * 1.35)}` : tempoBpm} BPM
              </span>
            </div>

            {/* Quick Mechanical Drive Mode & Winding Jog Dial */}
            {(onWindSpring || onChangePlayMode) && (
              <div
                className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-[#241a0e] border border-[#523c24] text-xs shadow-xs"
                title={
                  playMode === 'spring'
                    ? `Spring Tension: ${Math.round(springTension * 100)}% (${(springTension * 3).toFixed(1)} / 3.0 Rounds)\n• Click knob to wind +33% (1 round)\n• Drag/spin dial to wind manually\n• Click mode icon to switch drive mode`
                    : playMode === 'crank'
                    ? 'Hand Crank Jog Dial:\n• Drag or spin clockwise to manually play the melody\n• Click mode icon to switch drive mode'
                    : 'Continuous Electric Drive Active\n• Click mode icon to switch drive mode'
                }
              >
                {/* Mode Selector Toggle */}
                {onChangePlayMode && (
                  <button
                    id="header-drive-mode-btn"
                    onClick={handleCyclePlayMode}
                    title={`Current Mode: ${
                      playMode === 'spring'
                        ? 'Wind-Up Spring (Click to switch to Hand Crank)'
                        : playMode === 'crank'
                        ? 'Hand Crank (Click to switch to Continuous)'
                        : 'Continuous Electric (Click to switch to Spring)'
                    }`}
                    className="p-1 rounded bg-[#19110a] hover:bg-[#382614] text-[#faebd4] border border-[#4a341e] transition cursor-pointer flex items-center justify-center"
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

                {/* Tactile Rotary Jog Dial */}
                <div
                  ref={miniJogRef}
                  onPointerDown={handleJogPointerDown}
                  onPointerMove={handleJogPointerMove}
                  onPointerUp={handleJogPointerUp}
                  onPointerCancel={handleJogPointerUp}
                  className={`relative w-6 h-6 rounded-full bg-gradient-to-tr from-[#3a2818] via-[#5c4226] to-[#26190e] border border-[#bfa175]/60 hover:border-[#ffeaa7] shadow-inner flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none transition-transform shrink-0 ${
                    isJogDragging ? 'scale-105 ring-2 ring-[#f0c465]/50' : ''
                  }`}
                >
                  {/* Tension Gauge Arc in Spring Mode */}
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

                  {/* Brass Crossbar Notch */}
                  <div
                    className="relative z-10 w-3.5 h-1 rounded-full bg-gradient-to-r from-[#9e7b36] via-[#fae7b5] to-[#9e7b36] border border-[#ffe787]/50 pointer-events-none shadow-2xs"
                    style={{ transform: `rotate(${jogRotationAngle}rad)` }}
                  />
                </div>

                {/* Tension % or Jog Status */}
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
                    <span className="font-mono text-[10px] text-[#faebd4] font-bold">
                      {Math.round(springTension * 100)}%
                    </span>
                  ) : playMode === 'crank' ? (
                    <span className="font-mono text-[10px] text-[#faebd4] font-bold">
                      Jog
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-[#faebd4] font-bold">
                      Auto
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Quick Mechanical Play / Pause Control Button */}
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
                    ? 'Engage mechanical brake (Stop / Pause)'
                    : playMode === 'spring' && springTension <= 0.005
                    ? 'Auto-wind & release mechanical brake (Play)'
                    : 'Release mechanical brake (Play)'
                }
                className={`px-2.5 py-1 rounded-lg border text-xs font-serif font-bold flex items-center space-x-1.5 transition-all duration-150 cursor-pointer select-none active:scale-95 shadow-xs ${
                  isPlaying
                    ? 'bg-gradient-to-r from-[#d6be8e] via-[#f0c465] to-[#c99432] text-[#1c1208] border-[#f3e18a] shadow-[0_0_12px_rgba(240,196,101,0.6)]'
                    : 'bg-gradient-to-b from-[#2a1d12] via-[#20150b] to-[#140c06] hover:bg-[#382614] text-[#faebd4] border-[#8a6838] hover:border-[#dfc282]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    isPlaying
                      ? 'bg-[#10b981] animate-pulse shadow-[0_0_5px_#34d399]'
                      : 'bg-[#d6be8e]'
                  }`}
                />
                {isPlaying ? (
                  <>
                    <Pause className="w-3 h-3 fill-current" />
                    <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold">Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current text-[#f0c465]" />
                    <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold text-[#faebd4]">Play</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* TOP-VIEW MECHANICAL MOVEMENT SVG VIEWPORT IN RECESSED SOUND CAVITY */}
        <div className="relative w-full aspect-[780/270] bg-[#0d0905] rounded-2xl border-2 border-[#543b1c] overflow-hidden shadow-[inset_0_4px_20px_rgba(0,0,0,0.9),0_6px_20px_rgba(0,0,0,0.5)] ring-1 ring-[#c99f52]/40 flex items-center justify-center">
          <svg
            viewBox="0 0 780 270"
            className="w-full h-full block"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Cast Brass Bedplate Gradient */}
              <radialGradient id="brassBedplateGrad" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="#b6955c" />
                <stop offset="60%" stopColor="#9a7a44" />
                <stop offset="100%" stopColor="#684f27" />
              </radialGradient>

              {/* Polished Gold Cylinder Lathe Gradient with 3D Specular Highlight Sweep */}
              <linearGradient id="drumLatheGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#fdf2b8" />
                <stop offset="8%" stopColor="#dfbf6d" />
                <stop offset="22%" stopColor="#fff9de" />
                <stop offset="38%" stopColor="#c79f4c" />
                <stop offset="65%" stopColor="#9e7b36" />
                <stop offset="82%" stopColor="#e8cf83" />
                <stop offset="100%" stopColor="#634515" />
              </linearGradient>

              {/* Mainspring Drum Cap Gradient */}
              <radialGradient id="springCapGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fae7b5" />
                <stop offset="55%" stopColor="#d4af62" />
                <stop offset="88%" stopColor="#9e7b36" />
                <stop offset="100%" stopColor="#5e4418" />
              </radialGradient>

              {/* Brushed Steel Comb Base Gradient */}
              <linearGradient id="combBaseGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#e8edf3" />
                <stop offset="35%" stopColor="#c5cbd2" />
                <stop offset="70%" stopColor="#9ea5ad" />
                <stop offset="100%" stopColor="#646b73" />
              </linearGradient>

              {/* Steel Tine Normal Gradient */}
              <linearGradient id="steelTineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="22%" stopColor="#dbe2ea" />
                <stop offset="75%" stopColor="#9aa1a9" />
                <stop offset="100%" stopColor="#5f666f" />
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

            {/* 1. CAST BRASS BEDPLATE BASE */}
            <rect
              x="12"
              y="12"
              width="756"
              height="246"
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
              height="230"
              rx="12"
              fill="none"
              stroke="#593f18"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              opacity="0.65"
            />

            {/* Traditional Cast Inscription Plaque ("聲 盒 仔" & Authentic Seal) */}
            <g transform="translate(38, 222)">
              <rect
                x="0"
                y="0"
                width="116"
                height="22"
                rx="4"
                fill="#4a3415"
                stroke="#caa35c"
                strokeWidth="1"
              />
              <text
                x="58"
                y="15"
                textAnchor="middle"
                fill="#f5e1a4"
                fontFamily='"Noto Serif TC", "Songti TC", serif'
                fontSize="12"
                fontWeight="bold"
                letterSpacing="4"
              >
                聲 盒 仔
              </text>
              {/* Little Sankyo stamp on the left */}
              <circle cx="10" cy="11" r="5" fill="#caa35c" opacity="0.6" />
              <text x="10" y="14" textAnchor="middle" fill="#2d1c08" fontSize="8" fontWeight="bold">
                安
              </text>
            </g>

            {/* Bedplate Mounting Screws */}
            {[
              { cx: 32, cy: 32 },
              { cx: 748, cy: 32 },
              { cx: 748, cy: 238 },
              { cx: 32, cy: 198 },
            ].map((screw, sIdx) => (
              <g key={`bed-screw-${sIdx}`} transform={`translate(${screw.cx}, ${screw.cy})`}>
                <circle r="9" fill="url(#chromeScrewGrad)" stroke="#2b2011" strokeWidth="1" />
                <line x1="-6" y1="-2" x2="6" y2="2" stroke="#1c1409" strokeWidth="2.2" strokeLinecap="round" />
              </g>
            ))}

            {/* 2. MAINSPRING HOUSING (LEFT) */}
            <g
              transform="translate(95, 92)"
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
              {/* Spring Drum Wall Shadow */}
              <circle r="62" fill="#2d1f0c" opacity="0.75" />
              {/* Outer Lathe Turned Brass Drum Rim */}
              <circle r="58" fill="url(#springCapGrad)" stroke="#523912" strokeWidth="2.5" />
              <circle r="51" fill="none" stroke="#fae7b5" strokeWidth="1.2" opacity="0.6" strokeDasharray="3 3" />
              <circle r="44" fill="#8c6a28" stroke="#422c0b" strokeWidth="1" />
              <circle r="42" fill="url(#springCapGrad)" />

              {/* Sankyo Lyre / Harp Emblem Inscription */}
              <g transform="translate(0, -4)">
                {/* Lyre Harp Arms */}
                <path
                  d="M -16,-12 C -24,-8 -22,12 -10,20 L -4,24 L 4,24 L 10,20 C 22,12 24,-8 16,-12 C 12,-16 8,-12 12,-8 C 15,-4 14,8 6,14 L -6,14 C -14,8 -15,-4 -12,-8 C -8,-12 -12,-16 -16,-12 Z"
                  fill="#473110"
                />
                {/* Lyre Strings */}
                <line x1="-5" y1="-6" x2="-5" y2="18" stroke="#fae7b5" strokeWidth="1.5" />
                <line x1="0" y1="-8" x2="0" y2="19" stroke="#fae7b5" strokeWidth="1.5" />
                <line x1="5" y1="-6" x2="5" y2="18" stroke="#fae7b5" strokeWidth="1.5" />
              </g>

              {/* Center Arbor Screw Rivet */}
              <circle r="8" fill="url(#chromeScrewGrad)" stroke="#2b2011" strokeWidth="1" />
              <line x1="-5" y1="0" x2="5" y2="0" stroke="#1c1409" strokeWidth="2" />
            </g>

            {/* 3. HOROLOGICAL SPEED GOVERNOR & GEAR TRAIN (BOTTOM LEFT) */}
            <g transform="translate(100, 185)">
              {/* Intermediate Ivory Nylon / Phosphor Bronze Meshing Gear */}
              <g ref={nylonGearRef} style={{ willChange: 'transform' }}>
                <circle r="26" fill="#f8f4e2" stroke="#d5caa8" strokeWidth="1.5" />
                {/* Involute Gear Teeth */}
                {Array.from({ length: 18 }).map((_, gIdx) => {
                  const gAngle = (gIdx / 18) * Math.PI * 2;
                  const tx = Math.cos(gAngle) * 26;
                  const ty = Math.sin(gAngle) * 26;
                  return (
                    <circle
                      key={`gear-tooth-${gIdx}`}
                      cx={tx}
                      cy={ty}
                      r="2.5"
                      fill="#e6dbc0"
                      stroke="#ab9f7a"
                      strokeWidth="0.8"
                    />
                  );
                })}
                <circle r="9" fill="#caa35c" stroke="#8a6b3e" strokeWidth="1" />
                {/* Center Arbor Screw */}
                <circle r="3.5" fill="url(#chromeScrewGrad)" stroke="#3a2a16" strokeWidth="0.6" />
              </g>

              {/* Helical Worm Screw Spindle Meshing with Cylinder Spur Gear */}
              <g transform="translate(24, 0)">
                <rect x="-3.5" y="-18" width="7" height="36" rx="2" fill="url(#wormScrewGrad)" stroke="#4a3418" strokeWidth="0.8" />
                {[-13, -7, -1, 5, 11].map((sy, i) => (
                  <line key={`worm-thread-${i}`} x1="-3.5" y1={sy} x2="3.5" y2={sy + 3} stroke="#fae7b5" strokeWidth="1.2" />
                ))}
                {/* Upper and Lower Pivot Ruby Bearings */}
                <circle cx="0" cy="-18" r="3" fill="url(#rubyJewelGrad)" stroke="#590d22" strokeWidth="0.6" />
                <circle cx="0" cy="18" r="3" fill="url(#rubyJewelGrad)" stroke="#590d22" strokeWidth="0.6" />
              </g>

              {/* Governor Flywheel Spindle & Air-Friction Butterfly Fan */}
              <g transform="translate(44, -6)">
                {/* Horological Teardrop Top Cock Bracket with Polished Chamfer */}
                <path
                  d="M -16,0 C -16,-10 16,-10 16,0 L 8,16 L -8,16 Z"
                  fill="#d4af62"
                  stroke="#684f27"
                  strokeWidth="1.2"
                />
                {/* Bracket Screws */}
                <circle cx="0" cy="11" r="2.2" fill="url(#chromeScrewGrad)" stroke="#3a2a16" strokeWidth="0.5" />

                {/* Spinning Dual-Vane Butterfly Air Fan */}
                <g ref={governorFanRef} id="governorFan" style={{ willChange: 'transform' }}>
                  {/* Blade 1 */}
                  <rect
                    x="-24"
                    y="-5"
                    width="48"
                    height="10"
                    rx="2"
                    fill="#18181c"
                    stroke="#484852"
                    strokeWidth="0.9"
                  />
                  {/* Blade 2 (Cross) */}
                  <rect
                    x="-5"
                    y="-24"
                    width="10"
                    height="48"
                    rx="2"
                    fill="#18181c"
                    stroke="#484852"
                    strokeWidth="0.9"
                  />
                  {/* Specular Vane Edge Highlight */}
                  <line x1="-22" y1="-4" x2="22" y2="-4" stroke="#71717a" strokeWidth="0.8" opacity="0.6" />
                  <line x1="-4" y1="-22" x2="-4" y2="22" stroke="#71717a" strokeWidth="0.8" opacity="0.6" />
                  {/* Center Turned Brass Hub */}
                  <circle r="6" fill="#f0c465" stroke="#7a5518" strokeWidth="1" />
                </g>

                {/* Center Pivot Synthetic Ruby Jewel Bearing */}
                <circle r="3.5" fill="url(#rubyJewelGrad)" stroke="#4c0519" strokeWidth="0.8" />
                <circle cx="-1" cy="-1" r="1.2" fill="#ffffff" opacity="0.85" />
              </g>
            </g>

            {/* 4. REVOLVING BRASS CYLINDER (DRUM) */}
            <g>
              {/* Cylinder Shadow */}
              <rect
                x={drumLeft - 4}
                y={drumTop + 4}
                width={drumWidth + 8}
                height={drumHeight + 6}
                rx="8"
                fill="#1e1409"
                opacity="0.7"
              />

              {/* Left Bronze Spur Ring Gear */}
              <rect
                x={drumLeft - 16}
                y={drumTop - 4}
                width="16"
                height={drumHeight + 8}
                rx="3"
                fill="#8a6336"
                stroke="#543b1c"
                strokeWidth="1.5"
              />
              {Array.from({ length: 14 }).map((_, i) => (
                <rect
                  key={`cyl-gear-tooth-${i}`}
                  x={drumLeft - 19}
                  y={drumTop - 2 + i * 8}
                  width="4"
                  height="4.5"
                  rx="1"
                  fill="#caa35c"
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

              {/* Right Axle Pillar Bearing */}
              <rect
                x={drumLeft + drumWidth}
                y={drumTop - 6}
                width="16"
                height={drumHeight + 12}
                rx="4"
                fill="#b6955c"
                stroke="#593f18"
                strokeWidth="1.5"
              />
              <g transform={`translate(${drumLeft + drumWidth + 8}, ${drumTop + drumHeight / 2})`}>
                <circle r="6.5" fill="url(#chromeScrewGrad)" stroke="#2b2011" strokeWidth="1" />
                <line x1="-4" y1="-1" x2="4" y2="1" stroke="#1c1409" strokeWidth="1.8" />
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
                x={drumLeft + drumWidth - 28}
                y={drumTop + 24}
                fill="#61461f"
                fontSize="10"
                fontFamily="monospace"
                fontWeight="bold"
                opacity="0.8"
              >
                18001
              </text>

              {/* Dynamic Vertical Tine Alignment Grid Lines (Subtle Guides) */}
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
                  {/* Cast shadow projection against curved brass drum surface */}
                  <ellipse
                    cx={1.8 * item.scale}
                    cy={2.8 * item.scale}
                    rx={3.2 * item.scale}
                    ry={1.6 * item.scale}
                    fill="#140b04"
                    opacity={item.opacity * 0.65}
                  />
                  {/* Pin Strike Glow Spark */}
                  {item.isStriking && (
                    <circle
                      r={isEco ? 8 : 11}
                      fill="#ffeb99"
                      opacity={isEco ? 0.95 : 0.85}
                      filter={isEco ? undefined : 'url(#sparkGlow)'}
                    />
                  )}
                  {/* 3D Pin Bead Needle Peg */}
                  <circle
                    r={3.8 * item.scale}
                    fill="url(#pinBeadGrad)"
                    stroke="#5e3e07"
                    strokeWidth="0.75"
                    opacity={item.opacity}
                  />
                  {/* Specular Highlight Point */}
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
                opacity="0.4"
              />
            </g>

            {/* 5. TUNED STEEL COMB (BOTTOM / CENTER-RIGHT) */}
            <g>
              {/* Solid Brushed Steel Clamp Base Plate */}
              <path
                d={`M ${drumLeft - 8},218 L ${drumLeft + drumWidth + 8},218 L ${drumLeft + drumWidth + 4},254 L ${drumLeft - 4},254 Z`}
                fill="url(#combBaseGrad)"
                stroke="#474e55"
                strokeWidth="1.8"
                filter="drop-shadow(0 6px 12px rgba(0,0,0,0.6))"
              />

              {/* Two Large Slotted Dome Screws on Comb Base Clamp */}
              <g transform={`translate(${drumLeft + 35}, 236)`}>
                <circle r="12" fill="url(#chromeScrewGrad)" stroke="#2b3138" strokeWidth="1.2" />
                <line x1="-8" y1="0" x2="8" y2="0" stroke="#16181b" strokeWidth="2.5" strokeLinecap="round" />
              </g>
              <g transform={`translate(${drumLeft + drumWidth - 35}, 236)`}>
                <circle r="12" fill="url(#chromeScrewGrad)" stroke="#2b3138" strokeWidth="1.2" />
                <line x1="-8" y1="0" x2="8" y2="0" stroke="#16181b" strokeWidth="2.5" strokeLinecap="round" />
              </g>

              {/* Tuned Spring Steel Tines Extending Upwards to Drum with Physical Tapering */}
              {tinesList.map((tine, idx) => {
                const slotW = drumWidth / tinesCount;
                const tx = drumLeft + (idx + 0.5) * slotW;
                // Physical tapering: bass notes are wider (up to 86% of slot), treble tines taper fine (58% of slot)
                const taperRatio = 0.86 - (idx / Math.max(1, tinesCount - 1)) * 0.28;
                const tineWidth = Math.max(4, slotW * taperRatio);
                const isActive = activeTines.has(idx);
                const isHovered = hoveredTine === idx;
                const isBass = idx < Math.ceil(tinesCount * 0.35);

                // Physical pin contact deflection: tine deflects downward 2.2px on contact
                const tineTopY = strikeLineY + (isActive ? 2.2 : 0);
                const tineBottomY = 222;

                return (
                  <g
                    key={`steel-tine-${idx}`}
                    onClick={() => onPluckTine(idx)}
                    onMouseEnter={() => setHoveredTine(idx)}
                    onMouseLeave={() => setHoveredTine(null)}
                    className="cursor-pointer"
                  >
                    {/* Tine Active Vibration Excitation Wave */}
                    {isActive && (
                      <rect
                        x={tx - tineWidth / 2 - 3}
                        y={tineTopY - 4}
                        width={tineWidth + 6}
                        height={tineBottomY - tineTopY + 8}
                        rx="3"
                        fill="#ffea8a"
                        opacity={isEco ? 0.6 : 0.45}
                        filter={isEco ? undefined : 'url(#sparkGlow)'}
                      />
                    )}

                    {/* Main Steel Tine Beam */}
                    <rect
                      x={tx - tineWidth / 2}
                      y={tineTopY}
                      width={tineWidth}
                      height={tineBottomY - tineTopY}
                      rx="1.5"
                      fill={isActive ? 'url(#tineGlowGrad)' : isHovered ? '#f0f3f6' : 'url(#steelTineGrad)'}
                      stroke={isActive ? '#ffe58f' : '#454c54'}
                      strokeWidth={isActive ? '1.5' : '1'}
                    />

                    {/* Polished Steel Specular Bevel Stripe */}
                    <line
                      x1={tx - tineWidth / 4}
                      y1={tineTopY + 2}
                      x2={tx - tineWidth / 4}
                      y2={tineBottomY - 2}
                      stroke="#ffffff"
                      strokeWidth={Math.max(1, tineWidth * 0.2)}
                      opacity={isActive ? 0.95 : 0.65}
                    />

                    {/* Longitudinal brushed grain striation */}
                    <line
                      x1={tx + tineWidth / 5}
                      y1={tineTopY + 4}
                      x2={tx + tineWidth / 5}
                      y2={tineBottomY - 4}
                      stroke="#808892"
                      strokeWidth="0.6"
                      opacity="0.5"
                    />

                    {/* Lead Tuning Counterweights Soldered Underneath Low Bass Tines */}
                    {isBass && (
                      <g>
                        <rect
                          x={tx - tineWidth / 2 + 0.5}
                          y={tineTopY + 8}
                          width={tineWidth - 1}
                          height={10 + (Math.ceil(tinesCount * 0.35) - idx) * 1.8}
                          rx="1"
                          fill="#2a2e35"
                          stroke="#181b20"
                          strokeWidth="0.8"
                          opacity="0.95"
                        />
                        {/* Soldered seam bead */}
                        <rect
                          x={tx - tineWidth / 2 + 1}
                          y={tineTopY + 7.5}
                          width={tineWidth - 2}
                          height="1.2"
                          fill="#98a0aa"
                          opacity="0.85"
                        />
                      </g>
                    )}

                    {/* Tine Tip Pin Contact Bevel */}
                    <path
                      d={`M ${tx - tineWidth / 2},${tineTopY + 3} L ${tx},${tineTopY} L ${tx + tineWidth / 2},${tineTopY + 3} Z`}
                      fill={isActive ? '#ffffff' : '#d8dde2'}
                    />
                  </g>
                );
              })}

              {/* Striking Pin Highlight Overlay (Ensures pin bead and spark shine right at the comb contact point) */}
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
                  <circle
                    cx={-1.3}
                    cy={-1.3}
                    r={1.4}
                    fill="#ffffff"
                  />
                </g>
              ))}
            </g>
          </svg>
        </div>

        {/* 6. DEDICATED INTERACTIVE COMB KEYBOARD DIRECTLY UNDERNEATH */}
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[#523c24]/70 flex flex-col space-y-2.5 w-full">
          {/* Header Row: Title & Active Count + Concise Comb Scale Pills Selector */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-1">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <Keyboard className="w-4 h-4 text-[#f0c465]" />
              <span className="font-serif text-xs sm:text-sm font-semibold text-[#faebd4]">
                Interactive Comb Keyboard
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2b1e13] border border-[#523c24] text-[#caa87c] font-mono font-medium">
                {tinesCount} Notes • {COMB_SCALES_MAP[combScaleId]?.rangeLabel || ''}
              </span>
            </div>

            {/* Concise Comb Type Switcher Pills */}
            {onChangeCombScale && (
              <div className="flex items-center space-x-1 p-1 rounded-xl bg-[#120d08] border border-[#523c24] overflow-x-auto max-w-full">
                <span className="text-[10px] uppercase font-serif text-[#9e8568] px-1.5 hidden lg:inline shrink-0 font-medium">
                  Comb Scale:
                </span>
                {(Object.keys(COMB_SCALES_MAP) as CombScaleId[]).map((scaleKey) => {
                  const scale = COMB_SCALES_MAP[scaleKey];
                  const isSelected = combScaleId === scaleKey;
                  return (
                    <button
                      key={scale.id}
                      id={`keyboard-comb-pill-${scale.id}`}
                      onClick={() => onChangeCombScale(scaleKey)}
                      title={`${scale.name} (${scale.tinesCount} Tines • ${scale.rangeLabel})\n${scale.description}`}
                      className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-serif shrink-0 transition-all cursor-pointer flex items-center space-x-1 ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#d6be8e] via-[#f0c465] to-[#c99432] text-[#1c1208] font-bold shadow-xs border border-[#f3e18a]'
                          : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#2b1e13] border border-transparent'
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
            <span className="font-serif text-[#a68d72]">
              Tap keys, click top-view tines, or press{' '}
              <kbd className="px-1.5 py-0.5 bg-[#17110a] border border-[#523c24] rounded text-[10px] font-mono text-[#f0c465] font-semibold">1-0</kbd>{' '}
              <kbd className="px-1.5 py-0.5 bg-[#17110a] border border-[#523c24] rounded text-[10px] font-mono text-[#f0c465] font-semibold">Q-P</kbd>{' '}
              {tinesCount > 20 && (
                <kbd className="px-1.5 py-0.5 bg-[#17110a] border border-[#523c24] rounded text-[10px] font-mono text-[#f0c465] font-semibold">A-;</kbd>
              )}
            </span>
            <span className="text-[10px] font-serif text-[#caa87c] hidden sm:inline">
              Sharp/Flat (♭/♯) keys elevated for easy tactile playing
            </span>
          </div>

          {/* Dynamic Keyboard Keys Rack with Elevated Spring-Steel Comb Tines & Glissando Multi-Touch Support */}
          <div className="w-full pt-2 pb-1">
            {/* Machined Brass Bedplate Clamp Bar */}
            <div className="w-full h-2 rounded-t-md bg-gradient-to-r from-[#5a3e1b] via-[#c9a050] to-[#5a3e1b] border-b border-[#2d1e0c] flex justify-between px-2 sm:px-4 items-center shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#dbe2ea] border border-[#2d3138] inline-block" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#dbe2ea] border border-[#2d3138] inline-block" />
            </div>

            <div
              onPointerDown={handleKeyboardPointerDown}
              onPointerMove={handleKeyboardPointerMove}
              onPointerUp={handleKeyboardPointerUp}
              className="w-full flex items-end gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-b-xl bg-[#100b07] border-x border-b border-[#523c24]/90 shadow-inner select-none touch-none"
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
                    title={`Note #${idx + 1}: ${tine.note} (${tine.frequency ? tine.frequency.toFixed(1) + ' Hz' : ''})${tine.flatEnharmonic ? ` • ${tine.flatEnharmonic}` : ''} • Keyboard shortcut: [${shortcut || ''}]`}
                    className={`group relative flex-1 min-w-0 flex flex-col items-center justify-between px-0.5 sm:px-1 py-1 sm:py-1.5 rounded sm:rounded-lg border transition-all select-none cursor-pointer ${
                      isAccidental
                        ? 'h-22 sm:h-26 md:h-28 -translate-y-2 sm:-translate-y-2.5 z-20 blued-steel-key border-[#3b4e6d]'
                        : 'h-19 sm:h-23 md:h-25 translate-y-0 z-10 spring-steel-key border-[#88929e]'
                    } ${
                      isActive
                        ? 'bg-gradient-to-b from-[#fff0b3] via-[#f0c465] to-[#c99432]! text-[#1c1208]! border-[#ffe8a3]! shadow-[0_0_16px_rgba(240,196,101,0.95)]! ring-2 ring-[#ffe082] translate-y-1 z-30 tine-vibrating'
                        : isHovered
                        ? isAccidental
                          ? 'brightness-125 border-[#6b8bb8] shadow-md'
                          : 'brightness-110 border-[#b0b8c2] shadow-sm'
                        : ''
                    }`}
                  >
                    {/* Top Tuned Pin Notch Accent */}
                    <div
                      className={`w-1.5 sm:w-2 h-1 rounded-full mb-0.5 transition-colors ${
                        isActive
                          ? 'bg-[#7a5416]'
                          : isAccidental
                          ? 'bg-[#d4af37] shadow-[0_0_4px_rgba(212,175,55,0.8)]'
                          : 'bg-[#5a6572]'
                      }`}
                    />

                    {/* Note Number (#1, #2, etc.) */}
                    <span
                      className={`text-[8px] sm:text-[9px] md:text-[10px] font-mono font-bold leading-none ${
                        isActive
                          ? 'text-[#3d2706]'
                          : isAccidental
                          ? 'text-[#9ec0e6]'
                          : 'text-[#363e47]'
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    {/* Musical Note Name with Elevated Accidental Badge */}
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

                    {/* Keyboard Shortcut Keycap Badge Styled Like Vintage Instrument Keycap */}
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
