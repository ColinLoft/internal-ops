import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, Building2, Lock, Mail, Plus, Search, Send, UserRound, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppAccess } from '../../lib/useAppAccess';
import { SupportInbox } from './SupportInbox';

type Status = 'new' | 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
type Priority = 'low' | 'normal' | 'high' | 'urgent';

type Ticket = {
  id: string;
  ticket_number: number;
  subject: string;
  description: string;
  category: string;
  priority: Priority;
  status: Status;
  requester_id: string;
  assignee_id: string | null;
  organization_name: string | null;
  due_at: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
};

type Comment = { id: string; ticket_id: string; author_id: string; body: string; is_internal: boolean; created_at: string };

const statuses: { id: Status; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

const categories = [
  { id: 'customer_support', label: 'Customer support' },
  { id: 'technical', label: 'Technical issue' },
  { id: 'product', label: 'Product issue' },
  { id: 'website', label: 'Website issue' },
  { id: 'partnership', label: 'Partnership inquiry' },
  { id: 'general', label: 'General question' },
  { id: 'internal_it', label: 'Internal IT request' },
  { id: 'equipment', label: 'Equipment issue' },
  { id: 'bug', label: 'Bug report' },
  { id: 'help', label: 'Help with the system' },
  { id: 'feature_request', label: 'Feature request' },
  { id: 'access', label: 'Access request' },
];

const priorities: Priority[] = ['low', 'normal', 'high', 'urgent'];
const priorityStyle: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-brand-50 text-brand-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
};

const statusLabel = (status: Status) => statuses.find((item) => item.id === status)?.label ?? status;
const categoryLabel = (category: string) => categories.find((item) => item.id === category)?.label ?? category;
const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');
const ticketColumns = 'id,ticket_number,subject,description,category,priority,status,requester_id,assignee_id,organization_name,due_at,resolution,created_at,updated_at';

export const TicketsView: React.FC<{ onOpenMessages: () => void }> = ({ onOpenMessages }) => {
  const { currentUser, users } = useWorkspace();
  const { canEdit: isAgent } = useAppAccess('support');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | Status>('active');
  const [scope, setScope] = useState<'all' | 'mine' | 'assigned'>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', category: 'general', priority: 'normal' as Priority, organization_name: '' });
  const [reply, setReply] = useState('');
  const [replyInternal, setReplyInternal] = useState(false);
  const [aiBusy, setAiBusy] = useState<'suggest' | 'summarize' | ''>('');
  const [aiSummary, setAiSummary] = useState<string[]>([]);

  const userName = useCallback((id: string | null) => users.find((user) => user.id === id)?.name ?? (id ? 'Unknown user' : 'Unassigned'), [users]);

  const loadTickets = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('support_tickets').select(ticketColumns).order('created_at', { ascending: false }).limit(500);
    if (loadError) setError(loadError.message);
    else setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  }, []);

  const loadComments = useCallback(async (ticketId: string) => {
    const { data, error: loadError } = await supabase
      .from('support_ticket_comments')
      .select('id,ticket_id,author_id,body,is_internal,created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (loadError) setError(loadError.message);
    else setComments((data ?? []) as Comment[]);
  }, []);

  useEffect(() => { void loadTickets(); }, [loadTickets]);
  useEffect(() => {
    setComments([]);
    setAiSummary([]);
    if (selectedId) void loadComments(selectedId);
  }, [selectedId, loadComments]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { active: 0 };
    for (const ticket of tickets) {
      result[ticket.status] = (result[ticket.status] ?? 0) + 1;
      if (ticket.status !== 'closed' && ticket.status !== 'resolved') result.active += 1;
    }
    return result;
  }, [tickets]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter === 'active' ? ['resolved', 'closed'].includes(ticket.status) : ticket.status !== statusFilter) return false;
      if (scope === 'mine' && ticket.requester_id !== currentUser.id) return false;
      if (scope === 'assigned' && ticket.assignee_id !== currentUser.id) return false;
      if (!needle) return true;
      return `${ticket.ticket_number} ${ticket.subject} ${ticket.organization_name ?? ''} ${userName(ticket.requester_id)}`.toLowerCase().includes(needle);
    });
  }, [tickets, statusFilter, scope, query, currentUser.id, userName]);

  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const canManage = !!selected && (isAgent || selected.assignee_id === currentUser.id);

  const createTicket = async () => {
    if (!form.subject.trim()) return;
    setSaving(true);
    setError('');
    const { data, error: insertError } = await supabase.from('support_tickets').insert({
      subject: form.subject.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      organization_name: form.organization_name.trim() || null,
    }).select(ticketColumns).single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? 'The ticket could not be created.');
      return;
    }
    setTickets((current) => [data as Ticket, ...current]);
    setSelectedId((data as Ticket).id);
    setShowForm(false);
    setForm({ subject: '', description: '', category: 'general', priority: 'normal', organization_name: '' });
  };

  const updateTicket = async (patch: Partial<Pick<Ticket, 'status' | 'priority' | 'assignee_id' | 'category' | 'due_at' | 'resolution'>>) => {
    if (!selected) return;
    setError('');
    const { data, error: updateError } = await supabase.from('support_tickets').update(patch).eq('id', selected.id).select(ticketColumns).single();
    if (updateError || !data) {
      setError(updateError?.message ?? 'The ticket could not be updated.');
      return;
    }
    setTickets((current) => current.map((ticket) => (ticket.id === selected.id ? (data as Ticket) : ticket)));
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setError('');
    const { error: insertError } = await supabase.from('support_ticket_comments').insert({
      ticket_id: selected.id,
      body: reply.trim(),
      is_internal: isAgent && replyInternal,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setReply('');
    setReplyInternal(false);
    await loadComments(selected.id);
  };

  const runTicketAi = async (action: 'suggest' | 'summarize') => {
    if (!selected) return;
    setAiBusy(action);
    setError('');
    try {
      const { data, error: aiError } = await supabase.functions.invoke('support-ai', { body: { action, ticketId: selected.id } });
      if (aiError || data?.error) throw new Error(String(data?.error || aiError?.message || 'AI request failed.'));
      if (action === 'suggest') setReply(String(data.text || ''));
      else setAiSummary(Array.isArray(data.bullets) ? data.bullets.map(String) : []);
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : 'AI request failed.');
    } finally {
      setAiBusy('');
    }
  };

  const overdue = (ticket: Ticket) => !!ticket.due_at && !['resolved', 'closed'].includes(ticket.status) && new Date(ticket.due_at) < new Date();

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Support</h1>
            <p className="mt-1 text-sm text-slate-500">{counts.active} active tickets · assign, respond, and resolve in one workspace.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onOpenMessages} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Mail className="mr-1 inline h-3.5 w-3.5" />Customer messages</button>
            <button type="button" onClick={() => setShowForm(true)} className="min-h-10 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> New ticket</button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Open tickets', counts.active],
            ['Urgent', tickets.filter((ticket) => ticket.priority === 'urgent' && !['resolved', 'closed'].includes(ticket.status)).length],
            ['Unassigned', tickets.filter((ticket) => !ticket.assignee_id && !['resolved', 'closed'].includes(ticket.status)).length],
            ['Overdue', tickets.filter((ticket) => overdue(ticket)).length],
          ].map(([label, count]) => <div key={label} className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-0.5 text-lg font-semibold tabular-nums ${label === 'Overdue' && Number(count) ? 'text-rose-600' : 'text-slate-900'}`}>{loading ? '—' : count}</dd></div>)}
        </dl>
      </header>

      {error && <div role="alert" className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:mx-8">{error}</div>}

      {!selected ? (
        <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto">
              {([{ id: 'active', label: 'Open' }, ...statuses] as { id: 'active' | Status; label: string }[]).map((item) => (
                <button key={item.id} type="button" onClick={() => setStatusFilter(item.id)} className={`min-h-9 rounded-md px-3 text-xs font-semibold ${statusFilter === item.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{item.label}<span className="ml-1.5 tabular-nums opacity-70">{counts[item.id] ?? 0}</span></button>
              ))}
              <span className="mx-1 h-5 w-px bg-slate-200" />
              {([['all', 'All'], ['mine', 'My requests'], ['assigned', 'Assigned to me']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setScope(id)} className={`min-h-9 rounded-md px-2.5 text-xs font-medium ${scope === id ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-white'}`}>{label}</button>
              ))}
            </div>
            <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets" aria-label="Search tickets" className="min-h-9 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400" /></div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_100px_125px_115px] gap-3 px-4 py-2 text-xs text-slate-500 md:grid">
              <span>Ticket</span><span>Requester</span><span>Severity</span><span>Assigned to</span><span>Updated</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {visible.map((ticket) => (
                <li key={ticket.id}>
                  <button type="button" onClick={() => setSelectedId(ticket.id)} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 md:grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_100px_125px_115px] md:items-center md:gap-3">
                    <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{ticket.subject}</span><span className="text-xs text-slate-400">FL-{ticket.ticket_number}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{categoryLabel(ticket.category)} · {statusLabel(ticket.status)}{ticket.organization_name ? ` · ${ticket.organization_name}` : ''}</span></span>
                    <span className="flex items-center gap-2 text-sm text-slate-700"><UserRound className="h-4 w-4 text-slate-400" />{userName(ticket.requester_id)}</span>
                    <span className={`text-xs font-semibold capitalize ${ticket.priority === 'urgent' ? 'text-rose-600' : ticket.priority === 'high' ? 'text-amber-600' : 'text-slate-600'}`}>{ticket.priority}{overdue(ticket) ? ' · overdue' : ''}</span>
                    <span className="text-sm text-slate-600">{userName(ticket.assignee_id)}</span>
                    <time className="text-xs text-slate-500" dateTime={ticket.updated_at}>{formatDate(ticket.updated_at)}</time>
                  </button>
                </li>
              ))}
              {!loading && visible.length === 0 && <li className="px-4 py-12 text-center text-sm text-slate-400">No tickets match these filters.</li>}
              {loading && <li className="px-4 py-12 text-center text-sm text-slate-400">Loading tickets…</li>}
            </ul>
          </div>
        </section>
      ) : (
        <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <button type="button" onClick={() => setSelectedId(null)} className="mb-3 inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-slate-600 hover:bg-white"><ArrowLeft className="h-4 w-4" />All tickets</button>
          <div className="grid min-h-[70vh] gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section className="flex min-h-[500px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
              <header className="border-b border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-xs text-slate-500">FL-{selected.ticket_number} · {categoryLabel(selected.category)}</p><h2 className="mt-1 text-lg font-semibold text-slate-900">{selected.subject}</h2></div>
                  <span className={`rounded px-2 py-1 text-xs font-semibold capitalize ${priorityStyle[selected.priority]}`}>{selected.priority}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.description || 'No description provided.'}</p>
              </header>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <h3 className="text-sm font-semibold text-slate-800">Messages &amp; internal notes</h3>
                {comments.map((comment) => (
                  <article key={comment.id} className={`max-w-3xl rounded-lg px-3 py-2.5 ${comment.is_internal ? 'bg-amber-50 text-amber-950' : 'bg-slate-50 text-slate-800'}`}>
                    <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">{userName(comment.author_id)}{comment.is_internal && <span className="inline-flex items-center gap-1 text-amber-700"><Lock className="h-3 w-3" />Internal note</span>}<time className="font-normal text-slate-400">{new Date(comment.created_at).toLocaleString()}</time></p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{comment.body}</p>
                  </article>
                ))}
                {!comments.length && <p className="text-sm text-slate-400">No messages yet. Send a reply or leave an internal note.</p>}
                {aiSummary.length > 0 && <aside className="max-w-3xl rounded-lg bg-blue-50 p-3"><h4 className="flex items-center gap-1 text-xs font-semibold text-blue-800"><Bot className="h-4 w-4" />AI ticket summary</h4><ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">{aiSummary.map((line, index) => <li key={index}>{line}</li>)}</ul></aside>}
              </div>
              {canManage && (
                <footer className="border-t border-slate-200 p-3">
                  {error && <p role="alert" className="mb-2 text-sm text-rose-600">{error}</p>}
                  <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={10000} placeholder={replyInternal ? 'Write an internal note…' : 'Write a message to the requester…'} aria-label={replyInternal ? 'Internal note' : 'Message to requester'} className="w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-brand-400" />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-9 items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={replyInternal} onChange={(event) => setReplyInternal(event.target.checked)} />Internal note</label>
                      <button type="button" onClick={() => void runTicketAi('suggest')} disabled={!!aiBusy} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Bot className="h-4 w-4" />{aiBusy === 'suggest' ? 'Drafting…' : 'Draft with AI'}</button>
                      <button type="button" onClick={() => void runTicketAi('summarize')} disabled={!!aiBusy} className="min-h-9 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100">{aiBusy === 'summarize' ? 'Summarizing…' : 'Summarize'}</button>
                    </div>
                    <button type="button" disabled={!reply.trim()} onClick={() => void sendReply()} className="min-h-9 rounded-md bg-brand-600 px-3 text-xs font-semibold text-white disabled:opacity-40"><Send className="mr-1 inline h-3.5 w-3.5" />Send</button>
                  </div>
                </footer>
              )}
            </section>
            <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
              <section>
                <h3 className="text-sm font-semibold text-slate-900">Requester profile</h3>
                <p className="mt-3 text-base font-semibold text-slate-800">{userName(selected.requester_id)}</p>
                {users.find((user) => user.id === selected.requester_id)?.email && <a className="mt-1 flex items-center gap-1.5 break-all text-sm text-brand-700" href={`mailto:${users.find((user) => user.id === selected.requester_id)?.email}`}><Mail className="h-4 w-4 shrink-0" />{users.find((user) => user.id === selected.requester_id)?.email}</a>}
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><Building2 className="h-4 w-4 shrink-0 text-slate-400" />{selected.organization_name || 'Company not provided'}</p>
                {users.find((user) => user.id === selected.requester_id)?.role && <p className="mt-1 text-sm text-slate-600">{users.find((user) => user.id === selected.requester_id)?.role}</p>}
                {users.find((user) => user.id === selected.requester_id)?.department && <p className="mt-0.5 text-sm text-slate-500">{users.find((user) => user.id === selected.requester_id)?.department}</p>}
                {users.find((user) => user.id === selected.requester_id)?.phone && <p className="mt-1 text-sm text-slate-600">{users.find((user) => user.id === selected.requester_id)?.phone}</p>}
              </section>
              <section className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">Ticket details</h3>
                <Field label="Status"><select disabled={!canManage} value={selected.status} onChange={(event) => void updateTicket({ status: event.target.value as Status })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50">{statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                <Field label="Severity"><select disabled={!canManage} value={selected.priority} onChange={(event) => void updateTicket({ priority: event.target.value as Priority })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm capitalize disabled:bg-slate-50">{priorities.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
                <Field label="Category"><select disabled={!canManage} value={selected.category} onChange={(event) => void updateTicket({ category: event.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50">{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                <Field label="Assigned to"><select disabled={!isAgent} value={selected.assignee_id ?? ''} onChange={(event) => void updateTicket({ assignee_id: event.target.value || null })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
                <Field label="Response deadline"><input disabled={!canManage} type="date" value={selected.due_at ? selected.due_at.slice(0, 10) : ''} onChange={(event) => void updateTicket({ due_at: event.target.value ? new Date(`${event.target.value}T23:59:59`).toISOString() : null })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-50" /></Field>
                <p className="text-xs text-slate-500">Opened {formatDate(selected.created_at)}</p>
              </section>
              <section className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">Past tickets</h3>
                <ul className="mt-2 space-y-2">{tickets.filter((ticket) => ticket.requester_id === selected.requester_id && ticket.id !== selected.id).slice(0, 5).map((ticket) => <li key={ticket.id}><button type="button" onClick={() => setSelectedId(ticket.id)} className="w-full text-left text-sm hover:text-brand-700"><span className="block truncate font-medium">{ticket.subject}</span><span className="text-xs text-slate-500">FL-{ticket.ticket_number} · {statusLabel(ticket.status)} · {formatDate(ticket.created_at)}</span></button></li>)}{tickets.filter((ticket) => ticket.requester_id === selected.requester_id && ticket.id !== selected.id).length === 0 && <li className="text-sm text-slate-400">No previous tickets.</li>}</ul>
              </section>
              {canManage && ['resolved', 'closed'].includes(selected.status) && <label className="block border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500">Resolution<textarea key={selected.id} defaultValue={selected.resolution ?? ''} onBlur={(event) => { if (event.target.value !== (selected.resolution ?? '')) void updateTicket({ resolution: event.target.value.trim() || null }); }} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" placeholder="How was this resolved?" /></label>}
            </aside>
          </div>
        </section>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="New ticket">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">New ticket</h2>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <input value={form.subject} maxLength={200} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              <textarea value={form.description} maxLength={10000} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} placeholder="Describe the request" className="w-full rounded-lg border border-slate-200 p-3" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded-lg border border-slate-200 px-2 py-2">
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })} className="rounded-lg border border-slate-200 px-2 py-2 capitalize">
                  {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <input value={form.organization_name} maxLength={200} onChange={(event) => setForm({ ...form, organization_name: event.target.value })} placeholder="Organization (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button>
              <button type="button" disabled={!form.subject.trim() || saving} onClick={() => void createTicket()} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? 'Creating…' : 'Create ticket'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="mb-1 font-bold text-slate-500">{label}</dt>
    <dd className="text-slate-700">{children}</dd>
  </div>
);

export const SupportPage: React.FC = () => {
  const [showMessages, setShowMessages] = useState(false);
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {showMessages ? (
        <>
          <button type="button" onClick={() => setShowMessages(false)} className="min-h-10 self-start px-4 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="mr-1 inline h-4 w-4" />Back to tickets</button>
          <SupportInbox />
        </>
      ) : <TicketsView onOpenMessages={() => setShowMessages(true)} />}
    </div>
  );
};
