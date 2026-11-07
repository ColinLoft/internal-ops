import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Row = Record<string, any>;
type Metric = { area: string; label: string; value: number | string; detail?: string };

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const countBy = (rows: Row[], key: string) => rows.reduce<Record<string, number>>((acc, row) => { const k = String(row[key] ?? 'unknown'); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const label = (value: string) => value.replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const sources: Record<string, { table: string; columns: string }> = {
  tasks: { table: 'program_tasks', columns: 'id,status,priority,due_date,created_at' },
  projects: { table: 'eng_projects', columns: 'id,status,target_date,created_at' },
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
  emails: { table: 'email_messages', columns: 'id,received_at' },
  audit: { table: 'system_activity_logs', columns: 'id,event_type,created_at' },
  profiles: { table: 'profiles', columns: 'id,department,last_seen_at' },
};

export const InsightsPage: React.FC = () => {
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const entries = await Promise.all(Object.entries(sources).map(async ([key, { table, columns }]) => {
      const query = supabase.from(table).select(columns).limit(5000);
      const { data: rows, error } = await query;
      return [key, error ? null : ((rows ?? []) as unknown as Row[])] as const;
    }));
    setData(Object.fromEntries(entries.map(([k, rows]) => [k, rows ?? []])));
    setFailed(entries.filter(([, rows]) => rows === null).map(([k]) => sources[k].table));
    setLoading(false);
  }, []);
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
      { area: 'Work', label: 'Engineering projects', value: d('projects').length, detail: `${d('projects').filter((p) => p.status === 'active').length} active` },
      { area: 'Work', label: 'Projects past target date', value: d('projects').filter((p) => p.target_date && String(p.target_date) < new Date().toISOString().slice(0, 10) && !['completed', 'archived'].includes(String(p.status))).length },
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

  const metricId = (metric: Metric) => `${metric.area}::${metric.label}`;
  const selectedIds = exportSelection ?? metrics.map(metricId);
  const exportCsv = () => {
    const selected = metrics.filter((metric) => selectedIds.includes(metricId(metric)));
    const rows = [['Area', 'Metric', 'Value', 'Detail'], ...selected.map((m) => [m.area, m.label, String(m.value), m.detail ?? ''])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `flown-insights-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const headline = ['Engineering projects', 'Task completion rate', 'Overdue tasks', 'Grants tracked', 'Awarded', 'Contacts added', 'Support tickets', 'Staff'];
  const cards = metrics.filter((metric) => headline.includes(metric.label));
  const taskStatus = countBy(data.tasks ?? [], 'status');
  const projectStatus = countBy(data.projects ?? [], 'status');
  const grouped = metrics.reduce<Record<string, Metric[]>>((acc, metric) => { (acc[metric.area] ||= []).push(metric); return acc; }, {});
  const toggleExportMetric = (id: string) => {
    const selected = new Set(exportSelection ?? metrics.map(metricId));
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    setExportSelection([...selected]);
  };

  return (
    <main data-onboarding-target="insights-workspace" className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Insights</h1>
          <p className="text-sm text-slate-500">Organization-wide activity, delivery, funding, and operations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 md:min-h-0 md:py-2"><RefreshCw size={14} />Refresh</button>
          <button type="button" onClick={() => setExportOpen((open) => !open)} disabled={loading} aria-expanded={exportOpen} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white disabled:opacity-50 md:min-h-0 md:py-2"><Download size={14} />Choose export</button>
        </div>
      </header>
      <div className="space-y-6 p-5 sm:p-8">
        {failed.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Some data sources could not be loaded, so related metrics may be incomplete: {failed.join(', ')}.</p>}
        {exportOpen && !loading && (
          <section aria-label="Choose export metrics" className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Choose metrics to export</h2>
                <p className="mt-1 text-xs text-slate-500">{selectedIds.length} of {metrics.length} selected</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setExportSelection(null)} className="rounded-md px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Select all</button>
                <button type="button" onClick={() => setExportSelection([])} className="rounded-md px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Clear</button>
                <button type="button" disabled={selectedIds.length === 0} onClick={exportCsv} className="rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Download CSV</button>
              </div>
            </div>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(grouped).map(([area, areaMetrics]) => (
                <fieldset key={area} className="min-w-0">
                  <legend className="mb-2 text-xs font-semibold text-slate-700">{area}</legend>
                  <div className="space-y-2">
                    {areaMetrics.map((metric) => {
                      const id = metricId(metric);
                      return (
                        <label key={id} className="flex cursor-pointer items-start gap-2 text-xs text-slate-600">
                          <input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggleExportMetric(id)} className="mt-0.5 accent-brand-600" />
                          <span>{metric.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Loading insights…</div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((m) => (
                <div key={`${m.area}-${m.label}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-600">{m.area} · {m.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{m.value}</p>
                  {m.detail && <p className="mt-1 text-xs text-slate-500">{m.detail}</p>}
                </div>
              ))}
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
                {[{ title: 'Tasks by status', counts: taskStatus }, { title: 'Projects by status', counts: projectStatus }].map(({ title, counts }) => {
                  const total = Object.values(counts).reduce((a, b) => a + b, 0);
                  return (
                    <div key={title} className="rounded-xl border border-slate-200 bg-white p-4">
                      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
                      <div className="mt-3 space-y-2">
                        {total === 0 && <p className="text-xs text-slate-500">No records available.</p>}
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
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-900">All metrics</h2>
                <p className="mt-1 text-xs text-slate-500">Every available workspace measure, grouped by area.</p>
              </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-4 py-2">Area</th><th className="px-4 py-2">Metric</th><th className="px-4 py-2 text-right">Value</th><th className="px-4 py-2">Detail</th></tr></thead>
                    <tbody>{metrics.map((m) => <tr key={`${m.area}-${m.label}`} className="border-b border-slate-100 last:border-0"><td className="px-4 py-2">{m.area}</td><td className="px-4 py-2">{m.label}</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{m.value}</td><td className="px-4 py-2 text-slate-500">{m.detail}</td></tr>)}</tbody>
                  </table>
                </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
};
