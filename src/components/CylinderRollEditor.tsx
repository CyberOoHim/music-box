import React, { useRef, useEffect } from 'react';
import {
  MusicBoxPin,
  TineNote,
  CombScaleId,
  COMB_SCALES_MAP,
  ROMANTIC_FLAT_22_TINES,
} from '../types';
import { Trash2, ArrowLeft, ArrowRight, Music, Sliders, Sparkles, Play, Pause } from 'lucide-react';

interface CylinderRollEditorProps {
  pins: MusicBoxPin[];
  totalSteps: number;
  currentStep: number;
  isPlaying: boolean;
  combScaleId?: CombScaleId;
  customTines?: TineNote[];
  onChangeCombScale?: (scaleId: CombScaleId) => void;
  onTogglePin: (step: number, tineIndex: number) => void;
  onClearAll: () => void;
  onShiftPins: (deltaSteps: number) => void;
  onPluckTine: (tineIndex: number) => void;
  onSubscribeStep?: (cb: (step: number) => void) => () => void;
  onTogglePlay?: () => void;
}

export const CylinderRollEditor: React.FC<CylinderRollEditorProps> = React.memo(({
  pins,
  totalSteps,
  currentStep,
  isPlaying,
  combScaleId = 'romantic-flat',
  customTines,
  onChangeCombScale,
  onTogglePin,
  onClearAll,
  onShiftPins,
  onPluckTine,
  onSubscribeStep,
  onTogglePlay,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledStepRef = useRef<number>(-1);

  // Active tines list
  const activeTines: TineNote[] = React.useMemo(() => {
    if (customTines && customTines.length > 0) return customTines;
    const scaleInfo = COMB_SCALES_MAP[combScaleId];
    return scaleInfo ? scaleInfo.tines : ROMANTIC_FLAT_22_TINES;
  }, [customTines, combScaleId]);

  // Fast pin lookup set
  const pinMap = React.useMemo(() => {
    const map = new Set<string>();
    pins.forEach((p) => map.add(`${p.step}-${p.tineIndex}`));
    return map;
  }, [pins]);

  // Update cursor position and perform smooth auto-scroll when step changes
  const updateCursorAndScroll = React.useCallback((step: number) => {
    if (cursorRef.current) {
      cursorRef.current.style.transform = `translateX(${step * 24}px)`;
    }

    if (containerRef.current) {
      const container = containerRef.current;
      const stepLeft = step * 24;
      const scrollLeft = container.scrollLeft;
      const clientWidth = container.clientWidth;

      // Only scroll if cursor is near or outside visible boundaries
      if (stepLeft < scrollLeft || stepLeft > scrollLeft + clientWidth - 72) {
        if (Math.abs(step - lastScrolledStepRef.current) > 2) {
          lastScrolledStepRef.current = step;
          container.scrollTo({
            left: Math.max(0, stepLeft - clientWidth / 3),
            behavior: 'auto',
          });
        }
      }
    }
  }, []);

  // Listen to subscribed step updates if provided
  useEffect(() => {
    if (!onSubscribeStep) return;
    const unsubscribe = onSubscribeStep((step) => {
      updateCursorAndScroll(step);
    });
    return unsubscribe;
  }, [onSubscribeStep, updateCursorAndScroll]);

  // Sync cursor on direct prop updates
  useEffect(() => {
    updateCursorAndScroll(currentStep);
  }, [currentStep, updateCursorAndScroll]);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-step]') as HTMLElement | null;
    if (!target) return;
    const step = Number(target.dataset.step);
    const tine = Number(target.dataset.tine);
    if (Number.isFinite(step) && Number.isFinite(tine)) {
      onTogglePin(step, tine);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-6 shadow-[0_4px_24px_rgba(67,52,34,0.06)] text-[#2d2419]">
      {/* Editor Header & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-[#e5dcce]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-serif font-bold text-[#433422] flex items-center gap-2">
              <Music className="w-4 h-4 text-[#8a6b3e]" />
              <span>Cylinder Pin Matrix Editor</span>
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-sans font-medium bg-[#f5ede0] text-[#7a5c2e] border border-[#dfceb5]">
              <Sparkles className="w-3 h-3 mr-1 text-[#b8860b]" />
              {activeTines.length} Tines Active
            </span>
          </div>
          <p className="text-xs text-[#75644e] font-serif-sub italic">
            Click any cell to punch or remove a brass pin. Flat accidentals (<span className="text-[#8a5a1f] font-mono font-bold">♭</span>) highlighted in golden amber.
          </p>
        </div>

        {/* Action Buttons & Scale Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {onChangeCombScale && (
            <div className="flex items-center space-x-1.5 bg-[#f4eee4] border border-[#ded3be] rounded-lg px-2 py-1">
              <Sliders className="w-3.5 h-3.5 text-[#8a6b3e]" />
              <label htmlFor="comb-scale-select" className="text-xs text-[#6e5a42] font-serif">Comb:</label>
              <select
                id="comb-scale-select"
                value={combScaleId}
                onChange={(e) => onChangeCombScale(e.target.value as CombScaleId)}
                className="bg-transparent text-xs font-serif text-[#433422] font-semibold focus:outline-none cursor-pointer"
              >
                {Object.values(COMB_SCALES_MAP).map((scale) => (
                  <option key={scale.id} value={scale.id} className="bg-[#fcfbf8] text-[#2d2419]">
                    {scale.shortLabel} ({scale.tinesCount}T • {scale.rangeLabel})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center space-x-1.5">
            {onTogglePlay && (
              <button
                id="editor-quick-play-btn"
                onClick={onTogglePlay}
                title={isPlaying ? 'Engage Brake (Pause)' : 'Release Brake (Play)'}
                className={`px-2.5 py-1 rounded-lg text-xs font-serif font-bold flex items-center space-x-1.5 border transition shadow-2xs cursor-pointer ${
                  isPlaying
                    ? 'bg-gradient-to-r from-[#d6be8e] via-[#f0c465] to-[#c99432] text-[#1c1208] border-[#f3e18a] shadow-[0_0_8px_rgba(240,196,101,0.5)]'
                    : 'bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] hover:text-[#2d2419] border-[#ded3be]'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-[#8a6b3e]" />
                    <span>Play</span>
                  </>
                )}
              </button>
            )}
            <button
              id="shift-left-btn"
              onClick={() => onShiftPins(-1)}
              title="Shift all pins left by 1 step"
              className="p-1.5 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] hover:text-[#2d2419] border border-[#ded3be] transition shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              id="shift-right-btn"
              onClick={() => onShiftPins(1)}
              title="Shift all pins right by 1 step"
              className="p-1.5 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] hover:text-[#2d2419] border border-[#ded3be] transition shadow-2xs cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              id="clear-pins-btn"
              onClick={onClearAll}
              title="Clear all pins on the cylinder"
              className="px-2.5 py-1.5 rounded-lg bg-[#fdf2f0] hover:bg-[#fae4e1] text-[#9c3826] border border-[#f2c6bf] text-xs font-serif flex items-center space-x-1.5 transition shadow-2xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Piano Roll / Pin Grid Container */}
      <div className="relative flex rounded-xl border border-[#ded3be] bg-[#f8f5ee] overflow-hidden shadow-inner max-h-[520px]">
        {/* Left Tine Labels Column */}
        <div className="w-24 sm:w-28 shrink-0 bg-[#f2ecde] border-r border-[#ded3be] select-none z-10 overflow-y-auto custom-scrollbar">
          <div className="h-7 border-b border-[#ded3be] px-2 flex items-center justify-between text-[10px] uppercase font-mono text-[#8a765e] font-semibold sticky top-0 bg-[#f2ecde] z-20">
            <span>Note</span>
            <span>No. #</span>
          </div>
          {/* Render in reverse so High pitches are at top, Bass at bottom */}
          {[...activeTines].reverse().map((tine) => {
            const isFlatAccidental = tine.isFlat || tine.note.includes('b') || tine.note.includes('#');
            return (
              <div
                key={tine.index}
                onClick={() => onPluckTine(tine.index)}
                title={`Click to listen: Note #${tine.index + 1} (${tine.note}, ${tine.frequency.toFixed(1)}Hz)${tine.flatEnharmonic ? ` • ${tine.flatEnharmonic}` : ''}`}
                className={`h-6 sm:h-7 px-2 border-b border-[#e5dcce] flex items-center justify-between text-xs font-mono cursor-pointer transition-colors ${
                  isFlatAccidental
                    ? 'bg-[#f5ede0] text-[#7d561a] hover:bg-[#ecdcbe]'
                    : 'text-[#433422] hover:bg-[#e8dfcf] hover:text-[#8a6b3e]'
                }`}
              >
                <div className="flex items-center space-x-1">
                  <span className={`font-semibold ${isFlatAccidental ? 'text-[#8c5e1b] font-bold' : ''}`}>
                    {tine.note}
                  </span>
                  {isFlatAccidental && (
                    <span className="text-[9px] px-1 rounded bg-[#ebd7b2] text-[#6b4712] font-sans font-bold">
                      ♭
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono font-bold text-[#8a765e]">#{tine.index + 1}</span>
              </div>
            );
          })}
        </div>

        {/* Scrollable Pin Matrix Grid */}
        <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div
            className="relative"
            style={{ width: `${totalSteps * 24}px` }}
            onClick={handleGridClick}
          >
            {/* Step Numbers Header */}
            <div className="h-7 border-b border-[#ded3be] flex bg-[#eae2d3] select-none sticky top-0 z-20">
              {Array.from({ length: totalSteps }).map((_, step) => {
                const isMeasure = step % 8 === 0;
                return (
                  <div
                    key={step}
                    className={`w-6 shrink-0 flex items-center justify-center text-[9px] font-mono border-r ${
                      isMeasure ? 'border-[#c8bba6] text-[#8a6b3e] font-bold bg-[#e0d6c3]' : 'border-[#ded3be]/60 text-[#8a765e]'
                    }`}
                  >
                    {step + 1}
                  </div>
                );
              })}
            </div>

            {/* Active Step Cursor Vertical Line */}
            <div
              ref={cursorRef}
              className="absolute top-0 bottom-0 left-0 w-6 bg-[#bfa175]/25 border-x border-[#bfa175]/80 pointer-events-none z-10 will-change-transform"
              style={{ transform: `translateX(${currentStep * 24}px)` }}
            />

            {/* Tine Rows */}
            {[...activeTines].reverse().map((tine) => {
              const isFlatAccidental = tine.isFlat || tine.note.includes('b') || tine.note.includes('#');
              return (
                <div
                  key={tine.index}
                  className={`h-6 sm:h-7 flex border-b border-[#ded3be]/50 relative ${
                    isFlatAccidental ? 'bg-[#faf6ee]' : ''
                  }`}
                >
                  {Array.from({ length: totalSteps }).map((_, step) => {
                    const hasPin = pinMap.has(`${step}-${tine.index}`);
                    const isMeasure = step % 8 === 0;

                    return (
                      <div
                        key={step}
                        id={`pin-cell-${step}-${tine.index}`}
                        data-step={step}
                        data-tine={tine.index}
                        className={`w-6 shrink-0 h-full border-r cursor-pointer flex items-center justify-center transition-colors group relative ${
                          isMeasure ? 'border-[#c8bba6]/70 bg-[#ede5d5]/40' : 'border-[#ded3be]/40 bg-transparent'
                        } hover:bg-[#e8decb]/80`}
                      >
                        {/* Pin Circle */}
                        {hasPin && (
                          <div
                            className={`w-3.5 h-3.5 rounded-full ${
                              isFlatAccidental
                                ? 'bg-gradient-to-tr from-[#9e5f12] via-[#f2ab35] to-[#ffe082] shadow-sm shadow-[#433422]/30 border border-[#fff2b2]'
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
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid Legend & Info */}
      <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-[#75644e] px-1 gap-2">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#d6be8e] border border-[#a68656] inline-block" />
            <span className="font-serif">Natural Pin</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f2ab35] border border-[#9e5f12] inline-block" />
            <span className="font-serif font-medium text-[#7d561a]">Flat Accidental Pin (♭)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ded3be] inline-block" />
            <span className="font-serif">Empty Slot</span>
          </span>
        </div>
        <span className="text-[#8a765e] font-mono">
          Total {pins.length} active pins • {totalSteps} steps ({Math.max(1, Math.round(totalSteps / 16))} measures)
        </span>
      </div>
    </div>
  );
});

