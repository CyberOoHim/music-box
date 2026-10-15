import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayMode } from '../types';
import {
  RotateCw,
  Zap,
  Disc,
  Gauge,
  RotateCcw,
  Sparkles,
  Wind,
  ShieldCheck,
  Plus,
  Minus,
  Sliders,
  Lock,
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
  onOpenRecordModal?: () => void;
}

export const WindingKey: React.FC<WindingKeyProps> = React.memo(({
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
  onOpenRecordModal,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  // Animation & Visual Feedback Refs
  const crankRpmDisplayRef = useRef<HTMLSpanElement | null>(null);
  const crankBpmDisplayRef = useRef<HTMLDivElement | null>(null);
  const crankSpeedBarRef = useRef<HTMLDivElement | null>(null);
  const crankRotorRef = useRef<HTMLDivElement | null>(null);
  const crankKnobCounterRotRef = useRef<HTMLDivElement | null>(null);
  const ratchetWheelRef = useRef<SVGGElement | null>(null);
  const ratchetPawlRef = useRef<SVGGElement | null>(null);
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
    // Counter-rotate the rosewood handle knob so lighting highlight stays oriented naturally
    if (crankKnobCounterRotRef.current) {
      crankKnobCounterRotRef.current.style.transform = `rotate(${-angle}rad)`;
    }
    if (ratchetWheelRef.current) {
      const deg = (angle * 180) / Math.PI;
      ratchetWheelRef.current.setAttribute('transform', `translate(100, 100) rotate(${deg})`);
    }
    if (ratchetPawlRef.current) {
      // 16-tooth ratchet pawl kick animation
      const toothPhase = (((angle * 16) / (Math.PI * 2)) % 1 + 1) % 1;
      const kickDeg = Math.max(0, Math.sin(toothPhase * Math.PI)) * 16;
      ratchetPawlRef.current.setAttribute('transform', `translate(132, 68) rotate(${-kickDeg})`);
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
    const frameInterval = 1000 / 30;

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

    const handleWindowFocus = () => {
      if (playMode === 'crank' && angularVelocityRef.current > 0.04) {
        startPhysicsLoopIfNeeded();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);

    if (playMode === 'crank' && angularVelocityRef.current > 0.04) {
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
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
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
    if (delta < -Math.PI) delta -= Math.PI * 2;

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
          musicBoxAudio.playRatchetClick(0.6);
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
          musicBoxAudio.playRatchetClick(1.0);
          springRatchetAccumRef.current %= RATCHET_STEP_RAD;
        }
      } else if (delta < -0.05) {
        reverseRatchetAccumRef.current += Math.abs(delta);
        if (reverseRatchetAccumRef.current > 0.35) {
          musicBoxAudio.playRatchetClick(0.6);
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

  // Quick Full Wind for Spring mode
  const handleQuickFullWind = () => {
    musicBoxAudio.playRatchetClick(1.0);
    crankAngleRef.current += Math.PI * 2;
    updateCrankVisuals(crankAngleRef.current, crankRpmValueRef.current);
    if (onSetSpringTension) {
      onSetSpringTension(1.0);
    } else {
      onWindSpring(1.0);
    }
  };

  // Unwind Spring to 0%
  const handleUnwindSpring = () => {
    musicBoxAudio.playRatchetClick(0.7);
    if (onSetSpringTension) {
      onSetSpringTension(0);
    } else {
      onWindSpring(-1.0);
    }
  };

  // Mechanical switch click handler with tactile audio
  const handleMechanicalSwitchToggle = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    musicBoxAudio.playLeverClick(!isPlaying);
    onTogglePlay();
  };

  const estimatedBpm = Math.round(crankRpmValueRef.current * 1.35);
  const currentRoundsWound = springTension * 3.0;
  const isFullTension = springTension >= 0.999;

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border-2 border-[#dccfbe] p-4 sm:p-6 shadow-[0_10px_35px_rgba(67,52,34,0.1)] flex flex-col gap-4 text-[#2d2419]">
      {/* Top Header: Horological Drive Transmission Cam-Selector Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#e8dfd0]">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-b from-[#3d2b16] to-[#1e140a] border border-[#a68656] flex items-center justify-center shadow-xs">
            <Disc className="w-3.5 h-3.5 text-[#f0c465]" />
          </div>
          <div>
            <span className="text-xs font-serif tracking-wider text-[#433422] font-bold block leading-none">
              Horological Drive Transmission
            </span>
            <span className="text-[10px] font-serif text-[#84735c]">
              Select mechanical power source & escapement coupling
            </span>
          </div>
        </div>

        {/* Machined Brass & Ebony 3-Position Cam-Selector Toggle Bank */}
        <div className="inline-flex items-center rounded-xl bg-gradient-to-b from-[#261a0e] to-[#170f08] p-1 border-2 border-[#9e7b36] shadow-[inset_0_2px_6px_rgba(0,0,0,0.85),0_2px_8px_rgba(45,33,20,0.18)] gap-1">
          {/* Left Brass Rivet */}
          <span className="w-2 h-2 rounded-full bg-gradient-to-br from-[#fff2b8] to-[#8a6838] border border-[#3d2810] mx-1 hidden sm:inline-block shrink-0" />

          <button
            id="mode-spring-btn"
            onClick={() => {
              musicBoxAudio.playLeverClick(true);
              onChangePlayMode('spring');
            }}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center space-x-1.5 ${
              playMode === 'spring'
                ? 'bg-gradient-to-b from-[#fae29c] via-[#e2b44d] to-[#9e6f18] text-[#1c1208] font-bold border border-[#fff2b8] shadow-[0_2px_8px_rgba(240,196,101,0.4)]'
                : 'text-[#d8be98] hover:text-[#fff3c4] hover:bg-[#332312] border border-transparent'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Wind-Up Spring</span>
          </button>

          <button
            id="mode-crank-btn"
            onClick={() => {
              musicBoxAudio.playLeverClick(true);
              onChangePlayMode('crank');
            }}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center space-x-1.5 ${
              playMode === 'crank'
                ? 'bg-gradient-to-b from-[#fae29c] via-[#e2b44d] to-[#9e6f18] text-[#1c1208] font-bold border border-[#fff2b8] shadow-[0_2px_8px_rgba(240,196,101,0.4)]'
                : 'text-[#d8be98] hover:text-[#fff3c4] hover:bg-[#332312] border border-transparent'
            }`}
          >
            <Disc className="w-3.5 h-3.5" />
            <span>Hand Crank</span>
          </button>

          <button
            id="mode-continuous-btn"
            onClick={() => {
              musicBoxAudio.playLeverClick(true);
              onChangePlayMode('continuous');
            }}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-serif transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center space-x-1.5 ${
              playMode === 'continuous'
                ? 'bg-gradient-to-b from-[#fae29c] via-[#e2b44d] to-[#9e6f18] text-[#1c1208] font-bold border border-[#fff2b8] shadow-[0_2px_8px_rgba(240,196,101,0.4)]'
                : 'text-[#d8be98] hover:text-[#fff3c4] hover:bg-[#332312] border border-transparent'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Continuous</span>
          </button>

          {/* Right Brass Rivet */}
          <span className="w-2 h-2 rounded-full bg-gradient-to-br from-[#fff2b8] to-[#8a6838] border border-[#3d2810] mx-1 hidden sm:inline-block shrink-0" />
        </div>
      </div>

      {/* UNIFIED SIDE-BY-SIDE CONSOLE: WINDING KEY / HAND CRANK & MECHANICAL STOP-ARM BRAKE LEVER */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* LEFT COLUMN: PRECISION SKEUOMORPHIC WINDING KEY / S-CURVED HAND CRANK / SYNCHRONOUS MOTOR */}
        <div className="md:col-span-6 flex flex-col items-center justify-between p-4 sm:p-5 bg-gradient-to-b from-[#f9f6ef] to-[#f1eadc] rounded-2xl border border-[#ded3be] shadow-inner">
          {/* Rotary Dial / Butterfly Key / Hand Crank Container */}
          <div className="relative w-48 h-48 sm:w-54 sm:h-54 flex items-center justify-center my-0.5">
            {/* 4 Corner Faceplate Mounting Screws */}
            {[
              'top-1 left-1 rotate-12',
              'top-1 right-1 -rotate-45',
              'bottom-1 left-1 rotate-45',
              'bottom-1 right-1 -rotate-12',
            ].map((posCls, idx) => (
              <div
                key={`corner-screw-${idx}`}
                className={`absolute ${posCls} w-3.5 h-3.5 rounded-full bg-gradient-to-br from-[#ffffff] via-[#cfd8e2] to-[#5a6570] border border-[#3b424a] shadow-xs flex items-center justify-center pointer-events-none`}
              >
                <div className="w-2.5 h-[1.5px] bg-[#1e2329]" />
              </div>
            ))}

            {/* 3-Round Spiral / Circular Tension Ring Track (In Spring Mode) */}
            {playMode === 'spring' && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="#e3d7c1"
                  strokeWidth="3.5"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="#b59d78"
                  strokeWidth="4"
                  strokeDasharray="1.2 95.1"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke={
                    isFullTension
                      ? '#c9954d'
                      : springTension > 0.33
                      ? '#d6a858'
                      : '#b34030'
                  }
                  strokeWidth="4.2"
                  strokeDasharray="289.0"
                  strokeDashoffset={289.0 * (1 - springTension)}
                  strokeLinecap="round"
                  className="transition-all duration-75"
                />
              </svg>
            )}

            {/* Interactive Rotary Base Housing Plate */}
            <div
              ref={crankWheelRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`relative w-40 h-40 sm:w-46 sm:h-46 rounded-full bg-gradient-to-tr from-[#261a0e] via-[#3d2b18] to-[#170f07] border-4 border-[#c9a45c] hover:border-[#ffeaa7] shadow-[0_10px_28px_rgba(32,22,12,0.45),inset_0_3px_12px_rgba(0,0,0,0.9)] flex items-center justify-center cursor-grab active:cursor-grabbing transition-all select-none touch-none ${
                isDragging ? 'ring-4 ring-[#d6be8e]/60 scale-[1.01]' : ''
              }`}
            >
              {/* INTERNAL ESCAPEMENT WELL SVG: 60 Graduation Marks, Coiled Mainspring, 16-Tooth Ratchet Wheel & Click Pawl */}
              <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                  <radialGradient id="wellRecessGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#0f0a05" />
                    <stop offset="75%" stopColor="#1c130a" />
                    <stop offset="100%" stopColor="#2e2011" />
                  </radialGradient>
                  <linearGradient id="steelRatchetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f0f4f8" />
                    <stop offset="50%" stopColor="#9aa4b0" />
                    <stop offset="100%" stopColor="#49525c" />
                  </linearGradient>
                </defs>

                {/* Recessed Dark Gunmetal & Brass Escapement Well */}
                <circle cx="100" cy="100" r="88" fill="url(#wellRecessGrad)" stroke="#7a5b2b" strokeWidth="1.5" />

                {/* 60 Precision Horological Degree Ticks around Perimeter */}
                {Array.from({ length: 60 }).map((_, i) => {
                  const ang = (i / 60) * Math.PI * 2;
                  const isMajor = i % 5 === 0;
                  const r1 = isMajor ? 77 : 81;
                  const r2 = 85;
                  return (
                    <line
                      key={`tick-${i}`}
                      x1={100 + Math.cos(ang) * r1}
                      y1={100 + Math.sin(ang) * r1}
                      x2={100 + Math.cos(ang) * r2}
                      y2={100 + Math.sin(ang) * r2}
                      stroke={isMajor ? '#e6c575' : '#8a6b3e'}
                      strokeWidth={isMajor ? '1.6' : '0.9'}
                      opacity={isMajor ? 0.85 : 0.45}
                    />
                  );
                })}

                {/* Coiled Blued-Steel Mainspring Ribbon (Visible in Spring Mode, contracts as wound) */}
                {playMode === 'spring' && (
                  <g>
                    <circle cx="100" cy="100" r="64" fill="#0b0704" stroke="#523b1c" strokeWidth="1.5" />
                    {[56, 48, 40, 32].map((baseR, idx) => {
                      const contractedR = baseR - springTension * (idx + 1) * 2.5;
                      return (
                        <circle
                          key={`spring-coil-${idx}`}
                          cx="100"
                          cy="100"
                          r={Math.max(16, contractedR)}
                          fill="none"
                          stroke="#3b6291"
                          strokeWidth="3.2"
                          strokeDasharray="72 8"
                          opacity="0.9"
                        />
                      );
                    })}
                  </g>
                )}

                {/* Bevel Crown Gear Ring (Visible in Hand Crank Mode) */}
                {playMode === 'crank' && (
                  <g>
                    <circle cx="100" cy="100" r="62" fill="#140d06" stroke="#8a6838" strokeWidth="2" />
                    {Array.from({ length: 24 }).map((_, i) => {
                      const a = (i / 24) * Math.PI * 2;
                      return (
                        <line
                          key={`bevel-tooth-${i}`}
                          x1={100 + Math.cos(a) * 50}
                          y1={100 + Math.sin(a) * 50}
                          x2={100 + Math.cos(a) * 60}
                          y2={100 + Math.sin(a) * 60}
                          stroke="#c99f52"
                          strokeWidth="2.8"
                          opacity="0.7"
                        />
                      );
                    })}
                  </g>
                )}

                {/* Live 16-Tooth Asymmetric Steel Ratchet Wheel */}
                <g ref={ratchetWheelRef} transform="translate(100, 100)">
                  <circle r="27" fill="url(#steelRatchetGrad)" stroke="#2c333a" strokeWidth="1.2" />
                  {Array.from({ length: 16 }).map((_, rIdx) => {
                    const ang = (rIdx / 16) * Math.PI * 2;
                    const x1 = Math.cos(ang) * 26;
                    const y1 = Math.sin(ang) * 26;
                    const x2 = Math.cos(ang + 0.14) * 33;
                    const y2 = Math.sin(ang + 0.14) * 33;
                    const x3 = Math.cos(ang + 0.36) * 26;
                    const y3 = Math.sin(ang + 0.36) * 26;
                    return (
                      <polygon
                        key={`rw-tooth-${rIdx}`}
                        points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`}
                        fill="url(#steelRatchetGrad)"
                        stroke="#37404a"
                        strokeWidth="0.8"
                      />
                    );
                  })}
                  <circle r="16" fill="#8a6838" stroke="#422c0c" strokeWidth="1" />
                </g>

                {/* Spring-Loaded Steel Click Pawl (Detent Dog) & Brass Recoil Spring */}
                <g ref={ratchetPawlRef} transform="translate(132, 68)">
                  {/* Brass recoil spring wire */}
                  <path
                    d="M 4,4 Q 18,-6 22,14"
                    fill="none"
                    stroke="#f0c465"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Tempered blued-steel pawl beak */}
                  <path
                    d="M 3,-3 L -15,11 L -9,16 L 6,3 Z"
                    fill="#2b456b"
                    stroke="#9ec0e6"
                    strokeWidth="0.9"
                  />
                  {/* Pawl pivot screw */}
                  <circle cx="0" cy="0" r="4.5" fill="url(#steelRatchetGrad)" stroke="#1a1f24" strokeWidth="1" />
                  <line x1="-2.5" y1="-1" x2="2.5" y2="1" stroke="#1a1f24" strokeWidth="1.2" />
                </g>
              </svg>

              {/* 1. HAND CRANK ASSEMBLY: S-CURVED FORGED BRASS ARM & COUNTER-ROTATING ROSEWOOD KNOB */}
              {playMode === 'crank' && (
                <div
                  ref={crankRotorRef}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform"
                  style={{ transform: `rotate(${crankAngleRef.current}rad)` }}
                >
                  {/* Forged S-Curved Brass Crank Arm SVG */}
                  <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="forgedCrankGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fff3bd" />
                        <stop offset="40%" stopColor="#e2b959" />
                        <stop offset="80%" stopColor="#9e7422" />
                        <stop offset="100%" stopColor="#5e410c" />
                      </linearGradient>
                    </defs>
                    {/* S-Curve Arm Shadow */}
                    <path
                      d="M 100,104 C 122,104 132,82 154,82 L 176,82 C 185,82 185,118 176,118 L 154,118 C 132,118 122,104 100,104 Z"
                      fill="rgba(0,0,0,0.55)"
                      transform="translate(2, 5)"
                    />
                    {/* S-Curve Forged Brass Arm Body */}
                    <path
                      d="M 100,86 C 125,86 135,78 168,82 C 182,84 186,116 168,118 C 135,122 125,114 100,114 A 14,14 0 1,1 100,86 Z"
                      fill="url(#forgedCrankGrad)"
                      stroke="#fff4c2"
                      strokeWidth="1.5"
                    />
                    {/* Chamfered Lightening Holes along Crank Arm */}
                    <circle cx="126" cy="100" r="4.5" fill="#170f07" stroke="#c99f52" strokeWidth="1.2" />
                    <circle cx="142" cy="100" r="3.5" fill="#170f07" stroke="#c99f52" strokeWidth="1.2" />

                    {/* Center Square Drive Arbor & Hex Retaining Nut */}
                    <circle cx="100" cy="100" r="14" fill="url(#forgedCrankGrad)" stroke="#593f14" strokeWidth="1.5" />
                    <rect x="94" y="94" width="12" height="12" rx="2" fill="#2b1d0c" stroke="#fae7b5" strokeWidth="1.2" />
                    <circle cx="100" cy="100" r="3.5" fill="#e4ecf3" />
                  </svg>

                  {/* Turned Burl Rosewood & Brass Crank Handle Knob (Counter-Rotates so highlight stays top-left!) */}
                  <div
                    className="absolute left-1/2 top-1/2 flex items-center justify-center"
                    style={{ transform: 'translate(46px, -20px)' }}
                  >
                    <div
                      ref={crankKnobCounterRotRef}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-[#9e5b30] via-[#592b11] to-[#261005] border-2 border-[#f0d57c] shadow-[0_8px_18px_rgba(0,0,0,0.85),inset_0_2px_4px_rgba(255,220,180,0.45)] flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
                      style={{ transform: `rotate(${-crankAngleRef.current}rad)` }}
                    >
                      {/* Turned Brass Ferrule Ring & Center Spindle */}
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#fff3c4] via-[#d4af62] to-[#7a581c] border border-[#3b230c] shadow-inner flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-[#241407]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. WIND-UP SPRING MODE: CAST-BRASS FILIGREE DOUBLE-WINGED BUTTERFLY WINDING KEY */}
              {playMode === 'spring' && (
                <div
                  ref={crankRotorRef}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform"
                  style={{ transform: `rotate(${crankAngleRef.current}rad)` }}
                >
                  <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="butterflyKeyBrass" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fff6cc" />
                        <stop offset="30%" stopColor="#f2cb6c" />
                        <stop offset="65%" stopColor="#b8892d" />
                        <stop offset="100%" stopColor="#69480d" />
                      </linearGradient>
                    </defs>

                    {/* Drop shadow under butterfly wings */}
                    <g transform="translate(2, 6)" opacity="0.6">
                      <path
                        d="M 24,100 C 24,66 64,72 86,90 L 114,90 C 136,72 176,66 176,100 C 176,134 136,128 114,110 L 86,110 C 64,128 24,134 24,100 Z"
                        fill="#090603"
                      />
                    </g>

                    {/* Cast-Brass Double-Winged Butterfly Key Silhouette */}
                    <path
                      d="M 22,100 C 22,64 64,70 86,88 L 114,88 C 136,70 178,64 178,100 C 178,136 136,130 114,112 L 86,112 C 64,130 22,136 22,100 Z"
                      fill="url(#butterflyKeyBrass)"
                      stroke="#fff5c2"
                      strokeWidth="2"
                    />

                    {/* Left & Right Wing Filigree Cutouts */}
                    <circle cx="54" cy="100" r="15" fill="#140d06" stroke="#e2bc64" strokeWidth="2" />
                    <circle cx="54" cy="100" r="11" fill="none" stroke="#f7df94" strokeWidth="0.9" strokeDasharray="3 2" />

                    <circle cx="146" cy="100" r="15" fill="#140d06" stroke="#e2bc64" strokeWidth="2" />
                    <circle cx="146" cy="100" r="11" fill="none" stroke="#f7df94" strokeWidth="0.9" strokeDasharray="3 2" />

                    {/* Knurled Wing Grip Ribs */}
                    {[-8, 0, 8].map((dy, idx) => (
                      <React.Fragment key={`rib-${idx}`}>
                        <line x1="27" y1={100 + dy} x2="34" y2={100 + dy} stroke="#593b08" strokeWidth="2" strokeLinecap="round" />
                        <line x1="166" y1={100 + dy} x2="173" y2={100 + dy} stroke="#593b08" strokeWidth="2" strokeLinecap="round" />
                      </React.Fragment>
                    ))}

                    {/* Center Winding Arbor Boss & Square Socket */}
                    <circle cx="100" cy="100" r="18" fill="url(#butterflyKeyBrass)" stroke="#fff5c2" strokeWidth="1.8" />
                    <rect x="92" y="92" width="16" height="16" rx="2.5" fill="#1f1409" stroke="#d4af62" strokeWidth="1.5" />
                    <circle cx="100" cy="100" r="4.5" fill="#e4ecf3" stroke="#2c333a" strokeWidth="1" />
                  </svg>
                </div>
              )}

              {/* 3. CONTINUOUS MODE: SYNCHRONOUS HOROLOGICAL FLYWHEEL & COPPER STATOR COILS */}
              {playMode === 'continuous' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {/* Stationary Copper Field Coils */}
                  <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                    {[0, 90, 180, 270].map((deg) => (
                      <g key={`coil-${deg}`} transform={`translate(100, 100) rotate(${deg})`}>
                        <rect x="-14" y="-68" width="28" height="20" rx="4" fill="#b85d28" stroke="#f0a868" strokeWidth="1.2" />
                        <line x1="-12" y1="-62" x2="12" y2="-62" stroke="#7a3510" strokeWidth="1.5" />
                        <line x1="-12" y1="-55" x2="12" y2="-55" stroke="#7a3510" strokeWidth="1.5" />
                      </g>
                    ))}
                  </svg>

                  {/* Spinning 3-Spoke Brass Balance Wheel */}
                  <div
                    className={`w-26 h-26 rounded-full border-4 border-[#f0c465] shadow-[0_0_16px_rgba(240,196,101,0.35)] flex items-center justify-center ${
                      isPlaying ? 'animate-spin' : ''
                    }`}
                    style={{ animationDuration: `${Math.max(0.8, 180 / Math.max(40, tempoBpm))}s` }}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#9e7422] via-[#fff2b8] to-[#8a6838] border-2 border-[#3d2810] flex items-center justify-center shadow-md">
                      <Zap className="w-4 h-4 text-[#1c1208]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dynamic RPM & Cranking Speed Indicator (Crank Mode) */}
          {playMode === 'crank' && (
            <div className="my-1.5 flex flex-col items-center gap-1 text-xs w-full">
              <div className="flex items-center justify-between w-full px-2 text-[#786650]">
                <div className="flex items-center space-x-1">
                  <Gauge className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span className="font-serif">Angular Speed:</span>
                  <span ref={crankRpmDisplayRef} className="font-mono text-[#8a6b3e] font-bold text-xs tabular-nums">
                    {crankRpmValueRef.current} RPM
                  </span>
                </div>
                <div ref={crankBpmDisplayRef} className="text-[11px] font-mono text-[#786650] tabular-nums">
                  {crankRpmValueRef.current > 0 ? `≈ ${estimatedBpm} BPM` : 'Resting'}
                </div>
              </div>

              <div className="relative w-[94%] h-2 rounded-full bg-[#e3d8c4] border border-[#c9b89c] overflow-hidden shadow-inner">
                <div
                  ref={crankSpeedBarRef}
                  className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-[#8a6b3e] via-[#c9a050] to-[#e6be6a]"
                  style={{ width: `${Math.min(100, (crankRpmValueRef.current / 85) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Dynamic 3-Round Winding Status (Spring Mode) */}
          {playMode === 'spring' && (
            <div className="my-1.5 flex flex-col items-center gap-1 text-xs w-full px-1">
              <div className="flex items-center justify-between w-full text-[#786650]">
                <span className="font-serif font-bold text-xs text-[#433422] flex items-center gap-1">
                  <RotateCw className={`w-3.5 h-3.5 text-[#8a6b3e] ${isDragging ? 'animate-spin' : ''}`} />
                  <span>Mainspring Torque:</span>
                </span>
                <span className="font-mono text-[#8a6b3e] font-bold text-xs tabular-nums">
                  {currentRoundsWound.toFixed(1)} / 3.0 Rounds ({Math.round(springTension * 100)}%)
                </span>
              </div>
            </div>
          )}

          {/* Description Underneath the Key / Crank */}
          <div className="w-full text-center pt-2 border-t border-[#e5dcce] space-y-0.5">
            <span className="text-[11px] sm:text-xs font-serif tracking-wider text-[#6e5229] font-bold block">
              {playMode === 'crank'
                ? 'S-Curved Brass Hand Crank & Ratchet Transmission'
                : playMode === 'spring'
                ? 'Cast-Brass Butterfly Key & 16-Tooth Ratchet Arbor'
                : 'Synchronous Flywheel & Electromagnetic Stator Drive'}
            </span>
            <p className="text-[11px] text-[#786650] font-serif-sub italic">
              {playMode === 'crank'
                ? 'Drag handle clockwise · Rosewood knob counter-rotates with flywheel inertia'
                : playMode === 'spring'
                ? 'Drag key clockwise · Coiled blued-steel mainspring stores 3.0 rounds torque'
                : 'Steady regulated rotation coupled directly to the worm gear train'}
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: MILLED BRASS ESCAPEMENT STOP-ARM LEVER + MAINSPRING GAUGE + VERNIER TEMPO */}
        <div className="md:col-span-6 flex flex-col justify-between p-4 sm:p-5 bg-gradient-to-b from-[#f9f6ef] to-[#f1eadc] rounded-2xl border border-[#ded3be] shadow-inner space-y-3.5">
          {/* 1. MILLED BRASS ESCAPEMENT STOP-ARM BRAKE LEVER SWITCH */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-serif font-bold tracking-wide text-[#5e4420] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#9e7b36]" />
                <span>Governor Stop-Arm Brake Lever</span>
              </span>
              <span className="text-[10px] font-mono font-semibold text-[#6e5229]">
                {isPlaying ? 'WHIP CLEAR · RUNNING' : 'WHIP ENGAGED · LOCKED'}
              </span>
            </div>

            {/* Milled Brass Slide-Bolt Housing with 4 Corner Bolts & Internal Linkage Rod */}
            <div
              id="mechanical-lever-switch"
              onClick={handleMechanicalSwitchToggle}
              className={`group relative w-full h-17 sm:h-19 rounded-2xl p-1.5 transition-all select-none cursor-pointer border-2 shadow-[0_8px_22px_rgba(35,24,12,0.32)] flex items-center justify-between overflow-hidden ${
                isPlaying
                  ? 'bg-gradient-to-b from-[#2b1d0f] via-[#1c1208] to-[#120b04] border-[#d4af62] ring-2 ring-[#e6c986]/40'
                  : playMode === 'spring' && springTension <= 0.005
                  ? 'bg-gradient-to-b from-[#261c12] to-[#140d06] border-[#6e5436] opacity-85'
                  : 'bg-gradient-to-b from-[#281b0e] via-[#1a1108] to-[#110a04] border-[#9e7b36] hover:border-[#dfc282]'
              }`}
              title={
                playMode === 'spring' && springTension <= 0.005
                  ? 'Wind spring or click to auto-wind & release governor whip brake'
                  : isPlaying
                  ? 'Click to slide bolt left and engage governor stop-arm brake (Stop)'
                  : 'Click to slide bolt right and release governor stop-arm brake (Play)'
              }
            >
              {/* Recessed Machine-Milled Brass Slot & Internal Steel Linkage Bar */}
              <div className="absolute inset-x-2.5 inset-y-2.5 rounded-xl brass-milled-track border border-[#5c4020] shadow-inner flex items-center justify-between px-3.5 sm:px-4">
                {/* Internal Steel Linkage Rod connecting slide bolt to governor whip */}
                <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-b from-[#6e7885] via-[#cfd8e3] to-[#394047] opacity-35 pointer-events-none" />

                {/* Left Detent Notch */}
                <div className="w-1.5 h-6 rounded-full bg-[#090502] border-r border-[#4a3419] z-10" />

                {/* Left (STOP / BRAKE) Engraving */}
                <div className="flex items-center space-x-1.5 z-10">
                  <Lock className={`w-3.5 h-3.5 ${!isPlaying ? 'text-[#f09383]' : 'text-[#594736]'}`} />
                  <span className={`text-[10px] sm:text-xs font-serif font-bold tracking-wider ${!isPlaying ? 'text-[#faebd4]' : 'text-[#594736]'}`}>
                    STOP · BRAKE
                  </span>
                </div>

                {/* Right (RUN / RELEASE) Engraving */}
                <div className="flex items-center space-x-1.5 z-10">
                  <span className={`text-[10px] sm:text-xs font-serif font-bold tracking-wider ${isPlaying ? 'text-[#f0c465]' : 'text-[#594736]'}`}>
                    RUN · RELEASE
                  </span>
                  <Wind className={`w-3.5 h-3.5 ${isPlaying ? 'text-[#f0c465]' : 'text-[#594736]'}`} />
                </div>

                {/* Right Detent Notch */}
                <div className="w-1.5 h-6 rounded-full bg-[#090502] border-l border-[#4a3419] z-10" />
              </div>

              {/* Physical Machined Brass Sliding Bolt Handle with Knurled Grip & Faceted Cabochon Jewel */}
              <div
                className={`relative z-20 w-[48%] h-full rounded-xl bg-gradient-to-b from-[#fff5c4] via-[#dfbf6d] to-[#8a641f] border-2 border-[#fff9db] shadow-[0_6px_18px_rgba(0,0,0,0.85)] flex items-center justify-between px-3 transition-transform duration-200 ease-out ${
                  isPlaying ? 'translate-x-[104%]' : 'translate-x-0'
                }`}
              >
                {/* Left Slotted Screw on Slide Bolt */}
                <div className="w-3 h-3 rounded-full bg-gradient-to-br from-[#ffffff] to-[#68737e] border border-[#2b3138] flex items-center justify-center shrink-0">
                  <div className="w-2 h-[1.5px] bg-[#1b1f24] rotate-45" />
                </div>

                {/* Knurled Brass Thumb Ridges */}
                <div className="flex items-center space-x-1 py-1">
                  <div className="w-1 h-6 rounded-full bg-[#47300c] opacity-65" />
                  <div className="w-1 h-8 rounded-full bg-[#ffffff] opacity-85" />
                  <div className="w-1 h-8 rounded-full bg-[#47300c] opacity-75" />
                  <div className="w-1 h-8 rounded-full bg-[#ffffff] opacity-85" />
                  <div className="w-1 h-6 rounded-full bg-[#47300c] opacity-65" />
                </div>

                {/* Faceted Horological Cabochon Jewel Indicator (Static optical jewel, no pulsing dot) */}
                <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0">
                  <circle cx="8" cy="8" r="7" fill="#3d2810" stroke="#fff3c4" strokeWidth="1" />
                  <circle
                    cx="8"
                    cy="8"
                    r="5"
                    fill={
                      isPlaying
                        ? '#10b981'
                        : playMode === 'spring' && springTension <= 0.005
                        ? '#d97706'
                        : '#e11d48'
                    }
                  />
                  <circle cx="6.3" cy="6.3" r="1.6" fill="#ffffff" opacity="0.9" />
                </svg>
              </div>
            </div>

            {/* State explanation caption */}
            <div className="text-[11px] font-serif-sub text-center pt-0.5">
              {playMode === 'spring' && springTension <= 0.005 ? (
                <span className="text-[#a64b38] font-semibold">
                  Mainspring unwound · Turn Butterfly Key or press Quick Full Wind below
                </span>
              ) : isPlaying ? (
                <span className="text-[#3c6b22] font-semibold flex items-center justify-center gap-1">
                  <Wind className="w-3 h-3 text-[#3c6b22]" />
                  <span>Whip wire disengaged from butterfly governor · Cylinder revolving</span>
                </span>
              ) : (
                <span className="text-[#75634d] italic">
                  Whip wire resting against governor vane · Slide bolt right to release
                </span>
              )}
            </div>
          </div>

          {/* 2. MAINSPRING BARREL TORQUE BAR & QUICK PUSH-BUTTONS (In Spring Mode) */}
          {playMode === 'spring' && (
            <div className="space-y-2 pt-1.5 border-t border-[#e5dcce]">
              <div className="relative w-full h-3.5 rounded-full bg-[#e4d9c5] border border-[#c9b799] overflow-hidden flex shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${
                    springTension > 0.66
                      ? 'bg-gradient-to-r from-[#8a6b3e] via-[#c9a050] to-[#e6be6a]'
                      : springTension > 0.33
                      ? 'bg-gradient-to-r from-[#b87d3b] to-[#d6be8e]'
                      : 'bg-gradient-to-r from-[#a64b38] to-[#c98e4d]'
                  }`}
                  style={{ width: `${springTension * 100}%` }}
                />
                <div className="absolute top-0 bottom-0 left-[33.33%] w-[1.5px] bg-[#3a2c1d]/35 pointer-events-none" />
                <div className="absolute top-0 bottom-0 left-[66.66%] w-[1.5px] bg-[#3a2c1d]/35 pointer-events-none" />
              </div>

              <div className="flex justify-between items-center text-[10px] font-mono text-[#786650] tabular-nums">
                <span className={springTension >= 0.33 ? 'text-[#6e5229] font-bold' : ''}>1.0 Round</span>
                <span className={springTension >= 0.66 ? 'text-[#6e5229] font-bold' : ''}>2.0 Rounds</span>
                <span className={isFullTension ? 'text-[#6e5229] font-bold' : ''}>3.0 Rounds (Max)</span>
              </div>

              {/* Tactile Brass-Bezel Push Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                <button
                  id="quick-full-wind-btn"
                  onClick={handleQuickFullWind}
                  className="py-1.5 px-3 rounded-xl bg-gradient-to-b from-[#fae7b5] via-[#e2bd6b] to-[#b88b32] hover:from-[#fff0c4] hover:to-[#c99b3f] border border-[#8a6838] text-xs font-serif font-bold text-[#1f1408] flex items-center justify-center space-x-1.5 transition shadow-xs active:scale-98 cursor-pointer whitespace-nowrap"
                  title="Instantly wind mainspring to 3.0 full rounds (100%)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#3d280c]" />
                  <span>Quick Full Wind</span>
                </button>

                <button
                  id="unwind-spring-btn"
                  onClick={handleUnwindSpring}
                  className="py-1.5 px-3 rounded-xl bg-gradient-to-b from-[#f2ece1] to-[#dfd4c0] hover:from-[#ebe3d4] hover:to-[#d4c6ad] border border-[#bfa888] text-xs font-serif font-semibold text-[#5e4c36] flex items-center justify-center space-x-1.5 transition shadow-xs active:scale-98 cursor-pointer whitespace-nowrap"
                  title="Release ratchet pawl to unwind mainspring to 0%"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#6e583c]" />
                  <span>Unwind (0%)</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. HOROLOGICAL VERNIER TEMPO REGULATOR & CLASSICAL PRESET TOGGLES */}
          <div className="space-y-2 pt-1.5 border-t border-[#e5dcce]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#8a6b3e]" />
                <span className="font-serif font-bold text-xs text-[#433422]">
                  Governor Blade Pitch (Tempo)
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="font-mono text-xs font-bold text-[#5e4420] bg-[#ece2cf] px-2 py-0.5 rounded-md border border-[#cbb799] tabular-nums">
                  {tempoBpm} BPM
                </span>
                {onRewind && (
                  <button
                    id="rewind-btn"
                    onClick={onRewind}
                    title="Rewind cylinder to step 1"
                    className="p-1.5 rounded-lg bg-gradient-to-b from-[#f2ece1] to-[#dfd4c0] hover:from-[#e8dfd0] hover:to-[#d4c6ad] text-[#5e4726] border border-[#c4b090] transition cursor-pointer shadow-2xs"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                {onOpenRecordModal && (
                  <button
                    id="winding-record-btn"
                    onClick={onOpenRecordModal}
                    title="Play & Record Studio (.wav / .mp3)"
                    className="py-1 px-2 rounded-lg bg-gradient-to-b from-[#f5ebe6] to-[#e6d2c8] hover:from-[#f0dfd6] hover:to-[#dec2b4] text-[#8a2d1d] border border-[#cfa898] transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <span className="w-2 h-2 rounded-full bg-[#c0392b]" />
                    <span className="text-[10px] font-mono font-bold text-[#8a2d1d]">REC</span>
                  </button>
                )}
              </div>
            </div>

            {/* Vernier Brass Scale Slider & Classical Horology Markings */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex items-center space-x-2">
                <button
                  id="tempo-decrease-btn"
                  onClick={() => onChangeTempoBpm?.(Math.max(40, tempoBpm - 4))}
                  title="Increase governor air vane drag (Slower)"
                  className="p-1.5 rounded-lg bg-gradient-to-b from-[#f2ece1] to-[#dfd4c0] hover:from-[#e8dfd0] hover:to-[#d4c6ad] text-[#5e4726] border border-[#c4b090] transition cursor-pointer active:scale-95 shadow-2xs"
                >
                  <Minus className="w-3 h-3" />
                </button>

                <div className="relative flex-1 flex flex-col justify-center">
                  <input
                    id="playback-speed-slider"
                    type="range"
                    min="40"
                    max="160"
                    step="2"
                    value={tempoBpm}
                    onChange={(e) => onChangeTempoBpm?.(Number(e.target.value))}
                    className="w-full accent-[#8a6b3e] cursor-pointer h-2 bg-gradient-to-r from-[#d8caa8] via-[#faebd4] to-[#d8caa8] rounded-lg border border-[#a68656]/60 shadow-inner"
                  />
                  <div className="flex justify-between px-1 pt-1 text-[8px] font-mono text-[#786650] pointer-events-none select-none tabular-nums">
                    <span>40</span>
                    <span>60</span>
                    <span>88</span>
                    <span>108</span>
                    <span>132</span>
                    <span>160</span>
                  </div>
                </div>

                <button
                  id="tempo-increase-btn"
                  onClick={() => onChangeTempoBpm?.(Math.min(160, tempoBpm + 4))}
                  title="Feather governor air vane angle (Faster)"
                  className="p-1.5 rounded-lg bg-gradient-to-b from-[#f2ece1] to-[#dfd4c0] hover:from-[#e8dfd0] hover:to-[#d4c6ad] text-[#5e4726] border border-[#c4b090] transition cursor-pointer active:scale-95 shadow-2xs"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* Classical Horological Tempo Cam-Preset Toggles */}
              <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                {[
                  { label: 'Largo', bpm: 60 },
                  { label: 'Andante', bpm: 88 },
                  { label: 'Moderato', bpm: 108 },
                  { label: 'Allegro', bpm: 132 },
                  { label: 'Presto', bpm: 152 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    id={`tempo-preset-${preset.bpm}`}
                    onClick={() => {
                      musicBoxAudio.playLeverClick(true);
                      onChangeTempoBpm?.(preset.bpm);
                    }}
                    className={`py-1 px-1 text-[9px] sm:text-[10px] font-serif rounded-lg border transition-all cursor-pointer text-center truncate ${
                      tempoBpm === preset.bpm
                        ? 'bg-gradient-to-b from-[#3d2b16] to-[#1e140a] text-[#fae7b5] border-[#a68656] font-bold shadow-xs'
                        : 'bg-[#eee7da] hover:bg-[#e3dac9] text-[#5e4c36] border-[#d5c7b0]'
                    }`}
                  >
                    <span>{preset.label}</span>
                    <span className="block text-[8px] font-mono opacity-80 tabular-nums">{preset.bpm}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Crank & Aerodynamic Governor Status Note */}
          {playMode === 'crank' && (
            <div className="pt-2 border-t border-[#e5dcce] flex items-center justify-between text-xs text-[#75634d] font-serif-sub italic">
              {crankRpmValueRef.current > 70 ? (
                <span className="text-[#96472d] font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#96472d]" />
                  <span>Centrifugal Air-Vane Governor Limiting Peak Speed</span>
                </span>
              ) : (
                <span className="text-[#634e34] flex items-center gap-1">
                  <Wind className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span>Worm Gear & Flywheel Momentum Coupled</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
