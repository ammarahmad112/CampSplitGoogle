export type SectionKey =
  | 'settings'
  | 'friends'
  | 'barakah'
  | 'expenses'
  | 'summary'
  | 'xfers'
  | 'pays';

export type ExpenseCategory = 'food' | 'rent' | 'fuel' | 'other';

export type ThemeKey =
  | 'trailhead'
  | 'bento'
  | 'fintech'
  | 'horizon'
  | 'campfire'
  | 'alpine';

export type DarkModeSetting = 'light' | 'dark' | 'system';

export interface TripSettings {
  name: string;
  emoji: string;
  img: string;
  cur: string;
  clean: number;
  start: string;
}

export interface Person {
  id: string;
  name: string;
  car: boolean;
  joinDate: string;
}

export interface ReceiptMeta {
  id?: string;
  name: string;
  url?: string;
  thumb?: string;
  pending?: boolean;
}

export interface Expense {
  id: string;
  desc: string;
  amt: number;
  by: string;
  date: string;
  cat: ExpenseCategory;
  split: string[] | null;
  receipt?: ReceiptMeta | null;
}

export interface Payment {
  id: string;
  from: string;
  to: string;
  amt: number;
}

export interface Contribution {
  id: string;
  who: string;
  amt: number;
  date: string;
}

export interface PinLock {
  salt: string;
  hash: string;
}

export interface PersonSummary {
  paid: number;
  in: number;
  share: number;
  allow: number;
  sent: number;
  recv: number;
  net: number;
}

export interface Transfer {
  from: string;
  to: string;
  amt: number;
}

export interface CalcResult {
  r: Record<string, PersonSummary>;
  total: number;
  cat: Record<string, number>;
  cars: number;
  cleanTotal: number;
  tx: Transfer[];
  n: number;
  kCash: number;
  kIn: number;
  kExp: number;
}

export interface TripState {
  trip: TripSettings;
  people: Person[];
  expenses: Expense[];
  payments: Payment[];
  contribs: Contribution[];
  theme: ThemeKey | '';
  darkMode?: DarkModeSetting;
  lock?: PinLock;
  lastBackup?: number;
  _calc?: CalcResult;
  _show?: SectionKey[];
}

export interface SyncConfig {
  url: string;
  code: string;
  syncedAt: number;
  h: string;
  role?: 'admin' | 'viewer';
  hintTheme?: ThemeKey;
  hintDark?: DarkModeSetting;
}

export interface ViewerUser {
  id: string;
  name: string;
  code: string;
  show: SectionKey[];
  ts?: number;
}

export interface QrSharePayload {
  title: string;
  subtitle: string;
  url: string;
  note?: string;
}
