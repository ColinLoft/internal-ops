import { Dropdown } from '../common/Dropdown';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FolderKanban, House, Landmark, Loader2, RefreshCw, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Section = 'executive' | 'programs' | 'financial' | 'projects' | 'custom';
type Range = 'week' | 'month' | 'quarter' | 'year' | 'all';
type Row = Record<string, any>;
type Metric = { area: string; label: string; value: number | string; detail?: string };

const sections: { id: Section; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'executive', label: 'Executive Overview', icon: House, description: 'Organization-wide health across every app.' },
  { id: 'programs', label: 'Projects & Tasks', icon: FolderKanban, description: 'Delivery progress, workload and overdue work.' },
  { id: 'financial', label: 'Financial Reports', icon: Landmark, description: 'Budgets, grants, funding and expenses.' },
  { id: 'projects', label: 'Departments', icon: Users, description: 'Customers, go-to-market, legal, engineering and operations.' },
  { id: 'custom', label: 'Activity & Usage', icon: BarChart3, description: 'Communication, files, calendar and audit activity.' },
];
const ranges: { id: Range; label: string }[] = [
  { id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }, { id: 'quarter', label: 'This quarter' }, { id: 'year', label: 'This year' }, { id: 'all', label: 'All time' },
];

const rangeStart = (range: Range) => {
  const now = new Date();
  if (range === 'all') return null;
  if (range === 'week') { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()); return d; }
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'quarter') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1);
};
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const countBy = (rows: Row[], key: string) => rows.reduce<Record<string, number>>((acc, row) => { const k = String(row[key] ?? 'unknown'); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const label = (value: string) => value.replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const sources: Record<string, { table: string; columns: string; dateColumn?: string }> = {
  tasks: { table: 'program_tasks', columns: 'id,status,priority,due_date,created_at' },
  projects: { table: 'program_projects', columns: 'id,status,progress,end_date,created_at' },
  grants: { table: 'grants', columns: 'id,stage,amount_requested,amount_awarded,created_at' },
  prospects: { table: 'grant_prospects', columns: 'id,status,created_at' },
  legal: { table: 'legal_records', columns: 'id,record_type,status,created_at' },
  engineering: { table: 'engineering_records', columns: 'id,record_type,status,created_at' },
  gtm: { table: 'gtm_records', columns: 'id,area,status,created_at' },
  contacts: { table: 'crm_contacts', columns: 'id,created_at' },
  orgs: { table: 'crm_organizations', columns: 'id,category,created_at' },
  interactions: { table: 'crm_interactions', columns: 'id,created_at' },
  opsTasks: { table: 'operation_tasks', columns: 'id,status,priority,due_date,created_at' },
  approvals: { table: 'operation_approvals', columns: 'id,status,created_at' },
  tickets: { table: 'support_tickets', columns: 'id,status,priority,created_at' },
  drive: { table: 'drive_items', columns: 'id,item_type,created_at' },
  messages: { table: 'messages', columns: 'id,created_at' },
  events: { table: 'calendar_events', columns: 'id,created_at' },
  emails: { table: 'email_messages', columns: 'id,received_at', dateColumn: 'received_at' },
  audit: { table: 'system_activity_logs', columns: 'id,event_type,created_at' },
  profiles: { table: 'profiles', columns: 'id,department,last_seen_at' },
};

export const InsightsPage: React.FC = () => {
  const [section, setSection] = useState<Section>(() => (sections.find((s) => s.id === window.location.pathname.split('/')[2])?.id ?? 'executive'));
  const [range, setRange] = useState<Range>('quarter');
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sync = () => setSection(sections.find((s) => s.id === window.location.pathname.split('/')[2])?.id ?? 'executive');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const start = rangeStart(range)?.toISOString();
    const entries = await Promise.all(Object.entries(sources).map(async ([key, { table, columns, dateColumn }]) => {
      let query = supabase.from(table).select(columns).limit(5000);
      if (start && key !== 'profiles') query = query.gte(dateColumn ?? 'created_at', start);
      const { data: rows, error } = await query;
      return [key, error ? null : ((rows ?? []) as unknown as Row[])] as const;
    }));
    setData(Object.fromEntries(entries.map(([k, rows]) => [k, rows ?? []])));
    setFailed(entries.filter(([, rows]) => rows === null).map(([k]) => sources[k].table));
    setLoading(false);
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo<Metric[]>(() => {
    const d = (k: string) => data[k] ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const open = (rows: Row[]) => rows.filter((r) => !['completed', 'cancelled'].includes(r.status));
    const overdue = (rows: Row[]) => open(rows).filter((r) => r.due_date && r.due_date < today);
    const grants = d('grants');
    const sumOf = (rows: Row[], key: string) => rows.reduce((total, r) => total + Number(r[key] || 0), 0);
    const inStages = (stages: string[]) => grants.filter((g) => stages.includes(g.stage));
    const doneTasks = d('tasks').filter((r) => r.status === 'completed').length;
    const online = d('profiles').filter((p) => p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 4 * 60000).length;
    const taskTotal = d('tasks').length;
    return [
      { area: 'Work', label: 'Projects', value: d('projects').length, detail: `${d('projects').filter((p) => p.status === 'active').length} active` },
      { area: 'Work', label: 'Average project progress', value: `${Math.round(d('projects').reduce((t, p) => t + Number(p.progress || 0), 0) / (d('projects').length || 1))}%` },
      { area: 'Work', label: 'Tasks', value: taskTotal, detail: `${doneTasks} completed` },
      { area: 'Work', label: 'Task completion rate', value: `${pct(doneTasks, taskTotal)}%` },
      { area: 'Work', label: 'Overdue tasks', value: overdue(d('tasks')).length },
      { area: 'Work', label: 'Blocked tasks', value: d('tasks').filter((t) => t.status === 'blocked').length },
      { area: 'Grants', label: 'Grants tracked', value: grants.length, detail: `${d('prospects').length} possible grants researched` },
      { area: 'Grants', label: 'Pending decisions', value: money(sumOf(inStages(['applied', 'under_review']), 'amount_requested')), detail: `${inStages(['applied', 'under_review']).length} applications` },
      { area: 'Grants', label: 'Awarded', value: money(sumOf(inStages(['awarded', 'reporting', 'closed']), 'amount_awarded')), detail: `${inStages(['awarded', 'reporting', 'closed']).length} grants` },
      { area: 'Grants', label: 'Win rate', value: `${pct(inStages(['awarded', 'reporting', 'closed']).length, inStages(['awarded', 'reporting', 'closed', 'declined']).length)}%`, detail: `${inStages(['declined']).length} declined` },
      { area: 'Customers', label: 'Contacts added', value: d('contacts').length },
      { area: 'Customers', label: 'Organizations added', value: d('orgs').length },
      { area: 'Customers', label: 'Interactions logged', value: d('interactions').length },
      { area: 'Go-to-market', label: 'GTM records', value: d('gtm').length, detail: `${open(d('gtm')).length} open` },
      { area: 'Legal', label: 'Legal records', value: d('legal').length, detail: `${open(d('legal')).length} open` },
      { area: 'Engineering', label: 'Engineering records', value: d('engineering').length, detail: `${open(d('engineering')).length} open` },
      { area: 'Operations', label: 'Operation tasks', value: d('opsTasks').length, detail: `${overdue(d('opsTasks')).length} overdue` },
      { area: 'Operations', label: 'Pending approvals', value: d('approvals').filter((a) => a.status === 'pending').length },
      { area: 'Operations', label: 'Support tickets', value: d('tickets').length, detail: `${d('tickets').filter((t) => ['new', 'open', 'in_progress', 'waiting'].includes(t.status)).length} unresolved` },
      { area: 'Activity', label: 'Messages sent', value: d('messages').length },
      { area: 'Activity', label: 'Emails', value: d('emails').length },
      { area: 'Activity', label: 'Calendar events created', value: d('events').length },
      { area: 'Activity', label: 'Drive items created', value: d('drive').length },
      { area: 'Activity', label: 'Audit log events', value: d('audit').length },
      { area: 'People', label: 'Staff', value: d('profiles').length, detail: `${online} online now` },
    ];
  }, [data]);

  const exportCsv = () => {
    const rangeLabel = ranges.find((r) => r.id === range)?.label ?? range;
    const rows = [['Area', 'Metric', 'Value', 'Detail', 'Period'], ...metrics.map((m) => [m.area, m.label, String(m.value), m.detail ?? '', rangeLabel])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `insights-${section}-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const areasFor: Record<Section, string[] | null> = {
    executive: null,
    programs: ['Work'],
    financial: ['Grants'],
    projects: ['Customers', 'Go-to-market', 'Legal', 'Engineering', 'Operations'],
    custom: ['Activity', 'People'],
  };
  const visible = metrics.filter((m) => !areasFor[section] || areasFor[section]!.includes(m.area));
  const headline = ['Projects', 'Task completion rate', 'Overdue tasks', 'Total tracked amount', 'Contacts added', 'Pending approvals', 'Support tickets', 'Staff'];
  const cards = section === 'executive' ? visible.filter((m) => headline.includes(m.label)) : visible;
  const grouped = visible.reduce<Record<string, Metric[]>>((acc, m) => { (acc[m.area] ||= []).push(m); return acc; }, {});
  const taskStatus = countBy(data.tasks ?? [], 'status');
  const projectStatus = countBy(data.projects ?? [], 'status');
  const current = sections.find((s) => s.id === section)!;
  const choose = (id: Section) => {
    const path = id === 'executive' ? '/insights' : `/insights/${id}`;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setSection(id);
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{current.label}</h1>
          <p className="text-sm text-slate-500">{current.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown value={section} options={sections} onChange={(value) => choose(value as Section)} ariaLabel="Section" className="min-w-36" />
          <Dropdown value={range} options={ranges} onChange={(value) => setRange(value as Range)} ariaLabel="Period" className="min-w-32" />
          <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 md:min-h-0 md:py-2"><RefreshCw size={14} />Refresh</button>
          <button type="button" onClick={exportCsv} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white disabled:opacity-50 md:min-h-0 md:py-2"><Download size={14} />Export CSV</button>
        </div>
      </header>
      <div className="space-y-6 p-5 sm:p-8">
        {failed.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Some data could not be loaded and is shown as 0: {failed.join(', ')}.</p>}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Loading insights…</div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((m) => (
                <div key={`${m.area}-${m.label}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{m.area} · {m.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{m.value}</p>
                  {m.detail && <p className="mt-1 text-xs text-slate-500">{m.detail}</p>}
                </div>
              ))}
            </section>
            {(section === 'executive' || section === 'programs') && (
              <section className="grid gap-4 lg:grid-cols-2">
                {[{ title: 'Tasks by status', counts: taskStatus }, { title: 'Projects by status', counts: projectStatus }].map(({ title, counts }) => {
                  const total = Object.values(counts).reduce((a, b) => a + b, 0);
                  return (
                    <div key={title} className="rounded-xl border border-slate-200 bg-white p-4">
                      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
                      <div className="mt-3 space-y-2">
                        {total === 0 && <p className="text-xs text-slate-500">No records in this period.</p>}
                        {Object.entries(counts).map(([status, n]) => (
                          <div key={status}>
                            <div className="flex justify-between text-xs text-slate-600"><span>{label(status)}</span><span>{n} ({pct(n, total)}%)</span></div>
                            <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct(n, total)}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {section !== 'executive' && Object.keys(grouped).length > 1 && (
              <section className="rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-4 py-2">Area</th><th className="px-4 py-2">Metric</th><th className="px-4 py-2">Value</th><th className="px-4 py-2">Detail</th></tr></thead>
                  <tbody>{visible.map((m) => <tr key={`${m.area}-${m.label}`} className="border-b border-slate-100 last:border-0"><td className="px-4 py-2">{m.area}</td><td className="px-4 py-2">{m.label}</td><td className="px-4 py-2 font-semibold">{m.value}</td><td className="px-4 py-2 text-slate-500">{m.detail}</td></tr>)}</tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
};
