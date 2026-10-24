import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Rule = {
  id: string;
  name: string;
  sender_contains: string | null;
  subject_contains: string | null;
  action: 'label' | 'mark_read' | 'archive';
  action_value: string | null;
  enabled: boolean;
};

type Props = {
  mailboxId: string;
  userId: string;
  onActivity: (eventType: string, summary: string) => Promise<void>;
  onClose: () => void;
};

export const EmailRulesPanel: React.FC<Props> = ({ mailboxId, userId, onActivity, onClose }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('email_rules')
        .select('id, name, sender_contains, subject_contains, action, action_value, enabled')
        .eq('mailbox_id', mailboxId)
        .order('created_at', { ascending: true });
      if (queryError) throw queryError;
      setRules((data || []) as Rule[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Inbox rules could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [mailboxId]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const createRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const action = String(values.get('action')) as Rule['action'];
    const sender = String(values.get('sender') || '').trim();
    const subject = String(values.get('subject') || '').trim();
    const label = String(values.get('label') || '').trim();
    if (!sender && !subject) {
      setError('Add a sender or subject match to create a rule.');
      return;
    }
    if (action === 'label' && !label) {
      setError('Enter a label for this rule.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('email_rules').insert({
        mailbox_id: mailboxId,
        created_by: userId,
        name: String(values.get('name') || '').trim(),
        sender_contains: sender || null,
        subject_contains: subject || null,
        action,
        action_value: action === 'label' ? label : null,
      });
      if (insertError) throw insertError;
      form.reset();
      await onActivity('email_rule_created', 'Created an inbox rule.');
      await loadRules();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The inbox rule could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const setRuleEnabled = async (rule: Rule, enabled: boolean) => {
    setError('');
    try {
      const { error: updateError } = await supabase.from('email_rules')
        .update({ enabled })
        .eq('id', rule.id)
        .eq('created_by', userId);
      if (updateError) throw updateError;
      setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled } : item));
      await onActivity(enabled ? 'email_rule_enabled' : 'email_rule_disabled', `${enabled ? 'Enabled' : 'Disabled'} an inbox rule.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'The inbox rule could not be updated.');
    }
  };

  const deleteRule = async (rule: Rule) => {
    setError('');
    try {
      const { error: deleteError } = await supabase.from('email_rules')
        .delete()
        .eq('id', rule.id)
        .eq('created_by', userId);
      if (deleteError) throw deleteError;
      setRules((current) => current.filter((item) => item.id !== rule.id));
      await onActivity('email_rule_deleted', 'Deleted an inbox rule.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The inbox rule could not be deleted.');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="mail-rules-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="mail-rules-title" className="text-sm font-bold text-slate-900">Inbox rules</h2>
            <p className="mt-1 text-xs text-slate-500">Rules run when new messages are synced and update the provider mailbox too.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close inbox rules" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </header>

        {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-xs text-rose-700">{error}</p>}

        <div className="space-y-5 p-5">
          <form onSubmit={(event) => void createRule(event)} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              Rule name
              <input required name="name" maxLength={80} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand-500" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Sender contains
              <input name="sender" maxLength={120} placeholder="example@organization.org" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand-500" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Subject contains
              <input name="subject" maxLength={160} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand-500" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Action
              <select name="action" defaultValue="label" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand-500">
                <option value="label">Add label</option>
                <option value="mark_read">Mark as read</option>
                <option value="archive">Archive</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Label (for “Add label”)
              <input name="label" maxLength={40} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand-500" />
            </label>
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50 sm:col-span-2">
              <Plus className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Add rule'}
            </button>
          </form>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="py-5 text-center text-sm text-slate-500">Loading rules…</p>
            ) : rules.length === 0 ? (
              <p className="py-5 text-center text-sm text-slate-500">No rules yet. Add one to automatically organize incoming messages.</p>
            ) : rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 py-3">
                <input type="checkbox" checked={rule.enabled} onChange={(event) => void setRuleEnabled(rule, event.target.checked)} aria-label={`Enable ${rule.name}`} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{rule.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {[rule.sender_contains && `sender contains “${rule.sender_contains}”`, rule.subject_contains && `subject contains “${rule.subject_contains}”`].filter(Boolean).join(' and ')}
                    {' → '}
                    {rule.action === 'label' ? `label “${rule.action_value}”` : rule.action === 'mark_read' ? 'mark as read' : 'archive'}
                  </p>
                </div>
                <button type="button" onClick={() => void deleteRule(rule)} aria-label={`Delete ${rule.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
