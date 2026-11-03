import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, Beaker, BookOpen, ChevronRight, Code2, Download, ExternalLink, FileCheck2,
  FileText, GitBranch, Layers3, Plus, Search, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

type SectionId = 'products' | 'requirements' | 'design' | 'cad-pcb' | 'testing' | 'changes' | 'reviews';
type EngineeringView = 'overview' | SectionId;
type Meta = Record<string, string>;
type EngRecord = { id: string; record_type: SectionId; name: string; description: string | null; status: string; owner_id: string | null; due_date: string | null; metadata: Meta; created_by: string; created_at: string; updated_at: string };
type FieldDef = { key: string; label: string; options?: string[]; type?: 'url' | 'productRef' | 'text' };
type SectionDef = { id: SectionId; label: string; icon: React.FC<{ className?: string }>; blurb: string; singular: string; statuses: string[]; doneStatuses: string[]; dateLabel: string; fields: FieldDef[] };

const SECTIONS: SectionDef[] = [
  { id: 'products', label: 'Products & Systems', icon: Layers3, singular: 'product', blurb: 'Products, assemblies and systems under development, with lifecycle stage and revision.', statuses: ['draft', 'active', 'on_hold', 'retired'], doneStatuses: ['retired'], dateLabel: 'Target release', fields: [{ key: 'version', label: 'Version / revision' }, { key: 'stage', label: 'Lifecycle stage', options: ['Concept', 'Prototype', 'Development', 'Production', 'End of life'] }] },
  { id: 'requirements', label: 'Requirements', icon: FileCheck2, singular: 'requirement', blurb: 'Traceable requirements with priority and verification method.', statuses: ['draft', 'approved', 'implemented', 'verified', 'rejected'], doneStatuses: ['verified', 'rejected'], dateLabel: 'Needed by', fields: [{ key: 'req_id', label: 'Requirement ID' }, { key: 'category', label: 'Category', options: ['Functional', 'Performance', 'Safety', 'Regulatory', 'Interface'] }, { key: 'priority', label: 'Priority', options: ['Must', 'Should', 'Could'] }, { key: 'verification', label: 'Verification method', options: ['Test', 'Inspection', 'Analysis', 'Demonstration'] }, { key: 'product_id', label: 'Product', type: 'productRef' }] },
  { id: 'design', label: 'Design Documentation', icon: BookOpen, singular: 'document', blurb: 'Specifications, architecture and design notes under revision control.', statuses: ['draft', 'in_review', 'approved', 'superseded'], doneStatuses: ['approved', 'superseded'], dateLabel: 'Review by', fields: [{ key: 'doc_type', label: 'Document type', options: ['Specification', 'Architecture', 'Schematic notes', 'Interface control', 'User manual', 'Datasheet'] }, { key: 'revision', label: 'Revision' }, { key: 'product_id', label: 'Product', type: 'productRef' }, { key: 'link', label: 'Document link', type: 'url' }] },
  { id: 'cad-pcb', label: 'CAD & PCB Records', icon: Code2, singular: 'CAD/PCB record', blurb: 'Mechanical, electrical and PCB design files, releases and bills of materials.', statuses: ['draft', 'in_review', 'released', 'obsolete'], doneStatuses: ['released', 'obsolete'], dateLabel: 'Release date', fields: [{ key: 'file_type', label: 'Record type', options: ['CAD model', 'PCB layout', 'Schematic', 'BOM', 'Gerber / fabrication'] }, { key: 'tool', label: 'Tool', options: ['SolidWorks', 'Fusion 360', 'KiCad', 'Altium', 'Other'] }, { key: 'revision', label: 'Revision' }, { key: 'product_id', label: 'Product', type: 'productRef' }, { key: 'link', label: 'File link', type: 'url' }] },
  { id: 'testing', label: 'Testing & Validation', icon: Beaker, singular: 'test', blurb: 'Test plans and results validating requirements and products.', statuses: ['planned', 'in_progress', 'passed', 'failed', 'blocked'], doneStatuses: ['passed', 'failed'], dateLabel: 'Test date', fields: [{ key: 'test_type', label: 'Test type', options: ['Unit', 'Integration', 'Environmental', 'Safety', 'Acceptance'] }, { key: 'product_id', label: 'Product', type: 'productRef' }, { key: 'requirement', label: 'Requirement ID covered' }, { key: 'result_notes', label: 'Result summary' }] },
  { id: 'changes', label: 'Engineering Changes', icon: GitBranch, singular: 'change', blurb: 'Change requests and orders with impact and approval tracking.', statuses: ['submitted', 'in_review', 'approved', 'implemented', 'rejected'], doneStatuses: ['implemented', 'rejected'], dateLabel: 'Effective date', fields: [{ key: 'change_no', label: 'Change number' }, { key: 'change_type', label: 'Change type', options: ['ECR', 'ECO', 'Deviation', 'Waiver'] }, { key: 'impact', label: 'Impact', options: ['Low', 'Medium', 'High'] }, { key: 'product_id', label: 'Product', type: 'productRef' }, { key: 'reason', label: 'Reason for change' }] },
  { id: 'reviews', label: 'Technical Reviews', icon: ShieldCheck, singular: 'review', blurb: 'Design and safety reviews with outcomes and follow-up actions.', statuses: ['scheduled', 'completed', 'action_required', 'closed'], doneStatuses: ['completed', 'closed'], dateLabel: 'Review date', fields: [{ key: 'review_type', label: 'Review type', options: ['Peer review', 'Preliminary design', 'Critical design', 'Safety review', 'Release readiness'] }, { key: 'product_id', label: 'Product', type: 'productRef' }, { key: 'outcome', label: 'Outcome', options: ['Pending', 'Approved', 'Approved with actions', 'Rejected'] }, { key: 'attendees', label: 'Attendees' }] },
];

const bySection = (id: SectionId) => SECTIONS.find((section) => section.id === id) as SectionDef;
const label = (value: string) => value.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const tone = (status: string) => (['active', 'approved', 'verified', 'released', 'passed', 'implemented', 'completed', 'closed'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['failed', 'rejected', 'blocked', 'action_required'].includes(status) ? 'bg-rose-50 text-rose-700' : ['in_review', 'in_progress', 'submitted', 'scheduled', 'on_hold'].includes(status) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600');
const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';
const viewFromPath = (path: string): EngineeringView => { const segment = path.split('/')[2]; return SECTIONS.some((section) => section.id === segment) ? segment as SectionId : 'overview'; };

export const EngineeringPage: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const [view, setView] = useState<EngineeringView>(() => viewFromPath(window.location.pathname));
  const [records, setRecords] = useState<EngRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<EngRecord | 'new' | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('engineering_records').select('*').order('created_at', { ascending: false });
    if (loadError) setError(`Engineering records could not be loaded: ${loadError.message}`);
    else { setError(''); setRecords((data || []).map((row) => ({ ...row, metadata: (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Meta })) as EngRecord[]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onRoute = () => { setView(viewFromPath(window.location.pathname)); setStatusFilter('all'); setSearch(''); };
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, [load]);

  const navigate = (next: EngineeringView) => {
    window.history.pushState({}, '', next === 'overview' ? '/engineering' : `/engineering/${next}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const owner = (id: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const section = view === 'overview' ? null : bySection(view);
  const sectionRecords = useMemo(() => (section ? records.filter((record) => record.record_type === section.id) : []), [records, section]);
  const shown = sectionRecords.filter((record) => (statusFilter === 'all' || record.status === statusFilter) && `${record.name} ${record.description || ''} ${Object.values(record.metadata).join(' ')} ${owner(record.owner_id)}`.toLowerCase().includes(search.toLowerCase()));
  const products = records.filter((record) => record.record_type === 'products');
  const productName = (id: string | undefined) => products.find((product) => product.id === id)?.name || '';

  const exportCsv = () => {
    if (!section) return;
    const columns = ['Name', 'Status', 'Owner', section.dateLabel, ...section.fields.map((field) => field.label), 'Description'];
    const rows = shown.map((record) => [record.name, label(record.status), owner(record.owner_id), record.due_date || '', ...section.fields.map((field) => (field.type === 'productRef' ? productName(record.metadata[field.key]) : record.metadata[field.key] || '')), record.description || '']);
    const csv = [columns, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `engineering-${section.id}-${today()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{section?.label || 'Overview'}</h1>
          <p className="mt-1 text-xs text-slate-500">{section?.blurb || 'Product development, requirements, design records, testing, revisions and technical reviews at a glance.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {section && <button type="button" onClick={exportCsv} disabled={!shown.length} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40 md:min-h-0 md:py-2"><Download className="h-3.5 w-3.5" />Export</button>}
          <button type="button" onClick={() => (section ? setEditing('new') : navigate('products'))} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />{section ? `New ${section.singular}` : 'Get started'}</button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : !section ? <Overview records={records} owner={owner} navigate={navigate} onOpen={setEditing} /> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${section.label.toLowerCase()}`} className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-base outline-none focus:border-brand-400 md:text-xs" /></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-base md:text-xs"><option value="all">All statuses ({sectionRecords.length})</option>{section.statuses.map((status) => <option key={status} value={status}>{label(status)} ({sectionRecords.filter((record) => record.status === status).length})</option>)}</select>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-bold">Record</th>{section.fields.slice(0, 2).map((field) => <th key={field.key} className="px-4 py-3 font-bold">{field.label}</th>)}<th className="px-4 py-3 font-bold">Status</th><th className="px-4 py-3 font-bold">Owner</th><th className="px-4 py-3 font-bold">{section.dateLabel}</th></tr></thead>
                <tbody>
                  {shown.map((record) => (
                    <tr key={record.id} onClick={() => setEditing(record)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-brand-600" /><div><b className="text-slate-800">{record.name}</b>{record.description && <p className="line-clamp-1 text-slate-400">{record.description}</p>}</div></div></td>
                      {section.fields.slice(0, 2).map((field) => <td key={field.key} className="px-4 py-3 text-slate-500">{field.type === 'productRef' ? productName(record.metadata[field.key]) || '—' : record.metadata[field.key] || '—'}</td>)}
                      <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 font-bold ${tone(record.status)}`}>{label(record.status)}</span></td>
                      <td className="px-4 py-3 text-slate-500">{owner(record.owner_id)}</td>
                      <td className={`px-4 py-3 ${record.due_date && record.due_date < today() && !section.doneStatuses.includes(record.status) ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{record.due_date || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && <p className="p-10 text-center text-xs text-slate-500">{sectionRecords.length ? 'No records match your filters.' : `No ${section.label.toLowerCase()} yet. Create the first ${section.singular}.`}</p>}
            </div>
          </>
        )}
      </div>

      {editing && <RecordModal record={editing === 'new' ? null : editing} section={section || bySection(editing === 'new' ? 'products' : editing.record_type)} products={products} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} userId={currentUser.id} />}
    </main>
  );
};

const Overview: React.FC<{ records: EngRecord[]; owner: (id: string | null) => string; navigate: (view: EngineeringView) => void; onOpen: (record: EngRecord) => void }> = ({ records, owner, navigate, onOpen }) => {
  const of = (type: SectionId) => records.filter((record) => record.record_type === type);
  const tests = of('testing');
  const requirements = of('requirements');
  const activeProducts = of('products').filter((record) => record.status === 'active').length;
  const openReqs = requirements.filter((record) => !['verified', 'rejected'].includes(record.status)).length;
  const settled = tests.filter((record) => ['passed', 'failed'].includes(record.status));
  const passRate = tests.length ? Math.round((tests.filter((record) => record.status === 'passed').length / tests.length) * 100) : 0;
  const pendingChanges = of('changes').filter((record) => ['submitted', 'in_review'].includes(record.status)).length;
  const coveredIds = new Set(tests.map((record) => (record.metadata.requirement || '').trim().toLowerCase()).filter(Boolean));
  const uncovered = requirements.filter((record) => !['rejected'].includes(record.status) && !coveredIds.has((record.metadata.req_id || '').trim().toLowerCase()));
  const attention = records.filter((record) => {
    const def = bySection(record.record_type);
    if (record.due_date && record.due_date < today() && !def.doneStatuses.includes(record.status)) return true;
    return ['failed', 'blocked', 'action_required'].includes(record.status);
  }).slice(0, 8);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active products" value={String(activeProducts)} detail={`${of('products').length} total products`} />
        <Metric label="Open requirements" value={String(openReqs)} detail={`${requirements.filter((record) => record.status === 'verified').length} verified`} />
        <Metric label="Test pass rate" value={`${passRate}%`} detail={`${settled.length} of ${tests.length} tests complete`} />
        <Metric label="Pending changes" value={String(pendingChanges)} detail="Awaiting review or approval" amber={pendingChanges > 0} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><BarChart3 className="h-4 w-4 text-brand-600" />Workstreams</h2>
          {SECTIONS.map((section) => {
            const items = of(section.id);
            const done = items.filter((record) => section.doneStatuses.includes(record.status)).length;
            const Icon = section.icon;
            return (
              <button key={section.id} type="button" onClick={() => navigate(section.id)} className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0">
                <Icon className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1"><b className="block text-xs text-slate-800">{section.label}</b><span className="text-xs text-slate-400">{items.length} records · {done} complete · {items.length - done} open</span></span>
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-brand-500" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            );
          })}
        </section>
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><AlertTriangle className="h-4 w-4 text-amber-500" />Attention needed</h2>
            {attention.length ? attention.map((record) => (
              <button key={record.id} type="button" onClick={() => onOpen(record)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 py-2.5 text-left last:border-0">
                <span className="min-w-0"><b className="block truncate text-xs text-slate-800">{record.name}</b><span className="text-xs text-slate-400">{bySection(record.record_type).label} · {owner(record.owner_id)}{record.due_date ? ` · due ${record.due_date}` : ''}</span></span>
                <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${tone(record.status)}`}>{label(record.status)}</span>
              </button>
            )) : <p className="text-xs text-slate-500">Nothing needs attention. Overdue, failed, blocked and action-required records appear here.</p>}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><FileCheck2 className="h-4 w-4 text-brand-600" />Requirement coverage</h2>
            <p className="text-xs text-slate-500">{requirements.length ? `${requirements.length - uncovered.length} of ${requirements.length} requirements have a linked test.` : 'Add requirements and tests to track verification coverage.'}</p>
            {uncovered.slice(0, 4).map((record) => <button key={record.id} type="button" onClick={() => onOpen(record)} className="mt-2 block w-full truncate rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100">{record.metadata.req_id ? `${record.metadata.req_id} · ` : ''}{record.name} — no test linked</button>)}
          </section>
        </div>
      </div>
    </>
  );
};

const Metric: React.FC<{ label: string; value: string; detail: string; amber?: boolean }> = ({ label: title, value, detail, amber }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{title}</p><p className={`mt-1 text-2xl font-bold ${amber ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>
);

const RecordModal: React.FC<{ record: EngRecord | null; section: SectionDef; products: EngRecord[]; userId: string; onClose: () => void; onSaved: () => void }> = ({ record, section, products, userId, onClose, onSaved }) => {
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
              <label key={field.key} className="text-xs font-semibold text-slate-600">{field.label}
                {field.type === 'productRef' ? <select value={meta[field.key] || ''} onChange={(event) => setMeta((value) => ({ ...value, [field.key]: event.target.value }))} className={inputClass}><option value="">None</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
                  : field.options ? <select value={meta[field.key] || ''} onChange={(event) => setMeta((value) => ({ ...value, [field.key]: event.target.value }))} className={inputClass}><option value="">Not set</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                    : <input type={field.type === 'url' ? 'url' : 'text'} value={meta[field.key] || ''} onChange={(event) => setMeta((value) => ({ ...value, [field.key]: event.target.value }))} placeholder={field.type === 'url' ? 'https://' : ''} className={inputClass} />}
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
