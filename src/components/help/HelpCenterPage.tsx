import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Bug, ChevronDown, CircleCheck, Lightbulb, LifeBuoy, KeyRound, Search, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { guideSections } from './guides';
import { DocsAssistant } from './DocsAssistant';

type View = 'guides' | 'new' | 'mine';
type RequestType = 'bug' | 'help' | 'feature_request' | 'access';
type Ticket = { id: string; ticket_number: number; subject: string; description: string; category: string; priority: string; status: string; resolution: string | null; created_at: string; updated_at: string };
type Comment = { id: string; author_id: string; body: string; created_at: string };

const requestTypes: { id: RequestType; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'bug', label: 'Report a bug', hint: 'Something is broken or behaves unexpectedly.', icon: Bug },
  { id: 'help', label: 'I need help', hint: 'You are stuck or not sure how something works.', icon: LifeBuoy },
  { id: 'feature_request', label: 'Request a feature', hint: 'An idea that would make Flown better.', icon: Lightbulb },
  { id: 'access', label: 'Request access', hint: 'You need permission to an app or data.', icon: KeyRound },
];
const areas = ['Not sure', 'Home', 'Messages & Channels', 'Email', 'Calendar', 'Drive', 'Tasks', 'Customers', 'Support', 'Company (ideas, grants, content, contracts)', 'Products (engineering)', 'Insights', 'Systems', 'Sign-in / account'];
const statusLabel: Record<string, string> = { new: 'Received', open: 'Open', in_progress: 'In progress', waiting: 'Waiting on you', resolved: 'Resolved', closed: 'Closed' };
const statusStyle: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700', open: 'bg-emerald-50 text-emerald-700', in_progress: 'bg-brand-50 text-brand-700',
  waiting: 'bg-amber-50 text-amber-700', resolved: 'bg-slate-100 text-slate-600', closed: 'bg-slate-100 text-slate-500',
};
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
const fmt = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const notifyChanged = () => window.dispatchEvent(new Event('flown-support-changed'));

export const HelpCenterPage: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const [view, setView] = useState<View>('guides');
  const [query, setQuery] = useState('');
  const [openGuide, setOpenGuide] = useState<string | null>('navigate');
  const [type, setType] = useState<RequestType>('bug');
  const [form, setForm] = useState({ subject: '', description: '', steps: '', area: 'Not sure', priority: 'normal' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reply, setReply] = useState('');

  const needle = query.trim().toLowerCase();
  const sections = useMemo(() => guideSections
    .map((section) => ({
      ...section,
      guides: section.guides.filter((guide) => !needle || `${guide.title} ${guide.summary} ${guide.steps.join(' ')} ${section.title}`.toLowerCase().includes(needle)),
    }))
    .filter((section) => section.guides.length > 0), [needle]);

  const loadTickets = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('support_tickets')
      .select('id,ticket_number,subject,description,category,priority,status,resolution,created_at,updated_at')
      .eq('requester_id', currentUser.id).order('created_at', { ascending: false }).limit(100);
    if (loadError) setError(loadError.message);
    else setTickets((data ?? []) as Ticket[]);
  }, [currentUser.id]);

  const loadComments = useCallback(async (ticketId: string) => {
    const { data } = await supabase.from('support_ticket_comments').select('id,author_id,body,created_at')
      .eq('ticket_id', ticketId).eq('is_internal', false).order('created_at');
    setComments((data ?? []) as Comment[]);
  }, []);

  useEffect(() => { if (view === 'mine') void loadTickets(); }, [view, loadTickets]);
  useEffect(() => { if (selectedId) void loadComments(selectedId); else setComments([]); }, [selectedId, loadComments]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError('');
    const details = [
      form.description.trim(),
      type === 'bug' && form.steps.trim() ? `\nSteps to reproduce:\n${form.steps.trim()}` : '',
      `\n---\nArea: ${form.area}\nPage: ${window.location.pathname}\nBrowser: ${navigator.userAgent}`,
    ].filter(Boolean).join('\n');
    const { data, error: insertError } = await supabase.from('support_tickets')
      .insert({ subject: form.subject.trim(), description: details.slice(0, 10000), category: type, priority: form.priority, requester_id: currentUser.id })
      .select('ticket_number').single();
    setSending(false);
    if (insertError) {
      setError(insertError.message.includes('support_tickets_category_check') ? 'The database needs the latest migration (20261102180000) before requests can be sent.' : insertError.message);
      return;
    }
    setSubmitted(data.ticket_number);
    setForm({ subject: '', description: '', steps: '', area: 'Not sure', priority: 'normal' });
    notifyChanged();
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || !selectedId) return;
    const { error: insertError } = await supabase.from('support_ticket_comments').insert({ ticket_id: selectedId, author_id: currentUser.id, body, is_internal: false });
    if (insertError) { setError(insertError.message); return; }
    setReply('');
    await loadComments(selectedId);
  };

  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const authorName = (id: string) => id === currentUser.id ? 'You' : users.find((user) => user.id === id)?.name ?? 'Support team';
  const typeLabel = (category: string) => requestTypes.find((item) => item.id === category)?.label ?? category.replace(/_/g, ' ');

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-8">
        <header>
          <h1 className="text-xl font-semibold text-slate-900">Help Center</h1>
          <p className="mt-1 text-sm text-slate-600">Learn how to use Flown, or send the support team a request.</p>
        </header>

        <div role="tablist" className="flex gap-1 border-b border-slate-200">
          {([['guides', 'Guides'], ['new', 'Submit a request'], ['mine', 'My requests']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => { setView(id); setSubmitted(null); setError(''); }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${view === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
          ))}
        </div>

        {view === 'guides' && (
          <div className="space-y-5">
            <DocsAssistant
              onOpenGuide={(id) => { setQuery(''); setOpenGuide(id); window.setTimeout(() => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}
              onOpenTicket={(subject) => { setType('help'); setForm((value) => ({ ...value, subject: subject.slice(0, 120), description: subject })); setView('new'); }}
            />
            <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <nav aria-label="Guide sections" className="hidden lg:block"><ul className="sticky top-2 space-y-1 text-sm">{guideSections.map((section) => <li key={section.id}><button type="button" onClick={() => document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="w-full rounded-lg px-3 py-1.5 text-left text-slate-500 hover:bg-slate-100 hover:text-slate-900">{section.title}</button></li>)}</ul></nav>
            <div className="space-y-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the guides…" aria-label="Search guides" className={`${inputClass} pl-9`} />
            </div>
            {sections.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                No guides match “{query}”.{' '}
                <button type="button" onClick={() => setView('new')} className="font-semibold text-brand-700 hover:underline">Ask the support team</button>
              </div>
            )}
            {sections.map((section) => (
              <section key={section.id} id={`section-${section.id}`} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white/80">
                <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
                  <BookOpen className="mt-0.5 h-4 w-4 text-brand-600" />
                  <div><h2 className="text-sm font-semibold text-slate-800">{section.title}</h2><p className="text-xs text-slate-500">{section.description}</p></div>
                </div>
                <ul className="divide-y divide-slate-100">
                  {section.guides.map((guide) => {
                    const open = !!needle || openGuide === guide.id;
                    return (
                      <li key={guide.id} id={`guide-${guide.id}`} className="scroll-mt-4">
                        <button type="button" aria-expanded={open} onClick={() => setOpenGuide(open && !needle ? null : guide.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-50/50">
                          <span><span className="block text-sm font-medium text-slate-800">{guide.title}</span><span className="block text-xs text-slate-500">{guide.summary}</span></span>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <div className="space-y-3 px-4 pb-4">
                            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">{guide.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
                            {guide.tips?.map((tip) => <p key={tip} className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">Tip: {tip}</p>)}
                            {guide.faqs?.map((faq) => <div key={faq.q} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><p className="font-semibold text-slate-800">{faq.q}</p><p className="mt-0.5 text-slate-600">{faq.a}</p></div>)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <p className="text-center text-xs text-slate-500">Can’t find what you need? <button type="button" onClick={() => setView('new')} className="font-semibold text-brand-700 hover:underline">Submit a request</button></p>
            </div>
            </div>
          </div>
        )}

        {view === 'new' && (
          submitted ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <CircleCheck className="mx-auto h-8 w-8 text-emerald-600" />
              <h2 className="mt-2 text-sm font-semibold text-emerald-900">Request #{submitted} sent</h2>
              <p className="mt-1 text-xs text-emerald-800">The support team has been notified. You can follow along under My requests.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={() => setView('mine')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">View my requests</button>
                <button type="button" onClick={() => setSubmitted(null)} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800">Send another</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white/80 p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {requestTypes.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} type="button" onClick={() => setType(item.id)} aria-pressed={type === item.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${type === item.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <Icon className={`mt-0.5 h-4 w-4 ${type === item.id ? 'text-brand-600' : 'text-slate-400'}`} />
                      <span><span className="block text-sm font-semibold text-slate-800">{item.label}</span><span className="block text-xs text-slate-500">{item.hint}</span></span>
                    </button>
                  );
                })}
              </div>
              <label className="block text-xs font-medium text-slate-600">Summary
                <input required maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="A short title" className={`${inputClass} mt-1`} />
              </label>
              <label className="block text-xs font-medium text-slate-600">{type === 'bug' ? 'What happened, and what did you expect?' : type === 'feature_request' ? 'What would you like, and why?' : 'Details'}
                <textarea required rows={5} maxLength={8000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inputClass} mt-1 resize-none`} />
              </label>
              {type === 'bug' && (
                <label className="block text-xs font-medium text-slate-600">Steps to reproduce (optional)
                  <textarea rows={3} maxLength={2000} value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} placeholder={'1. Go to…\n2. Click…'} className={`${inputClass} mt-1 resize-none`} />
                </label>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">Where in Flown?
                  <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={`${inputClass} mt-1`}>{areas.map((area) => <option key={area}>{area}</option>)}</select>
                </label>
                <label className="block text-xs font-medium text-slate-600">How urgent?
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`${inputClass} mt-1`}>
                    <option value="low">Low – whenever</option><option value="normal">Normal</option><option value="high">High – blocking my work</option><option value="urgent">Urgent – nobody can work</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-slate-500">We include the current page and your browser to help the team investigate.</p>
              {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
              <div className="flex justify-end">
                <button type="submit" disabled={sending} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"><Send className="h-4 w-4" />{sending ? 'Sending…' : 'Send request'}</button>
              </div>
            </form>
          )
        )}

        {view === 'mine' && (
          <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
            <ul className="space-y-2">
              {tickets.length === 0 && <li className="rounded-xl border border-slate-200 bg-white/80 p-5 text-center text-xs text-slate-500">You haven’t sent any requests yet.</li>}
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button type="button" onClick={() => setSelectedId(ticket.id)} className={`w-full rounded-xl border p-3 text-left ${ticket.id === selectedId ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white/80 hover:bg-slate-50'}`}>
                    <span className="flex items-center justify-between gap-2"><span className="text-[11px] text-slate-400">#{ticket.ticket_number} · {typeLabel(ticket.category)}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle[ticket.status] ?? ''}`}>{statusLabel[ticket.status] ?? ticket.status}</span></span>
                    <span className="mt-1 block truncate text-sm font-medium text-slate-800">{ticket.subject}</span>
                    <span className="text-[11px] text-slate-400">{fmt(ticket.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              {!selected ? <p className="py-10 text-center text-xs text-slate-400">Select a request to see its progress.</p> : (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{selected.subject}</h2>
                    <p className="text-xs text-slate-500">#{selected.ticket_number} · {typeLabel(selected.category)} · {statusLabel[selected.status] ?? selected.status}</p>
                  </div>
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{selected.description}</p>
                  {selected.resolution && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900"><span className="font-semibold">Resolution: </span>{selected.resolution}</p>}
                  <ul className="space-y-2">
                    {comments.map((comment) => (
                      <li key={comment.id} className={`rounded-lg p-3 text-xs ${comment.author_id === currentUser.id ? 'bg-brand-50 text-slate-800' : 'border border-slate-200 text-slate-800'}`}>
                        <span className="mb-0.5 block font-semibold">{authorName(comment.author_id)} <span className="font-normal text-slate-400">· {fmt(comment.created_at)}</span></span>
                        <span className="whitespace-pre-wrap break-words">{comment.body}</span>
                      </li>
                    ))}
                  </ul>
                  {selected.status !== 'closed' && (
                    <div className="flex gap-2">
                      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={5000} placeholder="Add more information…" aria-label="Reply" className={`${inputClass} resize-none`} />
                      <button type="button" disabled={!reply.trim()} onClick={() => void sendReply()} aria-label="Send reply" className="self-end rounded-lg bg-brand-600 p-2.5 text-white hover:bg-brand-700 disabled:opacity-50"><Send className="h-4 w-4" /></button>
                    </div>
                  )}
                  {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
