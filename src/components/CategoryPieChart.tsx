import { useState } from 'react';
import type { ExpenseCategory } from '../types';
import type { ChartVariant } from '../lib/themes';
import { formatMoney } from '../lib/calc';

interface CategoryPieChartProps {
  catTotals: Record<string, number>;
  totalExpenses: number;
  currency: string;
  variant?: ChartVariant;
}

interface CategoryMeta {
  key: ExpenseCategory;
  label: string;
  color: string;
}

const CATEGORIES: CategoryMeta[] = [
  { key: 'food', label: 'Food', color: '#10b981' },
  { key: 'rent', label: 'Rentals', color: '#0ea5e9' },
  { key: 'fuel', label: 'Fuel', color: '#f59e0b' },
  { key: 'other', label: 'Other', color: '#6366f1' },
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describePieSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M',
    cx,
    cy,
    'L',
    start.x.toFixed(3),
    start.y.toFixed(3),
    'A',
    r,
    r,
    0,
    largeArcFlag,
    0,
    end.x.toFixed(3),
    end.y.toFixed(3),
    'Z',
  ].join(' ');
}

export function CategoryPieChart({
  catTotals,
  totalExpenses,
  currency,
  variant = 'pie',
}: CategoryPieChartProps) {
  const [activeKey, setActiveKey] = useState<ExpenseCategory | null>(null);

  const items = CATEGORIES.map((c) => {
    const amount = Number(catTotals[c.key]) || 0;
    const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
    return { ...c, amount, pct };
  }).filter((item) => item.amount > 0.005);

  let cursor = 0;
  const slices = items.map((item) => {
    const sweep = totalExpenses > 0 ? (item.amount / totalExpenses) * 360 : 0;
    const startAngle = cursor;
    const endAngle = cursor + sweep;
    cursor = endAngle;
    return { ...item, startAngle, endAngle, sweep };
  });

  const activeSlice = slices.find((s) => s.key === activeKey) || null;

  return (
    <div className="mt-6 pt-5 border-t border-stone-100 dark:border-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">
            Expenses by category
          </h3>
          <p className="text-xs text-stone-500 dark:text-slate-400">
            Distribution across logged trip expenses
          </p>
        </div>
        {totalExpenses > 0 && (
          <div className="text-xs text-stone-600 dark:text-slate-300 font-mono-num">
            {activeSlice ? (
              <span>
                {activeSlice.label}: <strong>{formatMoney(activeSlice.amount, currency)}</strong> (
                {activeSlice.pct.toFixed(1)}%)
              </span>
            ) : (
              <span>
                Total: <strong>{formatMoney(totalExpenses, currency)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {slices.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-slate-400 py-2">
          Add expenses to see category distribution.
        </p>
      ) : variant === 'stacked-bar' ? (
        <div className="space-y-4">
          <div
            className="w-full h-5 rounded-lg overflow-hidden flex bg-stone-100 dark:bg-slate-800"
            role="img"
            aria-label="Stacked bar of expenses by category"
          >
            {slices.map((slice) => {
              const isActive = activeKey === slice.key;
              const dimmed = activeKey !== null && !isActive;
              return (
                <button
                  key={slice.key}
                  type="button"
                  title={`${slice.label}: ${formatMoney(slice.amount, currency)} (${slice.pct.toFixed(1)}%)`}
                  style={{
                    width: `${slice.pct}%`,
                    backgroundColor: slice.color,
                    opacity: dimmed ? 0.4 : 1,
                  }}
                  onMouseEnter={() => setActiveKey(slice.key)}
                  onMouseLeave={() => setActiveKey(null)}
                  onClick={() => setActiveKey((cur) => (cur === slice.key ? null : slice.key))}
                  className="h-full transition-opacity duration-150 cursor-pointer border-r border-white/60 dark:border-slate-900/60 last:border-r-0"
                />
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => {
              const amount = Number(catTotals[cat.key]) || 0;
              const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
              const isActive = activeKey === cat.key;
              const hasValue = amount > 0.005;
              return (
                <button
                  key={cat.key}
                  type="button"
                  disabled={!hasValue}
                  onMouseEnter={() => hasValue && setActiveKey(cat.key)}
                  onMouseLeave={() => setActiveKey(null)}
                  onClick={() =>
                    hasValue && setActiveKey((cur) => (cur === cat.key ? null : cat.key))
                  }
                  className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-left transition-colors ${
                    isActive
                      ? 'bg-stone-100 dark:bg-slate-800 border-stone-300 dark:border-slate-600'
                      : 'border-stone-200/70 dark:border-slate-800'
                  } ${hasValue ? 'cursor-pointer' : 'opacity-45 cursor-default'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-sm font-medium text-stone-800 dark:text-slate-200 truncate">
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono-num shrink-0">
                    <span className="text-xs text-stone-500 dark:text-slate-400">{pct.toFixed(1)}%</span>
                    <span className="text-sm font-semibold text-stone-900 dark:text-slate-100">
                      {formatMoney(amount, currency)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-5 flex justify-center">
            <div className="relative inline-flex items-center justify-center">
              <svg
                viewBox="0 0 220 220"
                className="w-44 h-44 sm:w-52 sm:h-52 overflow-visible select-none"
                role="img"
                aria-label="Pie chart of expenses by category"
              >
                {slices.length === 1 ? (
                  <circle
                    cx={110}
                    cy={110}
                    r={92}
                    fill={slices[0].color}
                    tabIndex={0}
                    role="button"
                    aria-label={`${slices[0].label}: ${formatMoney(slices[0].amount, currency)} (100%)`}
                    onMouseEnter={() => setActiveKey(slices[0].key)}
                    onMouseLeave={() => setActiveKey(null)}
                    onFocus={() => setActiveKey(slices[0].key)}
                    onBlur={() => setActiveKey(null)}
                    onClick={() =>
                      setActiveKey((cur) => (cur === slices[0].key ? null : slices[0].key))
                    }
                    className="stroke-white dark:stroke-slate-900 stroke-[3px] cursor-pointer transition-transform duration-150 origin-center hover:scale-[1.03] focus:outline-none"
                  />
                ) : (
                  slices.map((slice) => {
                    const isActive = activeKey === slice.key;
                    const dimmed = activeKey !== null && !isActive;
                    const midAngle = (slice.startAngle + slice.endAngle) / 2;
                    const rad = ((midAngle - 90) * Math.PI) / 180;
                    const offset = isActive ? 6 : 0;
                    const tx = Math.cos(rad) * offset;
                    const ty = Math.sin(rad) * offset;

                    return (
                      <path
                        key={slice.key}
                        d={describePieSlice(110, 110, 92, slice.startAngle, slice.endAngle)}
                        fill={slice.color}
                        tabIndex={0}
                        role="button"
                        aria-label={`${slice.label}: ${formatMoney(slice.amount, currency)} (${slice.pct.toFixed(1)}%)`}
                        style={{
                          transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`,
                          opacity: dimmed ? 0.45 : 1,
                        }}
                        onMouseEnter={() => setActiveKey(slice.key)}
                        onMouseLeave={() => setActiveKey(null)}
                        onFocus={() => setActiveKey(slice.key)}
                        onBlur={() => setActiveKey(null)}
                        onClick={() =>
                          setActiveKey((cur) => (cur === slice.key ? null : slice.key))
                        }
                        className="stroke-white dark:stroke-slate-900 stroke-[2.5px] cursor-pointer transition-[transform,opacity] duration-150 focus:outline-none"
                      />
                    );
                  })
                )}

                {variant === 'donut' && (
                  <circle
                    cx={110}
                    cy={110}
                    r={52}
                    className="fill-white dark:fill-slate-900 pointer-events-none"
                  />
                )}
              </svg>

              {variant === 'donut' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
                  <span className="text-[11px] font-medium text-stone-500 dark:text-slate-400">
                    {activeSlice ? activeSlice.label : 'Expenses'}
                  </span>
                  <span className="text-sm sm:text-base font-bold font-mono-num text-stone-900 dark:text-slate-100 mt-0.5">
                    {formatMoney(activeSlice ? activeSlice.amount : totalExpenses, currency)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="md:col-span-7 divide-y divide-stone-100 dark:divide-slate-800/80">
            {CATEGORIES.map((cat) => {
              const amount = Number(catTotals[cat.key]) || 0;
              const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
              const isActive = activeKey === cat.key;
              const hasValue = amount > 0.005;

              return (
                <button
                  key={cat.key}
                  type="button"
                  disabled={!hasValue}
                  onMouseEnter={() => hasValue && setActiveKey(cat.key)}
                  onMouseLeave={() => setActiveKey(null)}
                  onClick={() =>
                    hasValue && setActiveKey((cur) => (cur === cat.key ? null : cat.key))
                  }
                  className={`w-full py-2.5 px-2 flex items-center justify-between gap-3 text-left rounded-lg transition-colors ${
                    isActive ? 'bg-stone-50 dark:bg-slate-800/60' : ''
                  } ${hasValue ? 'cursor-pointer hover:bg-stone-50 dark:hover:bg-slate-800/40' : 'opacity-50 cursor-default'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-stone-800 dark:text-slate-200 truncate">
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 font-mono-num">
                    <span className="text-xs text-stone-500 dark:text-slate-400 w-12 text-right">
                      {pct.toFixed(1)}%
                    </span>
                    <span className="text-sm font-semibold text-stone-900 dark:text-slate-100 min-w-[76px] text-right">
                      {formatMoney(amount, currency)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
