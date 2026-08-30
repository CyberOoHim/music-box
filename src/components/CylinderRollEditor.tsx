import React, { useRef, useEffect } from 'react';
import { MusicBoxPin, SANKYO_18_TINES } from '../types';
import { Plus, Trash2, ArrowLeft, ArrowRight, Music, Play, RotateCcw } from 'lucide-react';

interface CylinderRollEditorProps {
  pins: MusicBoxPin[];
  totalSteps: number;
  currentStep: number;
  isPlaying: boolean;
  onTogglePin: (step: number, tineIndex: number) => void;
  onClearAll: () => void;
  onShiftPins: (deltaSteps: number) => void;
  onPluckTine: (tineIndex: number) => void;
}

export const CylinderRollEditor: React.FC<CylinderRollEditorProps> = ({
  pins,
  totalSteps,
  currentStep,
  isPlaying,
  onTogglePin,
  onClearAll,
  onShiftPins,
  onPluckTine,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fast pin lookup set
  const pinMap = React.useMemo(() => {
    const map = new Set<string>();
    pins.forEach((p) => map.add(`${p.step}-${p.tineIndex}`));
    return map;
  }, [pins]);

  // Auto-scroll roll to keep active playback cursor in view if playing
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;
    const stepWidth = 24; // width per step in px
    const targetScroll = currentStep * stepWidth - containerRef.current.clientWidth / 2;
    containerRef.current.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: 'smooth',
    });
  }, [currentStep, isPlaying]);

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-6 shadow-[0_4px_24px_rgba(67,52,34,0.06)] text-[#2d2419]">
      {/* Editor Header & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-[#e5dcce]">
        <div>
          <h3 className="text-base sm:text-lg font-serif font-bold text-[#433422] flex items-center gap-2">
            <Music className="w-4 h-4 text-[#8a6b3e]" />
            <span>Cylinder Pin Matrix Editor</span>
          </h3>
          <p className="text-xs text-[#75644e] font-serif-sub italic">
            Click any cell to punch or remove a brass pin. Rows correspond to the 18 steel tines.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            id="shift-left-btn"
            onClick={() => onShiftPins(-1)}
            title="Shift all pins left by 1 step"
            className="p-1.5 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] hover:text-[#2d2419] border border-[#ded3be] transition shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            id="shift-right-btn"
            onClick={() => onShiftPins(1)}
            title="Shift all pins right by 1 step"
            className="p-1.5 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] hover:text-[#2d2419] border border-[#ded3be] transition shadow-2xs"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            id="clear-pins-btn"
            onClick={onClearAll}
            title="Clear all pins on the cylinder"
            className="px-2.5 py-1.5 rounded-lg bg-[#fdf2f0] hover:bg-[#fae4e1] text-[#9c3826] border border-[#f2c6bf] text-xs font-serif flex items-center space-x-1.5 transition shadow-2xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Piano Roll / Pin Grid Container */}
      <div className="relative flex rounded-xl border border-[#ded3be] bg-[#f8f5ee] overflow-hidden shadow-inner">
        {/* Left Tine Labels Column (18 tines: High D7 down to Low C5) */}
        <div className="w-20 sm:w-24 shrink-0 bg-[#f2ecde] border-r border-[#ded3be] select-none z-10">
          <div className="h-7 border-b border-[#ded3be] px-2 flex items-center justify-center text-[10px] uppercase font-mono text-[#8a765e] font-semibold">
            Tine / Note
          </div>
          {/* Render in reverse so High pitches are at top, Bass at bottom */}
          {[...SANKYO_18_TINES].reverse().map((tine) => (
            <div
              key={tine.index}
              onClick={() => onPluckTine(tine.index)}
              title={`Click to listen to ${tine.note} (${tine.frequency.toFixed(0)}Hz)`}
              className="h-6 sm:h-7 px-2 border-b border-[#e5dcce] flex items-center justify-between text-xs font-mono text-[#433422] hover:bg-[#e8dfcf] hover:text-[#8a6b3e] cursor-pointer transition-colors"
            >
              <span className="font-semibold">{tine.note}</span>
              <span className="text-[10px] text-[#8a765e]">{tine.index + 1}</span>
            </div>
          ))}
        </div>

        {/* Scrollable Pin Matrix Grid */}
        <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar">
          <div
            className="relative"
            style={{ width: `${totalSteps * 24}px` }}
          >
            {/* Step Numbers Header */}
            <div className="h-7 border-b border-[#ded3be] flex bg-[#eae2d3] select-none">
              {Array.from({ length: totalSteps }).map((_, step) => {
                const isMeasure = step % 8 === 0;
                const isCurrent = step === currentStep;
                return (
                  <div
                    key={step}
                    className={`w-6 shrink-0 flex items-center justify-center text-[9px] font-mono border-r ${
                      isMeasure ? 'border-[#c8bba6] text-[#8a6b3e] font-bold bg-[#e0d6c3]' : 'border-[#ded3be]/60 text-[#8a765e]'
                    } ${isCurrent ? 'bg-[#433422] text-[#fbf8f2] font-bold' : ''}`}
                  >
                    {step + 1}
                  </div>
                );
              })}
            </div>

            {/* Active Step Cursor Vertical Line */}
            <div
              className="absolute top-7 bottom-0 w-6 bg-[#bfa175]/25 border-x border-[#bfa175]/80 pointer-events-none z-10 transition-all duration-75"
              style={{ left: `${currentStep * 24}px` }}
            />

            {/* 18 Tine Rows */}
            {[...SANKYO_18_TINES].reverse().map((tine) => (
              <div
                key={tine.index}
                className="h-6 sm:h-7 flex border-b border-[#ded3be]/50 relative"
              >
                {Array.from({ length: totalSteps }).map((_, step) => {
                  const hasPin = pinMap.has(`${step}-${tine.index}`);
                  const isMeasure = step % 8 === 0;
                  const isCurrent = step === currentStep;

                  return (
                    <div
                      key={step}
                      id={`pin-cell-${step}-${tine.index}`}
                      onClick={() => onTogglePin(step, tine.index)}
                      className={`w-6 shrink-0 h-full border-r cursor-pointer flex items-center justify-center transition-colors group relative ${
                        isMeasure ? 'border-[#c8bba6]/70 bg-[#ede5d5]/40' : 'border-[#ded3be]/40 bg-transparent'
                      } hover:bg-[#e8decb]/80`}
                    >
                      {/* Pin Circle */}
                      {hasPin && (
                        <div
                          className={`w-3.5 h-3.5 rounded-full transition-transform ${
                            isCurrent
                              ? 'bg-[#eed882] ring-2 ring-[#a68656] shadow-md shadow-[#8a6b3e]/40 scale-125'
                              : 'bg-gradient-to-tr from-[#946614] via-[#eed882] to-[#946614] shadow-sm shadow-[#433422]/20 border border-[#ffe787]/50'
                          }`}
                        />
                      )}
                      {!hasPin && (
                        <div className="w-1 h-1 rounded-full bg-[#ded3be] group-hover:bg-[#b8a68d] transition-colors" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Legend & Info */}
      <div className="mt-3 flex items-center justify-between text-xs text-[#75644e] px-1">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#d6be8e] border border-[#a68656] inline-block" />
            <span className="font-serif">Brass Pin (Plucks steel tine)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ded3be] inline-block" />
            <span className="font-serif">Empty Slot</span>
          </span>
        </div>
        <span className="text-[#8a765e] font-mono">Total {pins.length} active pins</span>
      </div>
    </div>
  );
};
