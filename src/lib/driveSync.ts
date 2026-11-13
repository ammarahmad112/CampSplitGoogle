import type { SectionKey, SyncConfig, TripState, ViewerUser } from '../types';

export interface DriveApiResponse {
  ok: boolean;
  error?: string;
  data?: string | null;
  updated?: number;
  role?: 'admin' | 'viewer';
  users?: ViewerUser[];
  fileId?: string;
  name?: string;
  url?: string;
  dataUrl?: string;
}

export async function callDriveApi(
  url: string,
  code: string,
  action: string,
  data?: unknown
): Promise<DriveApiResponse> {
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ code, action, data }),
  });
  return (await res.json()) as DriveApiResponse;
}

function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (v as Record<string, unknown>)[key];
            return acc;
          }, {})
      : v
  );
}

export function buildSyncPayload(state: TripState): string {
  const clone: Record<string, unknown> = { ...state };
  delete clone.lock;
  delete clone.lastBackup;
  delete clone._calc;
  delete clone._show;
  return stableStringify(clone);
}

export function hashPayload(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return String(h);
}

function toBase64Url(str: string): string {
  let bin = '';
  new TextEncoder().encode(str).forEach((x) => {
    bin += String.fromCharCode(x);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const bytes = Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function getCleanBaseUrl(): string {
  return window.location.origin + window.location.pathname;
}

export function buildShortShareLink(cfg: SyncConfig, code: string, name: string): string {
  const base = getCleanBaseUrl();
  const match = /^https:\/\/script\.google\.com\/macros\/s\/([\w-]+)\/exec$/.exec(cfg.url.trim());
  if (match) {
    return `${base}#j=${match[1]}.${code}`;
  }
  return `${base}#join=${toBase64Url(JSON.stringify({ u: cfg.url, c: code, n: name }))}`;
}

export function buildDevicePairLink(cfg: SyncConfig): string {
  const base = getCleanBaseUrl();
  const match = /^https:\/\/script\.google\.com\/macros\/s\/([\w-]+)\/exec$/.exec(cfg.url.trim());
  if (match) {
    return `${base}#p=${match[1]}.${toBase64Url(cfg.code)}`;
  }
  return `${base}#pair=${toBase64Url(JSON.stringify({ u: cfg.url, c: cfg.code }))}`;
}

export interface ParsedHashLink {
  type: 'join' | 'pair';
  url: string;
  code: string;
  name?: string;
}

export function parseHashConnectLink(hash: string): ParsedHashLink | null {
  try {
    if (hash.startsWith('#j=')) {
      const parts = hash.slice(3).split('.');
      if (parts.length < 2) return null;
      const scriptId = parts[0].replace(/[^\w-]/g, '');
      const code = parts.slice(1).join('.');
      if (!scriptId || !code) return null;
      return {
        type: 'join',
        url: `https://script.google.com/macros/s/${scriptId}/exec`,
        code,
      };
    }
    if (hash.startsWith('#join=')) {
      const parsed = JSON.parse(fromBase64Url(hash.slice(6))) as { u?: string; c?: string; n?: string };
      if (!parsed.u || !parsed.c || !/^https:\/\/script\.google\.com\//.test(parsed.u)) return null;
      return { type: 'join', url: parsed.u, code: parsed.c, name: parsed.n };
    }
    if (hash.startsWith('#p=')) {
      const parts = hash.slice(3).split('.');
      if (parts.length < 2) return null;
      const scriptId = parts[0].replace(/[^\w-]/g, '');
      const code = fromBase64Url(parts.slice(1).join('.'));
      if (!scriptId || !code) return null;
      return {
        type: 'pair',
        url: `https://script.google.com/macros/s/${scriptId}/exec`,
        code,
      };
    }
    if (hash.startsWith('#pair=')) {
      const parsed = JSON.parse(fromBase64Url(hash.slice(6))) as { u?: string; c?: string };
      if (!parsed.u || !parsed.c || !/^https:\/\/script\.google\.com\//.test(parsed.u)) return null;
      return { type: 'pair', url: parsed.u, code: parsed.c };
    }
  } catch {
    return null;
  }
  return null;
}

export function validateSections(show: unknown): SectionKey[] {
  const valid: SectionKey[] = ['settings', 'friends', 'barakah', 'expenses', 'summary', 'xfers', 'pays'];
  return Array.isArray(show) ? valid.filter((s) => show.includes(s)) : valid;
}

export const CODE_GS_SOURCE = `const FOLDER_ID = 'PASTE_YOUR_FOLDER_ID';
const ADMIN_CODE = 'CHOOSE_AN_ADMIN_CODE'; // 12 or more characters. Keep it secret.
const FILE = 'camp-split-data.json';
const SECS = ['settings', 'friends', 'barakah', 'expenses', 'summary', 'xfers', 'pays'];
let S;
const jd = p => p.joinDate || S.trip.start || '';
const part = e => (e.split || S.people.map(p => p.id)).filter(i => {
  const p = S.people.find(x => x.id === i);
  return p && jd(p) <= (e.date || S.trip.start || '');
});

function calc() {
  const P = S.people, n = P.length, r = {};
  P.forEach(p => r[p.id] = { paid: 0, in: 0, share: 0, allow: 0, sent: 0, recv: 0 });
  let total = 0, kExp = 0, kIn = 0, kPay = 0;
  const cat = {};
  S.expenses.forEach(e => {
    total += e.amt;
    cat[e.cat] = (cat[e.cat] || 0) + e.amt;
    if (r[e.by]) r[e.by].paid += e.amt; else kExp += e.amt;
    const ids = part(e).filter(i => r[i]);
    if (!ids.length) return;
    ids.forEach(i => r[i].share += e.amt / ids.length);
  });
  (S.contribs || []).forEach(x => {
    if (r[x.who]) {
      r[x.who].paid += x.amt;
      r[x.who].in += x.amt;
      kIn += x.amt;
    }
  });
  const cars = P.filter(p => p.car);
  const per = Number(S.trip.clean) || 0, cleanTotal = cars.length * per;
  cars.forEach(p => r[p.id].allow = per);
  if (n && cleanTotal) P.forEach(p => r[p.id].share += cleanTotal / n);
  S.payments.forEach(x => {
    if (r[x.from]) r[x.from].sent += x.amt;
    if (r[x.to]) r[x.to].recv += x.amt;
    if (x.to === 'kitty') kPay -= x.amt;
    if (x.from === 'kitty') kPay += x.amt;
  });
  P.forEach(p => {
    const q = r[p.id];
    q.net = q.paid + q.allow + q.sent - q.recv - q.share;
  });
  const cr = P.map(p => ({ id: p.id, v: r[p.id].net })).filter(x => x.v > 0.005).sort((a, b) => b.v - a.v);
  const db = P.map(p => ({ id: p.id, v: -r[p.id].net })).filter(x => x.v > 0.005).sort((a, b) => b.v - a.v);
  const kCash = kIn - kExp - kPay;
  if (kCash > 0.005) db.push({ id: 'kitty', v: kCash });
  else if (kCash < -0.005) cr.push({ id: 'kitty', v: -kCash });
  db.sort((a, b) => b.v - a.v);
  cr.sort((a, b) => b.v - a.v);
  const tx = [];
  let i = 0, j = 0;
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

function findFile_() {
  const it = DriveApp.getFolderById(FOLDER_ID).getFilesByName(FILE);
  return it.hasNext() ? it.next() : null;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function users_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('users') || '[]');
}

function saveUsers_(u) {
  PropertiesService.getScriptProperties().setProperty('users', JSON.stringify(u));
}

function same_(a, b) {
  a = String(a);
  b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return d === 0;
}

function shortCode_() {
  const raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw + Date.now() + Math.random());
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let res = '';
  for (let i = 0; i < 14; i++) {
    res += chars[(bytes[i] & 0xff) % chars.length];
  }
  return res;
}

function cleanShow_(s) {
  return SECS.filter(k => Array.isArray(s) && s.indexOf(k) >= 0);
}

function isInFolder_(file) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === FOLDER_ID) return true;
  }
  return false;
}

// Viewers never receive anything they are not allowed to see: the server filters it here.
function viewOf_(json, show) {
  const d = Object.assign({ people: [], expenses: [], payments: [], contribs: [] }, JSON.parse(json));
  d.trip = d.trip || {};
  S = d;
  const has = k => show.indexOf(k) >= 0;
  const c = calc();
  if (!has('summary')) { c.r = {}; c.total = 0; c.cat = {}; c.cars = 0; c.cleanTotal = 0; c.n = 0; }
  if (!has('xfers')) c.tx = [];
  if (!has('summary') && !has('barakah')) { c.kIn = 0; c.kExp = 0; c.kCash = 0; }
  const trip = { name: d.trip.name, emoji: d.trip.emoji, cur: d.trip.cur, img: d.trip.img, start: d.trip.start };
  if (has('settings')) trip.clean = d.trip.clean;
  return {
    trip: trip,
    people: show.length ? d.people : [],
    expenses: has('expenses') ? d.expenses : [],
    payments: has('pays') ? d.payments : [],
    contribs: has('barakah') ? d.contribs : [],
    _show: show,
    _calc: c
  };
}

function doGet() {
  return out_({ ok: true, msg: 'Camp Split sync is running' });
}

function doPost(e) {
  if (ADMIN_CODE.length < 12 || ADMIN_CODE === 'CHOOSE_AN_ADMIN_CODE') {
    return out_({ ok: false, error: 'set a stronger ADMIN_CODE in the script (12+ characters)' });
  }
  let r;
  try {
    r = JSON.parse(e.postData.contents);
  } catch (x) {
    return out_({ ok: false, error: 'bad request' });
  }
  const code = String(r.code || '');
  const user = users_().find(x => same_(x.code, code));
  const role = same_(code, ADMIN_CODE) ? 'admin' : (user ? 'viewer' : null);
  if (!role) {
    Utilities.sleep(1500);
    return out_({ ok: false, error: 'wrong access code' });
  }
  const viewerReadActions = ['read', 'stamp', 'receipt_get'];
  if (viewerReadActions.indexOf(r.action) < 0 && role !== 'admin') {
    return out_({ ok: false, error: 'view-only code cannot change data' });
  }
  if (r.action === 'stamp') {
    const f0 = findFile_();
    return out_({
      ok: true,
      updated: Math.max(f0 ? f0.getLastUpdated().getTime() : 0, role === 'viewer' ? (user.ts || 0) : 0),
      role: role
    });
  }
  if (r.action === 'receipt_get') {
    if (role === 'viewer') {
      const vShow = Array.isArray(user.show) ? cleanShow_(user.show) : SECS;
      if (vShow.indexOf('expenses') < 0) return out_({ ok: false, error: 'not allowed' });
    }
    try {
      const fileId = String((r.data && r.data.fileId) || r.data || '').replace(/[^\\w-]/g, '');
      if (!fileId) return out_({ ok: false, error: 'missing file id' });
      const rf = DriveApp.getFileById(fileId);
      if (!isInFolder_(rf) || rf.isTrashed()) return out_({ ok: false, error: 'receipt not found' });
      const blob = rf.getBlob();
      const mime = blob.getContentType() || 'image/jpeg';
      const b64 = Utilities.base64Encode(blob.getBytes());
      return out_({ ok: true, dataUrl: 'data:' + mime + ';base64,' + b64, name: rf.getName(), url: rf.getUrl() });
    } catch (err) {
      return out_({ ok: false, error: 'could not load receipt' });
    }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const f = findFile_();
    const upd = f ? f.getLastUpdated().getTime() : 0;
    if (r.action === 'read') {
      if (role === 'admin') {
        return out_({ ok: true, data: f ? f.getBlob().getDataAsString() : null, updated: upd, role: role });
      }
      const show = Array.isArray(user.show) ? cleanShow_(user.show) : SECS;
      return out_({
        ok: true,
        data: f ? JSON.stringify(viewOf_(f.getBlob().getDataAsString(), show)) : null,
        updated: Math.max(upd, user.ts || 0),
        role: role
      });
    }
    if (r.action === 'write') {
      let ok = typeof r.data === 'string' && r.data.length < 2000000;
      if (ok) {
        try { ok = Array.isArray(JSON.parse(r.data).people); } catch (x) { ok = false; }
      }
      if (!ok) return out_({ ok: false, error: 'invalid data' });
      if (f) f.setContent(r.data);
      else DriveApp.getFolderById(FOLDER_ID).createFile(FILE, r.data, 'application/json');
      return out_({ ok: true, updated: findFile_().getLastUpdated().getTime() });
    }
    if (r.action === 'receipt_upload') {
      const d = r.data || {};
      const b64 = String(d.base64 || '');
      if (!b64 || b64.length > 8000000) return out_({ ok: false, error: 'receipt image too large' });
      const mime = ['image/jpeg', 'image/png', 'image/webp'].indexOf(d.mimeType) >= 0 ? d.mimeType : 'image/jpeg';
      const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
      const safeName = String(d.name || ('receipt-' + (d.expId || Date.now()))).replace(/[^\\w.-]/g, '_').slice(0, 60);
      const fileName = safeName.match(/\\.(jpe?g|png|webp)$/i) ? safeName : (safeName + '.' + ext);
      const bytes = Utilities.base64Decode(b64);
      const blob = Utilities.newBlob(bytes, mime, fileName);
      const saved = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
      return out_({ ok: true, fileId: saved.getId(), name: saved.getName(), url: saved.getUrl() });
    }
    if (r.action === 'receipt_delete') {
      const fileId = String((r.data && r.data.fileId) || r.data || '').replace(/[^\\w-]/g, '');
      if (!fileId) return out_({ ok: false, error: 'missing file id' });
      try {
        const rf = DriveApp.getFileById(fileId);
        if (isInFolder_(rf)) rf.setTrashed(true);
      } catch (err) {}
      return out_({ ok: true });
    }
    if (r.action === 'wipe') {
      if (f) f.setTrashed(true);
      return out_({ ok: true });
    }
    if (r.action === 'users_list') return out_({ ok: true, users: users_() });
    if (r.action === 'users_add') {
      const d = r.data || {}, u = users_();
      u.push({
        id: Utilities.getUuid().slice(0, 8),
        name: String(d.name || '').slice(0, 40),
        code: shortCode_(),
        show: Array.isArray(d.show) ? cleanShow_(d.show) : SECS,
        ts: Date.now()
      });
      saveUsers_(u);
      return out_({ ok: true, users: u });
    }
    if (r.action === 'users_set') {
      const d = r.data || {}, u = users_();
      u.forEach(x => {
        if (x.id === d.id) {
          x.show = cleanShow_(d.show);
          x.ts = Date.now();
        }
      });
      saveUsers_(u);
      return out_({ ok: true, users: u });
    }
    if (r.action === 'users_remove') {
      const u = users_().filter(x => x.id !== r.data);
      saveUsers_(u);
      return out_({ ok: true, users: u });
    }
    return out_({ ok: false, error: 'unknown action' });
  } finally {
    lock.releaseLock();
  }
}`;
