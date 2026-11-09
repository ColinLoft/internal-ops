import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { userFacingError } from '../../lib/userFacingError';

type Mailbox = { email: string; provider: string; support_started_at: string | null; support_last_synced_at: string | null; support_sync_error: string | null };
const button = 'workspace-control rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50';

async function invoke(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context instanceof Response ? await context.clone().json().catch(() => null) as { error?: string } | null : null;
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function OutlookSettings() {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const started = useRef(false);
  const load = async () => {
    const data = await invoke('mail-admin', { action: 'list' });
    setMailbox(data.mailboxes.find((item: Mailbox) => item.email === 'team@flown.org' && item.provider === 'microsoft') || null);
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        if (query.get('mail_oauth') === 'callback') {
          window.history.replaceState({}, '', '/settings?section=email');
          window.dispatchEvent(new PopStateEvent('popstate'));
          if (query.get('error')) throw new Error('Microsoft authorization was cancelled or declined. Connect again when ready.');
          if (!query.get('code') || !query.get('state')) throw new Error('Microsoft authorization is incomplete. Connect the mailbox again.');
          const data = await invoke('mail-connect', { action: 'exchange', code: query.get('code'), state: query.get('state') });
          if (data?.success !== true) throw new Error('Microsoft did not confirm the mailbox connection.');
          setNotice('team@flown.org is connected. New emails will become support tickets.');
        }
        await load();
      } catch (cause) {
        setError(userFacingError(cause, 'Outlook setup could not be completed. Check the Microsoft app credentials and deployed mail functions, then retry.'));
      } finally { setBusy(false); }
    })();
  }, []);

  const connect = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await invoke('mail-connect', { action: 'authorize', provider: 'microsoft', mailboxType: 'shared', targetEmail: 'team@flown.org' });
      if (typeof data.authorizationUrl !== 'string' || new URL(data.authorizationUrl).hostname !== 'login.microsoftonline.com') throw new Error('Microsoft authorization URL was invalid.');
      window.location.assign(data.authorizationUrl);
    } catch (cause) {
      setError(userFacingError(cause, 'Outlook connection could not start. Configure the Microsoft app credentials and MAIL_REDIRECT_URI in Supabase first.'));
      setBusy(false);
    }
  };
  const sync = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await invoke('mail-admin', { action: 'sync-support' });
      await load();
      setNotice(result.pending ? 'Outlook sync is still in progress. New messages will appear as it catches up.' : 'Support inbox synced.');
    } catch (cause) { setError(userFacingError(cause, 'Outlook sync failed. Check shared-mailbox access and the connection, then retry.')); }
    finally { setBusy(false); }
  };
  return <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
    <div><h2 className="text-lg font-semibold text-slate-900">Outlook</h2><p className="mt-1 text-sm text-slate-500">Support replies and contract emails send from your team inbox.</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">team@flown.org</h3>
      <p className="text-sm text-slate-500">{mailbox ? 'Connected to Microsoft 365' : busy ? 'Checking connection...' : 'Not connected'}</p>
      {mailbox?.support_last_synced_at && <p className="text-sm text-slate-500">Last synced {new Date(mailbox.support_last_synced_at).toLocaleString()}</p>}
      {mailbox?.support_sync_error && <p role="alert" className="text-sm text-rose-700">Automatic sync needs attention. Check the connection and try Sync now.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void connect()} className={button}>{mailbox ? 'Reconnect Outlook' : 'Connect Outlook'}</button>
        {mailbox && <button type="button" disabled={busy} onClick={() => void sync()} className={button}>{mailbox.support_started_at ? 'Sync now' : 'Enable ticket intake'}</button>}
      </div>
    </div>
    <p className="text-sm text-slate-500">New email threads create unassigned tickets. Replies stay with the ticket. Existing inbox history is not imported.</p>
    <p className="text-sm text-slate-500">grants@flown.org is deferred.</p>
  </section>;
}
