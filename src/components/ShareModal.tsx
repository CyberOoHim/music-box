import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Share2,
  Sparkles,
  QrCode,
  Sliders,
  Zap,
  ShieldCheck,
  Music,
  ExternalLink,
} from 'lucide-react';
import { MusicBoxSong, COMB_SCALES_MAP, formatModelDisplayName } from '../types';
import {
  generateSongShareUrl,
  generateScoreQrCode,
  ScoreShareResult,
} from '../utils/scoreCompression';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: MusicBoxSong;
  showToast: (msg: string, type?: 'success' | 'info' | 'warn') => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  song,
  showToast,
}) => {
  const [shareData, setShareData] = useState<ScoreShareResult | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsGenerating(true);
    setCopied(false);

    (async () => {
      try {
        const result = await generateSongShareUrl(song);
        if (!isMounted) return;
        setShareData(result);

        const qrUrl = await generateScoreQrCode(result.url, {
          title: song.title,
          footerText: 'music-box',
        });
        if (!isMounted) return;
        setQrCodeDataUrl(qrUrl);
      } catch (err) {
        console.error('Failed to generate share URL / QR code:', err);
        showToast('Failed to generate QR code for this score', 'warn');
      } finally {
        if (isMounted) setIsGenerating(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, song, showToast]);

  if (!isOpen) return null;

  const combInfo = COMB_SCALES_MAP[song.combScaleId || 'romantic-flat'];
  const isAi = song.isAiGenerated || song.category === 'ai' || !!song.modelUsed;
  const modelDisplayName = formatModelDisplayName(song.modelUsed, isAi);
  const canWebShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleCopyLink = async () => {
    if (!shareData?.url) return;
    try {
      await navigator.clipboard.writeText(shareData.url);
      setCopied(true);
      showToast('Share link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Could not access clipboard', 'warn');
    }
  };

  const handleDownloadQrCode = () => {
    if (!qrCodeDataUrl) return;
    const a = document.createElement('a');
    a.href = qrCodeDataUrl;
    a.download = `${song.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_qr_score.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Downloaded QR Code image (.png)', 'success');
  };

  const handleNativeShare = async () => {
    if (!shareData?.url || !navigator.share) return;
    try {
      await navigator.share({
        title: `${song.title} - Mechanical Music Box`,
        text: `Listen to "${song.title}" on the interactive Mechanical Music Box!`,
        url: shareData.url,
      });
      showToast('Shared successfully', 'success');
    } catch (err: unknown) {
      // User cancelled share dialog or unsupported
      if (err instanceof Error && err.name !== 'AbortError') {
        showToast('Share failed', 'warn');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2d2419]/65 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-2xl bg-[#fdfcf9] border-2 border-[#bfa175] p-5 sm:p-7 shadow-[0_20px_50px_rgba(45,36,25,0.35)] text-[#2d2419] overflow-hidden max-h-[92vh] flex flex-col">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#bfa175]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e5dcce]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f0e6d6] border border-[#d8caa8] flex items-center justify-center text-[#8a6b3e] shadow-2xs">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-[#433422]">
                Share Melody & QR Code
              </h2>
              <p className="text-xs text-[#75644e] font-serif-sub italic">
                Zero-backend link with native deflate stream compression.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8a765e] hover:text-[#2d2419] hover:bg-[#f0e6d6] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 custom-scrollbar pr-1">
          {/* Song Overview Card */}
          <div className="p-3.5 rounded-xl bg-[#f8f5ee] border border-[#ded3be] flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2 flex-wrap">
                <Music className="w-4 h-4 text-[#8a6b3e] shrink-0" />
                <span className="font-serif font-bold text-sm text-[#433422]">
                  {song.title}
                </span>
                {isAi && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ebd7ba] text-[#7a4f15] font-semibold flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-[#8a6b3e]" />
                    <span>{modelDisplayName || 'Gemini AI'}</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#75644e]">
                <span>{combInfo?.shortLabel || 'Romantic Flat 22N'}</span>
                <span>•</span>
                <span>{song.pins.length} pins</span>
                <span>•</span>
                <span>{song.tempoBpm} BPM</span>
                <span>•</span>
                <span>{song.totalSteps || 64} steps</span>
              </div>
            </div>
          </div>

          {/* QR Code Presentation Box */}
          <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-[#f5efe3] border border-[#d8caa8] space-y-3 shadow-inner">
            {isGenerating ? (
              <div className="w-48 h-48 rounded-xl bg-[#ded4c0] flex flex-col items-center justify-center space-y-2 animate-pulse">
                <QrCode className="w-8 h-8 text-[#8a765e]" />
                <span className="text-xs text-[#705c43] font-serif">Compressing score...</span>
              </div>
            ) : qrCodeDataUrl ? (
              <div className="relative group p-1.5 rounded-2xl bg-[#fdfcf9] border-2 border-[#bfa175]/60 shadow-md max-w-[240px]">
                <img
                  src={qrCodeDataUrl}
                  alt={`QR Code for ${song.title}`}
                  className="w-full h-auto object-contain rounded-xl"
                />
              </div>
            ) : (
              <div className="w-48 h-48 rounded-xl bg-[#fae8e6] border border-[#f0c3bc] flex items-center justify-center text-xs text-[#9c3826]">
                QR code generation failed
              </div>
            )}

            {/* QR Quick Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadQrCode}
                disabled={!qrCodeDataUrl}
                className="px-3 py-1.5 rounded-lg bg-[#f0e6d6] hover:bg-[#e4dcce] border border-[#d8caa8] text-[#5e4c36] text-xs font-serif font-semibold flex items-center space-x-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-[#8a765e]" />
                <span>Save QR Image (.png)</span>
              </button>

              {canWebShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  disabled={!shareData}
                  className="px-3 py-1.5 rounded-lg bg-[#433422] hover:bg-[#2d2419] text-[#fbf8f2] text-xs font-serif font-semibold flex items-center space-x-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Score</span>
                </button>
              )}
            </div>
          </div>

          {/* Direct Share Link Bar */}
          <div className="space-y-1.5">
            <label className="text-xs font-serif font-bold uppercase tracking-wider text-[#8a6b3e] flex items-center justify-between">
              <span>Direct Link (Hash Fragment)</span>
              <span className="font-mono text-[11px] text-[#705c43] lowercase">
                {shareData?.urlChars || 0} characters
              </span>
            </label>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={shareData?.url || 'Generating link...'}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 rounded-xl bg-[#f8f5ee] border border-[#ded3be] px-3 py-2 text-xs font-mono text-[#2d2419] select-all outline-none focus:border-[#bfa175] shadow-2xs"
              />

              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!shareData?.url}
                className={`px-4 py-2 rounded-xl text-xs font-serif font-bold flex items-center space-x-1.5 transition shadow-xs cursor-pointer ${
                  copied
                    ? 'bg-[#5e9638] text-white'
                    : 'bg-[#433422] hover:bg-[#2d2419] text-[#fbf8f2]'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* Pipeline Details & Compression Metrics */}
          {shareData && (
            <div className="p-3.5 rounded-xl bg-[#fcfbf8] border border-[#ded3be] space-y-2 text-xs font-serif-sub shadow-2xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#ebd7ba]/50">
                <div className="flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span className="font-serif font-bold text-[#433422]">
                    Compression Pipeline Statistics
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#faebd4] text-[#8a6b3e] border border-[#d8caa8]">
                  {shareData.tier === 'preset'
                    ? 'Tier 1: Factory Preset'
                    : shareData.tier === 'delta'
                    ? 'Tier 2: Preset Delta'
                    : 'Tier 3: Compact V2'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-center">
                <div className="p-2 rounded-lg bg-[#f8f5ee] border border-[#e8dfcf]">
                  <span className="text-[#8a765e] block text-[10px] uppercase font-sans">Raw JSON</span>
                  <span className="font-bold text-[#433422]">
                    {(shareData.originalJsonBytes / 1024).toFixed(2)} KB
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-[#f8f5ee] border border-[#e8dfcf]">
                  <span className="text-[#8a765e] block text-[10px] uppercase font-sans">Compressed</span>
                  <span className="font-bold text-[#433422]">
                    {shareData.compressedBinaryBytes > 0
                      ? `${shareData.compressedBinaryBytes} B`
                      : '< 50 B'}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-[#f8f5ee] border border-[#e8dfcf]">
                  <span className="text-[#8a765e] block text-[10px] uppercase font-sans">Payload Cut</span>
                  <span className="font-bold text-[#5e9638]">
                    -{(shareData.compressionRatio * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-[#f8f5ee] border border-[#e8dfcf]">
                  <span className="text-[#8a765e] block text-[10px] uppercase font-sans">QR Density</span>
                  <span className="font-bold text-[#8a6b3e]">
                    Level L (7%)
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 pt-1 text-[11px] text-[#75644e]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#5e9638] shrink-0" />
                <span>
                  100% Client-side. No score data is stored on remote servers. Opens instantly on any mobile device.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-[#e5dcce] flex items-center justify-between text-xs text-[#8a765e]">
          <span>Mechanical Music Box • RFC 4648 Base64URL</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#eee7da] hover:bg-[#e4dcce] text-[#5e4c36] font-serif transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
