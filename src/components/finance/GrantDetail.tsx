import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Link2, Mail, Plus, Search, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { ActivityPanel, AttachmentsPanel, CommentsPanel, LinksPanel, card, field, formatDateTime, logActivity } from '../work/EntityPanels';
import { RichNotes } from '../work/RichNotes';
import { AiTab, FunderPicker, KeyDates, PeopleTab, RequirementsTab } from './GrantExtras';
import { GRANT_STAGES, GRANT_TYPES, Grant, SOURCES, goTo, money, stageLabel, stageTone } from './grantShared';

type GrantEvent = { id: string; event_type: string; title: string; body: string | null; event_date: string; email_message_id: string | null; email_from: string | null; email_to: string | null; email_subject: string | null; created_by: string | null };
type Payment = { id: string; amount: number; status: string; expected_date: string | null; received_date: string | null; method: string | null; reference: string | null; notes: string | null };
type Report = { id: string; title: string; due_date: string | null; submitted_at: string | null; status: string; notes: string | null };
type GrantTask = { id: string; title: string; status: string; due_date: string | null; assignee_id: string | null };
type InboxEmail = { id: string; subject: string; sender_name: string; sender_email: string; to_recipients: { email: string }[]; received_at: string; folder: string };

const EVENT_TYPES = ['note', 'email_sent', 'email_received', 'application', 'call', 'meeting', 'decision', 'payment', 'report', 'follow_up', 'document'];
const eventLabel = (value: string) => value.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
const TABS = ['Overview', 'Activity', 'Files & reports'] as const;
type Tab = typeof TABS[number];
const label = 'text-xs font-semibold text-slate-500';
const Fold: React.FC<{ title: string; open?: boolean; children: React.ReactNode }> = ({ title, open = false, children }) => {
  const [shown, setShown] = useState(open);
  return (
    <section className={card}>
      <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)} className="flex w-full items-center justify-between text-left text-sm font-bold text-slate-900">{title}<span className="text-xs font-semibold text-slate-400">{shown ? 'Hide' : 'Show'}</span></button>
      {shown && <div className="mt-3">{children}</div>}
    </section>
  );
};

export const GrantDetail: React.FC<{ grantId: string }> = ({ grantId }) => {
  const { users, currentUser } = useWorkspace();
  const [grant, setGrant] = useState<Grant | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [events, setEvents] = useState<GrantEvent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tasks, setTasks] = useState<GrantTask[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const [g, e, p, r, t, pr] = await Promise.all([
      supabase.from('grants').select('*').eq('id', grantId).maybeSingle(),
      supabase.from('grant_events').select('*').eq('grant_id', grantId).order('event_date', { ascending: false }),
      supabase.from('grant_payments').select('*').eq('grant_id', grantId).order('expected_date', { ascending: true }),
      supabase.from('grant_reports').select('*').eq('grant_id', grantId).order('due_date', { ascending: true }),
      supabase.from('program_tasks').select('id,title,status,due_date,assignee_id').eq('grant_id', grantId).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('program_projects').select('id,name').order('name'),
    ]);
    if (g.error) { setError(g.error.message); return; }
    if (!g.data) { setMissing(true); return; }
    setGrant(g.data as Grant);
    setEvents((e.data || []) as GrantEvent[]);
    setPayments((p.data || []) as Payment[]);
    setReports((r.data || []) as Report[]);
    setTasks((t.data || []) as GrantTask[]);
    setProjects((pr.data || []) as { id: string; name: string }[]);
  }, [grantId]);
  useEffect(() => { void load(); }, [load]);

  const patch = async (values: Partial<Grant>, activity?: string) => {
    setGrant((current) => (current ? { ...current, ...values } : current));
    const { error: updateError } = await supabase.from('grants').update(values).eq('id', grantId);
    if (updateError) { setError(updateError.message); void load(); return; }
    setError('');
    if (activity) void logActivity('grant', grantId, activity);
    if (values.stage) {
      await supabase.from('grant_events').insert({ grant_id: grantId, event_type: 'stage_change', title: `Stage changed to ${stageLabel(values.stage)}` });
      setTimeout(() => void load(), 600);
    }
  };
  const addEvent = async (values: Partial<GrantEvent> & { title: string }) => {
    const { error: insertError } = await supabase.from('grant_events').insert({ grant_id: grantId, ...values });
    if (insertError) { setError(insertError.message); return false; }
    await load();
    return true;
  };
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name || '—';

  if (missing) return <main className="flex-1 p-8 text-sm text-slate-500">This grant could not be found. <button type="button" onClick={() => goTo('/finance/grants')} className="font-bold text-brand-600">Back to grants</button></main>;
  if (!grant) return <main className="flex-1 p-8 text-xs text-slate-400">{error || 'Loading grant…'}</main>;

  const text = (key: keyof Grant, title: string, type: 'text' | 'date' | 'url' | 'email' = 'text') => (
    <label className={label}>{title}<input type={type} value={String(grant[key] ?? '')} onChange={(event) => setGrant({ ...grant, [key]: event.target.value })} onBlur={(event) => void patch({ [key]: event.target.value.trim() || null } as Partial<Grant>)} className={field} /></label>
  );
  const area = (key: keyof Grant, title: string, placeholder = '') => (
    <label className={label}>{title}<textarea rows={3} value={String(grant[key] ?? '')} placeholder={placeholder} onChange={(event) => setGrant({ ...grant, [key]: event.target.value })} onBlur={(event) => void patch({ [key]: event.target.value.trim() || null } as Partial<Grant>)} className={field} /></label>
  );
  const amount = (key: 'amount_requested' | 'amount_awarded', title: string) => (
    <label className={label}>{title}<input type="number" min="0" step="0.01" value={grant[key] ?? ''} onChange={(event) => setGrant({ ...grant, [key]: event.target.value === '' ? null : Number(event.target.value) })} onBlur={(event) => void patch({ [key]: event.target.value === '' ? null : Number(event.target.value) })} className={field} /></label>
  );

  const received = payments.filter((row) => row.status === 'received').reduce((sum, row) => sum + Number(row.amount), 0);
  const reportsOpen = reports.filter((row) => ['upcoming', 'overdue'].includes(row.status)).length;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <button type="button" onClick={() => goTo('/finance/grants')} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-brand-600"><ArrowLeft className="h-3.5 w-3.5" />Grants</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <input value={grant.name} onChange={(event) => setGrant({ ...grant, name: event.target.value })} onBlur={(event) => event.target.value.trim() && void patch({ name: event.target.value.trim() })} aria-label="Grant name" className="w-full rounded-lg border border-transparent bg-transparent px-1 text-xl font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-brand-400" />
            <p className="px-1 text-xs text-slate-500">{grant.funder_name || 'No funder set'} · Owner {userName(grant.owner_id)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stageTone(grant.stage)}`}>{stageLabel(grant.stage)}</span>
            <select value={grant.stage} onChange={(event) => void patch({ stage: event.target.value }, `moved stage to ${stageLabel(event.target.value)}`)} aria-label="Stage" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-base md:text-xs">{GRANT_STAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
            <button type="button" onClick={async () => { if (!window.confirm('Delete this grant and its timeline?')) return; const { error: deleteError } = await supabase.from('grants').delete().eq('id', grantId); if (deleteError) setError(deleteError.message); else goTo('/finance/grants'); }} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          {[['Requested', grant.grant_type === 'product' ? grant.in_kind_requested || '—' : money(grant.amount_requested)], ['Awarded', grant.grant_type === 'product' ? grant.in_kind_awarded || '—' : money(grant.amount_awarded)], ['Received', money(received)], ['Reports open', String(reportsOpen)], ['Next follow-up', grant.next_follow_up_at || '—']].map(([title, value]) => <div key={title} className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-slate-500">{title}</p><p className="text-sm font-bold text-slate-900">{value}</p></div>)}
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Grant sections">{TABS.map((name) => <button type="button" key={name} onClick={() => setTab(name)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${tab === name ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{name}</button>)}</nav>
      </header>

      <div className="space-y-4 p-5 sm:p-8">
        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}

        {tab === 'Overview' && <KeyDates grant={grant} />}
        {tab === 'Overview' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${card} space-y-3`}>
              <h3 className="text-sm font-bold text-slate-900">Funder & contact</h3>
              {text('funder_name', 'Funder / organization')}
              <FunderPicker grant={grant} onLink={(values) => void patch(values, 'linked a CRM funder')} onError={setError} />
              <div className="grid gap-3 sm:grid-cols-2">{text('contact_name', 'Contact name')}{text('contact_email', 'Contact email', 'email')}{text('contact_phone', 'Contact phone')}{text('website_url', 'Website', 'url')}{text('portal_url', 'Funder portal', 'url')}{text('application_url', 'Application link', 'url')}</div>
              <label className={label}>Other funder email addresses (comma separated, used to match emails)<input value={grant.funder_emails.join(', ')} onChange={(event) => setGrant({ ...grant, funder_emails: event.target.value.split(',').map((item) => item.trim()) })} onBlur={() => void patch({ funder_emails: grant.funder_emails.filter(Boolean).map((item) => item.toLowerCase()) })} className={field} /></label>
              <div className="flex flex-wrap gap-3 text-xs font-semibold text-brand-600">{[['Website', grant.website_url], ['Portal', grant.portal_url], ['Application', grant.application_url]].map(([name, url]) => url && /^https?:\/\//i.test(url) ? <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />{name}</a> : null)}</div>
            </section>
            <Fold title="How we found it & who secured it"><div className="space-y-3">
              <label className={label}>Source<select value={grant.source || ''} onChange={(event) => void patch({ source: event.target.value || null })} className={field}><option value="">Not recorded</option>{SOURCES.map((item) => <option key={item}>{item}</option>)}</select></label>
              {area('source_detail', 'How we heard about it', 'Who told us, where we saw it, the story…')}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>Secured by<select value={grant.secured_by_id || ''} onChange={(event) => void patch({ secured_by_id: event.target.value || null }, 'set who secured the grant')} className={field}><option value="">Not set</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
                <label className={label}>Grant owner<select value={grant.owner_id || ''} onChange={(event) => void patch({ owner_id: event.target.value || null })} className={field}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
              </div>
              <label className={label}>Linked project<select value={grant.project_id || ''} onChange={(event) => void patch({ project_id: event.target.value || null }, 'linked a project')} className={field}><option value="">None</option>{projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              {grant.project_id && <button type="button" onClick={() => goTo(`/programs/project/${grant.project_id}`)} className="text-xs font-bold text-brand-600">Open project</button>}
            </div></Fold>
            <section className={`${card} space-y-3`}>
              <h3 className="text-sm font-bold text-slate-900">Ask & award</h3>
              <label className={label}>Grant type<select value={grant.grant_type} onChange={(event) => void patch({ grant_type: event.target.value }, 'changed the grant type')} className={field}>{GRANT_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
              <div className="grid gap-3 sm:grid-cols-2">{grant.grant_type !== 'product' && amount('amount_requested', 'Cash requested ($)')}{grant.grant_type !== 'product' && amount('amount_awarded', 'Cash awarded ($)')}{grant.grant_type !== 'money' && text('in_kind_requested', 'Product requested')}{grant.grant_type !== 'money' && text('in_kind_awarded', 'Product awarded')}</div>
              <div className="grid gap-3 sm:grid-cols-2">{text('application_submitted_at', 'Application sent', 'date')}{text('decision_due_at', 'Decision expected', 'date')}{text('decision_at', 'Decision received', 'date')}{text('award_date', 'Award date', 'date')}{text('term_start', 'Term start', 'date')}{text('term_end', 'Term end', 'date')}{text('next_follow_up_at', 'Next follow-up', 'date')}</div>
            </section>
            <Fold title="Response, terms & what we owe"><div className="space-y-3">
              {area('funder_response', 'Funder response', 'What the funder said about our application')}
              {area('decision_notes', 'Decision notes')}
              {area('obligations', 'What we must do in return', 'Recognition, reports, events, deliverables…')}
              {area('restrictions', 'Restrictions on use of funds')}
              {text('match_required', 'Matching funds required')}
            </div></Fold>
            <section className="lg:col-span-2"><h3 className="mb-2 text-sm font-bold text-slate-900">Notes</h3><RichNotes value={grant.notes || ''} onSave={(html) => patch({ notes: html }, 'updated notes')} placeholder="Research, strategy, internal notes…" /></section>
          </div>
        )}

        {tab === 'Overview' && (
          <div className="space-y-4">
            <Fold title="People & contacts"><PeopleTab grant={grant} onError={setError} onGrantChange={(values) => setGrant((current) => (current ? { ...current, ...values } : current))} /></Fold>
            <Fold title="Application requirements"><RequirementsTab grantId={grantId} userName={userName} users={users} onError={setError} /></Fold>
            <Fold title="AI assistant"><AiTab grantId={grantId} onSaveDraft={(title, body) => addEvent({ title, body, event_type: 'note', event_date: new Date().toISOString() })} /></Fold>
          </div>
        )}
        {tab === 'Activity' && (
          <div className="space-y-4">
            <Fold title="Timeline" open><TimelineTab events={events} onAdd={addEvent} onDelete={async (id) => { await supabase.from('grant_events').delete().eq('id', id); await load(); }} userName={userName} /></Fold>
            <Fold title="Tasks"><TasksTab grant={grant} tasks={tasks} currentUserId={currentUser.id} userName={userName} onChanged={load} onError={setError} /></Fold>
            <Fold title="Emails"><EmailsTab grant={grant} events={events} onLog={addEvent} onFollowUp={() => undefined} /></Fold>
            <Fold title="Discussion"><div className="grid gap-4 lg:grid-cols-2"><CommentsPanel entityType="grant" entityId={grantId} /><ActivityPanel entityType="grant" entityId={grantId} /></div></Fold>
          </div>
        )}
        {tab === 'Files & reports' && (
          <div className="space-y-4">
            <MoneyTab grantId={grantId} payments={payments} reports={reports} onChanged={load} onError={setError} />
            <div className="grid gap-4 lg:grid-cols-2"><AttachmentsPanel entityType="grant" entityId={grantId} /><LinksPanel entityType="grant" entityId={grantId} /></div>
          </div>
        )}
      </div>
    </main>
  );
};

const TimelineTab: React.FC<{ events: GrantEvent[]; onAdd: (values: { title: string; body?: string; event_type: string; event_date: string }) => Promise<boolean>; onDelete: (id: string) => void; userName: (id: string | null) => string }> = ({ events, onAdd, onDelete, userName }) => {
  const [form, setForm] = useState({ event_type: 'note', title: '', body: '', event_date: new Date().toISOString().slice(0, 10) });
  const submit = async () => {
    if (!form.title.trim()) return;
    if (await onAdd({ event_type: form.event_type, title: form.title.trim(), body: form.body.trim() || undefined, event_date: new Date(`${form.event_date}T12:00:00`).toISOString() })) setForm({ ...form, title: '', body: '' });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className={card}>
        <h3 className="mb-3 text-sm font-bold text-slate-900">Timeline</h3>
        <ol className="space-y-3 border-l-2 border-slate-100 pl-4">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-xs font-bold text-slate-900">{event.title}</p><p className="text-xs text-slate-500">{eventLabel(event.event_type)} · {formatDateTime(event.event_date)}{event.created_by ? ` · ${userName(event.created_by)}` : ''}</p></div>
                <button type="button" aria-label="Delete entry" onClick={() => onDelete(event.id)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {event.body && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{event.body}</p>}
              {(event.email_from || event.email_to) && <p className="mt-1 text-xs text-slate-500">{event.email_from && `From ${event.email_from}`} {event.email_to && `To ${event.email_to}`}</p>}
            </li>
          ))}
          {!events.length && <li className="text-xs text-slate-400">Nothing on the timeline yet.</li>}
        </ol>
      </section>
      <section className={`${card} h-fit space-y-2`}>
        <h3 className="text-sm font-bold text-slate-900">Add to timeline</h3>
        <select value={form.event_type} onChange={(event) => setForm({ ...form, event_type: event.target.value })} aria-label="Entry type" className={field}>{EVENT_TYPES.map((type) => <option key={type} value={type}>{eventLabel(type)}</option>)}</select>
        <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What happened?" className={field} />
        <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} rows={3} placeholder="Details" className={field} />
        <input type="date" value={form.event_date} onChange={(event) => setForm({ ...form, event_date: event.target.value })} className={field} />
        <button type="button" onClick={() => void submit()} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" />Add entry</button>
      </section>
    </div>
  );
};

const EmailsTab: React.FC<{ grant: Grant; events: GrantEvent[]; onLog: (values: Partial<GrantEvent> & { title: string }) => Promise<boolean>; onFollowUp: () => void }> = ({ grant, events, onLog }) => {
  const [matches, setMatches] = useState<InboxEmail[]>([]);
  const [results, setResults] = useState<InboxEmail[]>([]);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState({ direction: 'email_received', subject: '', from: '', to: '', body: '' });
  const addresses = useMemo(() => Array.from(new Set([grant.contact_email, ...grant.funder_emails].filter(Boolean).map((value) => String(value).toLowerCase()))), [grant.contact_email, grant.funder_emails]);
  const linked = useMemo(() => new Set(events.map((event) => event.email_message_id).filter(Boolean)), [events]);
  const columns = 'id,subject,sender_name,sender_email,to_recipients,received_at,folder';

  useEffect(() => {
    if (!addresses.length) { setMatches([]); return; }
    const filters = addresses.flatMap((address) => [`sender_email.ilike.${address}`, `to_recipients.cs.[{"email":"${address}"}]`]).join(',');
    void supabase.from('email_messages').select(columns).or(filters).neq('folder', 'trash').order('received_at', { ascending: false }).limit(30).then(({ data }) => setMatches((data || []) as InboxEmail[]));
  }, [addresses]);

  const search = async () => {
    const term = query.trim().replace(/[,()%]/g, ' ');
    if (!term) { setResults([]); return; }
    const { data } = await supabase.from('email_messages').select(columns).or(`subject.ilike.%${term}%,sender_email.ilike.%${term}%,sender_name.ilike.%${term}%`).neq('folder', 'trash').order('received_at', { ascending: false }).limit(20);
    setResults((data || []) as InboxEmail[]);
  };
  const link = (email: InboxEmail) => onLog({
    title: email.subject || '(no subject)', event_type: email.folder === 'sent' ? 'email_sent' : 'email_received', event_date: email.received_at, email_message_id: email.id,
    email_from: email.sender_email, email_to: (email.to_recipients || []).map((item) => item.email).join(', '),
  });
  const row = (email: InboxEmail) => (
    <li key={email.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
      <div className="min-w-0"><p className="truncate font-semibold text-slate-800">{email.subject || '(no subject)'}</p><p className="truncate text-slate-500">{email.sender_name || email.sender_email} · {formatDateTime(email.received_at)}</p></div>
      {linked.has(email.id) ? <span className="shrink-0 font-semibold text-emerald-600">Linked</span> : <button type="button" onClick={() => void link(email)} className="inline-flex shrink-0 items-center gap-1 font-bold text-brand-600"><Link2 className="h-3 w-3" />Link</button>}
    </li>
  );
  const logged = events.filter((event) => event.event_type === 'email_sent' || event.event_type === 'email_received');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${card} space-y-2`}>
        <h3 className="text-sm font-bold text-slate-900">Logged emails</h3>
        <ul className="space-y-1">{logged.map((event) => <li key={event.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs"><p className="font-semibold text-slate-800"><Mail className="mr-1 inline h-3 w-3" />{event.title}</p><p className="text-slate-500">{eventLabel(event.event_type)} · {formatDateTime(event.event_date)}{event.email_from ? ` · ${event.email_from}` : ''}</p>{event.body && <p className="mt-1 whitespace-pre-wrap text-slate-600">{event.body}</p>}</li>)}{!logged.length && <li className="text-xs text-slate-400">No emails logged yet.</li>}</ul>
      </section>
      <div className="space-y-4">
        <section className={`${card} space-y-2`}>
          <h3 className="text-sm font-bold text-slate-900">Matched from your inbox</h3>
          <p className="text-xs text-slate-500">{addresses.length ? `Emails to or from ${addresses.join(', ')}` : 'Add a contact or funder email on the Overview tab to auto-match emails.'}</p>
          <ul className="space-y-1">{matches.map(row)}{addresses.length > 0 && !matches.length && <li className="text-xs text-slate-400">No matching emails found.</li>}</ul>
        </section>
        <section className={`${card} space-y-2`}>
          <h3 className="text-sm font-bold text-slate-900">Find an email to link</h3>
          <div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} placeholder="Subject or sender" className={field} /><button type="button" onClick={() => void search()} aria-label="Search emails" className="rounded-lg bg-brand-600 px-3 text-white"><Search className="h-3.5 w-3.5" /></button></div>
          <ul className="space-y-1">{results.map(row)}</ul>
        </section>
        <section className={`${card} space-y-2`}>
          <h3 className="text-sm font-bold text-slate-900">Log an email manually</h3>
          <select value={manual.direction} onChange={(event) => setManual({ ...manual, direction: event.target.value })} className={field} aria-label="Direction"><option value="email_received">Received from funder</option><option value="email_sent">Sent to funder</option></select>
          <input value={manual.subject} onChange={(event) => setManual({ ...manual, subject: event.target.value })} placeholder="Subject" className={field} />
          <div className="grid grid-cols-2 gap-2"><input value={manual.from} onChange={(event) => setManual({ ...manual, from: event.target.value })} placeholder="From" className={field} /><input value={manual.to} onChange={(event) => setManual({ ...manual, to: event.target.value })} placeholder="To" className={field} /></div>
          <textarea value={manual.body} onChange={(event) => setManual({ ...manual, body: event.target.value })} rows={3} placeholder="Paste the email or a summary" className={field} />
          <button type="button" onClick={async () => { if (!manual.subject.trim()) return; if (await onLog({ title: manual.subject.trim(), event_type: manual.direction, body: manual.body.trim() || null, email_from: manual.from.trim() || null, email_to: manual.to.trim() || null })) setManual({ ...manual, subject: '', from: '', to: '', body: '' }); }} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white">Log email</button>
        </section>
      </div>
    </div>
  );
};

const MoneyTab: React.FC<{ grantId: string; payments: Payment[]; reports: Report[]; onChanged: () => void; onError: (message: string) => void }> = ({ grantId, payments, reports, onChanged, onError }) => {
  const [pay, setPay] = useState({ amount: '', status: 'expected', date: '', method: '' });
  const [rep, setRep] = useState({ title: '', due_date: '' });
  const run = async (action: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await action; if (error) onError(error.message); else onChanged(); };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${card} space-y-2`}>
        <h3 className="text-sm font-bold text-slate-900">Payments</h3>
        <ul className="space-y-1">{payments.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
            <div><p className="font-semibold text-slate-800">{money(row.amount)} <span className={row.status === 'received' ? 'text-emerald-600' : 'text-amber-600'}>{row.status}</span></p><p className="text-slate-500">{row.status === 'received' ? `Received ${row.received_date || ''}` : `Expected ${row.expected_date || 'TBD'}`}{row.method ? ` · ${row.method}` : ''}</p></div>
            <div className="flex gap-2">{row.status !== 'received' && <button type="button" onClick={() => void run(supabase.from('grant_payments').update({ status: 'received', received_date: today }).eq('id', row.id))} className="font-bold text-emerald-600">Mark received</button>}<button type="button" aria-label="Delete payment" onClick={() => void run(supabase.from('grant_payments').delete().eq('id', row.id))} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>
          </li>
        ))}{!payments.length && <li className="text-xs text-slate-400">No payments recorded.</li>}</ul>
        <div className="grid grid-cols-2 gap-2"><input type="number" min="0" step="0.01" value={pay.amount} onChange={(event) => setPay({ ...pay, amount: event.target.value })} placeholder="Amount" className={field} /><select value={pay.status} onChange={(event) => setPay({ ...pay, status: event.target.value })} className={field} aria-label="Payment status"><option value="expected">Expected</option><option value="received">Received</option></select><input type="date" value={pay.date} onChange={(event) => setPay({ ...pay, date: event.target.value })} className={field} aria-label="Payment date" /><input value={pay.method} onChange={(event) => setPay({ ...pay, method: event.target.value })} placeholder="Method (check, ACH…)" className={field} /></div>
        <button type="button" onClick={() => { if (!pay.amount) return; void run(supabase.from('grant_payments').insert({ grant_id: grantId, amount: Number(pay.amount), status: pay.status, expected_date: pay.status === 'expected' ? pay.date || null : null, received_date: pay.status === 'received' ? pay.date || today : null, method: pay.method || null }).then((result) => { setPay({ amount: '', status: 'expected', date: '', method: '' }); return result; })); }} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white">Add payment</button>
      </section>
      <section className={`${card} space-y-2`}>
        <h3 className="text-sm font-bold text-slate-900">Reports & compliance</h3>
        <ul className="space-y-1">{reports.map((row) => {
          const late = row.status === 'upcoming' && row.due_date && row.due_date < today;
          return (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
              <div><p className="font-semibold text-slate-800">{row.title}</p><p className={late ? 'font-semibold text-rose-600' : 'text-slate-500'}>{row.due_date ? `Due ${row.due_date}` : 'No due date'}{late ? ' · overdue' : ''}</p></div>
              <div className="flex items-center gap-2"><select value={row.status} onChange={(event) => void run(supabase.from('grant_reports').update({ status: event.target.value, submitted_at: ['submitted', 'accepted'].includes(event.target.value) ? today : null }).eq('id', row.id))} aria-label="Report status" className="rounded-lg border border-slate-200 px-2 py-1 text-base md:text-xs"><option value="upcoming">Upcoming</option><option value="submitted">Submitted</option><option value="accepted">Accepted</option><option value="overdue">Overdue</option></select><button type="button" aria-label="Delete report" onClick={() => void run(supabase.from('grant_reports').delete().eq('id', row.id))} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>
            </li>
          );
        })}{!reports.length && <li className="text-xs text-slate-400">No reports scheduled.</li>}</ul>
        <div className="grid grid-cols-2 gap-2"><input value={rep.title} onChange={(event) => setRep({ ...rep, title: event.target.value })} placeholder="Report title" className={field} /><input type="date" value={rep.due_date} onChange={(event) => setRep({ ...rep, due_date: event.target.value })} className={field} aria-label="Report due date" /></div>
        <button type="button" onClick={() => { if (!rep.title.trim()) return; void run(supabase.from('grant_reports').insert({ grant_id: grantId, title: rep.title.trim(), due_date: rep.due_date || null }).then((result) => { setRep({ title: '', due_date: '' }); return result; })); }} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white">Add report</button>
      </section>
    </div>
  );
};

const TasksTab: React.FC<{ grant: Grant; tasks: GrantTask[]; currentUserId: string; userName: (id: string | null) => string; onChanged: () => void; onError: (message: string) => void }> = ({ grant, tasks, currentUserId, userName, onChanged, onError }) => {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const add = async () => {
    if (!title.trim()) return;
    const { error } = await supabase.from('program_tasks').insert({ title: title.trim(), grant_id: grant.id, project_id: grant.project_id, assignee_id: grant.owner_id || currentUserId, due_date: due || null, status: 'not_started', priority: 'medium', progress: 0, created_by: currentUserId, source: 'grant' });
    if (error) onError(error.message); else { setTitle(''); setDue(''); onChanged(); }
  };
  const toggle = async (task: GrantTask) => {
    const status = task.status === 'completed' ? 'not_started' : 'completed';
    const { error } = await supabase.from('program_tasks').update({ status, progress: status === 'completed' ? 100 : 0, completed_at: status === 'completed' ? new Date().toISOString() : null }).eq('id', task.id);
    if (error) onError(error.message); else onChanged();
  };
  return (
    <section className={`${card} space-y-2`}>
      <h3 className="text-sm font-bold text-slate-900">Follow-ups & award tasks</h3>
      <p className="text-xs text-slate-500">Tasks created automatically when the grant is awarded appear here and in each person's task list. Edit the default checklist from the Grants page settings.</p>
      <ul className="space-y-1">{tasks.map((task) => <li key={task.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs"><input type="checkbox" checked={task.status === 'completed'} onChange={() => void toggle(task)} className="h-4 w-4" aria-label={`Complete ${task.title}`} /><button type="button" onClick={() => goTo(`/programs/task/${task.id}`)} className={`min-w-0 flex-1 truncate text-left font-semibold hover:text-brand-600 ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</button><span className="shrink-0 text-slate-500">{userName(task.assignee_id)}{task.due_date ? ` · ${task.due_date}` : ''}</span></li>)}{!tasks.length && <li className="text-xs text-slate-400">No tasks yet.</li>}</ul>
      <div className="flex flex-wrap gap-2"><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add(); }} placeholder="Add a follow-up task" className={`${field} min-w-0 flex-1`} /><input type="date" value={due} onChange={(event) => setDue(event.target.value)} className={`${field} w-auto`} aria-label="Due date" /><button type="button" onClick={() => void add()} className="rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">Add</button></div>
    </section>
  );
};
