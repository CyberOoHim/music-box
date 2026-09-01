import React, { useState } from 'react';
import { MusicBoxSong } from '../types';
import {
  Music,
  Sparkles,
  Download,
  Upload,
  Trash2,
  Search,
  Check,
  FolderArchive,
  RotateCcw,
  Play,
} from 'lucide-react';

interface SongLibraryProps {
  songs: MusicBoxSong[];
  currentSongId: string;
  onSelectSong: (song: MusicBoxSong) => void;
  onPlaySong?: (song: MusicBoxSong) => void;
  onDeleteCustomSong?: (songId: string) => void;
  onImportSong: (song: MusicBoxSong) => void;
  onOpenGeminiModal?: () => void;
  onOpenImportExportModal?: () => void;
  hasAiComposer?: boolean;
}

export const SongLibrary: React.FC<SongLibraryProps> = ({
  songs,
  currentSongId,
  onSelectSong,
  onPlaySong,
  onDeleteCustomSong,
  onImportSong,
  onOpenGeminiModal,
  onOpenImportExportModal,
  hasAiComposer = false,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredSongs = songs.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'all' ||
      s.category === selectedCategory ||
      (selectedCategory === 'ai' && (s.isAiGenerated || s.category === 'ai')) ||
      (selectedCategory === 'custom' && (s.category === 'custom' || s.id.startsWith('custom-') || s.id.startsWith('imported-')));
    return matchesSearch && matchesCategory;
  });

  // Export current active song or any song to JSON file
  const handleExport = (song: MusicBoxSong, e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([JSON.stringify(song, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `${song.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_musicbox.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const customOrAiCount = songs.filter((s) => s.category === 'custom' || s.isAiGenerated || s.category === 'ai').length;

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl bg-[#fcfbf8] border border-[#e5dcce] p-4 sm:p-6 shadow-[0_4px_24px_rgba(67,52,34,0.06)] text-[#2d2419] space-y-4">
      {/* Header & Quick Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#e5dcce]">
        <div>
          <h3 className="text-base sm:text-lg font-serif font-bold text-[#433422] flex items-center gap-2">
            <Music className="w-4 h-4 text-[#8a6b3e]" />
            <span>Music Box Repertoire & Cylinders</span>
          </h3>
          <p className="text-xs text-[#75644e] font-serif-sub italic">
            Select authentic 18-note arrangements, custom melodies, or manage your exported/imported score collection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* AI Compose button - Only rendered when AI composer is enabled */}
          {hasAiComposer && onOpenGeminiModal && (
            <button
              id="library-gemini-compose-btn"
              onClick={onOpenGeminiModal}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#c4a675] via-[#dfcd9f] to-[#b8955e] hover:from-[#bfa170] hover:to-[#ae8b54] text-[#2d2419] text-xs font-serif font-bold flex items-center space-x-1.5 shadow-xs border border-[#ae8b54]/40 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Compose</span>
            </button>
          )}

          {/* Repertoire / Export / Import / Restore Modal Trigger */}
          {onOpenImportExportModal && (
            <button
              id="library-manage-data-btn"
              onClick={onOpenImportExportModal}
              className="px-3 py-1.5 rounded-xl bg-[#f4eee4] hover:bg-[#eae2d3] text-[#5e4c36] border border-[#ded3be] text-xs font-serif flex items-center space-x-1.5 transition shadow-2xs font-semibold cursor-pointer"
            >
              <FolderArchive className="w-3.5 h-3.5 text-[#8a765e]" />
              <span>Backup & Import ({customOrAiCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8a765e]" />
          <input
            type="text"
            placeholder="Search melodies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-[#f8f5ee] border border-[#ded3be] pl-9 pr-3 py-2 text-xs text-[#2d2419] placeholder-[#a4937d] focus:border-[#bfa175] outline-none shadow-2xs"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex items-center space-x-1 bg-[#eee7da] p-1 rounded-xl border border-[#ded3be] overflow-x-auto text-xs shadow-2xs">
          {[
            { id: 'all', label: 'All' },
            { id: 'classic', label: 'Classic' },
            { id: 'anime', label: 'Anime & Ghibli' },
            { id: 'lullaby', label: 'Lullaby' },
            { id: 'nature', label: 'Relaxing' },
            ...(hasAiComposer || songs.some((s) => s.isAiGenerated || s.category === 'ai')
              ? [{ id: 'ai', label: 'Gemini AI' }]
              : []),
            { id: 'custom', label: 'Custom' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg font-serif transition whitespace-nowrap cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-xs'
                  : 'text-[#6f5e49] hover:text-[#2d2419]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Songs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
        {filteredSongs.map((song) => {
          const isSelected = song.id === currentSongId;
          const isCustom = song.category === 'custom' || song.id.startsWith('custom-') || song.id.startsWith('imported-');
          const totalSteps = song.totalSteps || 64;
          const measures = Math.max(1, Math.round(totalSteps / 16));
          const measureLabel = measures === 1 ? '1 measure' : `${measures} measures`;

          return (
            <div
              key={song.id}
              id={`song-card-${song.id}`}
              onClick={() => onSelectSong(song)}
              className={`relative p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between group shadow-2xs ${
                isSelected
                  ? 'bg-[#f3ece0] border-2 border-[#bfa175] shadow-xs'
                  : 'bg-[#f8f5ee] hover:bg-[#f4efe4] border-[#ded3be] hover:border-[#bfa175]/60'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className={`text-sm font-serif font-bold leading-tight ${isSelected ? 'text-[#433422]' : 'text-[#433422] group-hover:text-[#8a6b3e]'}`}>
                    {song.title}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#eee5d5] text-[#6d5538] border border-[#d9cdbe] font-medium" title={`${totalSteps} total rotation steps across ${measureLabel}`}>
                      {totalSteps} steps • {measures}m
                    </span>
                    {song.isAiGenerated && (
                      <span
                        className="shrink-0 text-[10px] uppercase font-serif px-1.5 py-0.5 rounded bg-[#ebd7ba] text-[#7a4f15] border border-[#d6be8e] flex items-center gap-1 font-semibold"
                        title={`Generated with: ${song.modelUsed || 'Gemini AI'}`}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        {song.modelUsed
                          ? song.modelUsed.includes('3.7')
                            ? 'Gemini 3.7'
                            : song.modelUsed.includes('3.1')
                            ? 'Gemini 3.1'
                            : song.modelUsed.includes('procedural')
                            ? 'Procedural'
                            : 'AI'
                          : 'Gemini'}
                      </span>
                    )}
                    {isCustom && !song.isAiGenerated && (
                      <span className="shrink-0 text-[10px] uppercase font-serif px-1.5 py-0.5 rounded bg-[#e8e0d1] text-[#5e4c36] border border-[#d2c5b0] font-semibold">
                        Custom
                      </span>
                    )}
                  </div>
                </div>

                {song.description && (
                  <p className="text-xs text-[#75644e] font-serif-sub line-clamp-2 mt-1 italic">
                    {song.description}
                  </p>
                )}
              </div>

              <div className="mt-3 pt-2.5 border-t border-[#e5dcce] flex items-center justify-between text-[11px] text-[#8a765e]">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[#8a765e]">
                  <span>{song.tempoBpm} BPM</span>
                  <span>•</span>
                  <span>{song.pins.length} pins</span>
                </div>

                <div className="flex items-center space-x-1.5">
                  {onPlaySong && (
                    <button
                      id={`play-song-${song.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlaySong(song);
                      }}
                      title={`Play "${song.title}" in Mechanical Movement`}
                      className="px-2 py-1 rounded-lg bg-[#433422] hover:bg-[#2d2419] text-[#fbf8f2] shadow-2xs hover:scale-105 transition flex items-center gap-1 font-serif text-[11px] font-semibold cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play</span>
                    </button>
                  )}

                  <button
                    onClick={(e) => handleExport(song, e)}
                    title="Export score to JSON"
                    className="p-1.5 rounded-lg hover:bg-[#e8dfcf] text-[#8a765e] hover:text-[#433422] transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  {(isCustom || song.isAiGenerated) && onDeleteCustomSong && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCustomSong(song.id);
                      }}
                      title="Delete saved score"
                      className="p-1.5 rounded-lg hover:bg-[#fce9e6] text-[#8a765e] hover:text-[#9c3826] transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-[#433422] text-[#fbf8f2] flex items-center justify-center ml-0.5" title="Currently selected in cylinder">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
