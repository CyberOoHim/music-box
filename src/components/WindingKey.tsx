import React, { useState, useRef, useEffect } from 'react';
import { PlayMode } from '../types';
import { RotateCw, Zap, Disc, Gauge, Play, Pause, Square } from 'lucide-react';
import { musicBoxAudio } from '../audio/musicBoxAudio';

interface WindingKeyProps {
  playMode: PlayMode;
  onChangePlayMode: (mode: PlayMode) => void;
  springTension: number; // 0 to 1
  onWindSpring: (addedTension: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onManualCrankStep?: (stepsDelta: number) => void;
}

export const WindingKey: React.FC<WindingKeyProps> = ({
  playMode,
  onChangePlayMode,
  springTension,
  onWindSpring,
  isPlaying,
  onTogglePlay,
  onManualCrankStep,
}) => {
  const [isDraggingWinder, setIsDraggingWinder] = useState(false);
  const [winderAngle, setWinderAngle] = useState(0);
  const lastAngleRef = useRef(0);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const winderElementRef = useRef<HTMLDivElement | null>(null);

  // Handle pointer drag rotation on winding key or crank
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!winderElementRef.current) return;
    const rect = winderElementRef.current.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    lastAngleRef.current = Math.atan2(
      e.clientY - centerRef.current.y,
      e.clientX - centerRef.current.x
    );
    setIsDraggingWinder(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingWinder) return;
    const currentAngle = Math.atan2(
      e.clientY - centerRef.current.y,
      e.clientX - centerRef.current.x
    );
    let delta = currentAngle - lastAngleRef.current;

    // Handle angle wrapping across -PI / +PI boundary
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    lastAngleRef.current = currentAngle;
    setWinderAngle((prev) => prev + delta);

    if (playMode === 'spring') {
      // Clockwise rotation winds the spring
      if (delta > 0.08) {
        musicBoxAudio.playWindingClick();
        onWindSpring(0.08); // Add 8% tension per click
      }
    } else if (playMode === 'crank') {
      // In hand crank mode, spinning advances cylinder steps directly
      if (Math.abs(delta) > 0.04 && onManualCrankStep) {
        const stepAmount = delta * 3.5;
        onManualCrankStep(stepAmount);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDraggingWinder(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-5 shadow-[0_4px_24px_rgba(67,52,34,0.06)] flex flex-col md:flex-row items-center justify-between gap-5 text-[#2d2419]">
      {/* Play Mode Selector */}
      <div className="flex flex-col space-y-2 w-full md:w-auto">
        <span className="text-xs uppercase font-serif tracking-wider text-[#8a6b3e] font-semibold">
          Drive Mechanism
        </span>
        <div className="inline-flex rounded-xl bg-[#eee7da] p-1 border border-[#ded3be] shadow-xs">
          <button
            id="mode-spring-btn"
            onClick={() => onChangePlayMode('spring')}
            className={`px-3 py-1.5 rounded-lg text-xs font-serif transition-all ${
              playMode === 'spring'
                ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-xs'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-serif transition-all ${
              playMode === 'crank'
                ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-xs'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-serif transition-all ${
              playMode === 'continuous'
                ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-xs'
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

      {/* Center Interactive Winding / Crank Widget */}
      <div className="flex items-center space-x-6">
        {/* Interactive Rotating Key / Crank */}
        <div className="flex flex-col items-center">
          <div
            ref={winderElementRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-[#241a0e] border-2 border-[#bfa175] hover:border-[#dfca9d] flex items-center justify-center cursor-grab active:cursor-grabbing shadow-md group transition-all"
            title={
              playMode === 'spring'
                ? 'Drag clockwise to wind the mechanical spring'
                : playMode === 'crank'
                ? 'Drag clockwise/counter-clockwise to crank music'
                : 'Continuous motor active'
            }
          >
            {/* Golden Butterfly Winding Wing Key */}
            <div
              className="w-12 h-6 sm:w-14 sm:h-7 rounded-full bg-gradient-to-r from-[#946614] via-[#eed882] to-[#946614] shadow-md shadow-[#140e06] flex items-center justify-center pointer-events-none transition-transform border border-[#ffe787]/40"
              style={{ transform: `rotate(${winderAngle}rad)` }}
            >
              {/* Key Spindle hole */}
              <div className="w-3 h-3 rounded-full bg-[#1b130a] border border-[#d4b788]/60" />
            </div>
          </div>
          <span className="text-[11px] text-[#786650] mt-1 font-serif-sub italic">
            {playMode === 'spring' ? 'Drag key to wind' : playMode === 'crank' ? 'Turn crank to play' : 'Electric motor'}
          </span>
        </div>

        {/* Spring Tension Gauge (Visible in Spring mode) */}
        {playMode === 'spring' && (
          <div className="flex flex-col space-y-1.5 w-32 sm:w-40">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#75644e] flex items-center gap-1 font-serif">
                <Gauge className="w-3 h-3 text-[#a68656]" />
                <span>Spring Tension</span>
              </span>
              <span className="font-mono text-[#8a6b3e] font-bold">
                {Math.round(springTension * 100)}%
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-[#e8dfcf] border border-[#d8caa8] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  springTension > 0.3
                    ? 'bg-gradient-to-r from-[#a68656] to-[#d6be8e]'
                    : 'bg-gradient-to-r from-[#a64b38] to-[#c98e4d]'
                }`}
                style={{ width: `${springTension * 100}%` }}
              />
            </div>
            <button
              id="wind-full-btn"
              onClick={() => {
                musicBoxAudio.playWindingClick();
                onWindSpring(1.0);
              }}
              className="text-[11px] text-[#8a6b3e] hover:text-[#5e4c36] text-left underline underline-offset-2 decoration-[#d8caa8] font-serif"
            >
              + Quick Full Wind
            </button>
          </div>
        )}
      </div>

      {/* Main Play / Pause Button */}
      <div className="w-full md:w-auto flex items-center justify-center">
        {playMode !== 'crank' ? (
          <button
            id="main-play-btn"
            onClick={onTogglePlay}
            disabled={playMode === 'spring' && springTension <= 0}
            className={`w-full md:w-auto px-6 py-3 rounded-xl font-serif text-sm font-semibold tracking-wide flex items-center justify-center space-x-2.5 shadow-sm transition-all border ${
              isPlaying
                ? 'bg-[#f4efe4] border-[#d8caa8] text-[#433422] hover:bg-[#eae1d0]'
                : playMode === 'spring' && springTension <= 0
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
                <span>{playMode === 'spring' && springTension <= 0 ? 'Wind Spring First' : 'Play Music Box'}</span>
              </>
            )}
          </button>
        ) : (
          <div className="px-4 py-2 rounded-xl bg-[#f4efe4] border border-[#d8caa8] text-[#8a6b3e] text-xs text-center font-serif-sub italic">
            Turn crank above with finger or mouse to play
          </div>
        )}
      </div>
    </div>
  );
};
