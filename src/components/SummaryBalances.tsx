import { Car } from 'lucide-react';
import type { CalcResult, Person } from '../types';
import type { BalanceVariant } from '../lib/themes';
import { formatMoney } from '../lib/calc';

interface SummaryBalancesProps {
  people: Person[];
  calc: CalcResult;
  currency: string;
  variant: BalanceVariant;
  subCardClass: string;
}

function getNetText(net: number, currency: string) {
  if (net > 0.005) return `gets ${formatMoney(net, currency)}`;
  if (net < -0.005) return `owes ${formatMoney(-net, currency)}`;
  return 'all square';
}

function getNetColorClass(net: number) {
  if (net > 0.005) return 'text-emerald-700 dark:text-emerald-400';
  if (net < -0.005) return 'text-red-600 dark:text-red-400';
  return 'text-stone-500 dark:text-slate-400';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SummaryBalances({
  people,
  calc,
  currency,
  variant,
  subCardClass,
}: SummaryBalancesProps) {
  if (people.length === 0) return null;

  const maxAbsNet = Math.max(
    1,
    ...people.map((p) => Math.abs(calc.r[p.id]?.net || 0))
  );
  const maxPaidOrShare = Math.max(
    1,
    ...people.map((p) => {
      const q = calc.r[p.id];
      return q ? Math.max(q.paid + q.allow, q.share) : 0;
    })
  );

  // 1. Swiss FinTech Ledger Rows (zero horizontal scrolling on all screens)
  if (variant === 'fintech-rows') {
    return (
      <div className="mt-6 pt-5 border-t border-stone-100 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100 mb-3">
          Member ledger
        </h3>
        <div className="divide-y divide-stone-100 dark:divide-slate-800/80">
          {people.map((p) => {
            const q = calc.r[p.id] || { paid: 0, in: 0, share: 0, allow: 0, sent: 0, recv: 0, net: 0 };
            const outOfPocket = q.paid - q.in;
            const settled = q.sent - q.recv;
            return (
              <div
                key={p.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {p.car && <Car className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                    <span className="font-semibold text-sm text-stone-900 dark:text-slate-100 truncate">
                      {p.name}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 dark:text-slate-400 font-mono-num mt-0.5">
                    Out of pocket {formatMoney(outOfPocket, currency)} · Barakah {formatMoney(q.in, currency)} · Share{' '}
                    {formatMoney(q.share, currency)}
                    {q.allow > 0 ? ` · Clean +${formatMoney(q.allow, currency)}` : ''}
                    {Math.abs(settled) > 0.005 ? ` · Settled ${formatMoney(settled, currency)}` : ''}
                  </p>
                </div>
                <div className={`font-mono-num text-sm font-bold whitespace-nowrap ${getNetColorClass(q.net)}`}>
                  {getNetText(q.net, currency)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. Diverging Balance Bars (Bento Pulse)
  if (variant === 'diverging-bars') {
    return (
      <div className="mt-6 pt-5 border-t border-stone-100 dark:border-slate-800">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">
            Net balance overview
          </h3>
          <span className="text-xs text-stone-500 dark:text-slate-400">
            Left = owes · Right = gets back
          </span>
        </div>
        <div className="space-y-2.5">
          {people.map((p) => {
            const q = calc.r[p.id] || { paid: 0, in: 0, share: 0, allow: 0, sent: 0, recv: 0, net: 0 };
            const pct = Math.min(100, (Math.abs(q.net) / maxAbsNet) * 100);
            const isPos = q.net > 0.005;
            const isNeg = q.net < -0.005;

            return (
              <div key={p.id} className={`${subCardClass} p-3`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-stone-900 dark:text-slate-100 inline-flex items-center gap-1.5 min-w-0 truncate">
                    {p.car && <Car className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className={`font-mono-num text-sm font-bold whitespace-nowrap ${getNetColorClass(q.net)}`}>
                    {getNetText(q.net, currency)}
                  </span>
                </div>

                {/* Diverging bar centered */}
                <div className="mt-2 grid grid-cols-2 items-center gap-0.5 h-2 rounded-full bg-stone-200/70 dark:bg-slate-800 overflow-hidden">
                  <div className="flex justify-end h-full">
                    {isNeg && (
                      <div
                        className="h-full bg-red-500 dark:bg-red-400 rounded-l-full"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-start h-full">
                    {isPos && (
                      <div
                        className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-r-full"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-stone-500 dark:text-slate-400 font-mono-num">
                  <span>Paid: {formatMoney(q.paid, currency)}</span>
                  <span>Share: {formatMoney(q.share, currency)}</span>
                  <span className="text-right">
                    {q.allow > 0 ? `Clean: ${formatMoney(q.allow, currency)}` : `Barakah: ${formatMoney(q.in, currency)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 3. Paid vs Fair Share Dual-Bar Comparison (Glass Horizon)
  if (variant === 'dual-bars') {
    return (
      <div className="mt-6 pt-5 border-t border-stone-100 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100 mb-3">
          Paid vs. fair share
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {people.map((p) => {
            const q = calc.r[p.id] || { paid: 0, in: 0, share: 0, allow: 0, sent: 0, recv: 0, net: 0 };
            const contributed = q.paid + q.allow;
            const contribPct = Math.min(100, (contributed / maxPaidOrShare) * 100);
            const sharePct = Math.min(100, (q.share / maxPaidOrShare) * 100);

            return (
              <div key={p.id} className={`${subCardClass} p-3.5`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-stone-900 dark:text-slate-100 inline-flex items-center gap-1.5 min-w-0 truncate">
                    {p.car && <Car className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className={`font-mono-num text-xs font-bold whitespace-nowrap ${getNetColorClass(q.net)}`}>
                    {getNetText(q.net, currency)}
                  </span>
                </div>

                <div className="mt-2.5 space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px] text-stone-500 dark:text-slate-400 font-mono-num mb-0.5">
                      <span>Contributed (paid + clean)</span>
                      <span>{formatMoney(contributed, currency)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-stone-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${contribPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-stone-500 dark:text-slate-400 font-mono-num mb-0.5">
                      <span>Fair share</span>
                      <span>{formatMoney(q.share, currency)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-stone-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-stone-400 dark:bg-slate-500"
                        style={{ width: `${sharePct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 4. Avatar Cards (Campfire Journal) or Compact Balance Cards / Matrix (Trailhead / Alpine)
  return (
    <div className="mt-6 pt-5 border-t border-stone-100 dark:border-slate-800">
      <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100 mb-3">
        Friend balances
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {people.map((p) => {
          const q = calc.r[p.id] || { paid: 0, in: 0, share: 0, allow: 0, sent: 0, recv: 0, net: 0 };
          const settled = q.sent - q.recv;
          const outOfPocket = q.paid - q.in;

          return (
            <div key={p.id} className={`${subCardClass} p-3.5`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {variant === 'avatar-cards' && (
                    <span className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] text-xs font-bold inline-flex items-center justify-center shrink-0">
                      {initialsOf(p.name)}
                    </span>
                  )}
                  <span className="font-semibold text-sm text-stone-900 dark:text-slate-100 truncate inline-flex items-center gap-1.5">
                    {p.car && <Car className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                    <span className="truncate">{p.name}</span>
                  </span>
                </div>
                <span className={`font-mono-num text-sm font-bold whitespace-nowrap ${getNetColorClass(q.net)}`}>
                  {getNetText(q.net, currency)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-mono-num">
                <div className="flex justify-between gap-1 text-stone-500 dark:text-slate-400">
                  <span>Out of pocket</span>
                  <span className="text-stone-800 dark:text-slate-200 font-medium">
                    {formatMoney(outOfPocket, currency)}
                  </span>
                </div>
                <div className="flex justify-between gap-1 text-stone-500 dark:text-slate-400">
                  <span>In Barakah</span>
                  <span className="text-stone-800 dark:text-slate-200 font-medium">
                    {formatMoney(q.in, currency)}
                  </span>
                </div>
                <div className="flex justify-between gap-1 text-stone-500 dark:text-slate-400">
                  <span>Fair share</span>
                  <span className="text-stone-800 dark:text-slate-200 font-medium">
                    {formatMoney(q.share, currency)}
                  </span>
                </div>
                <div className="flex justify-between gap-1 text-stone-500 dark:text-slate-400">
                  <span>{q.allow > 0 ? 'Cleaning' : 'Settled'}</span>
                  <span className="text-stone-800 dark:text-slate-200 font-medium">
                    {q.allow > 0 ? formatMoney(q.allow, currency) : formatMoney(settled, currency)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
