import React from 'react';
import { NatureAmbienceSettings, SoundChamberPreset } from '../types';
import { CloudRain, Flame, Trees, Bell, Waves, Volume2, Sparkles } from 'lucide-react';

interface NatureAmbianceMixerProps {
  settings: NatureAmbienceSettings;
  onChangeSettings: (settings: NatureAmbienceSettings) => void;
  soundPreset: SoundChamberPreset;
  onChangeSoundPreset: (preset: SoundChamberPreset) => void;
  masterVolume: number;
  onChangeMasterVolume: (vol: number) => void;
}

export const NatureAmbianceMixer: React.FC<NatureAmbianceMixerProps> = ({
  settings,
  onChangeSettings,
  soundPreset,
  onChangeSoundPreset,
  masterVolume,
  onChangeMasterVolume,
}) => {
  const handleSlider = (key: keyof NatureAmbienceSettings, val: number) => {
    onChangeSettings({
      ...settings,
      [key]: val,
    });
  };

  const applyPreset = (preset: {
    rain: number;
    fire: number;
    forest: number;
    windChime: number;
    stream: number;
  }) => {
    onChangeSettings(preset);
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-6 shadow-[0_4px_24px_rgba(67,52,34,0.06)] text-[#2d2419] space-y-6">
      {/* Sound Chamber & Master Volume Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-5 border-b border-[#e5dcce]">
        {/* Sound Chamber Preset */}
        <div>
          <label className="text-xs uppercase font-serif tracking-wider text-[#8a6b3e] font-semibold mb-2 block flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#8a6b3e]" />
            <span>Acoustic Sound Chamber</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'gold-sankyo', name: 'Gold Sankyo', desc: 'Bright crisp metallic chime' },
              { id: 'wooden-box', name: 'Mahogany Box', desc: 'Warm deep wood resonance' },
              { id: 'crystal-bell', name: 'Crystal Bell', desc: 'Ethereal celestial shimmer' },
              { id: 'vintage-antique', name: 'Vintage Antique', desc: 'Nostalgic tape warmth' },
            ].map((p) => (
              <button
                key={p.id}
                id={`chamber-preset-${p.id}`}
                onClick={() => onChangeSoundPreset(p.id as SoundChamberPreset)}
                className={`p-2 rounded-xl text-left border transition-all ${
                  soundPreset === p.id
                    ? 'bg-[#433422] border-[#433422] text-[#fbf8f2] shadow-xs'
                    : 'bg-[#f8f5ee] border-[#ded3be] text-[#6f5e49] hover:text-[#2d2419] hover:border-[#bfa175]'
                }`}
              >
                <div className="text-xs font-serif font-semibold">{p.name}</div>
                <div className={`text-[10px] truncate ${soundPreset === p.id ? 'text-[#d8caa8]' : 'text-[#8a765e]'}`}>{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Master Audio Volume */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-serif uppercase tracking-wider text-[#8a6b3e] font-semibold flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-[#8a6b3e]" />
                <span>Master Volume</span>
              </span>
              <span className="font-mono text-[#8a6b3e] font-bold">{Math.round(masterVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => onChangeMasterVolume(parseFloat(e.target.value))}
              className="w-full accent-[#8a6b3e] cursor-pointer h-2 bg-[#eae2d3] rounded-lg appearance-none border border-[#ded3be]"
            />
          </div>

          {/* Quick Atmosphere Shortcuts */}
          <div className="mt-3">
            <span className="text-[11px] text-[#8a765e] uppercase tracking-wider block mb-1.5 font-serif font-semibold">
              Relaxing Ambiance Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => applyPreset({ rain: 0.6, fire: 0, forest: 0.1, windChime: 0.2, stream: 0 })}
                className="px-2.5 py-1 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] text-[11px] font-serif border border-[#ded3be] transition shadow-2xs"
              >
                🌧️ Rainy Evening
              </button>
              <button
                onClick={() => applyPreset({ rain: 0, fire: 0.7, forest: 0, windChime: 0.3, stream: 0 })}
                className="px-2.5 py-1 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] text-[11px] font-serif border border-[#ded3be] transition shadow-2xs"
              >
                🔥 Cozy Fireplace
              </button>
              <button
                onClick={() => applyPreset({ rain: 0, fire: 0, forest: 0.6, windChime: 0.4, stream: 0.5 })}
                className="px-2.5 py-1 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] text-[11px] font-serif border border-[#ded3be] transition shadow-2xs"
              >
                🌿 Forest Stream
              </button>
              <button
                onClick={() => applyPreset({ rain: 0, fire: 0, forest: 0, windChime: 0, stream: 0 })}
                className="px-2.5 py-1 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] text-[#8a765e] text-[11px] font-serif border border-[#ded3be] transition shadow-2xs"
              >
                🔇 Pure Music Box
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nature Soundscape Mixers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase font-serif tracking-wider text-[#8a6b3e] font-semibold flex items-center gap-1.5">
            <Trees className="w-3.5 h-3.5 text-[#8a6b3e]" />
            <span>Nature & Calming Sound Layers</span>
          </span>
          <span className="text-[11px] text-[#8a765e] font-serif-sub italic">Blended seamlessly with mechanical music</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Rain */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <CloudRain className="w-3.5 h-3.5 text-[#5889a7]" />
                <span>Soft Rain</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">{Math.round(settings.rain * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.rain}
              onChange={(e) => handleSlider('rain', parseFloat(e.target.value))}
              className="w-full accent-[#5889a7] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>

          {/* Fire */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <Flame className="w-3.5 h-3.5 text-[#a8583b]" />
                <span>Hearth Fire</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">{Math.round(settings.fire * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.fire}
              onChange={(e) => handleSlider('fire', parseFloat(e.target.value))}
              className="w-full accent-[#a8583b] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>

          {/* Forest & Birds */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <Trees className="w-3.5 h-3.5 text-[#5b804e]" />
                <span>Forest Breeze</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">{Math.round(settings.forest * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.forest}
              onChange={(e) => handleSlider('forest', parseFloat(e.target.value))}
              className="w-full accent-[#5b804e] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>

          {/* Wind Chimes */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <Bell className="w-3.5 h-3.5 text-[#8b6598]" />
                <span>Wind Chimes</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">{Math.round(settings.windChime * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.windChime}
              onChange={(e) => handleSlider('windChime', parseFloat(e.target.value))}
              className="w-full accent-[#8b6598] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>

          {/* Stream */}
          <div className="p-3 rounded-xl bg-[#f8f5ee] border border-[#ded3be] space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#433422] font-serif">
                <Waves className="w-3.5 h-3.5 text-[#4e8e9c]" />
                <span>Mountain Stream</span>
              </span>
              <span className="font-mono text-[#8a765e] text-[11px]">{Math.round(settings.stream * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={settings.stream}
              onChange={(e) => handleSlider('stream', parseFloat(e.target.value))}
              className="w-full accent-[#4e8e9c] cursor-pointer h-1.5 bg-[#eae2d3] rounded-lg appearance-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
