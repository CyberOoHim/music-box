import React, { useState, useEffect, useRef } from 'react';
import { MusicBoxSong } from '../types';
import { Sparkles, X, Wand2, Music, Loader2, Play, Check, RefreshCw } from 'lucide-react';
import { generateProceduralMusic } from '../utils/proceduralComposer';

interface GeminiComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSong: (song: MusicBoxSong) => void;
  hasAiComposer?: boolean;
}

const INSPIRATION_PROMPTS = [
  {
    title: 'Starlight Lullaby',
    style: 'lullaby',
    prompt: 'A gentle, peaceful lullaby for a starry night with sparkling high treble chimes and warm low root notes.',
  },
  {
    title: 'Ghibli Nostalgic Wind',
    style: 'nostalgic',
    prompt: 'A bittersweet, nostalgic waltz in the spirit of Studio Ghibli music box pieces like Castle in the Sky and Spirited Away.',
  },
  {
    title: 'Winter Hearth Dream',
    style: 'relaxing',
    prompt: 'A calming music box melody depicting snow softly falling outside while resting beside a cozy fireplace.',
  },
  {
    title: 'Parisian Antique Carousel',
    style: 'waltz',
    prompt: 'A charming 3/4 vintage carousel waltz from a 19th century clockwork music box in Montmartre.',
  },
  {
    title: 'Forest Sanctuary',
    style: 'nature',
    prompt: 'A serene melody inspired by gentle raindrops dripping from mossy oak branches in a sunlit forest.',
  },
  {
    title: 'Celtic Fairytale',
    style: 'celtic',
    prompt: 'An enchanting ancient Celtic folk melody arranged for ringing steel chime pins.',
  },
];

export const GeminiComposerModal: React.FC<GeminiComposerModalProps> = ({
  isOpen,
  onClose,
  onLoadSong,
  hasAiComposer = false,
}) => {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('nostalgic');
  const [totalSteps, setTotalSteps] = useState<number>(64);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedSong, setGeneratedSong] = useState<MusicBoxSong | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!isOpen || !hasAiComposer) return null;

  const handleGenerate = async (customPrompt?: string, customStyle?: string) => {
    const textToUse = customPrompt || prompt;
    const styleToUse = customStyle || style;

    if (!textToUse.trim()) {
      setError('Please enter a melody idea or select an inspiration preset.');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setGeneratedSong(null);

    try {
      const response = await fetch('/api/gemini/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: textToUse,
          style: styleToUse,
          totalSteps: totalSteps,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newSong: MusicBoxSong = {
          id: `gemini-${Date.now()}`,
          title: data.title || 'Gemini 3.7 Music Box Melody',
          category: 'ai',
          description: data.composerNote || `${data.mood} melody composed with Gemini 3.7 Flash.`,
          tempoBpm: data.tempoBpm || 88,
          totalSteps: data.totalSteps || totalSteps,
          pins: data.pins || [],
          createdAt: Date.now(),
          isAiGenerated: true,
        };
        setGeneratedSong(newSong);
        return;
      }
      throw new Error('API unavailable, falling back to algorithmic composer');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      // Graceful algorithmic fallback (e.g., when hosted statically on GitHub Pages)
      const data = generateProceduralMusic(textToUse, styleToUse, totalSteps);
      const newSong: MusicBoxSong = {
        id: `procedural-${Date.now()}`,
        title: data.title || 'Whispering Music Box',
        category: 'ai',
        description: data.composerNote || `${data.mood} melody created for your music box.`,
        tempoBpm: data.tempoBpm || 88,
        totalSteps: data.totalSteps || totalSteps,
        pins: data.pins || [],
        createdAt: Date.now(),
        isAiGenerated: true,
      };
      setGeneratedSong(newSong);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySong = () => {
    if (generatedSong) {
      onLoadSong(generatedSong);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2d2419]/65 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#fdfcf9] border-2 border-[#bfa175] p-5 sm:p-7 shadow-[0_20px_50px_rgba(45,36,25,0.35)] text-[#2d2419] overflow-hidden max-h-[90vh] flex flex-col">
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
                Gemini 3.7 Flash Music Box Composer
              </h2>
              <p className="text-xs text-[#75644e] font-serif-sub italic">
                Compose custom 18-note mechanical cylinder arrangements from any story or mood.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8a765e] hover:text-[#2d2419] hover:bg-[#f0e6d6] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 custom-scrollbar pr-1">
          {/* Inspiration Presets */}
          <div>
            <label className="text-xs font-serif uppercase tracking-wider text-[#8a6b3e] font-bold mb-2 block">
              Quick Inspiration Themes
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {INSPIRATION_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(item.prompt);
                    setStyle(item.style);
                    handleGenerate(item.prompt, item.style);
                  }}
                  className="p-2.5 rounded-xl bg-[#f8f5ee] hover:bg-[#f3ece0] border border-[#ded3be] hover:border-[#bfa175] text-left transition group shadow-2xs"
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
            <label className="text-xs font-serif uppercase tracking-wider text-[#8a6b3e] font-bold mb-2 block">
              Or Describe Your Own Music Box Melody
            </label>
            <textarea
              id="gemini-prompt-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A delicate music box lullaby for a sleeping child, with soft descending chords and celestial high bell notes..."
              className="w-full rounded-xl bg-[#f8f5ee] border border-[#ded3be] focus:border-[#bfa175] focus:ring-1 focus:ring-[#bfa175] p-3 text-sm text-[#2d2419] placeholder-[#a4937d] outline-none transition shadow-2xs"
            />
          </div>

          {/* Options: Style & Cylinder Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#75644e] font-serif font-semibold block mb-1.5">Musical Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full rounded-lg bg-[#f8f5ee] border border-[#ded3be] px-3 py-2 text-xs text-[#2d2419] outline-none focus:border-[#bfa175] font-serif shadow-2xs"
              >
                <option value="nostalgic">Nostalgic (Ghibli / Japanese Folk)</option>
                <option value="lullaby">Lullaby & Sleep (Gentle, Soft)</option>
                <option value="waltz">Classic Waltz (3/4 Clockwork Dance)</option>
                <option value="classical">Classical Chamber (Baroque / Romantic)</option>
                <option value="celtic">Celtic Fairytale (Enchanted Folk)</option>
                <option value="relaxing">Tranquil Zen & Rain</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#75644e] font-serif font-semibold block mb-1.5">Cylinder Rotation Length</label>
              <select
                value={totalSteps}
                onChange={(e) => setTotalSteps(Number(e.target.value))}
                className="w-full rounded-lg bg-[#f8f5ee] border border-[#ded3be] px-3 py-2 text-xs text-[#2d2419] outline-none focus:border-[#bfa175] font-serif shadow-2xs"
              >
                <option value={64}>64 Steps (Standard 4-Measure Loop)</option>
                <option value={96}>96 Steps (Extended 6-Measure Loop)</option>
                <option value={128}>128 Steps (Full 8-Measure Piece)</option>
              </select>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-[#fdf2f0] border border-[#f2c6bf] text-[#9c3826] text-xs font-serif">
              {error}
            </div>
          )}

          {/* Generated Result Card */}
          {generatedSong && (
            <div className="p-4 rounded-xl bg-[#f4eee4] border border-[#d8caa8] space-y-2 animate-in fade-in shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-serif font-bold text-[#433422] flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-[#8a6b3e]" />
                  {generatedSong.title}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#ebd7ba] text-[#7a4f15] font-semibold">
                  {generatedSong.tempoBpm} BPM • {generatedSong.pins.length} Pins • {generatedSong.totalSteps} Steps ({Math.max(1, Math.round(generatedSong.totalSteps / 16))} Measures)
                </span>
              </div>
              <p className="text-xs text-[#5e4c36] font-serif-sub italic">
                "{generatedSong.description}"
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="pt-4 border-t border-[#e5dcce] flex items-center justify-between gap-3">
          <button
            onClick={() => handleGenerate()}
            disabled={isLoading || !prompt.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#c4a675] via-[#dfcd9f] to-[#b8955e] hover:from-[#bfa170] hover:to-[#ae8b54] text-[#2d2419] font-serif font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-xs border border-[#ae8b54]/40 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Composing with Gemini 3.7...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>{generatedSong ? 'Re-Compose Melody' : 'Compose with Gemini'}</span>
              </>
            )}
          </button>

          {generatedSong && (
            <button
              onClick={handleApplySong}
              className="px-5 py-2.5 rounded-xl bg-[#433422] hover:bg-[#342718] text-[#fbf8f2] font-serif font-bold text-xs sm:text-sm flex items-center space-x-1.5 shadow-xs transition"
            >
              <Check className="w-4 h-4" />
              <span>Load Into Music Box</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
