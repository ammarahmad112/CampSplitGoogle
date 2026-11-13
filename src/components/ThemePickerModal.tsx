import { useEffect } from 'react';
import { Check, Moon, Sun, Monitor, X } from 'lucide-react';
import type { DarkModeSetting, ThemeKey } from '../types';
import { THEME_CONFIGS } from '../lib/themes';

interface ThemePickerModalProps {
  open: boolean;
  activeTheme: ThemeKey;
  darkMode: DarkModeSetting;
  onSelectTheme: (key: ThemeKey) => void;
  onSelectDarkMode: (mode: DarkModeSetting) => void;
  onClose: () => void;
}

export function ThemePickerModal({
  open,
  activeTheme,
  darkMode,
  onSelectTheme,
  onSelectDarkMode,
  onClose,
}: ThemePickerModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="theme-modal-title" className="text-lg font-semibold text-stone-900 dark:text-slate-100">
              Themes &amp; display style
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-slate-400 mt-0.5">
              Changes both colors and how data is displayed. Synced shared links mirror your theme live.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close theme picker"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Light / Dark / System selector */}
        <div className="mt-4">
          <span className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-2">
            Appearance
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: 'light', label: 'Light', Icon: Sun },
                { key: 'dark', label: 'Dark', Icon: Moon },
                { key: 'system', label: 'System', Icon: Monitor },
              ] as const
            ).map(({ key, label, Icon }) => {
              const active = darkMode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDarkMode(key)}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-ink)]'
                      : 'border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 6 Full Modern Themes */}
        <div className="mt-5">
          <span className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-2">
            Layout &amp; data theme
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {THEME_CONFIGS.map((t) => {
              const active = activeTheme === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onSelectTheme(t.key)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]/50 ring-1 ring-[var(--accent)]'
                      : 'border-stone-200 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700 bg-stone-50/50 dark:bg-slate-950/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                        style={{ backgroundColor: t.swatch }}
                      />
                      <span className="font-semibold text-sm text-stone-900 dark:text-slate-100 truncate">
                        {t.name}
                      </span>
                    </div>
                    {active && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
                  </div>
                  <p className="mt-1.5 text-xs text-stone-500 dark:text-slate-400 leading-relaxed">
                    {t.tagline}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
