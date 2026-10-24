import React, { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

type Mailbox = {
  id: string;
  provider: 'google' | 'microsoft';
  email: string;
  display_name: string;
  connected_by: string;
  last_synced_at: string | null;
  push_expires_at: string | null;
  push_error: string | null;
};

type StaffMember = {
  id: string;
  name: string;
  email: string;
  account_status: string;
};

type Grant = {
  mailbox_id: string;
  user_id: string;
  can_send: boolean;
};

export const EmailAdminPanel: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [retentionDays, setRetentionDays] = useState(365);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});
  const [sendPermissions, setSendPermissions] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase.functions.invoke('mail-admin', {
        body: { action: 'list' },
      });
      if (loadError) throw loadError;
      setMailboxes((data?.mailboxes || []) as Mailbox[]);
      setUsers((data?.users || []) as StaffMember[]);
      setGrants((data?.grants || []) as Grant[]);
      setRetentionDays(Number(data?.retentionDays || 365));
      return true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Email administration could not be loaded.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invoke = async (action: string, payload: Record<string, unknown> = {}) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data, error: actionError } = await supabase.functions.invoke('mail-admin', {
        body: { action, ...payload },
      });
      if (actionError) throw actionError;
      const mailboxId = payload.mailboxId;
      if (action === 'grant' && typeof mailboxId === 'string') {
        setSelectedUsers((previous) => ({ ...previous, [mailboxId]: '' }));
      }
      const reloaded = await load();
      if (!reloaded) {
        setNotice('The change was saved, but the latest email settings could not be loaded.');
        return;
      }
      const warnings = [data?.providerWarning, data?.activityLogWarning].filter(Boolean).join(' ');
      setNotice(warnings || 'Email settings updated.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The email settings could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const saveRetention = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await invoke('retention', { retentionDays });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Mail className="h-4 w-4 text-brand-600" />
            Email access and retention
          </div>
          <p className="mt-1 text-xs text-slate-500">Assign staff access to shared mailboxes and control synced-message retention.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || saving} aria-label="Refresh email settings" className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">{notice}</p>}

      {loading ? (
        <p className="p-6 text-sm text-slate-500">Loading email administration…</p>
      ) : mailboxes.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">No shared mailboxes are connected. Connect one from the Email Inbox to manage access here.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {mailboxes.map((mailbox) => {
            const mailboxGrants = grants.filter((grant) => grant.mailbox_id === mailbox.id);
            const grantedIds = new Set(mailboxGrants.map((grant) => grant.user_id));
            const eligibleUsers = users.filter((staff) => staff.account_status === 'active' && !grantedIds.has(staff.id));
            return (
              <article key={mailbox.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-slate-900">{mailbox.display_name || mailbox.email}</h3>
                    <p className="truncate text-xs text-slate-500">{mailbox.email} · {mailbox.provider === 'google' ? 'Google Workspace' : 'Microsoft 365'}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Last synced: {mailbox.last_synced_at ? new Date(mailbox.last_synced_at).toLocaleString() : 'Not synced yet'}
                      {' · '}
                      Notifications: {mailbox.push_expires_at && Date.parse(mailbox.push_expires_at) > Date.now()
                        ? `active until ${new Date(mailbox.push_expires_at).toLocaleDateString()}`
                        : 'not configured or expired'}
                    </p>
                    {mailbox.push_error && <p role="alert" className="mt-1 text-[11px] text-amber-700">{mailbox.push_error}</p>}
                  </div>
                  <button type="button" disabled={saving} onClick={() => {
                    if (window.confirm(`Disconnect ${mailbox.email} and remove its synced email from this workspace?`)) {
                      void invoke('disconnect', { mailboxId: mailbox.id });
                    }
                  }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> Disconnect
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {mailboxGrants.map((grant) => {
                    const staff = users.find((item) => item.id === grant.user_id);
                    if (!staff) return null;
                    return (
                      <div key={grant.user_id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-800">{staff.name}</p>
                          <p className="truncate text-[10px] text-slate-500">{staff.email}</p>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={grant.can_send}
                            disabled={saving}
                            onChange={(event) => void invoke('grant', { mailboxId: mailbox.id, userId: staff.id, canSend: event.target.checked })}
                            aria-label={`Allow ${staff.name} to send email`}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          Send
                        </label>
                        {grant.user_id !== mailbox.connected_by && grant.user_id !== currentUser.id && (
                          <button type="button" disabled={saving} onClick={() => void invoke('revoke', { mailboxId: mailbox.id, userId: staff.id })} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50">
                            Revoke
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    aria-label={`Staff member for ${mailbox.email}`}
                    value={selectedUsers[mailbox.id] || ''}
                    onChange={(event) => setSelectedUsers((previous) => ({ ...previous, [mailbox.id]: event.target.value }))}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-500"
                  >
                    <option value="">Choose staff to grant access</option>
                    {eligibleUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} · {staff.email}</option>)}
                  </select>
                  <label className="flex items-center gap-2 px-1 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={sendPermissions[mailbox.id] ?? true}
                      onChange={(event) => setSendPermissions((previous) => ({ ...previous, [mailbox.id]: event.target.checked }))}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Can send
                  </label>
                  <button
                    type="button"
                    disabled={saving || !selectedUsers[mailbox.id]}
                    onClick={() => {
                      const userId = selectedUsers[mailbox.id];
                      if (userId) void invoke('grant', {
                        mailboxId: mailbox.id,
                        userId,
                        canSend: sendPermissions[mailbox.id] ?? true,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Grant access
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <form onSubmit={(event) => void saveRetention(event)} className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-end">
        <label className="text-xs font-semibold text-slate-700">
          Synced mail retention (days)
          <input
            type="number"
            min={30}
            max={3650}
            required
            value={retentionDays}
            onChange={(event) => setRetentionDays(Number(event.target.value))}
            className="mt-1 block w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </label>
        <button type="submit" disabled={saving || retentionDays < 30 || retentionDays > 3650} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save retention'}
        </button>
      </form>
    </section>
  );
};
