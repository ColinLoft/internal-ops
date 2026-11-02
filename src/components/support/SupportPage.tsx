import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, LifeBuoy, Lock, Plus, Search, Send, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppAccess } from '../../lib/useAppAccess';

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

export const SupportPage: React.FC = () => {
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

  const overdue = (ticket: Ticket) => !!ticket.due_at && !['resolved', 'closed'].includes(ticket.status) && new Date(ticket.due_at) < new Date();

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Support</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">Tickets</h1>
            <p className="mt-1 text-xs text-slate-500">Track requests from new through resolution.</p>
          </div>
          <button type="button" onClick={() => setShowForm(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">
            <Plus className="mr-1 inline h-3.5 w-3.5" /> New ticket
          </button>
        </div>
      </header>

      {error && <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 sm:mx-8">{error}</div>}

      <div className="grid min-h-0 flex-1 gap-5 p-5 sm:p-8 lg:grid-cols-[minmax(320px,2fr)_3fr]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-400" />
            </div>
            <div className="flex flex-wrap gap-1">
              {([{ id: 'active', label: 'Active' }, ...statuses] as { id: 'active' | Status; label: string }[]).map((item) => (
                <button key={item.id} type="button" onClick={() => setStatusFilter(item.id)} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusFilter === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {item.label} {counts[item.id] ?? 0}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {([['all', 'All'], ['mine', 'My requests'], ['assigned', 'Assigned to me']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setScope(id)} className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${scope === id ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
            {visible.map((ticket) => (
              <li key={ticket.id}>
                <button type="button" onClick={() => setSelectedId(ticket.id)} className={`w-full p-3 text-left hover:bg-slate-50 ${selectedId === ticket.id ? 'bg-brand-50/60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-400">FL-{ticket.ticket_number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${priorityStyle[ticket.priority]}`}>{ticket.priority}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">{ticket.subject}</p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {statusLabel(ticket.status)} · {userName(ticket.requester_id)} · {formatDate(ticket.created_at)}
                    {overdue(ticket) && <span className="ml-2 font-bold text-red-600">Overdue</span>}
                  </p>
                </button>
              </li>
            ))}
            {!loading && visible.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-12 text-center text-xs text-slate-400"><LifeBuoy className="h-6 w-6" />No tickets match these filters.</li>
            )}
            {loading && <li className="px-4 py-12 text-center text-xs text-slate-400">Loading tickets…</li>}
          </ul>
        </section>

        <section className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selected ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-xs text-slate-400"><LifeBuoy className="h-6 w-6" />Select a ticket to view its details.</div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-bold text-slate-400">FL-{selected.ticket_number} · {categoryLabel(selected.category)}</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{selected.subject}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{selected.description || 'No description provided.'}</p>
              </div>

              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <Field label="Status">
                  <select disabled={!canManage} value={selected.status} onChange={(event) => void updateTicket({ status: event.target.value as Status })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 disabled:bg-slate-50">
                    {statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select disabled={!canManage} value={selected.priority} onChange={(event) => void updateTicket({ priority: event.target.value as Priority })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 capitalize disabled:bg-slate-50">
                    {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Assignee">
                  <select disabled={!isAgent} value={selected.assignee_id ?? ''} onChange={(event) => void updateTicket({ assignee_id: event.target.value || null })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 disabled:bg-slate-50">
                    <option value="">Unassigned</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </Field>
                <Field label="Response deadline">
                  <input disabled={!canManage} type="date" value={selected.due_at ? selected.due_at.slice(0, 10) : ''} onChange={(event) => void updateTicket({ due_at: event.target.value ? new Date(`${event.target.value}T23:59:59`).toISOString() : null })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 disabled:bg-slate-50" />
                </Field>
                <Field label="Requester">{userName(selected.requester_id)}{selected.organization_name ? ` · ${selected.organization_name}` : ''}</Field>
                <Field label="Created">{formatDate(selected.created_at)}</Field>
              </dl>

              {canManage && ['resolved', 'closed'].includes(selected.status) && (
                <label className="block text-xs">
                  <span className="font-bold text-slate-500">Resolution</span>
                  <textarea key={selected.id} defaultValue={selected.resolution ?? ''} onBlur={(event) => { if (event.target.value !== (selected.resolution ?? '')) void updateTicket({ resolution: event.target.value.trim() || null }); }} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 p-2" placeholder="How was this resolved?" />
                </label>
              )}

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400"><Clock3 className="mr-1 inline h-3 w-3" />Conversation</p>
                <div className="space-y-2">
                  {comments.map((comment) => (
                    <div key={comment.id} className={`rounded-xl p-3 text-xs ${comment.is_internal ? 'border border-amber-200 bg-amber-50' : 'bg-slate-50'}`}>
                      <p className="font-bold text-slate-700">
                        {userName(comment.author_id)}
                        {comment.is_internal && <span className="ml-2 text-[10px] text-amber-700"><Lock className="mr-0.5 inline h-3 w-3" />Internal note</span>}
                        <span className="ml-2 font-normal text-slate-400">{new Date(comment.created_at).toLocaleString()}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-600">{comment.body}</p>
                    </div>
                  ))}
                  {comments.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
                </div>
                <div className="mt-3 space-y-2">
                  <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={10000} placeholder="Write a reply" className="w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-brand-400" />
                  <div className="flex items-center justify-between">
                    {isAgent ? (
                      <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={replyInternal} onChange={(event) => setReplyInternal(event.target.checked)} /> Internal note</label>
                    ) : <span />}
                    <button type="button" disabled={!reply.trim()} onClick={() => void sendReply()} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Send className="mr-1 inline h-3.5 w-3.5" />Send</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

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
