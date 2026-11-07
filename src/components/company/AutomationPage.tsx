import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { EmailRulesPanel } from '../email/EmailRulesPanel';

type Mailbox = { id: string; email: string; display_name: string; connected_by: string };

export const AutomationPage: React.FC = () => {
  const { currentUser, recordSystemActivity } = useWorkspace();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selected, setSelected] = useState<Mailbox | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void supabase.from('email_mailboxes').select('id,email,display_name,connected_by').eq('mailbox_type', 'shared').order('email').then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setMailboxes(data || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const go = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-white px-5 py-6 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Automation</h1>
      <p className="mt-2 text-sm text-slate-600">Keep shared operational workflows here. Personal email stays with your email provider.</p>
      <section className="mt-6 rounded-lg border border-slate-200 p-4">
        <h2 className="text-base font-semibold text-slate-900">Shared email rules</h2>
        <p className="mt-1 text-sm text-slate-600">Apply labels, mark messages read, or archive matching messages as they arrive in a connected shared mailbox.</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        {loading ? <p className="mt-4 text-sm text-slate-500">Loading shared mailboxes...</p> : mailboxes.length ? <ul className="mt-4 divide-y divide-slate-100">
          {mailboxes.map((mailbox) => <li key={mailbox.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium text-slate-900">{mailbox.display_name || mailbox.email}</p><p className="text-sm text-slate-600">{mailbox.email}</p></div>
            {mailbox.connected_by === currentUser.id ? <button type="button" onClick={() => setSelected(mailbox)} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700">Manage rules</button> : <span className="text-sm text-slate-500">Managed by the mailbox administrator</span>}
          </li>)}
        </ul> : !error && <p className="mt-4 text-sm text-slate-600">No shared mailboxes configured. Operational email requires a configured provider API; no personal accounts are connected here.</p>}
      </section>
      <section className="mt-6">
        <h2 className="text-base font-semibold text-slate-900">Connected workflows</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {[
            { title: 'Grant award tasks and reporting', detail: 'Manage the award checklist and grant deadlines in Grants.', path: '/company/grants' },
            { title: 'Customer support', detail: 'Reply from shared email, keep internal notes, and use support AI suggestions.', path: '/customers/support' },
            { title: 'Forms', detail: 'Publish shareable forms and review submitted responses.', path: '/company/forms' },
          ].map((item) => <div key={item.path} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><h3 className="text-sm font-medium text-slate-900">{item.title}</h3><p className="mt-1 text-sm text-slate-600">{item.detail}</p></div><button type="button" onClick={() => go(item.path)} className="min-h-11 px-3 text-sm font-medium text-brand-700">Open</button></div>)}
        </div>
      </section>
      {selected && <EmailRulesPanel mailboxId={selected.id} userId={currentUser.id} onClose={() => setSelected(null)} onActivity={(eventType, summary) => recordSystemActivity({ eventType, summary, targetType: 'email_mailbox', targetId: selected.id, targetName: selected.email })} />}
    </main>
  );
};
