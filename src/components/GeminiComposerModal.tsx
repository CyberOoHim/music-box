import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MusicBoxSong, CombScaleId, COMB_SCALES_MAP, ROMANTIC_FLAT_22_TINES, formatModelDisplayName } from '../types';
import {
  Sparkles,
  X,
  Wand2,
  Music,
  Loader2,
  Play,
  Square,
  Check,
  RefreshCw,
  PlusCircle,
  Volume2,
  Pencil,
  Cpu,
  Layers,
  Lock,
  Key,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import { generateProceduralMusic } from '../utils/proceduralComposer';
import { musicBoxAudio } from '../audio/musicBoxAudio';

interface GeminiComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSong: (song: MusicBoxSong) => void;
  hasAiComposer?: boolean;
  requiresPasscode?: boolean;
  initialCombScaleId?: CombScaleId;
}

const INSPIRATION_PROMPTS = [
  {
    title: 'Starlight Lullaby',
    style: 'lullaby',
    combScaleId: 'romantic-flat' as CombScaleId,
    prompt: 'A gentle, peaceful lullaby for a starry night with sparkling high treble chimes and warm low root notes.',
  },
  {
    title: 'Ghibli Nostalgic Wind',
    style: 'nostalgic',
    combScaleId: 'romantic-flat' as CombScaleId,
    prompt: 'A bittersweet, nostalgic waltz in the spirit of Studio Ghibli music box pieces like Castle in the Sky and Spirited Away.',
  },
  {
    title: 'Winter Hearth Dream',
    style: 'relaxing',
    combScaleId: 'flat-major-18' as CombScaleId,
    prompt: 'A calming music box melody depicting snow softly falling outside while resting beside a cozy fireplace.',
  },
  {
    title: 'Parisian Antique Carousel',
    style: 'waltz',
    combScaleId: 'sankyo-18' as CombScaleId,
    prompt: 'A charming 3/4 vintage carousel waltz from a 19th century clockwork music box in Montmartre.',
  },
  {
    title: 'Forest Sanctuary',
    style: 'nature',
    combScaleId: 'chromatic-30' as CombScaleId,
    prompt: 'A serene melody inspired by gentle raindrops dripping from mossy oak branches in a sunlit forest.',
  },
  {
    title: 'Celtic Fairytale',
    style: 'celtic',
    combScaleId: 'sankyo-18' as CombScaleId,
    prompt: 'An enchanting ancient Celtic folk melody arranged for ringing steel chime pins.',
  },
];

const STYLE_PRESETS = [
  { id: 'nostalgic', label: 'Nostalgic', desc: 'Ghibli & Japanese Folk' },
  { id: 'lullaby', label: 'Lullaby', desc: 'Gentle & Dreamy' },
  { id: 'waltz', label: 'Waltz', desc: '3/4 Clockwork Dance' },
  { id: 'classical', label: 'Classical', desc: 'Baroque & Romantic' },
  { id: 'celtic', label: 'Celtic Folk', desc: 'Enchanted Airs' },
  { id: 'relaxing', label: 'Relaxing', desc: 'Tranquil Zen' },
  { id: 'custom', label: '✨ Custom Style...', desc: 'Type any custom genre or mood' },
];

const COMB_CHOICES: { id: CombScaleId; label: string; tines: number; range: string; desc: string }[] = [
  { id: 'sankyo-18', label: 'Sankyo 18N', tines: 18, range: 'C5–D7', desc: 'Standard C-Major with F# overtones' },
  { id: 'romantic-flat', label: 'Romantic Flat 22N', tines: 22, range: 'C5–Bb6', desc: 'Eb5, Eb6, Ab, Bb, Gb flat accidentals' },
  { id: 'chromatic-30', label: 'Chromatic 30N', tines: 30, range: 'C5–F7', desc: 'Full 12-semitone spectrum (C5-F7)' },
  { id: 'flat-major-18', label: 'Flat Major 18N', tines: 18, range: 'Bb4–Eb7', desc: 'Eb / Bb / Ab Major rich lullabies' },
];

export type ComposerEngineId = 'auto' | 'gemini-3.7-flash' | 'gemini-3.1-flash-lite' | 'procedural';

const ENGINE_CHOICES: { id: ComposerEngineId; label: string; desc: string }[] = [
  { id: 'auto', label: 'Auto (Gemini 3.7 Flash)', desc: 'Best AI quality with fast fallback' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', desc: 'Complex harmonies & melodic reasoning' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', desc: 'Fast & lightweight AI arrangement' },
  { id: 'procedural', label: 'Procedural Engine (Offline)', desc: 'Instant algorithmic physical sequencer' },
];

export const GeminiComposerModal: React.FC<GeminiComposerModalProps> = ({
  isOpen,
  onClose,
  onLoadSong,
  hasAiComposer = false,
  requiresPasscode = false,
  initialCombScaleId = 'romantic-flat',
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedEngine, setSelectedEngine] = useState<ComposerEngineId>('auto');
  const [selectedStylePreset, setSelectedStylePreset] = useState('nostalgic');
  const [customStyleText, setCustomStyleText] = useState('');
  const [totalSteps, setTotalSteps] = useState<number>(64);
  const [selectedCombScale, setSelectedCombScale] = useState<CombScaleId>(initialCombScaleId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedSong, setGeneratedSong] = useState<MusicBoxSong | null>(null);

  // Local storage passcode authentication state
  const [passcode, setPasscode] = useState<string>(() => {
    try {
      return localStorage.getItem('musicbox_ai_composer_passcode') || '';
    } catch {
      return '';
    }
  });
  const [showPasscode, setShowPasscode] = useState(false);

  const handlePasscodeChange = (newPasscode: string) => {
    setPasscode(newPasscode);
    try {
      if (newPasscode.trim()) {
        localStorage.setItem('musicbox_ai_composer_passcode', newPasscode.trim());
      } else {
        localStorage.removeItem('musicbox_ai_composer_passcode');
      }
    } catch (e) {
      console.warn('Could not save passcode to localStorage', e);
    }
  };

  const handleClearPasscode = () => {
    setPasscode('');
    try {
      localStorage.removeItem('musicbox_ai_composer_passcode');
    } catch (e) {
      console.warn('Could not clear passcode from localStorage', e);
    }
  };

  // In-modal preview playback state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const previewTimerRef = useRef<number | null>(null);

  // Sync initial comb scale when modal opens
  useEffect(() => {
    if (isOpen && initialCombScaleId) {
      setSelectedCombScale(initialCombScaleId);
    }
  }, [isOpen, initialCombScaleId]);

  const stopAudioPreview = useCallback(() => {
    if (previewTimerRef.current !== null) {
      clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setIsPreviewPlaying(false);
    setPreviewStep(0);
  }, []);

  // Stop audio preview when isOpen becomes false
  useEffect(() => {
    if (!isOpen) {
      stopAudioPreview();
    }
  }, [isOpen, stopAudioPreview]);

  // Escape key handler to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopAudioPreview();
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, stopAudioPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      stopAudioPreview();
    };
  }, [stopAudioPreview]);

  if (!isOpen || !hasAiComposer) return null;

  const handleClose = () => {
    stopAudioPreview();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  };

  // Compute effective musical style string
  const getEffectiveStyle = (styleOverride?: string) => {
    if (styleOverride) return styleOverride;
    if (selectedStylePreset === 'custom') {
      return customStyleText.trim() || 'melodic';
    }
    return selectedStylePreset;
  };

  // Generate or Regenerate music
  const handleGenerate = async (
    customPrompt?: string,
    customStyle?: string,
    combOverride?: CombScaleId,
    engineOverride?: ComposerEngineId
  ) => {
    const textToUse = customPrompt !== undefined ? customPrompt : prompt;
    const styleToUse = getEffectiveStyle(customStyle);
    const combToUse = combOverride || selectedCombScale;
    const engineToUse = engineOverride || selectedEngine;

    if (!textToUse.trim()) {
      setError('Please enter a melody idea or select an inspiration theme.');
      return;
    }

    // Passcode validation check before invoking LLM API
    if (engineToUse !== 'procedural' && requiresPasscode && !passcode.trim()) {
      setError('AI Composer passcode is required to use Gemini models. Please enter the passcode below.');
      return;
    }

    // Stop active audio preview before generating
    stopAudioPreview();

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    // If procedural engine is explicitly selected, generate algorithmically on client immediately
    if (engineToUse === 'procedural') {
      try {
        const data = generateProceduralMusic(textToUse, styleToUse, totalSteps, combToUse);
        const newSong: MusicBoxSong = {
          id: `procedural-${Date.now()}`,
          title: data.title || 'Whispering Music Box',
          category: 'ai',
          description: data.composerNote || `${data.mood} melody created for your music box.`,
          tempoBpm: data.tempoBpm || 88,
          totalSteps: data.totalSteps || totalSteps,
          combScaleId: data.combScaleId || combToUse,
          pins: data.pins || [],
          createdAt: Date.now(),
          isAiGenerated: true,
          modelUsed: 'procedural-musicbox-engine',
        };
        setGeneratedSong(newSong);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const response = await fetch('/api/gemini/compose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Composer-Passcode': passcode.trim(),
        },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: textToUse,
          style: styleToUse,
          totalSteps: totalSteps,
          combScaleId: combToUse,
          model: engineToUse,
          passcode: passcode.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newSong: MusicBoxSong = {
          id: `gemini-${Date.now()}`,
          title: data.title || 'Gemini Music Box Melody',
          category: 'ai',
          description: data.composerNote || `${data.mood} melody composed with AI.`,
          tempoBpm: data.tempoBpm || 88,
          totalSteps: data.totalSteps || totalSteps,
          combScaleId: data.combScaleId || combToUse,
          pins: data.pins || [],
          createdAt: Date.now(),
          isAiGenerated: true,
          modelUsed: data.modelUsed || (engineToUse === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.7-flash'),
        };
        setGeneratedSong(newSong);
        return;
      }

      if (response.status === 401 || response.status === 403) {
        const errJson = await response.json().catch(() => ({ error: 'Authentication failed: Invalid or missing passcode.' }));
        setError(errJson.error || 'Authentication failed: Invalid passcode. Please check your passcode.');
        return;
      }

      if (response.status === 429) {
        const errJson = await response.json().catch(() => ({ error: 'Rate limit exceeded.' }));
        setError(errJson.error || 'Too many requests. Please wait a moment before trying again.');
        return;
      }

      throw new Error('API unavailable, falling back to algorithmic composer');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      // Graceful algorithmic fallback (e.g. offline or network drop)
      const data = generateProceduralMusic(textToUse, styleToUse, totalSteps, combToUse);
      const newSong: MusicBoxSong = {
        id: `procedural-${Date.now()}`,
        title: data.title || 'Whispering Music Box',
        category: 'ai',
        description: data.composerNote || `${data.mood} melody created for your music box.`,
        tempoBpm: data.tempoBpm || 88,
        totalSteps: data.totalSteps || totalSteps,
        combScaleId: data.combScaleId || combToUse,
        pins: data.pins || [],
        createdAt: Date.now(),
        isAiGenerated: true,
        modelUsed: data.modelUsed || 'procedural-musicbox-engine',
      };
      setGeneratedSong(newSong);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle in-modal audio preview of the generated melody
  const handleTogglePreview = async () => {
    if (!generatedSong) return;

    if (isPreviewPlaying) {
      stopAudioPreview();
      return;
    }

    await musicBoxAudio.resumeIfNeeded();
    setIsPreviewPlaying(true);

    const song = generatedSong;
    const activeScale = COMB_SCALES_MAP[song.combScaleId || selectedCombScale];
    const tinesList = activeScale ? activeScale.tines : ROMANTIC_FLAT_22_TINES;
    const tempo = song.tempoBpm || 88;
    const stepIntervalMs = 60000 / tempo / 4;

    let curStep = 0;
    setPreviewStep(0);

    const playStepPins = (step: number) => {
      const pins = song.pins.filter((p) => p.step === step);
      pins.forEach((pin) => {
        if (pin.note) {
          musicBoxAudio.playNote(pin.note, 1.0);
        } else {
          musicBoxAudio.playTine(pin.tineIndex, 1.0, undefined, tinesList);
        }
      });
    };

    playStepPins(0);

    previewTimerRef.current = window.setInterval(() => {
      curStep = (curStep + 1) % song.totalSteps;
      setPreviewStep(curStep);
      playStepPins(curStep);
    }, stepIntervalMs);
  };

  // Reset all fields to start a brand new generation with fresh inputs
  const handleNewComposition = () => {
    stopAudioPreview();
    setGeneratedSong(null);
    setError(null);
    setPrompt('');
    setCustomStyleText('');
    setSelectedStylePreset('nostalgic');
  };

  // Clear prompt text only
  const handleClearPrompt = () => {
    setPrompt('');
  };

  // Load song into the main music box cylinder
  const handleApplySong = () => {
    if (generatedSong) {
      stopAudioPreview();
      onLoadSong(generatedSong);
      onClose();
    }
  };

  // Render badge for the exact model used
  const renderModelBadge = (modelUsed?: string) => {
    if (!modelUsed) return null;

    if (modelUsed === 'gemini-3.7-flash') {
      return (
        <span
          className="text-[11px] font-serif font-bold px-2 py-0.5 rounded-md bg-[#dfcd9f] text-[#342718] border border-[#bfa175] flex items-center gap-1 shadow-2xs"
          title="Generated with Gemini 3.7 Flash Model"
        >
          <Sparkles className="w-3 h-3 text-[#8a6b3e] fill-[#8a6b3e]" />
          Gemini 3.7 Flash
        </span>
      );
    }

    if (modelUsed === 'gemini-3.1-flash-lite') {
      return (
        <span
          className="text-[11px] font-serif font-bold px-2 py-0.5 rounded-md bg-[#e8decf] text-[#4f3d28] border border-[#c9b99e] flex items-center gap-1 shadow-2xs"
          title="Generated with Gemini 3.1 Flash-Lite Model"
        >
          <Sparkles className="w-3 h-3 text-[#8a6b3e]" />
          Gemini 3.1 Flash Lite
        </span>
      );
    }

    if (modelUsed.includes('procedural')) {
      return (
        <span
          className="text-[11px] font-serif font-bold px-2 py-0.5 rounded-md bg-[#eedcc5] text-[#7a4f15] border border-[#dfc29f] flex items-center gap-1 shadow-2xs"
          title="Generated via local procedural physical sequencer (algorithmic fallback)"
        >
          <Cpu className="w-3 h-3 text-[#7a4f15]" />
          Procedural Engine (Offline Fallback)
        </span>
      );
    }

    return (
      <span className="text-[11px] font-serif font-bold px-2 py-0.5 rounded-md bg-[#eee5d5] text-[#5e4c36] border border-[#d9cdbe] flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-[#8a6b3e]" />
        {formatModelDisplayName(modelUsed, true)}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2d2419]/65 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#fdfcf9] border-2 border-[#bfa175] p-5 sm:p-7 shadow-[0_20px_50px_rgba(45,36,25,0.35)] text-[#2d2419] overflow-hidden max-h-[92vh] flex flex-col">
        {/* Ambient background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#bfa175]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e5dcce]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f0e6d6] border border-[#d8caa8] flex items-center justify-center text-[#8a6b3e] shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-[#433422]">
                Gemini AI Music Box Composer
              </h2>
              <p className="text-xs text-[#75644e] font-serif-sub italic">
                Compose custom mechanical cylinder arrangements arranged for tuned steel comb scales.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#8a765e] hover:text-[#2d2419] hover:bg-[#f0e6d6] transition cursor-pointer"
            title="Close composer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 custom-scrollbar pr-1">
          {/* Quick Inspiration Themes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-serif uppercase tracking-wider text-[#8a6b3e] font-bold block">
                Quick Inspiration Themes
              </label>
              <span className="text-[11px] text-[#8a765e] font-serif-sub italic">
                Click any theme to load & compose instantly
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {INSPIRATION_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    // Update form state for visual feedback
                    setPrompt(item.prompt);
                    setSelectedStylePreset(item.style);
                    setSelectedCombScale(item.combScaleId);
                    setCustomStyleText('');
                    // Dispatch immediately with explicit parameter overrides to avoid waiting for async React state batching
                    handleGenerate(item.prompt, item.style, item.combScaleId, selectedEngine);
                  }}
                  className="p-2.5 rounded-xl bg-[#f8f5ee] hover:bg-[#f3ece0] border border-[#ded3be] hover:border-[#bfa175] text-left transition group shadow-2xs cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-serif font-bold text-[#433422] group-hover:text-[#8a6b3e]">
                      {item.title}
                    </span>
                    <span className="text-[10px] uppercase font-serif px-1.5 py-0.5 rounded bg-[#ebd7ba] text-[#7a4f15] border border-[#d6be8e] font-semibold">
                      {item.style}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#75644e] font-serif-sub mt-1 line-clamp-2 italic">
                    {item.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-serif uppercase tracking-wider text-[#8a6b3e] font-bold block">
                Describe Your Music Box Melody Idea
              </label>
              {prompt.trim().length > 0 && (
                <button
                  onClick={handleClearPrompt}
                  className="text-[11px] font-serif text-[#8a765e] hover:text-[#9c3826] underline underline-offset-2 transition cursor-pointer"
                >
                  Clear prompt
                </button>
              )}
            </div>
            <textarea
              id="gemini-prompt-input"
              rows={3}
              maxLength={500}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A delicate music box lullaby for a sleeping child, with soft descending chords and celestial high bell notes..."
              className="w-full rounded-xl bg-[#f8f5ee] border border-[#ded3be] focus:border-[#bfa175] focus:ring-1 focus:ring-[#bfa175] p-3 text-sm text-[#2d2419] placeholder-[#a4937d] outline-none transition shadow-2xs"
            />
            <div className="flex justify-end mt-1">
              <span className="text-[10px] font-mono text-[#8a765e]">
                {prompt.length}/500 chars
              </span>
            </div>
          </div>

          {/* AI Composer Passcode Authentication (Stored in LocalStorage) */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-[#f7f2e8] border border-[#ded3be] space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <label
                htmlFor="composer-passcode-input"
                className="text-xs font-serif font-bold text-[#433422] flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-[#8a6b3e]" />
                <span>AI Composer Passcode</span>
                {requiresPasscode ? (
                  <span
                    className={`text-[10px] uppercase font-serif px-1.5 py-0.5 rounded font-semibold border ${
                      passcode.trim()
                        ? 'bg-[#e2edd8] text-[#3e6826] border-[#b9d9a4]'
                        : 'bg-[#fae7e4] text-[#a63c2c] border-[#f0bcb4]'
                    }`}
                  >
                    {passcode.trim() ? 'Passcode Set' : 'Required'}
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-serif px-1.5 py-0.5 rounded bg-[#e8decf] text-[#6e5d48] border border-[#d6caa8]">
                    Optional
                  </span>
                )}
              </label>

              {passcode.trim().length > 0 && (
                <div className="flex items-center gap-1 text-[11px] font-serif-sub text-[#4e6b35]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Stored in LocalStorage</span>
                </div>
              )}
            </div>

            <div className="relative flex items-center">
              <div className="absolute left-3 text-[#8a6b3e] pointer-events-none">
                <Key className="w-3.5 h-3.5" />
              </div>
              <input
                id="composer-passcode-input"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => handlePasscodeChange(e.target.value)}
                placeholder={
                  requiresPasscode
                    ? 'Enter AI composer passcode to unlock Gemini LLM access...'
                    : 'Enter passcode (if configured on server)...'
                }
                className={`w-full rounded-lg bg-[#fdfcf9] border pl-8.5 pr-20 py-2 text-xs text-[#2d2419] placeholder-[#9f8f7c] outline-none transition font-mono shadow-2xs ${
                  requiresPasscode && !passcode.trim()
                    ? 'border-[#e0a299] focus:border-[#9c3826] focus:ring-1 focus:ring-[#9c3826]'
                    : 'border-[#cfbe9e] focus:border-[#bfa175] focus:ring-1 focus:ring-[#bfa175]'
                }`}
              />
              <div className="absolute right-2 flex items-center space-x-1">
                {passcode.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearPasscode}
                    className="p-1 rounded text-[#8a765e] hover:text-[#9c3826] hover:bg-[#ebdcc7] transition cursor-pointer"
                    title="Clear saved passcode from local storage"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  className="p-1 rounded text-[#8a765e] hover:text-[#2d2419] hover:bg-[#ebdcc7] transition cursor-pointer"
                  title={showPasscode ? 'Hide passcode' : 'Show passcode'}
                >
                  {showPasscode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#75644e] font-serif-sub italic">
              <span>
                {requiresPasscode
                  ? 'Server requires passcode authentication to protect Gemini LLM API access.'
                  : 'Passcode is automatically remembered in browser local storage for future visits.'}
              </span>
              {selectedEngine === 'procedural' && (
                <span className="text-[#8a6b3e] font-semibold not-italic">
                  (Procedural engine runs offline without passcode)
                </span>
              )}
            </div>
          </div>

          {/* Options: Engine/Model, Comb Scale, Style Selection & Cylinder Length */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Composition Engine / Model Selector */}
              <div>
                <label className="text-xs text-[#75644e] font-serif font-semibold block mb-1.5 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span>Engine / Model</span>
                </label>
                <select
                  value={selectedEngine}
                  onChange={(e) => setSelectedEngine(e.target.value as ComposerEngineId)}
                  className="w-full rounded-lg bg-[#f8f5ee] border border-[#ded3be] px-2.5 py-2 text-xs text-[#2d2419] outline-none focus:border-[#bfa175] font-serif shadow-2xs cursor-pointer"
                >
                  {ENGINE_CHOICES.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Comb Scale Selector */}
              <div>
                <label className="text-xs text-[#75644e] font-serif font-semibold block mb-1.5 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span>Comb Scale Tuning</span>
                </label>
                <select
                  value={selectedCombScale}
                  onChange={(e) => setSelectedCombScale(e.target.value as CombScaleId)}
                  className="w-full rounded-lg bg-[#f8f5ee] border border-[#ded3be] px-2.5 py-2 text-xs text-[#2d2419] outline-none focus:border-[#bfa175] font-serif shadow-2xs cursor-pointer"
                >
                  {COMB_CHOICES.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label} ({choice.tines}T)
                    </option>
                  ))}
                </select>
              </div>

              {/* Musical Style */}
              <div>
                <label className="text-xs text-[#75644e] font-serif font-semibold block mb-1.5">
                  Musical Style & Mood
                </label>
                <select
                  value={selectedStylePreset}
                  onChange={(e) => setSelectedStylePreset(e.target.value)}
                  className="w-full rounded-lg bg-[#f8f5ee] border border-[#ded3be] px-2.5 py-2 text-xs text-[#2d2419] outline-none focus:border-[#bfa175] font-serif shadow-2xs cursor-pointer"
                >
                  {STYLE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label} {preset.id !== 'custom' ? `(${preset.desc})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cylinder Rotation Length */}
              <div>
                <label className="text-xs text-[#75644e] font-serif font-semibold block mb-1.5">
                  Cylinder Length
                </label>
                <select
                  value={totalSteps}
                  onChange={(e) => setTotalSteps(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#f8f5ee] border border-[#ded3be] px-2.5 py-2 text-xs text-[#2d2419] outline-none focus:border-[#bfa175] font-serif shadow-2xs cursor-pointer"
                >
                  <option value={64}>64 Steps (4-Measure Loop)</option>
                  <option value={96}>96 Steps (6-Measure Loop)</option>
                  <option value={128}>128 Steps (8-Measure Full)</option>
                </select>
              </div>
            </div>

            {/* Quick Style Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-serif text-[#8a765e] mr-1">Quick Styles:</span>
              {STYLE_PRESETS.map((preset) => {
                const isSelected = selectedStylePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedStylePreset(preset.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-serif transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-2xs'
                        : 'bg-[#f4eee4] hover:bg-[#ede3d3] text-[#6f5e49] border border-[#ded3be]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Style Freeform Input Field (Shown when 'custom' is selected) */}
            {selectedStylePreset === 'custom' && (
              <div className="p-3 rounded-xl bg-[#f5ede0] border border-[#d8caa8] space-y-1.5 animate-in fade-in shadow-2xs">
                <label className="text-xs font-serif font-bold text-[#5c462b] flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span>Custom Musical Style / Subgenre / Atmosphere</span>
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={customStyleText}
                  onChange={(e) => setCustomStyleText(e.target.value)}
                  placeholder="e.g. Baroque Minuet, Chopin Nocturne, Cyberpunk, French Café Chanson, Video Game RPG..."
                  className="w-full rounded-lg bg-[#fdfcf9] border border-[#cfbe9e] focus:border-[#bfa175] focus:ring-1 focus:ring-[#bfa175] px-3 py-2 text-xs text-[#2d2419] placeholder-[#9f8f7c] outline-none shadow-2xs"
                />
                <p className="text-[11px] text-[#75644e] font-serif-sub italic">
                  Gemini will arrange the melody incorporating harmonics, cadences, and moods specific to your custom style.
                </p>
              </div>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-[#fdf2f0] border border-[#f2c6bf] text-[#9c3826] text-xs font-serif">
              {error}
            </div>
          )}

          {/* Generated Result Card with In-Modal Audio Preview & Model Badge */}
          {generatedSong && (
            <div className="p-4 rounded-xl bg-[#f4eee4] border-2 border-[#d8caa8] space-y-3 animate-in fade-in shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-serif font-bold text-[#433422] flex items-center gap-1.5">
                    <Music className="w-4 h-4 text-[#8a6b3e]" />
                    {generatedSong.title}
                  </span>
                </div>
                {/* Model badge displaying which model composed this */}
                {renderModelBadge(generatedSong.modelUsed)}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                <span className="px-2 py-0.5 rounded bg-[#ebd7ba] text-[#7a4f15] font-semibold">
                  {generatedSong.tempoBpm} BPM • {generatedSong.pins.length} Pins • {generatedSong.totalSteps} Steps ({Math.max(1, Math.round(generatedSong.totalSteps / 16))}m)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#e5dcce] text-[#5e4c36] font-semibold">
                  {COMB_SCALES_MAP[generatedSong.combScaleId || 'romantic-flat']?.shortLabel || 'Romantic Flat 22N'} ({COMB_SCALES_MAP[generatedSong.combScaleId || 'romantic-flat']?.rangeLabel || 'C5–Bb6'})
                </span>
              </div>

              <p className="text-xs text-[#5e4c36] font-serif-sub italic bg-[#fbf9f4] p-2.5 rounded-lg border border-[#e5dcce]">
                "{generatedSong.description}"
              </p>

              {/* Audio Preview Controls inside result card */}
              <div className="flex items-center justify-between pt-1 border-t border-[#e2d5be]">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleTogglePreview}
                    className={`px-3 py-1.5 rounded-lg text-xs font-serif font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-2xs ${
                      isPreviewPlaying
                        ? 'bg-[#9c3826] hover:bg-[#852f20] text-white'
                        : 'bg-[#5c462b] hover:bg-[#433422] text-[#fbf8f2]'
                    }`}
                  >
                    {isPreviewPlaying ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop Preview</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Audition / Preview Melody</span>
                      </>
                    )}
                  </button>

                  {isPreviewPlaying && (
                    <span className="text-[11px] font-mono text-[#8a6b3e] flex items-center gap-1 animate-pulse">
                      <Volume2 className="w-3.5 h-3.5" />
                      Step {previewStep + 1}/{generatedSong.totalSteps}
                    </span>
                  )}
                </div>

                <span className="text-[11px] text-[#8a765e] font-serif-sub italic hidden sm:inline">
                  Listen before loading into cylinder
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="pt-4 border-t border-[#e5dcce] flex flex-wrap items-center justify-between gap-2.5">
          {/* Left Actions: Fresh Start or Clear */}
          <div>
            {generatedSong ? (
              <button
                type="button"
                onClick={handleNewComposition}
                disabled={isLoading}
                className="px-3.5 py-2 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] hover:text-[#2d2419] font-serif font-semibold text-xs flex items-center space-x-1.5 border border-[#ded3be] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
                title="Clear current composition and start fresh with new prompt"
              >
                <PlusCircle className="w-3.5 h-3.5 text-[#8a6b3e]" />
                <span>New Composition (Fresh Start)</span>
              </button>
            ) : prompt.trim().length > 0 ? (
              <button
                type="button"
                onClick={handleClearPrompt}
                disabled={isLoading}
                className="px-3.5 py-2 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] hover:text-[#2d2419] font-serif font-semibold text-xs flex items-center space-x-1.5 border border-[#ded3be] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
              >
                Reset inputs
              </button>
            ) : null}
          </div>

          {/* Right Actions: Compose / Regenerate / Load */}
          <div className="flex items-center gap-2">
            {generatedSong ? (
              <>
                {/* Re-generate Variation Button */}
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={isLoading || !prompt.trim()}
                  className="px-3.5 py-2.5 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] text-[#433422] font-serif font-bold text-xs sm:text-sm flex items-center space-x-1.5 border border-[#ded3be] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
                  title="Generate another variation with the same prompt & style"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Composing...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-[#8a6b3e]" />
                      <span>Regenerate Variation</span>
                    </>
                  )}
                </button>

                {/* Load Into Cylinder Button */}
                {!isLoading && (
                  <button
                    type="button"
                    onClick={handleApplySong}
                    className="px-5 py-2.5 rounded-xl bg-[#433422] hover:bg-[#342718] text-[#fbf8f2] font-serif font-bold text-xs sm:text-sm flex items-center space-x-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Load Into Music Box</span>
                  </button>
                )}
              </>
            ) : (
              /* Initial Compose Button */
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isLoading || !prompt.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#c4a675] via-[#dfcd9f] to-[#b8955e] hover:from-[#bfa170] hover:to-[#ae8b54] text-[#2d2419] font-serif font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-xs border border-[#ae8b54]/40 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {selectedEngine === 'procedural'
                        ? 'Sequencing Procedurally...'
                        : selectedEngine === 'gemini-3.1-flash-lite'
                        ? 'Composing with Gemini 3.1...'
                        : selectedEngine === 'gemini-3.7-flash'
                        ? 'Composing with Gemini 3.7...'
                        : 'Composing with Gemini AI...'}
                    </span>
                  </>
                ) : (
                  <>
                    {selectedEngine === 'procedural' ? (
                      <Cpu className="w-4 h-4" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    <span>
                      {selectedEngine === 'procedural'
                        ? 'Compose (Procedural Engine)'
                        : selectedEngine === 'gemini-3.1-flash-lite'
                        ? 'Compose (Gemini 3.1 Flash Lite)'
                        : selectedEngine === 'gemini-3.7-flash'
                        ? 'Compose (Gemini)'
                        : 'Compose with Gemini'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
