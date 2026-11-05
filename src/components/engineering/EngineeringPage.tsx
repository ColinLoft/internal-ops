import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cable, Code2, Cog, Download, ExternalLink, FileSearch, LayoutList, Network, Plus, Search, GanttChart, Trash2, X, type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Dropdown } from '../common/Dropdown';

type SectionId = 'software' | 'mechanical' | 'electrical' | 'systems' | 'review';
type Meta = Record<string, string>;
type EngRecord = { id: string; record_type: SectionId; name: string; description: string | null; status: string; owner_id: string | null; due_date: string | null; metadata: Meta; created_by: string; created_at: string; updated_at: string };
type FieldDef = { key: string; label: string; options?: string[]; type?: 'url' | 'text' | 'date' | 'number' | 'textarea' };
type SectionDef = { id: SectionId; label: string; icon: LucideIcon; blurb: string; singular: string; statuses: string[]; doneStatuses: string[]; dateLabel: string; fields: FieldDef[] };

const START: FieldDef = { key: 'start', label: 'Start date', type: 'date' };
const UPDATE: FieldDef = { key: 'latest_update', label: 'Latest update', type: 'textarea' };

const SECTIONS: SectionDef[] = [
  { id: 'software', label: 'Software', icon: Code2, singular: 'software item', blurb: 'Firmware, backend, apps and tooling work with timelines, releases and status updates.', statuses: ['backlog', 'in_progress', 'in_review', 'testing', 'released', 'blocked'], doneStatuses: ['released'], dateLabel: 'Target date', fields: [{ key: 'component', label: 'Component', options: ['Firmware', 'Backend', 'Frontend', 'Mobile', 'Tooling', 'Other'] }, { key: 'version', label: 'Version / release' }, { key: 'link', label: 'Repository / PR link', type: 'url' }, START, UPDATE] },
  { id: 'mechanical', label: 'Mechanical', icon: Cog, singular: 'mechanical part', blurb: 'Parts and assemblies from CAD through review to 3D printing, machining or fabrication.', statuses: ['draft', 'in_design', 'cad_review', 'ready_to_make', 'in_production', 'complete', 'on_hold'], doneStatuses: ['complete'], dateLabel: 'Needed by', fields: [{ key: 'part_no', label: 'Part number' }, { key: 'revision', label: 'Revision' }, { key: 'process', label: 'Manufacturing process', options: ['3D print', 'CNC machining', 'Sheet metal', 'Laser cut', 'Injection molding', 'Off the shelf', 'Other'] }, { key: 'material', label: 'Material' }, { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'link', label: 'CAD / file link', type: 'url' }, START, UPDATE] },
  { id: 'electrical', label: 'Electrical', icon: Cable, singular: 'electrical item', blurb: 'Schematics, PCB layouts, fabrication and assembly with revisions and timelines.', statuses: ['draft', 'schematic', 'layout', 'design_review', 'fabrication', 'assembly', 'validated', 'blocked'], doneStatuses: ['validated'], dateLabel: 'Needed by', fields: [{ key: 'board', label: 'Board / assembly' }, { key: 'revision', label: 'Revision' }, { key: 'tool', label: 'Tool', options: ['KiCad', 'Altium', 'Fusion 360', 'Other'] }, { key: 'fab', label: 'Fab / assembly house' }, { key: 'link', label: 'Design files link', type: 'url' }, START, UPDATE] },
  { id: 'systems', label: 'Systems', icon: Network, singular: 'systems item', blurb: 'Integration, requirements and verification across software, mechanical and electrical.', statuses: ['planning', 'in_progress', 'integration', 'verification', 'complete', 'blocked'], doneStatuses: ['complete'], dateLabel: 'Target date', fields: [{ key: 'subsystem', label: 'Subsystem' }, { key: 'req_id', label: 'Requirement ID' }, { key: 'link', label: 'Document link', type: 'url' }, START, UPDATE] },
  { id: 'review', label: 'Review', icon: FileSearch, singular: 'review', blurb: 'CAD, PCB, code and design reviews with outcomes and sign-off before parts are made or released.', statuses: ['scheduled', 'in_progress', 'approved', 'approved_with_actions', 'rejected', 'closed'], doneStatuses: ['approved', 'approved_with_actions', 'rejected', 'closed'], dateLabel: 'Review date', fields: [{ key: 'review_type', label: 'Review type', options: ['CAD review', 'PCB review', 'Code review', 'Design review', 'Safety review', 'Release readiness'] }, { key: 'discipline', label: 'Discipline', options: ['Software', 'Mechanical', 'Electrical', 'Systems'] }, { key: 'item', label: 'Item under review' }, { key: 'reviewers', label: 'Reviewers' }, { key: 'link', label: 'Review link', type: 'url' }, START, UPDATE] },
];

const bySection = (id: SectionId) => (SECTIONS.find((section) => section.id === id) ?? SECTIONS[0]);
const label = (value: string) => value.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const tone = (status: string) => (['released', 'complete', 'validated', 'approved', 'approved_with_actions', 'ready_to_make', 'closed'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['rejected', 'blocked'].includes(status) ? 'bg-rose-50 text-rose-700' : ['in_review', 'in_progress', 'testing', 'cad_review', 'design_review', 'integration', 'verification', 'fabrication', 'assembly', 'in_production', 'scheduled', 'on_hold'].includes(status) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600');
const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';
const viewFromPath = (path: string): SectionId => { const segment = path.split('/')[2]; return SECTIONS.find((section) => section.id === segment)?.id ?? 'software'; };
const ago = (iso: string) => { const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`; };

export const EngineeringPage: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const [view, setView] = useState<SectionId>(() => viewFromPath(window.location.pathname));
  const [mode, setMode] = useState<'list' | 'timeline'>('list');
  const [records, setRecords] = useState<EngRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<EngRecord | 'new' | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('engineering_records').select('*').order('created_at', { ascending: false });
    if (loadError) setError(`Records could not be loaded: ${loadError.message}`);
    else { setError(''); setRecords((data || []).map((row) => ({ ...row, metadata: (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Meta })) as EngRecord[]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onRoute = () => { setView(viewFromPath(window.location.pathname)); setStatusFilter('all'); setSearch(''); };
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, [load]);

  const owner = (id: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const section = bySection(view);
  const sectionRecords = useMemo(() => records.filter((record) => record.record_type === section.id), [records, section]);
  const shown = sectionRecords.filter((record) => (statusFilter === 'all' || record.status === statusFilter) && `${record.name} ${record.description || ''} ${Object.values(record.metadata).join(' ')} ${owner(record.owner_id)}`.toLowerCase().includes(search.toLowerCase()));
  const open = sectionRecords.filter((record) => !section.doneStatuses.includes(record.status));
  const overdue = open.filter((record) => record.due_date && record.due_date < today());
  const blocked = sectionRecords.filter((record) => record.status === 'blocked' || record.status === 'on_hold');
  const stats = [
    { name: 'Total', value: sectionRecords.length, text: 'text-slate-900' },
    { name: 'Open', value: open.length, text: 'text-brand-600' },
    { name: 'Blocked / on hold', value: blocked.length, text: blocked.length ? 'text-amber-600' : 'text-slate-900' },
    { name: 'Overdue', value: overdue.length, text: overdue.length ? 'text-rose-600' : 'text-slate-900' },
  ];

  const exportCsv = () => {
    const columns = ['Name', 'Status', 'Owner', section.dateLabel, ...section.fields.map((field) => field.label), 'Description'];
    const rows = shown.map((record) => [record.name, label(record.status), owner(record.owner_id), record.due_date || '', ...section.fields.map((field) => record.metadata[field.key] || ''), record.description || '']);
    const csv = [columns, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${section.id}-${today()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const Icon = section.icon;
  const timelineRows = shown.filter((record) => record.metadata.start || record.due_date);
  const dayMs = 86400000;
  const starts = timelineRows.map((record) => new Date(`${record.metadata.start || record.due_date}T00:00:00`).getTime());
  const ends = timelineRows.map((record) => new Date(`${record.due_date || record.metadata.start}T00:00:00`).getTime());
  const rangeStart = Math.min(...starts, new Date(`${today()}T00:00:00`).getTime()) - 2 * dayMs;
  const rangeEnd = Math.max(...ends, new Date(`${today()}T00:00:00`).getTime()) + 3 * dayMs;
  const span = Math.max(rangeEnd - rangeStart, dayMs);
  const pct = (time: number) => ((time - rangeStart) / span) * 100;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-8 sm:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
          <div className="min-w-0"><h1 className="text-xl font-bold text-slate-900">{section.label}</h1><p className="mt-0.5 text-xs text-slate-500">{section.blurb}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportCsv} disabled={!shown.length} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40 md:min-h-0 md:py-2"><Download className="h-3.5 w-3.5" />Export</button>
          <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />New {section.singular}</button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((stat) => <div key={stat.name} className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-[11px] font-medium text-slate-500">{stat.name}</p><p className={`text-2xl font-bold tabular-nums ${stat.text}`}>{stat.value}</p></div>)}
        </div>
        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${section.label.toLowerCase()}`} className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-base outline-none focus:border-brand-400 md:text-xs" /></div>
              <Dropdown value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" className="min-w-40" options={[{ id: 'all', label: `All statuses (${sectionRecords.length})` }, ...section.statuses.map((status) => ({ id: status, label: `${label(status)} (${sectionRecords.filter((record) => record.status === status).length})` }))]} />
              <div className="ml-auto flex rounded-lg border border-slate-200 bg-white p-0.5">
                {([['list', 'List', LayoutList], ['timeline', 'Timeline', GanttChart]] as const).map(([id, name, ModeIcon]) => (
                  <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} className={`flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-semibold md:min-h-0 md:py-1.5 ${mode === id ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}><ModeIcon className="h-3.5 w-3.5" />{name}</button>
                ))}
              </div>
            </div>

            {mode === 'list' ? (
              <>
                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-bold">Item</th>{section.fields.slice(0, 2).map((field) => <th key={field.key} className="px-4 py-3 font-bold">{field.label}</th>)}<th className="px-4 py-3 font-bold">Status</th><th className="px-4 py-3 font-bold">Owner</th><th className="px-4 py-3 font-bold">{section.dateLabel}</th><th className="px-4 py-3 font-bold">Updated</th></tr></thead>
                    <tbody>
                      {shown.map((record) => (
                        <tr key={record.id} onClick={() => setEditing(record)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3"><b className="text-slate-800">{record.name}</b>{(record.metadata.latest_update || record.description) && <p className="line-clamp-1 max-w-xs text-slate-400">{record.metadata.latest_update || record.description}</p>}</td>
                          {section.fields.slice(0, 2).map((field) => <td key={field.key} className="px-4 py-3 text-slate-500">{record.metadata[field.key] || '—'}</td>)}
                          <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 font-bold ${tone(record.status)}`}>{label(record.status)}</span></td>
                          <td className="px-4 py-3 text-slate-500">{owner(record.owner_id)}</td>
                          <td className={`px-4 py-3 ${record.due_date && record.due_date < today() && !section.doneStatuses.includes(record.status) ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{record.due_date || '—'}</td>
                          <td className="px-4 py-3 text-slate-400">{ago(record.updated_at || record.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 md:hidden">
                  {shown.map((record) => (
                    <button key={record.id} type="button" onClick={() => setEditing(record)} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left">
                      <div className="flex items-start justify-between gap-2"><b className="text-sm text-slate-800">{record.name}</b><span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${tone(record.status)}`}>{label(record.status)}</span></div>
                      {record.metadata.latest_update && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{record.metadata.latest_update}</p>}
                      <p className="mt-2 text-xs text-slate-400">{owner(record.owner_id)}{record.due_date ? ` · ${section.dateLabel} ${record.due_date}` : ''}</p>
                    </button>
                  ))}
                </div>
                {!shown.length && <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">{sectionRecords.length ? 'Nothing matches your filters.' : `No ${section.label.toLowerCase()} items yet. Create the first ${section.singular}.`}</p>}
              </>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
                {timelineRows.length ? (
                  <div className="relative min-w-[640px] space-y-1.5">
                    <div className="pointer-events-none absolute inset-y-0 w-px bg-brand-400/70" style={{ left: `calc(11rem + (100% - 11rem) * ${pct(new Date(`${today()}T00:00:00`).getTime()) / 100})` }} aria-hidden />
                    {timelineRows.map((record) => {
                      const from = new Date(`${record.metadata.start || record.due_date}T00:00:00`).getTime();
                      const to = new Date(`${record.due_date || record.metadata.start}T00:00:00`).getTime() + dayMs;
                      return (
                        <button key={record.id} type="button" onClick={() => setEditing(record)} className="flex w-full items-center gap-3 text-left">
                          <span className="w-44 shrink-0 truncate text-xs font-semibold text-slate-700">{record.name}</span>
                          <span className="relative h-6 flex-1 rounded bg-slate-100/60"><span className={`absolute top-0.5 h-5 rounded ${tone(record.status)} ring-1 ring-inset ring-current/30`} style={{ left: `${Math.max(pct(from), 0)}%`, width: `${Math.max(pct(to) - pct(from), 1.5)}%` }} /></span>
                        </button>
                      );
                    })}
                  </div>
                ) : <p className="p-8 text-center text-xs text-slate-500">Add a start date and a due date to items to see them on the timeline.</p>}
              </div>
            )}
          </>
        )}
      </div>

      {editing && <RecordModal record={editing === 'new' ? null : editing} section={section} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} userId={currentUser.id} />}
    </main>
  );
};

const RecordModal: React.FC<{ record: EngRecord | null; section: SectionDef; userId: string; onClose: () => void; onSaved: () => void }> = ({ record, section, userId, onClose, onSaved }) => {
  const { users } = useWorkspace();
  const def = record ? bySection(record.record_type) : section;
  const [form, setForm] = useState({ name: record?.name || '', description: record?.description || '', status: record?.status || def.statuses[0], owner_id: record?.owner_id || userId, due_date: record?.due_date || '' });
  const [meta, setMeta] = useState<Meta>(record?.metadata || {});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { setError('A name is required.'); return; }
    const link = meta.link?.trim();
    if (link && !/^https?:\/\//i.test(link)) { setError('Links must start with http:// or https://.'); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description.trim() || null, status: form.status, owner_id: form.owner_id || null, due_date: form.due_date || null, metadata: Object.fromEntries(Object.entries(meta).filter(([, value]) => value)), updated_at: new Date().toISOString() };
    const { error: saveError } = record ? await supabase.from('engineering_records').update(payload).eq('id', record.id) : await supabase.from('engineering_records').insert({ ...payload, record_type: def.id, created_by: userId });
    setSaving(false);
    if (saveError) setError(saveError.message); else onSaved();
  };
  const remove = async () => {
    if (!record || !window.confirm(`Delete "${record.name}"?`)) return;
    const { error: deleteError } = await supabase.from('engineering_records').delete().eq('id', record.id);
    if (deleteError) setError(deleteError.message); else onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" onClick={onClose}>
      <div role="dialog" aria-label={record ? 'Edit record' : `New ${def.singular}`} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">{record ? `${def.label} record` : `New ${def.singular}`}</h2><button type="button" onClick={onClose} aria-label="Close" className="-m-2 p-2"><X className="h-4 w-4 text-slate-400" /></button></div>
        <div className="mt-4 space-y-3">
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
          <label className="block text-xs font-semibold text-slate-600">Name<input autoFocus={!record} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} className={inputClass} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Status<select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))} className={inputClass}>{def.statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">Owner<select value={form.owner_id} onChange={(event) => setForm((value) => ({ ...value, owner_id: event.target.value }))} className={inputClass}><option value="">Unassigned</option>{users.filter((user) => user.accountStatus !== 'removed').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
            {def.fields.map((field) => (
              <label key={field.key} className={`text-xs font-semibold text-slate-600 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>{field.label}
                {field.options ? <select value={meta[field.key] || ''} onChange={(event) => setMeta((value) => ({ ...value, [field.key]: event.target.value }))} className={inputClass}><option value="">Not set</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  : field.type === 'textarea' ? <textarea value={meta[field.key] || ''} onChange={(event) => setMeta((value) => ({ ...value, [field.key]: event.target.value }))} className={`${inputClass} min-h-16`} placeholder="Short progress note" />
                    : <input type={field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} value={meta[field.key] || ''} onChange={(event) => setMeta((value) => ({ ...value, [field.key]: event.target.value }))} placeholder={field.type === 'url' ? 'https://' : ''} className={inputClass} />}
              </label>
            ))}
            <label className="text-xs font-semibold text-slate-600">{def.dateLabel}<input type="date" value={form.due_date} onChange={(event) => setForm((value) => ({ ...value, due_date: event.target.value }))} className={inputClass} /></label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Description / notes<textarea value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className={`${inputClass} min-h-24`} /></label>
          {record && <p className="text-xs text-slate-400">Created {new Date(record.created_at).toLocaleDateString()} · updated {new Date(record.updated_at || record.created_at).toLocaleString()}</p>}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              {record && <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>}
              {meta.link && /^https?:\/\//i.test(meta.link) && <a href={meta.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600"><ExternalLink className="h-3.5 w-3.5" />Open link</a>}
            </div>
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : record ? 'Save changes' : `Create ${def.singular}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
