import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Search, Upload, Settings2, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { card, field } from '../work/EntityPanels';
import { GrantImport } from './GrantImport';
import { UpcomingDates } from './GrantExtras';
import { GRANT_STAGES, GRANT_TYPES, Grant, SOURCES, downloadCsv, goTo, money, stageLabel, stageTone, typeLabel, typeTone } from './grantShared';

type Template = { id: string; title: string; description: string | null; days_after_award: number; priority: string; assign_to: string; enabled: boolean; position: number };

export const GrantsPage: React.FC = () => {
  const { users, currentUser } = useWorkspace();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('grants').select('*').order('updated_at', { ascending: false });
    if (loadError) setError(`Grants could not be loaded: ${loadError.message}. Run the latest database migration.`); else { setError(''); setGrants((data || []) as Grant[]); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => grants.filter((grant) => (stage === 'all' || grant.stage === stage) && `${grant.name} ${grant.funder_name || ''}`.toLowerCase().includes(query.toLowerCase())), [grants, stage, query]);
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const totals = useMemo(() => ({
    pipeline: grants.filter((g) => ['prospect', 'applied'].includes(g.stage)).reduce((sum, g) => sum + Number(g.amount_requested || 0), 0),
    awarded: grants.filter((g) => ['awarded', 'reporting', 'closed'].includes(g.stage)).reduce((sum, g) => sum + Number(g.amount_awarded || 0), 0),
    open: grants.filter((g) => !['declined', 'closed'].includes(g.stage)).length,
  }), [grants]);
  const exportCsv = () => downloadCsv('grants.csv', [['Name', 'Funder', 'Stage', 'Requested', 'Awarded', 'Type', 'Product', 'Source', 'Secured by', 'Submitted', 'Decision', 'Next follow-up'], ...shown.map((g) => [g.name, g.funder_name, stageLabel(g.stage), g.amount_requested, g.amount_awarded, typeLabel(g.grant_type), g.in_kind_awarded || g.in_kind_requested, g.source, userName(g.secured_by_id), g.application_submitted_at, g.decision_at, g.next_follow_up_at])]);
  const canConfigure = ['admin', 'coordinator'].includes(currentUser.systemRole);

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <div><h1 className="text-xl font-bold text-slate-900">Grants</h1><p className="mt-1 text-xs text-slate-500">Track every funder from first idea through award, reporting and follow-up.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setImporting(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 md:min-h-0 md:py-2"><Upload className="h-3.5 w-3.5" />Import</button>
          <button type="button" onClick={exportCsv} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 md:min-h-0 md:py-2"><Download className="h-3.5 w-3.5" />Export</button>
          {canConfigure && <button type="button" onClick={() => setSettings(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 md:min-h-0 md:py-2"><Settings2 className="h-3.5 w-3.5" />Award checklist</button>}
          <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />New grant</button>
        </div>
      </header>
      <div className="space-y-4 p-5 sm:p-8">
        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-3">{[['Open opportunities', String(totals.open)], ['Requested in pipeline', money(totals.pipeline)], ['Total awarded', money(totals.awarded)]].map(([title, value]) => <div key={title} className={card}><p className="text-xs text-slate-500">{title}</p><p className="text-xl font-bold text-slate-900">{value}</p></div>)}</div>
        <UpcomingDates grants={grants} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search grants" className={`${field} pl-9`} /></div>
          <select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Filter by stage" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-base md:text-xs"><option value="all">All stages</option>{GRANT_STAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
        </div>
        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : shown.length ? (
          <div className="space-y-2">{shown.map((grant) => (
            <button type="button" key={grant.id} onClick={() => goTo(`/company/grants/${grant.id}`)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-brand-400">
              <div className="min-w-0"><p className="text-sm font-bold text-slate-900">{grant.name}</p><p className="text-xs text-slate-500">{grant.funder_name || 'No funder'} · {userName(grant.owner_id)}{grant.source ? ` · ${grant.source}` : ''}</p></div>
              <div className="flex items-center gap-3 text-xs"><span className="font-semibold text-slate-700">{grant.grant_type === 'product' ? (grant.in_kind_awarded || grant.in_kind_requested || 'Product') : money(grant.amount_awarded ?? grant.amount_requested)}</span><span className={`rounded-full px-2 py-0.5 font-semibold ${typeTone(grant.grant_type)}`}>{typeLabel(grant.grant_type)}</span><span className={`rounded-full px-2 py-0.5 font-semibold ${stageTone(grant.stage)}`}>{stageLabel(grant.stage)}</span></div>
            </button>
          ))}</div>
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
  const [form, setForm] = useState({ name: '', funder_name: '', amount_requested: '', in_kind_requested: '', grant_type: 'money', source: '', contact_email: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.name.trim()) { setError('A grant name is required.'); return; }
    setSaving(true);
    const { data, error: insertError } = await supabase.from('grants').insert({ name: form.name.trim(), funder_name: form.funder_name.trim() || null, grant_type: form.grant_type, amount_requested: form.grant_type !== 'product' && form.amount_requested ? Number(form.amount_requested) : null, in_kind_requested: form.grant_type !== 'money' ? form.in_kind_requested.trim() || null : null, source: form.source || null, contact_email: form.contact_email.trim().toLowerCase() || null, owner_id: userId, created_by: userId }).select('id').single();
    setSaving(false);
    if (insertError || !data) setError(insertError?.message || 'Could not create the grant.'); else onCreated(data.id);
  };
  return (
    <Modal title="New grant" onClose={onClose}>
      <div className="space-y-2">
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
        <input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Grant name" className={field} />
        <input value={form.funder_name} onChange={(event) => setForm({ ...form, funder_name: event.target.value })} placeholder="Funder" className={field} />
        <select value={form.grant_type} onChange={(event) => setForm({ ...form, grant_type: event.target.value })} aria-label="Grant type" className={field}>{GRANT_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
        {form.grant_type !== 'product' && <input type="number" min="0" value={form.amount_requested} onChange={(event) => setForm({ ...form, amount_requested: event.target.value })} placeholder="Amount requested ($)" className={field} />}
        {form.grant_type !== 'money' && <input value={form.in_kind_requested} onChange={(event) => setForm({ ...form, in_kind_requested: event.target.value })} placeholder="Product requested (e.g. 20 laptops, software licenses)" className={field} />}
        <div className="grid grid-cols-1 gap-2"><input type="email" value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} placeholder="Funder contact email" className={field} /></div>
        <select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} aria-label="How we found it" className={field}><option value="">How did we find it?</option>{SOURCES.map((item) => <option key={item}>{item}</option>)}</select>
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
      {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      <ul className="space-y-2">{rows.map((row) => (
        <li key={row.id} className="space-y-1 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2"><input type="checkbox" checked={row.enabled} onChange={(event) => void update(row.id, { enabled: event.target.checked })} aria-label="Enabled" className="h-4 w-4" /><input value={row.title} onChange={(event) => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, title: event.target.value } : item)))} onBlur={(event) => event.target.value.trim() && void update(row.id, { title: event.target.value.trim() })} aria-label="Task title" className={field} /><button type="button" aria-label="Delete task template" onClick={() => void supabase.from('grant_task_templates').delete().eq('id', row.id).then(() => load())} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
            <label>Days after award<input type="number" min="0" max="730" value={row.days_after_award} onChange={(event) => void update(row.id, { days_after_award: Math.min(730, Math.max(0, Number(event.target.value) || 0)) })} className={field} /></label>
            <label>Priority<select value={row.priority} onChange={(event) => void update(row.id, { priority: event.target.value })} className={field}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label>Assign to<select value={row.assign_to} onChange={(event) => void update(row.id, { assign_to: event.target.value })} className={field}><option value="owner">Grant owner</option><option value="secured_by">Who secured it</option><option value="creator">Creator</option></select></label>
          </div>
        </li>
      ))}</ul>
      <div className="mt-3 flex gap-2"><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add(); }} placeholder="Add a task to every awarded grant" className={field} /><button type="button" onClick={() => void add()} className="rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">Add</button></div>
    </Modal>
  );
};
