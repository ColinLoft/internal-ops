import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { countBy, percentage, weeklyCounts, type WeeklyCount } from './insightsModel';

type Row = {
  id?: string;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  target_date?: string | null;
  stage?: string | null;
  amount_requested?: number | string | null;
  amount_awarded?: number | string | null;
  last_seen_at?: string | null;
  [key: string]: unknown;
};
type Metric = { area: string; label: string; value: number | string; detail?: string; sources: string[] };
type Source = { table: string; columns: string };

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const displayLabel = (value: string) => value.replace(/[_-]/g, ' ').replace(/^\w/, (character) => character.toUpperCase());
const sources: Record<string, Source> = {
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
  messages: { table: 'messages', columns: 'id,created_at' },
  events: { table: 'calendar_events', columns: 'id,created_at' },
  audit: { table: 'system_activity_logs', columns: 'id,event_type,created_at' },
  profiles: { table: 'profiles', columns: 'id,department,last_seen_at' },
};

async function loadRows(table: string, columns: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []) as unknown as Row[]);
    if (!data || data.length < 1000) return rows;
  }
}

export const InsightsPage: React.FC = () => {
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const entries = await Promise.all(Object.entries(sources).map(async ([key, source]) => {
      try {
        return [key, await loadRows(source.table, source.columns)] as const;
      } catch {
        return [key, null] as const;
      }
    }));
    setData(Object.fromEntries(entries.map(([key, rows]) => [key, rows ?? []])));
    setFailed(entries.filter(([, rows]) => rows === null).map(([key]) => sources[key].table));
    setHasLoaded(true);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo<Metric[]>(() => {
    const rows = (key: string) => data[key] ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const isOpen = (items: Row[]) => items.filter((row) => !['completed', 'cancelled'].includes(row.status ?? ''));
    const overdue = (items: Row[]) => isOpen(items).filter((row) => row.due_date && row.due_date < today);
    const grants = rows('grants');
    const grantStage = (stages: string[]) => grants.filter((grant) => stages.includes(grant.stage ?? ''));
    const sumOf = (items: Row[], key: string) => items.reduce((total, row) => total + Number(row[key] || 0), 0);
    const doneTasks = rows('tasks').filter((row) => row.status === 'completed').length;
    const totalTasks = rows('tasks').length;
    const awardedStages = grantStage(['awarded', 'reporting', 'closed']);
    const decidedStages = grantStage(['awarded', 'reporting', 'closed', 'declined']);
    const online = rows('profiles').filter((profile) => profile.last_seen_at && Date.now() - new Date(profile.last_seen_at).getTime() < 4 * 60000).length;
    return [
      { area: 'Work', label: 'Engineering projects', value: rows('projects').length, detail: `${rows('projects').filter((project) => project.status === 'active').length} active`, sources: ['projects'] },
      { area: 'Work', label: 'Projects past target date', value: rows('projects').filter((project) => project.target_date && String(project.target_date) < today && !['completed', 'archived'].includes(String(project.status))).length, sources: ['projects'] },
      { area: 'Work', label: 'Tasks', value: totalTasks, detail: `${doneTasks} completed`, sources: ['tasks'] },
      { area: 'Work', label: 'Task completion rate', value: totalTasks ? `${percentage(doneTasks, totalTasks)}%` : '—', sources: ['tasks'] },
      { area: 'Work', label: 'Overdue tasks', value: overdue(rows('tasks')).length, sources: ['tasks'] },
      { area: 'Work', label: 'Blocked tasks', value: rows('tasks').filter((task) => task.status === 'blocked').length, sources: ['tasks'] },
      { area: 'Grants', label: 'Grants tracked', value: grants.length, detail: `${rows('prospects').length} possible grants researched`, sources: ['grants', 'prospects'] },
      { area: 'Grants', label: 'Pending decisions', value: money(sumOf(grantStage(['applied', 'under_review']), 'amount_requested')), detail: `${grantStage(['applied', 'under_review']).length} applications`, sources: ['grants'] },
      { area: 'Grants', label: 'Awarded', value: money(sumOf(awardedStages, 'amount_awarded')), detail: `${awardedStages.length} grants`, sources: ['grants'] },
      { area: 'Grants', label: 'Win rate', value: decidedStages.length ? `${percentage(awardedStages.length, decidedStages.length)}%` : '—', detail: `${grantStage(['declined']).length} declined`, sources: ['grants'] },
      { area: 'Customers', label: 'Contacts added', value: rows('contacts').length, sources: ['contacts'] },
      { area: 'Customers', label: 'Organizations added', value: rows('orgs').length, sources: ['orgs'] },
      { area: 'Customers', label: 'Interactions logged', value: rows('interactions').length, sources: ['interactions'] },
      { area: 'Go-to-market', label: 'GTM records', value: rows('gtm').length, detail: `${isOpen(rows('gtm')).length} open`, sources: ['gtm'] },
      { area: 'Legal', label: 'Legal records', value: rows('legal').length, detail: `${isOpen(rows('legal')).length} open`, sources: ['legal'] },
      { area: 'Engineering', label: 'Engineering records', value: rows('engineering').length, detail: `${isOpen(rows('engineering')).length} open`, sources: ['engineering'] },
      { area: 'Operations', label: 'Operation tasks', value: rows('opsTasks').length, detail: `${overdue(rows('opsTasks')).length} overdue`, sources: ['opsTasks'] },
      { area: 'Operations', label: 'Pending approvals', value: rows('approvals').filter((approval) => approval.status === 'pending').length, sources: ['approvals'] },
      { area: 'Operations', label: 'Support tickets', value: rows('tickets').length, detail: `${rows('tickets').filter((ticket) => ['new', 'open', 'in_progress', 'waiting'].includes(ticket.status ?? '')).length} unresolved`, sources: ['tickets'] },
      { area: 'Activity', label: 'Messages sent', value: rows('messages').length, sources: ['messages'] },
      { area: 'Activity', label: 'Calendar events created', value: rows('events').length, sources: ['events'] },
      { area: 'Activity', label: 'Audit log events', value: rows('audit').length, sources: ['audit'] },
      { area: 'People', label: 'Staff', value: rows('profiles').length, detail: `${online} online now`, sources: ['profiles'] },
    ];
  }, [data]);

  const metricId = (metric: Metric) => `${metric.area}::${metric.label}`;
  const selectedIds = exportSelection ?? metrics.map(metricId);
  const unavailable = (metric: Metric) => metric.sources.some((source) => failed.includes(sources[source].table));
  const exportCsv = () => {
    const selected = metrics.filter((metric) => selectedIds.includes(metricId(metric)));
    const rows = [['Area', 'Metric', 'Value', 'Detail'], ...selected.map((metric) => [metric.area, metric.label, unavailable(metric) ? 'Unavailable' : String(metric.value), unavailable(metric) ? '' : metric.detail ?? ''])];
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
  const grouped = metrics.reduce<Record<string, Metric[]>>((groups, metric) => { (groups[metric.area] ||= []).push(metric); return groups; }, {});
  const chartSeries = [
    { title: 'Tasks created', key: 'tasks', color: '#5897ff' },
    { title: 'Projects created', key: 'projects', color: '#5897ff' },
    { title: 'Grants added', key: 'grants', color: '#5897ff' },
    { title: 'Support tickets opened', key: 'tickets', color: '#5897ff' },
  ];
  const toggleExportMetric = (id: string) => {
    const selected = new Set(exportSelection ?? metrics.map(metricId));
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    setExportSelection([...selected]);
  };

  return (
    <main data-onboarding-target="insights-workspace" className="min-w-0 flex-1 overflow-y-auto bg-black text-[#f5f5f5]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#292929] bg-black px-5 py-5 sm:px-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Insights</h1>
          <p className="mt-1 text-sm text-[#b3b3b3]">Organization-wide activity, delivery, funding, and operations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#3b3b3b] px-3 text-sm font-medium text-[#e1e1e1] hover:bg-[#202020] disabled:opacity-50"><RefreshCw size={15} />Refresh</button>
          <button type="button" onClick={() => setExportOpen((open) => !open)} disabled={loading} aria-expanded={exportOpen} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"><Download size={15} />Export metrics</button>
        </div>
      </header>
      <div className="space-y-6 p-5 sm:p-8">
        {failed.length > 0 && <p role="status" className="rounded-md border border-[#554316] bg-[#211b0d] px-4 py-3 text-sm text-[#f0d48b]">Some sources could not be loaded. Their values are shown as unavailable: {failed.join(', ')}.</p>}
        {exportOpen && !loading && (
          <section aria-label="Choose export metrics" className="rounded-lg border border-[#303030] bg-[#151515] p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-base font-semibold text-white">Choose metrics to export</h2><p className="mt-1 text-sm text-[#a9a9a9]">{selectedIds.length} of {metrics.length} selected</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setExportSelection(null)} className="min-h-9 rounded-md px-3 text-sm text-[#d0d0d0] hover:bg-[#252525]">Select all</button>
                <button type="button" onClick={() => setExportSelection([])} className="min-h-9 rounded-md px-3 text-sm text-[#d0d0d0] hover:bg-[#252525]">Clear</button>
                <button type="button" disabled={selectedIds.length === 0} onClick={exportCsv} className="min-h-9 rounded-md bg-brand-600 px-3 text-sm font-medium text-white disabled:opacity-40">Download CSV</button>
              </div>
            </div>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(grouped).map(([area, areaMetrics]) => <fieldset key={area} className="min-w-0">
                <legend className="mb-3 text-sm font-semibold text-[#e5e5e5]">{area}</legend>
                <div className="space-y-3">{areaMetrics.map((metric) => {
                  const id = metricId(metric);
                  return <label key={id} className="flex cursor-pointer items-start gap-3 text-sm text-[#c5c5c5]"><input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggleExportMetric(id)} className="mt-1 accent-brand-600" /><span>{metric.label}</span></label>;
                })}</div>
              </fieldset>)}
            </div>
          </section>
        )}
        {loading && !hasLoaded ? <div role="status" className="flex min-h-48 items-center gap-3 text-sm text-[#b3b3b3]"><Loader2 size={17} className="animate-spin" />Loading workspace records…</div> : (
          <>
            {loading && <p role="status" className="text-sm text-[#a0a0a0]">Updating workspace records…</p>}
            <section aria-label="Key metrics" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
              {cards.map((metric) => <div key={metric.label} className="min-w-0 rounded-lg bg-[#151515] p-3 sm:p-4">
                <p className="text-sm text-[#b7b7b7]">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{unavailable(metric) ? '—' : metric.value}</p>
                {metric.detail && <p className="mt-1 text-sm text-[#929292]">{unavailable(metric) ? 'Source unavailable' : metric.detail}</p>}
              </div>)}
            </section>
            <section aria-labelledby="trends-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div><h2 id="trends-heading" className="text-lg font-semibold text-white">Record activity</h2><p className="mt-1 text-sm text-[#9f9f9f]">Weekly records created · last 12 weeks, current week to date</p></div>
                <p className="text-xs text-[#858585]">Counted from stored creation dates</p>
              </div>
              <div className="grid items-start gap-3 lg:grid-cols-2">
                {chartSeries.map((series) => <TrendChart key={series.key} title={series.title} rows={data[series.key] ?? []} weeks={weeklyCounts(data[series.key] ?? [])} color={series.color} error={failed.includes(sources[series.key].table)} />)}
              </div>
            </section>
            <section aria-labelledby="status-heading">
              <div className="mb-3"><h2 id="status-heading" className="text-lg font-semibold text-white">Current work by status</h2><p className="mt-1 text-sm text-[#9f9f9f]">Counts use the records currently stored in each source.</p></div>
              <div className="grid items-start gap-3 lg:grid-cols-2">
                <StatusBreakdown title="Tasks" rows={data.tasks ?? []} field="status" error={failed.includes(sources.tasks.table)} />
                <StatusBreakdown title="Engineering projects" rows={data.projects ?? []} field="status" error={failed.includes(sources.projects.table)} />
              </div>
            </section>
            <section className="overflow-hidden rounded-lg bg-[#151515]">
              <div className="flex flex-wrap items-end justify-between gap-2 px-4 py-4 sm:px-5">
                <div><h2 className="text-lg font-semibold text-white">All metrics</h2><p className="mt-1 text-sm text-[#9f9f9f]">Detailed totals grouped by workspace area.</p></div>
                <p className="text-sm text-[#929292]">{metrics.length} measures</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-left text-sm lg:table-auto">
                  <thead className="border-y border-[#303030] text-[#aaa]"><tr><th className="hidden px-4 py-3 font-medium lg:table-cell">Area</th><th className="px-4 py-3 font-medium">Metric</th><th className="w-28 px-4 py-3 text-right font-medium sm:w-36 lg:w-auto">Value</th><th className="hidden px-4 py-3 font-medium lg:table-cell">Detail</th></tr></thead>
                  <tbody>{metrics.map((metric) => <tr key={metricId(metric)} className="border-b border-[#292929] last:border-0">
                    <td className="hidden px-4 py-3 text-[#b5b5b5] lg:table-cell">{metric.area}</td>
                    <td className="break-words px-4 py-3 text-white">
                      <span>{metric.label}</span>
                      <span className="mt-1 block text-xs font-normal text-[#b5b5b5] lg:hidden">{metric.area}</span>
                      <span className="mt-1 block text-xs font-normal text-[#999] lg:hidden">{unavailable(metric) ? 'Source unavailable' : metric.detail || '—'}</span>
                    </td>
                    <td className="break-words px-4 py-3 text-right font-medium tabular-nums text-white">{unavailable(metric) ? '—' : metric.value}</td>
                    <td className="hidden px-4 py-3 text-[#999] lg:table-cell">{unavailable(metric) ? 'Source unavailable' : metric.detail || '—'}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
};

function TrendChart({ title, rows, weeks, color, error }: { title: string; rows: Row[]; weeks: WeeklyCount[]; color: string; error: boolean }) {
  const width = 720;
  const height = 250;
  const left = 54;
  const right = 700;
  const top = 20;
  const bottom = 194;
  const maxValue = Math.max(...weeks.map((week) => week.value), 0);
  const step = Math.max(1, Math.ceil(maxValue / 4));
  const max = step * 4;
  const x = (index: number) => left + index * (right - left) / Math.max(weeks.length - 1, 1);
  const y = (value: number) => bottom - value * (bottom - top) / max;
  const path = weeks.map((week, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(week.value)}`).join(' ');
  const points = [0, 3, 6, 9, weeks.length - 1];
  const now = new Date();
  const firstWeek = Date.parse(`${weeks[0]?.start}T00:00:00.000Z`);
  const inRange = rows.some((row) => row.created_at
    && new Date(row.created_at).getTime() >= firstWeek
    && new Date(row.created_at).getTime() <= now.getTime());
  const chartTitleId = `chart-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return <article className="min-w-0 rounded-lg bg-[#151515] p-4 sm:p-5">
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-medium text-white">{title}</h3>
      <span className="text-sm text-[#a8a8a8]">{error ? 'Unavailable' : `${rows.length.toLocaleString()} total records`}</span>
    </div>
    {error ? <p className="py-7 text-sm text-[#b7b7b7]">Could not load this source. Refresh to try again.</p> : (
      <>
        <p className="mb-2 text-xs text-[#929292]">{inRange ? 'Weekly count' : 'No records in this period'}</p>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartTitleId}-title ${chartTitleId}-desc`} className="block h-auto w-full overflow-visible">
          <title id={`${chartTitleId}-title`}>{title}: weekly record counts</title>
          <desc id={`${chartTitleId}-desc`}>{inRange ? 'A line chart of actual records grouped by UTC week.' : 'No source records fall within the displayed twelve-week period; the zero baseline is shown.'}</desc>
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = max - tick * step;
            const yPosition = y(value);
            return <g key={value}>
              <line x1={left} x2={right} y1={yPosition} y2={yPosition} stroke="#343434" strokeWidth="1" />
              <text x={left - 10} y={yPosition + 4} textAnchor="end" fill="#969696" fontSize="12">{value}</text>
            </g>;
          })}
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#6b6b6b" strokeWidth="1.5" />
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
          {weeks.map((week, index) => <circle key={week.start} cx={x(index)} cy={y(week.value)} r="3.5" fill={color}>
            <title>{week.label}: {week.value} {week.value === 1 ? 'record' : 'records'}</title>
          </circle>)}
          {points.map((index) => <text key={weeks[index]?.start} x={x(index)} y={bottom + 24} textAnchor={index === 0 ? 'start' : index === weeks.length - 1 ? 'end' : 'middle'} fill="#969696" fontSize="12">{weeks[index]?.label}</text>)}
          <text x={right} y={height - 5} textAnchor="end" fill="#828282" fontSize="11">Week starting · UTC</text>
        </svg>
        <div className="sr-only">
          <table><caption>{title} by week</caption><thead><tr><th>Week starting</th><th className="text-right">Records</th></tr></thead>
            <tbody>{weeks.map((week) => <tr key={week.start}><th>{week.start}</th><td className="text-right tabular-nums">{week.value}</td></tr>)}</tbody>
          </table>
        </div>
      </>
    )}
  </article>;
}

function StatusBreakdown({ title, rows, field, error }: { title: string; rows: Row[]; field: string; error: boolean }) {
  const counts = countBy(rows, (row) => row[field] as string | null | undefined);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const ordered = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return <article className="min-w-0 rounded-lg bg-[#151515] p-4 sm:p-5">
    <div className="mb-4 flex items-baseline justify-between gap-2"><h3 className="text-base font-medium text-white">{title}</h3><span className="text-sm tabular-nums text-[#a8a8a8]">{error ? 'Unavailable' : `${total.toLocaleString()} records`}</span></div>
    {error ? <p className="text-sm text-[#b7b7b7]">Could not load this source. Refresh to try again.</p>
      : !total ? <p className="text-sm text-[#a0a0a0]">No records available for this breakdown.</p>
        : <div className="space-y-4">{ordered.map(([status, value]) => {
          const share = percentage(value, total);
          return <div key={status}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="text-[#d1d1d1]">{displayLabel(status)}</span><span className="tabular-nums text-[#eee]">{value.toLocaleString()} <span className="text-[#999]">· {share}%</span></span></div>
            <div className="h-2 overflow-hidden rounded-sm bg-[#303030]" role="img" aria-label={`${displayLabel(status)}: ${value} of ${total}, ${share}%`}>
              <div className="h-full bg-brand-500" style={{ width: `${share}%` }} />
            </div>
          </div>;
        })}</div>}
  </article>;
}
