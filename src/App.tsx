import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MusicBoxSong, MusicBoxPin, PlayMode, SoundChamberPreset, NatureAmbienceSettings, SANKYO_18_TINES } from './types';
import { DEFAULT_SONGS } from './data/defaultSongs';
import { musicBoxAudio } from './audio/musicBoxAudio';
import { MusicBoxMovement } from './components/MusicBoxMovement';
import { CylinderRollEditor } from './components/CylinderRollEditor';
import { WindingKey } from './components/WindingKey';
import { GeminiComposerModal } from './components/GeminiComposerModal';
import { NatureAmbianceMixer } from './components/NatureAmbianceMixer';
import { SongLibrary } from './components/SongLibrary';
import {
  Sparkles,
  Music,
  RotateCcw,
  Volume2,
  VolumeX,
  Layers,
  Trees,
  Sliders,
  Play,
  Pause,
  Plus,
  HelpCircle,
} from 'lucide-react';

type TabView = 'movement' | 'editor' | 'nature' | 'library';

export default function App() {
  // Songs state
  const [songs, setSongs] = useState<MusicBoxSong[]>(() => {
    try {
      const saved = localStorage.getItem('musicbox_custom_songs');
      if (saved) {
        const parsed = JSON.parse(saved);
        return [...DEFAULT_SONGS, ...parsed];
      }
    } catch {
      // ignore
    }
    return DEFAULT_SONGS;
  });

  const [currentSong, setCurrentSong] = useState<MusicBoxSong>(() => DEFAULT_SONGS[0]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('spring');
  const [springTension, setSpringTension] = useState<number>(0.85); // 85% initial wind
  const [tempoBpm, setTempoBpm] = useState<number>(() => currentSong.tempoBpm || 88);
  const [activeTines, setActiveTines] = useState<Set<number>>(new Set());

  // Sound settings
  const [soundPreset, setSoundPreset] = useState<SoundChamberPreset>('gold-sankyo');
  const [natureSettings, setNatureSettings] = useState<NatureAmbienceSettings>({
    rain: 0,
    fire: 0,
    forest: 0,
    windChime: 0,
    stream: 0,
  });
  const [masterVolume, setMasterVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);

  // UI Navigation Tabs
  const [activeTab, setActiveTab] = useState<TabView>('movement');
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);

  // Refs for audio scheduling
  const isPlayingRef = useRef(isPlaying);
  const currentStepRef = useRef(currentStep);
  const currentSongRef = useRef(currentSong);
  const springTensionRef = useRef(springTension);
  const playModeRef = useRef(playMode);
  const tempoBpmRef = useRef(tempoBpm);
  const stepTimerRef = useRef<number | null>(null);
  const lastStepTimeRef = useRef<number>(0);

  // Synchronize refs
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentStepRef.current = currentStep;
    currentSongRef.current = currentSong;
    springTensionRef.current = springTension;
    playModeRef.current = playMode;
    tempoBpmRef.current = tempoBpm;
  }, [isPlaying, currentStep, currentSong, springTension, playMode, tempoBpm]);

  // Initialize audio engine on first user interaction
  const ensureAudioInitialized = useCallback(async () => {
    await musicBoxAudio.resumeIfNeeded();
    musicBoxAudio.setMasterVolume(isMuted ? 0 : masterVolume);
  }, [isMuted, masterVolume]);

  // Handle single tine pluck (from visual click or keyboard)
  const handlePluckTine = useCallback(async (tineIndex: number) => {
    await ensureAudioInitialized();
    musicBoxAudio.playTine(tineIndex, 1.0);

    setActiveTines((prev) => {
      const next = new Set(prev);
      next.add(tineIndex);
      return next;
    });

    // Reset tine vibration after 120ms
    setTimeout(() => {
      setActiveTines((prev) => {
        const next = new Set(prev);
        next.delete(tineIndex);
        return next;
      });
    }, 120);
  }, [ensureAudioInitialized]);

  // Execute a step and play any pins at this step
  const executeStep = useCallback((step: number) => {
    const song = currentSongRef.current;
    const pinsAtStep = song.pins.filter((p) => p.step === step);

    if (pinsAtStep.length > 0) {
      const hitTines = new Set<number>();
      pinsAtStep.forEach((pin) => {
        hitTines.add(pin.tineIndex);
        musicBoxAudio.playTine(pin.tineIndex, 1.0);
      });

      setActiveTines(hitTines);
      setTimeout(() => {
        setActiveTines(new Set());
      }, 120);
    }
  }, []);

  // Main playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (stepTimerRef.current) {
        cancelAnimationFrame(stepTimerRef.current);
        stepTimerRef.current = null;
      }
      musicBoxAudio.setMechanicalHum(false);
      return;
    }

    ensureAudioInitialized();
    musicBoxAudio.setMechanicalHum(true, tempoBpm / 90);
    lastStepTimeRef.current = performance.now();

    const loop = (timestamp: number) => {
      if (!isPlayingRef.current) return;

      const elapsed = timestamp - lastStepTimeRef.current;
      // Step duration in ms based on tempo (BPM: 4 steps per beat)
      // Base step interval = (60,000 / BPM) / 4
      let speedFactor = 1.0;

      // Realistic spring unwinding physics
      if (playModeRef.current === 'spring') {
        const tension = springTensionRef.current;
        if (tension <= 0) {
          setIsPlaying(false);
          musicBoxAudio.setMechanicalHum(false);
          return;
        }

        // When spring is almost unwound (<15%), it slows down naturally
        if (tension < 0.2) {
          speedFactor = Math.max(0.4, tension * 5);
        }

        // Unwind spring rate (~0.003 per step)
        setSpringTension((prev) => {
          const next = Math.max(0, prev - 0.0022);
          springTensionRef.current = next;
          return next;
        });
      }

      const stepInterval = ((60000 / tempoBpmRef.current) / 4) / speedFactor;

      if (elapsed >= stepInterval) {
        lastStepTimeRef.current = timestamp;

        setCurrentStep((prevStep) => {
          const total = currentSongRef.current.totalSteps;
          const nextStep = (prevStep + 1) % total;
          currentStepRef.current = nextStep;
          executeStep(nextStep);
          return nextStep;
        });
      }

      stepTimerRef.current = requestAnimationFrame(loop);
    };

    stepTimerRef.current = requestAnimationFrame(loop);

    return () => {
      if (stepTimerRef.current) {
        cancelAnimationFrame(stepTimerRef.current);
      }
    };
  }, [isPlaying, executeStep, ensureAudioInitialized, tempoBpm]);

  // Handle Play/Pause
  const handleTogglePlay = async () => {
    await ensureAudioInitialized();
    if (!isPlaying) {
      if (playMode === 'spring' && springTension <= 0) {
        // Automatically give a partial wind if user presses play at 0%
        setSpringTension(0.5);
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  // Rewind to step 0
  const handleRewind = () => {
    setCurrentStep(0);
    currentStepRef.current = 0;
  };

  // Winding action
  const handleWindSpring = (added: number) => {
    ensureAudioInitialized();
    setSpringTension((prev) => Math.min(1.0, prev + added));
  };

  // Manual Hand-Crank action
  const handleManualCrank = (deltaSteps: number) => {
    ensureAudioInitialized();
    const total = currentSong.totalSteps;
    const nextStep = (Math.floor(currentStep + deltaSteps) % total + total) % total;
    if (nextStep !== currentStep) {
      setCurrentStep(nextStep);
      executeStep(nextStep);
    }
  };

  // Toggle pin in editor
  const handleTogglePin = (step: number, tineIndex: number) => {
    ensureAudioInitialized();
    musicBoxAudio.playTine(tineIndex, 0.8);

    const exists = currentSong.pins.some((p) => p.step === step && p.tineIndex === tineIndex);
    let newPins: MusicBoxPin[];

    if (exists) {
      newPins = currentSong.pins.filter((p) => !(p.step === step && p.tineIndex === tineIndex));
    } else {
      newPins = [...currentSong.pins, { step, tineIndex }];
    }

    const updatedSong = { ...currentSong, pins: newPins };
    setCurrentSong(updatedSong);

    // Update in songs array
    setSongs((prev) => prev.map((s) => (s.id === updatedSong.id ? updatedSong : s)));
  };

  // Clear all pins
  const handleClearPins = () => {
    const updated = { ...currentSong, pins: [] };
    setCurrentSong(updated);
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  // Shift pins
  const handleShiftPins = (delta: number) => {
    const total = currentSong.totalSteps;
    const shiftedPins = currentSong.pins.map((p) => ({
      ...p,
      step: ((p.step + delta) % total + total) % total,
    }));
    const updated = { ...currentSong, pins: shiftedPins };
    setCurrentSong(updated);
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  // Select song from library
  const handleSelectSong = (song: MusicBoxSong) => {
    setCurrentSong(song);
    setTempoBpm(song.tempoBpm || 88);
    setCurrentStep(0);
  };

  // Save new/AI song
  const handleLoadNewSong = (song: MusicBoxSong) => {
    setSongs((prev) => [song, ...prev.filter((s) => s.id !== song.id)]);
    setCurrentSong(song);
    setTempoBpm(song.tempoBpm);
    setCurrentStep(0);
    setActiveTab('movement');

    // Save custom songs to localStorage
    try {
      const customSongs = [song, ...songs.filter((s) => s.category === 'custom' || s.isAiGenerated)];
      localStorage.setItem('musicbox_custom_songs', JSON.stringify(customSongs));
    } catch {
      // ignore
    }
  };

  // Volume & Sound preset handlers
  const handleChangeSoundPreset = async (preset: SoundChamberPreset) => {
    setSoundPreset(preset);
    await ensureAudioInitialized();
    musicBoxAudio.applyChamberPreset(preset);
    if (!isPlaying) {
      musicBoxAudio.playAuditionChime();
    }
  };

  const handleChangeNature = async (settings: NatureAmbienceSettings) => {
    setNatureSettings(settings);
    await ensureAudioInitialized();
    musicBoxAudio.updateNatureVolumes(settings);
  };

  const handleChangeMasterVolume = async (vol: number) => {
    setMasterVolume(vol);
    await ensureAudioInitialized();
    if (!isMuted) {
      musicBoxAudio.setMasterVolume(vol);
    }
  };

  const handleToggleMute = async () => {
    await ensureAudioInitialized();
    if (isMuted) {
      setIsMuted(false);
      musicBoxAudio.setMasterVolume(masterVolume);
    } else {
      setIsMuted(true);
      musicBoxAudio.setMasterVolume(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f4ec] text-[#2d2419] flex flex-col justify-between selection:bg-[#bfa175]/30 selection:text-[#2d2419]">
      {/* Top App Header */}
      <header className="w-full border-b border-[#e5dcce] bg-[#fcfbf8]/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-[0_2px_12px_rgba(67,52,34,0.04)]">
        {/* Brand Title */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#a68656] via-[#d6be8e] to-[#f4eedf] p-[1px] shadow-sm shadow-[#433422]/10 flex items-center justify-center">
            <div className="w-full h-full rounded-xl bg-[#fcfbf8] flex items-center justify-center text-[#8e6d3c]">
              <Music className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h1 className="font-serif font-bold text-base sm:text-lg text-[#433422] tracking-wide leading-none">
              Mechanical Music Box
            </h1>
            <p className="text-[11px] text-[#84735c] mt-0.5 font-serif-sub">
              18-Note Classic Movement & AI Composer
            </p>
          </div>
        </div>

        {/* Top Right Quick Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Gemini AI Compose Action */}
          <button
            id="header-gemini-compose-btn"
            onClick={() => setIsGeminiModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#c4a675] via-[#dfcd9f] to-[#b8955e] hover:from-[#bfa170] hover:to-[#ae8b54] text-[#2d2419] text-xs font-serif font-bold flex items-center space-x-1.5 shadow-sm shadow-[#8a6b3e]/20 transition-all hover:scale-[1.02] active:scale-[0.98] border border-[#ae8b54]/40"
          >
            <Sparkles className="w-3.5 h-3.5 fill-[#2d2419]" />
            <span className="hidden sm:inline">Compose with Gemini 3.7</span>
            <span className="sm:hidden">Gemini AI</span>
          </button>

          {/* Master Mute Button */}
          <button
            id="mute-toggle-btn"
            onClick={handleToggleMute}
            className="p-2 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] hover:text-[#2d2419] transition shadow-xs"
            title={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-[#a64b38]" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Active Song Banner & Controls */}
        <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_4px_24px_rgba(67,52,34,0.06)]">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-[#f4efe4] text-[#8a6b3e] border border-[#d8caa8]">
                {currentSong.category.toUpperCase()}
              </span>
              {currentSong.isAiGenerated && (
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-[#efe8f4] text-[#734f8a] border border-[#cfbedb] flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Gemini 3.7
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-serif font-bold text-[#433422]">
              {currentSong.title}
            </h2>
            {currentSong.description && (
              <p className="text-xs text-[#75644e] max-w-xl font-serif-sub italic">
                {currentSong.description}
              </p>
            )}
          </div>

          {/* Quick Tempo & Rewind Slider */}
          <div className="flex items-center space-x-4 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex flex-col items-end space-y-1">
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-[#84735c]">Tempo:</span>
                <span className="font-mono text-[#8a6b3e] font-bold">{tempoBpm} BPM</span>
              </div>
              <input
                type="range"
                min="60"
                max="140"
                value={tempoBpm}
                onChange={(e) => setTempoBpm(parseInt(e.target.value))}
                className="w-28 sm:w-32 accent-[#a68656] cursor-pointer h-1.5 bg-[#e8e0d1] rounded-lg appearance-none"
              />
            </div>

            <button
              id="rewind-step-btn"
              onClick={handleRewind}
              title="Rewind to beginning"
              className="p-2.5 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] hover:text-[#2d2419] transition shadow-xs"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Navigation Tabs */}
        <div className="w-full max-w-4xl mx-auto flex items-center justify-center">
          <div className="inline-flex p-1 rounded-2xl bg-[#eee7da] border border-[#ded3be] overflow-x-auto text-xs sm:text-sm font-medium shadow-xs">
            <button
              id="tab-movement-btn"
              onClick={() => setActiveTab('movement')}
              className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all font-serif ${
                activeTab === 'movement'
                  ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-sm'
                  : 'text-[#6f5e49] hover:text-[#2d2419] hover:bg-[#e4dcce]/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Mechanical Movement</span>
            </button>

            <button
              id="tab-editor-btn"
              onClick={() => setActiveTab('editor')}
              className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all font-serif ${
                activeTab === 'editor'
                  ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-sm'
                  : 'text-[#6f5e49] hover:text-[#2d2419] hover:bg-[#e4dcce]/60'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Cylinder Pin Matrix</span>
            </button>

            <button
              id="tab-nature-btn"
              onClick={() => setActiveTab('nature')}
              className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all font-serif ${
                activeTab === 'nature'
                  ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-sm'
                  : 'text-[#6f5e49] hover:text-[#2d2419] hover:bg-[#e4dcce]/60'
              }`}
            >
              <Trees className="w-4 h-4" />
              <span>Nature & Chamber</span>
            </button>

            <button
              id="tab-library-btn"
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all font-serif ${
                activeTab === 'library'
                  ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-sm'
                  : 'text-[#6f5e49] hover:text-[#2d2419] hover:bg-[#e4dcce]/60'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>Song Repertoire</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Mechanical Movement (The Sankyo 18-Note Movement) */}
        {activeTab === 'movement' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <MusicBoxMovement
              currentStep={currentStep}
              totalSteps={currentSong.totalSteps}
              pins={currentSong.pins}
              isPlaying={isPlaying}
              tempoBpm={tempoBpm}
              playMode={playMode}
              springTension={springTension}
              activeTines={activeTines}
              onPluckTine={handlePluckTine}
            />

            {/* Winding Controls Component */}
            <WindingKey
              playMode={playMode}
              onChangePlayMode={setPlayMode}
              springTension={springTension}
              onWindSpring={handleWindSpring}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onManualCrankStep={handleManualCrank}
            />
          </div>
        )}

        {/* Tab 2: Cylinder Roll Pin Editor */}
        {activeTab === 'editor' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <CylinderRollEditor
              pins={currentSong.pins}
              totalSteps={currentSong.totalSteps}
              currentStep={currentStep}
              isPlaying={isPlaying}
              onTogglePin={handleTogglePin}
              onClearAll={handleClearPins}
              onShiftPins={handleShiftPins}
              onPluckTine={handlePluckTine}
            />

            {/* Winding & Play controls also accessible under Editor */}
            <WindingKey
              playMode={playMode}
              onChangePlayMode={setPlayMode}
              springTension={springTension}
              onWindSpring={handleWindSpring}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onManualCrankStep={handleManualCrank}
            />
          </div>
        )}

        {/* Tab 3: Nature Ambiance & Sound Chamber Studio */}
        {activeTab === 'nature' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <NatureAmbianceMixer
              settings={natureSettings}
              onChangeSettings={handleChangeNature}
              soundPreset={soundPreset}
              onChangeSoundPreset={handleChangeSoundPreset}
              masterVolume={masterVolume}
              onChangeMasterVolume={handleChangeMasterVolume}
            />
          </div>
        )}

        {/* Tab 4: Song Repertoire & Custom Library */}
        {activeTab === 'library' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <SongLibrary
              songs={songs}
              currentSongId={currentSong.id}
              onSelectSong={handleSelectSong}
              onImportSong={handleLoadNewSong}
              onOpenGeminiModal={() => setIsGeminiModalOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-[#e5dcce] py-4 px-6 text-center text-xs text-[#8c7b67] font-serif-sub">
        Classic 18-Note Mechanical Music Box • Sankyo Acoustic Modeling • Powered by Gemini 3.7 Flash
      </footer>

      {/* Gemini 3.7 AI Composer Modal */}
      <GeminiComposerModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        onLoadSong={handleLoadNewSong}
      />
    </div>
  );
}
