import { userFacingError } from '../../lib/userFacingError';
import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Search, Upload, Settings2, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { field } from '../work/EntityPanels';
import { GrantImport } from './GrantImport';
import { GRANT_STAGES, GRANT_TYPES, Grant, SOURCES, downloadCsv, goTo, money, stageLabel, typeLabel, nextGrantDate, dueTone } from './grantShared';

type Template = { id: string; title: string; description: string | null; days_after_award: number; priority: string; assign_to: string; enabled: boolean; position: number };

export const GrantsPage: React.FC = () => {
  const { users, currentUser } = useWorkspace();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('active');
  const [updating, setUpdating] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const records: Grant[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error: loadError } = await supabase.from('grants').select('*').order('id').range(offset, offset + 499);
      if (loadError) { setError(`Grants could not be loaded: ${loadError.message}. Run the latest database migration.`); break; }
      records.push(...(data || []) as Grant[]);
      if ((data || []).length < 500) { setError(''); setGrants(records); break; }
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => grants.filter((grant) => (stage === 'all' || (stage === 'active' ? !['closed', 'declined'].includes(grant.stage) : stage === 'closed' ? ['closed', 'declined'].includes(grant.stage) : grant.stage === stage)) && `${grant.name} ${grant.funder_name || ''} ${grant.next_action || ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (nextGrantDate(a) || '9999').localeCompare(nextGrantDate(b) || '9999') || a.name.localeCompare(b.name)), [grants, stage, query]);
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const exportCsv = () => downloadCsv('grants.csv', [['Name', 'Funder', 'Stage', 'Requested', 'Awarded', 'Type', 'Product', 'Source', 'Secured by', 'Submitted', 'Decision', 'Next date', 'Next action'], ...shown.map((g) => [g.name, g.funder_name, stageLabel(g.stage), g.amount_requested, g.amount_awarded, typeLabel(g.grant_type), g.in_kind_awarded || g.in_kind_requested, g.source, userName(g.secured_by_id), g.application_submitted_at, g.decision_at, nextGrantDate(g), g.next_action])]);
  const canConfigure = ['admin', 'coordinator'].includes(currentUser.systemRole);
  const changeStage = async (id: string, value: string) => {
    setUpdating(id); setError('');
    const { error: saveError } = await supabase.from('grants').update({ stage: value }).eq('id', id).select('id').single();
    if (saveError) setError(saveError.message);
    else {
      setGrants((rows) => rows.map((row) => row.id === id ? { ...row, stage: value } : row));
      const { error: eventError } = await supabase.from('grant_events').insert({ grant_id: id, event_type: 'stage_change', title: `Stage changed to ${stageLabel(value)}` });
      if (eventError) setError('The status was saved, but its activity could not be recorded. Refresh to check the grant.');
    }
    setUpdating(null);
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="workspace-page-header flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white">
        <div><h1 className="text-xl font-bold text-slate-900">Grants</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="workspace-control flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600"><Settings2 className="h-4 w-4" />Tools</summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-52 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <button type="button" onClick={() => setImporting(true)} className="workspace-control flex w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-slate-50"><Upload className="h-4 w-4" />Import grants</button>
              <button type="button" onClick={exportCsv} className="workspace-control flex w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-slate-50"><Download className="h-4 w-4" />Export CSV</button>
              {canConfigure && <button type="button" onClick={() => setSettings(true)} className="workspace-control w-full rounded-lg px-3 text-left text-sm hover:bg-slate-50">Award checklist</button>}
            </div>
          </details>
          <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />New grant</button>
        </div>
      </header>
      <div className="workspace-page-body mx-auto w-full max-w-7xl space-y-5">
        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{userFacingError(error)}</p>}
        <div className="workspace-toolbar flex flex-wrap items-center gap-3">
          <div className="relative min-w-[180px] flex-1 sm:max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search grants" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search grants" className={`${field} workspace-control pl-9`} /></div>
          <div className="w-44"><CustomSelect value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Filter by stage" className="workspace-control rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="active">Active grants</option><option value="all">All grants</option>{GRANT_STAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</CustomSelect></div>
        </div>
        <p className="text-xs text-slate-500">{shown.length} {shown.length === 1 ? 'grant' : 'grants'}</p>
        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : shown.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[minmax(0,2fr)_140px_100px_110px_minmax(0,1.5fr)] gap-4 px-4 py-3 text-sm text-slate-500 lg:grid"><span>Grant / funder</span><span>Status</span><span className="text-right">Amount</span><span>Next date</span><span>Next action</span></div>
            <ul className="divide-y divide-slate-100">{shown.map((grant) => (
              <li key={grant.id} className="grid grid-cols-[minmax(124px,1fr)_minmax(0,2fr)] items-center gap-3 p-4 lg:grid-cols-[minmax(0,2fr)_140px_100px_110px_minmax(0,1.5fr)] lg:gap-4">
                <a href={`/company/grants/${grant.id}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); goTo(`/company/grants/${grant.id}`); } }} className="col-span-2 min-w-0 rounded text-sm text-slate-900 hover:text-brand-600 focus-visible:outline focus-visible:outline-2 lg:col-span-1">
                  <span className="block font-semibold">{grant.name}</span><span className="mt-1 block text-sm text-slate-500">{grant.funder_name || 'No funder'}</span>
                </a>
                <CustomSelect aria-label={`Status for ${grant.name}`} value={grant.stage} disabled={updating === grant.id} onChange={(event) => void changeStage(grant.id, event.target.value)} className="workspace-control w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700">
                  {!GRANT_STAGES.some(([value]) => value === grant.stage) && <option value={grant.stage}>{stageLabel(grant.stage)}</option>}
                  {GRANT_STAGES.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                </CustomSelect>
                <p className="text-right text-sm tabular-nums text-slate-900">{grant.grant_type === 'product' ? (grant.in_kind_awarded || grant.in_kind_requested || '—') : money(grant.amount_awarded ?? grant.amount_requested)}</p>
                <p className={`text-sm ${dueTone(nextGrantDate(grant))}`}><span className="sr-only lg:hidden">Next date </span>{nextGrantDate(grant) ? new Date(`${nextGrantDate(grant)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</p>
                <p className="break-words text-sm text-slate-700"><span className="sr-only lg:hidden">Next action </span>{grant.next_action || '—'}</p>
              </li>
            ))}</ul>
          </div>
        ) : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">{grants.length ? 'No grants match your filters.' : 'No grants yet. Add the first funder you are pursuing.'}</div>}
      </div>
      {creating && <NewGrantModal userId={currentUser.id} onClose={() => setCreating(false)} onCreated={(id) => goTo(`/company/grants/${id}`)} />}
      {importing && <GrantImport userId={currentUser.id} existing={grants} onClose={() => setImporting(false)} onDone={() => void load()} />}
      {settings && <TemplatesModal onClose={() => setSettings(false)} />}
    </main>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{title}</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
      {children}
    </div>
  </div>
);

const NewGrantModal: React.FC<{ userId: string; onClose: () => void; onCreated: (id: string) => void }> = ({ userId, onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', funder_name: '', amount_requested: '', in_kind_requested: '', grant_type: 'money', source: '', contact_email: '', next_action: '', next_follow_up_at: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.name.trim()) { setError('A grant name is required.'); return; }
    setSaving(true);
    const { data, error: insertError } = await supabase.from('grants').insert({ name: form.name.trim(), funder_name: form.funder_name.trim() || null, grant_type: form.grant_type, amount_requested: form.grant_type !== 'product' && form.amount_requested ? Number(form.amount_requested) : null, in_kind_requested: form.grant_type !== 'money' ? form.in_kind_requested.trim() || null : null, source: form.source || null, contact_email: form.contact_email.trim().toLowerCase() || null, next_action: form.next_action.trim() || null, next_follow_up_at: form.next_follow_up_at || null, owner_id: userId, created_by: userId }).select('id').single();
    setSaving(false);
    if (insertError || !data) setError(insertError?.message || 'Could not create the grant.'); else onCreated(data.id);
  };
  return (
    <Modal title="New grant" onClose={onClose}>
      <div className="space-y-2">
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{userFacingError(error)}</p>}
        <label className="block text-sm text-slate-700">Grant name<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={field} /></label>
        <label className="block text-sm text-slate-700">Funder<input value={form.funder_name} onChange={(event) => setForm({ ...form, funder_name: event.target.value })} className={field} /></label>
        <label className="block text-sm text-slate-700">Next action<input maxLength={500} value={form.next_action} onChange={(event) => setForm({ ...form, next_action: event.target.value })} className={field} /></label>
        <label className="block text-sm text-slate-700">Next date<input type="date" value={form.next_follow_up_at} onChange={(event) => setForm({ ...form, next_follow_up_at: event.target.value })} className={field} /></label>
        {form.grant_type !== 'product' && <label className="block text-sm text-slate-700">Amount requested ($)<input type="number" min="0" value={form.amount_requested} onChange={(event) => setForm({ ...form, amount_requested: event.target.value })} className={field} /></label>}
        <details className="py-2"><summary className="cursor-pointer text-sm font-medium text-slate-600">More details</summary><div className="mt-3 space-y-3">
        <CustomSelect value={form.grant_type} onChange={(event) => setForm({ ...form, grant_type: event.target.value })} aria-label="Grant type" className={field}>{GRANT_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</CustomSelect>
        {form.grant_type !== 'money' && <input value={form.in_kind_requested} onChange={(event) => setForm({ ...form, in_kind_requested: event.target.value })} placeholder="Product requested (e.g. 20 laptops, software licenses)" className={field} />}
        <div className="grid grid-cols-1 gap-2"><input type="email" value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} placeholder="Funder contact email" className={field} /></div>
        <CustomSelect value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} aria-label="How we found it" className={field}><option value="">How did we find it?</option>{SOURCES.map((item) => <option key={item}>{item}</option>)}</CustomSelect>
        </div></details>
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancel</button><button type="button" disabled={saving} onClick={() => void submit()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Creating…' : 'Create grant'}</button></div>
      </div>
    </Modal>
  );
};

export const TemplatesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [rows, setRows] = useState<Template[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('grant_task_templates').select('*').order('position');
    if (loadError) setError(loadError.message); else setRows((data || []) as Template[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const update = async (id: string, values: Partial<Template>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...values } : row)));
    const { error: updateError } = await supabase.from('grant_task_templates').update(values).eq('id', id);
    if (updateError) setError(updateError.message);
  };
  const add = async () => {
    if (!title.trim()) return;
    const { error: insertError } = await supabase.from('grant_task_templates').insert({ title: title.trim(), position: rows.length + 1 });
    if (insertError) setError(insertError.message); else { setTitle(''); await load(); }
  };
  return (
    <Modal title="Award checklist" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">These tasks are created automatically the first time a grant moves to Awarded. Due dates count from the award day.</p>
      {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{userFacingError(error)}</p>}
      <ul className="space-y-2">{rows.map((row) => (
        <li key={row.id} className="space-y-1 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2"><input type="checkbox" checked={row.enabled} onChange={(event) => void update(row.id, { enabled: event.target.checked })} aria-label="Enabled" className="h-4 w-4" /><input value={row.title} onChange={(event) => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, title: event.target.value } : item)))} onBlur={(event) => event.target.value.trim() && void update(row.id, { title: event.target.value.trim() })} aria-label="Task title" className={field} /><button type="button" aria-label="Delete task template" onClick={() => void supabase.from('grant_task_templates').delete().eq('id', row.id).then(() => load())} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
            <label>Days after award<input type="number" min="0" max="730" value={row.days_after_award} onChange={(event) => void update(row.id, { days_after_award: Math.min(730, Math.max(0, Number(event.target.value) || 0)) })} className={field} /></label>
            <label>Priority<CustomSelect value={row.priority} onChange={(event) => void update(row.id, { priority: event.target.value })} className={field}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></CustomSelect></label>
            <label>Assign to<CustomSelect value={row.assign_to} onChange={(event) => void update(row.id, { assign_to: event.target.value })} className={field}><option value="owner">Grant owner</option><option value="secured_by">Who secured it</option><option value="creator">Creator</option></CustomSelect></label>
          </div>
        </li>
      ))}</ul>
      <div className="mt-3 flex gap-2"><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add(); }} placeholder="Add a task to every awarded grant" className={field} /><button type="button" onClick={() => void add()} className="rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">Add</button></div>
    </Modal>
  );
};
