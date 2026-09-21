import React, { useState, useEffect, useId } from 'react';
import { MusicBoxSong, COMB_SCALES_MAP } from '../types';
import { createShareableCylinderUrl, ShareableUrlResult } from '../utils/songUrl';
import QRCode from 'qrcode';
import {
  X,
  Share2,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Sparkles,
  Music,
  Sliders,
  Smartphone,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface ShareSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: MusicBoxSong;
  showToast: (msg: string, type?: 'success' | 'info' | 'warn') => void;
}

export const ShareSongModal: React.FC<ShareSongModalProps> = ({
  isOpen,
  onClose,
  song,
  showToast,
}) => {
  const [shareResult, setShareResult] = useState<ShareableUrlResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const shareInputId = useId();

  // Generate shareable URL and QR code whenever modal opens or song changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setCopied(false);

    createShareableCylinderUrl(song)
      .then(async (result) => {
        if (!isMounted) return;
        setShareResult(result);
        setLoading(false);

        // Generate QR code for mobile scanning
        try {
          const qr = await QRCode.toDataURL(result.url, {
            width: 240,
            margin: 1.5,
            color: {
              dark: '#433422', // Match vintage music box brass/wood
              light: '#fbf9f4',
            },
            errorCorrectionLevel: 'M',
          });
          if (isMounted) {
            setQrDataUrl(qr);
          }
        } catch (qrErr) {
          console.warn('QR code generation failed', qrErr);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to encode shareable cylinder URL', err);
        setLoading(false);
        showToast('Failed to create shareable link', 'warn');
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, song, showToast]);

  if (!isOpen) return null;

  const combInfo =
    (song.combScaleId && COMB_SCALES_MAP[song.combScaleId]) || COMB_SCALES_MAP['romantic-flat'];
  const durationEstimateSec = Math.round(
    ((song.totalSteps || 128) * (60 / Math.max(song.tempoBpm || 88, 30))) / 4
  );

  const handleCopyLink = async () => {
    if (!shareResult) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareResult.url);
      } else {
        // Fallback for iframe or older webviews
        const el = document.getElementById(shareInputId) as HTMLInputElement | null;
        if (el) {
          el.select();
          document.execCommand('copy');
        }
      }
      setCopied(true);
      showToast('Share link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Please select and copy the link manually', 'warn');
    }
  };

  const handleOpenInNewTab = () => {
    if (!shareResult) return;
    window.open(shareResult.url, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (!shareResult || !navigator.share) return;
    try {
      await navigator.share({
        title: `🎵 Music Box: ${song.title}`,
        text: `Listen to "${song.title}" played on a vintage mechanical music box cylinder!`,
        url: shareResult.url,
      });
      showToast('Shared successfully', 'success');
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        showToast('Native share cancelled or unsupported', 'info');
      }
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#fcfbf8] border border-[#d8cbbb] shadow-[0_12px_48px_rgba(67,52,34,0.22)] text-[#2d2419] p-5 sm:p-7 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#e5dcce] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#8a6b3e]/10 border border-[#8a6b3e]/30 flex items-center justify-center text-[#8a6b3e] shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-[#433422] flex items-center gap-2">
                <span>Share Cylinder Link</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-sans font-medium bg-[#f0eae1] text-[#75644e] border border-[#d8cbbb]">
                  Zero Server / Instant
                </span>
              </h2>
              <p className="text-xs text-[#75644e] font-serif-sub italic mt-0.5">
                Share this custom music box cylinder with anyone via a direct, self-contained link.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8a6b3e] hover:bg-[#8a6b3e]/10 hover:text-[#433422] transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cylinder Preview Card */}
        <div className="rounded-xl bg-[#f7f3ee] border border-[#e5dcce] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-[#8a6b3e]" />
              <span className="font-serif font-bold text-[#433422] text-base">{song.title}</span>
              {song.isAiGenerated && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100/80 text-amber-800 border border-amber-300 font-sans">
                  <Sparkles className="w-2.5 h-2.5" /> AI
                </span>
              )}
            </div>
            <div className="text-xs text-[#75644e] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Comb: {combInfo.shortLabel}</span>
              <span>•</span>
              <span>{song.pins.length} Pins</span>
              <span>•</span>
              <span>{song.totalSteps} Steps ({song.tempoBpm} BPM)</span>
              <span>•</span>
              <span>~{durationEstimateSec}s / turn</span>
            </div>
          </div>

          {/* Type Badge */}
          {shareResult && (
            <div className="shrink-0">
              {shareResult.isPreset ? (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-purple-100 text-purple-800 border border-purple-200">
                  Standard Preset
                </span>
              ) : (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <span>Compressed</span>
                  <span className="font-bold">({shareResult.payloadSize} B)</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-[#8a6b3e]">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-xs font-serif italic text-[#75644e]">Compacting cylinder pins and encoding URL...</p>
          </div>
        )}

        {/* Share Result & Controls */}
        {!loading && shareResult && (
          <div className="space-y-4">
            {/* Share Link Input & Copy */}
            <div className="space-y-1.5">
              <label htmlFor={shareInputId} className="block text-xs font-bold text-[#5c4a35] uppercase tracking-wider">
                Direct Music Box URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={shareInputId}
                  type="text"
                  readOnly
                  value={shareResult.url}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full text-xs font-mono bg-[#f4ece1] border border-[#d8cbbb] rounded-xl px-3 py-2.5 text-[#3b2d1c] focus:outline-none focus:ring-2 focus:ring-[#8a6b3e]/40 select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shadow-xs ${
                    copied
                      ? 'bg-emerald-700 text-white shadow-emerald-900/20'
                      : 'bg-[#8a6b3e] hover:bg-[#725730] text-[#fbf9f4] active:scale-95'
                  }`}
                  title="Copy link to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQrCode(!showQrCode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    showQrCode
                      ? 'bg-[#8a6b3e]/15 border-[#8a6b3e] text-[#433422]'
                      : 'bg-white border-[#d8cbbb] text-[#5c4a35] hover:bg-[#f4ece1]'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 text-[#8a6b3e]" />
                  <span>{showQrCode ? 'Hide QR Code' : 'Show Mobile QR'}</span>
                </button>

                {canNativeShare && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#d8cbbb] bg-white text-[#5c4a35] hover:bg-[#f4ece1] transition-colors"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[#8a6b3e]" />
                    <span>Share via App</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#75644e] hover:text-[#433422] hover:bg-[#8a6b3e]/10 transition-colors ml-auto"
                title="Open this link in a new tab to test recipient view"
              >
                <span>Test Link</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {/* QR Code Collapsible View */}
            {showQrCode && qrDataUrl && (
              <div className="rounded-xl bg-[#f7f3ee] border border-[#e5dcce] p-4 flex flex-col items-center justify-center gap-3 text-center transition-all animate-in fade-in zoom-in-95 duration-150">
                <div className="p-2 rounded-xl bg-white border border-[#d8cbbb] shadow-xs">
                  <img
                    src={qrDataUrl}
                    alt={`QR Code for ${song.title}`}
                    className="w-48 h-48 rounded-lg"
                  />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-serif font-bold text-[#433422]">
                    Scan with your mobile camera
                  </p>
                  <p className="text-[11px] text-[#75644e] max-w-xs">
                    Instantly loads and spins this cylinder on your smartphone with vintage Web Audio chimes!
                  </p>
                </div>
              </div>
            )}

            {/* Compact Payload Stats & Security Assurance */}
            <div className="rounded-xl bg-[#f0eae1]/70 border border-[#e5dcce] p-3 text-[11px] text-[#75644e] flex items-start gap-2.5 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-[#8a6b3e] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  <strong>Zero-Server Architecture:</strong> The entire cylinder pin arrangement is compressed into the URL's hash fragment (<code>#song=...</code>). It never hits external servers or logs your score.
                </p>
                {!shareResult.isPreset && (
                  <p className="text-[10px] text-[#8a6b3e]">
                    Compacted from {shareResult.originalSize} raw bytes into {shareResult.payloadSize} characters ({shareResult.compressionRatio}% compression ratio). Safe for SMS, Line, WhatsApp, Discord, and QR codes.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-[#e5dcce]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-[#5c4a35] hover:bg-[#f0eae1] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
