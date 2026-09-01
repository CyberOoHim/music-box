import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MusicBoxSong,
  MusicBoxPin,
  PlayMode,
  SoundChamberPreset,
  NatureAmbienceSettings,
  SOUND_CHAMBER_PRESETS,
  UserSettings,
  CombScaleId,
  COMB_SCALES_MAP,
  ROMANTIC_FLAT_22_TINES,
  formatModelDisplayName,
} from './types';
import { DEFAULT_SONGS } from './data/defaultSongs';
import { musicBoxAudio } from './audio/musicBoxAudio';
import { MusicBoxMovement } from './components/MusicBoxMovement';
import { CylinderRollEditor } from './components/CylinderRollEditor';
import { WindingKey } from './components/WindingKey';
import { GeminiComposerModal } from './components/GeminiComposerModal';
import { NatureAmbianceMixer } from './components/NatureAmbianceMixer';
import { SongLibrary } from './components/SongLibrary';
import { ImportExportModal } from './components/ImportExportModal';
import {
  Sparkles,
  Music,
  RotateCcw,
  Volume2,
  VolumeX,
  Layers,
  Trees,
  Sliders,
  FolderArchive,
  ZoomIn,
  ZoomOut,
  Leaf,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

type TabView = 'movement' | 'editor' | 'nature' | 'library';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'info' | 'warn';
}

const DEFAULT_NATURE_SETTINGS: NatureAmbienceSettings = {
  rain: 0,
  fire: 0,
  forest: 0,
  windChime: 0,
  stream: 0,
};

export default function App() {
  // Load saved user settings from localStorage
  const [savedSettings] = useState<Partial<UserSettings>>(() => {
    try {
      const stored = localStorage.getItem('musicbox_user_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read musicbox_user_settings', e);
    }
    return {};
  });

  // Songs state (Default repertoire + all saved custom & AI songs from browser)
  const [songs, setSongs] = useState<MusicBoxSong[]>(() => {
    try {
      const saved = localStorage.getItem('musicbox_saved_songs') || localStorage.getItem('musicbox_custom_songs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge unique by ID
          const defaultIds = new Set(DEFAULT_SONGS.map((s) => s.id));
          const customOrAi = parsed.filter((s) => s && s.id && !defaultIds.has(s.id));
          return [...DEFAULT_SONGS, ...customOrAi];
        }
      }
    } catch {
      // fallback
    }
    return DEFAULT_SONGS;
  });

  // Initial song selection - defaults to Für Elise
  const [currentSong, setCurrentSong] = useState<MusicBoxSong>(() => {
    if (savedSettings.currentSongId) {
      const found = songs.find((s) => s.id === savedSettings.currentSongId);
      if (found) return found;
    }
    return DEFAULT_SONGS[0];
  });

  // Dynamic Comb Scale (Romantic flat 22-tines, Chromatic 30-tines, Sankyo 18-tines)
  const [combScaleId, setCombScaleId] = useState<CombScaleId>(
    () => currentSong.combScaleId || savedSettings.combScaleId || 'romantic-flat'
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>(() => savedSettings.playMode || 'spring');
  const [springTension, setSpringTension] = useState<number>(1.0); // 100% full wind (3 rounds capacity)
  const [tempoBpm, setTempoBpm] = useState<number>(() => currentSong.tempoBpm || savedSettings.tempoBpm || 88);
  const [activeTines, setActiveTines] = useState<Set<number>>(new Set());
  const [crankRpm, setCrankRpm] = useState<number>(0);

  // Sound settings with persistence
  const [soundPreset, setSoundPreset] = useState<SoundChamberPreset>(
    () => savedSettings.soundPreset || 'gold-sankyo'
  );
  const [natureSettings, setNatureSettings] = useState<NatureAmbienceSettings>(
    () => savedSettings.natureSettings || DEFAULT_NATURE_SETTINGS
  );
  const [masterVolume, setMasterVolume] = useState<number>(
    () => (typeof savedSettings.masterVolume === 'number' ? savedSettings.masterVolume : 0.9)
  );
  const [isMuted, setIsMuted] = useState<boolean>(() => !!savedSettings.isMuted);

  // Font Zoom state with persistence (75% to 150%)
  const [fontZoom, setFontZoom] = useState<number>(() => {
    if (typeof savedSettings.fontZoom === 'number' && savedSettings.fontZoom >= 75 && savedSettings.fontZoom <= 150) {
      return savedSettings.fontZoom;
    }
    return 100;
  });

  // UI Navigation Tabs & Modals
  const [activeTab, setActiveTab] = useState<TabView>('movement');
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
  const [hasAiComposer, setHasAiComposer] = useState<boolean>(false);
  const [requiresPasscode, setRequiresPasscode] = useState<boolean>(false);

  // Check if Gemini API key is configured on server/environment and if passcode is required
  useEffect(() => {
    let isMounted = true;
    fetch('/api/gemini/status')
      .then((res) => (res.ok ? res.json() : { enabled: false, requiresPasscode: false }))
      .then((data) => {
        if (isMounted) {
          setHasAiComposer(Boolean(data?.enabled));
          setRequiresPasscode(Boolean(data?.requiresPasscode));
        }
      })
      .catch(() => {
        if (isMounted) {
          setHasAiComposer(false);
          setRequiresPasscode(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Toast notification state
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warn' = 'success') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ id: Date.now(), message, type });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  // Persist User Settings to localStorage
  useEffect(() => {
    try {
      const settingsToSave: UserSettings = {
        soundPreset,
        natureSettings,
        masterVolume,
        isMuted,
        playMode,
        tempoBpm,
        currentSongId: currentSong.id,
        combScaleId,
        fontZoom,
      };
      localStorage.setItem('musicbox_user_settings', JSON.stringify(settingsToSave));
    } catch (e) {
      console.warn('Could not save user settings to localStorage', e);
    }
  }, [soundPreset, natureSettings, masterVolume, isMuted, playMode, tempoBpm, currentSong.id, combScaleId, fontZoom]);

  // Persist Custom and AI Songs to localStorage
  const persistCustomSongs = useCallback((songList: MusicBoxSong[]) => {
    try {
      const defaultIds = new Set(DEFAULT_SONGS.map((s) => s.id));
      const customAndAi = songList.filter((s) => !defaultIds.has(s.id) || s.isAiGenerated || s.category === 'custom');
      localStorage.setItem('musicbox_saved_songs', JSON.stringify(customAndAi));
      localStorage.setItem('musicbox_custom_songs', JSON.stringify(customAndAi));
    } catch (e) {
      console.warn('Could not save custom songs to localStorage', e);
    }
  }, []);

  // Refs for audio scheduling
  const isPlayingRef = useRef(isPlaying);
  const currentStepRef = useRef(currentStep);
  const currentSongRef = useRef(currentSong);
  const combScaleIdRef = useRef(combScaleId);
  const springTensionRef = useRef(springTension);
  const playModeRef = useRef(playMode);
  const tempoBpmRef = useRef(tempoBpm);
  const stepTimerRef = useRef<number | null>(null);
  const lastStepTimeRef = useRef<number>(0);
  const subStepRef = useRef<number>(0);

  const stepSubscribersRef = useRef<Set<(step: number) => void>>(new Set());
  const notifyStepSubscribers = useCallback((step: number) => {
    stepSubscribersRef.current.forEach(cb => cb(step));
  }, []);
  const handleSubscribeStep = useCallback((cb: (step: number) => void) => {
    stepSubscribersRef.current.add(cb);
    return () => { stepSubscribersRef.current.delete(cb); };
  }, []);

  const lastTensionSyncRef = useRef(0);

  // Synchronize refs
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    currentStepRef.current = currentStep;
    currentSongRef.current = currentSong;
    combScaleIdRef.current = combScaleId;
    springTensionRef.current = springTension;
    playModeRef.current = playMode;
    tempoBpmRef.current = tempoBpm;
  }, [isPlaying, currentStep, currentSong, combScaleId, springTension, playMode, tempoBpm]);

  // Apply audio settings on initial mount
  useEffect(() => {
    musicBoxAudio.applyChamberPreset(soundPreset);
    musicBoxAudio.updateNatureVolumes(natureSettings);
    musicBoxAudio.setMasterVolume(isMuted ? 0 : masterVolume);
  }, []);

  // Initialize audio engine on user interaction
  const ensureAudioInitialized = useCallback(async () => {
    await musicBoxAudio.resumeIfNeeded();
    musicBoxAudio.setMasterVolume(isMuted ? 0 : masterVolume);
  }, [isMuted, masterVolume]);

  const tineTimeoutMapRef = useRef<Map<number, number>>(new Map());

  // Cleanup tine timeouts on unmount
  useEffect(() => {
    return () => {
      tineTimeoutMapRef.current.forEach((tId) => clearTimeout(tId));
      tineTimeoutMapRef.current.clear();
    };
  }, []);

  const triggerTinesVibration = useCallback((tines: number[]) => {
    tines.forEach((tineIndex) => {
      const existing = tineTimeoutMapRef.current.get(tineIndex);
      if (existing) clearTimeout(existing);
    });

    setActiveTines((prev) => {
      const next = new Set(prev);
      tines.forEach((idx) => next.add(idx));
      return next;
    });

    tines.forEach((tineIndex) => {
      const tId = window.setTimeout(() => {
        tineTimeoutMapRef.current.delete(tineIndex);
        setActiveTines((prev) => {
          if (!prev.has(tineIndex)) return prev;
          const next = new Set(prev);
          next.delete(tineIndex);
          return next;
        });
      }, 120);
      tineTimeoutMapRef.current.set(tineIndex, tId);
    });
  }, []);

  // Handle single tine pluck (visual click, keyboard, or step trigger)
  const handlePluckTine = useCallback(
    async (tineIndex: number) => {
      await ensureAudioInitialized();
      const song = currentSongRef.current;
      const activeScale = COMB_SCALES_MAP[song.combScaleId || combScaleIdRef.current || 'romantic-flat'];
      const tinesList = activeScale ? activeScale.tines : ROMANTIC_FLAT_22_TINES;
      
      musicBoxAudio.playTine(tineIndex, 1.0, undefined, tinesList);
      triggerTinesVibration([tineIndex]);
    },
    [ensureAudioInitialized, triggerTinesVibration]
  );

  // Execute a step and play any pins at this step with flat scale support
  const executeStep = useCallback((step: number) => {
    const song = currentSongRef.current;
    const activeScale = COMB_SCALES_MAP[song.combScaleId || combScaleIdRef.current || 'romantic-flat'];
    const tinesList = activeScale ? activeScale.tines : ROMANTIC_FLAT_22_TINES;
    const pinsAtStep = song.pins.filter((p) => p.step === step);

    if (pinsAtStep.length > 0) {
      const hitTinesList: number[] = [];
      pinsAtStep.forEach((pin) => {
        hitTinesList.push(pin.tineIndex);
        if (pin.note) {
          musicBoxAudio.playNote(pin.note, 1.0);
        } else {
          musicBoxAudio.playTine(pin.tineIndex, 1.0, undefined, tinesList);
        }
      });

      triggerTinesVibration(hitTinesList);
    }
  }, [triggerTinesVibration]);

  // Tab visibility handling: pause non-essential audio and loop when tab is backgrounded
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        musicBoxAudio.setMechanicalHum(false);
      } else if (isPlayingRef.current) {
        musicBoxAudio.setMechanicalHum(true, tempoBpmRef.current / 90);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Main playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (stepTimerRef.current) {
        cancelAnimationFrame(stepTimerRef.current);
        stepTimerRef.current = null;
      }
      musicBoxAudio.setMechanicalHum(false);
      setCurrentStep(currentStepRef.current);
      setSpringTension(springTensionRef.current);
      return;
    }

    ensureAudioInitialized();
    musicBoxAudio.setMechanicalHum(true, tempoBpm / 90);
    lastStepTimeRef.current = performance.now();
    let lastTickTime = performance.now();
    const tickInterval = 1000 / 24; // 24 FPS throttled sequencer check

    const loop = (timestamp: number) => {
      if (!isPlayingRef.current) return;

      const tickElapsed = timestamp - lastTickTime;
      if (tickElapsed >= tickInterval) {
        lastTickTime = timestamp - (tickElapsed % tickInterval);

        const elapsed = timestamp - lastStepTimeRef.current;
        let speedFactor = 1.0;

        // Realistic spring unwinding physics
        if (playModeRef.current === 'spring') {
          const tension = springTensionRef.current;
          if (tension <= 0.0001) {
            setIsPlaying(false);
            musicBoxAudio.setMechanicalHum(false);
            return;
          }

          // In final ~10% tension, slow down with friction
          if (tension < 0.1) {
            speedFactor = Math.max(0.45, 0.45 + (tension / 0.1) * 0.55);
          }
        }

        const stepInterval = (60000 / tempoBpmRef.current / 4) / speedFactor;

        if (elapsed >= stepInterval) {
          lastStepTimeRef.current = timestamp;

          // Consume tension in spring mode (100% powers 3 full song rotations)
          if (playModeRef.current === 'spring') {
            const total = currentSongRef.current.totalSteps;
            const tensionPerStep = 1.0 / (3 * total);
            springTensionRef.current = Math.max(0, springTensionRef.current - tensionPerStep);
          }

          const total = currentSongRef.current.totalSteps;
          const nextStep = (currentStepRef.current + 1) % total;
          currentStepRef.current = nextStep;
          executeStep(nextStep);
          notifyStepSubscribers(nextStep);

          if (timestamp - lastTensionSyncRef.current > 500) {
            lastTensionSyncRef.current = timestamp;
            setSpringTension(springTensionRef.current);
            setCurrentStep(currentStepRef.current);
          }
        }
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

  // Cleanly switch play mode: cleanly stop current mode and restart target mode freshly
  const handleSwitchPlayMode = useCallback(
    async (newMode: PlayMode) => {
      // 1. CLEANLY STOP CURRENT MODE
      // Stop step sequencer timer animation frame
      if (stepTimerRef.current) {
        cancelAnimationFrame(stepTimerRef.current);
        stepTimerRef.current = null;
      }

      // Stop previous playback flag
      isPlayingRef.current = false;
      setIsPlaying(false);

      // Cleanly silence any active notes & stop mechanical gear hum immediately
      musicBoxAudio.stopAllMusicVoices();
      musicBoxAudio.setMechanicalHum(false, 1.0, true);

      // Clear active vibrating tines and reset crank RPM
      setActiveTines(new Set());
      setCrankRpm(0);

      // Align sub-step position cleanly to current integer step
      const currentIntStep = Math.floor(currentStepRef.current);
      subStepRef.current = currentIntStep;
      setCurrentStep(currentIntStep);

      // Update mode state and ref
      setPlayMode(newMode);
      playModeRef.current = newMode;

      // 2. RESTART TARGET MODE FRESHLY
      await ensureAudioInitialized();

      if (newMode === 'continuous') {
        // Continuous mode: Freshly start automated playback
        lastStepTimeRef.current = performance.now();
        isPlayingRef.current = true;
        setIsPlaying(true);
        musicBoxAudio.setMechanicalHum(true, tempoBpmRef.current / 90);
        showToast('Switched to Continuous Mode • Automated drive started', 'info');
      } else if (newMode === 'spring') {
        // Wind-Up Spring mode: If tension is depleted or low (< 0.15), freshly wind to full 3 rounds (1.0)
        let tension = springTensionRef.current;
        if (tension < 0.15) {
          tension = 1.0;
          setSpringTension(1.0);
          springTensionRef.current = 1.0;
        }
        lastStepTimeRef.current = performance.now();
        isPlayingRef.current = true;
        setIsPlaying(true);
        musicBoxAudio.setMechanicalHum(true, tempoBpmRef.current / 90);
        showToast('Switched to Wind-Up Spring • Spring drive started', 'info');
      } else if (newMode === 'crank') {
        // Hand Crank mode: Ready for manual tactile cranking
        isPlayingRef.current = false;
        setIsPlaying(false);
        musicBoxAudio.setMechanicalHum(false);
        showToast('Switched to Hand Crank • Turn knob to play', 'info');
      }
    },
    [ensureAudioInitialized, showToast]
  );

  // Handle Play/Pause
  const handleTogglePlay = async () => {
    await ensureAudioInitialized();
    if (!isPlaying) {
      if (playMode === 'spring' && springTension <= 0.005) {
        // Automatically wind spring if user presses play at 0%
        setSpringTension(1.0);
        springTensionRef.current = 1.0;
      }
      lastStepTimeRef.current = performance.now();
      isPlayingRef.current = true;
      setIsPlaying(true);
      musicBoxAudio.setMechanicalHum(true, tempoBpm / 90);
    } else {
      isPlayingRef.current = false;
      setIsPlaying(false);
      musicBoxAudio.stopAllMusicVoices();
      musicBoxAudio.setMechanicalHum(false, 1.0, true);
      setActiveTines(new Set());
      setCurrentStep(currentStepRef.current);
      setSpringTension(springTensionRef.current);
    }
  };

  // Rewind to step 0
  const handleRewind = () => {
    setCurrentStep(0);
    currentStepRef.current = 0;
    subStepRef.current = 0;
  };

  // Winding action
  const handleWindSpring = (added: number) => {
    ensureAudioInitialized();
    setSpringTension((prev) => Math.min(1.0, Math.max(0, prev + added)));
  };

  const handleSetSpringTension = (tension: number) => {
    ensureAudioInitialized();
    setSpringTension(Math.min(1.0, Math.max(0, tension)));
  };

  // Smooth Hand-Crank advance
  const handleManualCrankAdvance = useCallback(
    (deltaAngle: number, currentRpm: number) => {
      ensureAudioInitialized();
      setCrankRpm(currentRpm);

      if (currentRpm > 0.8) {
        musicBoxAudio.setMechanicalHum(true, Math.min(1.2, currentRpm / 60));
      } else {
        musicBoxAudio.setMechanicalHum(false);
      }

      if (deltaAngle <= 0) return;

      const total = currentSongRef.current.totalSteps;
      const stepsPerRadian = total / (Math.PI * 2 * 4.0);
      const deltaSteps = deltaAngle * stepsPerRadian;

      const prevPos = subStepRef.current;
      const newPos = prevPos + deltaSteps;
      subStepRef.current = newPos;

      const smoothStep = ((newPos % total) + total) % total;
      currentStepRef.current = smoothStep;
      notifyStepSubscribers(smoothStep);
      if (currentRpm <= 0) {
        setCurrentStep(smoothStep);
      }

      const startInt = Math.floor(prevPos);
      const endInt = Math.floor(newPos);

      if (endInt > startInt) {
        const activeHitTines = new Set<number>();
        const audioTimeBase = musicBoxAudio.getAudioTime();
        const stepSpan = Math.max(0.001, newPos - prevPos);

        for (let s = startInt + 1; s <= endInt; s++) {
          const targetStep = ((s % total) + total) % total;
          const pinsAtStep = currentSongRef.current.pins.filter((p) => p.step === targetStep);

          if (pinsAtStep.length > 0) {
            const frac = Math.min(1, Math.max(0, (s - prevPos) / stepSpan));
            const schedTime = audioTimeBase + frac * 0.016;
            const velocity = Math.min(1.0, Math.max(0.45, 0.45 + (currentRpm / 65) * 0.55));

            pinsAtStep.forEach((pin) => {
              activeHitTines.add(pin.tineIndex);
              musicBoxAudio.playTine(pin.tineIndex, velocity, schedTime);
            });
          }
        }

        if (activeHitTines.size > 0) {
          setActiveTines(activeHitTines);
          setTimeout(() => {
            setActiveTines(new Set());
          }, 130);
        }
      }
    },
    [ensureAudioInitialized]
  );

  // Toggle pin in editor & sync with storage
  const handleTogglePin = useCallback((step: number, tineIndex: number) => {
    ensureAudioInitialized();
    musicBoxAudio.playTine(tineIndex, 0.8);

    setCurrentSong((prevSong) => {
      const exists = prevSong.pins.some((p) => p.step === step && p.tineIndex === tineIndex);
      const newPins = exists
        ? prevSong.pins.filter((p) => !(p.step === step && p.tineIndex === tineIndex))
        : [...prevSong.pins, { step, tineIndex }];

      const updatedSong = { ...prevSong, pins: newPins };

      setSongs((prevSongs) => {
        const updatedSongs = prevSongs.map((s) => (s.id === updatedSong.id ? updatedSong : s));
        persistCustomSongs(updatedSongs);
        return updatedSongs;
      });

      return updatedSong;
    });
  }, [ensureAudioInitialized, persistCustomSongs]);

  // Clear all pins
  const handleClearPins = useCallback(() => {
    setCurrentSong((prevSong) => {
      const updated = { ...prevSong, pins: [] };
      setSongs((prevSongs) => {
        const updatedSongs = prevSongs.map((s) => (s.id === updated.id ? updated : s));
        persistCustomSongs(updatedSongs);
        return updatedSongs;
      });
      return updated;
    });
  }, [persistCustomSongs]);

  // Shift pins
  const handleShiftPins = useCallback((delta: number) => {
    setCurrentSong((prevSong) => {
      const total = prevSong.totalSteps;
      const shiftedPins = prevSong.pins.map((p) => ({
        ...p,
        step: ((p.step + delta) % total + total) % total,
      }));
      const updated = { ...prevSong, pins: shiftedPins };
      setSongs((prevSongs) => {
        const updatedSongs = prevSongs.map((s) => (s.id === updated.id ? updated : s));
        persistCustomSongs(updatedSongs);
        return updatedSongs;
      });
      return updated;
    });
  }, [persistCustomSongs]);

  // Centralized comb scale changer (Movement tab, keyboard pills, editor, and library)
  const handleChangeCombScale = useCallback((newScaleId: CombScaleId) => {
    setCombScaleId(newScaleId);
    combScaleIdRef.current = newScaleId;
    setCurrentSong((prevSong) => {
      const updatedSong: MusicBoxSong = {
        ...prevSong,
        combScaleId: newScaleId,
      };
      setSongs((prevSongs) => {
        const updatedSongs = prevSongs.map((s) => (s.id === updatedSong.id ? updatedSong : s));
        persistCustomSongs(updatedSongs);
        return updatedSongs;
      });
      return updatedSong;
    });
    const scaleInfo = COMB_SCALES_MAP[newScaleId];
    showToast(`Switched comb to ${scaleInfo?.shortLabel || scaleInfo?.name || newScaleId} (${scaleInfo?.tinesCount} Tines • ${scaleInfo?.rangeLabel})`, 'info');
  }, [persistCustomSongs, showToast]);

  // Select song from library
  const handleSelectSong = useCallback((song: MusicBoxSong) => {
    setCurrentSong(song);
    if (song.combScaleId) {
      setCombScaleId(song.combScaleId);
    }
    setTempoBpm(song.tempoBpm || 88);
    setCurrentStep(0);
    currentStepRef.current = 0;
    subStepRef.current = 0;
  }, []);

  // Play song directly from music card: go to Mechanical Movement panel and proceed with previous play mode
  const handlePlaySong = useCallback(
    async (song: MusicBoxSong) => {
      // 1. Initialize audio context
      await ensureAudioInitialized();

      // 2. Silence any currently ringing notes & clear vibrating tines
      musicBoxAudio.stopAllMusicVoices();
      setActiveTines(new Set());
      setCrankRpm(0);

      // 3. Update song, scale, tempo & step
      setCurrentSong(song);
      currentSongRef.current = song;
      if (song.combScaleId) {
        setCombScaleId(song.combScaleId);
        combScaleIdRef.current = song.combScaleId;
      }
      const songTempo = song.tempoBpm || 88;
      setTempoBpm(songTempo);
      tempoBpmRef.current = songTempo;
      setCurrentStep(0);
      currentStepRef.current = 0;
      subStepRef.current = 0;
      lastStepTimeRef.current = performance.now();

      // 4. Switch to Mechanical Movement panel
      setActiveTab('movement');

      // 5. Proceed as previous play mode
      let currentMode = playModeRef.current;
      if (currentMode === 'crank') {
        currentMode = 'spring';
        setPlayMode('spring');
        playModeRef.current = 'spring';
      }

      if (currentMode === 'spring') {
        if (springTensionRef.current < 0.15) {
          setSpringTension(1.0);
          springTensionRef.current = 1.0;
        }
      }

      musicBoxAudio.setMechanicalHum(true, songTempo / 90);
      isPlayingRef.current = true;
      setIsPlaying(true);
      executeStep(0);
      notifyStepSubscribers(0);

      showToast(
        `Playing "${song.title}" in ${currentMode === 'spring' ? 'Wind-Up Spring' : 'Continuous'} mode`,
        'success'
      );
    },
    [ensureAudioInitialized, executeStep, notifyStepSubscribers, showToast]
  );

  // Save new / AI-generated song
  const handleLoadNewSong = useCallback((song: MusicBoxSong) => {
    setSongs((prevSongs) => {
      const newSongList = [song, ...prevSongs.filter((s) => s.id !== song.id)];
      persistCustomSongs(newSongList);
      return newSongList;
    });
    if (song.combScaleId) {
      setCombScaleId(song.combScaleId);
    }
    setCurrentSong(song);
    setTempoBpm(song.tempoBpm || 88);
    setCurrentStep(0);
    currentStepRef.current = 0;
    subStepRef.current = 0;
    setActiveTab('movement');
    const modelTag = song.modelUsed ? ` • ${song.modelUsed}` : '';
    showToast(`Loaded "${song.title}"${modelTag} into cylinder`, 'success');
  }, [persistCustomSongs, showToast]);

  // Delete custom song
  const handleDeleteCustomSong = useCallback((songId: string) => {
    setSongs((prevSongs) => {
      const newSongList = prevSongs.filter((s) => s.id !== songId);
      persistCustomSongs(newSongList);

      setCurrentSong((prevCurrent) => {
        if (prevCurrent.id === songId) {
          const fallback = newSongList[0] || DEFAULT_SONGS[0];
          setTempoBpm(fallback.tempoBpm || 88);
          return fallback;
        }
        return prevCurrent;
      });

      return newSongList;
    });
    showToast('Deleted melody from library', 'info');
  }, [persistCustomSongs, showToast]);

  // Batch import songs
  const handleBatchImportSongs = useCallback((importedSongs: MusicBoxSong[], overwrite = false) => {
    setSongs((prevSongs) => {
      let newSongList: MusicBoxSong[];
      if (overwrite) {
        newSongList = [...DEFAULT_SONGS, ...importedSongs];
      } else {
        const existingIds = new Set(prevSongs.map((s) => s.id));
        const filteredNew = importedSongs.map((s, idx) => {
          if (existingIds.has(s.id)) {
            return { ...s, id: `imported-${Date.now()}-${idx}` };
          }
          return s;
        });
        newSongList = [...filteredNew, ...prevSongs];
      }
      persistCustomSongs(newSongList);
      return newSongList;
    });

    if (importedSongs.length > 0) {
      setCurrentSong(importedSongs[0]);
      setTempoBpm(importedSongs[0].tempoBpm || 88);
      setCurrentStep(0);
    }
  }, [persistCustomSongs]);

  // Apply partial settings from imported bundle
  const handleApplySettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    if (newSettings.soundPreset) {
      setSoundPreset(newSettings.soundPreset);
      musicBoxAudio.applyChamberPreset(newSettings.soundPreset);
    }
    if (newSettings.natureSettings) {
      setNatureSettings(newSettings.natureSettings);
      musicBoxAudio.updateNatureVolumes(newSettings.natureSettings);
    }
    if (typeof newSettings.masterVolume === 'number') {
      setMasterVolume(newSettings.masterVolume);
      if (!isMuted) musicBoxAudio.setMasterVolume(newSettings.masterVolume);
    }
    if (typeof newSettings.fontZoom === 'number') {
      setFontZoom(Math.max(75, Math.min(150, newSettings.fontZoom)));
    }
    if (newSettings.playMode) {
      handleSwitchPlayMode(newSettings.playMode);
    }
  }, [handleSwitchPlayMode, isMuted]);

  // RESTORE DEFAULTS: 1. Full Factory Reset
  const handleRestoreAllDefaults = useCallback(() => {
    localStorage.removeItem('musicbox_saved_songs');
    localStorage.removeItem('musicbox_custom_songs');
    localStorage.removeItem('musicbox_user_settings');

    setSongs(DEFAULT_SONGS);
    setCurrentSong(DEFAULT_SONGS[0]);
    setTempoBpm(DEFAULT_SONGS[0].tempoBpm || 88);
    setSoundPreset('gold-sankyo');
    setNatureSettings(DEFAULT_NATURE_SETTINGS);
    setMasterVolume(0.9);
    setIsMuted(false);
    setPlayMode('spring');
    setSpringTension(1.0);
    setFontZoom(100);
    setCurrentStep(0);
    setIsPlaying(false);

    musicBoxAudio.applyChamberPreset('gold-sankyo');
    musicBoxAudio.updateNatureVolumes(DEFAULT_NATURE_SETTINGS);
    musicBoxAudio.setMasterVolume(0.9);
  }, []);

  // RESTORE DEFAULTS: 2. Songs Only
  const handleRestoreSongsDefault = useCallback(() => {
    localStorage.removeItem('musicbox_saved_songs');
    localStorage.removeItem('musicbox_custom_songs');

    setSongs(DEFAULT_SONGS);
    setCurrentSong(DEFAULT_SONGS[0]);
    setTempoBpm(DEFAULT_SONGS[0].tempoBpm || 88);
    setCurrentStep(0);
  }, []);

  // RESTORE DEFAULTS: 3. Settings Only
  const handleRestoreSettingsDefault = useCallback(() => {
    setSoundPreset('gold-sankyo');
    setNatureSettings(DEFAULT_NATURE_SETTINGS);
    setMasterVolume(0.9);
    setIsMuted(false);
    setPlayMode('spring');
    setFontZoom(100);

    musicBoxAudio.applyChamberPreset('gold-sankyo');
    musicBoxAudio.updateNatureVolumes(DEFAULT_NATURE_SETTINGS);
    musicBoxAudio.setMasterVolume(0.9);
  }, []);

  // Volume & Sound preset handlers
  const handleChangeSoundPreset = useCallback(async (preset: SoundChamberPreset) => {
    setSoundPreset(preset);
    await ensureAudioInitialized();
    musicBoxAudio.applyChamberPreset(preset);
  }, [ensureAudioInitialized]);

  const handleChangeNature = useCallback(async (settings: NatureAmbienceSettings) => {
    setNatureSettings(settings);
    await ensureAudioInitialized();
    musicBoxAudio.updateNatureVolumes(settings);
  }, [ensureAudioInitialized]);

  const handleChangeMasterVolume = useCallback(async (vol: number) => {
    setMasterVolume(vol);
    await ensureAudioInitialized();
    if (!isMuted) {
      musicBoxAudio.setMasterVolume(vol);
    }
  }, [ensureAudioInitialized, isMuted]);

  const handleToggleMute = useCallback(async () => {
    await ensureAudioInitialized();
    setIsMuted((prevMuted) => {
      const nextMuted = !prevMuted;
      musicBoxAudio.setMasterVolume(nextMuted ? 0 : masterVolume);
      return nextMuted;
    });
  }, [ensureAudioInitialized, masterVolume]);

  // Font Zoom Handlers (-/+)
  const handleZoomIn = useCallback(() => {
    setFontZoom((prev) => {
      const next = Math.min(150, prev + 10);
      showToast(`Font Zoom: ${next}%`, 'info');
      return next;
    });
  }, [showToast]);

  const handleZoomOut = useCallback(() => {
    setFontZoom((prev) => {
      const next = Math.max(75, prev - 10);
      showToast(`Font Zoom: ${next}%`, 'info');
      return next;
    });
  }, [showToast]);

  const handleZoomReset = useCallback(() => {
    setFontZoom(100);
    showToast('Font Zoom reset to 100%', 'info');
  }, [showToast]);

  // Total custom or AI melodies count
  const customOrAiCount = songs.filter((s) => s.category === 'custom' || s.isAiGenerated || s.category === 'ai').length;

  return (
    <div
      style={{
        fontSize: `${fontZoom}%`,
      }}
      className="min-h-screen bg-[#f7f4ec] text-[#2d2419] flex flex-col justify-between selection:bg-[#bfa175]/30 selection:text-[#2d2419] transition-[font-size] duration-150"
    >
      {/* Top App Header */}
      <header className="w-full border-b border-[#e5dcce] bg-[#fcfbf8]/95 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-8 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2 shadow-[0_2px_12px_rgba(67,52,34,0.04)]">
        {/* Brand Title */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-[#a68656] via-[#d6be8e] to-[#f4eedf] p-[1px] shadow-xs flex items-center justify-center">
            <div className="w-full h-full rounded-xl bg-[#fcfbf8] flex items-center justify-center text-[#8e6d3c]">
              <Music className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h1 className="font-serif font-bold text-sm sm:text-lg text-[#433422] tracking-wide leading-none">
              Mechanical Music Box
            </h1>
            <p className="text-[10px] sm:text-[11px] text-[#84735c] mt-0.5 font-serif-sub">
              18-Note Movement • Browser Storage Active
            </p>
          </div>
        </div>

        {/* Top Header Actions: Font Zoom -/+, Backup/Import, AI Compose, Volume */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5">
          {/* FONT ZOOM CONTROLS (- / +) */}
          <div
            className="flex items-center space-x-0.5 p-1 rounded-xl bg-[#f4eee4] border border-[#ded3be] shadow-2xs text-xs font-serif"
            title="Adjust Application Font Zoom Level"
          >
            <button
              id="zoom-out-btn"
              onClick={handleZoomOut}
              disabled={fontZoom <= 75}
              className="p-1 rounded-lg hover:bg-[#e6dccb] disabled:opacity-35 text-[#5e4c36] transition"
              title="Zoom out font (-10%)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              id="zoom-reset-btn"
              onClick={handleZoomReset}
              className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold text-[#6e5838] hover:bg-[#e6dccb] transition"
              title="Click to reset font zoom to 100%"
            >
              {fontZoom}%
            </button>

            <button
              id="zoom-in-btn"
              onClick={handleZoomIn}
              disabled={fontZoom >= 150}
              className="p-1 rounded-lg hover:bg-[#e6dccb] disabled:opacity-35 text-[#5e4c36] transition"
              title="Zoom in font (+10%)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Backup / Export / Import / Restore Trigger */}
          <button
            id="header-import-export-btn"
            onClick={() => setIsImportExportModalOpen(true)}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] text-xs font-serif font-semibold flex items-center space-x-1.5 transition shadow-2xs"
            title="Export, Import, Backup & Restore music & settings"
          >
            <FolderArchive className="w-3.5 h-3.5 text-[#8a765e]" />
            <span className="hidden sm:inline">Backup & Import</span>
            <span className="sm:hidden">Data</span>
            {customOrAiCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#ebd7ba] text-[#7a4f15] text-[10px] font-mono">
                {customOrAiCount}
              </span>
            )}
          </button>

          {/* Gemini AI Compose Action - only accessible when API key is set in environment */}
          {hasAiComposer && (
            <button
              id="header-gemini-compose-btn"
              onClick={() => setIsGeminiModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#c4a675] via-[#dfcd9f] to-[#b8955e] hover:from-[#bfa170] hover:to-[#ae8b54] text-[#2d2419] text-xs font-serif font-bold flex items-center space-x-1.5 shadow-xs transition-all hover:scale-[1.02] active:scale-[0.98] border border-[#ae8b54]/40"
            >
              <Sparkles className="w-3.5 h-3.5 fill-[#2d2419]" />
              <span className="hidden sm:inline">AI Compose</span>
              <span className="sm:hidden">AI</span>
            </button>
          )}

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

      {/* Floating Toast Message Banner */}
      {toast && (
        <div className="fixed top-16 right-4 sm:right-8 z-50 animate-in fade-in slide-in-from-top-2">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-lg border flex items-center space-x-2 text-xs font-serif ${
              toast.type === 'success'
                ? 'bg-[#f4faee] border-[#bfe2a8] text-[#3c6b22]'
                : toast.type === 'warn'
                ? 'bg-[#fdf4f2] border-[#f4c8c2] text-[#9c3826]'
                : 'bg-[#f7f3ea] border-[#decbb0] text-[#5e4c36]'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#5e9638]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#a66b38]" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-6 lg:p-8 space-y-5 sm:space-y-6">
        {/* Active Song Banner & Controls */}
        <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_4px_24px_rgba(67,52,34,0.06)]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Category tag (omitted if AI to avoid redundancy with Model badge) */}
              {!(currentSong.isAiGenerated || currentSong.category === 'ai' || currentSong.modelUsed) && (
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-[#f4efe4] text-[#8a6b3e] border border-[#d8caa8]">
                  {currentSong.category.toUpperCase()}
                </span>
              )}
              {/* Gemini / AI Model Badge */}
              {(currentSong.isAiGenerated || currentSong.category === 'ai' || currentSong.modelUsed) && (
                <span className="text-xs font-serif px-2 py-0.5 rounded bg-[#ebd7ba] text-[#7a4f15] border border-[#d6be8e] flex items-center gap-1 font-semibold">
                  <Sparkles className="w-3 h-3 text-[#8a6b3e]" />
                  {formatModelDisplayName(currentSong.modelUsed, true)}
                </span>
              )}
              {/* Comb Scale Badge */}
              <span
                className="text-[11px] font-sans px-2 py-0.5 rounded bg-[#f5efe3] text-[#7a5c2e] border border-[#ded3be] font-medium flex items-center gap-1"
                title={`Comb Profile: ${COMB_SCALES_MAP[currentSong.combScaleId || combScaleId]?.name || 'Romantic Flat'} (${COMB_SCALES_MAP[currentSong.combScaleId || combScaleId]?.tinesCount || 22} Tines)`}
              >
                <Sliders className="w-3 h-3 text-[#bfa175]" />
                {COMB_SCALES_MAP[currentSong.combScaleId || combScaleId]?.shortLabel || 'Romantic Flat 22N'} ({COMB_SCALES_MAP[currentSong.combScaleId || combScaleId]?.rangeLabel || 'C5–Bb6'})
              </span>
              {/* Step / Measure Badge */}
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#f0e9dc] text-[#6e5838] border border-[#ded3be] font-medium">
                {currentSong.totalSteps || 64} Steps ({Math.max(1, Math.round((currentSong.totalSteps || 64) / 16))}m)
              </span>
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
                min="40"
                max="160"
                step="2"
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

        {/* Tab 1: Mechanical Movement (The Music Box Movement) */}
        {activeTab === 'movement' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Quick Acoustic Chamber Selector Bar */}
            <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: SOUND_CHAMBER_PRESETS[soundPreset]?.color || '#a68656' }}
                />
                <span className="text-xs font-serif font-bold text-[#433422]">
                  Sound Chamber:
                </span>
                <span className="text-xs font-serif text-[#8a6b3e] font-semibold">
                  {SOUND_CHAMBER_PRESETS[soundPreset]?.name}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {(Object.keys(SOUND_CHAMBER_PRESETS) as SoundChamberPreset[]).map((presetKey) => {
                  const preset = SOUND_CHAMBER_PRESETS[presetKey];
                  const isSelected = soundPreset === presetKey;
                  return (
                    <button
                      key={preset.id}
                      id={`quick-chamber-${preset.id}`}
                      onClick={() => handleChangeSoundPreset(presetKey)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-serif font-medium border transition-all ${
                        isSelected
                          ? 'bg-[#433422] text-[#fbf8f2] border-[#433422] shadow-xs'
                          : 'bg-[#f8f5ee] hover:bg-[#eae2d3] text-[#6f5e49] border-[#ded3be]'
                      }`}
                    >
                      {preset.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            <MusicBoxMovement
              currentStep={currentStep}
              totalSteps={currentSong.totalSteps}
              pins={currentSong.pins}
              isPlaying={isPlaying}
              tempoBpm={tempoBpm}
              playMode={playMode}
              springTension={springTension}
              activeTines={activeTines}
              crankRpm={crankRpm}
              combScaleId={currentSong.combScaleId || combScaleId}
              customTines={currentSong.customTines}
              onChangeCombScale={handleChangeCombScale}
              onPluckTine={handlePluckTine}
              onSubscribeStep={handleSubscribeStep}
            />

            {/* Winding Controls Component */}
            <WindingKey
              playMode={playMode}
              onChangePlayMode={handleSwitchPlayMode}
              springTension={springTension}
              onWindSpring={handleWindSpring}
              onSetSpringTension={handleSetSpringTension}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onManualCrankAdvance={handleManualCrankAdvance}
              onRewind={handleRewind}
              tempoBpm={tempoBpm}
              onChangeTempoBpm={setTempoBpm}
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
              combScaleId={currentSong.combScaleId || combScaleId}
              customTines={currentSong.customTines}
              onSubscribeStep={handleSubscribeStep}
              onChangeCombScale={handleChangeCombScale}
              onTogglePin={handleTogglePin}
              onClearAll={handleClearPins}
              onShiftPins={handleShiftPins}
              onPluckTine={handlePluckTine}
            />

            {/* Winding & Play controls also accessible under Editor */}
            <WindingKey
              playMode={playMode}
              onChangePlayMode={handleSwitchPlayMode}
              springTension={springTension}
              onWindSpring={handleWindSpring}
              onSetSpringTension={handleSetSpringTension}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onManualCrankAdvance={handleManualCrankAdvance}
              onRewind={handleRewind}
              tempoBpm={tempoBpm}
              onChangeTempoBpm={setTempoBpm}
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
              isPlaying={isPlaying}
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
              onPlaySong={handlePlaySong}
              onImportSong={handleLoadNewSong}
              onDeleteCustomSong={handleDeleteCustomSong}
              onOpenGeminiModal={() => hasAiComposer && setIsGeminiModalOpen(true)}
              onOpenImportExportModal={() => setIsImportExportModalOpen(true)}
              hasAiComposer={hasAiComposer}
            />
          </div>
        )}
      </main>

      {/* Footer with Quick Restore Link */}
      <footer className="w-full border-t border-[#e5dcce] py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#8c7b67] font-serif-sub">
        <span>
          Classic 18-Note Mechanical Music Box • Sankyo Acoustic Model
          {hasAiComposer ? ' • Gemini AI Compositions' : ''}
        </span>
        <button
          onClick={() => setIsImportExportModalOpen(true)}
          className="hover:text-[#433422] underline underline-offset-2 transition"
        >
          Backup, Export & Restore to Default
        </button>
      </footer>

      {/* Gemini AI Composer Modal - only mounted if API is enabled */}
      {hasAiComposer && (
        <GeminiComposerModal
          isOpen={isGeminiModalOpen}
          onClose={() => setIsGeminiModalOpen(false)}
          onLoadSong={handleLoadNewSong}
          hasAiComposer={hasAiComposer}
          requiresPasscode={requiresPasscode}
          initialCombScaleId={combScaleId}
        />
      )}

      {/* Repertoire, Backup, Export, Import & Restore Modal */}
      <ImportExportModal
        isOpen={isImportExportModalOpen}
        onClose={() => setIsImportExportModalOpen(false)}
        currentSong={currentSong}
        allSongs={songs}
        userSettings={{
          soundPreset,
          natureSettings,
          masterVolume,
          isMuted,
          playMode,
          tempoBpm,
          currentSongId: currentSong.id,
          fontZoom,
        }}
        onImportSongs={handleBatchImportSongs}
        onApplySettings={handleApplySettings}
        onRestoreAllDefaults={handleRestoreAllDefaults}
        onRestoreSongsDefault={handleRestoreSongsDefault}
        onRestoreSettingsDefault={handleRestoreSettingsDefault}
        showToast={showToast}
      />
    </div>
  );
}
