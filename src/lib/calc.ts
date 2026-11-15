import type { CalcResult, DarkModeSetting, Expense, Person, SectionKey, TripState } from '../types';
import { mapLegacyTheme } from './themes';

export const ALL_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'settings', label: 'Trip settings' },
  { key: 'friends', label: 'Friends' },
  { key: 'barakah', label: 'Barakah' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'summary', label: 'Summary' },
  { key: 'xfers', label: 'Who pays whom' },
  { key: 'pays', label: 'Paid back' },
];

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function todayStr(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function blankState(): TripState {
  return {
    trip: {
      name: 'Camp Split',
      emoji: '🏕️',
      img: '',
      cur: '$',
      clean: 15,
      start: todayStr(),
    },
    people: [],
    expenses: [],
    payments: [],
    contribs: [],
    theme: 'trailhead',
  };
}

const sid = (v: unknown) => String(v == null ? '' : v).replace(/[^\w-]/g, '').slice(0, 48);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dt = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? v : '');
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function normalizeState(raw: unknown): TripState {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const b = blankState();
  const rawTrip = o.trip && typeof o.trip === 'object' ? (o.trip as Record<string, unknown>) : {};
  const imgStr = typeof rawTrip.img === 'string' ? rawTrip.img : '';

  const cleanVal = Math.max(0, num(rawTrip.clean ?? b.trip.clean));
  const trip = {
    name: String(rawTrip.name ?? b.trip.name).slice(0, 60) || 'Camp Split',
    emoji: String(rawTrip.emoji ?? b.trip.emoji).slice(0, 4) || '🏕️',
    cur: String(rawTrip.cur ?? b.trip.cur).slice(0, 3) || '$',
    clean: cleanVal,
    start: dt(rawTrip.start) || b.trip.start,
    img: /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(imgStr) ? imgStr : '',
  };

  const people: Person[] = arr<Record<string, unknown>>(o.people).map((p) => ({
    id: sid(p.id),
    name: String(p.name ?? '').slice(0, 40),
    car: !!p.car,
    joinDate: dt(p.joinDate),
  }));

  const expenses: Expense[] = arr<Record<string, unknown>>(o.expenses).map((e) => {
    const rec = e.receipt && typeof e.receipt === 'object' ? (e.receipt as Record<string, unknown>) : null;
    const thumbStr = rec && typeof rec.thumb === 'string' ? rec.thumb : '';
    const receipt = rec
      ? {
          id: rec.id ? sid(rec.id) : undefined,
          name: String(rec.name ?? 'receipt.jpg').slice(0, 80),
          url: typeof rec.url === 'string' && /^https:\/\/drive\.google\.com\//.test(rec.url) ? rec.url : undefined,
          thumb: /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(thumbStr) ? thumbStr : undefined,
          pending: !!rec.pending,
        }
      : null;

    return {
      id: sid(e.id),
      desc: String(e.desc ?? '').slice(0, 120),
      amt: Math.max(0, num(e.amt)),
      by: sid(e.by),
      date: dt(e.date),
      cat: (['food', 'rent', 'fuel', 'other'].includes(String(e.cat)) ? e.cat : 'other') as Expense['cat'],
      split: Array.isArray(e.split) ? e.split.map(sid) : null,
      receipt,
    };
  });

  const payments = arr<Record<string, unknown>>(o.payments).map((x) => ({
    id: sid(x.id),
    from: sid(x.from),
    to: sid(x.to),
    amt: Math.max(0, num(x.amt)),
  }));

  const contribs = arr<Record<string, unknown>>(o.contribs).map((x) => ({
    id: sid(x.id),
    who: sid(x.who),
    amt: Math.max(0, num(x.amt)),
    date: dt(x.date),
  }));

  const theme = mapLegacyTheme(o.theme);
  const darkMode =
    o.darkMode === 'light' || o.darkMode === 'dark' || o.darkMode === 'system'
      ? (o.darkMode as DarkModeSetting)
      : undefined;

  const result: TripState = {
    trip,
    people,
    expenses,
    payments,
    contribs,
    theme,
    ...(darkMode ? { darkMode } : {}),
  };

  const lock = o.lock && typeof o.lock === 'object' ? (o.lock as Record<string, unknown>) : null;
  if (
    lock &&
    typeof lock.salt === 'string' &&
    typeof lock.hash === 'string' &&
    /^[a-zA-Z0-9_-]{6,64}$/.test(lock.salt) &&
    /^[0-9a-f]{64}$/i.test(lock.hash)
  ) {
    result.lock = { salt: lock.salt, hash: lock.hash };
  }
  if (typeof o.lastBackup === 'number' && Number.isFinite(o.lastBackup)) {
    result.lastBackup = o.lastBackup;
  }
  if (o._calc && typeof o._calc === 'object') {
    result._calc = o._calc as CalcResult;
  }
  if (Array.isArray(o._show)) {
    result._show = o._show as SectionKey[];
  }
  return result;
}

export function getJoinDate(p: Person, tripStart: string): string {
  return p.joinDate || tripStart || '';
}

export function getParticipants(e: Expense, people: Person[], tripStart: string): string[] {
  const baseIds = e.split || people.map((p) => p.id);
  const expDate = e.date || tripStart || '';
  return baseIds.filter((id) => {
    const p = people.find((x) => x.id === id);
    return p && getJoinDate(p, tripStart) <= expDate;
  });
}

export function calcTrip(state: TripState): CalcResult {
  if (state._calc) return state._calc;
  const P = state.people;
  const n = P.length;
  const r: CalcResult['r'] = {};
  P.forEach((p) => {
    r[p.id] = { paid: 0, in: 0, share: 0, allow: 0, sent: 0, recv: 0, net: 0 };
  });

  let total = 0;
  let kExp = 0;
  let kIn = 0;
  let kPay = 0;
  const cat: Record<string, number> = {};

  state.expenses.forEach((e) => {
    total += e.amt;
    cat[e.cat] = (cat[e.cat] || 0) + e.amt;
    if (r[e.by]) r[e.by].paid += e.amt;
    else kExp += e.amt;
    const ids = getParticipants(e, P, state.trip.start).filter((i) => r[i]);
    if (!ids.length) return;
    ids.forEach((i) => {
      r[i].share += e.amt / ids.length;
    });
  });

  (state.contribs || []).forEach((x) => {
    if (r[x.who]) {
      r[x.who].paid += x.amt;
      r[x.who].in += x.amt;
      kIn += x.amt;
    }
  });

  const cars = P.filter((p) => p.car);
  const per = Number(state.trip.clean) || 0;
  const cleanTotal = cars.length * per;
  cars.forEach((p) => {
    r[p.id].allow = per;
  });
  if (n && cleanTotal) {
    P.forEach((p) => {
      r[p.id].share += cleanTotal / n;
    });
  }

  state.payments.forEach((x) => {
    if (r[x.from]) r[x.from].sent += x.amt;
    if (r[x.to]) r[x.to].recv += x.amt;
    if (x.to === 'kitty') kPay -= x.amt;
    if (x.from === 'kitty') kPay += x.amt;
  });

  P.forEach((p) => {
    const q = r[p.id];
    q.net = q.paid + q.allow + q.sent - q.recv - q.share;
  });

  const cr = P.map((p) => ({ id: p.id, v: r[p.id].net }))
    .filter((x) => x.v > 0.005)
    .sort((a, b) => b.v - a.v);
  const db = P.map((p) => ({ id: p.id, v: -r[p.id].net }))
    .filter((x) => x.v > 0.005)
    .sort((a, b) => b.v - a.v);

  const kCash = kIn - kExp - kPay;
  if (kCash > 0.005) db.push({ id: 'kitty', v: kCash });
  else if (kCash < -0.005) cr.push({ id: 'kitty', v: -kCash });
  db.sort((a, b) => b.v - a.v);
  cr.sort((a, b) => b.v - a.v);

  const tx: CalcResult['tx'] = [];
  let i = 0;
  let j = 0;
  while (i < db.length && j < cr.length) {
    const a = Math.min(db[i].v, cr[j].v);
    tx.push({ from: db[i].id, to: cr[j].id, amt: a });
    db[i].v -= a;
    cr[j].v -= a;
    if (db[i].v < 0.005) i++;
    if (cr[j].v < 0.005) j++;
  }

  return { r, total, cat, cars: cars.length, cleanTotal, tx, n, kCash, kIn, kExp };
}

export function formatMoney(n: number, cur: string): string {
  return (n < 0 ? '-' : '') + cur + Math.abs(n).toFixed(2);
}

export function formatShortDate(d: string): string {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return d;
  }
}

export function personName(id: string, people: Person[]): string {
  if (id === 'kitty') return 'Group Barakah';
  return people.find((p) => p.id === id)?.name || '?';
}
