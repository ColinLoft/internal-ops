import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Italic,
  Inbox,
  Link2,
  LoaderCircle,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Star,
  Underline,
  List,
  ListOrdered,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import type { Attachment } from '../../types';
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
type MessageFilter = 'all' | 'unread' | 'starred' | 'attachments' | 'today';
type EmailAttachment = { name: string; contentType: string; contentBytes: string; isInline?: boolean; contentId?: string };
type EmailTemplate = { id: string; name: string; subject: string; body_html: string; created_by: string; is_shared: boolean };
type ScheduledEmail = { id: string; action: 'send' | 'reply'; subject: string; scheduled_at: string; status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled'; last_error: string | null };
type EmailDraft = {
  id: string;
  mailbox_id: string;
  reply_to_message_id: string | null;
  to_recipients: string;
  cc_recipients: string;
  bcc_recipients: string;
  subject: string;
  body_html: string;
  updated_at: string;
};

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
        if (!/^(https?:|cid:|data:image\/(?:png|gif|jpe?g|webp);base64,)/i.test(value)) element.removeAttribute(attribute.name);
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

const emailHtmlToText = (html: string) => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const link of [...document.querySelectorAll('a[href]')]) {
    link.textContent = `${link.textContent || link.getAttribute('href')} (${link.getAttribute('href')})`;
  }
  for (const image of [...document.querySelectorAll('img')]) {
    image.replaceWith(document.createTextNode(image.getAttribute('alt') || '[image]'));
  }
  for (const lineBreak of [...document.querySelectorAll('br')]) lineBreak.replaceWith(document.createTextNode('\n'));
  return (document.body.innerText || document.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
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
    <div
      className="mt-5 w-full overflow-visible break-words rounded-lg bg-white text-sm leading-6 text-slate-700 [&_a]:text-brand-600 [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full [&_table]:border-collapse [&_td]:p-1 [&_th]:p-1"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
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

const localDateTimeValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const senderInitials = (message: EmailMessage) => (message.sender_name || message.sender_email || '?')
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

export const EmailInboxPage: React.FC = () => {
  const {
    activeTab,
    currentUser,
    recordSystemActivity,
    channels,
    postChannelMessage,
    searchQuery,
    setFocusedEmailId,
    isEmailComposeRequested,
    setIsEmailComposeRequested,
  } = useWorkspace();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailboxId, setActiveMailboxId] = useState('');
  const [mailboxMenuOpen, setMailboxMenuOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [expandedThreadMessageIds, setExpandedThreadMessageIds] = useState<Set<string>>(() => new Set());
  const [artifacts, setArtifacts] = useState<AiArtifact[]>([]);
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
  const [composeProviderAttachments, setComposeProviderAttachments] = useState<EmailAttachment[]>([]);
  const [composeScheduledAt, setComposeScheduledAt] = useState('');
  const [inlineReplyBody, setInlineReplyBody] = useState('');
  const [inlineReplySending, setInlineReplySending] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [shareTemplate, setShareTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [channelForwardOpen, setChannelForwardOpen] = useState(false);
  const [forwardChannelId, setForwardChannelId] = useState('');
  const [forwardBusy, setForwardBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const inlineReplyEditorRef = React.useRef<HTMLDivElement>(null);
  const [showScheduledSends, setShowScheduledSends] = useState(false);
  const [scheduledSends, setScheduledSends] = useState<ScheduledEmail[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);

  const activeMailbox = mailboxes.find((mailbox) => mailbox.id === activeMailboxId) || null;
  const forwardableChannels = channels.filter((channel) =>
    (!channel.isPrivate || channel.members.includes(currentUser.id))
    && channel.postingRoles.includes(currentUser.systemRole)
  );

  useEffect(() => {
    if (activeTab !== 'inbox' || !isEmailComposeRequested) return;
    setComposeOpen(true);
    setIsEmailComposeRequested(false);
  }, [activeTab, isEmailComposeRequested, setIsEmailComposeRequested]);

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
    if (activeFolder === 'drafts') {
      const { data, error: draftError } = await supabase.from('email_drafts')
        .select('id, mailbox_id, reply_to_message_id, to_recipients, cc_recipients, bcc_recipients, subject, body_html, updated_at')
        .eq('mailbox_id', mailboxId)
        .order('updated_at', { ascending: false });
      if (draftError) throw draftError;
      setDrafts((data || []) as EmailDraft[]);
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
    const cleanSearch = searchQuery.trim();
    if (cleanSearch) {
      query = query.textSearch('search_vector', cleanSearch, { type: 'plain', config: 'simple' });
    }
    const { data, error: queryError } = await query;
    if (queryError) throw queryError;
    const loaded = (data || []) as EmailMessage[];
    setMessages(loaded);
    setSelectedMessage((current) => current ? loaded.find((message) => message.id === current.id) || null : null);
  }, [activeFolder, activeMailboxId, searchQuery]);

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
  }, [loadMailboxes]);

  useEffect(() => {
    let active = true;
    void loadMailboxes()
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Email could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadMailboxes]);

  useEffect(() => {
    if (!activeMailboxId) return;
    void loadMessages(activeMailboxId)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Email could not be loaded.'));
  }, [activeMailboxId, activeFolder, searchQuery, loadMessages]);

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
    setFocusedEmailId(selectedMessage?.id || null);
    setExpandedThreadMessageIds(selectedMessage ? new Set([selectedMessage.id]) : new Set());
    setInlineReplyBody('');
    if (inlineReplyEditorRef.current) inlineReplyEditorRef.current.innerHTML = '';
    return () => setFocusedEmailId(null);
  }, [selectedMessage?.id, setFocusedEmailId]);

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

  useEffect(() => {
    if (!composeOpen) return;
    let active = true;
    supabase.from('email_templates')
      .select('id, name, subject, body_html, created_by, is_shared')
      .order('is_shared', { ascending: false })
      .order('name')
      .then(({ data, error: templateError }) => {
        if (!active) return;
        if (templateError) setError(`Email templates could not be loaded: ${templateError.message}`);
        else setTemplates((data || []) as EmailTemplate[]);
      });
    return () => { active = false; };
  }, [composeOpen]);

  useEffect(() => {
    if (!showScheduledSends || !activeMailboxId) return;
    let active = true;
    setScheduledLoading(true);
    void (async () => {
      try {
        const { data, error: scheduleError } = await supabase.from('email_scheduled_sends')
          .select('id, action, subject, scheduled_at, status, last_error')
          .eq('mailbox_id', activeMailboxId)
          .order('scheduled_at', { ascending: false })
          .limit(100);
        if (!active) return;
        if (scheduleError) setError(`Scheduled emails could not be loaded: ${scheduleError.message}`);
        else setScheduledSends((data || []) as ScheduledEmail[]);
      } catch (scheduleError) {
        if (active) setError(scheduleError instanceof Error ? scheduleError.message : 'Scheduled emails could not be loaded.');
      } finally {
        if (active) setScheduledLoading(false);
      }
    })();
    return () => { active = false; };
  }, [activeMailboxId, showScheduledSends]);

  useEffect(() => {
    if (composeOpen && editorRef.current) editorRef.current.innerHTML = composeBody;
  }, [composeOpen]);

  const unreadCount = useMemo(() => messages.filter((message) => !message.is_read).length, [messages]);
  const filteredMessages = useMemo(() => messages.filter((message) => {
    if (messageFilter === 'unread') return !message.is_read;
    if (messageFilter === 'starred') return message.is_starred;
    if (messageFilter === 'attachments') return message.has_attachments;
    if (messageFilter === 'today') return new Date(message.received_at).toDateString() === new Date().toDateString();
    return true;
  }), [messageFilter, messages]);
  const groupedMessages = useMemo(() => {
    const groups = new Map<string, EmailMessage[]>();
    for (const message of filteredMessages) {
      const key = message.provider_thread_id || message.id;
      groups.set(key, [...(groups.get(key) || []), message]);
    }
    return [...groups.values()].map((thread) => ({
      messages: thread.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at)),
      latest: [...thread].sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at))[0],
    })).sort((a, b) => Date.parse(b.latest.received_at) - Date.parse(a.latest.received_at));
  }, [filteredMessages]);
  const selectedThreadMessages = useMemo(() => {
    if (!selectedMessage) return [];
    return messages
      .filter((message) => message.mailbox_id === selectedMessage.mailbox_id
        && (selectedMessage.provider_thread_id
          ? message.provider_thread_id === selectedMessage.provider_thread_id
          : message.id === selectedMessage.id))
      .sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
  }, [messages, selectedMessage]);
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
    setDraftId(null);
    setReplyMode(false);
    setComposeTo('');
    setComposeCc('');
    setComposeBcc('');
    setComposeSubject('');
    setComposeBody('');
    setComposeAttachments([]);
    setComposeProviderAttachments([]);
    setComposeScheduledAt('');
    setSelectedTemplateId('');
    setTemplateName('');
    setShowTemplateSave(false);
    setShareTemplate(false);
    setShowCc(false);
    setShowBcc(false);
    setComposeOpen(true);
  };

  useEffect(() => {
    const handleAssistantEmailAction = (event: Event) => {
      const detail = (event as CustomEvent<{
        type?: string;
        content?: string;
        details?: Record<string, string>;
      }>).detail || {};
      const details = detail.details || {};
      if (!detail.type) return;
      if (detail.type === 'compose_email') {
        openNewCompose();
        setComposeTo(details.to || '');
        setComposeCc(details.cc || '');
        setComposeBcc(details.bcc || '');
        setComposeSubject(details.subject || '');
        setComposeBody(details.bodyHtml || detail.content || '');
        setShowCc(Boolean(details.cc));
        setShowBcc(Boolean(details.bcc));
        return;
      }
      if (!activeMailboxId || !['send_email', 'schedule_email'].includes(detail.type)) return;
      void invokeMailboxAction(detail.type === 'schedule_email' ? 'schedule' : 'send', {
        to: details.to || '',
        cc: details.cc || '',
        bcc: details.bcc || '',
        subject: details.subject || '',
        bodyHtml: details.bodyHtml || detail.content || '',
        scheduledAt: details.scheduledAt || '',
      }).then(() => setNotice(detail.type === 'schedule_email' ? 'Email scheduled.' : 'Email sent.'))
        .catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : 'Email action failed.'));
    };
    window.addEventListener('workspace-email-action', handleAssistantEmailAction);
    return () => window.removeEventListener('workspace-email-action', handleAssistantEmailAction);
  }, [activeMailboxId, invokeMailboxAction]);

  const openDraft = async (draft: EmailDraft) => {
    let replyTarget = draft.reply_to_message_id
      ? messages.find((message) => message.id === draft.reply_to_message_id) || null
      : null;
    if (draft.reply_to_message_id && !replyTarget) {
      const { data, error: targetError } = await supabase.from('email_messages')
        .select('id, mailbox_id, provider_message_id, provider_thread_id, folder, subject, sender_name, sender_email, to_recipients, cc_recipients, body_text, body_html, snippet, received_at, is_read, is_starred, has_attachments, labels')
        .eq('id', draft.reply_to_message_id)
        .maybeSingle();
      if (targetError) {
        setError(`The draft reply target could not be loaded: ${targetError.message}`);
      } else {
        replyTarget = data as EmailMessage | null;
      }
    }
    setSelectedMessage(replyTarget);
    setDraftId(draft.id);
    setReplyMode(Boolean(replyTarget));
    setComposeTo(draft.to_recipients);
    setComposeCc(draft.cc_recipients);
    setComposeBcc(draft.bcc_recipients);
    setComposeSubject(draft.subject);
    setComposeBody(sanitizeEmailHtml(draft.body_html));
    setComposeAttachments([]);
    setComposeProviderAttachments([]);
    setComposeScheduledAt('');
    setShowCc(Boolean(draft.cc_recipients));
    setShowBcc(Boolean(draft.bcc_recipients));
    setComposeOpen(true);
  };

  const saveDraft = useCallback(async () => {
    if (!activeMailboxId || !composeOpen || sending) return;
    const bodyHtml = sanitizeEmailHtml((editorRef.current?.innerHTML || composeBody).trim());
    const values = {
      mailbox_id: activeMailboxId,
      created_by: currentUser.id,
      reply_to_message_id: replyMode ? selectedMessage?.id || null : null,
      to_recipients: composeTo.trim(),
      cc_recipients: composeCc.trim(),
      bcc_recipients: composeBcc.trim(),
      subject: composeSubject.trim(),
      body_html: bodyHtml,
      updated_at: new Date().toISOString(),
    };
    if (!values.to_recipients && !values.subject && !bodyHtml) return;
    setDraftSaving(true);
    const result = draftId
      ? await supabase.from('email_drafts').update(values).eq('id', draftId).select('id, mailbox_id, reply_to_message_id, to_recipients, cc_recipients, bcc_recipients, subject, body_html, updated_at').single()
      : await supabase.from('email_drafts').insert(values).select('id, mailbox_id, reply_to_message_id, to_recipients, cc_recipients, bcc_recipients, subject, body_html, updated_at').single();
    setDraftSaving(false);
    if (result.error) {
      setError(`Draft could not be saved: ${result.error.message}`);
      return;
    }
    setDraftId(result.data.id);
    setDrafts((items) => [result.data as EmailDraft, ...items.filter((item) => item.id !== result.data.id)]);
  }, [activeMailboxId, composeBcc, composeCc, composeBody, composeOpen, composeSubject, composeTo, currentUser.id, draftId, replyMode, selectedMessage?.id, sending]);

  useEffect(() => {
    if (!composeOpen) return;
    const timeout = window.setTimeout(() => { void saveDraft(); }, 700);
    return () => window.clearTimeout(timeout);
  }, [composeOpen, composeTo, composeCc, composeBcc, composeSubject, composeBody, saveDraft]);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    if (!replyMode) setComposeSubject(template.subject);
    const safeBody = sanitizeEmailHtml(template.body_html);
    setComposeBody(safeBody);
    if (editorRef.current) editorRef.current.innerHTML = safeBody;
  };

  const saveEmailTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setError('');
    const { data, error: saveError } = await supabase.from('email_templates').insert({
      name: templateName.trim(),
      subject: composeSubject.trim(),
      body_html: sanitizeEmailHtml(composeBody),
      created_by: currentUser.id,
      is_shared: shareTemplate && currentUser.systemRole === 'admin',
    }).select('id, name, subject, body_html, created_by, is_shared').single();
    setSavingTemplate(false);
    if (saveError) {
      setError(`Template could not be saved: ${saveError.message}`);
      return;
    }
    setTemplates((items) => [...items, data as EmailTemplate].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedTemplateId(data.id);
    setTemplateName('');
    setShowTemplateSave(false);
    setShareTemplate(false);
    setNotice('Email template saved.');
  };

  const formatComposeBody = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setComposeBody(editorRef.current?.innerHTML || '');
  };

  const insertComposeLink = () => {
    const url = window.prompt('Enter a web address to link to:');
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setError('Enter a valid web address beginning with https://.');
      return;
    }
    if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
      setError('Only web and email links can be inserted.');
      return;
    }
    formatComposeBody('createLink', parsed.toString());
  };

  const openForwardCompose = async () => {
    if (!selectedMessage) return;
    setForwardBusy(true);
    setError('');
    try {
      const data = await invokeMailboxAction('get-forward-data', { messageId: selectedMessage.id });
      let forwardedBodyHtml = data.bodyHtml || '';
      for (const attachment of (data.attachments || []) as EmailAttachment[]) {
        if (!attachment.isInline || !attachment.contentId || !attachment.contentType.startsWith('image/')) continue;
        const encoded = `data:${attachment.contentType};base64,${attachment.contentBytes}`;
        forwardedBodyHtml = forwardedBodyHtml.split(encoded).join(`cid:${attachment.contentId}`);
      }
      const safeBody = forwardedBodyHtml
        ? sanitizeEmailHtml(forwardedBodyHtml)
        : `<p>${(data.bodyText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
      const header = `<p>---------- Forwarded message ----------<br>From: ${selectedMessage.sender_name || selectedMessage.sender_email} &lt;${selectedMessage.sender_email}&gt;<br>Date: ${new Date(selectedMessage.received_at).toLocaleString()}<br>Subject: ${selectedMessage.subject}</p><hr>`;
      setReplyMode(false);
      setComposeTo('');
      setComposeCc('');
      setComposeBcc('');
      setComposeSubject(`Fwd: ${selectedMessage.subject.replace(/^Fwd:\s*/i, '')}`);
      setComposeBody(`${header}${safeBody}`);
      setComposeAttachments([]);
      setComposeProviderAttachments((data.attachments || []) as EmailAttachment[]);
      setComposeScheduledAt('');
      setShowCc(false);
      setShowBcc(false);
      setSelectedTemplateId('');
      setComposeOpen(true);
    } catch (forwardError) {
      setError(forwardError instanceof Error ? forwardError.message : 'The email could not be prepared for forwarding.');
    } finally {
      setForwardBusy(false);
    }
  };

  const shareEmailToChannel = async () => {
    if (!selectedMessage || !forwardChannelId) return;
    const channel = forwardableChannels.find((item) => item.id === forwardChannelId);
    if (!channel) {
      setError('Choose a channel where you have permission to post.');
      return;
    }
    setForwardBusy(true);
    setError('');
    const uploadedPaths: string[] = [];
    let cleanupErrorMessage = '';
    try {
      const data = await invokeMailboxAction('get-forward-data', { messageId: selectedMessage.id });
      const attachments: Attachment[] = [];
      for (const attachment of (data.attachments || []) as EmailAttachment[]) {
        const binary = atob(attachment.contentBytes);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const path = `${channel.id}/${crypto.randomUUID()}-${attachment.name.replace(/[^\w.-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('channel-attachments').upload(
          path,
          new Blob([bytes], { type: attachment.contentType }),
          { contentType: attachment.contentType, upsert: false },
        );
        if (uploadError) throw new Error(`Attachment "${attachment.name}" could not be shared: ${uploadError.message}`);
        uploadedPaths.push(path);
        const { data: signed, error: signedError } = await supabase.storage.from('channel-attachments').createSignedUrl(path, 60 * 60);
        if (signedError) throw new Error(`Attachment "${attachment.name}" was uploaded but its access link could not be created: ${signedError.message}`);
        attachments.push({
          id: crypto.randomUUID(),
          name: attachment.name,
          size: `${(bytes.byteLength / 1024).toFixed(0)} KB`,
          type: attachment.contentType.startsWith('image/') ? 'image' : 'file',
          url: signed.signedUrl,
          storagePath: path,
        });
      }
      const body = [
        `Forwarded email: ${selectedMessage.subject || '(no subject)'}`,
        `From: ${selectedMessage.sender_name || selectedMessage.sender_email} <${selectedMessage.sender_email}>`,
        `Date: ${new Date(selectedMessage.received_at).toLocaleString()}`,
        '',
        (data.bodyHtml ? emailHtmlToText(data.bodyHtml) : '')
          || data.bodyText
          || selectedMessage.body_text
          || selectedMessage.snippet
          || '',
      ].join('\n');
      await postChannelMessage(channel.id, body, attachments);
      setChannelForwardOpen(false);
      setForwardChannelId('');
      setNotice(`Email forwarded to #${channel.name}.`);
    } catch (forwardError) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from('channel-attachments').remove(uploadedPaths);
        if (cleanupError) cleanupErrorMessage = `Email was not shared. Uploaded attachments could not be cleaned up: ${cleanupError.message}`;
      }
      setError(cleanupErrorMessage || (forwardError instanceof Error ? forwardError.message : 'The email could not be shared to the channel.'));
    } finally {
      setForwardBusy(false);
    }
  };

  const cancelScheduledSend = async (schedule: ScheduledEmail) => {
    const { data, error: cancelError } = await supabase.from('email_scheduled_sends')
      .update({ status: 'cancelled' })
      .eq('id', schedule.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();
    if (cancelError) {
      setError(`Scheduled email could not be cancelled: ${cancelError.message}`);
      return;
    }
    if (!data) {
      setError('The email has started sending or is no longer scheduled. Refresh the Scheduled view to see its current status.');
      setShowScheduledSends(false);
      window.setTimeout(() => setShowScheduledSends(true), 0);
      return;
    }
    setScheduledSends((items) => items.map((item) => item.id === schedule.id ? { ...item, status: 'cancelled' } : item));
    setNotice('Scheduled email cancelled.');
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

  const toggleMessageGroupSelection = (thread: EmailMessage[]) => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      const isSelected = thread.every((message) => current.has(message.id));
      thread.forEach((message) => isSelected ? next.delete(message.id) : next.add(message.id));
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
        prepareInlineReply(data.content || '');
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

  const sendInlineReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMessage || !activeMailboxId || inlineReplySending) return;
    const bodyHtml = sanitizeEmailHtml((inlineReplyEditorRef.current?.innerHTML || inlineReplyBody).trim());
    const bodyText = (inlineReplyEditorRef.current?.innerText || '').trim();
    if (!bodyText) {
      setError('Write a reply before sending.');
      return;
    }
    setInlineReplySending(true);
    setError('');
    try {
      await invokeMailboxAction('reply', {
        sendAction: 'reply',
        to: selectedMessage.sender_email,
        subject: `Re: ${selectedMessage.subject.replace(/^Re:\s*/i, '')}`,
        body: bodyText,
        bodyHtml,
        replyToMessageId: selectedMessage.id,
      });
      setInlineReplyBody('');
      if (inlineReplyEditorRef.current) inlineReplyEditorRef.current.innerHTML = '';
      setNotice('Reply sent.');
      await refresh(true);
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'The reply could not be sent.');
    } finally {
      setInlineReplySending(false);
    }
  };

  const prepareInlineReply = (body = '') => {
    setInlineReplyBody(body);
    if (inlineReplyEditorRef.current) inlineReplyEditorRef.current.innerHTML = body;
    window.setTimeout(() => inlineReplyEditorRef.current?.focus(), 0);
  };

  const submitMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeMailboxId || sending) return;
    const to = replyMode && selectedMessage ? selectedMessage.sender_email : composeTo.trim();
    const subject = composeSubject.trim();
    const bodyHtml = sanitizeEmailHtml((editorRef.current?.innerHTML || composeBody).trim());
    const bodyText = (editorRef.current?.innerText || '').trim();
    if (!to || !subject || !bodyText) {
      setError('Add a recipient, subject, and message body before sending.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const attachments = [
        ...composeProviderAttachments,
        ...await Promise.all(composeAttachments.map(encodeFile)),
      ];
      const scheduledAt = composeScheduledAt ? new Date(composeScheduledAt) : null;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
        throw new Error('Choose a valid scheduled send time.');
      }
      await invokeMailboxAction(composeScheduledAt ? 'schedule' : replyMode ? 'reply' : 'send', {
        sendAction: replyMode ? 'reply' : 'send',
        to,
        cc: replyMode ? undefined : composeCc,
        bcc: replyMode ? undefined : composeBcc,
        subject,
        body: bodyText,
        bodyHtml,
        attachments,
        replyToMessageId: replyMode ? selectedMessage?.id : undefined,
        scheduledAt: scheduledAt?.toISOString(),
      });
      setComposeOpen(false);
      setReplyMode(false);
      setComposeTo('');
      setComposeCc('');
      setComposeBcc('');
      setComposeSubject('');
      setComposeBody('');
      setComposeAttachments([]);
      setComposeProviderAttachments([]);
      setComposeScheduledAt('');
      if (draftId) {
        const { error: draftError } = await supabase.from('email_drafts').delete().eq('id', draftId);
        if (draftError) setError(`Message sent, but the draft could not be removed: ${draftError.message}`);
        setDrafts((items) => items.filter((item) => item.id !== draftId));
        setDraftId(null);
      }
      setNotice(scheduledAt
        ? `Email scheduled for ${scheduledAt.toLocaleString()}.`
        : 'Message sent.');
      if (!scheduledAt) await refresh(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The message could not be sent.');
    } finally {
      setSending(false);
    }
  };

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
    <main className="flex min-w-0 flex-1 overflow-hidden bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_52%,#f8fafc_100%)] print:bg-white">
      <aside className="flex w-52 shrink-0 flex-col border-r border-slate-200/80 bg-white/90 p-2 shadow-[4px_0_24px_rgba(30,64,175,0.04)] print:hidden">
        <div className="mb-3 flex items-center justify-between rounded-xl bg-gradient-to-br from-brand-600 to-brand-600 p-2.5 text-white shadow-lg shadow-brand-500/15">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">Workspace mail</p>
            <h1 className="mt-0.5 text-base font-bold">Inbox</h1>
          </div>
          <button type="button" onClick={openNewCompose} aria-label="Compose email" title="Compose a new email" className="rounded-lg bg-white/15 p-2 text-white ring-1 ring-white/20 hover:bg-white/25">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Mailboxes</span>
          <span className="text-[10px] font-semibold text-slate-400">{mailboxes.length} connected</span>
        </div>
        <div className="relative mb-4">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <button type="button" aria-label="Select mailbox" aria-expanded={mailboxMenuOpen} onClick={() => setMailboxMenuOpen((open) => !open)} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-2 text-left text-xs font-semibold text-slate-700 outline-none transition hover:border-brand-300 hover:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10">
            <span className="min-w-0 flex-1 truncate">{activeMailbox?.display_name || activeMailbox?.email || 'Choose a mailbox'}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${mailboxMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {mailboxMenuOpen && (
            <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {mailboxes.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">No mailboxes connected</p>
              ) : mailboxes.map((mailbox) => (
                <button key={mailbox.id} type="button" onClick={() => { setActiveMailboxId(mailbox.id); setSelectedMessage(null); setMailboxMenuOpen(false); }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${activeMailboxId === mailbox.id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${mailbox.mailbox_type === 'shared' ? 'bg-brand-500' : 'bg-brand-500'}`} />
                  <span className="min-w-0 flex-1 truncate">{mailbox.mailbox_type === 'shared' ? 'Shared · ' : ''}{mailbox.display_name || mailbox.email}</span>
                  {activeMailboxId === mailbox.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Folders</div>
        <div className="space-y-1">
          {folders.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setShowScheduledSends(false); setActiveFolder(id); setSelectedMessage(null); }}
              className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                activeFolder === id ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {id === 'inbox' && unreadCount > 0 && <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px]">{unreadCount}</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setShowScheduledSends(false); setActiveFolder('drafts'); setSelectedMessage(null); }}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
              activeFolder === 'drafts' ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span className="flex-1">Drafts</span>
            {drafts.length > 0 && <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px]">{drafts.length}</span>}
          </button>
          {activeMailbox && (
            <button
              type="button"
              onClick={() => { setShowScheduledSends(true); setSelectedMessage(null); }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                showScheduledSends ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Clock3 className="h-4 w-4" />
              <span className="flex-1">Scheduled</span>
              {scheduledSends.filter((item) => item.status === 'scheduled').length > 0 && (
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px]">{scheduledSends.filter((item) => item.status === 'scheduled').length}</span>
              )}
            </button>
          )}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Quick views</p>
          {[
            { label: 'Recent', icon: Clock3, filter: 'all' as MessageFilter },
            { label: 'Unread', icon: MailOpen, filter: 'unread' as MessageFilter },
            { label: 'Today', icon: Inbox, filter: 'today' as MessageFilter },
          ].map(({ label, icon: Icon, filter }) => (
            <button key={label} type="button" onClick={() => { setShowScheduledSends(false); setActiveFolder('inbox'); setMessageFilter(filter); setSelectedMessage(null); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-100">
              <Icon className="h-4 w-4 text-slate-400" /> {label}
            </button>
          ))}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace tools</p>
          <button type="button" onClick={() => setRulesOpen(true)} disabled={!activeMailbox || activeMailbox.connected_by !== currentUser.id} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
            <Settings2 className="h-4 w-4 text-slate-400" /> Inbox rules <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300" />
          </button>
          <button type="button" onClick={() => void refresh(true)} disabled={!activeMailbox || syncing} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 text-slate-400 ${syncing ? 'animate-spin' : ''}`} /> Sync mailbox <span className="ml-auto text-[10px] text-slate-400">{activeMailbox?.last_synced_at ? new Date(activeMailbox.last_synced_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Never'}</span>
          </button>
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

      <section className={`flex min-w-0 flex-col border-r border-slate-200/80 print:hidden ${selectedMessage ? 'hidden lg:flex lg:w-[34%]' : 'lg:w-[35%]'}`}>
        <div className="flex items-center gap-3 border-b border-slate-200/80 bg-white/85 px-5 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">{showScheduledSends ? 'Planning' : activeFolder === 'drafts' ? 'Unfinished work' : 'Mailbox'}</p>
            <h2 className="mt-0.5 truncate text-lg font-bold tracking-tight text-slate-900">{showScheduledSends ? 'Scheduled sends' : activeFolder === 'drafts' ? 'Drafts' : activeFolder === 'inbox' ? 'Inbox' : folders.find((folder) => folder.id === activeFolder)?.label || 'Email'}</h2>
          </div>
          {!showScheduledSends && activeMailbox && (
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 md:flex">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              {activeMailbox.display_name || activeMailbox.email}
            </div>
          )}
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
        </div>
        {error && <div role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</div>}
        {notice && <div role="status" className="border-b border-brand-100 bg-brand-50 px-4 py-2 text-xs text-brand-700">{notice}<button type="button" onClick={() => setNotice('')} className="ml-2 underline">Dismiss</button></div>}
        {activeMailbox && !showScheduledSends && selectedMessageIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-white/75 px-5 py-2.5">
              <div className="ml-auto flex flex-wrap items-center gap-1 border-l border-slate-200 pl-2">
                <span className="mr-1 text-[11px] font-medium text-slate-500">{selectedMessageIds.size} selected</span>
                <button type="button" onClick={() => void runBulkAction('read')} disabled={syncing} title="Mark selected as read" aria-label="Mark selected as read" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><MailOpen className="h-4 w-4" /></button>
                <button type="button" onClick={() => void runBulkAction('unread')} disabled={syncing} title="Mark selected as unread" aria-label="Mark selected as unread" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><Mail className="h-4 w-4" /></button>
                <button type="button" onClick={() => void runBulkAction('star')} disabled={syncing} title="Star selected" aria-label="Star selected" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><Star className="h-4 w-4" /></button>
                <button type="button" onClick={() => void runBulkAction('archive')} disabled={syncing} title="Archive selected" aria-label="Archive selected" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><Archive className="h-4 w-4" /></button>
                <button type="button" onClick={() => setSelectedMessageIds(new Set())} title="Clear selection" aria-label="Clear selection" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
            </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {showScheduledSends ? (
            scheduledLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-slate-500"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading scheduled sends…</div>
            ) : scheduledSends.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">You do not have any scheduled emails.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {scheduledSends.map((schedule) => (
                  <article key={schedule.id} className="flex flex-wrap items-center gap-4 bg-white px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{schedule.subject}</p>
                      <p className="mt-1 text-xs text-slate-500">{schedule.action === 'reply' ? 'Reply' : 'New email'} · {new Date(schedule.scheduled_at).toLocaleString()}</p>
                      {schedule.status === 'failed' && schedule.last_error && <p className="mt-1 text-xs text-rose-600">{schedule.last_error}</p>}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      schedule.status === 'sent' ? 'bg-brand-50 text-brand-700'
                        : schedule.status === 'failed' ? 'bg-rose-50 text-rose-700'
                          : schedule.status === 'scheduled' ? 'bg-brand-50 text-brand-700'
                            : 'bg-slate-100 text-slate-600'
                    }`}>{schedule.status}</span>
                    {schedule.status === 'scheduled' && (
                      <button type="button" onClick={() => void cancelScheduledSend(schedule)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                    )}
                  </article>
                ))}
              </div>
            )
          ) : activeFolder === 'drafts' ? (
            drafts.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">No saved drafts.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {drafts.map((draft) => (
                  <button key={draft.id} type="button" onClick={() => openDraft(draft)} className="flex w-full items-start gap-4 bg-white px-5 py-4 text-left hover:bg-slate-50">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{draft.subject || '(no subject)'}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{draft.to_recipients || 'No recipient yet'} · {new Date(draft.updated_at).toLocaleString()}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : !activeMailbox ? (
            <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-[0_12px_40px_rgba(37,99,235,0.08)] sm:p-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/20"><Mail className="h-8 w-8" /></div>
              <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">A calmer inbox starts here</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Connect your work email</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Bring your Microsoft 365 inbox into the workspace. Threads, rich content, drafts, scheduled sends, templates, and AI tools stay together in one organized place.</p>
              <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2 text-[10px] font-semibold text-slate-500">
                <span className="rounded-xl bg-brand-50 px-2 py-3 text-brand-700">Organized threads</span>
                <span className="rounded-xl bg-brand-50 px-2 py-3 text-brand-700">Smart drafts</span>
                <span className="rounded-xl bg-brand-50 px-2 py-3 text-brand-700">Secure sync</span>
              </div>
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
              <div className="flex items-center gap-3 border-b border-slate-100 bg-white/80 px-5 py-2.5">
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  aria-label={allVisibleSelected ? 'Deselect all visible messages' : 'Select all visible messages'}
                  title={allVisibleSelected ? 'Deselect all visible messages' : 'Select all visible messages'}
                  className={`flex h-4 w-4 items-center justify-center rounded border ${allVisibleSelected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}
                >
                  <Check className="h-3 w-3" />
                </button>
                <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">{activeMailbox.email}</span>
              </div>
              {groupedMessages.map(({ latest: message, messages: thread }) => (
            <div key={message.id} className={`group flex items-start gap-3 border-b border-slate-100/80 px-5 py-3.5 transition hover:bg-white ${selectedMessage?.id === message.id ? 'bg-brand-50/60' : 'bg-white/40'}`}>
              <button
                type="button"
                onClick={() => toggleMessageGroupSelection(thread)}
                aria-label={thread.every((item) => selectedMessageIds.has(item.id)) ? 'Deselect conversation' : 'Select conversation'}
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${thread.every((item) => selectedMessageIds.has(item.id)) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-brand-400'}`}
              >
                <Check className="h-3 w-3" />
              </button>
              <button type="button" onClick={() => void openMessage(message)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${message.is_read ? 'bg-transparent' : 'bg-brand-600'}`} />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-100 text-[11px] font-bold text-brand-700 ring-1 ring-white">{senderInitials(message)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-sm ${message.is_read ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}>{message.sender_name || message.sender_email}</span>
                    {thread.length > 1 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{thread.length}</span>}
                    {message.has_attachments && <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-400" />}
                    {message.labels.map((label) => <span key={label} className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[9px] text-brand-700">{label}</span>)}
                    <time className="ml-auto shrink-0 text-[10px] text-slate-400">{new Date(message.received_at).toLocaleDateString()}</time>
                  </div>
                  <p className={`mt-1 truncate text-[13px] ${message.is_read ? 'text-slate-600' : 'font-semibold text-slate-800'}`}>{message.subject || '(no subject)'}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{message.snippet || message.body_text}</p>
                </div>
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); void toggleStar(message); }} aria-label={message.is_starred ? 'Unstar email' : 'Star email'} className="rounded-lg p-2 text-slate-300 opacity-60 transition group-hover:opacity-100 hover:bg-brand-50 hover:text-brand-500">
                <Star className={`h-4 w-4 ${message.is_starred ? 'fill-brand-400 text-brand-500' : ''}`} />
              </button>
            </div>
              ))}
            </>
          )}
        </div>
      </section>

      {!selectedMessage && (
        <section className="hidden min-w-0 flex-1 flex-col bg-white/45 lg:flex print:hidden lg:w-[65%]">
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="text-center">
              <Mail className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">There is nothing to see here.</p>
              <button type="button" onClick={openNewCompose} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
                <Plus className="h-4 w-4" />
                Write an email
              </button>
            </div>
          </div>
        </section>
      )}

      {selectedMessage && (
        <section id="email-print-content" className="flex min-w-0 flex-1 flex-col bg-white print:border-0 lg:w-[66%]">
          <style>{`@media print { body * { visibility: hidden !important; } #email-print-content, #email-print-content * { visibility: visible !important; } #email-print-content { position: absolute; inset: 0; width: 100%; height: auto; overflow: visible !important; } }`}</style>
          <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white/90 px-5 py-3 print:hidden">
            <button type="button" onClick={() => setSelectedMessage(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 xl:hidden" aria-label="Back to list"><ArrowLeft className="h-4 w-4" /></button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">Conversation</p>
              <h2 className="truncate text-base font-bold text-slate-900">{selectedMessage.subject || '(no subject)'}</h2>
            </div>
            {selectedThreadMessages.length > 1 && <span className="text-xs text-slate-500">{selectedThreadMessages.length} messages in thread</span>}
            <button type="button" onClick={() => window.print()} title="Print conversation" aria-label="Print conversation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Printer className="h-4 w-4" /></button>
            <button type="button" onClick={() => void toggleStar(selectedMessage)} title={selectedMessage.is_starred ? 'Unstar' : 'Star'} aria-label={selectedMessage.is_starred ? 'Unstar email' : 'Star email'} className="rounded-lg p-2 text-slate-500 hover:bg-brand-50 hover:text-brand-600">
              <Star className={`h-4 w-4 ${selectedMessage.is_starred ? 'fill-brand-400 text-brand-500' : ''}`} />
            </button>
            <button type="button" onClick={() => void archiveMessage(selectedMessage)} title="Archive" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Archive className="h-4 w-4" /></button>
            <button type="button" onClick={() => void toggleRead(selectedMessage)} title={selectedMessage.is_read ? 'Mark unread' : 'Mark read'} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">{selectedMessage.is_read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}</button>
            <button type="button" title="More actions" aria-label="More actions" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button>
            <button type="button" onClick={() => setSelectedMessage(null)} title="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-8 print:overflow-visible print:bg-white print:p-0">
            {selectedThreadMessages.map((threadMessage) => {
            const expanded = expandedThreadMessageIds.has(threadMessage.id);
            return (
            <article key={threadMessage.id} className={`mx-auto mb-3 w-full max-w-6xl rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.04)] sm:p-6 print:break-inside-avoid print:border-0 print:shadow-none ${expanded ? '' : 'cursor-pointer'}`}>
              <button type="button" onClick={() => setExpandedThreadMessageIds((current) => {
                const next = new Set(current);
                if (next.has(threadMessage.id)) next.delete(threadMessage.id);
                else next.add(threadMessage.id);
                return next;
              })} className="flex w-full items-center justify-between gap-4 text-left">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-100 text-xs font-bold text-brand-700">{senderInitials(threadMessage)}</div>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-bold leading-5 text-slate-900">{threadMessage.sender_name || threadMessage.sender_email}</h1>
                  <p className="truncate text-xs text-slate-500">{threadMessage.subject || '(no subject)'}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <time className="hidden text-right text-[11px] text-slate-400 sm:block" dateTime={threadMessage.received_at}>{new Date(threadMessage.received_at).toLocaleString()}</time>
                {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
              </div>
              </button>
              {expanded && <div className="mt-4">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-slate-500">{threadMessage.sender_email}</p>
                  </div>
                </div>
                <button type="button" title="Message actions" aria-label="Message actions" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button>
              </div>
              <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
                <div className="min-w-0 flex-1">
                  <p className="mt-2 break-words text-xs text-slate-500">
                    To {threadMessage.to_recipients?.map((recipient) => recipient.name || recipient.email).join(', ') || activeMailbox?.email}
                  </p>
                  {threadMessage.cc_recipients?.length > 0 && (
                    <p className="mt-1 break-words text-xs text-slate-500">
                      Cc {threadMessage.cc_recipients.map((recipient) => recipient.name || recipient.email).join(', ')}
                    </p>
                  )}
                </div>
                <time className="shrink-0 text-right text-[11px] text-slate-400" dateTime={threadMessage.received_at}>
                  {new Date(threadMessage.received_at).toLocaleString()}
                </time>
              </div>
              {threadMessage.body_html ? (
                <EmailHtmlBody html={threadMessage.body_html} />
              ) : (
                <div className="mt-6 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                  {threadMessage.body_text || threadMessage.snippet || 'This email has no readable text content.'}
                </div>
              )}
              {threadMessage.has_attachments && (
                <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                  This message has attachments. Open it in Microsoft 365 to download them.
                </div>
              )}
              </div>}
            </article>
            );
            })}
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="mx-auto mt-5 max-w-4xl rounded-xl border border-brand-100 bg-brand-50/70 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-800"><Sparkles className="h-3.5 w-3.5" /> Saved AI {artifact.artifact_type === 'summary' ? 'summary' : 'draft'}</p>
                <p className="whitespace-pre-wrap text-xs leading-5 text-brand-900">{artifact.content}</p>
                {artifact.artifact_type === 'draft' && (
                  <button type="button" onClick={() => prepareInlineReply(artifact.content)} className="mt-3 text-xs font-semibold text-brand-800 underline">
                    Use this draft
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 p-3 print:hidden">
            <form onSubmit={(event) => void sendInlineReply(event)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div
                ref={inlineReplyEditorRef}
                contentEditable
                role="textbox"
                aria-label="Reply message"
                aria-multiline="true"
                onInput={(event) => setInlineReplyBody(event.currentTarget.innerHTML)}
                data-placeholder="Write a reply…"
                className="min-h-10 flex-1 px-1 py-2 text-sm leading-6 text-slate-800 outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] focus:ring-2 focus:ring-brand-500/10"
              />
              <button type="submit" aria-label="Send reply" disabled={!inlineReplyBody.replace(/<[^>]*>/g, '').trim() || inlineReplySending} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                {inlineReplySending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </form>
          </div>
        </section>
      )}

      {channelForwardOpen && selectedMessage && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="forward-channel-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="forward-channel-title" className="text-sm font-bold text-slate-900">Forward email to a channel</h3>
                <p className="mt-1 text-xs text-slate-500">The full message and its attachments will be posted for channel members.</p>
              </div>
              <button type="button" onClick={() => setChannelForwardOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Channel</span>
              <select value={forwardChannelId} onChange={(event) => setForwardChannelId(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500">
                <option value="">Choose a channel</option>
                {forwardableChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
              </select>
            </label>
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs leading-5 text-brand-800">
              Channel members may see this email and any attached files. Check the channel before sharing confidential content.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setChannelForwardOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={!forwardChannelId || forwardBusy} onClick={() => void shareEmailToChannel()} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {forwardBusy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                Share email
              </button>
            </div>
          </section>
        </div>
      )}

      {composeOpen && activeMailbox && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={(event) => void submitMessage(event)} className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">{replyMode ? 'Continue conversation' : 'New message'}</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{replyMode ? 'Reply to email' : 'Compose email'}</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">Sending from {activeMailbox.email} · Drafts save automatically</p>
              </div>
              <button type="button" onClick={() => { void saveDraft(); setComposeOpen(false); setReplyMode(false); setComposeAttachments([]); }} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                {draftSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            </div>
            <div className="max-h-[72vh] space-y-3 overflow-y-auto p-6">
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
              <div className="flex flex-wrap items-center gap-1 rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 p-2">
                {[
                  { label: 'Bold', command: 'bold', Icon: Bold },
                  { label: 'Italic', command: 'italic', Icon: Italic },
                  { label: 'Underline', command: 'underline', Icon: Underline },
                  { label: 'Bulleted list', command: 'insertUnorderedList', Icon: List },
                  { label: 'Numbered list', command: 'insertOrderedList', Icon: ListOrdered },
                ].map(({ label, command, Icon }) => (
                  <button key={command} type="button" onClick={() => formatComposeBody(command)} title={label} aria-label={label} className="rounded-md p-2 text-slate-600 hover:bg-white hover:text-brand-700">
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
                <button type="button" onClick={insertComposeLink} title="Insert link" aria-label="Insert link" className="rounded-md p-2 text-slate-600 hover:bg-white hover:text-brand-700"><Link2 className="h-4 w-4" /></button>
                <span className="mx-1 h-5 border-l border-slate-200" />
                <select value={selectedTemplateId} onChange={(event) => applyTemplate(event.target.value)} aria-label="Use an email template" className="max-w-48 rounded-md border-0 bg-transparent px-2 py-1.5 text-xs text-slate-600 outline-none focus:bg-white">
                  <option value="">Use a template…</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.is_shared ? 'Shared · ' : ''}{template.name}</option>)}
                </select>
              </div>
              <div
                ref={editorRef}
                contentEditable
                role="textbox"
                aria-label="Message body"
                aria-multiline="true"
                onInput={(event) => setComposeBody(event.currentTarget.innerHTML)}
                className="min-h-56 w-full rounded-b-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-800 outline-none focus:border-brand-500 [&_a]:text-brand-700 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
                data-placeholder="Write your message…"
              />
              {!replyMode && (
                <div className="flex flex-wrap items-center gap-2">
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
                  <span className="text-[11px] text-slate-400">Up to 10 files, 3 MB total</span>
                </div>
              )}
              {(composeAttachments.length + composeProviderAttachments.length > 0) && (
                <ul className="space-y-2">
                  {composeProviderAttachments.map((attachment, index) => (
                    <li key={`provider-${attachment.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                      <button type="button" onClick={() => setComposeProviderAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${attachment.name}`} className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                  {composeAttachments.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => setComposeAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`} className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              {activeMailbox.provider === 'microsoft' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Send later (your local time)</span>
                  <input type="datetime-local" value={composeScheduledAt} min={localDateTimeValue(new Date(Date.now() + 60_000))} onChange={(event) => setComposeScheduledAt(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500" />
                </label>
              )}
              <div className="border-t border-slate-100 pt-3">
                  {showTemplateSave ? (
                    <form onSubmit={(event) => void saveEmailTemplate(event)} className="flex flex-wrap items-center gap-2">
                      <input autoFocus required value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" className="min-w-40 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500" />
                      {currentUser.systemRole === 'admin' && <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={shareTemplate} onChange={(event) => setShareTemplate(event.target.checked)} /> Share with workspace</label>}
                      <button type="submit" disabled={savingTemplate} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{savingTemplate ? 'Saving…' : 'Save template'}</button>
                      <button type="button" onClick={() => { setShowTemplateSave(false); setTemplateName(''); }} className="rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-100">Cancel</button>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setShowTemplateSave(true)} className="text-xs font-semibold text-brand-700 hover:underline">Save as template</button>
                  )}
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-100 p-4">
              <button type="submit" disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? (composeScheduledAt ? 'Scheduling…' : 'Sending…') : (composeScheduledAt ? 'Schedule send' : 'Send')}
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
