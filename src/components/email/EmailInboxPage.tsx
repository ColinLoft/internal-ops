import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Filter,
  FileText,
  Inbox,
  LoaderCircle,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  Upload,
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
  cc_recipients: { name?: string; email: string }[];
  body_text: string;
  body_html: string;
  snippet: string;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  labels: string[];
};

type AiArtifact = { id: string; artifact_type: 'summary' | 'draft'; content: string; created_at: string };
type MessageFilter = 'all' | 'unread' | 'starred' | 'attachments';
type EmailAttachment = { name: string; contentType: string; contentBytes: string };

const sanitizeEmailHtml = (html: string) => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const allowedTags = new Set([
    'A', 'ABBR', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'DD', 'DIV', 'DL', 'DT', 'EM',
    'H1', 'H2', 'H3', 'H4', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SMALL', 'SPAN',
    'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL',
  ]);
  const unsafeTags = new Set(['IFRAME', 'OBJECT', 'EMBED', 'SCRIPT', 'STYLE', 'FORM', 'INPUT', 'BUTTON', 'VIDEO', 'AUDIO']);
  for (const element of [...document.body.querySelectorAll('*')]) {
    if (unsafeTags.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name === 'href' && element.tagName === 'A') {
        if (!/^(https?:|mailto:)/i.test(value)) element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'src' && element.tagName === 'IMG') {
        if (!/^(https?:|data:image\/(?:png|gif|jpe?g|webp);base64,)/i.test(value)) element.removeAttribute(attribute.name);
        continue;
      }
      if (['alt', 'title', 'colspan', 'rowspan'].includes(name)
        || (['width', 'height'].includes(name) && /^\d{1,4}$/.test(value))) continue;
      element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'A' && element.hasAttribute('href')) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  return document.body.innerHTML;
};

const encodeFile = async (file: File): Promise<EmailAttachment> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return {
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    contentBytes: btoa(binary),
  };
};

const EmailHtmlBody: React.FC<{ html: string }> = ({ html }) => {
  const safeHtml = useMemo(() => sanitizeEmailHtml(html), [html]);
  return (
    <iframe
      title="Email content"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'"><style>body{font:14px/1.65 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#334155;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}td,th{padding:4px}a{color:#2563eb}</style></head><body>${safeHtml}</body></html>`}
      className="mt-5 h-[min(70vh,800px)] min-h-64 w-full rounded-lg border-0 bg-white"
    />
  );
};

const getFunctionErrorMessage = async (error: Error) => {
  if ('name' in error && error.name === 'FunctionsFetchError') {
    return 'The email service could not be reached. Check the deployed Edge Function and browser connection, then try again.';
  }
  if ('context' in error && error.context instanceof Response) {
    const responseBody: unknown = await error.context.clone().json().catch(() => null);
    if (responseBody && typeof responseBody === 'object') {
      if ('error' in responseBody && typeof responseBody.error === 'string') return responseBody.error;
      if ('message' in responseBody && typeof responseBody.message === 'string') return responseBody.message;
    }
    return `Email request failed with status ${error.context.status}. Please check the Edge Function logs in Supabase.`;
  }
  return error.message;
};

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
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
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
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeBcc, setComposeBcc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
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
      .select('id, mailbox_id, provider_message_id, provider_thread_id, folder, subject, sender_name, sender_email, to_recipients, cc_recipients, body_text, body_html, snippet, received_at, is_read, is_starred, has_attachments, labels')
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
      let syncWarning = '';
      if (sync && mailboxId) {
        setSyncing(true);
        const { data, error: syncError } = await supabase.functions.invoke('mail-sync', {
          body: { mailboxId },
        });
        if (syncError) {
          syncWarning = await getFunctionErrorMessage(syncError);
        } else if (data?.error) {
          syncWarning = data.error;
        } else {
          activityLogWarning = data?.activityLogWarning || '';
        }
      }
      await loadMessages(mailboxId);
      const warnings = [syncWarning, activityLogWarning].filter(Boolean);
      if (warnings.length) setError(warnings.join(' '));
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
      if (exchangeError) {
        return getFunctionErrorMessage(exchangeError).then((message) => {
          throw new Error(message);
        });
      }
      const webhookWarning = String(data?.webhookWarning || '')
        .replace(/^Mailbox connected\.\s*/i, '')
        .trim();
      setNotice(webhookWarning
        ? `Mailbox connected. ${webhookWarning}`
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
  const filteredMessages = useMemo(() => messages.filter((message) => {
    if (messageFilter === 'unread') return !message.is_read;
    if (messageFilter === 'starred') return message.is_starred;
    if (messageFilter === 'attachments') return message.has_attachments;
    return true;
  }), [messageFilter, messages]);
  const allVisibleSelected = filteredMessages.length > 0
    && filteredMessages.every((message) => selectedMessageIds.has(message.id));

  useEffect(() => {
    setSelectedMessageIds((current) => {
      const availableIds = new Set(messages.map((message) => message.id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [messages]);

  useEffect(() => {
    setSelectedMessageIds(new Set());
  }, [activeMailboxId, activeFolder, messageFilter]);

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
      setError(await getFunctionErrorMessage(connectError));
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
    if (actionError) throw new Error(await getFunctionErrorMessage(actionError));
    if (data?.activityLogWarning) setError(data.activityLogWarning);
    return data;
  };

  const updateMessageState = (messageId: string, updates: Partial<EmailMessage>) => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...updates } : message));
    setSelectedMessage((current) => current?.id === messageId ? { ...current, ...updates } : current);
  };

  const openNewCompose = () => {
    setReplyMode(false);
    setComposeTo('');
    setComposeCc('');
    setComposeBcc('');
    setComposeSubject('');
    setComposeBody('');
    setComposeAttachments([]);
    setShowCc(false);
    setShowBcc(false);
    setComposeOpen(true);
  };

  const openReplyCompose = (body = '') => {
    setReplyMode(true);
    setComposeTo(selectedMessage?.sender_email || '');
    setComposeCc('');
    setComposeBcc('');
    setComposeSubject(selectedMessage
      ? `Re: ${selectedMessage.subject.replace(/^Re:\s*/i, '')}`
      : '');
    setComposeBody(body);
    setComposeAttachments([]);
    setShowCc(false);
    setShowBcc(false);
    setComposeOpen(true);
  };

  const openMessage = async (message: EmailMessage) => {
    setSelectedMessage(message);
    if (!message.is_read) {
      updateMessageState(message.id, { is_read: true });
      try {
        await invokeMailboxAction('mark-read', { messageId: message.id, isRead: true });
      } catch (actionError) {
        updateMessageState(message.id, { is_read: false });
        setError(actionError instanceof Error ? actionError.message : 'Could not mark the message as read.');
      }
    }
  };

  const toggleRead = async (message: EmailMessage) => {
    const isRead = !message.is_read;
    updateMessageState(message.id, { is_read: isRead });
    try {
      await invokeMailboxAction('mark-read', { messageId: message.id, isRead });
    } catch (actionError) {
      updateMessageState(message.id, { is_read: message.is_read });
      setError(actionError instanceof Error ? actionError.message : 'Could not update the message.');
    }
  };

  const addComposeAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...composeAttachments, ...Array.from(files)];
    const totalBytes = next.reduce((total, file) => total + file.size, 0);
    if (next.length > 10) {
      setError('Attach up to 10 files per email.');
      return;
    }
    if (totalBytes > 3 * 1024 * 1024) {
      setError('Attachments are limited to 3 MB total. Remove or shrink a file and try again.');
      return;
    }
    setError('');
    setComposeAttachments(next);
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
    const isStarred = !message.is_starred;
    updateMessageState(message.id, { is_starred: isStarred });
    try {
      await invokeMailboxAction('star', { messageId: message.id, isStarred });
    } catch (actionError) {
      updateMessageState(message.id, { is_starred: message.is_starred });
      setError(actionError instanceof Error ? actionError.message : 'Could not update the message.');
    }
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredMessages.forEach((message) => next.delete(message.id));
      else filteredMessages.forEach((message) => next.add(message.id));
      return next;
    });
  };

  const runBulkAction = async (action: 'archive' | 'read' | 'unread' | 'star' | 'unstar') => {
    const selectedMessages = messages.filter((message) => selectedMessageIds.has(message.id));
    if (selectedMessages.length === 0) return;
    setSyncing(true);
    setError('');
    let completed = 0;
    try {
      for (const message of selectedMessages) {
        if (action === 'archive') await invokeMailboxAction('archive', { messageId: message.id });
        else if (action === 'read' || action === 'unread') {
          await invokeMailboxAction('mark-read', { messageId: message.id, isRead: action === 'read' });
        } else {
          await invokeMailboxAction('star', { messageId: message.id, isStarred: action === 'star' });
        }
        completed += 1;
      }
      setSelectedMessageIds(new Set());
      if (selectedMessage && selectedMessages.some((message) => message.id === selectedMessage.id) && action === 'archive') {
        setSelectedMessage(null);
      }
      await loadMessages();
      setNotice(`${completed} message${completed === 1 ? '' : 's'} ${action === 'archive' ? 'archived' : action === 'read' ? 'marked as read' : action === 'unread' ? 'marked as unread' : action === 'star' ? 'starred' : 'unstarred'}.`);
    } catch (actionError) {
      setError(`${completed} of ${selectedMessages.length} messages updated. ${actionError instanceof Error ? actionError.message : 'The bulk action could not be completed.'}`);
      await loadMessages();
    } finally {
      setSyncing(false);
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
      if (aiError) throw new Error(await getFunctionErrorMessage(aiError));
      if (data?.activityLogWarning) setError(data.activityLogWarning);
      if (action === 'draft') {
        setArtifacts((current) => [data as AiArtifact, ...current.filter((artifact) => artifact.id !== data.id)]);
        openReplyCompose(data.content || '');
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
    const to = replyMode && selectedMessage ? selectedMessage.sender_email : composeTo.trim();
    const subject = composeSubject.trim();
    const body = composeBody.trim();
    if (!to || !subject || !body) {
      setError('Add a recipient, subject, and message body before sending.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const attachments = await Promise.all(composeAttachments.map(encodeFile));
      await invokeMailboxAction(replyMode ? 'reply' : 'send', {
        to,
        cc: replyMode ? undefined : composeCc,
        bcc: replyMode ? undefined : composeBcc,
        subject,
        body,
        attachments,
        replyToMessageId: replyMode ? selectedMessage?.id : undefined,
      });
      setComposeOpen(false);
      setReplyMode(false);
      setComposeTo('');
      setComposeCc('');
      setComposeBcc('');
      setComposeSubject('');
      setComposeBody('');
      setComposeAttachments([]);
      setNotice('Message sent.');
      await refresh(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const title = selectedMessage?.subject || (activeFolder === 'inbox' ? 'Inbox' : folders.find((folder) => folder.id === activeFolder)?.label || 'Email');
  const sharedMailboxControl = mailboxes.length > 0 && currentUser.systemRole === 'admin' ? (
    <div className="relative">
      <button
        type="button"
        onClick={() => setConnectMenuOpen((open) => !open)}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" />
        Connect shared mailbox
      </button>
      {connectMenuOpen && (
        <div className="absolute bottom-11 left-0 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-slate-800">Connect a Microsoft 365 shared mailbox</p>
          <input
            value={sharedMailboxAddress}
            onChange={(event) => setSharedMailboxAddress(event.target.value)}
            placeholder="shared@organization.org"
            type="email"
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500"
          />
          <button
            type="button"
            disabled={!sharedMailboxAddress.trim()}
            onClick={() => void connectMailbox('microsoft', 'shared')}
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Continue to Microsoft
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden bg-slate-50/70">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white/80 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Mail</h1>
            <p className="mt-0.5 text-xs text-slate-500">Your connected inboxes</p>
          </div>
          <button type="button" onClick={openNewCompose} aria-label="Compose email" className="rounded-xl bg-brand-600 p-2.5 text-white hover:bg-brand-700">
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
          {sharedMailboxControl}
          {activeMailbox && (
            <p className="mt-3 truncate text-center text-[10px] text-slate-400" title={activeMailbox.email}>
              {activeMailbox.mailbox_type === 'shared' ? 'Shared mailbox · ' : ''}{activeMailbox.email} · Microsoft 365
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
          {!activeMailbox && mailboxes.length === 0 && !loading && (
            <button
              type="button"
              onClick={() => void connectMailbox('microsoft', 'personal')}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              Connect Microsoft 365
            </button>
          )}
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
        {activeMailbox && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
            <Filter className="mr-1 h-4 w-4 text-slate-400" />
            {([
              ['all', 'All mail', messages.length],
              ['unread', 'Unread', unreadCount],
              ['starred', 'Starred', messages.filter((message) => message.is_starred).length],
              ['attachments', 'Attachments', messages.filter((message) => message.has_attachments).length],
            ] as const).map(([filter, label, count]) => (
              <button
                key={filter}
                type="button"
                onClick={() => setMessageFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  messageFilter === filter
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                {label}<span className="ml-1.5 opacity-70">{count}</span>
              </button>
            ))}
            {selectedMessageIds.size > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-1 border-l border-slate-200 pl-2">
                <span className="mr-1 text-[11px] font-medium text-slate-500">{selectedMessageIds.size} selected</span>
                <button type="button" onClick={() => void runBulkAction('read')} disabled={syncing} title="Mark selected as read" aria-label="Mark selected as read" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><MailOpen className="h-4 w-4" /></button>
                <button type="button" onClick={() => void runBulkAction('unread')} disabled={syncing} title="Mark selected as unread" aria-label="Mark selected as unread" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><Mail className="h-4 w-4" /></button>
                <button type="button" onClick={() => void runBulkAction('star')} disabled={syncing} title="Star selected" aria-label="Star selected" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><Star className="h-4 w-4" /></button>
                <button type="button" onClick={() => void runBulkAction('archive')} disabled={syncing} title="Archive selected" aria-label="Archive selected" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><Archive className="h-4 w-4" /></button>
                <button type="button" onClick={() => setSelectedMessageIds(new Set())} title="Clear selection" aria-label="Clear selection" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {!activeMailbox ? (
            <div className="mx-auto mt-14 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <Mail className="mx-auto h-10 w-10 text-brand-500" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">Connect your email</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Connect an organization Microsoft 365 account. Mail content is synced to the workspace and automatically removed according to the admin retention setting.</p>
              <button
                type="button"
                onClick={() => void connectMailbox('microsoft', 'personal')}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" />
                Connect Microsoft 365
              </button>
              <p className="mt-3 text-xs text-slate-400">Provider OAuth credentials must be configured by an administrator before you can connect an account.</p>
            </div>
          ) : loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading messages…</div>
          ) : filteredMessages.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {messages.length === 0 ? 'No messages in this folder yet. Select Sync inbox to check Microsoft 365.' : `No ${messageFilter === 'all' ? '' : `${messageFilter} `}messages match this view.`}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-slate-100 bg-white/80 px-4 py-2">
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  aria-label={allVisibleSelected ? 'Deselect all visible messages' : 'Select all visible messages'}
                  title={allVisibleSelected ? 'Deselect all visible messages' : 'Select all visible messages'}
                  className={`flex h-4 w-4 items-center justify-center rounded border ${allVisibleSelected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}
                >
                  <Check className="h-3 w-3" />
                </button>
                <span className="text-[11px] text-slate-400">{filteredMessages.length} messages · newest first</span>
                <span className="ml-auto text-[11px] text-slate-400">{activeMailbox.email}</span>
              </div>
              {filteredMessages.map((message) => (
            <div key={message.id} className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 hover:bg-white ${selectedMessage?.id === message.id ? 'bg-brand-50/60' : 'bg-white/40'}`}>
              <button
                type="button"
                onClick={() => toggleMessageSelection(message.id)}
                aria-label={selectedMessageIds.has(message.id) ? 'Deselect message' : 'Select message'}
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selectedMessageIds.has(message.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-brand-400'}`}
              >
                <Check className="h-3 w-3" />
              </button>
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
            </>
          )}
        </div>
      </section>

      {selectedMessage && (
        <section className="flex min-w-0 flex-1 flex-col border-l border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <button type="button" onClick={() => setSelectedMessage(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 xl:hidden" aria-label="Back to list"><ArrowLeft className="h-4 w-4" /></button>
            <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{selectedMessage.subject || '(no subject)'}</h2>
            <button type="button" onClick={() => void toggleStar(selectedMessage)} title={selectedMessage.is_starred ? 'Unstar' : 'Star'} aria-label={selectedMessage.is_starred ? 'Unstar email' : 'Star email'} className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-600">
              <Star className={`h-4 w-4 ${selectedMessage.is_starred ? 'fill-amber-400 text-amber-500' : ''}`} />
            </button>
            <button type="button" onClick={() => void archiveMessage(selectedMessage)} title="Archive" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Archive className="h-4 w-4" /></button>
            <button type="button" onClick={() => void toggleRead(selectedMessage)} title={selectedMessage.is_read ? 'Mark unread' : 'Mark read'} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">{selectedMessage.is_read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}</button>
            <button type="button" onClick={() => setSelectedMessage(null)} title="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
            <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <h1 className="mb-6 text-xl font-bold leading-7 text-slate-900">{selectedMessage.subject || '(no subject)'}</h1>
              <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {(selectedMessage.sender_name || selectedMessage.sender_email || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{selectedMessage.sender_name || selectedMessage.sender_email}</p>
                  <p className="truncate text-xs text-slate-500">{selectedMessage.sender_email}</p>
                  <p className="mt-2 break-words text-xs text-slate-500">
                    To {selectedMessage.to_recipients?.map((recipient) => recipient.name || recipient.email).join(', ') || activeMailbox?.email}
                  </p>
                  {selectedMessage.cc_recipients?.length > 0 && (
                    <p className="mt-1 break-words text-xs text-slate-500">
                      Cc {selectedMessage.cc_recipients.map((recipient) => recipient.name || recipient.email).join(', ')}
                    </p>
                  )}
                </div>
                <time className="shrink-0 text-right text-[11px] text-slate-400" dateTime={selectedMessage.received_at}>
                  {new Date(selectedMessage.received_at).toLocaleString()}
                </time>
              </div>
              {selectedMessage.body_html ? (
                <EmailHtmlBody html={selectedMessage.body_html} />
              ) : (
                <div className="mt-6 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                  {selectedMessage.body_text || selectedMessage.snippet || 'This email has no readable text content.'}
                </div>
              )}
              {selectedMessage.has_attachments && (
                <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                  This message has attachments. Open it in Microsoft 365 to download them.
                </div>
              )}
            </article>
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="mx-auto mt-5 max-w-4xl rounded-xl border border-violet-100 bg-violet-50/70 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-violet-800"><Sparkles className="h-3.5 w-3.5" /> Saved AI {artifact.artifact_type === 'summary' ? 'summary' : 'draft'}</p>
                <p className="whitespace-pre-wrap text-xs leading-5 text-violet-900">{artifact.content}</p>
                {artifact.artifact_type === 'draft' && (
                  <button type="button" onClick={() => openReplyCompose(artifact.content)} className="mt-3 text-xs font-semibold text-violet-800 underline">
                    Use this draft
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3">
            <button type="button" onClick={() => openReplyCompose()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><ArrowUpRight className="h-3.5 w-3.5" /> Reply</button>
            <button type="button" disabled={aiBusy} onClick={() => void runAiAction('summarize')} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> Summarize</button>
            <button type="button" disabled={aiBusy} onClick={() => void runAiAction('draft')} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> Draft reply</button>
            <p className="w-full text-[10px] text-slate-400">AI actions send this message to Azure OpenAI and save the result in the workspace.</p>
          </div>
        </section>
      )}

      {composeOpen && activeMailbox && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={(event) => void submitMessage(event)} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{replyMode ? 'Reply' : 'New message'}</h3>
                <p className="text-[11px] text-slate-400">From {activeMailbox.email}</p>
              </div>
              <button type="button" onClick={() => { setComposeOpen(false); setReplyMode(false); setComposeAttachments([]); }} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
              {replyMode ? (
                <p className="border-b border-slate-100 py-2 text-sm text-slate-500">To: {composeTo}</p>
              ) : (
                <div className="flex items-center gap-3 border-b border-slate-100">
                  <input required value={composeTo} onChange={(event) => setComposeTo(event.target.value)} placeholder="To (separate addresses with commas)" aria-label="To" className="min-w-0 flex-1 py-2 text-sm outline-none focus:border-brand-500" />
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setShowCc((shown) => !shown)} className="text-xs text-slate-500 hover:text-slate-800">Cc</button>
                    <button type="button" onClick={() => setShowBcc((shown) => !shown)} className="text-xs text-slate-500 hover:text-slate-800">Bcc</button>
                  </div>
                </div>
              )}
              {!replyMode && showCc && <input value={composeCc} onChange={(event) => setComposeCc(event.target.value)} placeholder="Cc (separate addresses with commas)" aria-label="Cc" className="w-full border-b border-slate-100 py-2 text-sm outline-none focus:border-brand-500" />}
              {!replyMode && showBcc && <input value={composeBcc} onChange={(event) => setComposeBcc(event.target.value)} placeholder="Bcc (separate addresses with commas)" aria-label="Bcc" className="w-full border-b border-slate-100 py-2 text-sm outline-none focus:border-brand-500" />}
              <input required value={composeSubject} onChange={(event) => setComposeSubject(event.target.value)} placeholder="Subject" aria-label="Subject" className="w-full border-b border-slate-100 py-2 text-sm outline-none focus:border-brand-500" />
              <textarea required value={composeBody} onChange={(event) => setComposeBody(event.target.value)} rows={10} placeholder="Write your message…" aria-label="Message body" className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-brand-500" />
              {!replyMode && (
                <>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <Upload className="h-4 w-4" />
                    Attach files
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        addComposeAttachments(event.currentTarget.files);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <p className="ml-2 inline text-[11px] text-slate-400">Up to 10 files, 3 MB total</p>
                  {composeAttachments.length > 0 && (
                    <ul className="space-y-2">
                      {composeAttachments.map((file, index) => (
                        <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate">{file.name}</span>
                          <span className="shrink-0 text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
                          <button type="button" onClick={() => setComposeAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`} className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
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
