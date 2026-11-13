import type { ThemeKey } from '../types';

export type ChartVariant = 'pie' | 'donut' | 'stacked-bar';
export type BalanceVariant =
  | 'cards'
  | 'diverging-bars'
  | 'fintech-rows'
  | 'dual-bars'
  | 'avatar-cards'
  | 'matrix';
export type ExpenseFeedVariant = 'list' | 'timeline';

export interface ThemeConfig {
  key: ThemeKey;
  name: string;
  tagline: string;
  swatch: string;
  swatchSecondary: string;
  chartVariant: ChartVariant;
  balanceVariant: BalanceVariant;
  expenseFeedVariant: ExpenseFeedVariant;
  pageBgClass: string;
  headerClass: string;
  cardClass: string;
  subCardClass: string;
  kpiLayout: 'grid-6' | 'bento-hero' | 'strip-2row';
}

export const THEME_CONFIGS: ThemeConfig[] = [
  {
    key: 'trailhead',
    name: 'Trailhead',
    tagline: 'Balanced cards · Pie chart · Zero-scroll summary',
    swatch: '#15803d',
    swatchSecondary: '#dcfce7',
    chartVariant: 'pie',
    balanceVariant: 'cards',
    expenseFeedVariant: 'list',
    pageBgClass: 'bg-stone-50 dark:bg-slate-950',
    headerClass: 'bg-white/90 dark:bg-slate-900/90 border-stone-200 dark:border-slate-800',
    cardClass:
      'rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800',
    subCardClass:
      'rounded-xl bg-stone-50 dark:bg-slate-950 border border-stone-100 dark:border-slate-800/80',
    kpiLayout: 'grid-6',
  },
  {
    key: 'bento',
    name: 'Bento Pulse',
    tagline: 'Hero spend tile · Donut ring · Diverging balance bars',
    swatch: '#0284c7',
    swatchSecondary: '#e0f2fe',
    chartVariant: 'donut',
    balanceVariant: 'diverging-bars',
    expenseFeedVariant: 'list',
    pageBgClass: 'bg-slate-50 dark:bg-slate-950',
    headerClass: 'bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800',
    cardClass:
      'rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm',
    subCardClass:
      'rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800',
    kpiLayout: 'bento-hero',
  },
  {
    key: 'fintech',
    name: 'Swiss Ledger',
    tagline: 'Stacked spend bar · Crisp fintech ledger rows',
    swatch: '#2563eb',
    swatchSecondary: '#dbeafe',
    chartVariant: 'stacked-bar',
    balanceVariant: 'fintech-rows',
    expenseFeedVariant: 'list',
    pageBgClass: 'bg-zinc-50 dark:bg-zinc-950',
    headerClass: 'bg-white/95 dark:bg-zinc-900/95 border-zinc-200 dark:border-zinc-800',
    cardClass:
      'rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800',
    subCardClass:
      'rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800',
    kpiLayout: 'strip-2row',
  },
  {
    key: 'horizon',
    name: 'Glass Horizon',
    tagline: 'Frosted surfaces · Donut ring · Paid vs. share dual bars',
    swatch: '#4f46e5',
    swatchSecondary: '#e0e7ff',
    chartVariant: 'donut',
    balanceVariant: 'dual-bars',
    expenseFeedVariant: 'list',
    pageBgClass:
      'bg-gradient-to-br from-indigo-50/80 via-slate-50 to-sky-50/70 dark:from-slate-950 dark:via-indigo-950/40 dark:to-slate-950',
    headerClass:
      'bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border-indigo-200/60 dark:border-indigo-900/50',
    cardClass:
      'rounded-2xl bg-white/80 dark:bg-slate-900/75 backdrop-blur-md border border-indigo-200/60 dark:border-slate-800/90 shadow-sm',
    subCardClass:
      'rounded-xl bg-white/70 dark:bg-slate-950/60 border border-indigo-100 dark:border-slate-800',
    kpiLayout: 'bento-hero',
  },
  {
    key: 'campfire',
    name: 'Campfire Journal',
    tagline: 'Warm sand tones · Avatar cards · Date-grouped timeline',
    swatch: '#c2410c',
    swatchSecondary: '#ffedd5',
    chartVariant: 'pie',
    balanceVariant: 'avatar-cards',
    expenseFeedVariant: 'timeline',
    pageBgClass: 'bg-orange-50/40 dark:bg-stone-950',
    headerClass: 'bg-amber-50/90 dark:bg-stone-900/90 border-orange-200/70 dark:border-stone-800',
    cardClass:
      'rounded-3xl bg-white dark:bg-stone-900 border border-orange-200/70 dark:border-stone-800',
    subCardClass:
      'rounded-2xl bg-orange-50/50 dark:bg-stone-950 border border-orange-100 dark:border-stone-800',
    kpiLayout: 'grid-6',
  },
  {
    key: 'alpine',
    name: 'Alpine Mint',
    tagline: 'Teal precision · Donut chart · Compact split matrix',
    swatch: '#0f766e',
    swatchSecondary: '#ccfbf1',
    chartVariant: 'donut',
    balanceVariant: 'matrix',
    expenseFeedVariant: 'timeline',
    pageBgClass: 'bg-slate-100/70 dark:bg-slate-950',
    headerClass: 'bg-white/90 dark:bg-slate-900/90 border-teal-200/60 dark:border-slate-800',
    cardClass:
      'rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800',
    subCardClass:
      'rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800',
    kpiLayout: 'strip-2row',
  },
];

export function getThemeConfig(key: ThemeKey | '' | undefined): ThemeConfig {
  return THEME_CONFIGS.find((t) => t.key === key) || THEME_CONFIGS[0];
}

export function mapLegacyTheme(raw: unknown): ThemeKey {
  switch (raw) {
    case 'trailhead':
    case 'forest':
      return 'trailhead';
    case 'bento':
    case 'ocean':
      return 'bento';
    case 'fintech':
      return 'fintech';
    case 'horizon':
    case 'indigo':
    case 'lavender':
      return 'horizon';
    case 'campfire':
    case 'sunset':
      return 'campfire';
    case 'alpine':
      return 'alpine';
    default:
      return 'trailhead';
  }
}
