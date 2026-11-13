import { useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Copy,
  Laptop,
  QrCode,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import type { QrSharePayload, SyncConfig } from '../types';
import { CODE_GS_SOURCE, buildDevicePairLink } from '../lib/driveSync';

interface DriveSyncPanelProps {
  cfg: SyncConfig | null;
  syncStatus: string;
  syncOk: boolean;
  conflict: boolean;
  busy: boolean;
  pendingReceipts: number;
  onConnect: (url: string, code: string) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onLoadFromDrive: () => Promise<void>;
  onOverwriteDrive: () => Promise<void>;
  onDisconnect: () => void;
  onWipeDrive: (codeConfirm: string) => Promise<boolean>;
  onOpenQr: (payload: QrSharePayload) => void;
}

export function DriveSyncPanel({
  cfg,
  syncStatus,
  syncOk,
  conflict,
  busy,
  pendingReceipts,
  onConnect,
  onSyncNow,
  onLoadFromDrive,
  onOverwriteDrive,
  onDisconnect,
  onWipeDrive,
  onOpenQr,
}: DriveSyncPanelProps) {
  const [urlInput, setUrlInput] = useState(cfg?.url || '');
  const [codeInput, setCodeInput] = useState(cfg?.code || '');
  const [copiedScript, setCopiedScript] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wipeCode, setWipeCode] = useState('');
  const [wipeError, setWipeError] = useState('');

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConnect(urlInput.trim(), codeInput.trim());
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(CODE_GS_SOURCE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2200);
    } catch {
      // ignore
    }
  };

  const handlePairDevice = () => {
    if (!cfg) return;
    const pairUrl = buildDevicePairLink(cfg);
    onOpenQr({
      title: 'Sync another device (Admin)',
      subtitle: 'Scan on your phone, tablet, or second laptop for full two-way multi-device sync',
      url: pairUrl,
      note: 'This link grants full admin edit access to your trip. Share only with your own devices.',
    });
  };

  const handleConfirmWipe = async () => {
    setWipeError('');
    const ok = await onWipeDrive(wipeCode.trim());
    if (ok) {
      setConfirmWipe(false);
      setWipeCode('');
    } else {
      setWipeError('Wrong access code or Drive unreachable.');
    }
  };

  return (
    <section
      id="sec-sync"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100 flex items-center gap-2">
            {cfg ? <Cloud className="w-5 h-5 text-[var(--accent)]" /> : <CloudOff className="w-5 h-5 text-stone-400" />}
            <span>Multi-device Google Drive sync</span>
          </h2>
          <p className="text-sm text-stone-500 dark:text-slate-400 mt-1">
            Saves trip data and receipt photos into your own Google Drive folder using your Apps Script web app, keeping all connected devices in sync automatically.
          </p>
        </div>
        {pendingReceipts > 0 && (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 px-2.5 py-1 rounded-lg whitespace-nowrap">
            {pendingReceipts} receipt{pendingReceipts === 1 ? '' : 's'} queued for Drive upload
          </span>
        )}
      </div>

      <form onSubmit={handleConnectSubmit} className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-6">
          <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
            Apps Script Web app URL
          </label>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div className="md:col-span-4">
          <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
            Access code
          </label>
          <input
            type="password"
            autoComplete="off"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="12+ char admin code"
            className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap"
          >
            {cfg ? 'Reconnect' : 'Connect'}
          </button>
        </div>
      </form>

      {syncStatus && (
        <p
          className={`mt-3 text-xs font-medium ${
            conflict || !syncOk ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {syncStatus}
        </p>
      )}

      {cfg && (
        <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-stone-100 dark:border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSyncNow()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-stone-800 dark:text-slate-100 hover:bg-stone-50 dark:hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            <span>Sync now</span>
          </button>

          <button
            type="button"
            onClick={handlePairDevice}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-ink)] border border-[var(--accent)]/30 hover:opacity-90 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Laptop className="w-3.5 h-3.5" />
            <QrCode className="w-3.5 h-3.5" />
            <span>Pair another device</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void onLoadFromDrive()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>Load from Drive</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void onOverwriteDrive()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Overwrite Drive</span>
          </button>

          <button
            type="button"
            onClick={onDisconnect}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs font-medium whitespace-nowrap cursor-pointer"
          >
            Disconnect
          </button>

          <button
            type="button"
            onClick={() => setConfirmWipe((v) => !v)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove all data…</span>
          </button>
        </div>
      )}

      {confirmWipe && (
        <div className="mt-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60">
          <p className="text-xs font-medium text-red-800 dark:text-red-200">
            This moves camp-split-data.json to your Google Drive trash and clears local trip data. Enter your admin access code to confirm:
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <input
              type="password"
              value={wipeCode}
              onChange={(e) => setWipeCode(e.target.value)}
              placeholder="Admin access code"
              className="flex-1 min-w-[180px] rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-stone-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => void handleConfirmWipe()}
              className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmWipe(false);
                setWipeCode('');
                setWipeError('');
              }}
              className="px-3.5 py-2 rounded-lg border border-stone-300 dark:border-slate-700 text-stone-700 dark:text-slate-300 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
          {wipeError && <p className="mt-1.5 text-xs text-red-700 dark:text-red-400">{wipeError}</p>}
        </div>
      )}

      <details className="mt-4 pt-3 border-t border-stone-100 dark:border-slate-800">
        <summary className="text-sm font-medium text-stone-700 dark:text-slate-300 cursor-pointer select-none">
          How to set up Google Drive sync &amp; receipt uploads (about 3 minutes)
        </summary>
        <ol className="mt-3 space-y-1.5 text-xs sm:text-sm text-stone-600 dark:text-slate-400 list-decimal list-inside">
          <li>
            In Google Drive, open your folder (e.g. Camp Split Data) and copy its folder ID from the URL (the text after <code className="font-mono">/folders/</code>).
          </li>
          <li>
            Go to <span className="font-mono">script.google.com</span>, create or open your project, and paste the updated <code className="font-mono">Code.gs</code> script below (this supports saving receipt photos directly to the same folder).
          </li>
          <li>
            Choose <strong>Deploy → New deployment</strong> (or Manage deployments → New version) as <strong>Web app</strong>, Execute as <strong>Me</strong>, Who has access: <strong>Anyone</strong>.
          </li>
          <li>
            Paste the Web app URL (ending in <code className="font-mono">/exec</code>) and your access code above, then press <strong>Connect</strong>. Use <strong>Pair another device</strong> to scan and connect extra devices in seconds.
          </li>
        </ol>
        <div className="mt-3">
          <textarea
            readOnly
            rows={7}
            value={CODE_GS_SOURCE}
            className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 p-3 font-mono text-xs text-stone-800 dark:text-slate-200"
          />
          <button
            type="button"
            onClick={() => void handleCopyScript()}
            className="mt-2 min-h-[38px] px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedScript ? 'Copied Code.gs' : 'Copy Code.gs script'}</span>
          </button>
        </div>
      </details>
    </section>
  );
}
