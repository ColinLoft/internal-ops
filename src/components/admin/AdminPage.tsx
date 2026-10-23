import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock3,
  KeyRound,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { PROFILE_BANNERS, SystemActivityLog, User, UserRole, UserStatus } from '../../types';

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  member: 'Member',
};

export const AdminPage: React.FC = () => {
  const {
    currentUser,
    users,
    systemActivityLogs,
    systemActivityLogError,
    refreshSystemActivityLogs,
    setIsAddTeammateOpen,
    updateStaffUser,
    manageStaffAccount,
    setStaffTemporaryPassword,
  } = useWorkspace();
  const [query, setQuery] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [temporaryPasswordUser, setTemporaryPasswordUser] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [savedPassword, setSavedPassword] = useState('');
  const [suspensionDurations, setSuspensionDurations] = useState<Record<string, '1h' | '24h' | '7d' | '30d' | 'indefinite'>>({});
  const [error, setError] = useState('');
  const [activityError, setActivityError] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityLoading, setActivityLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshSystemActivityLogs()
      .catch((loadError) => setActivityError(loadError instanceof Error ? loadError.message : 'Could not load system activity.'))
      .finally(() => setActivityLoading(false));
  }, []);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...users]
      .filter((user) => user.accountStatus !== 'removed')
      .filter((user) => !normalizedQuery || `${user.name} ${user.email} ${user.role} ${user.department} ${roleLabels[user.systemRole]}`
        .toLowerCase()
        .includes(normalizedQuery))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [query, users]);

  const activityUsers = useMemo(() => {
    const byId = new Map<string, string>();
    systemActivityLogs.forEach((entry) => {
      if (entry.actor_id) byId.set(entry.actor_id, entry.actor_name);
      if (entry.target_type === 'user' && entry.target_id && entry.target_name) {
        byId.set(entry.target_id, entry.target_name);
      }
    });
    return [...byId.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [systemActivityLogs]);

  const visibleActivityLogs = useMemo(() => {
    const normalizedSearch = activitySearch.trim().toLowerCase();
    return systemActivityLogs.filter((entry) => {
      const matchesUser = activityFilter === 'all'
        || entry.actor_id === activityFilter
        || entry.target_id === activityFilter;
      const searchContent = `${entry.actor_name} ${entry.target_name || ''} ${entry.event_type} ${entry.summary}`.toLowerCase();
      return matchesUser && (!normalizedSearch || searchContent.includes(normalizedSearch));
    });
  }, [activityFilter, activitySearch, systemActivityLogs]);

  const handleUserAction = async (userId: string, action: 'suspend' | 'reactivate' | 'remove') => {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) return;
    const confirmed = action === 'remove'
      ? window.confirm(`Remove ${targetUser.name} from the workspace? This cannot be undone.`)
      : true;
    if (!confirmed) return;
    try {
      setError('');
      const duration = action === 'suspend' ? suspensionDurations[userId] || '7d' : undefined;
      const lengthLabel = duration === 'indefinite' ? 'indefinitely' : duration ? `for ${duration}` : '';
      await manageStaffAccount(
        userId,
        action,
        `${currentUser.name} ${action === 'suspend' ? `suspended ${targetUser.name} ${lengthLabel}` : action === 'reactivate' ? `reactivated ${targetUser.name}` : `removed ${targetUser.name}`}.`,
        duration,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The account action could not be completed.');
    }
  };

  if (currentUser.systemRole !== 'admin') {
    return (
      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-amber-600" />
          <h1 className="text-lg font-bold text-slate-900">Administrator access required</h1>
          <p className="mt-1 text-sm text-slate-600">Your account does not have permission to manage staff.</p>
        </div>
      </main>
    );
  }

  const closePasswordDialog = () => {
    setTemporaryPasswordUser(null);
    setPassword('');
    setSavedPassword('');
    setError('');
  };

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser || saving) return;
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await updateStaffUser(editingUser.id, {
        name: String(formData.get('name')).trim(),
        role: String(formData.get('role')).trim(),
        department: String(formData.get('department')).trim(),
        phone: String(formData.get('phone')).trim(),
        avatar: String(formData.get('avatar')).trim(),
        status: String(formData.get('status')) as UserStatus,
        statusMessage: String(formData.get('statusMessage')).trim(),
        bio: String(formData.get('bio')).trim(),
        location: String(formData.get('location')).trim(),
        banner: String(formData.get('banner')) as User['banner'],
        systemRole: String(formData.get('systemRole')) as UserRole,
      });
      setEditingUser(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the staff profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!temporaryPasswordUser || saving) return;
    setSaving(true);
    setError('');
    try {
      await setStaffTemporaryPassword(temporaryPasswordUser.id, password);
      setSavedPassword(password);
      setPassword('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not set the temporary password.');
    } finally {
      setSaving(false);
    }
  };

  const generatePassword = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    setPassword(Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 24));
  };

  return (
    <main className="flex-1 overflow-y-auto p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-600">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Administration</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">People &amp; access</h1>
            <p className="mt-1 text-sm text-slate-500">Manage staff profiles, workspace roles, and account passwords.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddTeammateOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <UserPlus className="h-4 w-4" />
            Add staff member
          </button>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Users className="h-4 w-4 text-brand-600" />
                Staff directory <span className="text-xs font-medium text-slate-400">{visibleUsers.length}</span>
              </div>
              <label className="relative block sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search staff..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
              </label>
            </div>
            <div className="divide-y divide-slate-100">
              {visibleUsers.map((user) => (
                <div key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <img src={user.avatar} alt="" className="h-11 w-11 rounded-full border border-slate-200 object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        user.accountStatus === 'suspended'
                          ? 'bg-amber-100 text-amber-700'
                          : user.systemRole === 'admin'
                            ? 'bg-violet-100 text-violet-700'
                            : user.systemRole === 'coordinator'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                      }`}>{user.accountStatus === 'suspended' ? 'Suspended' : roleLabels[user.systemRole]}</span>
                    </div>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                    <p className="truncate text-xs text-slate-400">{user.role} · {user.department}</p>
                    {user.accountStatus === 'suspended' && (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        {user.suspendedUntil
                          ? `Suspended until ${new Date(user.suspendedUntil).toLocaleString()}`
                          : 'Suspended indefinitely'}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingUser(user); setError(''); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTemporaryPasswordUser(user); setError(''); setSavedPassword(''); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Password
                    </button>
                    {user.accountStatus === 'suspended' ? (
                      <button
                        type="button"
                        onClick={() => void handleUserAction(user.id, 'reactivate')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate
                      </button>
                    ) : (
                      <>
                        <select
                          aria-label={`Suspension duration for ${user.name}`}
                          value={suspensionDurations[user.id] || '7d'}
                          onChange={(event) => setSuspensionDurations((previous) => ({
                            ...previous,
                            [user.id]: event.target.value as '1h' | '24h' | '7d' | '30d' | 'indefinite',
                          }))}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 outline-none focus:border-brand-500"
                        >
                          <option value="1h">1 hour</option>
                          <option value="24h">24 hours</option>
                          <option value="7d">7 days</option>
                          <option value="30d">30 days</option>
                          <option value="indefinite">Indefinite</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleUserAction(user.id, 'suspend')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                        >
                          <Ban className="h-3.5 w-3.5" /> Suspend
                        </button>
                      </>
                    )}
                    {user.id !== currentUser.id && (
                      <button
                        type="button"
                        onClick={() => void handleUserAction(user.id, 'remove')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {visibleUsers.length === 0 && (
                <p className="p-8 text-center text-sm text-slate-500">No staff members match that search.</p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Clock3 className="h-4 w-4 text-brand-600" />
                  System activity
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {systemActivityLogs.length}{systemActivityLogs.length === 500 ? '+' : ''}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Persistent user and workspace events. Message text and passwords are never recorded.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={activityFilter}
                  onChange={(event) => setActivityFilter(event.target.value)}
                  aria-label="Filter activity by user"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
                >
                  <option value="all">Entire system — all users</option>
                  {activityUsers.map(([userId, userName]) => <option key={userId} value={userId}>{userName}</option>)}
                </select>
                <label className="relative block sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={activitySearch}
                    onChange={(event) => setActivitySearch(event.target.value)}
                    placeholder="Search activity..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-brand-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setActivityLoading(true);
                    setActivityError('');
                    refreshSystemActivityLogs()
                      .catch((loadError) => setActivityError(loadError instanceof Error ? loadError.message : 'Could not load system activity.'))
                      .finally(() => setActivityLoading(false));
                  }}
                  disabled={activityLoading}
                  aria-label="Refresh system activity"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${activityLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            {(activityError || systemActivityLogError) && (
              <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                Could not load or save persistent activity logs. Apply the system activity log migration in Supabase, then refresh. {activityError || systemActivityLogError}
              </p>
            )}
            <div className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
              {activityLoading && visibleActivityLogs.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">Loading system activity…</p>
              ) : visibleActivityLogs.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  {systemActivityLogs.length ? 'No activity matches these filters.' : 'No system activity has been recorded yet.'}
                </p>
              ) : visibleActivityLogs.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
            </div>
            <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500">
              Showing {visibleActivityLogs.length} of {systemActivityLogs.length}{systemActivityLogs.length === 500 ? '+' : ''} most recent events. Logs are retained in the database.
            </div>
          </section>
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <form onSubmit={handleSaveProfile} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-900">Edit staff profile</h2>
                <p className="text-xs text-slate-500">{editingUser.email}</p>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Name" name="name" defaultValue={editingUser.name} required />
              <Field label="Job title" name="role" defaultValue={editingUser.role} />
              <Field label="Department" name="department" defaultValue={editingUser.department} />
              <Field label="Phone" name="phone" defaultValue={editingUser.phone} />
              <Field label="Avatar URL" name="avatar" defaultValue={editingUser.avatar} />
              <SelectField label="Workspace role" name="systemRole" defaultValue={editingUser.systemRole} options={[
                ['member', 'Member'],
                ['coordinator', 'Coordinator'],
                ['admin', 'Admin'],
              ]} />
              <SelectField label="Availability" name="status" defaultValue={editingUser.status} options={[
                ['online', 'Online'],
                ['busy', 'Busy'],
                ['away', 'Away'],
                ['offline', 'Offline'],
              ]} />
              <Field label="Status message" name="statusMessage" defaultValue={editingUser.statusMessage || ''} />
              <Field label="Location" name="location" defaultValue={editingUser.location || ''} />
              <SelectField label="Profile banner" name="banner" defaultValue={editingUser.banner || 'ocean'} options={
                PROFILE_BANNERS.map((banner) => [banner.value, banner.label])
              } />
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Bio
                <textarea name="bio" defaultValue={editingUser.bio || ''} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-brand-500" />
              </label>
            </div>
            {error && <p role="alert" className="mx-5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
              <button type="button" onClick={() => setEditingUser(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save profile'}</button>
            </div>
          </form>
        </div>
      )}

      {temporaryPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <form onSubmit={handleSetPassword} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="font-bold text-slate-900">Set temporary password</h2>
                <p className="mt-1 text-xs text-slate-500">For {temporaryPasswordUser.name} · {temporaryPasswordUser.email}</p>
              </div>
              <button type="button" onClick={closePasswordDialog} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block text-xs font-semibold text-slate-600">
                Temporary password (at least 12 characters)
                <input
                  type="text"
                  value={savedPassword || password}
                  onChange={(event) => { setPassword(event.target.value); setSavedPassword(''); }}
                  minLength={12}
                  required
                  disabled={!!savedPassword}
                  autoComplete="new-password"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-brand-500 disabled:opacity-70"
                />
              </label>
              {savedPassword ? (
                <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Password updated. Share it securely with the staff member.</p>
              ) : (
                <button type="button" onClick={generatePassword} className="text-xs font-semibold text-brand-700 hover:underline">Generate a secure password</button>
              )}
              {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
              <button type="button" onClick={closePasswordDialog} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">{savedPassword ? 'Done' : 'Cancel'}</button>
              {!savedPassword && <button disabled={saving || password.length < 12} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Updating…' : 'Set password'}</button>}
            </div>
          </form>
        </div>
      )}
    </main>
  );
};

const ActivityRow: React.FC<{ entry: SystemActivityLog }> = ({ entry }) => (
  <article className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
          {entry.event_type.replace(/_/g, ' ')}
        </span>
        <span className="text-xs font-semibold text-slate-700">{entry.actor_name}</span>
        {entry.target_name && (
          <span className="text-xs text-slate-500">
            {entry.target_type === 'user' ? `→ ${entry.target_name}` : `· ${entry.target_name}`}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-700">{entry.summary}</p>
    </div>
    <time dateTime={entry.created_at} className="shrink-0 text-[11px] text-slate-400">
      {new Date(entry.created_at).toLocaleString()}
    </time>
  </article>
);

const Field: React.FC<{
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
}> = ({ label, name, defaultValue, required }) => (
  <label className="text-xs font-semibold text-slate-600">
    {label}
    <input
      name={name}
      defaultValue={defaultValue}
      required={required}
      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-brand-500"
    />
  </label>
);

const SelectField: React.FC<{
  label: string;
  name: string;
  defaultValue: string;
  options: [string, string][];
}> = ({ label, name, defaultValue, options }) => (
  <label className="text-xs font-semibold text-slate-600">
    {label}
    <select
      name={name}
      defaultValue={defaultValue}
      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-brand-500"
    >
      {options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
    </select>
  </label>
);
