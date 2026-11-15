import type { DarkModeSetting, SyncConfig, ThemeKey, TripState } from '../types';
import { blankState, normalizeState } from './calc';

export const STORAGE_KEY = 'campsplit-v1';
export const SYNC_CFG_KEY = 'campsplit-sync';
export const DARK_MODE_KEY = 'campsplit-dark-mode';
export const TV_MODE_KEY = 'campsplit-tv';

export interface LocalReceiptBlob {
  expId: string;
  base64: string;
  mimeType: string;
  name: string;
  dataUrl: string;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('campsplit', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts', { keyPath: 'expId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSetState(json: string): Promise<void> {
  try {
    const db = await openDb();
    db.transaction('kv', 'readwrite').objectStore('kv').put(json, 'state');
  } catch {
    // ignore storage errors
  }
}

export async function idbGetState(): Promise<string | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction('kv').objectStore('kv').get('state');
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function idbSaveReceipt(item: LocalReceiptBlob): Promise<void> {
  try {
    const db = await openDb();
    db.transaction('receipts', 'readwrite').objectStore('receipts').put(item);
  } catch {
    // ignore
  }
}

export async function idbGetReceipt(expId: string): Promise<LocalReceiptBlob | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction('receipts').objectStore('receipts').get(expId);
      req.onsuccess = () => resolve(req.result as LocalReceiptBlob | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function idbDeleteReceipt(expId: string): Promise<void> {
  try {
    const db = await openDb();
    db.transaction('receipts', 'readwrite').objectStore('receipts').delete(expId);
  } catch {
    // ignore
  }
}

export async function idbListReceipts(): Promise<LocalReceiptBlob[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction('receipts').objectStore('receipts').getAll();
      req.onsuccess = () => resolve((req.result as LocalReceiptBlob[]) || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export function safeJsonParse(raw: string): unknown {
  return JSON.parse(raw, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
    return value;
  });
}

export function loadLocalState(): { state: TripState; hadLocal: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { state: normalizeState(safeJsonParse(raw)), hadLocal: true };
    }
  } catch {
    return { state: blankState(), hadLocal: true };
  }
  return { state: blankState(), hadLocal: false };
}

export function persistLocalState(state: TripState): void {
  const json = JSON.stringify(state);
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Quota fallback: strip inline receipt thumbnails in localStorage while keeping full state in IndexedDB
    try {
      const compact: TripState = {
        ...state,
        expenses: state.expenses.map((e) =>
          e.receipt ? { ...e, receipt: { ...e.receipt, thumb: undefined } } : e
        ),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // ignore if storage is completely blocked
    }
  }
  void idbSetState(json);
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(cfg: SyncConfig | null): void {
  try {
    if (cfg) localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(SYNC_CFG_KEY);
  } catch {
    // ignore
  }
}

export function loadDarkMode(): DarkModeSetting {
  try {
    const v = localStorage.getItem(DARK_MODE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // ignore
  }
  return 'system';
}

export function saveDarkMode(mode: DarkModeSetting): void {
  try {
    localStorage.setItem(DARK_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

export function applyThemeClasses(mode: DarkModeSetting, palette: ThemeKey | ''): void {
  const isDark =
    mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  if (palette) document.documentElement.dataset.palette = palette;
  else delete document.documentElement.dataset.palette;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: 150000,
      hash: 'SHA-256',
    },
    key,
    256
  );
  return [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function packBackup(obj: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  bytes.forEach((x) => {
    bin += String.fromCharCode(x);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function unpackBackup(token: string): Promise<unknown> {
  const bin = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

let lastIconKey = '';
export function updateDynamicFavicon(state: TripState, palette: ThemeKey | ''): void {
  const t = state.trip;
  const isDark = document.documentElement.classList.contains('dark');
  const k = `${t.img || t.emoji}|${palette}|${isDark ? 'd' : 'l'}`;
  if (k === lastIconKey) return;
  lastIconKey = k;

  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, 180, 180, 40);
  else ctx.rect(0, 0, 180, 180);
  ctx.clip();

  const commit = () => {
    const href = canvas.toDataURL('image/png');
    (['icon', 'shortcut icon', 'apple-touch-icon'] as const).forEach((rel) => {
      document.querySelectorAll(`link[rel="${rel}"]`).forEach((el) => el.remove());
      const link = document.createElement('link');
      link.rel = rel;
      link.type = 'image/png';
      link.href = href;
      document.head.appendChild(link);
    });
  };

  if (t.img) {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, 180, 180);
      const m = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 180, 180);
      commit();
    };
    img.src = t.img;
  } else {
    const cs = getComputedStyle(document.documentElement);
    const acc = cs.getPropertyValue('--accent').trim() || '#15803d';
    const grad = ctx.createLinearGradient(0, 0, 180, 180);
    grad.addColorStop(0, acc);
    grad.addColorStop(1, '#d97706');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 180, 180);

    ctx.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.emoji || '🏕️', 90, 98);
    commit();
  }
}
