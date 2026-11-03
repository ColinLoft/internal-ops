import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Headset, Mail, MessageSquare, Plus, Search, Send, Sparkles, StickyNote, X, Wand2, Clock3, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppAccess } from '../../lib/useAppAccess';

type Status = 'open' | 'pending' | 'resolved';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type Customer = { id: string; name: string; email: string | null; phone: string | null; organization: string | null; notes: string | null; first_seen_at: string; last_seen_at: string };
type Conversation = {
  id: string; customer_id: string; subject: string; status: Status; channel: 'web' | 'email' | 'manual'; priority: Priority;
  assignee_id: string | null; summary: string | null; public_token: string; unread_staff: number; last_message_at: string;
  last_message_preview: string | null; created_at: string;
};
type Message = { id: string; conversation_id: string; sender_type: 'customer' | 'agent' | 'note' | 'system'; sender_id: string | null; channel: string; body: string; created_at: string };
type EmailRef = { id: string; subject: string | null; sender_name: string | null; sender_email: string | null; received_at: string | null };
type Summary = { status: string; bullets: string[]; suggested_priority: string };

const conversationColumns = 'id,customer_id,subject,status,channel,priority,assignee_id,summary,public_token,unread_staff,last_message_at,last_message_preview,created_at';
const statusStyle: Record<Status, string> = {
  open: 'bg-emerald-50 text-emerald-700', pending: 'bg-amber-50 text-amber-700', resolved: 'bg-slate-100 text-slate-600',
};
const priorityStyle: Record<Priority, string> = {
  low: 'text-slate-500', normal: 'text-slate-600', high: 'text-amber-600', urgent: 'text-rose-600',
};
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
const relTime = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
};
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const parseSummary = (raw: string | null): Summary | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as Summary; } catch { return { status: 'active', bullets: [raw], suggested_priority: 'normal' }; }
};
const notifyChanged = () => window.dispatchEvent(new Event('flown-support-changed'));

export const SupportInbox: React.FC = () => {
  const { currentUser, users, requestEmailCompose, workspaceSettings } = useWorkspace();
  const { canEdit: isAgent } = useAppAccess('support');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [emails, setEmails] = useState<EmailRef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Status>('open');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'chat' | 'email' | 'note'>('chat');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', email: '', subject: '', message: '' });
  const bottomRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((item) => item.id === selectedId) ?? null;
  const customer = selected ? customers[selected.customer_id] : undefined;
  const summary = parseSummary(selected?.summary ?? null);

  const loadConversations = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('support_conversations').select(conversationColumns).order('last_message_at', { ascending: false }).limit(300);
    if (loadError) { setError(loadError.message); setLoading(false); return; }
    const rows = (data ?? []) as Conversation[];
    setConversations(rows);
    const ids = Array.from(new Set(rows.map((row) => row.customer_id)));
    if (ids.length) {
      const { data: people } = await supabase.from('support_customers').select('id,name,email,phone,organization,notes,first_seen_at,last_seen_at').in('id', ids);
      setCustomers(Object.fromEntries(((people ?? []) as Customer[]).map((person) => [person.id, person])));
    }
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase.from('support_messages').select('id,conversation_id,sender_type,sender_id,channel,body,created_at').eq('conversation_id', conversationId).order('created_at').limit(500);
    setMessages((data ?? []) as Message[]);
  }, []);

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(loadConversations, 8000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId), 4000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, selectedId]);

  // Opening a conversation clears its unread counter.
  useEffect(() => {
    if (!selected || selected.unread_staff === 0) return;
    void supabase.from('support_conversations').update({ unread_staff: 0 }).eq('id', selected.id).then(() => {
      setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, unread_staff: 0 } : item));
      notifyChanged();
    });
  }, [selected]);

  useEffect(() => {
    const address = customer?.email;
    if (!address || !/^[^\s@,"]+@[^\s@,"]+$/.test(address)) { setEmails([]); return; }
    void supabase.from('email_messages').select('id,subject,sender_name,sender_email,received_at')
      .or(`sender_email.ilike.${address},to_recipients.cs.[{"email":"${address}"}]`).order('received_at', { ascending: false }).limit(10)
      .then(({ data }) => setEmails((data ?? []) as EmailRef[]));
  }, [customer?.email]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!needle) return true;
      return `${item.subject} ${customers[item.customer_id]?.name ?? ''} ${customers[item.customer_id]?.email ?? ''} ${item.last_message_preview ?? ''}`.toLowerCase().includes(needle);
    });
  }, [conversations, customers, filter, query]);

  const patchConversation = async (patch: Partial<Conversation>) => {
    if (!selected) return;
    setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
    const { error: updateError } = await supabase.from('support_conversations').update(patch).eq('id', selected.id);
    if (updateError) setError(updateError.message);
  };

  const patchCustomer = async (patch: Partial<Customer>) => {
    if (!customer) return;
    setCustomers((current) => ({ ...current, [customer.id]: { ...customer, ...patch } }));
    const { error: updateError } = await supabase.from('support_customers').update(patch).eq('id', customer.id);
    if (updateError) setError(updateError.message);
  };

  const sendReply = async () => {
    const body = draft.trim();
    if (!body || !selected || !customer) return;
    setBusy('send');
    setError('');
    try {
      if (mode === 'email') {
        if (!customer.email) throw new Error('This customer has no email address.');
        const { data: mailbox } = await supabase.from('email_mailboxes').select('id').limit(1).maybeSingle();
        if (!mailbox) throw new Error('Connect a mailbox in Email before sending email replies.');
        const { error: mailError } = await supabase.functions.invoke('mail-api', {
          body: { action: 'send', mailboxId: mailbox.id, to: customer.email, subject: `Re: ${selected.subject}`, body },
        });
        if (mailError) throw new Error(mailError.message || 'Email could not be sent.');
      }
      const { error: insertError } = await supabase.from('support_messages').insert({
        conversation_id: selected.id,
        sender_type: mode === 'note' ? 'note' : 'agent',
        sender_id: currentUser.id,
        channel: mode === 'email' ? 'email' : 'web',
        body,
      });
      if (insertError) throw new Error(insertError.message);
      if (mode !== 'note' && selected.status !== 'pending') await patchConversation({ status: 'pending' });
      setDraft('');
      await Promise.all([loadMessages(selected.id), loadConversations()]);
      notifyChanged();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Reply failed.');
    } finally {
      setBusy('');
    }
  };

  const runAi = async (action: 'suggest' | 'summarize') => {
    if (!selected) return;
    setBusy(action);
    setError('');
    const { data, error: aiError } = await supabase.functions.invoke('support-ai', { body: { action, conversationId: selected.id } });
    if (aiError || data?.error) setError(String(data?.error || aiError?.message || 'AI request failed.'));
    else if (action === 'suggest') { setDraft(String(data.text || '')); if (mode === 'note') setMode('chat'); }
    else await loadConversations();
    setBusy('');
  };

  const createConversation = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('create');
    setError('');
    try {
      const email = newForm.email.trim().toLowerCase();
      let customerId: string | undefined;
      if (email) {
        const { data: existing } = await supabase.from('support_customers').select('id').ilike('email', email).maybeSingle();
        customerId = existing?.id;
      }
      if (!customerId) {
        const { data: created, error: customerError } = await supabase.from('support_customers').insert({ name: newForm.name.trim(), email: email || null }).select('id').single();
        if (customerError) throw new Error(customerError.message);
        customerId = created.id;
      }
      const { data: conversation, error: conversationError } = await supabase.from('support_conversations')
        .insert({ customer_id: customerId, subject: newForm.subject.trim() || 'New conversation', channel: email ? 'email' : 'manual', assignee_id: currentUser.id })
        .select('id').single();
      if (conversationError) throw new Error(conversationError.message);
      if (newForm.message.trim()) {
        await supabase.from('support_messages').insert({ conversation_id: conversation.id, sender_type: 'customer', channel: email ? 'email' : 'manual', body: newForm.message.trim() });
      }
      setShowNew(false);
      setNewForm({ name: '', email: '', subject: '', message: '' });
      await loadConversations();
      setSelectedId(conversation.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create the conversation.');
    } finally {
      setBusy('');
    }
  };

  const assigneeName = (id: string | null) => users.find((user) => user.id === id)?.name ?? 'Unassigned';
  const agents = users.filter((user) => user.systemRole === 'admin' || user.systemRole === 'coordinator');

  const timeline = useMemo(() => [
    ...messages.map((item) => ({ id: item.id, at: item.created_at, text: item.sender_type === 'customer' ? 'Customer wrote' : item.sender_type === 'note' ? 'Internal note added' : item.channel === 'email' ? 'Email reply sent' : 'Chat reply sent', body: item.body })),
    ...emails.map((item) => ({ id: `mail-${item.id}`, at: item.received_at ?? '', text: `Email: ${item.subject || '(no subject)'}`, body: item.sender_name || item.sender_email || '' })),
  ].filter((item) => item.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14), [messages, emails]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-white/40">
      {/* Conversation list */}
      <section className={`${selected ? 'hidden lg:flex' : 'flex'} w-full flex-col border-r border-slate-200 bg-white/70 lg:w-72 lg:shrink-0`}>
        <div className="space-y-2 border-b border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Customer messages</h2>
            {isAgent && <button type="button" onClick={() => setShowNew(true)} className="flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700"><Plus className="h-3.5 w-3.5" />New</button>}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" aria-label="Search conversations" className={`${inputClass} pl-8`} />
          </div>
          <div className="flex gap-1">
            {(['open', 'pending', 'resolved', 'all'] as const).map((value) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${filter === value ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{value}</button>
            ))}
          </div>
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {loading && <li className="p-4 text-xs text-slate-400">Loading…</li>}
          {!loading && visible.length === 0 && <li className="flex flex-col items-center gap-2 p-8 text-center text-xs text-slate-400"><Headset className="h-6 w-6" />No conversations here yet.</li>}
          {visible.map((item) => {
            const person = customers[item.customer_id];
            return (
              <li key={item.id}>
                <button type="button" onClick={() => setSelectedId(item.id)} className={`flex w-full gap-3 px-3 py-3 text-left hover:bg-brand-50/60 ${item.id === selectedId ? 'bg-brand-50' : ''}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials(person?.name ?? '?')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-slate-800">{person?.name ?? 'Customer'}</span><span className="shrink-0 text-[11px] text-slate-400">{relTime(item.last_message_at)}</span></span>
                    <span className="block truncate text-xs text-slate-500">{item.subject}</span>
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{item.last_message_preview}</span>
                      {item.unread_staff > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">{item.unread_staff}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Conversation */}
      <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
        {!selected || !customer ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-slate-400"><MessageSquare className="h-7 w-7" />Select a conversation to reply.</div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/70 px-4 py-2.5">
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back"><X className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-slate-800">{customer.name}</h3>
                <p className="truncate text-xs text-slate-500">{selected.subject}</p>
              </div>
              <select disabled={!isAgent} value={selected.status} onChange={(e) => void patchConversation({ status: e.target.value as Status })} aria-label="Status" className={`rounded-lg border-0 px-2 py-1 text-xs font-semibold ${statusStyle[selected.status]}`}>
                <option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option>
              </select>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((item) => {
                const mine = item.sender_type === 'agent';
                if (item.sender_type === 'note') return (
                  <div key={item.id} className="mx-auto max-w-[85%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="mb-0.5 flex items-center gap-1 font-semibold"><StickyNote className="h-3 w-3" />Internal note · {assigneeName(item.sender_id)}</span>
                    <span className="whitespace-pre-wrap break-words">{item.body}</span>
                  </div>
                );
                return (
                  <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'}`}>
                      {item.body}
                      <span className={`mt-1 flex items-center gap-1 text-[11px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
                        {item.channel === 'email' ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                        {mine ? assigneeName(item.sender_id).split(' ')[0] : customer.name.split(' ')[0]} · {relTime(item.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {isAgent && (
              <footer className="border-t border-slate-200 bg-white/80 p-3">
                {error && <p role="alert" className="pb-2 text-xs text-rose-600">{error}</p>}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {([['chat', 'Chat reply', MessageSquare], ['email', 'Email', Mail], ['note', 'Internal note', StickyNote]] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setMode(id)} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${mode === id ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><Icon className="h-3 w-3" />{label}</button>
                  ))}
                  {workspaceSettings.aiSuggestedReplies && <button type="button" disabled={busy === 'suggest'} onClick={() => void runAi('suggest')} className="ml-auto flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"><Sparkles className="h-3 w-3" />{busy === 'suggest' ? 'Thinking…' : 'Suggest reply'}</button>}
                </div>
                <div className="flex gap-2">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={10000} aria-label="Reply"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendReply(); }}
                    placeholder={mode === 'note' ? 'Add a private note for your team…' : mode === 'email' ? `Email ${customer.email ?? 'customer'}…` : 'Reply in chat…'}
                    className={`${inputClass} resize-none ${mode === 'note' ? 'bg-amber-50' : ''}`} />
                  <button type="button" disabled={!draft.trim() || busy === 'send'} onClick={() => void sendReply()} aria-label="Send" className="self-end rounded-lg bg-brand-600 p-2.5 text-white hover:bg-brand-700 disabled:opacity-50"><Send className="h-4 w-4" /></button>
                </div>
              </footer>
            )}
          </>
        )}
      </section>

      {/* Customer profile and journey */}
      {selected && customer && (
        <aside className="hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l border-slate-200 bg-white/70 p-4 xl:block">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{initials(customer.name)}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{customer.name}</p>
              <p className="truncate text-xs text-slate-500">{customer.email || 'No email'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">Priority
              <select disabled={!isAgent} value={selected.priority} onChange={(e) => void patchConversation({ priority: e.target.value as Priority })} className={`${inputClass} mt-1 ${priorityStyle[selected.priority]}`}>
                {(['low', 'normal', 'high', 'urgent'] as Priority[]).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">Assigned to
              <select disabled={!isAgent} value={selected.assignee_id ?? ''} onChange={(e) => void patchConversation({ assignee_id: e.target.value || null })} className={`${inputClass} mt-1`}>
                <option value="">Unassigned</option>
                {agents.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-slate-500">Phone<input disabled={!isAgent} defaultValue={customer.phone ?? ''} key={`p-${customer.id}`} onBlur={(e) => void patchCustomer({ phone: e.target.value.trim() || null })} className={`${inputClass} mt-1`} /></label>
            <label className="block text-xs text-slate-500">Organization<input disabled={!isAgent} defaultValue={customer.organization ?? ''} key={`o-${customer.id}`} onBlur={(e) => void patchCustomer({ organization: e.target.value.trim() || null })} className={`${inputClass} mt-1`} /></label>
            <label className="block text-xs text-slate-500">Notes<textarea disabled={!isAgent} rows={3} defaultValue={customer.notes ?? ''} key={`n-${customer.id}`} onBlur={(e) => void patchCustomer({ notes: e.target.value.trim() || null })} className={`${inputClass} mt-1 resize-none`} /></label>
          </div>
          <div className="flex gap-2">
            {customer.email && <button type="button" onClick={() => { setMode('email'); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Mail className="h-3.5 w-3.5" />Email</button>}
            <button type="button" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/contact`); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" />Chat link</button>
            <button type="button" onClick={() => requestEmailCompose()} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50" title="Open the email composer"><Mail className="h-3.5 w-3.5" /></button>
          </div>

          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-violet-800"><Wand2 className="h-3.5 w-3.5" />Conversation summary</h4>
              {isAgent && <button type="button" disabled={busy === 'summarize'} onClick={() => void runAi('summarize')} className="text-xs font-semibold text-violet-700 hover:underline disabled:opacity-60">{busy === 'summarize' ? 'Working…' : summary ? 'Refresh' : 'Generate'}</button>}
            </div>
            {summary ? (
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">{summary.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>
            ) : <p className="text-xs text-slate-500">No summary yet.</p>}
          </div>

          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Clock3 className="h-3.5 w-3.5" />Customer journey</h4>
            <ol className="space-y-3 border-l border-slate-200 pl-3">
              {timeline.map((item) => (
                <li key={item.id} className="relative text-xs">
                  <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-brand-500" />
                  <p className="font-medium text-slate-700">{item.text}</p>
                  <p className="truncate text-slate-400">{item.body}</p>
                  <p className="text-[11px] text-slate-400">{new Date(item.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </li>
              ))}
              {timeline.length === 0 && <li className="text-xs text-slate-400">No activity yet.</li>}
            </ol>
          </div>
        </aside>
      )}

      {showNew && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="New conversation">
          <form onSubmit={createConversation} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Log a conversation</h3><button type="button" onClick={() => setShowNew(false)} aria-label="Close"><X className="h-4 w-4 text-slate-400" /></button></div>
            <input required placeholder="Customer name" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} className={inputClass} />
            <input type="email" placeholder="Email (optional)" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} className={inputClass} />
            <input placeholder="Subject" value={newForm.subject} onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })} className={inputClass} />
            <textarea rows={4} placeholder="What did they say or ask?" value={newForm.message} onChange={(e) => setNewForm({ ...newForm, message: e.target.value })} className={`${inputClass} resize-none`} />
            {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={busy === 'create'} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
