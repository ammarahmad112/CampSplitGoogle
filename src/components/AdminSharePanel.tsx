import { useState } from 'react';
import { Copy, QrCode, Share2, Trash2, UserPlus, Users } from 'lucide-react';
import type { DarkModeSetting, QrSharePayload, SectionKey, SyncConfig, ThemeKey, ViewerUser } from '../types';
import { ALL_SECTIONS } from '../lib/calc';
import { buildShortShareLink, callDriveApi } from '../lib/driveSync';

interface AdminSharePanelProps {
  cfg: SyncConfig | null;
  users: ViewerUser[];
  theme: ThemeKey | '';
  darkMode: DarkModeSetting;
  cardClass: string;
  onUsersChange: (users: ViewerUser[]) => void;
  onOpenQr: (payload: QrSharePayload) => void;
}

export function AdminSharePanel({
  cfg,
  users,
  theme,
  darkMode,
  cardClass,
  onUsersChange,
  onOpenQr,
}: AdminSharePanelProps) {
  const [defaultShow, setDefaultShow] = useState<SectionKey[]>(ALL_SECTIONS.map((s) => s.key));
  const [friendName, setFriendName] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const showFb = (text: string, ok: boolean) => {
    setFeedback({ text, ok });
    setTimeout(() => {
      setFeedback((cur) => (cur?.text === text ? null : cur));
    }, 4500);
  };

  const toggleDefault = (key: SectionKey) => {
    setDefaultShow((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleAddFriendLink = async () => {
    if (!cfg) return showFb('Connect Google Drive first.', false);
    const name = friendName.trim();
    if (!name) return showFb('Enter a friend’s name.', false);
    setBusy(true);
    try {
      const res = await callDriveApi(cfg.url, cfg.code, 'users_add', {
        name,
        show: defaultShow,
      });
      if (!res.ok || !res.users) throw new Error(res.error || 'Could not create link');
      onUsersChange(res.users);
      setFriendName('');
      showFb(`Created private view-only link for ${name}.`, true);
    } catch (err) {
      showFb(err instanceof Error ? err.message : 'Check your connection.', false);
    } finally {
      setBusy(false);
    }
  };

  const handleEveryoneLink = async (mode: 'copy' | 'qr' | 'share') => {
    if (!cfg) return showFb('Connect Google Drive first.', false);
    setBusy(true);
    try {
      let everyone = users.find((u) => u.name === 'Everyone');
      if (!everyone) {
        const res = await callDriveApi(cfg.url, cfg.code, 'users_add', {
          name: 'Everyone',
          show: defaultShow,
        });
        if (!res.ok || !res.users) throw new Error(res.error || 'Could not create link');
        onUsersChange(res.users);
        everyone = res.users.find((u) => u.name === 'Everyone');
      }
      if (!everyone) throw new Error('Could not find Everyone link');
      const url = buildShortShareLink(cfg, everyone.code, 'Everyone', theme, darkMode);

      if (mode === 'qr') {
        onOpenQr({
          title: 'Everyone · View-only link',
          subtitle: 'Friends scan to see live trip expenses and balances',
          url,
        });
        return;
      }

      if (mode === 'share' && navigator.share) {
        try {
          await navigator.share({
            title: 'Camp Split — Trip Link',
            text: 'View our live trip expenses and balances:',
            url,
          });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
        }
      }

      await navigator.clipboard.writeText(url);
      showFb('Short view-only link for everyone copied.', true);
    } catch (err) {
      showFb(err instanceof Error ? err.message : 'Could not create link.', false);
    } finally {
      setBusy(false);
    }
  };

  const handleUserToggle = async (user: ViewerUser, key: SectionKey) => {
    if (!cfg) return;
    const current = Array.isArray(user.show) ? user.show : ALL_SECTIONS.map((s) => s.key);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    // Optimistic update
    onUsersChange(users.map((u) => (u.id === user.id ? { ...u, show: next } : u)));
    try {
      const res = await callDriveApi(cfg.url, cfg.code, 'users_set', { id: user.id, show: next });
      if (!res.ok || !res.users) throw new Error(res.error || 'Could not save permissions');
      onUsersChange(res.users);
      showFb('Permissions saved. Their screen updates within a few seconds.', true);
    } catch (err) {
      showFb(err instanceof Error ? err.message : 'Could not save.', false);
    }
  };

  const handleCopyUser = async (user: ViewerUser) => {
    if (!cfg) return;
    const url = buildShortShareLink(cfg, user.code, user.name, theme, darkMode);
    try {
      await navigator.clipboard.writeText(url);
      showFb(`Short link for ${user.name} copied.`, true);
    } catch {
      onOpenQr({
        title: `${user.name} · View-only`,
        subtitle: 'Copy or scan this private view-only link',
        url,
      });
    }
  };

  const handleShareUser = async (user: ViewerUser) => {
    if (!cfg) return;
    const url = buildShortShareLink(cfg, user.code, user.name, theme, darkMode);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Camp Split for ${user.name}`,
          text: 'View our live camping expenses:',
          url,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await handleCopyUser(user);
  };

  const handleQrUser = (user: ViewerUser) => {
    if (!cfg) return;
    const url = buildShortShareLink(cfg, user.code, user.name, theme, darkMode);
    onOpenQr({
      title: `${user.name} · View-only link`,
      subtitle: 'Scan with any phone camera for live read-only access',
      url,
    });
  };

  const handleRemoveUser = async (user: ViewerUser) => {
    if (!cfg) return;
    try {
      const res = await callDriveApi(cfg.url, cfg.code, 'users_remove', user.id);
      if (!res.ok || !res.users) throw new Error(res.error || 'Could not remove');
      onUsersChange(res.users);
      showFb(`${user.name} removed. Their link no longer works.`, true);
    } catch (err) {
      showFb(err instanceof Error ? err.message : 'Could not remove.', false);
    }
  };

  return (
    <section
      id="sec-share"
      className={`${cardClass} p-4 sm:p-6`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-slate-100">
            Share view-only links &amp; QR codes
          </h2>
          <p className="text-sm text-stone-500 dark:text-slate-400 mt-1 max-w-2xl">
            Create a short private link or QR code for a specific friend, or one shared link for everyone. Friends only see the sections you tick and cannot make edits.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <span className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-2">
          Sections visible on new links
        </span>
        <div className="flex flex-wrap gap-2">
          {ALL_SECTIONS.map((sec) => {
            const active = defaultShow.includes(sec.key);
            return (
              <button
                key={sec.key}
                type="button"
                onClick={() => toggleDefault(sec.key)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-ink)]'
                    : 'bg-stone-50 dark:bg-slate-950 border-stone-200 dark:border-slate-800 text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
                }`}
              >
                {active ? '✓ ' : ''}
                {sec.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
        <input
          type="text"
          value={friendName}
          onChange={(e) => setFriendName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAddFriendLink();
            }
          }}
          placeholder="Friend’s name (e.g. Omar)"
          className="flex-1 min-w-0 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-stone-900 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleAddFriendLink()}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Create friend link</span>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-stone-100 dark:border-slate-800/80">
        <span className="text-xs font-medium text-stone-500 dark:text-slate-400 inline-flex items-center gap-1.5 mr-1">
          <Users className="w-3.5 h-3.5" />
          Everyone link:
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleEveryoneLink('copy')}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-stone-800 dark:text-slate-100 hover:bg-stone-50 dark:hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>Copy link</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleEveryoneLink('qr')}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-stone-800 dark:text-slate-100 hover:bg-stone-50 dark:hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Show QR code</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleEveryoneLink('share')}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-stone-800 dark:text-slate-100 hover:bg-stone-50 dark:hover:bg-slate-700 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Share</span>
        </button>
      </div>

      {feedback && (
        <p
          className={`mt-3 text-xs font-medium ${
            feedback.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {feedback.text}
        </p>
      )}

      <div className="mt-4 divide-y divide-stone-100 dark:divide-slate-800">
        {!cfg ? (
          <p className="text-sm text-stone-500 dark:text-slate-400 py-2">
            Connect Google Drive sync below to generate live share links and QR codes.
          </p>
        ) : users.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-slate-400 py-2">
            No share links created yet. Add a friend above or generate a shared link for everyone.
          </p>
        ) : (
          users.map((u) => {
            const visibleSecs = Array.isArray(u.show) ? u.show : ALL_SECTIONS.map((s) => s.key);
            return (
              <div key={u.id} className="py-3.5 first:pt-2 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-sm text-stone-900 dark:text-slate-100">{u.name}</span>
                    <span className="text-xs text-stone-500 dark:text-slate-400 ml-2">View-only</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyUser(u)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQrUser(u)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareUser(u)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveUser(u)}
                      aria-label={`Remove ${u.name}`}
                      className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-medium inline-flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {ALL_SECTIONS.map((sec) => {
                    const checked = visibleSecs.includes(sec.key);
                    return (
                      <button
                        key={sec.key}
                        type="button"
                        onClick={() => void handleUserToggle(u, sec.key)}
                        className={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer whitespace-nowrap ${
                          checked
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent-ink)]'
                            : 'bg-stone-50 dark:bg-slate-950 border-stone-200 dark:border-slate-800 text-stone-500 dark:text-slate-400'
                        }`}
                      >
                        {checked ? '✓ ' : ''}
                        {sec.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
