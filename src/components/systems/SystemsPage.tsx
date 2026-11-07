import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { CustomSelect } from '../common/CustomSelect';
import { useConfirm } from '../common/useConfirm';
import { localDateTime, monitorState, publicHttpsUrl, sampledUptime } from './helpers';
import type { FlownSystem, MonitorSummary, SystemCategory, SystemCheck, SystemEnvironment, SystemIncident, SystemMaintenance } from './types';

const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60';
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60';
const categories: SystemCategory[] = ['application', 'website', 'infrastructure', 'integration', 'other'];
const environments: SystemEnvironment[] = ['production', 'staging', 'development', 'other'];
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
const date = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const failure = (error: unknown) => error instanceof Error ? error.message : (error as { message?: string })?.message || 'Could not save changes.';

type Editor = { kind: 'system'; record?: FlownSystem } | { kind: 'incident'; record?: SystemIncident } | { kind: 'maintenance'; record?: SystemMaintenance };
type Owner = { id: string; name: string; account_status: string };
type Snapshot = { systems: FlownSystem[]; summaries: MonitorSummary[]; incidents: SystemIncident[]; maintenance: SystemMaintenance[]; owners: Owner[]; checks: SystemCheck[] };
const empty: Snapshot = { systems: [], summaries: [], incidents: [], maintenance: [], owners: [], checks: [] };

// Fetch every page; inventory counts and aggregate results must not silently stop at PostgREST's row cap.
async function allRows<T>(table: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []) as T[]);
    if (!data || data.length < 500) return rows;
  }
}
async function summaries(): Promise<MonitorSummary[]> {
  const rows: MonitorSummary[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc('flown_system_monitor_summary').order('system_id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []) as MonitorSummary[]);
    if (!data || data.length < 500) return rows;
  }
}

/** Standalone authenticated staff screen. No WorkspaceContext or route props required. */
export const SystemsPage: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState('');
  const [environment, setEnvironment] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const generation = useRef(0);
  const { confirm, dialog } = useConfirm();
  const selected = snapshot.systems.find(item => item.id === selectedId);

  const load = useCallback(async () => {
    const run = ++generation.current;
    try {
      if (!isSupabaseConfigured) throw new Error('Configure Supabase and deploy the Flown Systems migration to use this workspace.');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Sign in to view Flown Systems.');
      const { data: staff, error: staffError } = await supabase.from('profiles').select('account_status').eq('id', user.id).maybeSingle();
      if (staffError || staff?.account_status !== 'active') throw new Error('Flown Systems is available to active staff only.');
      const [systems, metrics, incidents, maintenance, ownerResult, checkResult] = await Promise.all([
        allRows<FlownSystem>('flown_systems'), summaries(), allRows<SystemIncident>('flown_system_incidents'),
        allRows<SystemMaintenance>('flown_system_maintenance'),
        supabase.from('profiles').select('id, name, account_status').order('name').limit(1000),
        selectedId ? supabase.from('flown_system_checks').select('*').eq('system_id', selectedId).order('checked_at', { ascending: false }).limit(60)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (ownerResult.error) throw ownerResult.error;
      if (checkResult.error) throw checkResult.error;
      if (run !== generation.current) return;
      setSnapshot({ systems, summaries: metrics, incidents, maintenance, owners: ownerResult.data || [], checks: checkResult.data || [] });
      setRefreshedAt(new Date().toISOString());
      setLoadError('');
    } catch (err) {
      if (run === generation.current) setLoadError(`Could not load systems: ${failure(err)}`);
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, [selectedId]);

  useLiveRefresh(load, ['flown_systems', 'flown_system_incidents', 'flown_system_maintenance', 'flown_system_checks']);
  useEffect(() => () => { generation.current++; }, [load]);

  async function mutate(action: () => Promise<void>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); await load(); }
    catch (err) { setError(failure(err)); }
    finally { setBusy(false); }
  }
  const remove = async (table: string, id: string, name: string) => {
    if (!await confirm({ title: `Delete ${name}?`, message: table === 'flown_systems' ? 'This permanently removes its incidents, maintenance and check history.' : 'This permanently removes this record.' })) return;
    await mutate(async () => {
      const { error, data } = await supabase.from(table).delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('The record was not removed. Refresh and check your access.');
      if (table === 'flown_systems') setSelectedId(null);
      setEditor(null);
    }, 'Record deleted.');
  };
  const runCheck = () => selected && void mutate(async () => {
    const { data, error } = await supabase.functions.invoke('systems-monitor', { body: { systemId: selected.id } });
    if (error) {
      const context = (error as { context?: Response }).context;
      const body = context ? await context.json().catch(() => null) : null;
      throw new Error(body?.error || error.message);
    }
    if (data?.error) throw new Error(data.error);
    if (data?.skipped) throw new Error('A check ran or started in the last minute. Try again shortly.');
  }, 'Endpoint check recorded.');

  const visible = snapshot.systems.filter(system => (!environment || system.environment === environment)
    && `${system.name} ${system.description} ${system.category} ${snapshot.owners.find(owner => owner.id === system.owner_id)?.name || ''}`.toLowerCase().includes(query.toLowerCase()));
  const selectedSummary = snapshot.summaries.find(item => item.system_id === selectedId);
  const systemIncidents = snapshot.incidents.filter(item => !selectedId || item.system_id === selectedId).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const systemMaintenance = snapshot.maintenance.filter(item => !selectedId || item.system_id === selectedId).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const systemName = (id: string) => snapshot.systems.find(item => item.id === id)?.name || 'System removed';

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 text-slate-900 md:p-6" style={{ backgroundColor: 'var(--surface-canvas, #f8fafc)' }}>
      {dialog}
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {selectedId && !editor && <button className="mb-2 flex min-h-8 items-center gap-2 text-sm text-slate-600 hover:text-slate-900" onClick={() => setSelectedId(null)}><ArrowLeft size={16} />All systems</button>}
            <h1 className="text-2xl font-semibold">{editor ? `${editor.record ? 'Edit' : 'Add'} ${editor.kind === 'system' ? 'system' : editor.kind}` : selected?.name || 'Flown Systems'}</h1>
            <p className="mt-1 text-sm text-slate-600">{selected ? `${label(selected.environment)} · ${label(selected.category)}` : 'Staff-owned inventory, endpoint health and operational history.'}</p>
          </div>
          {!editor && <div className="flex flex-wrap gap-2">
            <button className={button} onClick={() => void load()} disabled={loading || busy}><RefreshCw size={16} />Refresh</button>
            <button className={primary} onClick={() => setEditor({ kind: 'system' })} disabled={busy || loading}><Plus size={16} />Add system</button>
          </div>}
        </header>
        {error && <div role="alert" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">{error}</div>}
        {loadError && <div role="alert" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">{loadError} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
        {notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}
        {loading ? <p role="status" className="py-6 text-sm text-slate-600">Loading systems and measured check history…</p>
          : editor ? <SystemEditor editor={editor} selectedId={selectedId} systems={snapshot.systems} owners={snapshot.owners} busy={busy}
            onCancel={() => setEditor(null)}
            onDelete={() => editor.record && void remove(editor.kind === 'system' ? 'flown_systems' : editor.kind === 'incident' ? 'flown_system_incidents' : 'flown_system_maintenance', editor.record.id, editor.kind === 'system' ? (editor.record as FlownSystem).name : (editor.record as SystemIncident | SystemMaintenance).title)}
            onSave={async (values) => {
              await mutate(async () => {
                const table = editor.kind === 'system' ? 'flown_systems' : editor.kind === 'incident' ? 'flown_system_incidents' : 'flown_system_maintenance';
                const operation = editor.record ? supabase.from(table).update(values).eq('id', editor.record.id) : supabase.from(table).insert(values);
                const { data, error } = await operation.select('id').single();
                if (error) throw error;
                if (!data) throw new Error('The record could not be saved.');
                setEditor(null);
                if (editor.kind === 'system') setSelectedId(data.id);
              }, 'Changes saved.');
            }} />
          : <>
            {selected ? <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Endpoint monitoring</h2>
                <div className="flex flex-wrap gap-2">
                  <button className={button} disabled={busy || !selected.monitoring_enabled} onClick={runCheck}>Run check</button>
                  <button className={button} disabled={busy} onClick={() => setEditor({ kind: 'system', record: selected })}>Edit system</button>
                </div>
              </div>
              <p className="text-sm">{monitorState(selected, selectedSummary)} · Owner: {snapshot.owners.find(owner => owner.id === selected.owner_id)?.name || 'Unassigned'}</p>
              {selected.description && <p className="whitespace-pre-wrap text-sm text-slate-600">{selected.description}</p>}
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Metric title="Sampled uptime · 30 days" value={sampledUptime(selectedSummary) === null ? '—' : `${sampledUptime(selectedSummary)!.toFixed(2)}%`} />
                <Metric title="Measured checks" value={Number(selectedSummary?.sample_count || 0).toLocaleString()} />
                <Metric title="Mean healthy latency" value={selectedSummary?.avg_latency_ms == null ? '—' : `${selectedSummary.avg_latency_ms} ms`} />
                <Metric title="Latest observation" value={date(selectedSummary?.latest_check?.checked_at || null)} small />
              </dl>
              <p className="text-xs text-slate-600">Uptime is successful 2xx checks ÷ up/down checks for this endpoint, not continuous availability. Missing checks are not assumed healthy. Blocked checks: {Number(selectedSummary?.blocked_count || 0)}. Maintenance is not excluded.</p>
              <div className="space-y-1 text-sm">
                {selected.url && <SafeLink value={selected.url}>Open system</SafeLink>}
                {selected.monitor_url && <p className="break-all text-slate-600">Health endpoint: {selected.monitor_url}</p>}
                {selectedSummary?.latest_check?.error && <p className="text-slate-600">Last check: {selectedSummary.latest_check.error}</p>}
              </div>
            </section> : <section>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input aria-label="Search systems" className={`${input} md:!w-72`} placeholder="Search name, owner or category" value={query} onChange={event => setQuery(event.target.value)} />
                <div className="w-48"><CustomSelect aria-label="Filter environment" className={input} value={environment} onChange={event => setEnvironment(event.target.value)}><option value="">All environments</option>{environments.map(value => <option key={value} value={value}>{label(value)}</option>)}</CustomSelect></div>
                <p className="ml-auto text-sm tabular-nums text-slate-600">{visible.length} of {snapshot.systems.length} systems</p>
              </div>
              <h2 className="sr-only">System inventory</h2>
              {!visible.length ? <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">{snapshot.systems.length ? 'No systems match these filters.' : 'No systems registered. Add a system and its owner; monitoring starts only after a real endpoint is configured.'}</div>
                : <div className="divide-y divide-slate-200">
                  <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 pb-2 text-[13px] text-slate-600 md:grid"><span>System / owner</span><span>Environment / category</span><span>Latest state</span><span className="text-right">30-day sampled uptime</span></div>
                  {visible.map(system => {
                    const summary = snapshot.summaries.find(item => item.system_id === system.id);
                    const uptime = sampledUptime(summary);
                    return <button key={system.id} onClick={() => setSelectedId(system.id)} className="grid w-full grid-cols-2 items-center gap-3 py-4 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:grid-cols-[2fr_1fr_1fr_1fr]">
                      <span className="min-w-0"><span className="block break-words font-medium">{system.name}</span><span className="block text-xs text-slate-600">{snapshot.owners.find(owner => owner.id === system.owner_id)?.name || 'Unassigned owner'}</span></span>
                      <span className="text-right tabular-nums md:order-last">{uptime === null ? '—' : `${uptime.toFixed(2)}%`}<span className="block text-xs text-slate-600">{Number(summary?.sample_count || 0)} checks</span></span>
                      <span className="text-[13px] text-slate-600">{label(system.environment)} · {label(system.category)}</span>
                      <span className="text-right text-sm md:text-left">{monitorState(system, summary)}</span>
                    </button>;
                  })}
                </div>}
            </section>}
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <SectionTitle title="Incidents" count={systemIncidents.filter(item => item.status !== 'resolved').length} noun="open" onAdd={() => setEditor({ kind: 'incident' })} disabled={busy || !snapshot.systems.length} />
                {!systemIncidents.length && <p className="mt-4 text-sm text-slate-600">No incidents recorded.</p>}
                {systemIncidents.slice(0, 6).map(item => <div key={item.id} className="mt-4 text-sm">
                  <div className="flex items-start justify-between gap-3"><p className="font-medium">{item.title}</p><span className="shrink-0 text-xs">{label(item.status)}</span></div>
                  <p className="mt-1 text-xs text-slate-600">{systemName(item.system_id)} · {label(item.severity)} · {date(item.started_at)}</p>
                  {item.notes && <p className="mt-1 whitespace-pre-wrap text-slate-600">{item.notes}</p>}
                  {item.resolved_at && <p className="mt-1 text-xs text-slate-600">Resolved {date(item.resolved_at)}</p>}
                  <div className="mt-2 flex gap-3"><button className="min-h-8 underline" disabled={busy} onClick={() => setEditor({ kind: 'incident', record: item })}>Edit / update</button><button className="min-h-8 text-slate-600 underline" disabled={busy} onClick={() => void remove('flown_system_incidents', item.id, item.title)}>Delete</button></div>
                </div>)}
                {systemIncidents.length > 6 && <details className="mt-4 text-sm"><summary className="cursor-pointer">Show {systemIncidents.length - 6} older incidents</summary>{systemIncidents.slice(6).map(item => <button key={item.id} className="mt-3 block min-h-8 text-left underline" onClick={() => setEditor({ kind: 'incident', record: item })}>{item.title} · {label(item.status)} · {date(item.started_at)}</button>)}</details>}
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <SectionTitle title="Maintenance" count={systemMaintenance.filter(item => ['scheduled','in_progress'].includes(item.status)).length} noun="planned / running" onAdd={() => setEditor({ kind: 'maintenance' })} disabled={busy || !snapshot.systems.length} />
                {!systemMaintenance.length && <p className="mt-4 text-sm text-slate-600">No maintenance windows scheduled.</p>}
                {systemMaintenance.slice(0, 6).map(item => <div key={item.id} className="mt-4 text-sm">
                  <div className="flex items-start justify-between gap-3"><p className="font-medium">{item.title}</p><span className="shrink-0 text-xs">{label(item.status)}</span></div>
                  <p className="mt-1 text-xs text-slate-600">{systemName(item.system_id)} · {date(item.starts_at)} – {date(item.ends_at)}</p>
                  {item.notes && <p className="mt-1 whitespace-pre-wrap text-slate-600">{item.notes}</p>}
                  <div className="mt-2 flex gap-3"><button className="min-h-8 underline" disabled={busy} onClick={() => setEditor({ kind: 'maintenance', record: item })}>Edit / update</button><button className="min-h-8 text-slate-600 underline" disabled={busy} onClick={() => void remove('flown_system_maintenance', item.id, item.title)}>Delete</button></div>
                </div>)}
                {systemMaintenance.length > 6 && <details className="mt-4 text-sm"><summary className="cursor-pointer">Show {systemMaintenance.length - 6} older windows</summary>{systemMaintenance.slice(6).map(item => <button key={item.id} className="mt-3 block min-h-8 text-left underline" onClick={() => setEditor({ kind: 'maintenance', record: item })}>{item.title} · {label(item.status)} · {date(item.starts_at)}</button>)}</details>}
              </section>
            </div>
            {selected && <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold">Check history</h2>
              <p className="mt-1 text-xs text-slate-600">Latest 60 observations across endpoints. The 30-day aggregate above includes all observations of the current endpoint.</p>
              {!snapshot.checks.length ? <p className="mt-4 text-sm text-slate-600">No observations yet. Deploy and schedule the monitor, or run a check.</p>
                : <div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-slate-600"><tr><th className="py-2 font-normal">Checked / endpoint</th><th className="font-normal">Result</th><th className="text-right font-normal">Latency</th></tr></thead><tbody>{snapshot.checks.map(check => <tr key={check.id} className="border-t border-slate-200"><td className="py-3 pr-3"><span>{date(check.checked_at)}</span><span className="block break-all text-xs text-slate-600">{check.endpoint_url} · {check.trigger_source}</span></td><td className="pr-3">{label(check.outcome)}{check.http_status ? ` · ${check.http_status}` : ''}{check.error && <span className="block text-xs text-slate-600">{check.error}</span>}</td><td className="text-right tabular-nums">{check.latency_ms === null ? '—' : `${check.latency_ms} ms`}</td></tr>)}</tbody></table></div>}
              <button className="mt-4 min-h-10 text-sm text-slate-600 underline" disabled={busy} onClick={() => void remove('flown_systems', selected.id, selected.name)}>Delete system and history</button>
            </section>}
            <p className="text-[13px] text-slate-600">Inventory refreshed {date(refreshedAt)}. Endpoint checks run server-side, independently of this page. States become stale after 15 minutes without an observation.</p>
          </>}
      </div>
    </div>
  );
};

function Metric({ title, value, small }: { title: string; value: string; small?: boolean }) {
  return <div><dt className="text-xs text-slate-600">{title}</dt><dd className={`mt-1 tabular-nums ${small ? 'text-sm' : 'text-xl'}`}>{value}</dd></div>;
}
function SectionTitle({ title, count, noun, onAdd, disabled }: { title: string; count: number; noun: string; onAdd: () => void; disabled: boolean }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-semibold">{title}</h2><p className="text-xs tabular-nums text-slate-600">{count} {noun}</p></div><button className={button} onClick={onAdd} disabled={disabled}><Plus size={16} />Add</button></div>;
}
function SafeLink({ value, children }: { value: string; children: React.ReactNode }) {
  try { publicHttpsUrl(value); } catch { return <span className="break-all text-slate-600">{value}</span>; }
  return <a className="inline-flex min-h-8 items-center gap-2 underline" href={value} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={14} /></a>;
}

function SystemEditor({ editor, selectedId, systems, owners, busy, onCancel, onSave, onDelete }: {
  editor: Editor; selectedId: string | null; systems: FlownSystem[]; owners: Owner[]; busy: boolean;
  onCancel: () => void; onSave: (values: Record<string, unknown>) => Promise<void>; onDelete: () => void;
}) {
  const record = editor.record;
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (editor.kind === 'system') {
      const item = record as FlownSystem | undefined;
      return { name: item?.name || '', description: item?.description || '', category: item?.category || 'application', environment: item?.environment || 'production',
        owner_id: item?.owner_id || '', url: item?.url || '', monitor_url: item?.monitor_url || '', monitoring_enabled: item?.monitoring_enabled ? 'true' : 'false' };
    }
    if (editor.kind === 'incident') {
      const item = record as SystemIncident | undefined;
      return { system_id: item?.system_id || selectedId || systems[0]?.id || '', title: item?.title || '', notes: item?.notes || '', severity: item?.severity || 'minor', status: item?.status || 'investigating',
        started_at: localDateTime(item?.started_at || new Date().toISOString()), resolved_at: item?.resolved_at ? localDateTime(item.resolved_at) : '' };
    }
    const item = record as SystemMaintenance | undefined;
    return { system_id: item?.system_id || selectedId || systems[0]?.id || '', title: item?.title || '', notes: item?.notes || '', status: item?.status || 'scheduled',
      starts_at: localDateTime(item?.starts_at || new Date().toISOString()), ends_at: localDateTime(item?.ends_at || new Date(Date.now() + 3600000).toISOString()) };
  });
  const [validation, setValidation] = useState('');
  const set = (name: string, value: string) => setValues(current => ({ ...current, [name]: value }));
  const field = (name: string, title: string, options?: { type?: string; required?: boolean; max?: number }) => <label className="block text-sm font-medium">{title}<input className={`${input} mt-2`} value={values[name] || ''} onChange={event => set(name, event.target.value)} type={options?.type || 'text'} required={options?.required} maxLength={options?.max} /></label>;
  const select = (name: string, title: string, options: { value: string; title: string }[]) => <label className="block text-sm font-medium">{title}<div className="mt-2"><CustomSelect aria-label={title} className={input} value={values[name]} onChange={event => set(name, event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.title}</option>)}</CustomSelect></div></label>;
  const choices = (options: string[]) => options.map(value => ({ value, title: label(value) }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setValidation('');
    try {
      const output: Record<string, unknown> = { ...values };
      if (editor.kind === 'system') {
        output.name = values.name.trim();
        if (!output.name) throw new Error('Enter a system name.');
        output.owner_id = values.owner_id || null;
        output.url = values.url.trim() ? publicHttpsUrl(values.url.trim()) : '';
        output.monitor_url = values.monitor_url.trim() ? publicHttpsUrl(values.monitor_url.trim()) : '';
        output.monitoring_enabled = values.monitoring_enabled === 'true';
        if (output.monitoring_enabled && !output.monitor_url) throw new Error('Add a public HTTPS health endpoint before enabling monitoring.');
      } else {
        output.title = values.title.trim();
        if (!output.title || !values.system_id) throw new Error('Choose a system and enter a title.');
        if (editor.kind === 'incident') {
          output.started_at = new Date(values.started_at).toISOString();
          output.resolved_at = values.status === 'resolved' ? new Date(values.resolved_at || Date.now()).toISOString() : null;
          if (output.resolved_at && Date.parse(String(output.resolved_at)) < Date.parse(String(output.started_at))) throw new Error('Resolution cannot precede the incident start.');
        } else {
          output.starts_at = new Date(values.starts_at).toISOString();
          output.ends_at = new Date(values.ends_at).toISOString();
          if (Date.parse(String(output.ends_at)) <= Date.parse(String(output.starts_at))) throw new Error('Maintenance must end after it starts.');
        }
      }
      await onSave(output);
    } catch (error) { setValidation(failure(error)); }
  };
  return <form onSubmit={event => void submit(event)} className="max-w-3xl space-y-4 rounded-lg border border-slate-200 bg-white p-5">
    {validation && <p role="alert" className="text-sm">{validation}</p>}
    {editor.kind === 'system' ? <>
      {field('name', 'System name', { required: true, max: 160 })}
      <div className="grid gap-4 sm:grid-cols-2">{select('environment', 'Environment', choices(environments))}{select('category', 'Category', choices(categories))}</div>
      {select('owner_id', 'Inventory owner', [{ value: '', title: 'Unassigned' }, ...owners.filter(owner => owner.account_status === 'active' || owner.id === values.owner_id).map(owner => ({ value: owner.id, title: `${owner.name}${owner.account_status === 'active' ? '' : ' (inactive)'}` }))])}
      <label className="block text-sm font-medium">Description<textarea className={`${input} mt-2`} rows={3} maxLength={5000} value={values.description} onChange={event => set('description', event.target.value)} /></label>
      {field('url', 'System URL (optional)', { type: 'url', max: 2048 })}
      {field('monitor_url', 'Public HTTPS health endpoint (optional)', { type: 'url', max: 2048 })}
      <p className="text-xs text-slate-600">Use the final public HTTPS URL on port 443. No credentials, fragments, local hosts or IP addresses. Redirects are not followed; only 2xx responses are healthy. Do not put secrets in URLs.</p>
      <label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={values.monitoring_enabled === 'true'} onChange={event => set('monitoring_enabled', String(event.target.checked))} />Enable automatic endpoint monitoring</label>
      <p className="text-xs text-slate-600">Automatic checks require the deployed systems-monitor function and an independently configured schedule. Enabling this setting alone does not create a scheduler.</p>
    </> : <>
      {select('system_id', 'System', systems.map(system => ({ value: system.id, title: system.name })))}
      {field('title', 'Title', { required: true, max: 200 })}
      {editor.kind === 'incident' ? <div className="grid gap-4 sm:grid-cols-2">
        {select('severity', 'Severity', choices(['minor','major','critical']))}{select('status', 'Incident status', choices(['investigating','identified','monitoring','resolved']))}
        {field('started_at', 'Started (your local time)', { type: 'datetime-local', required: true })}
        {values.status === 'resolved' && field('resolved_at', 'Resolved (your local time; blank means now)', { type: 'datetime-local' })}
      </div> : <>
        {select('status', 'Maintenance status', choices(['scheduled','in_progress','completed','cancelled']))}
        <div className="grid gap-4 sm:grid-cols-2">{field('starts_at', 'Starts (your local time)', { type: 'datetime-local', required: true })}{field('ends_at', 'Ends (your local time)', { type: 'datetime-local', required: true })}</div>
      </>}
      <label className="block text-sm font-medium">Notes / operational update<textarea className={`${input} mt-2`} rows={4} maxLength={5000} value={values.notes} onChange={event => set('notes', event.target.value)} /></label>
    </>}
    {record && <button type="button" disabled={busy} className="min-h-10 text-sm text-slate-600 underline" onClick={onDelete}>Delete {editor.kind === 'system' ? 'system and history' : 'record'}</button>}
    <div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className={primary} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </form>;
}
