import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  MusicBoxPin,
  TineNote,
  CombScaleId,
  COMB_SCALES_MAP,
  ROMANTIC_FLAT_22_TINES,
  EditorTool,
  GridZoomLevel,
  StepAdvanceInterval,
} from '../types';
import {
  Trash2,
  Music,
  Sliders,
  Sparkles,
  Play,
  Pause,
  Undo2,
  Redo2,
  Pencil,
  Eraser,
  Volume2,
  Radio,
  Copy,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  ArrowUp,
  ArrowDown,
  Layers,
  Check,
  Plus,
} from 'lucide-react';

const ZOOM_STEP_WIDTH: Record<GridZoomLevel, number> = {
  compact: 22,
  normal: 32,
  spacious: 44, // Recommended for iPad / finger touch
  wide: 60,
};

const KEYBOARD_SHORTCUTS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
  'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';',
];

interface CylinderRollEditorProps {
  pins: MusicBoxPin[];
  totalSteps: number;
  currentStep: number;
  isPlaying: boolean;
  combScaleId?: CombScaleId;
  customTines?: TineNote[];
  songTitle?: string;
  songDescription?: string;
  tempoBpm?: number;
  onChangeCombScale?: (scaleId: CombScaleId) => void;
  onTogglePin: (step: number, tineIndex: number) => void;
  onSetPins?: (newPins: MusicBoxPin[]) => void;
  onClearAll: () => void;
  onShiftPins: (deltaSteps: number) => void;
  onPluckTine: (tineIndex: number) => void;
  onSubscribeStep?: (cb: (step: number) => void) => () => void;
  onTogglePlay?: () => void;
  onSeekStep?: (step: number) => void;
  onUpdateSongMeta?: (updates: { title?: string; description?: string; tempoBpm?: number; totalSteps?: number }) => void;
  onDuplicateSong?: () => void;
  onNewBlankSong?: () => void;
}

export const CylinderRollEditor: React.FC<CylinderRollEditorProps> = React.memo(({
  pins,
  totalSteps,
  currentStep,
  isPlaying,
  combScaleId = 'romantic-flat',
  customTines,
  songTitle,
  songDescription,
  tempoBpm = 88,
  onChangeCombScale,
  onTogglePin,
  onSetPins,
  onClearAll,
  onShiftPins,
  onPluckTine,
  onSubscribeStep,
  onTogglePlay,
  onSeekStep,
  onUpdateSongMeta,
  onDuplicateSong,
  onNewBlankSong,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledStepRef = useRef<number>(-1);

  // Editor State
  const [activeTool, setActiveTool] = useState<EditorTool>('draw');
  const [zoomLevel, setZoomLevel] = useState<GridZoomLevel>('spacious'); // Default to spacious for iPad
  const [recordStep, setRecordStep] = useState<number>(0);
  const [stepAdvance, setStepAdvance] = useState<StepAdvanceInterval>(2); // 2 steps = 8th note
  const [showPatternTools, setShowPatternTools] = useState<boolean>(false);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editedTitle, setEditedTitle] = useState<string>(songTitle || '');
  const [hoveredTine, setHoveredTine] = useState<number | null>(null);

  // Undo / Redo History Stack (Local 50-step stack)
  const [history, setHistory] = useState<MusicBoxPin[][]>([pins]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const isUndoRedoActionRef = useRef<boolean>(false);

  // Keep editedTitle in sync when song changes
  useEffect(() => {
    setEditedTitle(songTitle || '');
  }, [songTitle]);

  // Sync incoming pins into history if not triggered by internal undo/redo
  useEffect(() => {
    if (isUndoRedoActionRef.current) {
      isUndoRedoActionRef.current = false;
      return;
    }
    setHistory((prev) => {
      const current = prev[historyIndex];
      if (current && current.length === pins.length && JSON.stringify(current) === JSON.stringify(pins)) {
        return prev;
      }
      const trimmed = prev.slice(0, historyIndex + 1);
      const next = [...trimmed, pins];
      if (next.length > 50) next.shift();
      return next;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
  }, [pins]);

  // Active step cell width
  const stepWidth = ZOOM_STEP_WIDTH[zoomLevel];

  // Active tines list
  const activeTines: TineNote[] = useMemo(() => {
    if (customTines && customTines.length > 0) return customTines;
    const scaleInfo = COMB_SCALES_MAP[combScaleId];
    return scaleInfo ? scaleInfo.tines : ROMANTIC_FLAT_22_TINES;
  }, [customTines, combScaleId]);

  const tinesCount = activeTines.length;

  // Fast pin lookup set
  const pinMap = useMemo(() => {
    const map = new Set<string>();
    pins.forEach((p) => map.add(`${p.step}-${p.tineIndex}`));
    return map;
  }, [pins]);

  // Measure definitions: 16 steps per measure
  const measuresCount = Math.max(1, Math.ceil(totalSteps / 16));
  const measures = useMemo(() => {
    return Array.from({ length: measuresCount }).map((_, mIdx) => {
      const start = mIdx * 16;
      const end = Math.min(totalSteps - 1, start + 15);
      const count = pins.filter((p) => p.step >= start && p.step <= end).length;
      return {
        index: mIdx,
        number: mIdx + 1,
        startStep: start,
        endStep: end,
        pinCount: count,
      };
    });
  }, [measuresCount, totalSteps, pins]);

  // Update cursor position and perform smooth auto-scroll when step changes
  const updateCursorAndScroll = useCallback(
    (step: number) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translateX(${step * stepWidth}px)`;
        cursorRef.current.style.width = `${stepWidth}px`;
      }

      if (containerRef.current && isPlaying) {
        const container = containerRef.current;
        const stepLeft = step * stepWidth;
        const scrollLeft = container.scrollLeft;
        const clientWidth = container.clientWidth;

        // Only scroll if cursor is near or outside visible boundaries
        if (stepLeft < scrollLeft || stepLeft > scrollLeft + clientWidth - stepWidth * 3) {
          if (Math.abs(step - lastScrolledStepRef.current) > 2) {
            lastScrolledStepRef.current = step;
            container.scrollTo({
              left: Math.max(0, stepLeft - clientWidth / 3),
              behavior: 'auto',
            });
          }
        }
      }
    },
    [stepWidth, isPlaying]
  );

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

  // Scroll to a specific step / measure
  const scrollToStep = useCallback(
    (step: number) => {
      setRecordStep(step);
      onSeekStep?.(step);
      if (containerRef.current) {
        const container = containerRef.current;
        const stepLeft = step * stepWidth;
        const clientWidth = container.clientWidth;
        container.scrollTo({
          left: Math.max(0, stepLeft - clientWidth / 4),
          behavior: 'smooth',
        });
      }
    },
    [stepWidth, onSeekStep]
  );

  // UNDO & REDO HANDLERS
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo || !onSetPins) return;
    const nextIdx = historyIndex - 1;
    const targetPins = history[nextIdx];
    if (targetPins) {
      isUndoRedoActionRef.current = true;
      setHistoryIndex(nextIdx);
      onSetPins(targetPins);
    }
  }, [canUndo, historyIndex, history, onSetPins]);

  const handleRedo = useCallback(() => {
    if (!canRedo || !onSetPins) return;
    const nextIdx = historyIndex + 1;
    const targetPins = history[nextIdx];
    if (targetPins) {
      isUndoRedoActionRef.current = true;
      setHistoryIndex(nextIdx);
      onSetPins(targetPins);
    }
  }, [canRedo, historyIndex, history, onSetPins]);

  // Keyboard shortcuts for Undo/Redo & Tool Switching
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

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Quick Tools: D = Draw, E = Erase, A = Audition, R = Step Record
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'd' || e.key === 'D') setActiveTool('draw');
        if (e.key === 'e' || e.key === 'E') setActiveTool('erase');
        if (e.key === 'a' || e.key === 'A') setActiveTool('audition');
        if (e.key === 'r' || e.key === 'R') setActiveTool('step-record');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // DRAG-TO-PAINT & DRAG-TO-ERASE POINTER GESTURES
  const isPointerDownRef = useRef<boolean>(false);
  const dragModeRef = useRef<'add' | 'remove' | 'audition'>('add');
  const visitedCellsRef = useRef<Set<string>>(new Set());

  const handlePointerDownGrid = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-step]') as HTMLElement | null;
    if (!target) return;
    const step = Number(target.dataset.step);
    const tine = Number(target.dataset.tine);
    if (!Number.isFinite(step) || !Number.isFinite(tine)) return;

    isPointerDownRef.current = true;
    visitedCellsRef.current.clear();
    visitedCellsRef.current.add(`${step}-${tine}`);

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (activeTool === 'audition') {
      onPluckTine(tine);
      return;
    }

    if (activeTool === 'erase') {
      dragModeRef.current = 'remove';
      if (pinMap.has(`${step}-${tine}`)) {
        onTogglePin(step, tine);
      }
      return;
    }

    if (activeTool === 'draw') {
      const hasPin = pinMap.has(`${step}-${tine}`);
      dragModeRef.current = hasPin ? 'remove' : 'add';
      onTogglePin(step, tine);
      return;
    }

    if (activeTool === 'step-record') {
      setRecordStep(step);
      onSeekStep?.(step);
      onTogglePin(step, tine);
    }
  };

  const handlePointerMoveGrid = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const target = element?.closest('[data-step]') as HTMLElement | null;
    if (!target) return;

    const step = Number(target.dataset.step);
    const tine = Number(target.dataset.tine);
    if (!Number.isFinite(step) || !Number.isFinite(tine)) return;

    const key = `${step}-${tine}`;
    if (visitedCellsRef.current.has(key)) return;
    visitedCellsRef.current.add(key);

    if (activeTool === 'audition') {
      onPluckTine(tine);
      return;
    }

    const hasPin = pinMap.has(key);
    if (dragModeRef.current === 'add' && !hasPin) {
      onTogglePin(step, tine);
    } else if (dragModeRef.current === 'remove' && hasPin) {
      onTogglePin(step, tine);
    }
  };

  const handlePointerUpGrid = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = false;
    visitedCellsRef.current.clear();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // STEP RECORD MODE: TAPPING A TINE ON THE TOUCH KEYBOARD
  const handleStepRecordTine = useCallback(
    (tineIndex: number) => {
      onPluckTine(tineIndex);

      if (activeTool === 'step-record') {
        const targetStep = recordStep;
        const exists = pinMap.has(`${targetStep}-${tineIndex}`);
        if (!exists) {
          onTogglePin(targetStep, tineIndex);
        }

        // Auto-advance cursor by chosen interval
        const nextStep = (targetStep + stepAdvance) % totalSteps;
        setRecordStep(nextStep);
        onSeekStep?.(nextStep);
        updateCursorAndScroll(nextStep);
      }
    },
    [activeTool, recordStep, pinMap, onTogglePin, stepAdvance, totalSteps, onSeekStep, updateCursorAndScroll, onPluckTine]
  );

  // STEP RECORD STEP ADVANCE ACTIONS
  const handleStepRest = useCallback(() => {
    const nextStep = (recordStep + stepAdvance) % totalSteps;
    setRecordStep(nextStep);
    onSeekStep?.(nextStep);
    updateCursorAndScroll(nextStep);
  }, [recordStep, stepAdvance, totalSteps, onSeekStep, updateCursorAndScroll]);

  const handleStepBack = useCallback(() => {
    const prevStep = ((recordStep - stepAdvance) % totalSteps + totalSteps) % totalSteps;
    setRecordStep(prevStep);
    onSeekStep?.(prevStep);
    updateCursorAndScroll(prevStep);
  }, [recordStep, stepAdvance, totalSteps, onSeekStep, updateCursorAndScroll]);

  const handleClearCurrentStepPins = useCallback(() => {
    if (!onSetPins) return;
    const remaining = pins.filter((p) => p.step !== recordStep);
    onSetPins(remaining);
  }, [pins, recordStep, onSetPins]);

  // PATTERN TRANSFORMATIONS
  const handleTranspose = useCallback(
    (deltaTines: number) => {
      if (!onSetPins) return;
      const transposed: MusicBoxPin[] = [];
      pins.forEach((p) => {
        const newIndex = p.tineIndex + deltaTines;
        if (newIndex >= 0 && newIndex < tinesCount) {
          transposed.push({
            ...p,
            tineIndex: newIndex,
            note: activeTines[newIndex]?.note,
          });
        }
      });
      onSetPins(transposed);
    },
    [pins, tinesCount, activeTines, onSetPins]
  );

  const handleDuplicateCurrentMeasure = useCallback(() => {
    if (!onSetPins) return;
    const currentM = Math.floor(recordStep / 16);
    const mStart = currentM * 16;
    const mEnd = mStart + 15;
    const nextMStart = ((currentM + 1) * 16) % totalSteps;

    const measurePins = pins.filter((p) => p.step >= mStart && p.step <= mEnd);
    if (measurePins.length === 0) return;

    const otherPins = pins.filter((p) => p.step < nextMStart || p.step > nextMStart + 15);
    const clonedPins = measurePins.map((p) => ({
      ...p,
      step: nextMStart + (p.step - mStart),
    }));

    onSetPins([...otherPins, ...clonedPins]);
    scrollToStep(nextMStart);
  }, [pins, recordStep, totalSteps, onSetPins, scrollToStep]);

  const handleClearCurrentMeasure = useCallback(() => {
    if (!onSetPins) return;
    const currentM = Math.floor(recordStep / 16);
    const mStart = currentM * 16;
    const mEnd = mStart + 15;
    const remaining = pins.filter((p) => p.step < mStart || p.step > mEnd);
    onSetPins(remaining);
  }, [pins, recordStep, onSetPins]);

  const handleSaveTitle = () => {
    if (editedTitle.trim() && onUpdateSongMeta) {
      onUpdateSongMeta({ title: editedTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  // Helper for octave colors
  const getOctaveBandColor = (octave: number) => {
    switch (octave) {
      case 4:
        return 'bg-[#f4efe4] border-[#d8caa8] text-[#7d561a]';
      case 5:
        return 'bg-[#f7f3ea] border-[#e2d6c0] text-[#5e4726]';
      case 6:
        return 'bg-[#fbf9f4] border-[#e8dfcf] text-[#433422]';
      case 7:
        return 'bg-[#f4f7fa] border-[#d0dbe6] text-[#2c4766]';
      default:
        return 'bg-[#f8f5ee] border-[#ded3be] text-[#433422]';
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-3 sm:p-5 shadow-[0_6px_30px_rgba(67,52,34,0.08)] text-[#2d2419] space-y-4 select-none touch-manipulation">
      {/* 1. TOP TOOLBAR & SONG METADATA HEADER */}
      <div className="flex flex-col gap-3 pb-3 border-b border-[#e5dcce]">
        {/* Row 1: Song Title, Scale, Step Count, Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Song Title & Scale Indicator */}
          <div className="flex items-center space-x-2 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-[#f0e6d6] border border-[#d8caa8] flex items-center justify-center text-[#8a6b3e] shadow-2xs shrink-0">
              <Music className="w-4 h-4" />
            </div>

            {isEditingTitle ? (
              <div className="flex items-center space-x-1.5">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  autoFocus
                  className="px-2 py-1 text-sm font-serif font-bold rounded-lg border border-[#bfa175] bg-[#fffdfa] outline-none shadow-inner"
                />
                <button
                  onClick={handleSaveTitle}
                  className="p-1.5 rounded-lg bg-[#433422] text-[#fbf8f2] hover:bg-[#2d2419] transition cursor-pointer"
                  title="Save title"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                <h3 className="text-base sm:text-lg font-serif font-bold text-[#433422] tracking-wide hover:text-[#8a6b3e] transition flex items-center gap-1.5">
                  <span>{songTitle || 'Untitled Music Box Score'}</span>
                  <Pencil className="w-3 h-3 text-[#a8957c] opacity-0 group-hover:opacity-100 transition" />
                </h3>
              </div>
            )}

            {/* Comb Scale Selector Badge */}
            {onChangeCombScale && (
              <div className="flex items-center space-x-1 bg-[#f4eee4] border border-[#ded3be] rounded-lg px-2 py-0.5 text-xs">
                <Sliders className="w-3 h-3 text-[#8a6b3e]" />
                <select
                  value={combScaleId}
                  onChange={(e) => onChangeCombScale(e.target.value as CombScaleId)}
                  className="bg-transparent text-xs font-serif text-[#433422] font-semibold focus:outline-none cursor-pointer"
                >
                  {Object.values(COMB_SCALES_MAP).map((scale) => (
                    <option key={scale.id} value={scale.id} className="bg-[#fcfbf8] text-[#2d2419]">
                      {scale.shortLabel} ({scale.tinesCount}T)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Total Steps Badge */}
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#f0e9dc] text-[#6e5838] border border-[#ded3be] font-medium">
              {totalSteps} Steps ({measuresCount} Bars)
            </span>
          </div>

          {/* Right: Primary Play, Undo/Redo & New/Clone Actions */}
          <div className="flex items-center space-x-1.5">
            {/* Quick Play/Pause */}
            {onTogglePlay && (
              <button
                id="editor-play-btn"
                onClick={onTogglePlay}
                title={isPlaying ? 'Pause playback' : 'Play cylinder playback'}
                className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold flex items-center space-x-1.5 border transition-all shadow-xs cursor-pointer ${
                  isPlaying
                    ? 'bg-gradient-to-r from-[#d6be8e] via-[#f0c465] to-[#c99432] text-[#1c1208] border-[#f3e18a] shadow-[0_0_10px_rgba(240,196,101,0.5)]'
                    : 'bg-[#433422] hover:bg-[#2d2419] text-[#fbf8f2] border-[#382a1a]'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current text-[#f0c465]" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>
            )}

            {/* Undo / Redo */}
            <div className="flex items-center space-x-0.5 bg-[#f4eee4] border border-[#ded3be] rounded-xl p-0.5 shadow-2xs">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg hover:bg-[#eae2d3] disabled:opacity-30 text-[#5e4c36] transition cursor-pointer"
                title="Undo edit (Ctrl+Z / Cmd+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg hover:bg-[#eae2d3] disabled:opacity-30 text-[#5e4c36] transition cursor-pointer"
                title="Redo edit (Ctrl+Y / Cmd+Shift+Z)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Duplicate / New Song shortcuts */}
            {onDuplicateSong && (
              <button
                onClick={onDuplicateSong}
                className="p-1.5 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] hover:text-[#2d2419] transition shadow-2xs cursor-pointer"
                title="Duplicate & Remix this song into a new score"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            {onNewBlankSong && (
              <button
                onClick={onNewBlankSong}
                className="p-1.5 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] hover:text-[#2d2419] transition shadow-2xs cursor-pointer"
                title="Create a new blank cylinder"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Tool Palette (Draw, Erase, Audition, Step Record) + Zoom Controls + Transforms */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          {/* Tool Palette */}
          <div className="flex items-center space-x-1 p-1 rounded-xl bg-[#eee7da] border border-[#ded3be] shadow-xs">
            <button
              onClick={() => setActiveTool('draw')}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                activeTool === 'draw'
                  ? 'bg-[#433422] text-[#fbf8f2] shadow-xs'
                  : 'text-[#6f5e49] hover:text-[#2d2419] hover:bg-[#e4dcce]/60'
              }`}
              title="Draw Tool: Tap or drag to punch brass pins (Shortcut: D)"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Draw</span>
            </button>

            <button
              onClick={() => setActiveTool('erase')}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                activeTool === 'erase'
                  ? 'bg-[#9c3826] text-[#fbf8f2] shadow-xs'
                  : 'text-[#6f5e49] hover:text-[#9c3826] hover:bg-[#e4dcce]/60'
              }`}
              title="Eraser Tool: Tap or drag to remove pins (Shortcut: E)"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Erase</span>
            </button>

            <button
              onClick={() => setActiveTool('audition')}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                activeTool === 'audition'
                  ? 'bg-[#b8860b] text-[#fbf8f2] shadow-xs'
                  : 'text-[#6f5e49] hover:text-[#b8860b] hover:bg-[#e4dcce]/60'
              }`}
              title="Audition Tool: Tap keys or grid to hear chime without modifying pins (Shortcut: A)"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Audition</span>
            </button>

            <button
              onClick={() => setActiveTool('step-record')}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif font-bold flex items-center space-x-1.5 transition cursor-pointer ${
                activeTool === 'step-record'
                  ? 'bg-gradient-to-r from-[#d6be8e] via-[#f0c465] to-[#c99432] text-[#1c1208] shadow-xs border border-[#f3e18a]'
                  : 'text-[#7d561a] hover:text-[#433422] hover:bg-[#ebd7ba]/50'
              }`}
              title="Step Record: Tap touch keyboard to stamp pins and auto-advance cursor step (Shortcut: R)"
            >
              <Radio className="w-3.5 h-3.5 text-[#1c1208]" />
              <span>Step Record</span>
            </button>
          </div>

          {/* Touch Zoom Selector (Compact, Normal, Spacious 44px, Wide 60px) */}
          <div className="flex items-center space-x-1.5 bg-[#f4eee4] border border-[#ded3be] rounded-xl p-1 shadow-2xs">
            <span className="text-[10px] uppercase font-mono font-bold text-[#8a765e] px-1 hidden sm:inline">
              Zoom:
            </span>
            {(['compact', 'normal', 'spacious', 'wide'] as GridZoomLevel[]).map((level) => {
              const isSel = zoomLevel === level;
              const labels: Record<GridZoomLevel, string> = {
                compact: 'Compact',
                normal: 'Normal',
                spacious: 'iPad Touch (44px)',
                wide: 'Wide (60px)',
              };
              return (
                <button
                  key={level}
                  onClick={() => setZoomLevel(level)}
                  className={`px-2 py-1 rounded-lg text-xs font-serif transition cursor-pointer ${
                    isSel
                      ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-2xs'
                      : 'text-[#6f5e49] hover:text-[#2d2419]'
                  }`}
                  title={`${labels[level]} view (${ZOOM_STEP_WIDTH[level]}px step width)`}
                >
                  {level === 'spacious' ? 'Touch 44px' : level === 'compact' ? '22px' : level === 'normal' ? '32px' : '60px'}
                </button>
              );
            })}
          </div>

          {/* Pattern Tools Toggle & Clear All */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setShowPatternTools((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-serif font-semibold flex items-center space-x-1 transition shadow-2xs cursor-pointer ${
                showPatternTools
                  ? 'bg-[#e8dfcf] border-[#bfa175] text-[#433422]'
                  : 'bg-[#f4eee4] hover:bg-[#eae2d3] border-[#ded3be] text-[#5e4c36]'
              }`}
              title="Toggle pattern transform tools (Transpose, Shift, Duplicate)"
            >
              <Layers className="w-3.5 h-3.5 text-[#8a6b3e]" />
              <span>Transforms</span>
            </button>

            <button
              onClick={onClearAll}
              className="px-2.5 py-1.5 rounded-xl bg-[#fdf2f0] hover:bg-[#fae4e1] text-[#9c3826] border border-[#f2c6bf] text-xs font-serif flex items-center space-x-1 transition shadow-2xs cursor-pointer"
              title="Clear all pins on the cylinder"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Optional Pattern & Transform Tool Ribbon */}
        {showPatternTools && (
          <div className="p-2.5 rounded-xl bg-[#f8f5ee] border border-[#ded3be] flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
              <span className="text-[11px] font-serif font-bold text-[#8a6b3e] uppercase mr-1">
                Transpose:
              </span>
              <button
                onClick={() => handleTranspose(1)}
                className="px-2 py-1 rounded-lg bg-[#f0e9dc] hover:bg-[#e4dcce] text-xs font-serif border border-[#d8caa8] flex items-center gap-1 transition cursor-pointer"
                title="Shift all notes up by 1 tine (+1 pitch)"
              >
                <ArrowUp className="w-3 h-3 text-[#8a6b3e]" />
                <span>+1 Pitch</span>
              </button>
              <button
                onClick={() => handleTranspose(-1)}
                className="px-2 py-1 rounded-lg bg-[#f0e9dc] hover:bg-[#e4dcce] text-xs font-serif border border-[#d8caa8] flex items-center gap-1 transition cursor-pointer"
                title="Shift all notes down by 1 tine (-1 pitch)"
              >
                <ArrowDown className="w-3 h-3 text-[#8a6b3e]" />
                <span>-1 Pitch</span>
              </button>

              <span className="text-[11px] font-serif font-bold text-[#8a6b3e] uppercase ml-2 mr-1">
                Shift Timing:
              </span>
              <button
                onClick={() => onShiftPins(-1)}
                className="p-1 rounded-lg bg-[#f0e9dc] hover:bg-[#e4dcce] text-xs border border-[#d8caa8] transition cursor-pointer"
                title="Shift all pins left by 1 step (-1)"
              >
                <ChevronsLeft className="w-3.5 h-3.5 text-[#5e4c36]" />
              </button>
              <button
                onClick={() => onShiftPins(1)}
                className="p-1 rounded-lg bg-[#f0e9dc] hover:bg-[#e4dcce] text-xs border border-[#d8caa8] transition cursor-pointer"
                title="Shift all pins right by 1 step (+1)"
              >
                <ChevronsRight className="w-3.5 h-3.5 text-[#5e4c36]" />
              </button>
              <button
                onClick={() => onShiftPins(4)}
                className="px-2 py-1 rounded-lg bg-[#f0e9dc] hover:bg-[#e4dcce] text-xs font-serif border border-[#d8caa8] transition cursor-pointer"
                title="Shift all pins right by 4 steps (+1 Beat)"
              >
                <span>+1 Beat</span>
              </button>
            </div>

            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
              <button
                onClick={handleDuplicateCurrentMeasure}
                className="px-2.5 py-1 rounded-lg bg-[#f0e9dc] hover:bg-[#e4dcce] text-xs font-serif border border-[#d8caa8] flex items-center gap-1 transition cursor-pointer"
                title={`Clone pins from Bar ${Math.floor(recordStep / 16) + 1} into Bar ${Math.floor(recordStep / 16) + 2}`}
              >
                <Copy className="w-3 h-3 text-[#8a6b3e]" />
                <span>Clone Bar {Math.floor(recordStep / 16) + 1} → Next</span>
              </button>

              <button
                onClick={handleClearCurrentMeasure}
                className="px-2.5 py-1 rounded-lg bg-[#fdf2f0] hover:bg-[#fae4e1] text-xs font-serif text-[#9c3826] border border-[#f2c6bf] transition cursor-pointer"
                title={`Clear pins in Bar ${Math.floor(recordStep / 16) + 1}`}
              >
                <span>Clear Bar {Math.floor(recordStep / 16) + 1}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. MEASURE NAVIGATION RIBBON (MINI-MAP BAR) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-[#8a765e] px-1">
          <span className="font-serif uppercase tracking-wider font-semibold">
            Measure Navigator & Jump Ribbon:
          </span>
          <span className="font-mono">
            Cursor: Step {recordStep + 1} (Bar {Math.floor(recordStep / 16) + 1}, Beat {Math.floor((recordStep % 16) / 4) + 1})
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 p-1 rounded-xl bg-[#eee7da] border border-[#ded3be]">
          {measures.map((m) => {
            const isCursorInMeasure = recordStep >= m.startStep && recordStep <= m.endStep;
            const isPlayInMeasure = currentStep >= m.startStep && currentStep <= m.endStep;

            return (
              <button
                key={m.index}
                onClick={() => scrollToStep(m.startStep)}
                className={`py-1.5 px-2 rounded-lg text-left transition flex flex-col justify-between cursor-pointer border ${
                  isCursorInMeasure
                    ? 'bg-[#433422] text-[#fbf8f2] border-[#2b1f13] shadow-xs'
                    : isPlayInMeasure
                    ? 'bg-[#e4d7be] text-[#3d2f1f] border-[#bfa175]'
                    : 'bg-[#fcfbf8] text-[#5e4c36] border-[#ded3be]/60 hover:bg-[#f3ece0]'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono font-bold leading-tight">
                  <span>Bar {m.number}</span>
                  {m.pinCount > 0 && (
                    <span
                      className={`px-1 rounded-full text-[9px] ${
                        isCursorInMeasure ? 'bg-[#f0c465] text-[#1c1208]' : 'bg-[#e8dfcf] text-[#7a5c2e]'
                      }`}
                    >
                      {m.pinCount}
                    </span>
                  )}
                </div>
                <span className={`text-[9px] font-mono leading-none mt-1 ${isCursorInMeasure ? 'text-[#d6be8e]' : 'text-[#8a765e]'}`}>
                  {m.startStep + 1}–{m.endStep + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. STEP RECORD CONTROL DOCK (WHEN STEP RECORD TOOL IS ACTIVE) */}
      {activeTool === 'step-record' && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-[#f7f0e3] via-[#faefe0] to-[#f4ebd9] border-2 border-[#d6be8e] flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center space-x-2.5">
            <span className="w-3 h-3 rounded-full bg-[#e64a19] animate-ping" />
            <div>
              <span className="text-xs font-serif font-bold text-[#433422] block">
                Step-Record Mode Active:
              </span>
              <span className="text-[11px] text-[#7a5c2e] font-serif-sub italic">
                Tap notes on the touch keyboard below to place pins and auto-advance.
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            {/* Step Advance Selector */}
            <div className="flex items-center space-x-1 bg-[#fffdfa] border border-[#d6be8e] rounded-xl p-1 text-xs">
              <span className="text-[10px] font-mono font-bold text-[#8a765e] px-1.5">Advance:</span>
              {[
                { val: 1, label: '1 Step (1/16)' },
                { val: 2, label: '2 Steps (1/8)' },
                { val: 4, label: '4 Steps (1/4)' },
              ].map((item) => (
                <button
                  key={item.val}
                  onClick={() => setStepAdvance(item.val as StepAdvanceInterval)}
                  className={`px-2 py-0.5 rounded-lg font-mono text-[11px] transition cursor-pointer ${
                    stepAdvance === item.val
                      ? 'bg-[#433422] text-[#fbf8f2] font-bold shadow-2xs'
                      : 'text-[#6f5e49] hover:text-[#2d2419]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Step Advance Buttons */}
            <button
              onClick={handleStepBack}
              className="px-2.5 py-1.5 rounded-xl bg-[#fffdfa] hover:bg-[#eee5d3] border border-[#d6be8e] text-xs font-serif font-semibold text-[#5e4c36] flex items-center gap-1 transition cursor-pointer"
              title="Step back (-advance)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              onClick={handleStepRest}
              className="px-3 py-1.5 rounded-xl bg-[#433422] hover:bg-[#2d2419] text-[#fbf8f2] text-xs font-serif font-bold flex items-center gap-1 transition shadow-xs cursor-pointer"
              title="Rest / Skip step (+advance)"
            >
              <span>Rest / Skip</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleClearCurrentStepPins}
              className="px-2.5 py-1.5 rounded-xl bg-[#fdf2f0] hover:bg-[#fae4e1] text-[#9c3826] border border-[#f2c6bf] text-xs font-serif transition cursor-pointer"
              title="Clear all pins on current step"
            >
              <span>Clear Step</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. MAIN PIANO ROLL / PIN MATRIX GRID */}
      <div className="relative flex rounded-2xl border-2 border-[#ded3be] bg-[#f8f5ee] overflow-hidden shadow-inner max-h-[500px]">
        {/* Left Tine Labels Column (Fixed / Sticky) */}
        <div className="w-24 sm:w-28 shrink-0 bg-[#f2ecde] border-r-2 border-[#ded3be] select-none z-10 overflow-y-auto custom-scrollbar">
          <div className="h-8 border-b-2 border-[#ded3be] px-2 flex items-center justify-between text-[10px] uppercase font-mono text-[#8a765e] font-bold sticky top-0 bg-[#f2ecde] z-20 shadow-2xs">
            <span>Note</span>
            <span>Tine #</span>
          </div>

          {/* Render in reverse so High pitches are at top, Bass at bottom */}
          {[...activeTines].reverse().map((tine) => {
            const isFlatAccidental = tine.isFlat || tine.note.includes('b') || tine.note.includes('#');
            const octaveColorClass = getOctaveBandColor(tine.octave);

            return (
              <div
                key={tine.index}
                onClick={() => onPluckTine(tine.index)}
                onMouseEnter={() => setHoveredTine(tine.index)}
                onMouseLeave={() => setHoveredTine(null)}
                title={`Listen: Note #${tine.index + 1} (${tine.note}, ${tine.frequency.toFixed(1)}Hz)${tine.flatEnharmonic ? ` • ${tine.flatEnharmonic}` : ''}`}
                className={`h-7 sm:h-8 px-2 border-b border-[#e2d8c6] flex items-center justify-between text-xs font-mono cursor-pointer transition-colors ${
                  isFlatAccidental
                    ? 'bg-[#faf3e6] text-[#7d561a] hover:bg-[#ebd7b2]'
                    : `${octaveColorClass} hover:bg-[#e8dfcf] hover:text-[#8a6b3e]`
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

        {/* Scrollable Matrix Area */}
        <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div
            className="relative select-none"
            style={{ width: `${totalSteps * stepWidth}px` }}
            onPointerDown={handlePointerDownGrid}
            onPointerMove={handlePointerMoveGrid}
            onPointerUp={handlePointerUpGrid}
          >
            {/* Step Numbers Header Bar (Sticky Top) */}
            <div className="h-8 border-b-2 border-[#ded3be] flex bg-[#eae2d3] select-none sticky top-0 z-20">
              {Array.from({ length: totalSteps }).map((_, step) => {
                const isMeasureStart = step % 16 === 0;
                const isBeatStart = step % 4 === 0;
                const isSelected = recordStep === step;

                return (
                  <div
                    key={step}
                    onClick={() => scrollToStep(step)}
                    style={{ width: `${stepWidth}px` }}
                    className={`shrink-0 flex items-center justify-center text-[10px] font-mono border-r transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#433422] text-[#fbf8f2] font-bold'
                        : isMeasureStart
                        ? 'border-[#bfa175] text-[#7a5c2e] font-bold bg-[#ded2be]'
                        : isBeatStart
                        ? 'border-[#d0c4af] text-[#8a765e] font-semibold bg-[#e5dcce]'
                        : 'border-[#ded3be]/60 text-[#9e8a72]'
                    }`}
                  >
                    {isMeasureStart ? `M${Math.floor(step / 16) + 1}` : step + 1}
                  </div>
                );
              })}
            </div>

            {/* Active Playhead Cursor Vertical Strip */}
            <div
              ref={cursorRef}
              className="absolute top-0 bottom-0 left-0 bg-[#bfa175]/30 border-x-2 border-[#bfa175] pointer-events-none z-10 will-change-transform"
              style={{
                transform: `translateX(${currentStep * stepWidth}px)`,
                width: `${stepWidth}px`,
              }}
            />

            {/* Tine Rows */}
            {[...activeTines].reverse().map((tine) => {
              const isFlatAccidental = tine.isFlat || tine.note.includes('b') || tine.note.includes('#');
              const isRowHovered = hoveredTine === tine.index;

              return (
                <div
                  key={tine.index}
                  className={`h-7 sm:h-8 flex border-b border-[#ded3be]/60 relative transition-colors ${
                    isRowHovered ? 'bg-[#f0e6d6]/60' : isFlatAccidental ? 'bg-[#faf6ee]' : ''
                  }`}
                >
                  {Array.from({ length: totalSteps }).map((_, step) => {
                    const hasPin = pinMap.has(`${step}-${tine.index}`);
                    const isMeasureStart = step % 16 === 0;
                    const isBeatStart = step % 4 === 0;

                    return (
                      <div
                        key={step}
                        id={`pin-cell-${step}-${tine.index}`}
                        data-step={step}
                        data-tine={tine.index}
                        style={{ width: `${stepWidth}px` }}
                        className={`shrink-0 h-full border-r cursor-pointer flex items-center justify-center transition-all group relative ${
                          isMeasureStart
                            ? 'border-r-[#bfa175]/80 bg-[#ede5d5]/40'
                            : isBeatStart
                            ? 'border-r-[#ded3be] bg-[#f5ede0]/20'
                            : 'border-r-[#ded3be]/40 bg-transparent'
                        } hover:bg-[#e8decb]/90`}
                      >
                        {/* Brass Pin Circle */}
                        {hasPin && (
                          <div
                            className={`rounded-full transition-transform group-hover:scale-110 shadow-sm ${
                              zoomLevel === 'compact'
                                ? 'w-3.5 h-3.5'
                                : zoomLevel === 'normal'
                                ? 'w-4.5 h-4.5'
                                : 'w-5.5 h-5.5'
                            } ${
                              isFlatAccidental
                                ? 'bg-gradient-to-tr from-[#9e5f12] via-[#f2ab35] to-[#ffe082] shadow-[#433422]/40 border-2 border-[#fff2b2]'
                                : 'bg-gradient-to-tr from-[#946614] via-[#eed882] to-[#946614] shadow-[#433422]/30 border-2 border-[#ffe787]'
                            }`}
                          />
                        )}

                        {/* Empty Slot Subtle Center Point */}
                        {!hasPin && (
                          <div
                            className={`rounded-full bg-[#ded3be] group-hover:bg-[#b8a68d] transition-colors ${
                              zoomLevel === 'spacious' || zoomLevel === 'wide' ? 'w-2 h-2' : 'w-1.5 h-1.5'
                            }`}
                          />
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

      {/* 5. INTEGRATED TOUCH INPUT KEYBOARD DOCK (DIRECTLY BELOW MATRIX FOR INSTANT COMPOSING) */}
      <div className="pt-2 border-t border-[#e5dcce] space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
            <span className="font-serif text-xs font-bold text-[#433422] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#b8860b]" />
              <span>Interactive Step-Input Keyboard</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#eee5d5] text-[#7a5c2e] font-mono">
              {tinesCount} Notes ({activeTines[0]?.note} – {activeTines[tinesCount - 1]?.note})
            </span>
          </div>

          <span className="text-[11px] font-serif-sub text-[#8a765e] italic hidden sm:inline">
            Tap to pluck • In Step-Record mode, stamps pin & advances cursor
          </span>
        </div>

        {/* Touch Keys Strip */}
        <div className="w-full flex items-end gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-xl bg-[#17110a] border border-[#523c24] shadow-inner overflow-x-auto">
          {activeTines.map((tine, idx) => {
            const isAccidental = Boolean(tine.isFlat || tine.note.includes('b') || tine.note.includes('#'));
            const isHovered = hoveredTine === idx;
            const shortcut = KEYBOARD_SHORTCUTS[idx]?.toUpperCase();

            return (
              <button
                key={tine.index}
                onClick={() => handleStepRecordTine(tine.index)}
                onMouseEnter={() => setHoveredTine(idx)}
                onMouseLeave={() => setHoveredTine(null)}
                className={`group relative flex-1 min-w-[28px] sm:min-w-0 flex flex-col items-center justify-between px-0.5 sm:px-1 py-1 rounded sm:rounded-lg border transition-all select-none cursor-pointer ${
                  isAccidental
                    ? 'h-20 sm:h-24 -translate-y-1.5 z-20 shadow-[0_4px_10px_rgba(0,0,0,0.6)] bg-gradient-to-b from-[#2a1d12] via-[#20150b] to-[#140c06] text-[#dfc39e] border-[#7d5622]'
                    : 'h-17 sm:h-21 translate-y-0 z-10 bg-gradient-to-b from-[#3a2818] via-[#2c1d11] to-[#1f1309] text-[#faebd4] border-[#553b22]'
                } ${
                  isHovered
                    ? isAccidental
                      ? 'border-[#ffd280] bg-[#3a2614] scale-105 z-30'
                      : 'border-[#dfc282] bg-[#4a341e] scale-105 z-30'
                    : ''
                }`}
                title={`Note #${idx + 1}: ${tine.note} (${tine.frequency.toFixed(1)}Hz)${shortcut ? ` • [${shortcut}]` : ''}`}
              >
                {/* Note Number */}
                <span className="text-[8px] sm:text-[9px] font-mono font-bold leading-none text-[#caa87c]">
                  #{idx + 1}
                </span>

                {/* Musical Note Name */}
                <div className="flex flex-col items-center min-w-0">
                  <span className="text-[9px] sm:text-xs font-serif font-bold leading-tight">
                    {tine.note}
                  </span>
                  {isAccidental && (
                    <span className="text-[8px] font-sans font-bold leading-none text-[#f0c465]">
                      ♭
                    </span>
                  )}
                </div>

                {/* Keyboard Shortcut */}
                {shortcut && (
                  <span className="px-1 rounded text-[7px] sm:text-[8px] font-mono font-bold uppercase bg-[#120a04] text-[#a68d72] border border-[#523c24]/80">
                    {shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. GRID LEGEND & SUMMARY FOOTER */}
      <div className="flex flex-wrap items-center justify-between text-xs text-[#75644e] px-1 gap-2 pt-1 border-t border-[#ece4d6]">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#d6be8e] border border-[#a68656] inline-block" />
            <span className="font-serif">Natural Pin</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f2ab35] border border-[#9e5f12] inline-block" />
            <span className="font-serif font-semibold text-[#7d561a]">Flat Pin (♭)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ded3be] inline-block" />
            <span className="font-serif">Empty Slot</span>
          </span>
        </div>

        <span className="text-[#8a765e] font-mono font-medium">
          Total: {pins.length} active pins • {totalSteps} steps ({measuresCount} measures)
        </span>
      </div>
    </div>
  );
});

