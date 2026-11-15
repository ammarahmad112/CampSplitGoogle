import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  Camera,
  Car,
  Check,
  Cloud,
  Copy,
  Download,
  Edit3,
  Eye,
  ImagePlus,
  Lock,
  Monitor,
  Moon,
  Palette,
  Paperclip,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Share2,
  Sun,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import type {
  DarkModeSetting,
  Expense,
  ExpenseCategory,
  PinLock,
  QrSharePayload,
  ReceiptMeta,
  SectionKey,
  SyncConfig,
  ThemeKey,
  TripState,
  ViewerUser,
} from './types';
import {
  blankState,
  calcTrip,
  formatMoney,
  formatShortDate,
  getJoinDate,
  getParticipants,
  normalizeState,
  personName,
  todayStr,
  uid,
} from './lib/calc';
import { getThemeConfig } from './lib/themes';
import {
  TV_MODE_KEY,
  applyThemeClasses,
  hashPin,
  idbDeleteReceipt,
  idbGetReceipt,
  idbGetState,
  idbListReceipts,
  idbSaveReceipt,
  loadDarkMode,
  loadLocalState,
  loadSyncConfig,
  packBackup,
  persistLocalState,
  safeJsonParse,
  saveDarkMode,
  saveSyncConfig,
  unpackBackup,
  updateDynamicFavicon,
} from './lib/storage';
import {
  buildSyncPayload,
  callDriveApi,
  getCleanBaseUrl,
  hashPayload,
  parseHashConnectLink,
} from './lib/driveSync';
import type { ParsedHashLink } from './lib/driveSync';
import { processLogoImage, processReceiptPhoto } from './lib/imageUtils';
import { QrShareModal } from './components/QrShareModal';
import { QrRestoreModal } from './components/QrRestoreModal';
import { ReceiptLightbox } from './components/ReceiptLightbox';
import { PinLockModal } from './components/PinLockModal';
import { AdminSharePanel } from './components/AdminSharePanel';
import { DriveSyncPanel } from './components/DriveSyncPanel';
import { CategoryPieChart } from './components/CategoryPieChart';
import { SummaryBalances } from './components/SummaryBalances';
import { ThemePickerModal } from './components/ThemePickerModal';

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface PendingReceiptDraft {
  base64: string;
  mimeType: 'image/jpeg';
  dataUrl: string;
  thumb: string;
  name: string;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'Food',
  rent: 'Rentals',
  fuel: 'Fuel',
  other: 'Other',
};

export default function App() {
  const initialLoad = useMemo(() => loadLocalState(), []);
  const [state, setState] = useState<TripState>(initialLoad.state);
  const [syncCfg, setSyncCfg] = useState<SyncConfig | null>(() => loadSyncConfig());
  const [darkMode, setDarkMode] = useState<DarkModeSetting>(() => loadDarkMode());
  const [tvMode, setTvMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TV_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Lock screen
  const [lockMode, setLockMode] = useState<'unlock' | 'set' | null>(() =>
    initialLoad.state.lock ? 'unlock' : null
  );
  const [pinMenuOpen, setPinMenuOpen] = useState(false);
  const [pinActionMode, setPinActionMode] = useState<'change' | 'remove' | null>(null);
  const [pinCheckInput, setPinCheckInput] = useState('');
  const [pinCheckError, setPinCheckError] = useState('');
  const hiddenAtRef = useRef<number>(0);

  // Sync & Multi-device state
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncOk, setSyncOk] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [users, setUsers] = useState<ViewerUser[]>([]);
  const [pendingReceiptCount, setPendingReceiptCount] = useState(0);

  // Modals
  const [qrPayload, setQrPayload] = useState<QrSharePayload | null>(null);
  const [qrRestoreOpen, setQrRestoreOpen] = useState(false);
  const [lightboxExpense, setLightboxExpense] = useState<Expense | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  // Form states — Friends
  const [friendName, setFriendName] = useState('');
  const [friendCar, setFriendCar] = useState(false);
  const [friendJoinDate, setFriendJoinDate] = useState(() => initialLoad.state.trip.start || todayStr());
  const [editingJoinId, setEditingJoinId] = useState<string | null>(null);
  const [editingJoinVal, setEditingJoinVal] = useState('');
  const [friendFeedback, setFriendFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  // Form states — Expenses + Receipt Photos
  const [editExpId, setEditExpId] = useState<string | null>(null);
  const [expDesc, setExpDesc] = useState('');
  const [expAmt, setExpAmt] = useState('');
  const [expBy, setExpBy] = useState('kitty');
  const [expDate, setExpDate] = useState(() => todayStr());
  const [expCat, setExpCat] = useState<ExpenseCategory>('food');
  const [expSplit, setExpSplit] = useState<Set<string> | null>(null);
  const [receiptDraft, setReceiptDraft] = useState<PendingReceiptDraft | null>(null);
  const [existingReceipt, setExistingReceipt] = useState<ReceiptMeta | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [expFeedback, setExpFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  // Form states — Barakah contributions
  const [contribWho, setContribWho] = useState('');
  const [contribAmt, setContribAmt] = useState('');
  const [contribDate, setContribDate] = useState(() => todayStr());
  const [contribFeedback, setContribFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  // Feedbacks — Settings / Backup / Payments
  const [settingsFeedback, setSettingsFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [payFeedback, setPayFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  // Refs for file pickers and sync timers
  const logoInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const receiptFileRef = useRef<HTMLInputElement>(null);
  const receiptCameraRef = useRef<HTMLInputElement>(null);
  const expenseFormRef = useRef<HTMLElement>(null);
  const stateRef = useRef(state);
  const cfgRef = useRef(syncCfg);
  const busyRef = useRef(false);
  const conflictRef = useRef(false);
  const syncTimerRef = useRef<number>(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  stateRef.current = state;
  cfgRef.current = syncCfg;
  conflictRef.current = conflict;

  const isViewer = Boolean(syncCfg && syncCfg.role === 'viewer');
  const visibleSections = state._show;
  const canShowSection = useCallback(
    (sec: SectionKey) => !visibleSections || visibleSections.includes(sec),
    [visibleSections]
  );

  const calc = useMemo(() => calcTrip(state), [state]);
  const money = useCallback((v: number) => formatMoney(v, state.trip.cur), [state.trip.cur]);

  const activeTheme: ThemeKey = state.theme || 'trailhead';
  const themeConfig = useMemo(() => getThemeConfig(activeTheme), [activeTheme]);

  // Apply Dark Mode & Palette classes + System dark mode listener
  useEffect(() => {
    applyThemeClasses(darkMode, activeTheme);
    updateDynamicFavicon(state, activeTheme);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => {
      if (darkMode === 'system') applyThemeClasses('system', activeTheme);
    };
    media.addEventListener('change', onMedia);
    return () => media.removeEventListener('change', onMedia);
  }, [darkMode, activeTheme, state]);

  // Apply TV Mode
  useEffect(() => {
    document.documentElement.classList.toggle('tv-mode', tvMode);
    try {
      localStorage.setItem(TV_MODE_KEY, tvMode ? '1' : '');
    } catch {
      // ignore
    }
  }, [tvMode]);

  // Update document title
  useEffect(() => {
    document.title = state.trip.name || 'Camp Split';
  }, [state.trip.name]);

  // IndexedDB fallback hydration on first boot if localStorage was empty
  useEffect(() => {
    if (initialLoad.hadLocal) return;
    void idbGetState().then((json) => {
      if (!json) return;
      try {
        const restored = normalizeState(safeJsonParse(json));
        setState(restored);
        if (restored.lock) setLockMode('unlock');
      } catch {
        // ignore
      }
    });
  }, [initialLoad.hadLocal]);

  // Keep default contribWho valid
  useEffect(() => {
    if (state.people.length && !state.people.some((p) => p.id === contribWho)) {
      setContribWho(state.people[0].id);
    }
  }, [state.people, contribWho]);

  // Track pending receipts in IndexedDB
  const refreshPendingCount = useCallback(async () => {
    const all = await idbListReceipts();
    const pendingIds = new Set(
      stateRef.current.expenses.filter((e) => e.receipt?.pending).map((e) => e.id)
    );
    const count = all.filter((item) => pendingIds.has(item.expId)).length;
    setPendingReceiptCount(count);
  }, []);

  useEffect(() => {
    void refreshPendingCount();
  }, [state.expenses, refreshPendingCount]);

  // Cross-tab BroadcastChannel sync on the same device
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('campsplit-sync-channel');
    channelRef.current = ch;
    ch.onmessage = (ev) => {
      const msg = ev.data as { type?: string; state?: TripState; cfg?: SyncConfig | null };
      if (msg?.type === 'state' && msg.state) {
        setState(normalizeState(msg.state));
      }
      if (msg?.type === 'cfg') {
        setSyncCfg(msg.cfg ?? null);
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  // Load viewer user list for admin
  const loadUsers = useCallback(async (cfg: SyncConfig) => {
    if (cfg.role === 'viewer') return;
    try {
      const res = await callDriveApi(cfg.url, cfg.code, 'users_list');
      if (res.ok && Array.isArray(res.users)) {
        setUsers(res.users);
      }
    } catch {
      // ignore offline
    }
  }, []);

  // Flush any locally queued receipt photos to Google Drive when online & connected
  const flushPendingReceipts = useCallback(
    async (cfg: SyncConfig, curState: TripState): Promise<TripState> => {
      if (cfg.role === 'viewer') return curState;
      const pendingExpenses = curState.expenses.filter((e) => e.receipt?.pending && !e.receipt?.id);
      if (!pendingExpenses.length) return curState;

      let updatedState = curState;
      let changed = false;

      for (const exp of pendingExpenses) {
        const blob = await idbGetReceipt(exp.id);
        if (!blob) continue;
        try {
          const res = await callDriveApi(cfg.url, cfg.code, 'receipt_upload', {
            expId: exp.id,
            name: blob.name,
            mimeType: blob.mimeType,
            base64: blob.base64,
          });
          if (res.ok && res.fileId) {
            changed = true;
            updatedState = {
              ...updatedState,
              expenses: updatedState.expenses.map((item) =>
                item.id === exp.id
                  ? {
                      ...item,
                      receipt: {
                        id: res.fileId,
                        name: res.name || blob.name,
                        url: res.url,
                        thumb: item.receipt?.thumb,
                        pending: false,
                      },
                    }
                  : item
              ),
            };
          }
        } catch {
          // keep queued if network drops
        }
      }

      if (changed) {
        persistLocalState(updatedState);
        setState(updatedState);
      }
      return updatedState;
    },
    []
  );

  // Push local state to Drive
  const pushToDrive = useCallback(async (cfg: SyncConfig, targetState: TripState): Promise<SyncConfig> => {
    const payload = buildSyncPayload(targetState);
    const res = await callDriveApi(cfg.url, cfg.code, 'write', payload);
    if (!res.ok) throw new Error(res.error || 'Could not write to Drive');
    const nextCfg: SyncConfig = {
      ...cfg,
      syncedAt: res.updated || Date.now(),
      h: hashPayload(payload),
    };
    saveSyncConfig(nextCfg);
    setSyncCfg(nextCfg);
    return nextCfg;
  }, []);

  // Apply remote state smoothly in-place (keeping viewer theme & appearance in sync with admin)
  const applyRemoteState = useCallback(
    (rawJson: string, updatedTs: number, baseCfg: SyncConfig) => {
      const cur = stateRef.current;
      const rawParsed = safeJsonParse(rawJson) as Record<string, unknown>;
      const incoming = normalizeState(rawParsed);
      if (cur.lock) incoming.lock = cur.lock;

      if (baseCfg.role === 'viewer') {
        if (!rawParsed.theme && baseCfg.hintTheme) {
          incoming.theme = baseCfg.hintTheme;
        }
        const syncedDark = incoming.darkMode || baseCfg.hintDark;
        if (syncedDark) {
          setDarkMode(syncedDark);
          saveDarkMode(syncedDark);
        }
      } else if (incoming.darkMode) {
        setDarkMode(incoming.darkMode);
        saveDarkMode(incoming.darkMode);
      }

      const nextCfg: SyncConfig = {
        ...baseCfg,
        syncedAt: updatedTs,
        h: hashPayload(buildSyncPayload(incoming)),
      };
      saveSyncConfig(nextCfg);
      setSyncCfg(nextCfg);
      persistLocalState(incoming);
      setState(incoming);
      setConflict(false);
      channelRef.current?.postMessage({ type: 'state', state: incoming });
      channelRef.current?.postMessage({ type: 'cfg', cfg: nextCfg });
    },
    []
  );

  const runSync = useCallback(async () => {
    const cfg = cfgRef.current;
    if (!cfg || busyRef.current) return;
    if (conflictRef.current) {
      setSyncStatus('Drive and this device both have changes. Choose Load from Drive or Overwrite Drive.');
      setSyncOk(false);
      return;
    }

    busyRef.current = true;
    setSyncBusy(true);
    setSyncStatus('Syncing…');
    setSyncOk(true);

    try {
      const res = await callDriveApi(cfg.url, cfg.code, 'read');
      if (!res.ok) throw new Error(res.error || 'Sync failed');

      const role = res.role || cfg.role || 'admin';
      const activeCfg: SyncConfig = { ...cfg, role };

      if (role === 'viewer') {
        if (res.data && (res.updated || 0) > activeCfg.syncedAt) {
          applyRemoteState(res.data, res.updated || Date.now(), activeCfg);
          setSyncStatus(`Live · updated ${new Date().toLocaleTimeString()}`);
          setSyncOk(true);
        } else {
          saveSyncConfig(activeCfg);
          setSyncCfg(activeCfg);
          setSyncStatus('Up to date (view-only)');
          setSyncOk(true);
        }
        return;
      }

      // Admin sync flow
      let workingState = await flushPendingReceipts(activeCfg, stateRef.current);
      const localPayload = buildSyncPayload(workingState);
      const dirty = hashPayload(localPayload) !== activeCfg.h;
      const remoteUpdated = res.updated || 0;
      const hasData =
        workingState.people.length > 0 ||
        workingState.expenses.length > 0 ||
        workingState.contribs.length > 0;

      if (res.data && remoteUpdated > activeCfg.syncedAt) {
        if (!dirty) {
          applyRemoteState(res.data, remoteUpdated, activeCfg);
          setSyncStatus(`Synced at ${new Date().toLocaleTimeString()}`);
          setSyncOk(true);
          return;
        }
        setConflict(true);
        setSyncStatus('Drive and this device both have new changes. Choose Load from Drive or Overwrite Drive.');
        setSyncOk(false);
        return;
      }

      if (!res.data && activeCfg.syncedAt > 0) {
        setConflict(true);
        setSyncStatus('The Drive copy was removed. Choose Overwrite Drive to save this trip again.');
        setSyncOk(false);
        return;
      }

      if (dirty && (res.data || hasData)) {
        await pushToDrive(activeCfg, workingState);
      } else if (activeCfg.role !== cfg.role) {
        saveSyncConfig(activeCfg);
        setSyncCfg(activeCfg);
      }

      setSyncStatus(`Synced at ${new Date().toLocaleTimeString()}`);
      setSyncOk(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (cfgRef.current?.role === 'viewer' && msg === 'wrong access code') {
        const blank = blankState();
        persistLocalState(blank);
        saveSyncConfig(null);
        setSyncCfg(null);
        setState(blank);
        setSyncStatus('This view-only link was removed by the admin.');
        setSyncOk(false);
        return;
      }
      setSyncStatus('Offline or unreachable Drive script. Changes stay saved locally and will sync later.');
      setSyncOk(false);
    } finally {
      busyRef.current = false;
      setSyncBusy(false);
      void refreshPendingCount();
    }
  }, [applyRemoteState, flushPendingReceipts, pushToDrive, refreshPendingCount]);

  // Schedule sync on local state updates
  const scheduleSync = useCallback(
    (nextState: TripState) => {
      const cfg = cfgRef.current;
      if (!cfg || cfg.role === 'viewer' || conflictRef.current) return;
      const payload = buildSyncPayload(nextState);
      if (hashPayload(payload) === cfg.h && !nextState.expenses.some((e) => e.receipt?.pending)) {
        return;
      }
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        void runSync();
      }, 800);
    },
    [runSync]
  );

  // Unified state mutation helper
  const commitState = useCallback(
    (updater: TripState | ((prev: TripState) => TripState)) => {
      setState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persistLocalState(next);
        channelRef.current?.postMessage({ type: 'state', state: next });
        scheduleSync(next);
        return next;
      });
    },
    [scheduleSync]
  );

  // Multi-device live polling (every 5s for viewers, every 8s for admins) + focus + online + visibility
  useEffect(() => {
    if (!syncCfg) return;
    if (syncCfg.role !== 'viewer') {
      void loadUsers(syncCfg);
    }
    const initialTimer = window.setTimeout(() => {
      void runSync();
    }, 500);

    const intervalMs = syncCfg.role === 'viewer' ? 4500 : 8000;
    const pollId = window.setInterval(() => {
      if (document.hidden || busyRef.current || conflictRef.current) return;
      const cfg = cfgRef.current;
      if (!cfg) return;
      callDriveApi(cfg.url, cfg.code, 'stamp')
        .then((res) => {
          if (!res.ok || (res.updated || 0) > cfg.syncedAt) {
            void runSync();
          }
        })
        .catch(() => {
          // ignore transient offline
        });
    }, intervalMs);

    const onWake = () => {
      if (!document.hidden) void runSync();
    };
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(pollId);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [syncCfg?.url, syncCfg?.code, syncCfg?.role, loadUsers, runSync]);

  // PIN auto-lock after 5 minutes away
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (stateRef.current.lock && hiddenAtRef.current && Date.now() - hiddenAtRef.current > 300000) {
        setLockMode('unlock');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const connectFromParsedLink = useCallback(
    (connectParsed: ParsedHashLink, onFinish?: () => void) => {
      const performConnect = async () => {
        try {
          const res = await callDriveApi(connectParsed.url, connectParsed.code, 'read');
          if (!res.ok) throw new Error(res.error || 'Invalid link');
          const role = res.role || (connectParsed.type === 'pair' ? 'admin' : 'viewer');
          const nextCfg: SyncConfig = {
            url: connectParsed.url,
            code: connectParsed.code,
            syncedAt: 0,
            h: '',
            role,
            ...(connectParsed.hintTheme ? { hintTheme: connectParsed.hintTheme } : {}),
            ...(connectParsed.hintDark ? { hintDark: connectParsed.hintDark } : {}),
          };
          onFinish?.();
          if (res.data) {
            applyRemoteState(res.data, res.updated || Date.now(), nextCfg);
            setSyncStatus(role === 'viewer' ? 'Connected (view-only live)' : 'Device paired & synced');
            setSyncOk(true);
          } else {
            if (connectParsed.hintTheme) {
              setState((prev) => {
                const next = { ...prev, theme: connectParsed.hintTheme! };
                persistLocalState(next);
                return next;
              });
            }
            if (connectParsed.hintDark) {
              setDarkMode(connectParsed.hintDark);
              saveDarkMode(connectParsed.hintDark);
            }
            saveSyncConfig(nextCfg);
            setSyncCfg(nextCfg);
            setSyncStatus(
              role === 'viewer'
                ? 'Connected as view-only. Waiting for trip data.'
                : 'Device paired. Ready to sync.'
            );
            setSyncOk(true);
          }
          if (role === 'admin') {
            void loadUsers(nextCfg);
          }
        } catch {
          onFinish?.();
          setSyncStatus('That link is invalid or was revoked.');
          setSyncOk(false);
        }
      };

      const hasExisting =
        stateRef.current.people.length > 0 ||
        stateRef.current.expenses.length > 0 ||
        stateRef.current.contribs.length > 0 ||
        Boolean(cfgRef.current);

      if (hasExisting) {
        setConfirmDialog({
          title:
            connectParsed.type === 'pair'
              ? 'Pair this device to Camp Split?'
              : `Open ${connectParsed.name ? `${connectParsed.name}’s` : 'view-only'} trip link?`,
          message:
            connectParsed.type === 'pair'
              ? 'This connects this device to your synced Google Drive trip and replaces the local data currently on this browser.'
              : 'This connects this device in live view-only mode and replaces the trip currently shown here.',
          confirmLabel: 'Connect device',
          onConfirm: async () => {
            setConfirmDialog(null);
            await performConnect();
          },
        });
      } else {
        void performConnect();
      }
    },
    [applyRemoteState, loadUsers]
  );

  const promptRestoreBackup = useCallback(
    (raw: unknown, sourceLabel: 'file' | 'QR code' | 'link', onAfterApply?: () => void) => {
      const parsed = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
      if (!parsed || !Array.isArray(parsed.people) || !Array.isArray(parsed.expenses)) {
        throw new Error('Invalid backup structure');
      }
      const restored = normalizeState(parsed);
      delete restored._calc;
      delete restored._show;
      if (stateRef.current.lock) restored.lock = stateRef.current.lock;
      else delete restored.lock;
      if (!restored.trip.img && stateRef.current.trip.img) {
        restored.trip.img = stateRef.current.trip.img;
      }

      const summary = `${restored.people.length} friend${restored.people.length === 1 ? '' : 's'}, ${
        restored.expenses.length
      } expense${restored.expenses.length === 1 ? '' : 's'}, ${restored.contribs.length} Barakah ${
        restored.contribs.length === 1 ? 'entry' : 'entries'
      }`;

      setConfirmDialog({
        title: `Restore “${restored.trip.name}” from ${sourceLabel}?`,
        message: `Found ${summary}. Your existing PIN lock, uploaded logo/favicon (unless included in the backup), and Drive sync connection remain safe.`,
        confirmLabel: 'Restore trip',
        onConfirm: () => {
          if (restored.darkMode) {
            setDarkMode(restored.darkMode);
            saveDarkMode(restored.darkMode);
          }
          onAfterApply?.();
          commitState(restored);
          setConfirmDialog(null);
          flash(setBackupFeedback, `Trip restored from ${sourceLabel}.`, true);
          flash(setSettingsFeedback, `Trip restored from ${sourceLabel}.`, true);
        },
      });
    },
    [commitState]
  );

  // Handle incoming hash links: #j= / #join= (view-only), #p= / #pair= (admin device pair), #restore=
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const clearHash = () => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    };

    const connectParsed = parseHashConnectLink(hash);
    if (connectParsed) {
      connectFromParsedLink(connectParsed, clearHash);
      return;
    }

    if (hash.startsWith('#restore=') && !isViewer) {
      void unpackBackup(hash.slice(9))
        .then((raw) => {
          promptRestoreBackup(raw, 'link', clearHash);
        })
        .catch(() => {
          clearHash();
          setBackupFeedback({ text: 'That restore link could not be read.', ok: false });
        });
    }
  }, [connectFromParsedLink, isViewer, promptRestoreBackup]);

  // Helper to show transient feedback
  const flash = (
    setter: Dispatch<SetStateAction<{ text: string; ok: boolean } | null>>,
    text: string,
    ok: boolean
  ) => {
    setter({ text, ok });
    window.setTimeout(() => {
      setter((cur) => (cur?.text === text ? null : cur));
    }, 4500);
  };

  // Drive Sync Panel handlers
  const handleDriveConnect = async (url: string, code: string) => {
    if (!/^https:\/\/script\.google\.com\/.*\/exec$/.test(url)) {
      setSyncStatus('Paste the Web app URL ending with /exec.');
      setSyncOk(false);
      return;
    }
    if (code.length < 8) {
      setSyncStatus('Enter your access code.');
      setSyncOk(false);
      return;
    }
    setSyncBusy(true);
    setSyncStatus('Connecting…');
    setSyncOk(true);
    try {
      const res = await callDriveApi(url, code, 'read');
      if (!res.ok) throw new Error(res.error || 'Could not connect');
      const role = res.role || 'admin';
      const nextCfg: SyncConfig = { url, code, syncedAt: 0, h: '', role };

      if (role === 'viewer' && !res.data) {
        saveSyncConfig(nextCfg);
        setSyncCfg(nextCfg);
        setSyncStatus('Connected as view-only. Waiting for the admin to save the trip.');
        setSyncOk(true);
        return;
      }

      const hasLocal =
        state.people.length > 0 || state.expenses.length > 0 || state.contribs.length > 0;

      if (res.data) {
        if (!hasLocal) {
          applyRemoteState(res.data, res.updated || Date.now(), nextCfg);
          setSyncStatus('Connected and loaded from Google Drive.');
          setSyncOk(true);
          if (role === 'admin') void loadUsers(nextCfg);
        } else {
          setConfirmDialog({
            title: 'Google Drive already has a saved trip',
            message:
              'Load the Google Drive trip onto this device (replaces local data), or cancel to keep editing locally first.',
            confirmLabel: 'Load Drive trip',
            onConfirm: () => {
              applyRemoteState(res.data!, res.updated || Date.now(), nextCfg);
              setSyncStatus('Connected and loaded from Google Drive.');
              setSyncOk(true);
              if (role === 'admin') void loadUsers(nextCfg);
              setConfirmDialog(null);
            },
          });
        }
        return;
      }

      let curState = state;
      if (hasLocal) {
        curState = await flushPendingReceipts(nextCfg, curState);
        const pushedCfg = await pushToDrive(nextCfg, curState);
        if (role === 'admin') void loadUsers(pushedCfg);
      } else {
        saveSyncConfig(nextCfg);
        setSyncCfg(nextCfg);
        if (role === 'admin') void loadUsers(nextCfg);
      }
      setSyncStatus('Connected. Trip saved to Google Drive.');
      setSyncOk(true);
    } catch (err) {
      setSyncStatus(
        `Could not connect (${err instanceof Error ? err.message : 'check Web app URL and access code'}).`
      );
      setSyncOk(false);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleLoadFromDrive = async () => {
    if (!syncCfg) return;
    setSyncBusy(true);
    try {
      const res = await callDriveApi(syncCfg.url, syncCfg.code, 'read');
      if (!res.ok) throw new Error(res.error || 'Could not reach Drive');
      if (!res.data) {
        setSyncStatus('Nothing is saved on Drive yet.');
        setSyncOk(false);
        return;
      }
      applyRemoteState(res.data, res.updated || Date.now(), syncCfg);
      setSyncStatus('Loaded latest trip from Google Drive.');
      setSyncOk(true);
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : 'Could not reach Drive.');
      setSyncOk(false);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleOverwriteDrive = async () => {
    if (!syncCfg) return;
    setSyncBusy(true);
    try {
      setConflict(false);
      const updated = await flushPendingReceipts(syncCfg, state);
      await pushToDrive(syncCfg, updated);
      setSyncStatus('Drive now matches this device.');
      setSyncOk(true);
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : 'Could not reach Drive.');
      setSyncOk(false);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleDisconnectDrive = () => {
    setConfirmDialog({
      title: 'Disconnect Google Drive?',
      message: 'Your trip data stays safely stored both on this device and in Google Drive.',
      confirmLabel: 'Disconnect',
      onConfirm: () => {
        setSyncCfg(null);
        saveSyncConfig(null);
        setConflict(false);
        setUsers([]);
        setSyncStatus('Disconnected.');
        setSyncOk(true);
        channelRef.current?.postMessage({ type: 'cfg', cfg: null });
        setConfirmDialog(null);
      },
    });
  };

  const handleWipeDrive = async (codeConfirm: string): Promise<boolean> => {
    if (!syncCfg || codeConfirm !== syncCfg.code) return false;
    try {
      const res = await callDriveApi(syncCfg.url, syncCfg.code, 'wipe');
      if (!res.ok) return false;
      const blank = blankState();
      if (state.lock) blank.lock = state.lock;
      const resetCfg: SyncConfig = {
        ...syncCfg,
        syncedAt: 0,
        h: hashPayload(buildSyncPayload(blank)),
      };
      saveSyncConfig(resetCfg);
      setSyncCfg(resetCfg);
      persistLocalState(blank);
      setState(blank);
      setSyncStatus('All trip data removed from Drive and this device.');
      setSyncOk(true);
      return true;
    } catch {
      return false;
    }
  };

  // Friend handlers
  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    const name = friendName.trim();
    if (!name) return flash(setFriendFeedback, 'Please enter a name.', false);
    if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return flash(setFriendFeedback, `${name} is already on the list.`, false);
    }
    const person = {
      id: uid(),
      name,
      car: friendCar,
      joinDate: friendJoinDate || state.trip.start,
    };
    commitState((prev) => ({ ...prev, people: [...prev.people, person] }));
    setFriendName('');
    setFriendCar(false);
    flash(setFriendFeedback, `${name} added.`, true);
  };

  const handleToggleCar = (personId: string) => {
    commitState((prev) => ({
      ...prev,
      people: prev.people.map((p) => (p.id === personId ? { ...p, car: !p.car } : p)),
    }));
  };

  const handleRemoveFriend = (personId: string) => {
    const p = state.people.find((x) => x.id === personId);
    if (!p) return;
    if (
      state.expenses.some((e) => e.by === personId) ||
      state.contribs.some((c) => c.who === personId) ||
      state.payments.some((pay) => pay.from === personId || pay.to === personId)
    ) {
      return flash(
        setFriendFeedback,
        `${p.name} has expenses or payments, so cannot be removed.`,
        false
      );
    }
    commitState((prev) => ({
      ...prev,
      people: prev.people.filter((x) => x.id !== personId),
      expenses: prev.expenses.map((e) => {
        if (!e.split) return e;
        const filtered = e.split.filter((id) => id !== personId);
        return { ...e, split: filtered.length ? filtered : null };
      }),
    }));
    flash(setFriendFeedback, `${p.name} removed.`, true);
  };

  // Receipt selection handler
  const handleSelectReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const targetExpId = editExpId || uid();
      const processed = await processReceiptPhoto(file, targetExpId);
      setReceiptDraft(processed);
      setExistingReceipt(null);
      flash(setExpFeedback, 'Receipt photo ready. Save expense to upload to Drive.', true);
    } catch {
      flash(setExpFeedback, 'Could not read that image. Try another photo.', false);
    }
  };

  // Expense Add / Edit handler
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.people.length) return flash(setExpFeedback, 'Add your friends first.', false);
    const desc = expDesc.trim();
    if (!desc) return flash(setExpFeedback, 'Describe the expense.', false);
    const amt = parseFloat(expAmt);
    if (!(amt > 0)) return flash(setExpFeedback, 'Enter an amount above zero.', false);

    const ids = expSplit ? [...expSplit].filter((id) => state.people.some((p) => p.id === id)) : null;
    if (ids && !ids.length) return flash(setExpFeedback, 'Pick at least one person to share it.', false);

    if (expBy === 'kitty') {
      const old = state.expenses.find((x) => x.id === editExpId);
      const avail = calc.kCash + (old && old.by === 'kitty' ? old.amt : 0);
      if (amt > avail + 0.005) {
        return flash(
          setExpFeedback,
          `Barakah only has ${money(avail)}. Add collected money first or choose who paid.`,
          false
        );
      }
    }

    const expId = editExpId || uid();
    let finalReceipt: ReceiptMeta | null = existingReceipt;

    if (receiptDraft) {
      setUploadingReceipt(true);
      await idbSaveReceipt({
        expId,
        base64: receiptDraft.base64,
        mimeType: receiptDraft.mimeType,
        name: receiptDraft.name,
        dataUrl: receiptDraft.dataUrl,
        createdAt: Date.now(),
      });

      if (syncCfg && syncCfg.role !== 'viewer') {
        try {
          const upRes = await callDriveApi(syncCfg.url, syncCfg.code, 'receipt_upload', {
            expId,
            name: receiptDraft.name,
            mimeType: receiptDraft.mimeType,
            base64: receiptDraft.base64,
          });
          if (upRes.ok && upRes.fileId) {
            finalReceipt = {
              id: upRes.fileId,
              name: upRes.name || receiptDraft.name,
              url: upRes.url,
              thumb: receiptDraft.thumb,
              pending: false,
            };
          } else {
            finalReceipt = {
              name: receiptDraft.name,
              thumb: receiptDraft.thumb,
              pending: true,
            };
          }
        } catch {
          finalReceipt = {
            name: receiptDraft.name,
            thumb: receiptDraft.thumb,
            pending: true,
          };
        }
      } else {
        finalReceipt = {
          name: receiptDraft.name,
          thumb: receiptDraft.thumb,
          pending: true,
        };
      }
      setUploadingReceipt(false);
    }

    // If editing and old Drive receipt was replaced or cleared, trash old file in Drive
    if (editExpId) {
      const oldExp = state.expenses.find((x) => x.id === editExpId);
      if (oldExp?.receipt?.id && oldExp.receipt.id !== finalReceipt?.id && syncCfg && syncCfg.role !== 'viewer') {
        void callDriveApi(syncCfg.url, syncCfg.code, 'receipt_delete', {
          fileId: oldExp.receipt.id,
        }).catch(() => {});
      }
      if (!finalReceipt) {
        void idbDeleteReceipt(editExpId);
      }
    }

    const nextExp: Expense = {
      id: expId,
      desc,
      amt,
      by: expBy,
      date: expDate || todayStr(),
      cat: expCat,
      split: ids && ids.length < state.people.length ? ids : null,
      receipt: finalReceipt,
    };

    commitState((prev) => ({
      ...prev,
      expenses: editExpId
        ? prev.expenses.map((x) => (x.id === editExpId ? nextExp : x))
        : [...prev.expenses, nextExp],
    }));

    flash(
      setExpFeedback,
      editExpId
        ? 'Expense updated.'
        : finalReceipt?.id
          ? 'Expense & receipt photo saved to Google Drive.'
          : finalReceipt?.pending
            ? 'Expense & receipt saved locally (will upload to Drive when connected).'
            : 'Expense added.',
      true
    );

    setEditExpId(null);
    setExpDesc('');
    setExpAmt('');
    setExpSplit(null);
    setReceiptDraft(null);
    setExistingReceipt(null);
  };

  const handleEditExpense = (exp: Expense) => {
    setEditExpId(exp.id);
    setExpDesc(exp.desc);
    setExpAmt(String(exp.amt));
    setExpBy(exp.by);
    setExpDate(exp.date || state.trip.start || todayStr());
    setExpCat(exp.cat);
    setExpSplit(exp.split ? new Set(exp.split) : null);
    setReceiptDraft(null);
    setExistingReceipt(exp.receipt || null);
    expenseFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleDeleteExpense = (exp: Expense) => {
    if (exp.receipt?.id && syncCfg && syncCfg.role !== 'viewer') {
      void callDriveApi(syncCfg.url, syncCfg.code, 'receipt_delete', { fileId: exp.receipt.id }).catch(
        () => {}
      );
    }
    void idbDeleteReceipt(exp.id);
    commitState((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((x) => x.id !== exp.id),
    }));
  };

  // Barakah contribution handler
  const handleAddContrib = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contribWho) return flash(setContribFeedback, 'Add your friends first.', false);
    const amt = parseFloat(contribAmt);
    if (!(amt > 0)) return flash(setContribFeedback, 'Enter an amount above zero.', false);
    commitState((prev) => ({
      ...prev,
      contribs: [
        ...prev.contribs,
        { id: uid(), who: contribWho, amt, date: contribDate || todayStr() },
      ],
    }));
    setContribAmt('');
    flash(setContribFeedback, `${money(amt)} added to Barakah.`, true);
  };

  // Backup & Restore handlers
  const handleExportJson = () => {
    const updated = { ...state, darkMode, lastBackup: Date.now() };
    commitState(updated);
    const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `camp-split-backup-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(setSettingsFeedback, 'Backup file downloaded.', true);
  };

  const handleShareBackupFile = async () => {
    const updated = { ...state, darkMode, lastBackup: Date.now() };
    commitState(updated);
    const file = new File([JSON.stringify(updated)], `camp-split-backup-${todayStr()}.json`, {
      type: 'application/json',
    });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Camp Split backup' });
        flash(setBackupFeedback, 'Backup shared.', true);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(setBackupFeedback, 'Backup downloaded. Save it to Drive or send via WhatsApp.', true);
  };

  const handleCopyRestoreLink = async (openQr = false) => {
    try {
      const clone: TripState = safeJsonParse(JSON.stringify(state)) as TripState;
      delete clone.lock;
      clone.trip.img = '';
      // Strip embedded receipt thumbnails from restore link to keep URL short
      clone.expenses = clone.expenses.map((e) =>
        e.receipt ? { ...e, receipt: { ...e.receipt, thumb: undefined } } : e
      );
      const url = `${getCleanBaseUrl()}#restore=${await packBackup(clone)}`;
      const updated = { ...state, lastBackup: Date.now() };
      commitState(updated);
      if (openQr) {
        setQrPayload({
          title: 'Restore backup link',
          subtitle: 'Scan or save this QR code to transfer your trip offline',
          url,
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        flash(setBackupFeedback, 'Restore link copied.', true);
      } catch {
        setQrPayload({
          title: 'Restore backup link',
          subtitle: 'Copy or scan this restore link',
          url,
        });
      }
    } catch {
      flash(setBackupFeedback, 'Use “Send backup file” for trips with lots of data.', false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      flash(setSettingsFeedback, 'Backup file is too large (max 10 MB).', false);
      flash(setBackupFeedback, 'Backup file is too large (max 10 MB).', false);
      return;
    }
    try {
      const text = await file.text();
      const parsed = safeJsonParse(text);
      promptRestoreBackup(parsed, 'file');
    } catch {
      flash(setSettingsFeedback, 'That backup file could not be read.', false);
      flash(setBackupFeedback, 'That backup file could not be read.', false);
    }
  };

  const handleScannedRestoreText = async (rawText: string): Promise<string | null> => {
    const trimmed = rawText.trim();
    if (!trimmed) return 'Nothing found in QR code or link.';

    // 1. Check for #restore= in a URL or bare token
    const restoreIdx = trimmed.indexOf('#restore=');
    if (restoreIdx >= 0 || trimmed.startsWith('restore=')) {
      const token =
        restoreIdx >= 0 ? trimmed.slice(restoreIdx + 9) : trimmed.slice(8);
      try {
        const raw = await unpackBackup(token.trim());
        promptRestoreBackup(raw, 'QR code');
        setQrRestoreOpen(false);
        return null;
      } catch {
        return 'This Restore QR code or link is damaged or incomplete.';
      }
    }

    // 2. Check for Drive share/pair QR link (#j=, #join=, #p=, #pair=)
    const hashPos = trimmed.indexOf('#');
    if (hashPos >= 0) {
      const parsedLink = parseHashConnectLink(trimmed.slice(hashPos));
      if (parsedLink) {
        setQrRestoreOpen(false);
        connectFromParsedLink(parsedLink);
        return null;
      }
    }

    // 3. Check for raw JSON backup text
    if (trimmed.startsWith('{')) {
      try {
        const parsed = safeJsonParse(trimmed);
        promptRestoreBackup(parsed, 'QR code');
        setQrRestoreOpen(false);
        return null;
      } catch {
        return 'QR JSON data is not a valid Camp Split backup.';
      }
    }

    return 'This QR code is not a Camp Split restore or sync link.';
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const img = await processLogoImage(file);
      commitState((prev) => ({ ...prev, trip: { ...prev.trip, img } }));
      flash(setSettingsFeedback, 'Logo & browser favicon updated automatically.', true);
    } catch {
      flash(setSettingsFeedback, 'Could not process logo image.', false);
    }
  };

  const handlePinVerifyAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.lock) return;
    const ok = (await hashPin(pinCheckInput, state.lock.salt)) === state.lock.hash;
    if (!ok) {
      setPinCheckError('Wrong PIN.');
      return;
    }
    setPinCheckInput('');
    setPinCheckError('');
    if (pinActionMode === 'remove') {
      commitState((prev) => {
        const next = { ...prev };
        delete next.lock;
        return next;
      });
      setPinActionMode(null);
      setPinMenuOpen(false);
    } else if (pinActionMode === 'change') {
      setPinActionMode(null);
      setPinMenuOpen(false);
      setLockMode('set');
    }
  };

  const applyDarkModeSetting = (next: DarkModeSetting) => {
    setDarkMode(next);
    saveDarkMode(next);
    if (!isViewer) {
      commitState((prev) => ({ ...prev, darkMode: next }));
    }
  };

  const handleSelectTheme = (key: ThemeKey) => {
    if (isViewer) {
      setState((prev) => {
        const next = { ...prev, theme: key };
        persistLocalState(next);
        return next;
      });
    } else {
      commitState((prev) => ({ ...prev, theme: key }));
    }
  };

  const cycleDarkMode = () => {
    const order: DarkModeSetting[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(darkMode) + 1) % order.length];
    applyDarkModeSetting(next);
  };

  const isCurrentlyDark =
    darkMode === 'dark' ||
    (darkMode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const backupOld =
    (state.expenses.length > 0 || state.contribs.length > 0) &&
    (!state.lastBackup || Date.now() - state.lastBackup > 86400000);

  // Full screen PIN lock replaces main view when locked
  if (lockMode) {
    return (
      <PinLockModal
        mode={lockMode}
        lock={state.lock}
        onUnlock={() => setLockMode(null)}
        onSetPin={(newLock: PinLock) => {
          commitState((prev) => ({ ...prev, lock: newLock }));
          setLockMode(null);
        }}
        onCancelSet={() => setLockMode(null)}
      />
    );
  }

  return (
    <div className={`min-h-screen overflow-x-clip ${themeConfig.pageBgClass} text-stone-900 dark:text-slate-100 transition-colors`}>
      {/* Top Bar (3-zone contract: Brand — Nav Links — 1 Primary Action) */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${themeConfig.headerClass}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#top"
            className="text-base sm:text-lg font-bold tracking-tight text-stone-900 dark:text-slate-100 whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <span className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center overflow-hidden text-base shrink-0">
              {state.trip.img ? (
                <img src={state.trip.img} alt="" className="w-full h-full object-cover" />
              ) : (
                state.trip.emoji || '🏕️'
              )}
            </span>
            <span className="truncate max-w-[160px] sm:max-w-[220px]">{state.trip.name || 'Camp Split'}</span>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600 dark:text-slate-400">
            {canShowSection('summary') && (
              <a
                href="#sec-summary"
                className="hover:text-stone-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Summary
              </a>
            )}
            {canShowSection('expenses') && (
              <a
                href="#sec-expenses"
                className="hover:text-stone-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Expenses
              </a>
            )}
            {canShowSection('friends') && (
              <a
                href="#sec-friends"
                className="hover:text-stone-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Friends
              </a>
            )}
            {!isViewer && (
              <a
                href="#sec-share"
                className="hover:text-stone-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Share &amp; QR
              </a>
            )}
            {!isViewer && (
              <a
                href="#sec-sync"
                className="hover:text-stone-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Drive Sync
              </a>
            )}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {!isViewer ? (
              <a
                href="#sec-add-expense"
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add expense</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void runSync()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-6">
        {/* Workspace Toolbar (Theme, Dark Mode, TV Mode, PIN Lock, Sync indicator) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-slate-800">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100 truncate">
              {state.trip.name || 'Camp Split'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-stone-500 dark:text-slate-400 mt-0.5">
              <span>Fair shares for every weekend away</span>
              {isViewer && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                    <Eye className="w-3.5 h-3.5" />
                    View only · live
                  </span>
                </>
              )}
              {syncCfg && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      syncOk ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    {syncBusy ? 'Syncing…' : syncStatus || 'Drive connected'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Theme & Layout Studio button */}
            <button
              type="button"
              onClick={() => setThemePickerOpen(true)}
              title="Change theme & data layout style"
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-black/15"
                style={{ backgroundColor: themeConfig.swatch }}
              />
              <Palette className="w-3.5 h-3.5 text-stone-500 dark:text-slate-400" />
              <span>{themeConfig.name}</span>
            </button>

            {/* Light / Dark / System mode button */}
            <button
              type="button"
              onClick={cycleDarkMode}
              title={`Appearance: ${darkMode}`}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {isCurrentlyDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              <span className="capitalize">{darkMode}</span>
            </button>

            {/* PIN Lock button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (!state.lock) setLockMode('set');
                  else setPinMenuOpen((v) => !v);
                }}
                title={state.lock ? 'PIN options' : 'Set a PIN'}
                aria-label={state.lock ? 'PIN options' : 'Set a PIN'}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {state.lock ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                <span className="hidden sm:inline">{state.lock ? 'PIN' : 'Lock'}</span>
              </button>

              {pinMenuOpen && state.lock && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 shadow-xl p-2 z-40 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPinMenuOpen(false);
                      setLockMode('unlock');
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Lock screen now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinActionMode('change');
                      setPinCheckError('');
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Change PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinActionMode('remove');
                      setPinCheckError('');
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    Turn PIN off
                  </button>
                  {pinActionMode && (
                    <form onSubmit={(e) => void handlePinVerifyAction(e)} className="pt-2 border-t border-stone-100 dark:border-slate-800 space-y-2 p-1">
                      <input
                        type="password"
                        inputMode="numeric"
                        placeholder="Current PIN"
                        value={pinCheckInput}
                        onChange={(e) => setPinCheckInput(e.target.value)}
                        className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                      />
                      {pinCheckError && <p className="text-xs text-red-600">{pinCheckError}</p>}
                      <div className="flex gap-1.5">
                        <button
                          type="submit"
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPinActionMode(null);
                            setPinCheckInput('');
                            setPinCheckError('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-slate-700 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Big Screen / TV Mode */}
            <button
              type="button"
              onClick={() => setTvMode((v) => !v)}
              title="Toggle big screen TV mode"
              className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                tvMode
                  ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-ink)]'
                  : 'bg-white dark:bg-slate-900 border-stone-200 dark:border-slate-800 text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span className="hidden sm:inline">TV mode</span>
            </button>
          </div>
        </div>

        {/* Conflict quick banner */}
        {conflict && !isViewer && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-amber-900 dark:text-amber-100">
              <strong>Sync conflict:</strong> Both Google Drive and this device have unsynced edits.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleLoadFromDrive()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-xs font-semibold text-amber-900 dark:text-amber-100 cursor-pointer"
              >
                Use Drive copy
              </button>
              <button
                type="button"
                onClick={() => void handleOverwriteDrive()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
              >
                Keep this device
              </button>
            </div>
          </div>
        )}

        {/* SUMMARY SECTION */}
        {canShowSection('summary') && (
          <section
            id="sec-summary"
            className={`${themeConfig.cardClass} p-4 sm:p-6`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">Summary</h2>
              {calc.n > 0 && (
                <span className="text-xs text-stone-500 dark:text-slate-400">
                  {calc.n} friend{calc.n === 1 ? '' : 's'} · {state.expenses.length} expense
                  {state.expenses.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {themeConfig.kpiLayout === 'bento-hero' ? (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-5 rounded-2xl bg-[var(--accent)] text-white p-4 sm:p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-medium text-white/80">Total trip spend</span>
                    <strong className="block mt-1 text-2xl sm:text-3xl font-bold font-mono-num tracking-tight">
                      {money(calc.total + calc.cleanTotal)}
                    </strong>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between gap-2 text-xs text-white/90 font-mono-num">
                    <span>Avg / person</span>
                    <strong>{calc.n ? money((calc.total + calc.cleanTotal) / calc.n) : money(0)}</strong>
                  </div>
                </div>
                <div className="lg:col-span-7 grid grid-cols-2 gap-3">
                  {[
                    { label: 'Expenses', val: money(calc.total) },
                    { label: 'Fuel', val: money(calc.cat.fuel || 0) },
                    { label: `Car cleaning (${calc.cars})`, val: money(calc.cleanTotal) },
                    { label: 'Barakah cash', val: money(calc.kCash) },
                  ].map((stat) => (
                    <div key={stat.label} className={`${themeConfig.subCardClass} p-3 min-w-0`}>
                      <span className="block text-xs text-stone-500 dark:text-slate-400 truncate">
                        {stat.label}
                      </span>
                      <strong className="block mt-1 text-base sm:text-lg font-bold font-mono-num text-stone-900 dark:text-slate-100 truncate">
                        {stat.val}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : themeConfig.kpiLayout === 'strip-2row' ? (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border border-stone-200 dark:border-slate-800 rounded-xl overflow-hidden bg-stone-50/50 dark:bg-slate-950/60">
                {[
                  { label: 'Total shared', val: money(calc.total + calc.cleanTotal) },
                  { label: 'Expenses', val: money(calc.total) },
                  { label: 'Fuel', val: money(calc.cat.fuel || 0) },
                  { label: `Cleaning (${calc.cars})`, val: money(calc.cleanTotal) },
                  { label: 'Barakah cash', val: money(calc.kCash) },
                  { label: 'Per person', val: calc.n ? money((calc.total + calc.cleanTotal) / calc.n) : money(0) },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-3 border-b border-r border-stone-200/80 dark:border-slate-800/80 last:border-r-0 min-w-0"
                  >
                    <span className="block text-[11px] font-medium text-stone-500 dark:text-slate-400 truncate">
                      {stat.label}
                    </span>
                    <strong className="block mt-1 text-base sm:text-lg font-bold font-mono-num text-stone-900 dark:text-slate-100 truncate">
                      {stat.val}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Total shared', val: money(calc.total + calc.cleanTotal) },
                  { label: 'Expenses', val: money(calc.total) },
                  { label: 'Fuel', val: money(calc.cat.fuel || 0) },
                  { label: `Car cleaning (${calc.cars})`, val: money(calc.cleanTotal) },
                  { label: 'Barakah cash', val: money(calc.kCash) },
                  { label: 'Per person avg', val: calc.n ? money((calc.total + calc.cleanTotal) / calc.n) : money(0) },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`${themeConfig.subCardClass} p-3 min-w-0`}
                  >
                    <span className="block text-xs text-stone-500 dark:text-slate-400 truncate">{stat.label}</span>
                    <strong className="block mt-1 text-lg sm:text-xl font-bold font-mono-num text-stone-900 dark:text-slate-100 truncate">
                      {stat.val}
                    </strong>
                  </div>
                ))}
              </div>
            )}

            <CategoryPieChart
              catTotals={calc.cat}
              totalExpenses={calc.total}
              currency={state.trip.cur}
              variant={themeConfig.chartVariant}
            />

            <SummaryBalances
              people={state.people}
              calc={calc}
              currency={state.trip.cur}
              variant={themeConfig.balanceVariant}
              subCardClass={themeConfig.subCardClass}
            />
          </section>
        )}

        {/* WHO PAYS WHOM + ALREADY PAID BACK */}
        {(canShowSection('xfers') || canShowSection('pays')) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {canShowSection('xfers') && (
              <section className={`${themeConfig.cardClass} p-4 sm:p-6`}>
                <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">Who pays whom</h2>
                <div className="mt-3 space-y-2">
                  {calc.tx.length === 0 ? (
                    <p className="text-sm text-stone-500 dark:text-slate-400 py-2">
                      {state.expenses.length ? 'Everyone is square.' : 'Add expenses to see who pays whom.'}
                    </p>
                  ) : (
                    calc.tx.map((tx, idx) => (
                      <div
                        key={`${tx.from}-${tx.to}-${idx}`}
                        className={`flex flex-wrap items-center justify-between gap-2 ${themeConfig.subCardClass} px-3.5 py-2.5`}
                      >
                        <div className="text-sm text-stone-800 dark:text-slate-200 min-w-0">
                          <strong>{personName(tx.from, state.people)}</strong>
                          <span className="mx-1.5 text-stone-400">→</span>
                          <strong>{personName(tx.to, state.people)}</strong>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono-num font-bold text-sm text-stone-900 dark:text-slate-100">
                            {money(tx.amt)}
                          </span>
                          {!isViewer && (
                            <button
                              type="button"
                              onClick={() => {
                                commitState((prev) => ({
                                  ...prev,
                                  payments: [
                                    ...prev.payments,
                                    {
                                      id: uid(),
                                      from: tx.from,
                                      to: tx.to,
                                      amt: Math.round(tx.amt * 100) / 100,
                                    },
                                  ],
                                }));
                                flash(setPayFeedback, 'Marked as paid.', true);
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Mark paid
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {canShowSection('pays') && (
              <section className={`${themeConfig.cardClass} p-4 sm:p-6`}>
                <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">Already paid back</h2>
                <div className="mt-3 divide-y divide-stone-100 dark:divide-slate-800">
                  {state.payments.length === 0 ? (
                    <p className="text-sm text-stone-500 dark:text-slate-400 py-2">Nothing marked as paid yet.</p>
                  ) : (
                    state.payments.map((pay) => (
                      <div key={pay.id} className="py-2.5 flex items-center justify-between gap-2">
                        <span className="text-sm text-stone-700 dark:text-slate-300">
                          {personName(pay.from, state.people)} paid {personName(pay.to, state.people)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num font-semibold text-sm text-emerald-700 dark:text-emerald-400">
                            {money(pay.amt)}
                          </span>
                          {!isViewer && (
                            <button
                              type="button"
                              onClick={() =>
                                commitState((prev) => ({
                                  ...prev,
                                  payments: prev.payments.filter((x) => x.id !== pay.id),
                                }))
                              }
                              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-stone-200 dark:border-slate-700 text-xs font-medium text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Undo2 className="w-3 h-3" />
                              <span>Undo</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {payFeedback && (
                  <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {payFeedback.text}
                  </p>
                )}
              </section>
            )}
          </div>
        )}

        {/* ADD EXPENSE (Admin) + FRIENDS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {!isViewer && (
            <section
              id="sec-add-expense"
              ref={expenseFormRef}
              className={`lg:col-span-7 ${themeConfig.cardClass} p-4 sm:p-6 min-w-0`}
            >
              <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">
                {editExpId ? 'Edit expense' : 'Add an expense'}
              </h2>

              <form onSubmit={(e) => void handleSaveExpense(e)} className="mt-3 space-y-3.5">
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                    What was it?
                  </label>
                  <input
                    type="text"
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    placeholder="Food, tent rental, fuel refill…"
                    className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                      Amount ({state.trip.cur})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={expAmt}
                      onChange={(e) => setExpAmt(e.target.value)}
                      placeholder="0.00"
                      className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono-num text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                      Paid by
                    </label>
                    <select
                      value={expBy}
                      onChange={(e) => setExpBy(e.target.value)}
                      className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    >
                      <option value="kitty">Group Barakah (cash in hand)</option>
                      {state.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0 overflow-hidden">
                    <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                      Expense date
                    </label>
                    <input
                      type="date"
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className="w-full min-w-0 max-w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                      Category
                    </label>
                    <select
                      value={expCat}
                      onChange={(e) => setExpCat(e.target.value as ExpenseCategory)}
                      className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    >
                      <option value="food">Food</option>
                      <option value="rent">Rentals</option>
                      <option value="fuel">Fuel (refill to full)</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1.5">
                    Shared between (friends who joined later are skipped automatically)
                  </span>
                  {state.people.length === 0 ? (
                    <p className="text-xs text-stone-400 dark:text-slate-500">Add friends first.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {state.people.map((p) => {
                        const checked = !expSplit || expSplit.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              const next = new Set(expSplit || state.people.map((x) => x.id));
                              if (next.has(p.id)) next.delete(p.id);
                              else next.add(p.id);
                              setExpSplit(next);
                            }}
                            className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                              checked
                                ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-ink)]'
                                : 'bg-stone-50 dark:bg-slate-950 border-stone-200 dark:border-slate-800 text-stone-500 dark:text-slate-400'
                            }`}
                          >
                            {checked ? '✓ ' : ''}
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Receipt Photo Attachment */}
                <div className="pt-1">
                  <span className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1.5">
                    Receipt photo (saved to your Google Drive folder)
                  </span>
                  <input
                    ref={receiptFileRef}
                    type="file"
                    accept="image/*"
                    onChange={(ev) => void handleSelectReceiptFile(ev)}
                    className="hidden"
                  />
                  <input
                    ref={receiptCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(ev) => void handleSelectReceiptFile(ev)}
                    className="hidden"
                  />

                  {receiptDraft || existingReceipt ? (
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-stone-50 dark:bg-slate-950 border border-stone-200 dark:border-slate-700">
                      {(receiptDraft?.thumb || existingReceipt?.thumb) && (
                        <img
                          src={receiptDraft?.thumb || existingReceipt?.thumb}
                          alt="Receipt thumbnail"
                          className="w-12 h-12 rounded-lg object-cover border border-stone-200 dark:border-slate-700 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-900 dark:text-slate-100 truncate">
                          {receiptDraft?.name || existingReceipt?.name}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-slate-400">
                          {receiptDraft
                            ? syncCfg
                              ? 'Ready to save into Drive folder'
                              : 'Saved locally · uploads when Drive connects'
                            : existingReceipt?.id
                              ? 'Saved in Google Drive folder'
                              : 'Queued locally for Drive'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptDraft(null);
                          setExistingReceipt(null);
                        }}
                        aria-label="Remove receipt photo"
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-stone-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-stone-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => receiptCameraRef.current?.click()}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Take photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => receiptFileRef.current?.click()}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <ImagePlus className="w-4 h-4" />
                        <span>Upload receipt</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={uploadingReceipt}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {uploadingReceipt
                      ? 'Saving receipt…'
                      : editExpId
                        ? 'Save changes'
                        : 'Add expense'}
                  </button>
                  {editExpId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditExpId(null);
                        setExpDesc('');
                        setExpAmt('');
                        setExpSplit(null);
                        setReceiptDraft(null);
                        setExistingReceipt(null);
                      }}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>

                {expFeedback && (
                  <p
                    className={`text-xs font-medium ${
                      expFeedback.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {expFeedback.text}
                  </p>
                )}
              </form>
            </section>
          )}

          {canShowSection('friends') && (
            <section
              id="sec-friends"
              className={`${
                isViewer ? 'lg:col-span-12' : 'lg:col-span-5'
              } ${themeConfig.cardClass} p-4 sm:p-6 min-w-0`}
            >
              <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">Friends</h2>

              {!isViewer && (
                <form onSubmit={handleAddFriend} className="mt-3 space-y-2.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={friendName}
                      onChange={(e) => setFriendName(e.target.value)}
                      placeholder="Friend’s name"
                      className="flex-1 min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                    <button
                      type="submit"
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Add
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-slate-300 cursor-pointer select-none py-1">
                    <input
                      type="checkbox"
                      checked={friendCar}
                      onChange={(e) => setFriendCar(e.target.checked)}
                      className="w-4 h-4 accent-[var(--accent)] rounded"
                    />
                    <span>Took their car (gets cleaning allowance)</span>
                  </label>

                  <div className="min-w-0 overflow-hidden">
                    <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                      Joined on
                    </label>
                    <input
                      type="date"
                      value={friendJoinDate}
                      onChange={(e) => setFriendJoinDate(e.target.value)}
                      className="w-full min-w-0 max-w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-stone-900 dark:text-slate-100"
                    />
                  </div>
                </form>
              )}

              {friendFeedback && (
                <p
                  className={`mt-2.5 text-xs font-medium ${
                    friendFeedback.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {friendFeedback.text}
                </p>
              )}

              <div className="mt-4 divide-y divide-stone-100 dark:divide-slate-800">
                {state.people.length === 0 ? (
                  <p className="text-sm text-stone-500 dark:text-slate-400 py-2">
                    Add the friends who are coming.
                  </p>
                ) : (
                  state.people.map((p) => {
                    const jd = getJoinDate(p, state.trip.start);
                    const lateJoin = jd > state.trip.start;
                    return (
                      <div key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-sm text-stone-900 dark:text-slate-100">
                            {p.name}
                          </span>
                          <span className="text-xs text-stone-500 dark:text-slate-400 ml-2">
                            {p.car ? 'Car' : 'No car'}
                            {lateJoin ? ` · joined ${formatShortDate(jd)}` : ''}
                          </span>
                        </div>

                        {!isViewer && (
                          <div className="flex items-center gap-1 min-w-0 max-w-full">
                            {editingJoinId === p.id ? (
                              <div className="flex items-center gap-1 min-w-0 max-w-full">
                                <input
                                  type="date"
                                  value={editingJoinVal}
                                  onChange={(e) => setEditingJoinVal(e.target.value)}
                                  className="w-[140px] max-w-full min-w-0 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-2 py-1 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (/^\d{4}-\d\d-\d\d$/.test(editingJoinVal)) {
                                      commitState((prev) => ({
                                        ...prev,
                                        people: prev.people.map((x) =>
                                          x.id === p.id ? { ...x, joinDate: editingJoinVal } : x
                                        ),
                                      }));
                                    }
                                    setEditingJoinId(null);
                                  }}
                                  className="min-h-[32px] px-2 rounded-lg bg-[var(--accent)] text-white text-xs cursor-pointer shrink-0"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingJoinId(p.id);
                                  setEditingJoinVal(jd);
                                }}
                                title="Edit join date"
                                className="min-h-[36px] px-2.5 py-1 rounded-lg border border-stone-200 dark:border-slate-700 text-xs text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                {formatShortDate(jd)}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleToggleCar(p.id)}
                              title="Toggle car"
                              aria-label={`Toggle car for ${p.name}`}
                              className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border cursor-pointer ${
                                p.car
                                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                                  : 'border-stone-200 dark:border-slate-700 text-stone-400 hover:text-stone-700 dark:hover:text-slate-200'
                              }`}
                            >
                              <Car className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFriend(p.id)}
                              title="Remove friend"
                              aria-label={`Remove ${p.name}`}
                              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-slate-700 text-stone-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
        </div>

        {/* EXPENSES LIST */}
        {canShowSection('expenses') && (
          <section
            id="sec-expenses"
            className={`${themeConfig.cardClass} p-4 sm:p-6`}
          >
            <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">Expenses</h2>

            {state.expenses.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500 dark:text-slate-400 py-2">
                No expenses yet. Keep adding as the trip goes.
              </p>
            ) : themeConfig.expenseFeedVariant === 'timeline' ? (
              <div className="mt-4 space-y-5">
                {(() => {
                  const reversed = state.expenses.slice().reverse();
                  const groups: { date: string; items: Expense[]; sum: number }[] = [];
                  for (const exp of reversed) {
                    const dk = exp.date || state.trip.start || '';
                    const last = groups[groups.length - 1];
                    if (last && last.date === dk) {
                      last.items.push(exp);
                      last.sum += exp.amt;
                    } else {
                      groups.push({ date: dk, items: [exp], sum: exp.amt });
                    }
                  }
                  return groups.map((grp) => (
                    <div key={grp.date || 'undated'} className="relative pl-4 border-l-2 border-[var(--accent)]/35">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-ink)] dark:text-[var(--accent)]">
                          {grp.date ? formatShortDate(grp.date) : 'Trip day'} · {grp.items.length} item
                          {grp.items.length === 1 ? '' : 's'}
                        </span>
                        <span className="text-xs font-mono-num font-semibold text-stone-600 dark:text-slate-300">
                          {money(grp.sum)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {grp.items.map((exp) => {
                          const shareCount = getParticipants(exp, state.people, state.trip.start).length;
                          return (
                            <div
                              key={exp.id}
                              className={`${themeConfig.subCardClass} p-3 flex flex-wrap items-center justify-between gap-3`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {exp.receipt && (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxExpense(exp)}
                                    title="View receipt photo"
                                    className="w-11 h-11 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                                  >
                                    {exp.receipt.thumb ? (
                                      <img
                                        src={exp.receipt.thumb}
                                        alt={`Receipt for ${exp.desc}`}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <Paperclip className="w-4 h-4 text-stone-500 dark:text-slate-300" />
                                    )}
                                  </button>
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium text-sm text-stone-900 dark:text-slate-100 truncate">
                                    {exp.desc}
                                  </p>
                                  <p className="text-xs text-stone-500 dark:text-slate-400 mt-0.5">
                                    {CATEGORY_LABELS[exp.cat]} · Paid by {personName(exp.by, state.people)} ·{' '}
                                    {shareCount} sharing
                                    {exp.receipt?.pending ? ' · Queued for Drive' : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono-num font-bold text-sm sm:text-base text-stone-900 dark:text-slate-100">
                                  {money(exp.amt)}
                                </span>
                                {exp.receipt && (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxExpense(exp)}
                                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-stone-200 dark:border-slate-700 text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                  >
                                    <Paperclip className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Receipt</span>
                                  </button>
                                )}
                                {!isViewer && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleEditExpense(exp)}
                                      aria-label={`Edit ${exp.desc}`}
                                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-slate-700 text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteExpense(exp)}
                                      aria-label={`Delete ${exp.desc}`}
                                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-slate-700 text-stone-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="mt-3 divide-y divide-stone-100 dark:divide-slate-800">
                {state.expenses
                  .slice()
                  .reverse()
                  .map((exp) => {
                    const shareCount = getParticipants(exp, state.people, state.trip.start).length;
                    return (
                      <div
                        key={exp.id}
                        className="py-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {exp.receipt && (
                            <button
                              type="button"
                              onClick={() => setLightboxExpense(exp)}
                              title="View receipt photo"
                              className="w-11 h-11 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                            >
                              {exp.receipt.thumb ? (
                                <img
                                  src={exp.receipt.thumb}
                                  alt={`Receipt for ${exp.desc}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Paperclip className="w-4 h-4 text-stone-500 dark:text-slate-300" />
                              )}
                            </button>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-stone-900 dark:text-slate-100 truncate">
                              {exp.desc}
                            </p>
                            <p className="text-xs text-stone-500 dark:text-slate-400 mt-0.5">
                              {CATEGORY_LABELS[exp.cat]} · Paid by {personName(exp.by, state.people)} ·{' '}
                              {formatShortDate(exp.date || state.trip.start)} · {shareCount} sharing
                              {exp.receipt?.pending ? ' · Queued for Drive' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono-num font-bold text-sm sm:text-base text-stone-900 dark:text-slate-100">
                            {money(exp.amt)}
                          </span>
                          {exp.receipt && (
                            <button
                              type="button"
                              onClick={() => setLightboxExpense(exp)}
                              className="min-h-[36px] px-2.5 py-1 rounded-lg border border-stone-200 dark:border-slate-700 text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Receipt</span>
                            </button>
                          )}
                          {!isViewer && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditExpense(exp)}
                                aria-label={`Edit ${exp.desc}`}
                                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-slate-700 text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(exp)}
                                aria-label={`Delete ${exp.desc}`}
                                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-slate-700 text-stone-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        )}

        {/* BARAKAH (MONEY COLLECTED) */}
        {canShowSection('barakah') && (
          <section className={`${themeConfig.cardClass} p-4 sm:p-6`}>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">
              Barakah (money collected)
            </h2>

            {!isViewer && (
              <form onSubmit={handleAddContrib} className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5 min-w-0">
                  <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                    Who paid in
                  </label>
                  <select
                    value={contribWho}
                    onChange={(e) => setContribWho(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100"
                  >
                    {state.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3 min-w-0">
                  <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={contribAmt}
                    onChange={(e) => setContribAmt(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono-num text-stone-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2 min-w-0 overflow-hidden">
                  <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={contribDate}
                    onChange={(e) => setContribDate(e.target.value)}
                    className="w-full min-w-0 max-w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3 py-2.5 text-sm text-stone-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2 min-w-0">
                  <button
                    type="submit"
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>
              </form>
            )}

            {contribFeedback && (
              <p
                className={`mt-2.5 text-xs font-medium ${
                  contribFeedback.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {contribFeedback.text}
              </p>
            )}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`${themeConfig.subCardClass} p-3`}>
                <span className="block text-xs text-stone-500 dark:text-slate-400">Collected</span>
                <strong className="block mt-1 text-lg font-bold font-mono-num">{money(calc.kIn)}</strong>
              </div>
              <div className={`${themeConfig.subCardClass} p-3`}>
                <span className="block text-xs text-stone-500 dark:text-slate-400">Spent from Barakah</span>
                <strong className="block mt-1 text-lg font-bold font-mono-num">{money(calc.kExp)}</strong>
              </div>
              <div className={`${themeConfig.subCardClass} p-3`}>
                <span className="block text-xs text-stone-500 dark:text-slate-400">Cash in hand</span>
                <strong
                  className={`block mt-1 text-lg font-bold font-mono-num ${
                    calc.kCash < -0.005 ? 'text-red-600 dark:text-red-400' : ''
                  }`}
                >
                  {money(calc.kCash)}
                </strong>
              </div>
            </div>

            <div className="mt-4 divide-y divide-stone-100 dark:divide-slate-800">
              {state.contribs.length === 0 ? (
                <p className="text-sm text-stone-500 dark:text-slate-400 py-2">No money collected yet.</p>
              ) : (
                state.contribs
                  .slice()
                  .reverse()
                  .map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-sm text-stone-900 dark:text-slate-100">
                          {personName(c.who, state.people)}
                        </span>
                        <span className="text-xs text-stone-500 dark:text-slate-400 ml-2">
                          {formatShortDate(c.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num font-semibold text-sm text-emerald-700 dark:text-emerald-400">
                          +{money(c.amt)}
                        </span>
                        {!isViewer && (
                          <button
                            type="button"
                            onClick={() =>
                              commitState((prev) => ({
                                ...prev,
                                contribs: prev.contribs.filter((x) => x.id !== c.id),
                              }))
                            }
                            aria-label="Remove contribution"
                            className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-slate-700 text-stone-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </section>
        )}

        {/* TRIP SETTINGS */}
        {canShowSection('settings') && (
          <section className={`${themeConfig.cardClass} p-4 sm:p-6`}>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">Trip settings</h2>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="min-w-0">
                <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                  Trip name
                </label>
                <input
                  type="text"
                  disabled={isViewer}
                  value={state.trip.name}
                  onChange={(e) =>
                    commitState((prev) => ({ ...prev, trip: { ...prev.trip, name: e.target.value } }))
                  }
                  className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                  Logo emoji
                </label>
                <input
                  type="text"
                  maxLength={4}
                  disabled={isViewer}
                  value={state.trip.emoji}
                  onChange={(e) =>
                    commitState((prev) => ({ ...prev, trip: { ...prev.trip, emoji: e.target.value } }))
                  }
                  className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  maxLength={3}
                  disabled={isViewer}
                  value={state.trip.cur}
                  onChange={(e) =>
                    commitState((prev) => ({ ...prev, trip: { ...prev.trip, cur: e.target.value } }))
                  }
                  className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
                />
              </div>
              <div className="min-w-0 overflow-hidden">
                <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                  Trip start date
                </label>
                <input
                  type="date"
                  disabled={isViewer}
                  value={state.trip.start}
                  onChange={(e) =>
                    commitState((prev) => ({ ...prev, trip: { ...prev.trip, start: e.target.value } }))
                  }
                  className="w-full min-w-0 max-w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1">
                  Cleaning per car
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  disabled={isViewer}
                  value={state.trip.clean}
                  onChange={(e) => {
                    const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    commitState((prev) => ({ ...prev, trip: { ...prev.trip, clean: v } }));
                  }}
                  className="w-full min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono-num disabled:opacity-60"
                />
              </div>
            </div>

            {!isViewer && (
              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleLogoUpload(e)}
                  className="hidden"
                />
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  onChange={(e) => void handleImportBackup(e)}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {state.trip.img && (
                    <div className="inline-flex items-center gap-2 pr-2 py-1 pl-1 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950">
                      <img
                        src={state.trip.img}
                        alt="Trip logo and favicon"
                        className="w-7 h-7 rounded-lg object-cover"
                      />
                      <span className="text-[11px] font-medium text-stone-600 dark:text-slate-300">
                        Logo &amp; tab icon synced
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{state.trip.img ? 'Change logo & favicon' : 'Upload logo (sets favicon)'}</span>
                  </button>
                  {state.trip.img && (
                    <button
                      type="button"
                      onClick={() => commitState((prev) => ({ ...prev, trip: { ...prev.trip, img: '' } }))}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-medium hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Use emoji logo
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Backup JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-medium hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Restore JSON
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmDialog({
                      title: 'Start a new trip?',
                      message:
                        'This clears friends, expenses, Barakah entries, and payments (your trip name, logo, and theme stay).',
                      confirmLabel: 'Clear trip',
                      destructive: true,
                      onConfirm: () => {
                        commitState((prev) => ({
                          ...prev,
                          people: [],
                          expenses: [],
                          payments: [],
                          contribs: [],
                        }));
                        setEditExpId(null);
                        setExpSplit(null);
                        setConfirmDialog(null);
                      },
                    })
                  }
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>New trip</span>
                </button>
              </div>
            )}

            {settingsFeedback && (
              <p
                className={`mt-2.5 text-xs font-medium ${
                  settingsFeedback.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {settingsFeedback.text}
              </p>
            )}
          </section>
        )}

        {/* BACKUP & RESTORE LINK (Admin) */}
        {!isViewer && (
          <section className={`${themeConfig.cardClass} p-4 sm:p-6`}>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">Quick backup &amp; transfer</h2>
            <p className="text-sm text-stone-500 dark:text-slate-400 mt-1">
              {state.lastBackup
                ? `Last backup: ${new Date(state.lastBackup).toLocaleString()}`
                : 'No backup created yet.'}{' '}
              {backupOld && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  Back up now so a browser reset cannot erase your trip.
                </span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleShareBackupFile()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-4 h-4" />
                <span>Send backup file</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyRestoreLink(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-4 h-4" />
                <span>Copy restore link</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyRestoreLink(true)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <QrCode className="w-4 h-4" />
                <span>Restore QR code</span>
              </button>
            </div>

            <div className="mt-4 pt-3.5 border-t border-stone-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-stone-500 dark:text-slate-400 mr-1">
                Restore saved data:
              </span>
              <button
                type="button"
                onClick={() => setQrRestoreOpen(true)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-ink)] border border-[var(--accent)]/30 hover:opacity-90 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <ScanLine className="w-4 h-4" />
                <span>Scan / restore QR</span>
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>Restore backup file</span>
              </button>
            </div>
            {backupFeedback && (
              <p
                className={`mt-2.5 text-xs font-medium ${
                  backupFeedback.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {backupFeedback.text}
              </p>
            )}
          </section>
        )}

        {/* ADMIN SHARE & QR PANEL */}
        {!isViewer && (
          <AdminSharePanel
            cfg={syncCfg}
            users={users}
            theme={activeTheme}
            darkMode={darkMode}
            cardClass={themeConfig.cardClass}
            onUsersChange={setUsers}
            onOpenQr={setQrPayload}
          />
        )}

        {/* GOOGLE DRIVE MULTI-DEVICE SYNC PANEL */}
        {!isViewer && (
          <DriveSyncPanel
            cfg={syncCfg}
            syncStatus={syncStatus}
            syncOk={syncOk}
            conflict={conflict}
            busy={syncBusy}
            pendingReceipts={pendingReceiptCount}
            cardClass={themeConfig.cardClass}
            onConnect={handleDriveConnect}
            onSyncNow={runSync}
            onLoadFromDrive={handleLoadFromDrive}
            onOverwriteDrive={handleOverwriteDrive}
            onDisconnect={handleDisconnectDrive}
            onWipeDrive={handleWipeDrive}
            onOpenQr={setQrPayload}
          />
        )}
      </main>

      {/* Modals */}
      <ThemePickerModal
        open={themePickerOpen}
        activeTheme={activeTheme}
        darkMode={darkMode}
        onSelectTheme={handleSelectTheme}
        onSelectDarkMode={applyDarkModeSetting}
        onClose={() => setThemePickerOpen(false)}
      />

      <QrShareModal payload={qrPayload} onClose={() => setQrPayload(null)} />

      <QrRestoreModal
        open={qrRestoreOpen}
        onClose={() => setQrRestoreOpen(false)}
        onDetectedText={handleScannedRestoreText}
        onPickJsonFile={() => importInputRef.current?.click()}
      />

      <ReceiptLightbox
        expense={lightboxExpense}
        currency={state.trip.cur}
        syncCfg={syncCfg}
        onClose={() => setLightboxExpense(null)}
      />

      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-2xl p-5">
            <h3 className="text-base font-semibold text-stone-900 dark:text-slate-100">
              {confirmDialog.title}
            </h3>
            <p className="text-sm text-stone-600 dark:text-slate-400 mt-2">{confirmDialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (window.location.hash) {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                  }
                  setConfirmDialog(null);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 dark:border-slate-700 text-sm font-medium text-stone-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDialog.onConfirm()}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-white text-sm font-semibold cursor-pointer ${
                  confirmDialog.destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
