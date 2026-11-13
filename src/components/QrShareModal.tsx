import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import type { QrSharePayload } from '../types';

interface QrShareModalProps {
  payload: QrSharePayload | null;
  onClose: () => void;
}

export function QrShareModal({ payload, onClose }: QrShareModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!payload) {
      setQrDataUrl('');
      setError('');
      return;
    }
    let active = true;
    QRCode.toDataURL(payload.url, {
      width: 560,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) {
          setQrDataUrl(url);
          setError('');
        }
      })
      .catch(() => {
        if (active) setError('Could not generate QR code for this link.');
      });
    return () => {
      active = false;
    };
  }, [payload]);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload, onClose]);

  if (!payload) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback: select input
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: payload.title,
          text: payload.subtitle,
          url: payload.url,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await handleCopy();
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    const slug = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'camp-split';
    a.download = `${slug}-qr.png`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="qr-modal-title" className="text-lg font-semibold text-stone-900 dark:text-slate-100 truncate">
              {payload.title}
            </h3>
            <p className="text-sm text-stone-500 dark:text-slate-400 mt-0.5">{payload.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR share dialog"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center">
          <div className="rounded-2xl bg-white p-4 border border-stone-200 shadow-sm">
            {error ? (
              <div className="w-56 h-56 flex items-center justify-center text-sm text-red-600 text-center px-4">
                {error}
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${payload.title}`}
                className="w-56 h-56 sm:w-60 sm:h-60 block"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-sm text-stone-400">
                Generating QR…
              </div>
            )}
          </div>
          <p className="text-xs text-stone-500 dark:text-slate-400 mt-2.5 text-center">
            Point any phone camera at this QR code to open instantly
          </p>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1.5">
            Short share link
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={payload.url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3 py-2.5 text-xs font-mono text-stone-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[42px] px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-stone-800 dark:text-slate-100 hover:bg-stone-50 dark:hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {payload.note && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-2">
            {payload.note}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleDownloadQr}
            disabled={!qrDataUrl}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Save QR</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Share2 className="w-4 h-4" />
            <span>Share link</span>
          </button>
        </div>
      </div>
    </div>
  );
}
