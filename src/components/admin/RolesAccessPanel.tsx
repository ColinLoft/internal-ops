import { resetAppAccessCache } from '../../lib/useAppAccess';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

type Level = 'view' | 'edit' | 'manage';
type Role = { id: string; name: string; description: string };
type Permission = { role_id: string; app: string; level: Level };
type Assignment = { user_id: string; role_id: string };

const apps = [
  { id: 'insights', label: 'Insights' },
  { id: 'organization', label: 'Organization' },
  { id: 'programs', label: 'Projects' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'operations', label: 'Operations' },
  { id: 'customers', label: 'Customers' },
  { id: 'gtm', label: 'Marketing' },
  { id: 'support', label: 'Support' },
  { id: 'finance', label: 'Finance' },
  { id: 'legal', label: 'Legal' },
  { id: 'systems', label: 'Systems' },
];

export const RolesAccessPanel: React.FC = () => {
  const { users, currentUser } = useWorkspace();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [r, p, a] = await Promise.all([
      supabase.from('workspace_roles').select('id,name,description').order('name'),
      supabase.from('workspace_role_permissions').select('role_id,app,level'),
      supabase.from('workspace_role_assignments').select('user_id,role_id'),
    ]);
    const failure = r.error || p.error || a.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setRoles((r.data ?? []) as Role[]);
    setPermissions((p.data ?? []) as Permission[]);
    setAssignments((a.data ?? []) as Assignment[]);
    setSelectedId((current) => current ?? (r.data?.[0]?.id ?? null));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: PromiseLike<{ error: { message: string } | null }>) => {
    setError('');
    const { error: actionError } = await action;
    if (actionError) setError(actionError.message);
    else { resetAppAccessCache(); await load(); }
  };

  const selected = roles.find((role) => role.id === selectedId) ?? null;
  const levelFor = (app: string) => permissions.find((item) => item.role_id === selectedId && item.app === app)?.level ?? '';
  const members = assignments.filter((item) => item.role_id === selectedId).map((item) => item.user_id);

  const setLevel = (app: string, level: string) => {
    if (!selected) return;
    if (!level) return run(supabase.from('workspace_role_permissions').delete().eq('role_id', selected.id).eq('app', app));
    return run(supabase.from('workspace_role_permissions').upsert({ role_id: selected.id, app, level }, { onConflict: 'role_id,app' }));
  };

  const createRole = async () => {
    const name = newName.trim();
    if (!name) return;
    setError('');
    const { data, error: insertError } = await supabase.from('workspace_roles').insert({ name }).select('id').single();
    if (insertError || !data) {
      setError(insertError?.message ?? 'The role could not be created.');
      return;
    }
    setNewName('');
    setSelectedId(data.id);
    await load();
  };

  const deleteRole = async () => {
    if (!selected || !window.confirm(`Delete the "${selected.name}" role? Members lose the access it grants.`)) return;
    setSelectedId(null);
    await run(supabase.from('workspace_roles').delete().eq('id', selected.id));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><KeyRound className="h-4 w-4 text-brand-600" /> Roles & access</div>
        <p className="mt-1 text-xs text-slate-500">Grant per-application access through roles. Admins and coordinators keep full access.</p>
      </div>
      {error && <p className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
      <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
        <div className="border-b border-slate-100 p-3 lg:border-b-0 lg:border-r">
          <ul className="space-y-1">
            {roles.map((role) => (
              <li key={role.id}>
                <button type="button" onClick={() => setSelectedId(role.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${selectedId === role.id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>{role.name}</button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-1">
            <input value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createRole(); }} placeholder="New role" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
            <button type="button" onClick={() => void createRole()} disabled={!newName.trim()} aria-label="Add role" className="rounded-lg bg-brand-600 px-2 text-white disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="p-4">
          {!selected ? <p className="text-xs text-slate-400">Create or select a role.</p> : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selected.name}</h3>
                  <p className="text-xs text-slate-500">{selected.description || 'No description.'}</p>
                </div>
                <button type="button" onClick={() => void deleteRole()} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Application access</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {apps.map((app) => (
                    <label key={app.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{app.label}</span>
                      <select value={levelFor(app.id)} onChange={(event) => void setLevel(app.id, event.target.value)} className="rounded-md border border-slate-200 px-1.5 py-1">
                        <option value="">No access</option>
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                        <option value="manage">Manage</option>
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Members</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {users.filter((user) => user.accountStatus !== 'removed').map((user) => {
                    const checked = members.includes(user.id);
                    return (
                      <label key={user.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <input type="checkbox" checked={checked} onChange={() => void run(checked
                          ? supabase.from('workspace_role_assignments').delete().eq('user_id', user.id).eq('role_id', selected.id)
                          : supabase.from('workspace_role_assignments').insert({ user_id: user.id, role_id: selected.id, assigned_by: currentUser.id }))} />
                        {user.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
