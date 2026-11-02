import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { card, field } from '../work/EntityPanels';
import { GrantDetail } from './GrantDetail';
import { GrantsPage } from './GrantsPage';
import { Grant, downloadCsv, goTo, money, stageLabel } from './grantShared';

type RecordType = 'budgets' | 'funding-requests' | 'expenses' | 'procurement';
type FinanceView = 'overview' | RecordType | 'accounting-reports';
type FinRecord = {
  id: string; record_type: RecordType; name: string; description: string | null; status: string; amount: number | null; due_date: string | null; owner_id: string | null;
  category: string | null; vendor: string | null; record_date: string | null; project_id: string | null; grant_id: string | null; created_at: string;
};
type Payment = { id: string; grant_id: string; amount: number; status: string; expected_date: string | null; received_date: string | null };
type Report = { id: string; grant_id: string; title: string; due_date: string | null; status: string };

const SECTIONS: Record<RecordType, { label: string; singular: string; blurb: string; statuses: string[]; dateLabel: string; showVendor: boolean }> = {
  budgets: { label: 'Budgets', singular: 'budget', blurb: 'Planned spending by project, program or grant.', statuses: ['draft', 'approved', 'active', 'closed'], dateLabel: 'Period end', showVendor: false },
  'funding-requests': { label: 'Funding Requests', singular: 'funding request', blurb: 'Internal requests for money, with approval status.', statuses: ['draft', 'submitted', 'approved', 'denied', 'funded'], dateLabel: 'Needed by', showVendor: false },
  expenses: { label: 'Expenses', singular: 'expense', blurb: 'Money spent, tagged to a project or grant.', statuses: ['requested', 'approved', 'purchased', 'reimbursed', 'rejected'], dateLabel: 'Expense date', showVendor: true },
  procurement: { label: 'Procurement', singular: 'purchase request', blurb: 'Equipment and supplies from request to delivery.', statuses: ['requested', 'approved', 'ordered', 'received', 'rejected'], dateLabel: 'Needed by', showVendor: true },
};
const CATEGORIES = ['Personnel', 'Program supplies', 'Equipment', 'Software', 'Travel', 'Events', 'Marketing', 'Professional services', 'Facilities', 'Other'];
const labels: Record<FinanceView | 'grants', string> = { overview: 'Overview', budgets: 'Budgets', grants: 'Grants', 'funding-requests': 'Funding Requests', expenses: 'Expenses', procurement: 'Procurement', 'accounting-reports': 'Accounting & Reports' };
const SPENT = ['approved', 'purchased', 'reimbursed', 'ordered', 'received'];
const BUDGET_LIVE = ['approved', 'active'];
const monthKey = (date: string) => date.slice(0, 7);
const recordDate = (row: FinRecord) => row.record_date || row.created_at.slice(0, 10);
const tone = (status: string) => (['approved', 'active', 'funded', 'purchased', 'reimbursed', 'received'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['denied', 'rejected'].includes(status) ? 'bg-rose-50 text-rose-700' : ['closed'].includes(status) ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700');
const cap = (value: string) => value.replace(/[-_]/g, ' ').replace(/^./, (char) => char.toUpperCase());

const parsePath = (path: string) => {
  const [, , seg, id] = path.split('/');
  if (seg === 'grants') return { view: 'grants' as const, grantId: id || null };
  return { view: (seg && seg in labels ? seg : 'overview') as FinanceView, grantId: null };
};

export const FinancePage: React.FC = () => {
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  useEffect(() => {
    const sync = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  if (route.view === 'grants') return route.grantId ? <GrantDetail key={route.grantId} grantId={route.grantId} /> : <GrantsPage />;
  return <FinanceWorkspace view={route.view} />;
};

const FinanceWorkspace: React.FC<{ view: FinanceView }> = ({ view }) => {
  const { users, currentUser } = useWorkspace();
  const [records, setRecords] = useState<FinRecord[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<FinRecord | 'new' | null>(null);

  const load = useCallback(async () => {
    const [r, g, p, rep, pr] = await Promise.all([
      supabase.from('finance_records').select('id,record_type,name,description,status,amount,due_date,owner_id,category,vendor,record_date,project_id,grant_id,created_at').order('created_at', { ascending: false }),
      supabase.from('grants').select('*'),
      supabase.from('grant_payments').select('id,grant_id,amount,status,expected_date,received_date'),
      supabase.from('grant_reports').select('id,grant_id,title,due_date,status'),
      supabase.from('program_projects').select('id,name').order('name'),
    ]);
    const failure = r.error || g.error;
    if (failure) setError(`Finance data could not be loaded: ${failure.message}. Run the latest database migration.`); else setError('');
    setRecords((r.data || []) as FinRecord[]); setGrants((g.data || []) as Grant[]); setPayments((p.data || []) as Payment[]); setReports((rep.data || []) as Report[]); setProjects((pr.data || []) as { id: string; name: string }[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSearch(''); setStatusFilter('all'); }, [view]);

  const section = view in SECTIONS ? SECTIONS[view as RecordType] : null;
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const projectName = (id: string | null) => projects.find((row) => row.id === id)?.name || '';
  const grantName = (id: string | null) => grants.find((row) => row.id === id)?.name || '';
  const shown = useMemo(() => records.filter((row) => row.record_type === view && (statusFilter === 'all' || row.status === statusFilter) && `${row.name} ${row.vendor || ''} ${row.category || ''} ${row.description || ''}`.toLowerCase().includes(search.toLowerCase())), [records, view, statusFilter, search]);

  const exportRecords = () => downloadCsv(`${view}.csv`, [['Name', 'Status', 'Amount', 'Category', 'Vendor', 'Date', 'Project', 'Grant', 'Owner'], ...shown.map((row) => [row.name, row.status, row.amount, row.category, row.vendor, recordDate(row), projectName(row.project_id), grantName(row.grant_id), userName(row.owner_id)])]);

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div><h1 className="text-xl font-bold text-slate-900">{labels[view]}</h1><p className="mt-1 text-xs text-slate-500">{section ? section.blurb : view === 'overview' ? 'Budget, spending, cash flow and the grant pipeline at a glance.' : 'Income and spending statements you can export.'}</p></div>
        {section && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={exportRecords} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 md:min-h-0 md:py-2"><Download className="h-3.5 w-3.5" />Export</button>
            <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />New {section.singular}</button>
          </div>
        )}
      </header>
      <div className="space-y-4 p-5 sm:p-8">
        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : view === 'overview' ? <Overview records={records} grants={grants} payments={payments} reports={reports} projects={projects} /> : view === 'accounting-reports' ? <Reports records={records} grants={grants} payments={payments} projects={projects} /> : section && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${section.label.toLowerCase()}`} className={`${field} pl-9`} /></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-base md:text-xs"><option value="all">All statuses</option>{section.statuses.map((status) => <option key={status} value={status}>{cap(status)}</option>)}</select>
              <span className="ml-auto text-xs font-semibold text-slate-600">{shown.length} records · {money(shown.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</span>
            </div>
            {shown.length ? (
              <div className="space-y-2">{shown.map((row) => (
                <button type="button" key={row.id} onClick={() => setEditing(row)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-brand-400">
                  <div className="min-w-0"><p className="text-sm font-bold text-slate-900">{row.name}</p><p className="text-xs text-slate-500">{[row.category, row.vendor, projectName(row.project_id) && `Project: ${projectName(row.project_id)}`, grantName(row.grant_id) && `Grant: ${grantName(row.grant_id)}`, recordDate(row)].filter(Boolean).join(' · ')}</p></div>
                  <div className="flex items-center gap-3 text-xs"><span className="font-semibold text-slate-800">{money(row.amount)}</span><span className={`rounded-full px-2 py-0.5 font-semibold ${tone(row.status)}`}>{cap(row.status)}</span></div>
                </button>
              ))}</div>
            ) : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">{records.some((row) => row.record_type === view) ? 'Nothing matches your filters.' : `No ${section.label.toLowerCase()} yet.`}</div>}
          </>
        )}
      </div>
      {editing && section && <RecordModal type={view as RecordType} def={section} record={editing === 'new' ? null : editing} userId={currentUser.id} users={users} projects={projects} grants={grants} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </main>
  );
};

const Bars: React.FC<{ rows: { label: string; a: number; b?: number }[]; aLabel: string; bLabel?: string }> = ({ rows, aLabel, bLabel }) => {
  const max = Math.max(1, ...rows.flatMap((row) => [row.a, row.b || 0]));
  return (
    <div>
      <div className="flex h-36 items-end gap-3">{rows.map((row) => (
        <div key={row.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-28 w-full items-end justify-center gap-1"><div title={`${aLabel} ${money(row.a)}`} style={{ height: `${(row.a / max) * 100}%` }} className="w-3 rounded-t bg-brand-500" />{bLabel && <div title={`${bLabel} ${money(row.b)}`} style={{ height: `${((row.b || 0) / max) * 100}%` }} className="w-3 rounded-t bg-emerald-400" />}</div>
          <span className="text-xs text-slate-500">{row.label}</span>
        </div>
      ))}</div>
      <p className="mt-1 text-xs text-slate-500"><span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-500" />{aLabel}</span>{bLabel && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />{bLabel}</span>}</p>
    </div>
  );
};

const lastMonths = (count: number) => Array.from({ length: count }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (count - 1 - index)); return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: date.toLocaleString([], { month: 'short' }) }; });

const Overview: React.FC<{ records: FinRecord[]; grants: Grant[]; payments: Payment[]; reports: Report[]; projects: { id: string; name: string }[] }> = ({ records, grants, payments, reports, projects }) => {
  const today = new Date().toISOString().slice(0, 10);
  const budgeted = records.filter((row) => row.record_type === 'budgets' && BUDGET_LIVE.includes(row.status)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenses = records.filter((row) => row.record_type === 'expenses' && SPENT.includes(row.status));
  const spent = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const received = payments.filter((row) => row.status === 'received').reduce((sum, row) => sum + Number(row.amount), 0);
  const expected = payments.filter((row) => row.status === 'expected').reduce((sum, row) => sum + Number(row.amount), 0);
  const pipeline = grants.filter((g) => ['prospect', 'researching', 'preparing', 'applied', 'under_review'].includes(g.stage)).reduce((sum, g) => sum + Number(g.amount_requested || 0), 0);
  const months = lastMonths(6).map((month) => ({ label: month.label, a: payments.filter((p) => p.status === 'received' && (p.received_date || '').startsWith(month.key)).reduce((sum, p) => sum + Number(p.amount), 0), b: expenses.filter((row) => monthKey(recordDate(row)) === month.key).reduce((sum, row) => sum + Number(row.amount || 0), 0) }));
  const byProject = projects.map((project) => ({ name: project.name, budget: records.filter((row) => row.record_type === 'budgets' && BUDGET_LIVE.includes(row.status) && row.project_id === project.id).reduce((sum, row) => sum + Number(row.amount || 0), 0), spent: expenses.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + Number(row.amount || 0), 0) })).filter((row) => row.budget || row.spent);
  const upcoming = [
    ...payments.filter((p) => p.status === 'expected').map((p) => ({ key: p.id, date: p.expected_date || '', text: `Payment expected ${money(p.amount)}`, grantId: p.grant_id })),
    ...reports.filter((r) => r.status === 'upcoming' || r.status === 'overdue').map((r) => ({ key: r.id, date: r.due_date || '', text: `Report due: ${r.title}`, grantId: r.grant_id })),
    ...grants.filter((g) => g.next_follow_up_at && !['declined', 'closed'].includes(g.stage)).map((g) => ({ key: `f${g.id}`, date: g.next_follow_up_at as string, text: `Follow up with ${g.funder_name || g.name}`, grantId: g.id })),
  ].filter((item) => item.date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  const pending = records.filter((row) => ['requested', 'submitted'].includes(row.status)).length;
  const stats = [['Budgeted', money(budgeted)], ['Spent', money(spent)], ['Remaining', money(budgeted - spent)], ['Grant income received', money(received)], ['Expected grant payments', money(expected)], ['Grant pipeline', money(pipeline)], ['Awaiting approval', String(pending)], ['Open grants', String(grants.filter((g) => !['declined', 'closed'].includes(g.stage)).length)]];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(([title, value]) => <div key={title} className={card}><p className="text-xs text-slate-500">{title}</p><p className="text-lg font-bold text-slate-900">{value}</p></div>)}</div>
      {budgeted > 0 && <div className={card}><div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>Budget used</span><span>{Math.round((spent / budgeted) * 100)}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${spent > budgeted ? 'bg-rose-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, (spent / budgeted) * 100)}%` }} /></div></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}><h3 className="mb-3 text-sm font-bold text-slate-900">Cash flow, last 6 months</h3><Bars rows={months.map((m) => ({ label: m.label, a: m.b, b: m.a }))} aLabel="Spent" bLabel="Grant income" /></section>
        <section className={card}>
          <h3 className="mb-2 text-sm font-bold text-slate-900">Budget vs actual by project</h3>
          <ul className="space-y-2">{byProject.map((row) => <li key={row.name} className="text-xs"><div className="flex justify-between"><span className="font-semibold text-slate-800">{row.name}</span><span className={row.spent > row.budget && row.budget ? 'font-semibold text-rose-600' : 'text-slate-500'}>{money(row.spent)} / {money(row.budget)}</span></div><div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${row.budget ? Math.min(100, (row.spent / row.budget) * 100) : 100}%` }} /></div></li>)}{!byProject.length && <li className="text-xs text-slate-400">Tag budgets and expenses to projects to compare them here.</li>}</ul>
        </section>
        <section className={card}>
          <h3 className="mb-2 text-sm font-bold text-slate-900">Grant pipeline</h3>
          <ul className="space-y-1">{['prospect', 'researching', 'preparing', 'applied', 'under_review', 'awarded', 'reporting', 'declined'].map((stage) => { const items = grants.filter((g) => g.stage === stage); return <li key={stage} className="flex justify-between text-xs"><span className="text-slate-600">{stageLabel(stage)} ({items.length})</span><span className="font-semibold text-slate-800">{money(items.reduce((sum, g) => sum + Number((stage === 'awarded' || stage === 'reporting' ? g.amount_awarded : g.amount_requested) || 0), 0))}</span></li>; })}</ul>
          <button type="button" onClick={() => goTo('/finance/grants')} className="mt-3 text-xs font-bold text-brand-600">Open grants</button>
        </section>
        <section className={card}>
          <h3 className="mb-2 text-sm font-bold text-slate-900">Upcoming</h3>
          <ul className="space-y-1">{upcoming.map((item) => <li key={item.key}><button type="button" onClick={() => goTo(`/finance/grants/${item.grantId}`)} className="flex w-full justify-between gap-2 text-left text-xs hover:text-brand-600"><span className="truncate text-slate-700">{item.text}</span><span className={item.date < today ? 'shrink-0 font-semibold text-rose-600' : 'shrink-0 text-slate-500'}>{item.date}</span></button></li>)}{!upcoming.length && <li className="text-xs text-slate-400">No upcoming payments, reports or follow-ups.</li>}</ul>
        </section>
      </div>
    </div>
  );
};

const Reports: React.FC<{ records: FinRecord[]; grants: Grant[]; payments: Payment[]; projects: { id: string; name: string }[] }> = ({ records, grants, payments, projects }) => {
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year' | 'all'>('year');
  const now = new Date();
  const start = period === 'all' ? '' : period === 'year' ? `${now.getFullYear()}-01-01` : period === 'quarter' ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10) : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const within = (date: string) => !start || date >= start;
  const expenses = records.filter((row) => row.record_type === 'expenses' && SPENT.includes(row.status) && within(recordDate(row)));
  const income = payments.filter((p) => p.status === 'received' && within(p.received_date || ''));
  const totalSpent = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalIncome = income.reduce((sum, p) => sum + Number(p.amount), 0);
  const group = (key: (row: FinRecord) => string) => Object.entries(expenses.reduce<Record<string, number>>((acc, row) => { const name = key(row) || 'Uncategorized'; acc[name] = (acc[name] || 0) + Number(row.amount || 0); return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const byCategory = group((row) => row.category || '');
  const byProject = group((row) => projects.find((p) => p.id === row.project_id)?.name || '');
  const byGrant = group((row) => grants.find((g) => g.id === row.grant_id)?.name || '');
  const months = lastMonths(12).map((m) => ({ ...m, income: income.filter((p) => (p.received_date || '').startsWith(m.key)).reduce((sum, p) => sum + Number(p.amount), 0), spent: expenses.filter((row) => monthKey(recordDate(row)) === m.key).reduce((sum, row) => sum + Number(row.amount || 0), 0) }));
  const table = (title: string, rows: [string, number][]) => <section className={card}><h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3><ul className="space-y-1">{rows.map(([name, value]) => <li key={name} className="flex justify-between text-xs"><span className="text-slate-600">{name}</span><span className="font-semibold text-slate-800">{money(value)}</span></li>)}{!rows.length && <li className="text-xs text-slate-400">No spending in this period.</li>}</ul></section>;
  const exportAll = () => downloadCsv('income-and-expenses.csv', [['Month', 'Grant income', 'Expenses', 'Net'], ...months.map((m) => [m.key, m.income, m.spent, m.income - m.spent]), [], ['Category', 'Spent'], ...byCategory, [], ['Project', 'Spent'], ...byProject, [], ['Grant', 'Spent'], ...byGrant]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-bold">{(['month', 'quarter', 'year', 'all'] as const).map((value) => <button type="button" key={value} onClick={() => setPeriod(value)} className={`rounded-md px-3 py-1.5 ${period === value ? 'bg-brand-600 text-white' : 'text-slate-500'}`}>{value === 'all' ? 'All time' : `This ${value}`}</button>)}</div>
        <button type="button" onClick={exportAll} className="ml-auto inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><Download className="h-3.5 w-3.5" />Export CSV</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">{[['Grant income', money(totalIncome)], ['Expenses', money(totalSpent)], ['Net', money(totalIncome - totalSpent)]].map(([title, value]) => <div key={title} className={card}><p className="text-xs text-slate-500">{title}</p><p className="text-xl font-bold text-slate-900">{value}</p></div>)}</div>
      <section className={card}><h3 className="mb-3 text-sm font-bold text-slate-900">Income vs expenses by month</h3><Bars rows={months.map((m) => ({ label: m.label, a: m.spent, b: m.income }))} aLabel="Expenses" bLabel="Income" /></section>
      <div className="grid gap-4 lg:grid-cols-3">{table('By category', byCategory)}{table('By project', byProject)}{table('By grant', byGrant)}</div>
    </div>
  );
};

const RecordModal: React.FC<{ type: RecordType; def: typeof SECTIONS[RecordType]; record: FinRecord | null; userId: string; users: { id: string; name: string }[]; projects: { id: string; name: string }[]; grants: Grant[]; onClose: () => void; onSaved: () => void }> = ({ type, def, record, userId, users, projects, grants, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: record?.name || '', description: record?.description || '', status: record?.status || def.statuses[0], amount: record?.amount ?? '', category: record?.category || '', vendor: record?.vendor || '', record_date: record?.record_date || new Date().toISOString().slice(0, 10), due_date: record?.due_date || '', project_id: record?.project_id || '', grant_id: record?.grant_id || '', owner_id: record?.owner_id || userId });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!form.name.trim()) { setError('A name is required.'); return; }
    if (form.amount !== '' && Number(form.amount) < 0) { setError('The amount cannot be negative.'); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description.trim() || null, status: form.status, amount: form.amount === '' ? null : Number(form.amount), category: form.category || null, vendor: form.vendor.trim() || null, record_date: form.record_date || null, due_date: form.due_date || null, project_id: form.project_id || null, grant_id: form.grant_id || null, owner_id: form.owner_id || null };
    const { error: saveError } = record ? await supabase.from('finance_records').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', record.id) : await supabase.from('finance_records').insert({ ...payload, record_type: type, created_by: userId });
    setSaving(false);
    if (saveError) setError(saveError.message); else onSaved();
  };
  const remove = async () => {
    if (!record || !window.confirm(`Delete "${record.name}"?`)) return;
    const { error: deleteError } = await supabase.from('finance_records').delete().eq('id', record.id);
    if (deleteError) setError(deleteError.message); else onSaved();
  };
  const statuses = record && !def.statuses.includes(record.status) ? [...def.statuses, record.status] : def.statuses;
  const l = 'text-xs font-semibold text-slate-500';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={record ? `Edit ${def.singular}` : `New ${def.singular}`}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{record ? `Edit ${def.singular}` : `New ${def.singular}`}</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
        <div className="space-y-2">
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
          <input autoFocus value={form.name} onChange={set('name')} placeholder="Name" className={field} />
          <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Description" className={field} />
          <div className="grid grid-cols-2 gap-2">
            <label className={l}>Amount ($)<input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} className={field} /></label>
            <label className={l}>Status<select value={form.status} onChange={set('status')} className={field}>{statuses.map((status) => <option key={status} value={status}>{cap(status)}</option>)}</select></label>
            <label className={l}>Category<select value={form.category} onChange={set('category')} className={field}><option value="">None</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            {def.showVendor && <label className={l}>Vendor<input value={form.vendor} onChange={set('vendor')} className={field} /></label>}
            <label className={l}>{def.dateLabel}<input type="date" value={form.record_date} onChange={set('record_date')} className={field} /></label>
            <label className={l}>Due<input type="date" value={form.due_date} onChange={set('due_date')} className={field} /></label>
            <label className={l}>Project<select value={form.project_id} onChange={set('project_id')} className={field}><option value="">None</option>{projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className={l}>Grant<select value={form.grant_id} onChange={set('grant_id')} className={field}><option value="">None</option>{grants.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className={l}>Owner<select value={form.owner_id} onChange={set('owner_id')} className={field}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          </div>
          <div className="flex items-center justify-between pt-2">{record ? <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button> : <span />}<div className="flex gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button></div></div>
        </div>
      </div>
    </div>
  );
};
