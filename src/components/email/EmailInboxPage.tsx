import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Inbox,
  LoaderCircle,
  Mail,
  MailOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { EmailRulesPanel } from './EmailRulesPanel';

type Mailbox = {
  id: string;
  provider: 'microsoft' | 'google';
  mailbox_type: 'personal' | 'shared';
  email: string;
  display_name: string;
  connected_by: string;
  last_synced_at: string | null;
};

type EmailMessage = {
  id: string;
  mailbox_id: string;
  provider_message_id: string;
  provider_thread_id: string | null;
  folder: string;
  subject: string;
  sender_name: string;
  sender_email: string;
  to_recipients: { name?: string; email: string }[];
  body_text: string;
  snippet: string;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  labels: string[];
};

type AiArtifact = { id: string; artifact_type: 'summary' | 'draft'; content: string; created_at: string };

const folders = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Trash', icon: Trash2 },
];

export const EmailInboxPage: React.FC = () => {
  const { currentUser, recordSystemActivity } = useWorkspace();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailboxId, setActiveMailboxId] = useState('');
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [artifacts, setArtifacts] = useState<AiArtifact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);
  const [sharedMailboxAddress, setSharedMailboxAddress] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyMode, setReplyMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);

  const activeMailbox = mailboxes.find((mailbox) => mailbox.id === activeMailboxId) || null;

  const loadMailboxes = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('email_mailboxes')
      .select('id, provider, mailbox_type, email, display_name, connected_by, last_synced_at')
      .order('mailbox_type')
      .order('email');
    if (queryError) throw queryError;
    const available = (data || []) as Mailbox[];
    setMailboxes(available);
    setActiveMailboxId((current) => available.some((mailbox) => mailbox.id === current)
      ? current
      : available[0]?.id || '');
    return available;
  }, []);

  const loadMessages = useCallback(async (mailboxId = activeMailboxId) => {
    if (!mailboxId) {
      setMessages([]);
      setSelectedMessage(null);
      return;
    }
    let query = supabase
      .from('email_messages')
      .select('id, mailbox_id, provider_message_id, provider_thread_id, folder, subject, sender_name, sender_email, to_recipients, body_text, snippet, received_at, is_read, is_starred, has_attachments, labels')
      .eq('mailbox_id', mailboxId)
      .eq('folder', activeFolder)
      .order('received_at', { ascending: false })
      .limit(100);
    const cleanSearch = search.trim();
    if (cleanSearch) {
      query = query.textSearch('search_vector', cleanSearch, { type: 'plain', config: 'simple' });
    }
    const { data, error: queryError } = await query;
    if (queryError) throw queryError;
    const loaded = (data || []) as EmailMessage[];
    setMessages(loaded);
    setSelectedMessage((current) => current ? loaded.find((message) => message.id === current.id) || null : null);
  }, [activeFolder, activeMailboxId, search]);

  const refresh = useCallback(async (sync = false, requestedMailboxId?: string) => {
    setError('');
    setLoading(true);
    try {
      const available = await loadMailboxes();
      const mailboxId = available.find((mailbox) => mailbox.id === requestedMailboxId)?.id
        || available.find((mailbox) => mailbox.id === activeMailboxId)?.id
        || available[0]?.id
        || '';
      if (mailboxId) setActiveMailboxId(mailboxId);
      let activityLogWarning = '';
      if (sync && mailboxId) {
        setSyncing(true);
        const { data, error: syncError } = await supabase.functions.invoke('mail-sync', {
          body: { mailboxId },
        });
        if (syncError) throw syncError;
        activityLogWarning = data?.activityLogWarning || '';
      }
      await loadMessages(mailboxId);
      if (activityLogWarning) setError(activityLogWarning);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Email could not be loaded.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [activeMailboxId, loadMailboxes, loadMessages]);

  useEffect(() => {
    let active = true;
    void loadMailboxes()
      .then(() => active && loadMessages())
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Email could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadMailboxes, loadMessages]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('mail_error')
      || url.searchParams.get('error_description')
      || url.searchParams.get('error');
    if ((!code && !oauthError) || url.searchParams.get('mail_oauth') !== 'callback') return;
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('mail_oauth');
    url.searchParams.delete('mail_error');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, '', url);

    if (oauthError) {
      setError(`Mailbox connection was not completed: ${oauthError}`);
      return;
    }
    if (!code || !state) {
      setError('The provider callback was incomplete. Start the mailbox connection again.');
      return;
    }
    void supabase.functions.invoke('mail-connect', {
      body: { action: 'exchange', code, state },
    }).then(({ data, error: exchangeError }) => {
      if (exchangeError) throw exchangeError;
      setNotice(data?.webhookWarning
        ? `Mailbox connected. ${data.webhookWarning}`
        : 'Mailbox connected. Syncing messages…');
      return refresh(true, data?.mailboxId);
    }).catch((exchangeError: unknown) => {
      setError(exchangeError instanceof Error ? exchangeError.message : 'The mailbox could not be connected.');
    });
  }, [refresh]);

  useEffect(() => {
    if (!activeMailboxId) return;
    const channel = supabase
      .channel(`email-messages:${activeMailboxId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'email_messages',
        filter: `mailbox_id=eq.${activeMailboxId}`,
      }, () => {
        void loadMessages().catch((loadError) => setError(loadError.message));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeMailboxId, loadMessages]);

  useEffect(() => {
    if (!selectedMessage) {
      setArtifacts([]);
      setAiDraft('');
      return;
    }
    let active = true;
    supabase
      .from('email_ai_artifacts')
      .select('id, artifact_type, content, created_at')
      .eq('message_id', selectedMessage.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: artifactError }) => {
        if (!active) return;
        if (artifactError) setError(artifactError.message);
        else setArtifacts((data || []) as AiArtifact[]);
      });
    return () => { active = false; };
  }, [selectedMessage]);

  const unreadCount = useMemo(() => messages.filter((message) => !message.is_read).length, [messages]);

  const connectMailbox = async (provider: Mailbox['provider'], mailboxType: Mailbox['mailbox_type']) => {
    setError('');
    const { data, error: connectError } = await supabase.functions.invoke('mail-connect', {
      body: {
        action: 'authorize',
        provider,
        mailboxType,
        targetEmail: mailboxType === 'shared' ? sharedMailboxAddress.trim().toLowerCase() : undefined,
      },
    });
    if (connectError) {
      setError(connectError.message);
      return;
    }
    if (!data?.authorizationUrl) {
      setError('The provider did not return an authorization link.');
      return;
    }
    setConnectMenuOpen(false);
    window.location.assign(data.authorizationUrl);
  };

  const invokeMailboxAction = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error: actionError } = await supabase.functions.invoke('mail-api', {
      body: { action, mailboxId: activeMailboxId, ...payload },
    });
    if (actionError) throw actionError;
    if (data?.activityLogWarning) setError(data.activityLogWarning);
    return data;
  };

  const openMessage = async (message: EmailMessage) => {
    setSelectedMessage(message);
    if (!message.is_read) {
      try {
        await invokeMailboxAction('mark-read', { messageId: message.id, isRead: true });
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'Could not mark the message as read.');
      }
    }
  };

  const archiveMessage = async (message: EmailMessage) => {
    try {
      await invokeMailboxAction('archive', { messageId: message.id });
      setSelectedMessage(null);
      await loadMessages();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not archive the message.');
    }
  };

  const toggleStar = async (message: EmailMessage) => {
    try {
      await invokeMailboxAction('star', { messageId: message.id, isStarred: !message.is_starred });
      await loadMessages();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not update the message.');
    }
  };

  const runAiAction = async (action: 'summarize' | 'draft') => {
    if (!selectedMessage) return;
    setAiBusy(true);
    setError('');
    try {
      const { data, error: aiError } = await supabase.functions.invoke('mail-ai', {
        body: { action, messageId: selectedMessage.id },
      });
      if (aiError) throw aiError;
      if (data?.activityLogWarning) setError(data.activityLogWarning);
      if (action === 'draft') {
        setAiDraft(data.content || '');
        setArtifacts((current) => [data as AiArtifact, ...current.filter((artifact) => artifact.id !== data.id)]);
        setComposeOpen(true);
        setReplyMode(true);
      } else {
        const { data: saved, error: saveError } = await supabase
          .from('email_ai_artifacts')
          .select('id, artifact_type, content, created_at')
          .eq('message_id', selectedMessage.id)
          .order('created_at', { ascending: false });
        if (saveError) throw saveError;
        setArtifacts((saved || []) as AiArtifact[]);
      }
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : 'The AI action could not be completed.');
    } finally {
      setAiBusy(false);
    }
  };

  const submitMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeMailboxId || sending) return;
    const formData = new FormData(event.currentTarget);
    const to = replyMode && selectedMessage
      ? selectedMessage.sender_email
      : String(formData.get('to') || '').trim();
    const subject = replyMode && selectedMessage && !String(formData.get('subject') || '').startsWith('Re:')
      ? `Re: ${selectedMessage.subject}`
      : String(formData.get('subject') || '').trim();
    const body = aiDraft || String(formData.get('body') || '').trim();
    setSending(true);
    setError('');
    try {
      await invokeMailboxAction(replyMode ? 'reply' : 'send', {
        to,
        subject,
        body,
        replyToMessageId: replyMode ? selectedMessage?.id : undefined,
      });
      setComposeOpen(false);
      setReplyMode(false);
      setAiDraft('');
      setNotice('Message sent.');
      await refresh(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const title = selectedMessage?.subject || (activeFolder === 'inbox' ? 'Inbox' : folders.find((folder) => folder.id === activeFolder)?.label || 'Email');

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden bg-slate-50/70">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white/80 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Mail</h1>
            <p className="mt-0.5 text-xs text-slate-500">Your connected inboxes</p>
          </div>
          <button type="button" onClick={() => setComposeOpen(true)} aria-label="Compose email" className="rounded-xl bg-brand-600 p-2.5 text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mb-4">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            aria-label="Select mailbox"
            value={activeMailboxId}
            onChange={(event) => { setActiveMailboxId(event.target.value); setSelectedMessage(null); }}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500"
          >
            <option value="">Choose a mailbox</option>
            {mailboxes.map((mailbox) => (
              <option key={mailbox.id} value={mailbox.id}>
                {mailbox.mailbox_type === 'shared' ? 'Shared · ' : ''}{mailbox.display_name || mailbox.email}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>
        <div className="space-y-1">
          {folders.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setActiveFolder(id); setSelectedMessage(null); }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                activeFolder === id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {id === 'inbox' && unreadCount > 0 && <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px]">{unreadCount}</span>}
            </button>
          ))}
        </div>
        <div className="mt-auto border-t border-slate-100 pt-3">
          <div className="relative">
            <button type="button" onClick={() => setConnectMenuOpen((open) => !open)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" /> Connect mailbox
            </button>
            {connectMenuOpen && (
              <div className="absolute bottom-12 left-0 z-30 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Personal mailbox</p>
                <button type="button" onClick={() => void connectMailbox('microsoft', 'personal')} className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">Microsoft 365</button>
                <button type="button" onClick={() => void connectMailbox('google', 'personal')} className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">Google Workspace</button>
                {currentUser.systemRole === 'admin' && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Connect shared mailbox</p>
                    <input
                      value={sharedMailboxAddress}
                      onChange={(event) => setSharedMailboxAddress(event.target.value)}
                      placeholder="shared@organization.org"
                      type="email"
                      className="mb-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs outline-none focus:border-brand-500"
                    />
                    <button type="button" disabled={!sharedMailboxAddress.trim()} onClick={() => void connectMailbox('microsoft', 'shared')} className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">Connect shared Microsoft mailbox</button>
                    <button type="button" disabled={!sharedMailboxAddress.trim()} onClick={() => void connectMailbox('google', 'shared')} className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">Connect shared Google mailbox</button>
                  </>
                )}
              </div>
            )}
          </div>
          {activeMailbox && (
            <p className="mt-2 truncate text-center text-[10px] text-slate-400" title={activeMailbox.email}>
              {activeMailbox.email} · {activeMailbox.provider === 'google' ? 'Google' : 'Microsoft'}
            </p>
          )}
        </div>
      </aside>

      <section className={`flex min-w-0 flex-1 flex-col ${selectedMessage ? 'hidden xl:flex' : ''}`}>
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{title}</h2>
          <label className="relative hidden w-64 sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this mailbox" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-500" />
          </label>
          {activeMailbox?.connected_by === currentUser.id && (
            <button type="button" onClick={() => setRulesOpen(true)} aria-label="Manage inbox rules" title="Inbox rules" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <Settings2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={() => void refresh(true)} disabled={!activeMailbox || syncing} aria-label="Sync inbox" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            {syncing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
        {error && <div role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</div>}
        {notice && <div role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">{notice}<button type="button" onClick={() => setNotice('')} className="ml-2 underline">Dismiss</button></div>}
        <div className="flex-1 overflow-y-auto">
          {!activeMailbox ? (
            <div className="mx-auto mt-14 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <Mail className="mx-auto h-10 w-10 text-brand-500" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">Connect your email</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Connect an organization Microsoft 365 or Google Workspace account. Mail content is synced to the workspace and automatically removed according to the admin retention setting.</p>
              <p className="mt-3 text-xs text-slate-400">Provider OAuth credentials must be configured by an administrator before you can connect an account.</p>
            </div>
          ) : loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">No messages here yet. New mail will appear automatically once provider notifications are configured.</div>
          ) : messages.map((message) => (
            <div key={message.id} className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 hover:bg-white ${selectedMessage?.id === message.id ? 'bg-brand-50/60' : 'bg-white/40'}`}>
              <button type="button" onClick={() => void openMessage(message)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${message.is_read ? 'bg-transparent' : 'bg-brand-600'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-xs ${message.is_read ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}>{message.sender_name || message.sender_email}</span>
                    {message.has_attachments && <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-400" />}
                    {message.labels.map((label) => <span key={label} className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] text-sky-700">{label}</span>)}
                    <time className="ml-auto shrink-0 text-[10px] text-slate-400">{new Date(message.received_at).toLocaleDateString()}</time>
                  </div>
                  <p className={`mt-1 truncate text-xs ${message.is_read ? 'text-slate-600' : 'font-semibold text-slate-800'}`}>{message.subject || '(no subject)'}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-400">{message.snippet || message.body_text}</p>
                </div>
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); void toggleStar(message); }} aria-label={message.is_starred ? 'Unstar email' : 'Star email'} className="rounded p-1 text-slate-400 hover:text-amber-500">
                <Star className={`h-4 w-4 ${message.is_starred ? 'fill-amber-400 text-amber-500' : ''}`} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {selectedMessage && (
        <section className="flex min-w-0 flex-1 flex-col border-l border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <button type="button" onClick={() => setSelectedMessage(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 xl:hidden" aria-label="Back to list"><ArrowLeft className="h-4 w-4" /></button>
            <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{selectedMessage.subject || '(no subject)'}</h2>
            <button type="button" onClick={() => void archiveMessage(selectedMessage)} title="Archive" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Archive className="h-4 w-4" /></button>
            <button type="button" onClick={() => void invokeMailboxAction('mark-read', { messageId: selectedMessage.id, isRead: !selectedMessage.is_read }).then(() => loadMessages()).catch((actionError) => setError(actionError.message))} title={selectedMessage.is_read ? 'Mark unread' : 'Mark read'} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">{selectedMessage.is_read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}</button>
            <button type="button" onClick={() => setSelectedMessage(null)} title="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-xs text-slate-500">{selectedMessage.sender_name} &lt;{selectedMessage.sender_email}&gt;</p>
            <p className="mt-1 text-[11px] text-slate-400">{new Date(selectedMessage.received_at).toLocaleString()}</p>
            <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{selectedMessage.body_text || selectedMessage.snippet || 'This email has no readable text content.'}</div>
            {selectedMessage.has_attachments && <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">This message has attachments. Open the message in your mail provider to download them.</p>}
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="mt-5 rounded-xl border border-violet-100 bg-violet-50/70 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-violet-800"><Sparkles className="h-3.5 w-3.5" /> Saved AI {artifact.artifact_type === 'summary' ? 'summary' : 'draft'}</p>
                <p className="whitespace-pre-wrap text-xs leading-5 text-violet-900">{artifact.content}</p>
                {artifact.artifact_type === 'draft' && (
                  <button type="button" onClick={() => { setAiDraft(artifact.content); setComposeOpen(true); setReplyMode(true); }} className="mt-3 text-xs font-semibold text-violet-800 underline">
                    Use this draft
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3">
            <button type="button" onClick={() => { setComposeOpen(true); setReplyMode(true); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><ArrowUpRight className="h-3.5 w-3.5" /> Reply</button>
            <button type="button" disabled={aiBusy} onClick={() => void runAiAction('summarize')} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> Summarize</button>
            <button type="button" disabled={aiBusy} onClick={() => void runAiAction('draft')} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> Draft reply</button>
            <p className="w-full text-[10px] text-slate-400">AI actions send this message to Azure OpenAI and save the result in the workspace.</p>
          </div>
        </section>
      )}

      {composeOpen && activeMailbox && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={(event) => void submitMessage(event)} className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{replyMode ? 'Reply' : 'New message'}</h3>
                <p className="text-[11px] text-slate-400">From {activeMailbox.email}</p>
              </div>
              <button type="button" onClick={() => { setComposeOpen(false); setReplyMode(false); setAiDraft(''); }} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-5">
              {!replyMode && <input required type="email" name="to" placeholder="To" className="w-full border-b border-slate-100 py-2 text-sm outline-none focus:border-brand-500" />}
              <input required name="subject" defaultValue={replyMode && selectedMessage ? `Re: ${selectedMessage.subject.replace(/^Re:\s*/i, '')}` : ''} placeholder="Subject" className="w-full border-b border-slate-100 py-2 text-sm outline-none focus:border-brand-500" />
              <textarea required name="body" defaultValue={aiDraft} onChange={() => setAiDraft('')} rows={10} placeholder="Write your message…" className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-brand-500" />
            </div>
            <div className="flex justify-end border-t border-slate-100 p-4">
              <button type="submit" disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      )}
      {rulesOpen && activeMailbox && (
        <EmailRulesPanel
          mailboxId={activeMailbox.id}
          userId={currentUser.id}
          onActivity={(eventType, summary) => recordSystemActivity({
            eventType,
            summary,
            targetType: 'mailbox',
            targetId: activeMailbox.id,
            targetName: activeMailbox.email,
          })}
          onClose={() => setRulesOpen(false)}
        />
      )}
    </main>
  );
};
