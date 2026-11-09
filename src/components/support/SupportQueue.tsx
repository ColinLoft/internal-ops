import { CustomSelect } from '../common/CustomSelect';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Mail, MessageSquare, Paperclip, Search, Send, UserRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppAccess } from '../../lib/useAppAccess';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { userFacingError } from '../../lib/userFacingError';
import { sendSupportReply } from './supportApi';

type Status = 'open' | 'pending' | 'resolved';
type QueueFilter = 'unassigned' | 'mine' | 'open' | 'pending' | 'resolved' | 'all';
type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  notes: string | null;
  crm_contact_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
};
type Conversation = {
  id: string;
  customer_id: string;
  subject: string;
  status: Status;
  channel: 'web' | 'email' | 'manual';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignee_id: string | null;
  unread_staff: number;
  last_message_at: string;
  last_message_preview: string | null;
  ticket_id: string | null;
};
type AttachmentInfo = { filename?: string; content_type?: string; size?: number };
type Message = {
  id: string;
  sender_type: 'customer' | 'agent' | 'note' | 'system';
  sender_id: string | null;
  channel: string;
  body: string;
  created_at: string;
  email_attachments: AttachmentInfo[] | null;
};
type Account = { name: string; website: string | null; category: string } | null;

const conversationsSelect = 'id,customer_id,subject,status,channel,priority,assignee_id,unread_staff,last_message_at,last_message_preview,ticket_id';
const messageSelect = 'id,sender_type,sender_id,channel,body,created_at,email_attachments';
const inputClass = 'min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-300/50';
const dateTime = (value: string) => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const elapsed = (value: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
};
const initials = (value: string) => value.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

const filters: { id: QueueFilter; label: string }[] = [
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'mine', label: 'Mine' },
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Waiting' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
];

export const SupportQueue: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const { canEdit: canManage } = useAppAccess('support');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [account, setAccount] = useState<Account>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('conversation'));
  const [legacyTicketId] = useState(() => new URLSearchParams(window.location.search).get('ticket'));
  const [filter, setFilter] = useState<QueueFilter>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('conversation') || params.has('ticket') ? 'all' : 'unassigned';
  });
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);

  const selected = conversations.find((item) => item.id === selectedId) ?? null;
  const customer = selected ? customers[selected.customer_id] : null;
  const agents = users.filter((user) => user.systemRole === 'admin' || user.systemRole === 'coordinator');

  const loadConversations = useCallback(async () => {
    try {
      const allRows: Conversation[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: loadError } = await supabase
          .from('support_conversations')
          .select(conversationsSelect)
          .order('last_message_at', { ascending: false })
          .order('id')
          .range(offset, offset + 999);
        if (loadError) throw loadError;
        const rows = (data ?? []) as Conversation[];
        allRows.push(...rows);
        if (rows.length < 1000) break;
      }
      setConversations(allRows);
      const ids = [...new Set(allRows.map((row) => row.customer_id))];
      if (ids.length) {
        const { data: people, error: customerError } = await supabase
          .from('support_customers')
          .select('id,name,email,phone,organization,notes,crm_contact_id,first_seen_at,last_seen_at')
          .in('id', ids);
        if (customerError) throw customerError;
        setCustomers(Object.fromEntries(((people ?? []) as Customer[]).map((person) => [person.id, person])));
      }
      setError('');
    } catch (cause) {
      setError(userFacingError(cause, 'Support requests could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error: messageError } = await supabase
      .from('support_messages')
      .select(messageSelect)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .order('id')
      .limit(1000);
    if (messageError) {
      setError(userFacingError(messageError, 'This conversation could not be loaded.'));
      return;
    }
    setMessages((data ?? []) as Message[]);
  }, []);

  useLiveRefresh(loadConversations, ['support_conversations', 'support_messages']);
  useEffect(() => {
    const timer = window.setInterval(() => void loadConversations(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (selectedId || !legacyTicketId) return;
    const linked = conversations.find((conversation) => conversation.ticket_id === legacyTicketId);
    if (linked) setSelectedId(linked.id);
  }, [conversations, legacyTicketId, selectedId]);

  useEffect(() => {
    setMessages([]);
    if (!selectedId) return;
    let active = true;
    const refresh = async () => {
      const { data, error: messageError } = await supabase
        .from('support_messages')
        .select(messageSelect)
        .eq('conversation_id', selectedId)
        .order('created_at', { ascending: true })
        .order('id')
        .limit(1000);
      if (!active) return;
      if (messageError) setError(userFacingError(messageError, 'This conversation could not be loaded.'));
      else setMessages((data ?? []) as Message[]);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  useEffect(() => {
    setAccount(null);
    if (!customer?.crm_contact_id) return;
    let active = true;
    void (async () => {
      const { data: contact } = await supabase.from('crm_contacts')
        .select('organization_id')
        .eq('id', customer.crm_contact_id)
        .maybeSingle();
      if (!active || !contact?.organization_id) return;
      const { data: organization } = await supabase.from('crm_organizations')
        .select('name,website,category')
        .eq('id', contact.organization_id)
        .maybeSingle();
      if (active && organization) setAccount(organization as Account);
    })();
    return () => { active = false; };
  }, [customer?.crm_contact_id]);

  useEffect(() => {
    if (!selected || !selected.unread_staff || !canManage) return;
    setConversations((rows) => rows.map((row) => row.id === selected.id ? { ...row, unread_staff: 0 } : row));
    void supabase.from('support_conversations').update({ unread_staff: 0 }).eq('id', selected.id);
  }, [selected?.id, selected?.unread_staff, canManage]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const person = customers[conversation.customer_id];
      const active = conversation.status !== 'resolved';
      if (filter === 'unassigned' && (!active || conversation.assignee_id)) return false;
      if (filter === 'mine' && (!active || conversation.assignee_id !== currentUser.id)) return false;
      if (filter === 'open' && conversation.status !== 'open') return false;
      if (filter === 'pending' && conversation.status !== 'pending') return false;
      if (filter === 'resolved' && conversation.status !== 'resolved') return false;
      if (!needle) return true;
      return `${conversation.subject} ${person?.name ?? ''} ${person?.email ?? ''} ${conversation.last_message_preview ?? ''}`.toLowerCase().includes(needle);
    });
  }, [conversations, customers, currentUser.id, filter, query]);

  const assigneeName = (id: string | null) => users.find((user) => user.id === id)?.name ?? 'Unassigned';

  const updateConversation = async (patch: Partial<Pick<Conversation, 'status' | 'assignee_id'>>) => {
    if (!selected || !canManage) return;
    setUpdating(true);
    setError('');
    const claim = patch.assignee_id === currentUser.id && selected.assignee_id === null;
    const updateQuery = supabase.from('support_conversations').update(patch).eq('id', selected.id);
    const { data: updated, error: updateError } = await (claim ? updateQuery.is('assignee_id', null) : updateQuery)
      .select('id')
      .maybeSingle();
    setUpdating(false);
    if (updateError || !updated) {
      if (claim && !updateError) {
        setError('Another teammate claimed this request first. Refresh the queue to see who has it.');
        void loadConversations();
        return;
      }
      setError(userFacingError(updateError, 'The request could not be updated.'));
      return;
    }
    setConversations((rows) => rows.map((row) => row.id === selected.id ? { ...row, ...patch } : row));
  };

  const reply = async () => {
    if (!selected || !customer?.email || !draft.trim() || sending || !canManage) return;
    setSending(true);
    setError('');
    try {
      await sendSupportReply({
        conversationId: selected.id,
        body: draft.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      setDraft('');
      await Promise.all([loadMessages(selected.id), loadConversations()]);
    } catch (cause) {
      setError(userFacingError(cause, 'The email could not be confirmed as sent. Check the conversation before retrying.'));
    } finally {
      setSending(false);
    }
  };

  const selectConversation = (id: string | null) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('conversation', id);
      url.searchParams.delete('ticket');
    } else {
      url.searchParams.delete('conversation');
      url.searchParams.delete('ticket');
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#f7f9fc] text-slate-900">
      <header className="workspace-page-header flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white">
        <h1 className="text-xl font-semibold">Support</h1>
        <p className="text-sm text-slate-600">{conversations.length} {conversations.length === 1 ? 'request' : 'requests'}</p>
      </header>

      {error && <div role="alert" className="mx-4 mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 sm:mx-6">{error}</div>}

      <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(245px,290px)_minmax(360px,1fr)_250px]">
        <aside className={`${selected ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-slate-200 bg-white`}>
          <div className="space-y-3 border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests" aria-label="Search support requests" className={`${inputClass} pl-9`} />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {filters.map((item) => (
                <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`min-h-9 shrink-0 rounded-md px-2.5 text-xs font-medium ${filter === item.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                  {item.label}{item.id === 'unassigned' && <span className="ml-1 tabular-nums">{conversations.filter((row) => !row.assignee_id && row.status !== 'resolved').length}</span>}
                </button>
              ))}
            </div>
          </div>
          {loading && <div aria-label="Loading support requests" className="space-y-4 p-4"><div className="h-4 w-2/3 rounded bg-slate-200" /><div className="h-3 w-full rounded bg-slate-200" /><div className="h-4 w-1/2 rounded bg-slate-200" /></div>}
          {!loading && visible.length === 0 && <p className="p-5 text-sm text-slate-600">{filter === 'unassigned' ? 'No unassigned requests.' : 'No requests match this view.'}</p>}
          <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
            {visible.map((conversation) => {
              const person = customers[conversation.customer_id];
              return (
                <li key={conversation.id}>
                  <button type="button" onClick={() => selectConversation(conversation.id)} className={`w-full px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-600 ${conversation.id === selectedId ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{conversation.subject}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-600">{elapsed(conversation.last_message_at)}</span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-700">
                      <span className="truncate">{person?.name ?? 'Customer'}</span>
                      {conversation.unread_staff > 0 && <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white">{conversation.unread_staff}</span>}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600">
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        {conversation.channel === 'email' ? <Mail className="h-3.5 w-3.5 shrink-0" /> : <MessageSquare className="h-3.5 w-3.5 shrink-0" />}
                        {conversation.last_message_preview || (conversation.channel === 'email' ? 'Email request' : 'Customer request')}
                      </span>
                      <span className="shrink-0">{conversation.assignee_id ? assigneeName(conversation.assignee_id) : 'Unassigned'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col overflow-y-auto bg-white lg:overflow-hidden`}>
          {!selected || !customer ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-600">Choose a request to read and reply.</div>
          ) : (
            <>
              <header className="flex min-h-[64px] shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
                <button type="button" onClick={() => selectConversation(null)} className="flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Back to requests"><ArrowLeft className="h-5 w-5" /></button>
                <div className="min-w-0 basis-[calc(100%-3rem)] flex-1 sm:basis-0">
                  <h2 className="truncate text-base font-semibold">{selected.subject}</h2>
                  <p className="truncate text-sm text-slate-700">{customer.name} {customer.email && <span className="text-slate-600">· {customer.email}</span>}</p>
                </div>
                <span className="hidden text-xs text-slate-600 sm:inline">{selected.channel === 'email' ? 'Email' : selected.channel === 'web' ? 'Website' : 'Internal ticket'}</span>
                <div className="w-36 shrink-0"><CustomSelect
                  aria-label="Request status"
                  disabled={!canManage || updating}
                  value={selected.status}
                  onChange={(event) => void updateConversation({ status: event.target.value as Status })}
                  className="workspace-control rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="open">Open</option>
                  <option value="pending">Waiting</option>
                  <option value="resolved">Resolved</option>
                </CustomSelect></div>
                {canManage && !selected.assignee_id && <button type="button" disabled={updating} onClick={() => void updateConversation({ assignee_id: currentUser.id })} className="workspace-control rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 lg:hidden">Claim request</button>}
              </header>

              {selected.ticket_id && <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700">Imported from a legacy support ticket; its original record remains available.</p>}

              <ol className="min-h-48 shrink-0 space-y-4 px-4 py-5 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {messages.map((message) => {
                  const internal = message.sender_type === 'note' || message.sender_type === 'system';
                  const outbound = message.sender_type === 'agent';
                  const author = message.sender_id ? assigneeName(message.sender_id) : outbound ? 'Flown Support' : customer.name;
                  return (
                    <li key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                      <article className={`max-w-[88%] rounded-lg border px-3.5 py-3 sm:max-w-[75%] ${internal ? 'border-amber-200 bg-amber-50 text-amber-950' : outbound ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
                        <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-medium">
                          <span>{internal ? `Internal note · ${author}` : author}</span>
                          <time className={outbound ? 'text-slate-300' : 'text-slate-600'} dateTime={message.created_at}>{dateTime(message.created_at)}</time>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                        {!!message.email_attachments?.length && (
                          <>
                            <ul className={`mt-2 space-y-1 border-t pt-2 text-xs ${outbound ? 'border-slate-600 text-slate-200' : 'border-slate-200 text-slate-700'}`}>
                              {message.email_attachments.map((attachment, index) => <li key={`${attachment.filename}-${index}`} className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" />{attachment.filename || 'Email attachment'}{attachment.size ? ` · ${Math.ceil(attachment.size / 1024)} KB` : ''}</li>)}
                            </ul>
                            <p className={`mt-1 text-xs ${outbound ? 'text-slate-200' : 'text-slate-700'}`}>Attachment files are not stored in Support.</p>
                          </>
                        )}
                        <p className={`mt-2 flex items-center gap-1 text-xs ${outbound ? 'text-slate-300' : 'text-slate-600'}`}>
                          {message.channel === 'email' ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                          {internal ? 'Private to the team' : outbound ? message.channel === 'email' ? 'Email reply from team@flown.org' : 'Team reply' : message.channel === 'email' ? 'Received by email' : message.channel === 'web' ? 'Received from website' : 'Legacy ticket message'}
                        </p>
                      </article>
                    </li>
                  );
                })}
                {!messages.length && <li className="py-8 text-center text-sm text-slate-600">No messages in this request.</li>}
              </ol>

              {canManage && (
                <footer className="shrink-0 border-t border-slate-200 bg-white p-4">
                  {error && <p role="alert" className="mb-2 text-sm text-rose-800">{error}</p>}
                  {!customer.email ? (
                    <p className="text-sm text-slate-700">This contact has no email address. Add an email before replying.</p>
                  ) : (
                    <>
                      <label htmlFor="support-reply" className="mb-1.5 block text-sm font-medium text-slate-800">Email reply to {customer.email}</label>
                      <textarea
                        id="support-reply"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void reply(); }}
                        maxLength={10_000}
                        rows={3}
                        placeholder="Write your reply…"
                        className={`${inputClass} resize-y`}
                      />
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-600">Sent from team@flown.org</span>
                        <button type="button" disabled={!draft.trim() || sending} onClick={() => void reply()} className="flex min-h-10 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                          <Send className="h-4 w-4" />{sending ? 'Sending…' : 'Send reply'}
                        </button>
                      </div>
                    </>
                  )}
                </footer>
              )}
              <details className="shrink-0 border-t border-slate-200 bg-slate-50 p-4 lg:hidden">
                <summary className="cursor-pointer text-sm font-medium">Contact & assignment</summary>
                <div className="mt-4 space-y-4"><CustomerDetails customer={customer} account={account} /><Assignment selected={selected} agents={agents} canManage={canManage} updating={updating} currentUserId={currentUser.id} onUpdate={updateConversation} assigneeName={assigneeName} /></div>
              </details>
            </>
          )}
        </section>

        <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto border-l border-slate-200 bg-white p-4 lg:flex">
          {selected && customer ? (
            <>
              <CustomerDetails customer={customer} account={account} />
              <Assignment selected={selected} agents={agents} canManage={canManage} updating={updating} currentUserId={currentUser.id} onUpdate={updateConversation} assigneeName={assigneeName} />
            </>
          ) : <p className="text-sm text-slate-600">Contact and account details appear here.</p>}
        </aside>
      </section>
    </main>
  );
};

const CustomerDetails: React.FC<{ customer: Customer; account: Account }> = ({ customer, account }) => (
  <section className="space-y-3">
    <h3 className="text-sm font-semibold">Contact</h3>
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-800">{initials(customer.name)}</span>
      <span className="min-w-0 truncate text-sm font-medium">{customer.name}</span>
    </div>
    <dl className="space-y-2 text-sm">
      <div><dt className="text-xs text-slate-600">Email</dt><dd className="break-all">{customer.email ? <a className="underline decoration-slate-300 underline-offset-2" href={`mailto:${customer.email}`}>{customer.email}</a> : '—'}</dd></div>
      <div><dt className="text-xs text-slate-600">Phone</dt><dd>{customer.phone ? <a className="underline decoration-slate-300 underline-offset-2" href={`tel:${customer.phone}`}>{customer.phone}</a> : '—'}</dd></div>
      <div><dt className="text-xs text-slate-600">First contact</dt><dd>{customer.first_seen_at ? new Date(customer.first_seen_at).toLocaleDateString() : '—'}</dd></div>
    </dl>
    <div className="border-t border-slate-200 pt-3">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4" />Account</h4>
      <p className="text-sm">{account?.name || customer.organization || 'No account linked'}</p>
      {account?.category && <p className="mt-1 text-xs capitalize text-slate-700">{account.category}</p>}
      {account?.website && <a className="mt-1 block break-all text-sm underline decoration-slate-300 underline-offset-2" href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noreferrer">{account.website}</a>}
      {customer.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{customer.notes}</p>}
    </div>
  </section>
);

const Assignment: React.FC<{
  selected: Conversation;
  agents: { id: string; name: string }[];
  canManage: boolean;
  updating: boolean;
  currentUserId: string;
  onUpdate: (patch: Partial<Pick<Conversation, 'status' | 'assignee_id'>>) => Promise<void>;
  assigneeName: (id: string | null) => string;
}> = ({ selected, agents, canManage, updating, currentUserId, onUpdate, assigneeName }) => (
  <section className="space-y-2 border-t border-slate-200 pt-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4" />Assigned to</h3>
    <p className="text-sm text-slate-700">{assigneeName(selected.assignee_id)}</p>
    {canManage && !selected.assignee_id && <button type="button" disabled={updating} onClick={() => void onUpdate({ assignee_id: currentUserId })} className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50">Claim request</button>}
    {canManage && (
      <label className="block text-xs text-slate-700">
        Assign or reassign
        <CustomSelect disabled={updating} value={selected.assignee_id ?? ''} onChange={(event) => void onUpdate({ assignee_id: event.target.value || null })} aria-label="Assign or reassign request" className={`${inputClass} mt-1`}>
          <option value="">Unassigned</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </CustomSelect>
      </label>
    )}
  </section>
);
