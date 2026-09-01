import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayMode } from '../types';
import {
  RotateCw,
  Zap,
  Disc,
  Gauge,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Wind,
  ShieldCheck,
  Plus,
  Minus,
  Sliders,
} from 'lucide-react';
import { musicBoxAudio } from '../audio/musicBoxAudio';

interface WindingKeyProps {
  playMode: PlayMode;
  onChangePlayMode: (mode: PlayMode) => void;
  springTension: number; // 0 to 1
  onWindSpring: (addedTension: number) => void;
  onSetSpringTension?: (tension: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onManualCrankAdvance?: (deltaAngle: number, currentRpm: number) => void;
  onRewind?: () => void;
  tempoBpm?: number;
  onChangeTempoBpm?: (bpm: number) => void;
}

export const WindingKey: React.FC<WindingKeyProps> = ({
  playMode,
  onChangePlayMode,
  springTension,
  onWindSpring,
  onSetSpringTension,
  isPlaying,
  onTogglePlay,
  onManualCrankAdvance,
  onRewind,
  tempoBpm = 88,
  onChangeTempoBpm,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  // Animation & Visual Feedback Refs
  const crankRpmDisplayRef = useRef<HTMLSpanElement | null>(null);
  const crankBpmDisplayRef = useRef<HTMLDivElement | null>(null);
  const crankSpeedBarRef = useRef<HTMLDivElement | null>(null);
  const crankRotorRef = useRef<HTMLDivElement | null>(null);
  const crankRpmValueRef = useRef(0);

  // Physics Simulation Refs
  const crankAngleRef = useRef(0);
  const angularVelocityRef = useRef(0); // in radians / second
  const isDraggingRef = useRef(false);
  const lastPointerAngleRef = useRef(0);
  const lastPointerTimeRef = useRef(0);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const crankWheelRef = useRef<HTMLDivElement | null>(null);
  const reverseRatchetAccumRef = useRef(0);
  const springRatchetAccumRef = useRef(0);
  const lastPhysicsTimeRef = useRef(performance.now());
  const reqAnimIdRef = useRef<number | null>(null);
  const onManualCrankAdvanceRef = useRef(onManualCrankAdvance);
  const onWindSpringRef = useRef(onWindSpring);

  // Governor & Physics constants
  const MAX_GOVERNED_SPEED = 8.0;
  const MAX_DELTA_PER_EVENT = 0.22;
  const DAMPING_COEFFICIENT = 0.935;

  const updateCrankVisuals = useCallback((angle: number, rpm: number) => {
    crankRpmValueRef.current = rpm;
    if (crankRotorRef.current) {
      crankRotorRef.current.style.transform = `rotate(${angle}rad)`;
    }
    if (crankRpmDisplayRef.current) {
      crankRpmDisplayRef.current.textContent = `${rpm} RPM`;
    }
    if (crankBpmDisplayRef.current) {
      const bpm = Math.round(rpm * 1.35);
      crankBpmDisplayRef.current.textContent = rpm > 0 ? `≈ ${bpm} BPM` : 'Resting';
    }
    if (crankSpeedBarRef.current) {
      crankSpeedBarRef.current.style.width = `${Math.min(100, (rpm / 85) * 100)}%`;
    }
  }, []);

  // Keep callback refs updated
  useEffect(() => {
    onManualCrankAdvanceRef.current = onManualCrankAdvance;
    onWindSpringRef.current = onWindSpring;
  }, [onManualCrankAdvance, onWindSpring]);

  // Physics Engine Loop for Flywheel Inertia & Coasting (Crank mode)
  const isLoopRunningRef = useRef(false);

  const startPhysicsLoopIfNeeded = useCallback(() => {
    if (isLoopRunningRef.current || playMode !== 'crank') return;

    isLoopRunningRef.current = true;
    lastPhysicsTimeRef.current = performance.now();
    let lastRenderTime = performance.now();
    const frameInterval = 1000 / 24; // 24 FPS cap for maximum battery and thermal efficiency

    const physicsLoop = (timestamp: number) => {
      if (playMode !== 'crank' || document.hidden) {
        isLoopRunningRef.current = false;
        return;
      }

      const elapsed = timestamp - lastRenderTime;
      if (elapsed >= frameInterval) {
        lastRenderTime = timestamp - (elapsed % frameInterval);

        const dtMs = Math.min(60, Math.max(1, timestamp - lastPhysicsTimeRef.current));
        const dtSec = dtMs / 1000;
        lastPhysicsTimeRef.current = timestamp;

        if (!isDraggingRef.current) {
          let currentVel = angularVelocityRef.current;
          currentVel *= Math.pow(DAMPING_COEFFICIENT, dtSec / 0.016);

          if (currentVel > 0.04) {
            angularVelocityRef.current = currentVel;
            const delta = currentVel * dtSec;
            crankAngleRef.current += delta;

            const rpm = Math.round((currentVel * 60) / (2 * Math.PI));
            updateCrankVisuals(crankAngleRef.current, rpm);
            onManualCrankAdvanceRef.current?.(delta, rpm);
          } else {
            angularVelocityRef.current = 0;
            updateCrankVisuals(crankAngleRef.current, 0);
            onManualCrankAdvanceRef.current?.(0, 0);
            isLoopRunningRef.current = false;
            return;
          }
        }
      }

      reqAnimIdRef.current = requestAnimationFrame(physicsLoop);
    };

    reqAnimIdRef.current = requestAnimationFrame(physicsLoop);
  }, [playMode, updateCrankVisuals]);

  useEffect(() => {
    setIsDragging(false);
    isDraggingRef.current = false;
    angularVelocityRef.current = 0;
    updateCrankVisuals(crankAngleRef.current, 0);
    reverseRatchetAccumRef.current = 0;
    springRatchetAccumRef.current = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (reqAnimIdRef.current) {
          cancelAnimationFrame(reqAnimIdRef.current);
          reqAnimIdRef.current = null;
        }
        isLoopRunningRef.current = false;
      } else if (playMode === 'crank' && angularVelocityRef.current > 0.04) {
        startPhysicsLoopIfNeeded();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (playMode === 'crank') {
      startPhysicsLoopIfNeeded();
    } else {
      if (reqAnimIdRef.current) {
        cancelAnimationFrame(reqAnimIdRef.current);
        reqAnimIdRef.current = null;
      }
      isLoopRunningRef.current = false;
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reqAnimIdRef.current) {
        cancelAnimationFrame(reqAnimIdRef.current);
        reqAnimIdRef.current = null;
      }
      isLoopRunningRef.current = false;
    };
  }, [playMode, startPhysicsLoopIfNeeded, updateCrankVisuals]);

  // Pointer Down on Crank Wheel / Butterfly Key
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!crankWheelRef.current) return;
    const rect = crankWheelRef.current.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    lastPointerAngleRef.current = Math.atan2(
      e.clientY - centerRef.current.y,
      e.clientX - centerRef.current.x
    );
    lastPointerTimeRef.current = performance.now();
    setIsDragging(true);
    isDraggingRef.current = true;

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Pointer Move: tactile hand rotation for crank & 3-round spring key
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const now = performance.now();
    const currentAngle = Math.atan2(
      e.clientY - centerRef.current.y,
      e.clientX - centerRef.current.x
    );

    let delta = currentAngle - lastPointerAngleRef.current;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    const dtSec = Math.max(0.008, (now - lastPointerTimeRef.current) / 1000);
    lastPointerAngleRef.current = currentAngle;
    lastPointerTimeRef.current = now;

    if (playMode === 'crank') {
      if (delta > 0) {
        const governedDelta = Math.min(delta, MAX_DELTA_PER_EVENT);
        crankAngleRef.current += governedDelta;

        const instantVel = governedDelta / dtSec;
        const boundedVel = Math.min(MAX_GOVERNED_SPEED, instantVel);
        angularVelocityRef.current = angularVelocityRef.current * 0.55 + boundedVel * 0.45;

        const currentRpmValue = Math.round((angularVelocityRef.current * 60) / (2 * Math.PI));
        updateCrankVisuals(crankAngleRef.current, currentRpmValue);

        onManualCrankAdvanceRef.current?.(governedDelta, currentRpmValue);
      } else if (delta < -0.04) {
        angularVelocityRef.current = 0;
        updateCrankVisuals(crankAngleRef.current, 0);
        reverseRatchetAccumRef.current += Math.abs(delta);
        if (reverseRatchetAccumRef.current > 0.35) {
          musicBoxAudio.playWindingClick();
          reverseRatchetAccumRef.current = 0;
        }
      }
    } else if (playMode === 'spring') {
      // Exactly 3 full clockwise rounds (6π radians = 1080°) to reach full spring tension (1.0)
      if (delta > 0) {
        crankAngleRef.current += delta;
        updateCrankVisuals(crankAngleRef.current, crankRpmValueRef.current);

        const addedTension = delta / (3 * 2 * Math.PI);
        onWindSpringRef.current(addedTension);

        springRatchetAccumRef.current += delta;
        const RATCHET_STEP_RAD = (2 * Math.PI) / 16;
        if (springRatchetAccumRef.current >= RATCHET_STEP_RAD) {
          musicBoxAudio.playWindingClick();
          springRatchetAccumRef.current %= RATCHET_STEP_RAD;
        }
      } else if (delta < -0.05) {
        reverseRatchetAccumRef.current += Math.abs(delta);
        if (reverseRatchetAccumRef.current > 0.35) {
          musicBoxAudio.playWindingClick();
          reverseRatchetAccumRef.current = 0;
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (playMode === 'crank' && angularVelocityRef.current > 0.04) {
      startPhysicsLoopIfNeeded();
    }
  };

  // Quick Full Wind for Spring mode (Sets exactly 3 rounds / 100% tension)
  const handleQuickFullWind = () => {
    musicBoxAudio.playWindingClick();
    if (onSetSpringTension) {
      onSetSpringTension(1.0);
    } else {
      onWindSpring(1.0);
    }
  };

  // Unwind Spring to 0%
  const handleUnwindSpring = () => {
    musicBoxAudio.playWindingClick();
    if (onSetSpringTension) {
      onSetSpringTension(0);
    } else {
      onWindSpring(-1.0);
    }
  };

  const estimatedBpm = Math.round(crankRpmValueRef.current * 1.35);
  const currentRoundsWound = springTension * 3.0;
  const isFullTension = springTension >= 0.999;
  const isUnwound = springTension <= 0.005;

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-6 shadow-[0_6px_30px_rgba(67,52,34,0.08)] flex flex-col gap-5 text-[#2d2419]">
      {/* Mode Selector Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#ece4d6]">
        <div className="space-y-0.5">
          <span className="text-xs uppercase font-serif tracking-wider text-[#8a6b3e] font-bold flex items-center gap-1.5">
            <Disc className="w-3.5 h-3.5" />
            <span>Mechanical Drive & Winding Controller</span>
          </span>
          <p className="text-xs text-[#786650] font-serif-sub">
            {playMode === 'crank'
              ? 'Hand Crank • Viscous flywheel damping, aerodynamic speed governor & continuous plucking'
              : playMode === 'spring'
              ? 'Wind-Up Spring Motor • 3-Round Capacity with realistic torque decay'
              : 'Continuous Electric Drive • Steady automated tempo playback'}
          </p>
        </div>

        {/* 3 Drive Mode Buttons */}
        <div className="inline-flex rounded-xl bg-[#eee7da] p-1 border border-[#ded3be] shadow-xs">
          <button
            id="mode-spring-btn"
            onClick={() => onChangePlayMode('spring')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all cursor-pointer ${
              playMode === 'spring'
                ? 'bg-[#433422] text-[#fbf8f2] font-bold shadow-xs'
                : 'text-[#6f5e49] hover:text-[#2d2419]'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              <RotateCw className="w-3.5 h-3.5" />
              <span>Wind-Up Spring</span>
            </span>
          </button>

          <button
            id="mode-crank-btn"
            onClick={() => onChangePlayMode('crank')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all cursor-pointer ${
              playMode === 'crank'
                ? 'bg-[#433422] text-[#fbf8f2] font-bold shadow-xs'
                : 'text-[#6f5e49] hover:text-[#2d2419]'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              <Disc className="w-3.5 h-3.5" />
              <span>Hand Crank</span>
            </span>
          </button>

          <button
            id="mode-continuous-btn"
            onClick={() => onChangePlayMode('continuous')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all cursor-pointer ${
              playMode === 'continuous'
                ? 'bg-[#433422] text-[#fbf8f2] font-bold shadow-xs'
                : 'text-[#6f5e49] hover:text-[#2d2419]'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Continuous</span>
            </span>
          </button>
        </div>
      </div>

      {/* UNIFIED SIDE-BY-SIDE CONSOLE: BUTTERFLY KEY & PLAY BUTTON CLOSE TOGETHER */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* LEFT COLUMN: LARGE BUTTERFLY WINDING KEY / CRANK ROTOR */}
        <div className="md:col-span-6 flex flex-col items-center justify-between p-4 sm:p-5 bg-[#f8f5ee] rounded-2xl border border-[#e5dcce]">
          <div className="text-center mb-2">
            <span className="text-xs font-serif font-bold text-[#433422] uppercase tracking-wider block">
              {playMode === 'crank'
                ? 'Antique Brass Hand Crank'
                : playMode === 'spring'
                ? 'BUTTERFLY WINDING KEY'
                : 'Drive Spindle'}
            </span>
            <span className="text-[11px] text-[#8a7962] font-serif-sub italic">
              {playMode === 'crank'
                ? 'Drag knob clockwise to turn • Smooth air-governed speed'
                : playMode === 'spring'
                ? 'Drag key clockwise to wind 3 full rounds'
                : 'Automated electric motor active'}
            </span>
          </div>

          {/* Rotary Dial Dial / Butterfly Key Container */}
          <div className="relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center my-1">
            {/* Outer Circular Track with Graduation Marks */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#d8caa8]/80 pointer-events-none" />

            {/* 3-Round Spiral / Circular Tension Ring Track (In Spring Mode) */}
            {playMode === 'spring' && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring Track */}
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#e8decb"
                  strokeWidth="3.5"
                />
                {/* 3-Round Segment Dividers */}
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#c4b292"
                  strokeWidth="4"
                  strokeDasharray="0.8 33.2"
                />
                {/* Active Winding Progress Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={
                    isFullTension
                      ? '#c9954d'
                      : springTension > 0.33
                      ? '#d6a858'
                      : '#b34030'
                  }
                  strokeWidth="4.5"
                  strokeDasharray="282.7"
                  strokeDashoffset={282.7 * (1 - springTension)}
                  strokeLinecap="round"
                  className="transition-all duration-75"
                />
              </svg>
            )}

            {/* Rotary Base Housing Plate */}
            <div
              ref={crankWheelRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`relative w-38 h-38 sm:w-46 sm:h-46 rounded-full bg-gradient-to-tr from-[#2d2114] via-[#433321] to-[#1e160d] border-4 border-[#bfa175] hover:border-[#ffeaa7] shadow-[0_8px_24px_rgba(45,33,20,0.35)] flex items-center justify-center cursor-grab active:cursor-grabbing transition-all select-none touch-none ${
                isDragging ? 'ring-4 ring-[#d6be8e]/50 scale-[1.02]' : ''
              }`}
            >
              {/* Inner Metallic Circular Faceplate */}
              <div className="absolute inset-2.5 rounded-full bg-gradient-to-br from-[#382b1b] via-[#241a0e] to-[#4a3923] border border-[#d8caa8]/30 flex items-center justify-center pointer-events-none shadow-inner">
                <div className="w-full h-[1px] bg-[#d8caa8]/15" />
                <div className="h-full w-[1px] bg-[#d8caa8]/15" />
                <div className="absolute inset-5 rounded-full border border-[#d8caa8]/15" />

                {playMode === 'spring' && (
                  <div className="absolute bottom-2 flex items-center gap-1 text-[8px] sm:text-[9px] font-mono text-[#d6be8e]/70 uppercase tracking-widest pointer-events-none">
                    <span>↻ Clockwise to Wind</span>
                  </div>
                )}
              </div>

              {/* RENDER LARGE HAND CRANK (In Crank mode) */}
              {playMode === 'crank' && (
                <div
                  ref={crankRotorRef}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform"
                  style={{ transform: `rotate(${crankAngleRef.current}rad)` }}
                >
                  <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-18 sm:w-22 h-4.5 rounded-full bg-gradient-to-r from-[#d6be8e] via-[#fff0b3] to-[#a68656] shadow-md border border-[#ffe787]/60 origin-left flex items-center justify-end pr-1">
                    <div className="relative -right-3.5 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#8a5229] via-[#5e3416] to-[#3b1e0a] border-2 border-[#eed882] shadow-lg shadow-[#140e06] flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing hover:scale-105 transition-transform">
                      <div className="w-3.5 h-3.5 rounded-full bg-[#eed882] shadow-inner flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-[#3b1e0a]" />
                      </div>
                    </div>
                  </div>

                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#946614] via-[#eed882] to-[#946614] border-2 border-[#fff2b8] shadow-md flex items-center justify-center z-10">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#241a0e] border border-[#ecd8af]" />
                  </div>
                </div>
              )}

              {/* RENDER LARGE BUTTERFLY WINDING KEY (In Spring Mode) */}
              {playMode === 'spring' && (
                <div
                  ref={crankRotorRef}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform"
                  style={{ transform: `rotate(${crankAngleRef.current}rad)` }}
                >
                  {isDragging && (
                    <div className="absolute w-32 sm:w-38 h-14 sm:h-16 rounded-full bg-[#ffe58f]/20 blur-md pointer-events-none" />
                  )}

                  {/* LARGE BUTTERFLY WINGS KEY BODY */}
                  <div className="relative w-32 h-12 sm:w-38 sm:h-14 rounded-full bg-gradient-to-r from-[#8a5f14] via-[#ffd966] to-[#8a5f14] shadow-[0_6px_20px_rgba(20,14,6,0.6)] border-2 border-[#ffeaa7] flex items-center justify-between px-3 sm:px-4 cursor-grab active:cursor-grabbing">
                    {/* Left Wing Cutout */}
                    <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-[#1a1207] via-[#2d2010] to-[#120c04] border-2 border-[#d4b788] shadow-inner flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#ecd8af]/30 border border-[#ecd8af]/60" />
                    </div>

                    {/* Center Arbor Shaft Hub */}
                    <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-[#6b470b] via-[#eed882] to-[#6b470b] border-2 border-[#fff2b8] shadow-md flex items-center justify-center z-10">
                      <div className="w-3.5 h-3.5 rounded-full bg-[#241a0e] border border-[#ecd8af] flex items-center justify-center">
                        <div className="w-2 h-[1.5px] bg-[#ecd8af]" />
                      </div>
                    </div>

                    {/* Right Wing Cutout */}
                    <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-[#1a1207] via-[#2d2010] to-[#120c04] border-2 border-[#d4b788] shadow-inner flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#ecd8af]/30 border border-[#ecd8af]/60" />
                    </div>
                  </div>
                </div>
              )}

              {/* RENDER MOTORIZED SPINDLE (In Continuous Mode) */}
              {playMode === 'continuous' && (
                <div
                  className={`w-14 h-14 rounded-full bg-gradient-to-r from-[#a68656] via-[#ffeaa7] to-[#8a6b3e] shadow-md border border-[#ffe787] flex items-center justify-center pointer-events-none ${
                    isPlaying ? 'animate-spin' : ''
                  }`}
                >
                  <Zap className="w-5 h-5 text-[#241a0e]" />
                </div>
              )}
            </div>
          </div>

          {/* Dynamic RPM & Cranking Speed Indicator (Crank Mode) */}
          {playMode === 'crank' && (
            <div className="mt-2 flex flex-col items-center gap-1 text-xs w-full">
              <div className="flex items-center justify-between w-full px-2 text-[#8a7962]">
                <div className="flex items-center space-x-1">
                  <Gauge className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span className="font-serif">Speed:</span>
                  <span ref={crankRpmDisplayRef} className="font-mono text-[#8a6b3e] font-bold text-xs">
                    {crankRpmValueRef.current} RPM
                  </span>
                </div>
                <div ref={crankBpmDisplayRef} className="text-[11px] font-mono text-[#786650]">
                  {crankRpmValueRef.current > 0 ? `≈ ${estimatedBpm} BPM` : 'Resting'}
                </div>
              </div>

              <div className="relative w-[92%] h-1.5 rounded-full bg-[#e3d8c4] border border-[#d0c2aa] overflow-hidden">
                <div
                  ref={crankSpeedBarRef}
                  className="h-full rounded-full transition-all duration-75 bg-[#a68656]"
                  style={{ width: `${Math.min(100, (crankRpmValueRef.current / 85) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Dynamic 3-Round Winding Indicator (Spring Mode) */}
          {playMode === 'spring' && (
            <div className="mt-2 flex flex-col items-center gap-1 text-xs w-full px-1">
              <div className="flex items-center justify-between w-full text-[#8a7962]">
                <span className="font-serif font-bold text-xs text-[#433422] flex items-center gap-1">
                  <RotateCw className={`w-3.5 h-3.5 text-[#8a6b3e] ${isDragging ? 'animate-spin' : ''}`} />
                  <span>Tension:</span>
                </span>
                <span className="font-mono text-[#8a6b3e] font-bold text-xs">
                  {currentRoundsWound.toFixed(1)} / 3.0 Rounds ({Math.round(springTension * 100)}%)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CLOSE-PROXIMITY PLAY BUTTON, SPRING STATUS & SPEED CONTROLS */}
        <div className="md:col-span-6 flex flex-col justify-between p-4 sm:p-5 bg-[#f8f5ee] rounded-2xl border border-[#e5dcce] space-y-3.5">
          {/* 1. LARGE PROMINENT PLAY / PAUSE BUTTON (CLOSE TOGETHER WITH THE KEY) */}
          <div className="space-y-1">
            <button
              id="main-play-btn"
              onClick={onTogglePlay}
              disabled={playMode === 'spring' && springTension <= 0.005}
              className={`w-full py-3.5 px-5 rounded-xl font-serif text-sm font-bold tracking-wide flex items-center justify-center space-x-2.5 shadow-sm transition-all border cursor-pointer ${
                isPlaying
                  ? 'bg-[#f4efe4] border-[#d8caa8] text-[#433422] hover:bg-[#eae1d0]'
                  : playMode === 'spring' && springTension <= 0.005
                  ? 'bg-[#eee7da] border-[#ded3be] text-[#a4937d] cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#c4a675] via-[#dfcd9f] to-[#b8955e] hover:from-[#bfa170] hover:to-[#ae8b54] text-[#2d2419] border-[#ae8b54]/40 shadow-sm'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause Movement</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>
                    {playMode === 'spring' && springTension <= 0.005
                      ? 'Wind Butterfly Key First'
                      : 'Play Music Box'}
                  </span>
                </>
              )}
            </button>

            {playMode === 'spring' && (
              <div className="text-[11px] font-serif-sub text-center pt-0.5">
                {isFullTension ? (
                  <span className="text-[#8a6020] font-bold">
                    ✓ Full 3-Round Tension • Ready to Play
                  </span>
                ) : isUnwound ? (
                  <span className="text-[#a64b38] font-semibold">
                    Spring Unwound • Wind 3 Rounds or Quick Wind below
                  </span>
                ) : (
                  <span className="text-[#6f5e49]">
                    Wound {currentRoundsWound.toFixed(1)} of 3.0 full rounds
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 2. SPRING TENSION BAR & QUICK WIND ACTIONS (In Spring Mode) */}
          {playMode === 'spring' && (
            <div className="space-y-2 pt-1 border-t border-[#ece4d6]">
              <div className="relative w-full h-3.5 rounded-full bg-[#e8dfcf] border border-[#d8caa8] overflow-hidden flex">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${
                    springTension > 0.66
                      ? 'bg-gradient-to-r from-[#a68656] via-[#c9ae77] to-[#dfb26b]'
                      : springTension > 0.33
                      ? 'bg-gradient-to-r from-[#c98e4d] to-[#d6be8e]'
                      : 'bg-gradient-to-r from-[#a64b38] to-[#c98e4d]'
                  }`}
                  style={{ width: `${springTension * 100}%` }}
                />
                <div className="absolute top-0 bottom-0 left-[33.33%] w-[1px] bg-[#3a2c1d]/30 pointer-events-none" />
                <div className="absolute top-0 bottom-0 left-[66.66%] w-[1px] bg-[#3a2c1d]/30 pointer-events-none" />
              </div>

              <div className="flex justify-between items-center text-[10px] font-mono text-[#8a7962]">
                <span className={springTension >= 0.33 ? 'text-[#8a6b3e] font-bold' : ''}>Round 1</span>
                <span className={springTension >= 0.66 ? 'text-[#8a6b3e] font-bold' : ''}>Round 2</span>
                <span className={isFullTension ? 'text-[#8a6b3e] font-bold' : ''}>Round 3 (Full)</span>
              </div>

              {/* Quick Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  id="quick-full-wind-btn"
                  onClick={handleQuickFullWind}
                  className="py-1.5 px-2 rounded-lg bg-[#eee5d3] hover:bg-[#e4d7be] border border-[#d6be8e] text-xs font-serif font-semibold text-[#5e4726] flex items-center justify-center space-x-1.5 transition shadow-xs cursor-pointer"
                  title="Instantly set spring to 3 full rounds (100%)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span>Quick Full Wind</span>
                </button>

                <button
                  id="unwind-spring-btn"
                  onClick={handleUnwindSpring}
                  className="py-1.5 px-2 rounded-lg bg-[#f0e9dc] hover:bg-[#e6dccb] border border-[#ded3be] text-xs font-serif font-semibold text-[#78644c] flex items-center justify-center space-x-1.5 transition shadow-xs cursor-pointer"
                  title="Reset tension to 0 to practice winding the 3 rounds manually"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#78644c]" />
                  <span>Unwind (0%)</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. PLAYBACK SPEED & TEMPO CONTROLS */}
          <div className="space-y-2 pt-1 border-t border-[#ece4d6]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#8a6b3e]" />
                <span className="font-serif font-bold text-xs text-[#433422]">
                  Playback Speed
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold text-[#8a6b3e] bg-[#eee4d0] px-2 py-0.5 rounded-md border border-[#d8caa8]">
                  {tempoBpm} BPM
                </span>
                {onRewind && (
                  <button
                    id="rewind-btn"
                    onClick={onRewind}
                    title="Rewind to beginning"
                    className="p-1 rounded-md bg-[#eee5d3] hover:bg-[#e4d7be] text-[#5e4726] border border-[#d6be8e] transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                id="tempo-decrease-btn"
                onClick={() => onChangeTempoBpm?.(Math.max(40, tempoBpm - 5))}
                title="Slow down"
                className="p-1.5 rounded-lg bg-[#eee5d3] hover:bg-[#e4d7be] text-[#5e4726] border border-[#d6be8e] transition cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>

              <input
                id="playback-speed-slider"
                type="range"
                min="40"
                max="160"
                step="2"
                value={tempoBpm}
                onChange={(e) => onChangeTempoBpm?.(Number(e.target.value))}
                className="flex-1 accent-[#8a6b3e] cursor-pointer h-2 bg-[#ded3be] rounded-lg"
              />

              <button
                id="tempo-increase-btn"
                onClick={() => onChangeTempoBpm?.(Math.min(160, tempoBpm + 5))}
                title="Speed up"
                className="p-1.5 rounded-lg bg-[#eee5d3] hover:bg-[#e4d7be] text-[#5e4726] border border-[#d6be8e] transition cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* Quick Tempo Presets */}
            <div className="flex items-center justify-between gap-1">
              {[
                { label: 'Largo', bpm: 60 },
                { label: 'Andante', bpm: 88 },
                { label: 'Moderato', bpm: 108 },
                { label: 'Allegro', bpm: 132 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  id={`tempo-preset-${preset.bpm}`}
                  onClick={() => onChangeTempoBpm?.(preset.bpm)}
                  className={`flex-1 py-1 px-1 text-[10px] sm:text-[11px] font-serif rounded-md border transition-all cursor-pointer ${
                    tempoBpm === preset.bpm
                      ? 'bg-[#433422] text-[#fbf8f2] border-[#433422] font-bold shadow-xs'
                      : 'bg-[#eee7da] hover:bg-[#e4dcce] text-[#6f5e49] border-[#ded3be]'
                  }`}
                >
                  {preset.label} ({preset.bpm})
                </button>
              ))}
            </div>
          </div>

          {/* Crank & Governor Notes */}
          {playMode === 'crank' && (
            <div className="pt-2 border-t border-[#ece4d6] flex items-center justify-between text-xs text-[#75634d] font-serif-sub italic">
              {crankRpmValueRef.current > 70 ? (
                <span className="text-[#96472d] font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#96472d]" />
                  <span>Air-Brake Governor Speed Restrained</span>
                </span>
              ) : (
                <span className="text-[#634e34] flex items-center gap-1">
                  <Wind className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span>Viscous Damping Active</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
