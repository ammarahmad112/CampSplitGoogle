import { useEffect, useState } from 'react';
import { Download, ExternalLink, ImageOff, Loader2, X } from 'lucide-react';
import type { Expense, SyncConfig } from '../types';
import { callDriveApi } from '../lib/driveSync';
import { idbGetReceipt } from '../lib/storage';

interface ReceiptLightboxProps {
  expense: Expense | null;
  currency: string;
  syncCfg: SyncConfig | null;
  onClose: () => void;
}

export function ReceiptLightbox({ expense, currency, syncCfg, onClose }: ReceiptLightboxProps) {
  const [src, setSrc] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!expense || !expense.receipt) {
      setSrc('');
      setError('');
      return;
    }
    let active = true;
    const rec = expense.receipt;
    setError('');

    const load = async () => {
      // 1. Check local IndexedDB cache first (instant & works offline)
      const local = await idbGetReceipt(expense.id);
      if (local?.dataUrl && active) {
        setSrc(local.dataUrl);
        return;
      }

      // 2. Fallback to showing thumbnail immediately while loading full image from Drive
      if (rec.thumb && active) {
        setSrc(rec.thumb);
      }

      // 3. Fetch full-res receipt from Drive via Code.gs
      if (rec.id && syncCfg) {
        setLoading(true);
        try {
          const res = await callDriveApi(syncCfg.url, syncCfg.code, 'receipt_get', { fileId: rec.id });
          if (active) {
            if (res.ok && res.dataUrl) {
              setSrc(res.dataUrl);
              setError('');
            } else if (!rec.thumb) {
              setError(res.error || 'Could not load receipt photo from Drive.');
            }
          }
        } catch {
          if (active && !rec.thumb) {
            setError('Offline or unreachable Drive script. Connect to view full receipt.');
          }
        } finally {
          if (active) setLoading(false);
        }
      } else if (!rec.thumb && active) {
        setError('Receipt image is stored on another device or Drive is disconnected.');
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [expense, syncCfg]);

  useEffect(() => {
    if (!expense) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expense, onClose]);

  if (!expense || !expense.receipt) return null;

  const handleDownload = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = expense.receipt?.name || `receipt-${expense.id}.jpg`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt preview"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-stone-900 dark:text-slate-100 truncate">
              {expense.desc}
            </h3>
            <p className="text-xs text-stone-500 dark:text-slate-400 font-mono-num">
              {currency}
              {expense.amt.toFixed(2)} · {expense.receipt.name}
              {expense.receipt.pending ? ' · Pending Drive upload' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt viewer"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-stone-100 dark:bg-slate-950 flex items-center justify-center p-4 min-h-[260px]">
          {error && !src ? (
            <div className="flex flex-col items-center gap-2 text-center text-stone-500 dark:text-slate-400 max-w-xs">
              <ImageOff className="w-8 h-8" />
              <p className="text-sm">{error}</p>
            </div>
          ) : src ? (
            <div className="relative flex flex-col items-center">
              <img
                src={src}
                alt={`Receipt for ${expense.desc}`}
                className="max-h-[65vh] w-auto rounded-lg object-contain shadow-md"
              />
              {loading && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-stone-600 dark:text-slate-300 bg-white/90 dark:bg-slate-800/90 px-3 py-1 rounded-full shadow">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading full resolution from Drive…</span>
                </div>
              )}
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 text-sm text-stone-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading receipt…</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-stone-200 dark:border-slate-800">
          {expense.receipt.url && (
            <a
              href={expense.receipt.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in Drive</span>
            </a>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!src}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
        </div>
      </div>
    </div>
  );
}
