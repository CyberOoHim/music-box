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
  tempoBpm = 88,
  onChangeTempoBpm,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [crankAngle, setCrankAngle] = useState(0);
  const [crankRpm, setCrankRpm] = useState(0);

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

  // Keep callback refs updated
  useEffect(() => {
    onManualCrankAdvanceRef.current = onManualCrankAdvance;
    onWindSpringRef.current = onWindSpring;
  }, [onManualCrankAdvance, onWindSpring]);

  // Keep state refs synchronized
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // Physics Engine Loop for Flywheel Inertia & Coasting (Crank mode)
  const isLoopRunningRef = useRef(false);

  const startPhysicsLoopIfNeeded = useCallback(() => {
    if (isLoopRunningRef.current || playMode !== 'crank') return;

    isLoopRunningRef.current = true;
    lastPhysicsTimeRef.current = performance.now();
    let lastRenderTime = performance.now();
    const frameInterval = 1000 / 24; // 24 FPS cap for maximum battery and thermal efficiency

    const physicsLoop = (timestamp: number) => {
      if (playMode !== 'crank') {
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
            setCrankAngle(crankAngleRef.current);

            const rpm = Math.round((currentVel * 60) / (2 * Math.PI));
            setCrankRpm(rpm);
            onManualCrankAdvanceRef.current?.(delta, rpm);
          } else {
            angularVelocityRef.current = 0;
            setCrankRpm(0);
            onManualCrankAdvanceRef.current?.(0, 0);
            isLoopRunningRef.current = false;
            return;
          }
        }
      }

      reqAnimIdRef.current = requestAnimationFrame(physicsLoop);
    };

    reqAnimIdRef.current = requestAnimationFrame(physicsLoop);
  }, [playMode]);

  useEffect(() => {
    if (playMode === 'crank') {
      startPhysicsLoopIfNeeded();
    } else {
      if (reqAnimIdRef.current) {
        cancelAnimationFrame(reqAnimIdRef.current);
      }
      isLoopRunningRef.current = false;
      angularVelocityRef.current = 0;
      setCrankRpm(0);
    }

    return () => {
      if (reqAnimIdRef.current) {
        cancelAnimationFrame(reqAnimIdRef.current);
      }
      isLoopRunningRef.current = false;
    };
  }, [playMode, startPhysicsLoopIfNeeded]);

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

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Pointer Move: direct tactile hand rotation for crank & 3-round spring key
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const now = performance.now();
    const currentAngle = Math.atan2(
      e.clientY - centerRef.current.y,
      e.clientX - centerRef.current.x
    );

    let delta = currentAngle - lastPointerAngleRef.current;
    // Normalize angle wrap-around (-PI to +PI)
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    const dtSec = Math.max(0.008, (now - lastPointerTimeRef.current) / 1000);
    lastPointerAngleRef.current = currentAngle;
    lastPointerTimeRef.current = now;

    if (playMode === 'crank') {
      if (delta > 0) {
        // Clockwise forward turning: apply air-governor damping & speed limit
        const governedDelta = Math.min(delta, MAX_DELTA_PER_EVENT);
        crankAngleRef.current += governedDelta;
        setCrankAngle(crankAngleRef.current);

        const instantVel = governedDelta / dtSec;
        const boundedVel = Math.min(MAX_GOVERNED_SPEED, instantVel);
        angularVelocityRef.current = angularVelocityRef.current * 0.55 + boundedVel * 0.45;

        const currentRpmValue = Math.round(angularVelocityRef.current * 60 / (2 * Math.PI));
        setCrankRpm(currentRpmValue);

        onManualCrankAdvanceRef.current?.(governedDelta, currentRpmValue);
      } else if (delta < -0.04) {
        // Counter-clockwise backwards: mechanical ratchet brake resistance
        angularVelocityRef.current = 0;
        setCrankRpm(0);
        reverseRatchetAccumRef.current += Math.abs(delta);
        if (reverseRatchetAccumRef.current > 0.35) {
          musicBoxAudio.playWindingClick();
          reverseRatchetAccumRef.current = 0;
        }
      }
    } else if (playMode === 'spring') {
      // IN SPRING MODE:
      // Exactly 3 full clockwise rounds (3 × 2π = 6π radians = 1080°) to reach full spring tension (1.0)
      if (delta > 0) {
        // Rotate key visually clockwise with the drag
        crankAngleRef.current += delta;
        setCrankAngle(crankAngleRef.current);

        // Calculate added tension: 1 full rotation (2π rad) = 1/3 (0.3333) tension
        // 3 full rotations (6π rad) = 1.0 (100%) tension
        const addedTension = delta / (3 * 2 * Math.PI);
        onWindSpringRef.current(addedTension);

        // Authentic mechanical ratchet click every ~22.5 degrees (16 clicks per round)
        springRatchetAccumRef.current += delta;
        const RATCHET_STEP_RAD = (2 * Math.PI) / 16; // ~0.3927 rad (~22.5 deg)
        if (springRatchetAccumRef.current >= RATCHET_STEP_RAD) {
          musicBoxAudio.playWindingClick();
          springRatchetAccumRef.current %= RATCHET_STEP_RAD;
        }
      } else if (delta < -0.05) {
        // Counter-clockwise drag: Ratchet pawl locks mechanism in place (anti-reverse catch)
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

  // Unwind Spring to 0% (Allows user to experience winding the 3 full rounds from empty)
  const handleUnwindSpring = () => {
    musicBoxAudio.playWindingClick();
    if (onSetSpringTension) {
      onSetSpringTension(0);
    } else {
      onWindSpring(-1.0);
    }
  };

  // Calculate equivalent BPM for crank feedback
  const estimatedBpm = Math.round(crankRpm * 1.35);

  // Exact 3-round tension calculation
  const currentRoundsWound = springTension * 3.0;
  const isFullTension = springTension >= 0.999;
  const isUnwound = springTension <= 0.005;

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-5 sm:p-7 shadow-[0_6px_30px_rgba(67,52,34,0.08)] flex flex-col gap-6 text-[#2d2419]">
      {/* Mode Selector Tabs Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#ece4d6]">
        <div className="space-y-0.5">
          <span className="text-xs uppercase font-serif tracking-wider text-[#8a6b3e] font-bold flex items-center gap-1.5">
            <Disc className="w-3.5 h-3.5" />
            <span>Mechanical Drive Controller</span>
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
            id="mode-crank-btn"
            onClick={() => onChangePlayMode('crank')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all ${
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
            id="mode-spring-btn"
            onClick={() => onChangePlayMode('spring')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all ${
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
            id="mode-continuous-btn"
            onClick={() => onChangePlayMode('continuous')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all ${
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

      {/* Main Interactive Interactive Console Area */}
      <div className={playMode === 'crank' ? 'max-w-xl mx-auto w-full' : 'grid grid-cols-1 md:grid-cols-12 gap-6 items-center'}>
        {/* Dedicated Large Hand Crank / Large Butterfly Winding Key Housing */}
        <div className={`${playMode === 'crank' ? 'w-full' : 'md:col-span-6'} flex flex-col items-center justify-center p-4 sm:p-5 bg-[#f8f5ee] rounded-2xl border border-[#e5dcce]`}>
          <div className="text-center mb-3">
            <span className="text-xs font-serif font-bold text-[#433422] uppercase tracking-wider block">
              {playMode === 'crank'
                ? 'Damped Antique Brass Hand Crank'
                : playMode === 'spring'
                ? 'LARGE BUTTERFLY WINDING KEY'
                : 'Drive Spindle'}
            </span>
            <span className="text-[11px] text-[#8a7962] font-serif-sub italic">
              {playMode === 'crank'
                ? 'Drag knob clockwise to turn • Smooth glide & air-governed speed'
                : playMode === 'spring'
                ? 'Drag key clockwise to wind the 3-round spring'
                : 'Automated electric motor active'}
            </span>
          </div>

          {/* Large Rotary Crank & Butterfly Key Controller Dial */}
          <div className="relative w-52 h-52 sm:w-64 sm:h-64 flex items-center justify-center">
            {/* Outer Circular Track with 3-Round Winding Graduation Marks */}
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
                {/* 3-Round Segment Dividers (at 33.3% / 120deg and 66.6% / 240deg) */}
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#c4b292"
                  strokeWidth="4"
                  strokeDasharray="0.8 33.2"
                />
                {/* Active Winding Progress Ring (300% total coverage scaled to 100%) */}
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
              className={`relative w-44 h-44 sm:w-54 sm:h-54 rounded-full bg-gradient-to-tr from-[#2d2114] via-[#433321] to-[#1e160d] border-4 border-[#bfa175] hover:border-[#ffeaa7] shadow-[0_8px_24px_rgba(45,33,20,0.35)] flex items-center justify-center cursor-grab active:cursor-grabbing transition-all select-none touch-none ${
                isDragging ? 'ring-4 ring-[#d6be8e]/50 scale-[1.02]' : ''
              }`}
            >
              {/* Inner Metallic Circular Faceplate with Brass Machining Grooves */}
              <div className="absolute inset-3 rounded-full bg-gradient-to-br from-[#382b1b] via-[#241a0e] to-[#4a3923] border border-[#d8caa8]/30 flex items-center justify-center pointer-events-none shadow-inner">
                {/* Radial Machined Lines */}
                <div className="w-full h-[1px] bg-[#d8caa8]/15" />
                <div className="h-full w-[1px] bg-[#d8caa8]/15" />
                <div className="absolute inset-6 rounded-full border border-[#d8caa8]/15" />
                <div className="absolute inset-10 rounded-full border border-[#d8caa8]/10" />

                {/* Clockwise Directional Arrow Hint in Spring Mode */}
                {playMode === 'spring' && (
                  <div className="absolute bottom-2.5 flex items-center gap-1 text-[9px] font-mono text-[#d6be8e]/70 uppercase tracking-widest pointer-events-none">
                    <span>↻ Clockwise to Wind</span>
                  </div>
                )}
              </div>

              {/* RENDER LARGE HAND CRANK (In Crank mode) */}
              {playMode === 'crank' && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform"
                  style={{ transform: `rotate(${crankAngle}rad)` }}
                >
                  {/* Heavy Polished Gold Crank Arm with realistic bevel */}
                  <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-22 sm:w-26 h-5 rounded-full bg-gradient-to-r from-[#d6be8e] via-[#fff0b3] to-[#a68656] shadow-md border border-[#ffe787]/60 origin-left flex items-center justify-end pr-1">
                    {/* Ergonomic Wooden/Brass Crank Knob Handle */}
                    <div className="relative -right-4 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-[#8a5229] via-[#5e3416] to-[#3b1e0a] border-2 border-[#eed882] shadow-lg shadow-[#140e06] flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing hover:scale-105 transition-transform">
                      <div className="w-4 h-4 rounded-full bg-[#eed882] shadow-inner flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#3b1e0a]" />
                      </div>
                    </div>
                  </div>

                  {/* Center Brass Hub Bushing */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#946614] via-[#eed882] to-[#946614] border-2 border-[#fff2b8] shadow-md flex items-center justify-center z-10">
                    <div className="w-3 h-3 rounded-full bg-[#241a0e] border border-[#ecd8af]" />
                  </div>
                </div>
              )}

              {/* RENDER LARGE BUTTERFLY WINDING KEY (In Spring Mode) */}
              {playMode === 'spring' && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform"
                  style={{ transform: `rotate(${crankAngle}rad)` }}
                >
                  {/* Outer Glow Halo on Drag */}
                  {isDragging && (
                    <div className="absolute w-36 sm:w-44 h-16 sm:h-18 rounded-full bg-[#ffe58f]/20 blur-md pointer-events-none" />
                  )}

                  {/* LARGE BUTTERFLY WINGS KEY BODY */}
                  <div className="relative w-36 h-14 sm:w-44 sm:h-16 rounded-full bg-gradient-to-r from-[#8a5f14] via-[#ffd966] to-[#8a5f14] shadow-[0_6px_20px_rgba(20,14,6,0.6)] border-2 border-[#ffeaa7] flex items-center justify-between px-3.5 sm:px-4.5 cursor-grab active:cursor-grabbing">
                    {/* Left Butterfly Wing with Ergonomic Oval Grip Cutout */}
                    <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-[#1a1207] via-[#2d2010] to-[#120c04] border-2 border-[#d4b788] shadow-inner flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ecd8af]/30 border border-[#ecd8af]/60" />
                    </div>

                    {/* Center Threaded Arbor Shaft Hub & Screws */}
                    <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#6b470b] via-[#eed882] to-[#6b470b] border-2 border-[#fff2b8] shadow-md flex items-center justify-center z-10">
                      {/* Center Machine Screw Slot */}
                      <div className="w-4 h-4 rounded-full bg-[#241a0e] border border-[#ecd8af] flex items-center justify-center">
                        <div className="w-2.5 h-[1.5px] bg-[#ecd8af]" />
                      </div>
                    </div>

                    {/* Right Butterfly Wing with Ergonomic Oval Grip Cutout */}
                    <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-[#1a1207] via-[#2d2010] to-[#120c04] border-2 border-[#d4b788] shadow-inner flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ecd8af]/30 border border-[#ecd8af]/60" />
                    </div>
                  </div>
                </div>
              )}

              {/* RENDER MOTORIZED SPINDLE (In Continuous Mode) */}
              {playMode === 'continuous' && (
                <div
                  className={`w-16 h-16 rounded-full bg-gradient-to-r from-[#a68656] via-[#ffeaa7] to-[#8a6b3e] shadow-md border border-[#ffe787] flex items-center justify-center pointer-events-none ${
                    isPlaying ? 'animate-spin' : ''
                  }`}
                >
                  <Zap className="w-6 h-6 text-[#241a0e]" />
                </div>
              )}
            </div>
          </div>

          {/* Dynamic RPM & Cranking Speed Indicator (Crank Mode) */}
          {playMode === 'crank' && (
            <div className="mt-3 flex flex-col items-center gap-1.5 text-xs w-full">
              <div className="flex items-center justify-between w-full px-4 text-[#8a7962]">
                <div className="flex items-center space-x-1.5">
                  <Gauge className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span className="font-serif">Speed:</span>
                  <span className="font-mono text-[#8a6b3e] font-bold text-sm">{crankRpm} RPM</span>
                </div>
                <div className="text-[11px] font-mono text-[#786650]">
                  {crankRpm > 0 ? `≈ ${estimatedBpm} BPM` : 'Resting'}
                </div>
              </div>

              {/* Speed Arc / Governor Limit Bar */}
              <div className="relative w-[88%] h-2 rounded-full bg-[#e3d8c4] border border-[#d0c2aa] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    crankRpm > 70
                      ? 'bg-gradient-to-r from-[#c9954d] via-[#d6a858] to-[#b34030]'
                      : crankRpm > 30
                      ? 'bg-gradient-to-r from-[#8a6b3e] to-[#dfb26b]'
                      : 'bg-[#a68656]'
                  }`}
                  style={{ width: `${Math.min(100, (crankRpm / 85) * 100)}%` }}
                />
              </div>

              <div className="flex items-center gap-1 text-[11px] text-[#75634d] font-serif-sub italic">
                {crankRpm === 0 ? (
                  <span>Drag knob clockwise to play • Speed governed & damped</span>
                ) : crankRpm > 70 ? (
                  <span className="text-[#96472d] font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#96472d]" />
                    <span>Air-Brake Governor Active (Speed Restrained)</span>
                  </span>
                ) : (
                  <span className="text-[#634e34] flex items-center gap-1">
                    <Wind className="w-3 h-3 text-[#8a6b3e]" />
                    <span>Viscous Damping Active • Smooth & Continuous</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Dynamic 3-Round Winding Indicator (Spring Mode) */}
          {playMode === 'spring' && (
            <div className="mt-3.5 flex flex-col items-center gap-1.5 text-xs w-full px-2">
              <div className="flex items-center justify-between w-full text-[#8a7962]">
                <span className="font-serif font-bold text-xs text-[#433422] flex items-center gap-1">
                  <RotateCw className={`w-3.5 h-3.5 text-[#8a6b3e] ${isDragging ? 'animate-spin' : ''}`} />
                  <span>3-Round Spring Tension:</span>
                </span>
                <span className="font-mono text-[#8a6b3e] font-bold text-sm">
                  {currentRoundsWound.toFixed(1)} / 3.0 Rounds ({Math.round(springTension * 100)}%)
                </span>
              </div>

              {/* Status Message */}
              <div className="text-[11px] font-serif-sub text-center">
                {isFullTension ? (
                  <span className="text-[#8a6020] font-bold">
                    ✓ Full 3-Round Tension Reached • Ready to Play
                  </span>
                ) : isUnwound ? (
                  <span className="text-[#a64b38] font-semibold">
                    Spring Unwound • Rotate Butterfly Key 3 Rounds Clockwise
                  </span>
                ) : (
                  <span className="text-[#6f5e49]">
                    Winding in progress ({currentRoundsWound.toFixed(1)} of 3 full rounds)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Mechanism Details & Controls (Spring and Continuous Modes only) */}
        {playMode !== 'crank' && (
          <div className="md:col-span-6 space-y-4">
            {/* Spring Mode: Tension Gauge & Rounds */}
            {playMode === 'spring' && (
              <div className="p-4 sm:p-5 rounded-xl bg-[#f8f5ee] border border-[#e5dcce] space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Gauge className="w-4 h-4 text-[#a68656]" />
                    <span className="font-serif font-bold text-xs text-[#433422]">
                      Mainspring Tension (3 Rounds Total)
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#8a6b3e] font-bold">
                    {currentRoundsWound.toFixed(1)} / 3.0 Rounds
                  </span>
                </div>

                {/* Segmented 3-Round Gauge */}
                <div className="relative w-full h-4 rounded-full bg-[#e8dfcf] border border-[#d8caa8] overflow-hidden flex">
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
                  {/* 3-Round Dividers */}
                  <div className="absolute top-0 bottom-0 left-[33.33%] w-[1px] bg-[#3a2c1d]/30 pointer-events-none" />
                  <div className="absolute top-0 bottom-0 left-[66.66%] w-[1px] bg-[#3a2c1d]/30 pointer-events-none" />
                </div>

                <div className="flex justify-between items-center text-[10px] font-mono text-[#8a7962]">
                  <span className={springTension >= 0.33 ? 'text-[#8a6b3e] font-bold' : ''}>Round 1 (360°)</span>
                  <span className={springTension >= 0.66 ? 'text-[#8a6b3e] font-bold' : ''}>Round 2 (720°)</span>
                  <span className={isFullTension ? 'text-[#8a6b3e] font-bold' : ''}>Round 3 • Full (1080°)</span>
                </div>

                {/* Winding Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    id="quick-full-wind-btn"
                    onClick={handleQuickFullWind}
                    className="py-2 px-2.5 rounded-lg bg-[#eee5d3] hover:bg-[#e4d7be] border border-[#d6be8e] text-xs font-serif font-semibold text-[#5e4726] flex items-center justify-center space-x-1.5 transition shadow-xs"
                    title="Instantly set spring to 3 full rounds (100%)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#8a6b3e]" />
                    <span>Quick Full Wind (3 Rounds)</span>
                  </button>

                  <button
                    id="unwind-spring-btn"
                    onClick={handleUnwindSpring}
                    className="py-2 px-2.5 rounded-lg bg-[#f0e9dc] hover:bg-[#e6dccb] border border-[#ded3be] text-xs font-serif font-semibold text-[#78644c] flex items-center justify-center space-x-1.5 transition shadow-xs"
                    title="Reset tension to 0 to practice winding the 3 rounds manually"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#78644c]" />
                    <span>Unwind Spring (0%)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Continuous Mode: User Speed / Tempo Controls */}
            {playMode === 'continuous' && (
              <div className="p-4 sm:p-5 rounded-xl bg-[#f8f5ee] border border-[#e5dcce] space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-[#8a6b3e]" />
                    <span className="font-serif font-bold text-xs text-[#433422]">
                      Continuous Playback Speed
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#8a6b3e] bg-[#eee4d0] px-2 py-0.5 rounded-md border border-[#d8caa8]">
                    {tempoBpm} BPM
                  </span>
                </div>

                {/* Speed Slider with Minus / Plus Step Buttons */}
                <div className="flex items-center space-x-3">
                  <button
                    id="tempo-decrease-btn"
                    onClick={() => onChangeTempoBpm?.(Math.max(40, tempoBpm - 5))}
                    title="Slow down"
                    className="p-2 rounded-lg bg-[#eee5d3] hover:bg-[#e4d7be] text-[#5e4726] border border-[#d6be8e] transition"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <input
                    id="continuous-speed-slider"
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
                    className="p-2 rounded-lg bg-[#eee5d3] hover:bg-[#e4d7be] text-[#5e4726] border border-[#d6be8e] transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Tempo Presets */}
                <div className="flex items-center justify-between gap-1.5 pt-1">
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
                      className={`flex-1 py-1 px-1.5 text-[11px] font-serif rounded-md border transition-all ${
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
            )}

            {/* Main Play / Pause Button */}
            <button
              id="main-play-btn"
              onClick={onTogglePlay}
              disabled={playMode === 'spring' && springTension <= 0.005}
              className={`w-full py-3.5 px-6 rounded-xl font-serif text-sm font-bold tracking-wide flex items-center justify-center space-x-2.5 shadow-sm transition-all border ${
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
                  <span>{playMode === 'spring' && springTension <= 0.005 ? 'Wind Butterfly Key First' : 'Play Music Box'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
