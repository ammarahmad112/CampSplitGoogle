import { useState } from 'react';
import { Lock } from 'lucide-react';
import type { PinLock } from '../types';
import { hashPin } from '../lib/storage';
import { uid } from '../lib/calc';

interface PinLockModalProps {
  mode: 'unlock' | 'set' | null;
  lock: PinLock | undefined;
  onUnlock: () => void;
  onSetPin: (newLock: PinLock) => void;
  onCancelSet: () => void;
}

export function PinLockModal({ mode, lock, onUnlock, onSetPin, onCancelSet }: PinLockModalProps) {
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const [fails, setFails] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  if (!mode) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Date.now() < lockedUntil) {
      setErr('Too many attempts. Please wait a moment.');
      return;
    }
    if (!window.crypto || !crypto.subtle) {
      setErr('PIN lock requires a secure (HTTPS) connection.');
      return;
    }

    if (mode === 'set') {
      if (!/^\d{4,12}$/.test(pin1)) {
        setErr('Use 4 to 12 digits.');
        return;
      }
      if (pin1 !== pin2) {
        setErr('The PINs do not match.');
        return;
      }
      const salt = uid() + uid();
      const hash = await hashPin(pin1, salt);
      setPin1('');
      setPin2('');
      setErr('');
      onSetPin({ salt, hash });
      return;
    }

    if (!lock) {
      onUnlock();
      return;
    }
    const check = await hashPin(pin1, lock.salt);
    if (check === lock.hash) {
      setFails(0);
      setPin1('');
      setErr('');
      onUnlock();
    } else {
      const nextFails = fails + 1;
      setFails(nextFails);
      setPin1('');
      setErr('Wrong PIN.');
      if (nextFails >= 3) {
        const waitMs = Math.min(30, nextFails * 5) * 1000;
        setLockedUntil(Date.now() + waitMs);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-100 dark:bg-slate-950 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-xl p-6 text-center"
      >
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-3">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-stone-900 dark:text-slate-100">
          {mode === 'set' ? 'Create a PIN' : 'Enter PIN'}
        </h2>
        <p className="text-xs text-stone-500 dark:text-slate-400 mt-1 mb-4">
          {mode === 'set' ? '4–12 numeric digits to lock this device' : 'Camp Split is locked'}
        </p>

        <div className="space-y-2.5">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            autoFocus
            value={pin1}
            onChange={(e) => setPin1(e.target.value)}
            className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-center text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          {mode === 'set' && (
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Repeat PIN"
              value={pin2}
              onChange={(e) => setPin2(e.target.value)}
              className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-center text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          )}
        </div>

        {err && <p className="mt-2.5 text-xs text-red-600 dark:text-red-400">{err}</p>}

        <div className="mt-4 space-y-2">
          <button
            type="submit"
            className="w-full min-h-[44px] rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm cursor-pointer transition-colors"
          >
            {mode === 'set' ? 'Save PIN' : 'Unlock'}
          </button>
          {mode === 'set' && (
            <button
              type="button"
              onClick={() => {
                setPin1('');
                setPin2('');
                setErr('');
                onCancelSet();
              }}
              className="w-full min-h-[44px] rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
