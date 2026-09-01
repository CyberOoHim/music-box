import React, { useState, useRef } from 'react';
import { MusicBoxSong, UserSettings, MusicBoxExportBundle, COMB_SCALES_MAP, formatModelDisplayName } from '../types';
import { DEFAULT_SONGS } from '../data/defaultSongs';
import {
  X,
  Download,
  Upload,
  RotateCcw,
  Sparkles,
  Music,
  Check,
  AlertTriangle,
  Copy,
  FileJson,
  Layers,
  Settings,
  FolderArchive,
  RefreshCw,
  Plus,
} from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: MusicBoxSong;
  allSongs: MusicBoxSong[];
  userSettings: UserSettings;
  onImportSongs: (importedSongs: MusicBoxSong[], overwrite?: boolean) => void;
  onApplySettings?: (settings: Partial<UserSettings>) => void;
  onRestoreAllDefaults: () => void;
  onRestoreSongsDefault: () => void;
  onRestoreSettingsDefault: () => void;
  showToast: (msg: string, type?: 'success' | 'info' | 'warn') => void;
}

type ModalTab = 'export' | 'import' | 'restore';

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  currentSong,
  allSongs,
  userSettings,
  onImportSongs,
  onApplySettings,
  onRestoreAllDefaults,
  onRestoreSongsDefault,
  onRestoreSettingsDefault,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('export');
  const [jsonText, setJsonText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<{
    songs: MusicBoxSong[];
    settings?: Partial<UserSettings>;
    format?: string;
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [restoreConfirmMode, setRestoreConfirmMode] = useState<'all' | 'songs' | 'settings' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Filter custom and AI songs
  const customOrAiSongs = allSongs.filter(
    (s) => s.category === 'custom' || s.isAiGenerated || s.category === 'ai'
  );

  // 1. Export Handlers
  const handleExportSingleSong = (song: MusicBoxSong) => {
    const blob = new Blob([JSON.stringify(song, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `${song.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_musicbox.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    showToast(`Exported "${song.title}" as JSON file`, 'success');
  };

  const handleExportAllCustomAndAi = () => {
    const songsToExport = customOrAiSongs.length > 0 ? customOrAiSongs : allSongs;
    const bundle: MusicBoxExportBundle = {
      format: 'musicbox-backup-v1',
      exportedAt: Date.now(),
      appName: 'Mechanical Music Box',
      songs: songsToExport,
      settings: userSettings,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `musicbox_library_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    showToast(`Exported ${songsToExport.length} music box songs`, 'success');
  };

  const handleCopyJsonToClipboard = async (data: unknown, label: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopySuccess(true);
      showToast(`Copied ${label} to clipboard`, 'success');
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      showToast('Could not access clipboard', 'warn');
    }
  };

  // 2. Import Handlers & Parsers
  const parseJsonData = (rawText: string) => {
    setParseError(null);
    setParsedPreview(null);
    if (!rawText.trim()) return;

    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parsed data is not a valid JSON object.');
      }
      const extractedSongs: MusicBoxSong[] = [];
      let extractedSettings: Partial<UserSettings> | undefined;

      // Case A: Full Backup Package { format, songs, settings }
      if (parsed.songs && Array.isArray(parsed.songs)) {
        parsed.songs.forEach((s: Partial<MusicBoxSong>, idx: number) => {
          if (s && s.title && Array.isArray(s.pins)) {
            extractedSongs.push({
              id: s.id || `imported-${Date.now()}-${idx}`,
              title: s.title,
              category: s.category || (s.isAiGenerated ? 'ai' : 'custom'),
              description: s.description || 'Imported music box cylinder',
              tempoBpm: s.tempoBpm || 88,
              totalSteps: s.totalSteps || 64,
              combScaleId: s.combScaleId || 'romantic-flat',
              customTines: s.customTines,
              pins: s.pins,
              createdAt: s.createdAt || Date.now(),
              isAiGenerated: !!s.isAiGenerated || s.category === 'ai' || !!s.modelUsed,
              modelUsed: s.modelUsed,
            });
          }
        });
        if (parsed.settings) {
          extractedSettings = parsed.settings;
        }
      }
      // Case B: Array of Songs [ { title, pins }, ... ]
      else if (Array.isArray(parsed)) {
        parsed.forEach((s: Partial<MusicBoxSong>, idx: number) => {
          if (s && s.title && Array.isArray(s.pins)) {
            extractedSongs.push({
              id: s.id || `imported-${Date.now()}-${idx}`,
              title: s.title,
              category: s.category || (s.isAiGenerated ? 'ai' : 'custom'),
              description: s.description || 'Imported music box cylinder',
              tempoBpm: s.tempoBpm || 88,
              totalSteps: s.totalSteps || 64,
              combScaleId: s.combScaleId || 'romantic-flat',
              customTines: s.customTines,
              pins: s.pins,
              createdAt: s.createdAt || Date.now(),
              isAiGenerated: !!s.isAiGenerated || s.category === 'ai' || !!s.modelUsed,
              modelUsed: s.modelUsed,
            });
          }
        });
      }
      // Case C: Single Song { title, pins, tempoBpm }
      else if (parsed.title && Array.isArray(parsed.pins)) {
        extractedSongs.push({
          id: parsed.id || `imported-${Date.now()}`,
          title: parsed.title,
          category: parsed.category || (parsed.isAiGenerated ? 'ai' : 'custom'),
          description: parsed.description || 'Imported music box cylinder',
          tempoBpm: parsed.tempoBpm || 88,
          totalSteps: parsed.totalSteps || 64,
          combScaleId: parsed.combScaleId || 'romantic-flat',
          customTines: parsed.customTines,
          pins: parsed.pins,
          createdAt: parsed.createdAt || Date.now(),
          isAiGenerated: !!parsed.isAiGenerated || parsed.category === 'ai' || !!parsed.modelUsed,
          modelUsed: parsed.modelUsed,
        });
      } else {
        throw new Error('Unrecognized JSON format. Must contain a "title" and an array of "pins".');
      }

      if (extractedSongs.length === 0) {
        throw new Error('No valid songs could be parsed from this JSON.');
      }

      setParsedPreview({
        songs: extractedSongs,
        settings: extractedSettings,
        format: parsed.format || 'custom-json',
      });
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON file structure');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
    e.target.value = '';
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonText(content);
      parseJsonData(content);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = (overwrite = false) => {
    if (!parsedPreview || parsedPreview.songs.length === 0) return;

    onImportSongs(parsedPreview.songs, overwrite);

    if (parsedPreview.settings && onApplySettings) {
      onApplySettings(parsedPreview.settings);
    }

    showToast(
      `Successfully imported ${parsedPreview.songs.length} song${parsedPreview.songs.length > 1 ? 's' : ''}!`,
      'success'
    );
    setParsedPreview(null);
    setJsonText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2d2419]/65 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#fdfcf9] border-2 border-[#bfa175] p-5 sm:p-7 shadow-[0_20px_50px_rgba(45,36,25,0.35)] text-[#2d2419] overflow-hidden max-h-[90vh] flex flex-col">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#bfa175]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e5dcce]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f0e6d6] border border-[#d8caa8] flex items-center justify-center text-[#8a6b3e] shadow-2xs">
              <FolderArchive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-[#433422]">
                Music Box Data & Repertoire Manager
              </h2>
              <p className="text-xs text-[#75644e] font-serif-sub italic">
                Export, import, back up, and restore your music creations & browser settings.
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

        {/* Navigation Tabs */}
        <div className="flex items-center justify-center pt-3 pb-2">
          <div className="inline-flex p-1 rounded-xl bg-[#eee7da] border border-[#ded3be] text-xs font-serif shadow-xs">
            <button
              onClick={() => {
                setActiveTab('export');
                setRestoreConfirmMode(null);
              }}
              className={`px-4 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                activeTab === 'export'
                  ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-xs'
                  : 'text-[#6f5e49] hover:text-[#2d2419]'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Music</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('import');
                setRestoreConfirmMode(null);
              }}
              className={`px-4 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                activeTab === 'import'
                  ? 'bg-[#433422] text-[#fbf8f2] font-semibold shadow-xs'
                  : 'text-[#6f5e49] hover:text-[#2d2419]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Music</span>
            </button>

            <button
              onClick={() => setActiveTab('restore')}
              className={`px-4 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                activeTab === 'restore'
                  ? 'bg-[#8a3e2d] text-[#fbf8f2] font-semibold shadow-xs'
                  : 'text-[#6f5e49] hover:text-[#8a3e2d]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Defaults</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 custom-scrollbar pr-1">
          {/* TAB 1: EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-3.5 rounded-xl bg-[#f8f5ee] border border-[#ded3be] text-xs text-[#6e5d48] font-serif-sub space-y-1">
                <span className="font-serif font-bold text-[#433422] block">Browser Storage Active</span>
                <p>
                  All your AI compositions, custom cylinder punches, and sound chamber settings are automatically kept in this browser. Use the buttons below to export portable JSON files to share or backup.
                </p>
              </div>

              {/* Option 1: Export Current Active Song */}
              <div className="p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Music className="w-4 h-4 text-[#8a6b3e]" />
                    <span className="font-serif font-bold text-sm text-[#433422]">
                      Current Song: "{currentSong.title}"
                    </span>
                    {currentSong.isAiGenerated && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ebd7ba] text-[#7a4f15] font-semibold">
                        Gemini AI
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-[#8a765e]">
                    {currentSong.pins.length} pins • {currentSong.tempoBpm} BPM • {currentSong.totalSteps || 64} steps ({Math.max(1, Math.round((currentSong.totalSteps || 64) / 16))} measures)
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => handleExportSingleSong(currentSong)}
                    className="px-3 py-1.5 rounded-lg bg-[#433422] hover:bg-[#342718] text-[#fbf8f2] text-xs font-serif font-semibold flex items-center space-x-1.5 transition shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON File</span>
                  </button>

                  <button
                    onClick={() => handleCopyJsonToClipboard(currentSong, `"${currentSong.title}" JSON`)}
                    className="px-3 py-1.5 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] text-xs font-serif flex items-center space-x-1.5 transition shadow-2xs"
                  >
                    <Copy className="w-3.5 h-3.5 text-[#8a765e]" />
                    <span>{copySuccess ? 'Copied!' : 'Copy Song JSON'}</span>
                  </button>
                </div>
              </div>

              {/* Option 2: Export All AI & Custom Compositions */}
              <div className="p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-[#8a6b3e]" />
                    <span className="font-serif font-bold text-sm text-[#433422]">
                      All AI & Custom Melodies ({customOrAiSongs.length})
                    </span>
                  </div>
                  <span className="text-xs text-[#8a765e] font-serif-sub italic">
                    Bulk library backup
                  </span>
                </div>

                <p className="text-xs text-[#75644e] font-serif-sub">
                  Exports a complete bundle containing all your generated and edited melodies together with your sound presets.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={handleExportAllCustomAndAi}
                    className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#c4a675] via-[#dfcd9f] to-[#b8955e] hover:from-[#bfa170] hover:to-[#ae8b54] text-[#2d2419] text-xs font-serif font-bold flex items-center space-x-1.5 transition shadow-xs border border-[#ae8b54]/40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Complete Repertoire (.json)</span>
                  </button>

                  <button
                    onClick={() =>
                      handleCopyJsonToClipboard(
                        {
                          format: 'musicbox-backup-v1',
                          exportedAt: Date.now(),
                          songs: customOrAiSongs.length > 0 ? customOrAiSongs : allSongs,
                          settings: userSettings,
                        },
                        'Complete Repertoire Backup'
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] text-xs font-serif flex items-center space-x-1.5 transition shadow-2xs"
                  >
                    <Copy className="w-3.5 h-3.5 text-[#8a765e]" />
                    <span>Copy Bundle JSON</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT */}
          {activeTab === 'import' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Drag and Drop Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragOver
                    ? 'border-[#8a6b3e] bg-[#f0e6d6]/60 scale-[1.01]'
                    : 'border-[#ded3be] bg-[#f8f5ee] hover:bg-[#f3ece0]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <FileJson className="w-8 h-8 text-[#8a6b3e] mb-2" />
                <span className="font-serif font-bold text-sm text-[#433422]">
                  Drop a Music Box JSON file here, or click to browse
                </span>
                <span className="text-xs text-[#8a765e] font-serif-sub mt-0.5">
                  Supports single song scores, arrays of scores, or complete backup bundles.
                </span>
              </div>

              {/* Or Paste Raw JSON */}
              <div className="space-y-1.5">
                <label className="text-xs font-serif uppercase tracking-wider text-[#8a6b3e] font-bold block">
                  Or Paste JSON Text Directly
                </label>
                <textarea
                  rows={4}
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    parseJsonData(e.target.value);
                  }}
                  placeholder='Paste JSON here (e.g. { "title": "My Melody", "pins": [...] })'
                  className="w-full rounded-xl bg-[#f8f5ee] border border-[#ded3be] p-3 text-xs font-mono text-[#2d2419] placeholder-[#a4937d] focus:border-[#bfa175] outline-none shadow-2xs"
                />
              </div>

              {/* Error Alert */}
              {parseError && (
                <div className="p-3 rounded-xl bg-[#fdf2f0] border border-[#f2c6bf] text-[#9c3826] text-xs font-serif flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Parsed Preview Card */}
              {parsedPreview && (
                <div className="p-4 rounded-xl bg-[#f4eee4] border border-[#d8caa8] space-y-3 animate-in fade-in shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-serif font-bold text-[#433422] flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-[#5e9638]" />
                      <span>Ready to Import: {parsedPreview.songs.length} Song{parsedPreview.songs.length > 1 ? 's' : ''}</span>
                    </span>
                    {parsedPreview.settings && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#e3d7c3] text-[#6e5838] font-mono">
                        + Settings Included
                      </span>
                    )}
                  </div>

                  {/* List preview of songs to import */}
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {parsedPreview.songs.map((s, idx) => {
                      const isAi = s.isAiGenerated || s.category === 'ai' || !!s.modelUsed;
                      const combInfo = COMB_SCALES_MAP[s.combScaleId || 'romantic-flat'];
                      const modelDisplayName = formatModelDisplayName(s.modelUsed, isAi);
                      return (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-[#fcfbf8] border border-[#e2d6c1] flex items-center justify-between text-xs gap-2"
                        >
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <Music className="w-3.5 h-3.5 text-[#8a6b3e] shrink-0" />
                            <span className="font-serif font-semibold text-[#3d2e1c]">{s.title}</span>
                            {isAi && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ebd7ba] text-[#7a4f15] font-serif font-semibold">
                                {modelDisplayName}
                              </span>
                            )}
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#eee5d5] text-[#5e482b] font-sans font-medium">
                              {combInfo?.shortLabel || 'Romantic Flat 22N'}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-[#8a765e] shrink-0">
                            {s.pins.length} pins • {s.tempoBpm} BPM • {s.totalSteps || 64} steps ({Math.max(1, Math.round((s.totalSteps || 64) / 16))}m)
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Import Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#ded1be]">
                    <button
                      onClick={() => handleConfirmImport(false)}
                      className="px-4 py-2 rounded-xl bg-[#433422] hover:bg-[#342718] text-[#fbf8f2] text-xs font-serif font-bold flex items-center space-x-1.5 transition shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Existing Library</span>
                    </button>

                    <button
                      onClick={() => handleConfirmImport(true)}
                      className="px-3.5 py-2 rounded-xl bg-[#f8f5ee] hover:bg-[#f0e6d6] text-[#6e5838] border border-[#ded3be] text-xs font-serif transition"
                    >
                      <span>Replace Library</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RESTORE DEFAULTS */}
          {activeTab === 'restore' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-[#fdf8f4] border border-[#f0ded4] text-xs text-[#784d3b] space-y-1.5">
                <span className="font-serif font-bold text-[#8a3e2d] text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#8a3e2d]" />
                  <span>Restore Factory Defaults</span>
                </span>
                <p>
                  You can reset the music box back to its pristine default state. Choose whether to reset everything or just individual components.
                </p>
              </div>

              {/* Option A: Full Factory Restore */}
              <div className="p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-serif font-bold text-sm text-[#433422]">
                      Restore All (Factory Reset)
                    </h4>
                    <p className="text-xs text-[#75644e] font-serif-sub italic">
                      Resets sound chamber, nature ambiance, volume, play mode, font zoom (100%), and restores default songs.
                    </p>
                  </div>

                  {restoreConfirmMode === 'all' ? (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          onRestoreAllDefaults();
                          showToast('Restored all settings & songs to default', 'info');
                          setRestoreConfirmMode(null);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#9c3826] hover:bg-[#852e1e] text-white text-xs font-serif font-bold transition shadow-xs"
                      >
                        Confirm Reset
                      </button>
                      <button
                        onClick={() => setRestoreConfirmMode(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#eee5d3] text-[#5e4c36] text-xs font-serif"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRestoreConfirmMode('all')}
                      className="px-3 py-1.5 rounded-lg bg-[#fce9e6] hover:bg-[#fad8d3] border border-[#f0c3bc] text-[#9c3826] text-xs font-serif font-semibold transition shadow-2xs"
                    >
                      Restore All
                    </button>
                  )}
                </div>
              </div>

              {/* Option B: Reset Songs to Default Repertoire Only */}
              <div className="p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-serif font-bold text-sm text-[#433422]">
                      Reset Songs to Default Repertoire
                    </h4>
                    <p className="text-xs text-[#75644e] font-serif-sub italic">
                      Clears custom/AI additions and reloads the original 7 classic melodies (Canon in D, Clair de Lune, etc.). Audio & font settings remain unchanged.
                    </p>
                  </div>

                  {restoreConfirmMode === 'songs' ? (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          onRestoreSongsDefault();
                          showToast('Song repertoire reset to default songs', 'info');
                          setRestoreConfirmMode(null);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#9c3826] hover:bg-[#852e1e] text-white text-xs font-serif font-bold transition shadow-xs"
                      >
                        Confirm Reset
                      </button>
                      <button
                        onClick={() => setRestoreConfirmMode(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#eee5d3] text-[#5e4c36] text-xs font-serif"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRestoreConfirmMode('songs')}
                      className="px-3 py-1.5 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] text-xs font-serif font-semibold transition shadow-2xs"
                    >
                      Reset Songs
                    </button>
                  )}
                </div>
              </div>

              {/* Option C: Reset Audio & Chamber Settings Only */}
              <div className="p-4 rounded-xl bg-[#fcfbf8] border border-[#ded3be] space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-serif font-bold text-sm text-[#433422]">
                      Reset Audio & Chamber Settings
                    </h4>
                    <p className="text-xs text-[#75644e] font-serif-sub italic">
                      Resets sound preset to Gold Sankyo 18N, clears nature mixers, un-mutes audio, sets volume to 90%, and resets font zoom to 100%. Songs are preserved.
                    </p>
                  </div>

                  {restoreConfirmMode === 'settings' ? (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          onRestoreSettingsDefault();
                          showToast('Settings reset to default', 'info');
                          setRestoreConfirmMode(null);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#9c3826] hover:bg-[#852e1e] text-white text-xs font-serif font-bold transition shadow-xs"
                      >
                        Confirm Reset
                      </button>
                      <button
                        onClick={() => setRestoreConfirmMode(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#eee5d3] text-[#5e4c36] text-xs font-serif"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRestoreConfirmMode('settings')}
                      className="px-3 py-1.5 rounded-lg bg-[#f4eee4] hover:bg-[#eae2d3] border border-[#ded3be] text-[#5e4c36] text-xs font-serif font-semibold transition shadow-2xs"
                    >
                      Reset Settings
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-[#e5dcce] flex items-center justify-between text-xs text-[#8a765e]">
          <span>
            Mechanical Music Box v1.2 • Offline Browser Storage
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#eee7da] hover:bg-[#e4dcce] text-[#5e4c36] font-serif transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
