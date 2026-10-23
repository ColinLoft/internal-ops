import React, { useMemo, useState } from 'react';
import {
  KeyRound,
  Pencil,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { PROFILE_BANNERS, User, UserRole, UserStatus } from '../../types';

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  member: 'Member',
};

export const AdminPage: React.FC = () => {
  const {
    currentUser,
    users,
    setIsAddTeammateOpen,
    updateStaffUser,
    setStaffTemporaryPassword,
  } = useWorkspace();
  const [query, setQuery] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [temporaryPasswordUser, setTemporaryPasswordUser] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [savedPassword, setSavedPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...users]
      .filter((user) => !normalizedQuery || `${user.name} ${user.email} ${user.role} ${user.department} ${roleLabels[user.systemRole]}`
        .toLowerCase()
        .includes(normalizedQuery))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [query, users]);

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

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Users className="h-4 w-4 text-brand-600" />
              Staff directory <span className="text-xs font-medium text-slate-400">{users.length}</span>
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
                      user.systemRole === 'admin'
                        ? 'bg-violet-100 text-violet-700'
                        : user.systemRole === 'coordinator'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}>{roleLabels[user.systemRole]}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                  <p className="truncate text-xs text-slate-400">{user.role} · {user.department}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingUser(user); setError(''); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit profile
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTemporaryPasswordUser(user); setError(''); setSavedPassword(''); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Set password
                  </button>
                </div>
              </div>
            ))}
            {visibleUsers.length === 0 && (
              <p className="p-8 text-center text-sm text-slate-500">No staff members match that search.</p>
            )}
          </div>
        </section>
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
