import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { card, field } from '../work/EntityPanels';
import { TemplatesModal } from './GrantsPage';
import { GRANT_STAGES, Grant, askGrantAi, daysFromNow, dueTone, goTo, money, stageLabel, stageTone } from './grantShared';

type Report = { id: string; grant_id: string; title: string; due_date: string | null; submitted_at: string | null; status: string; notes: string | null };
type Payment = { id: string; grant_id: string; amount: number; status: string; expected_date: string | null; received_date: string | null };
type Prospect = { id: string; name: string; funder_name: string | null; deadline: string | null; status: string };
type Org = { id: string; name: string; category: string; website: string | null };

const Shell: React.FC<{ title: string; blurb: string; actions?: React.ReactNode; error?: string; children: React.ReactNode }> = ({ title, blurb, actions, error, children }) => (
  <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8"><div><h1 className="text-xl font-bold text-slate-900">{title}</h1><p className="mt-1 text-xs text-slate-500">{blurb}</p></div>{actions}</header>
    <div className="space-y-4 p-5 sm:p-8">{error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}{children}</div>
  </main>
);

const useGrantData = () => {
  const [state, setState] = useState<{ grants: Grant[]; reports: Report[]; payments: Payment[]; prospects: Prospect[]; error: string; loading: boolean }>({ grants: [], reports: [], payments: [], prospects: [], error: '', loading: true });
  const load = useCallback(async () => {
    const [g, r, p, pr] = await Promise.all([
      supabase.from('grants').select('*'), supabase.from('grant_reports').select('*').order('due_date'), supabase.from('grant_payments').select('*'), supabase.from('grant_prospects').select('id,name,funder_name,deadline,status'),
    ]);
    const firstError = g.error || r.error || p.error;
    setState({ grants: (g.data || []) as Grant[], reports: (r.data || []) as Report[], payments: (p.data || []) as Payment[], prospects: (pr.data || []) as Prospect[], error: firstError ? `Some grant data could not be loaded: ${firstError.message}` : '', loading: false });
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load };
};

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (<div className={card}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p>{hint && <p className="text-xs text-slate-400">{hint}</p>}</div>);
const OPEN_STAGES = ['prospect', 'researching', 'preparing', 'applied', 'under_review'];

export const GrantsOverview: React.FC = () => {
  const { grants, reports, payments, prospects, error, loading } = useGrantData();
  const [briefing, setBriefing] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const awarded = grants.filter((g) => ['awarded', 'reporting', 'closed'].includes(g.stage));
  const pending = grants.filter((g) => ['applied', 'under_review'].includes(g.stage));
  const received = payments.filter((p) => p.status === 'received').reduce((sum, p) => sum + Number(p.amount), 0);
  const expected = payments.filter((p) => p.status === 'expected').reduce((sum, p) => sum + Number(p.amount), 0);
  const upcoming = useMemo(() => {
    const items: { date: string; label: string; kind: string; path: string }[] = [];
    prospects.filter((p) => p.deadline && ['new', 'reviewing', 'pursuing'].includes(p.status)).forEach((p) => items.push({ date: p.deadline!, label: p.name, kind: 'Prospect deadline', path: '/finance/prospects' }));
    reports.filter((r) => r.due_date && ['upcoming', 'overdue'].includes(r.status)).forEach((r) => items.push({ date: r.due_date!, label: r.title, kind: 'Report due', path: `/finance/grants/${r.grant_id}` }));
    grants.filter((g) => g.next_follow_up_at && !['declined', 'closed'].includes(g.stage)).forEach((g) => items.push({ date: g.next_follow_up_at!.slice(0, 10), label: g.name, kind: 'Follow up', path: `/finance/grants/${g.id}` }));
    return items.filter((item) => (daysFromNow(item.date) ?? 99) <= 30).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [grants, reports, prospects]);
  const brief = async () => { setBusy(true); setAiError(''); try { const result = await askGrantAi<{ text?: string }>({ action: 'pipeline' }); setBriefing(result.text || ''); } catch (e) { setAiError(e instanceof Error ? e.message : 'AI request failed.'); } finally { setBusy(false); } };
  if (loading) return <Shell title="Grants overview" blurb="Loading…">{null}</Shell>;
  return (
    <Shell title="Grants overview" blurb="Pipeline, money and what needs attention." error={error} actions={<button type="button" onClick={() => void brief()} disabled={busy} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-60 md:min-h-0 md:py-2"><Sparkles className="h-3.5 w-3.5" />{busy ? 'Thinking…' : 'AI pipeline briefing'}</button>}>
      {(briefing || aiError) && <div className={card}>{aiError ? <p role="alert" className="text-xs text-rose-700">{aiError}</p> : <p className="whitespace-pre-wrap text-xs text-slate-700">{briefing}</p>}</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending decisions" value={money(pending.reduce((s, g) => s + Number(g.amount_requested || 0), 0))} hint={`${pending.length} applications`} />
        <Stat label="Awarded" value={money(awarded.reduce((s, g) => s + Number(g.amount_awarded || 0), 0))} hint={`${awarded.length} grants`} />
        <Stat label="Received" value={money(received)} />
        <Stat label="Expected payments" value={money(expected)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}><h2 className="mb-2 text-sm font-bold text-slate-900">Coming up (30 days)</h2>
          {upcoming.length ? <ul className="divide-y divide-slate-100">{upcoming.map((item, index) => <li key={index}><button type="button" onClick={() => goTo(item.path)} className="flex w-full items-center justify-between gap-2 py-2 text-left text-xs"><span><span className="font-semibold text-slate-800">{item.label}</span><span className="block text-slate-400">{item.kind}</span></span><span className={dueTone(item.date)}>{item.date}</span></button></li>)}</ul> : <p className="text-xs text-slate-400">Nothing due in the next 30 days.</p>}
        </section>
        <section className={card}><h2 className="mb-2 text-sm font-bold text-slate-900">Pipeline by stage</h2>
          <ul className="space-y-1">{GRANT_STAGES.map(([stage, label]) => { const rows = grants.filter((g) => g.stage === stage); return <li key={stage} className="flex items-center justify-between text-xs"><span className={`rounded-full px-2 py-0.5 font-semibold ${stageTone(stage)}`}>{label}</span><span className="text-slate-600">{rows.length} · {money(rows.reduce((s, g) => s + Number((OPEN_STAGES.includes(stage) ? g.amount_requested : g.amount_awarded ?? g.amount_requested) || 0), 0))}</span></li>; })}</ul>
        </section>
      </div>
    </Shell>
  );
};

export const GrantReports: React.FC = () => {
  const { grants, reports, payments, error, reload } = useGrantData();
  const [msg, setMsg] = useState('');
  const name = (id: string) => grants.find((g) => g.id === id)?.name || 'Grant';
  const mark = async (table: 'grant_reports' | 'grant_payments', id: string, values: Record<string, unknown>) => { const { error: e } = await supabase.from(table).update(values).eq('id', id); if (e) setMsg(e.message); else { setMsg(''); await reload(); } };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Shell title="Reports & payments" blurb="Reporting obligations and incoming payments across all grants. Add new ones from a grant's Money tab." error={msg || error}>
      <section className={card}><h2 className="mb-2 text-sm font-bold text-slate-900">Reports</h2>
        {reports.length ? <ul className="divide-y divide-slate-100">{reports.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><button type="button" onClick={() => goTo(`/finance/grants/${r.grant_id}`)} className="text-left"><span className="font-semibold text-slate-800">{r.title}</span><span className="block text-slate-400">{name(r.grant_id)}</span></button><span className="flex items-center gap-2"><span className={dueTone(r.due_date)}>{r.due_date || 'No date'}</span><select aria-label="Report status" value={r.status} onChange={(e) => void mark('grant_reports', r.id, { status: e.target.value, submitted_at: ['submitted', 'accepted'].includes(e.target.value) ? r.submitted_at || today : null })} className="rounded-lg border border-slate-200 px-2 py-1 text-base md:text-xs"><option value="upcoming">Upcoming</option><option value="submitted">Submitted</option><option value="accepted">Accepted</option><option value="overdue">Overdue</option></select></span></li>)}</ul> : <p className="text-xs text-slate-400">No reports yet.</p>}
      </section>
      <section className={card}><h2 className="mb-2 text-sm font-bold text-slate-900">Payments</h2>
        {payments.length ? <ul className="divide-y divide-slate-100">{payments.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><button type="button" onClick={() => goTo(`/finance/grants/${p.grant_id}`)} className="text-left"><span className="font-semibold text-slate-800">{money(p.amount)}</span><span className="block text-slate-400">{name(p.grant_id)}</span></button><span className="flex items-center gap-2"><span className={p.status === 'expected' ? dueTone(p.expected_date) : 'text-slate-500'}>{p.status === 'received' ? `Received ${p.received_date || ''}` : `Expected ${p.expected_date || '—'}`}</span>{p.status === 'expected' && <button type="button" onClick={() => void mark('grant_payments', p.id, { status: 'received', received_date: today })} className="rounded-lg border border-emerald-200 px-2 py-1 font-bold text-emerald-700">Mark received</button>}</span></li>)}</ul> : <p className="text-xs text-slate-400">No payments yet.</p>}
      </section>
    </Shell>
  );
};

type Settings = { id: string; follow_up_days_after_apply: number; report_reminder_days: number; deadline_reminder_days: number; task_on_apply: boolean; task_on_decline: boolean; remind_reports: boolean; remind_deadlines: boolean; remind_follow_ups: boolean; sync_crm: boolean };
const TOGGLES: [keyof Settings, string, string][] = [
  ['task_on_apply', 'Confirm receipt after applying', 'Creates a task to confirm the funder received the application.'],
  ['task_on_decline', 'Thank-you task on decline', 'Creates a task to thank the funder and ask for feedback.'],
  ['remind_reports', 'Report reminders', 'Creates tasks before reports are due.'],
  ['remind_deadlines', 'Prospect deadline reminders', 'Creates tasks before application deadlines.'],
  ['remind_follow_ups', 'Follow-up reminders', 'Creates tasks when a follow-up date arrives.'],
  ['sync_crm', 'Log emails, calls and meetings to the CRM', 'Mirrors grant activity onto the funder organization.'],
];

export const GrantAutomation: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [checklist, setChecklist] = useState(false);
  const canEdit = ['admin', 'coordinator'].includes(String(currentUser.systemRole));
  useEffect(() => { void supabase.from('grant_settings').select('*').limit(1).maybeSingle().then(({ data, error: e }) => { if (e) setError(`Settings could not be loaded: ${e.message}. Run the latest database migration.`); else setSettings(data as Settings | null); }); }, []);
  const update = async (values: Partial<Settings>) => { if (!settings) return; setSettings({ ...settings, ...values }); const { error: e } = await supabase.from('grant_settings').update(values).eq('id', settings.id); setError(e ? e.message : ''); };
  const run = async () => { const { data, error: e } = await supabase.rpc('grant_run_automations'); if (e) setError(e.message); else { setError(''); setResult(`${data ?? 0} new task${data === 1 ? '' : 's'} created.`); } };
  return (
    <Shell title="Automation" blurb="Rules that create tasks, reminders and CRM records for you." error={error} actions={<button type="button" onClick={() => void run()} className="min-h-11 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0 md:py-2">Run now</button>}>
      {result && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{result}</p>}
      {settings && <section className={card}>
        <ul className="divide-y divide-slate-100">{TOGGLES.map(([key, title, hint]) => <li key={key} className="flex items-start gap-3 py-2.5"><input type="checkbox" disabled={!canEdit} checked={Boolean(settings[key])} onChange={(e) => void update({ [key]: e.target.checked } as Partial<Settings>)} className="mt-0.5 h-4 w-4" aria-label={title} /><span className="text-xs"><span className="block font-semibold text-slate-800">{title}</span><span className="text-slate-500">{hint}</span></span></li>)}</ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">{([['follow_up_days_after_apply', 'Follow up after applying (days)'], ['report_reminder_days', 'Remind before reports (days)'], ['deadline_reminder_days', 'Remind before deadlines (days)']] as [keyof Settings, string][]).map(([key, label]) => <label key={key} className="text-xs font-semibold text-slate-500">{label}<input type="number" min="1" max="365" disabled={!canEdit} value={Number(settings[key])} onChange={(e) => void update({ [key]: Math.min(365, Math.max(1, Number(e.target.value) || 1)) } as Partial<Settings>)} className={field} /></label>)}</div>
        {!canEdit && <p className="mt-2 text-xs text-slate-400">Only admins and coordinators can change these rules.</p>}
      </section>}
      <section className={card}><h2 className="text-sm font-bold text-slate-900">Award checklist</h2><p className="mb-2 text-xs text-slate-500">Tasks created automatically when a grant is awarded.</p><button type="button" onClick={() => setChecklist(true)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">{canEdit ? 'Edit checklist' : 'View checklist'}</button></section>
      {checklist && <TemplatesModal onClose={() => setChecklist(false)} />}
    </Shell>
  );
};
