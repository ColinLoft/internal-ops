import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, BriefcaseBusiness, CheckCircle2, FileText, Megaphone, Network, Plus, Search, Target, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

type View = 'overview' | 'marketing' | 'communications' | 'brand' | 'content' | 'partnerships' | 'business-development';
type RecordItem = { id: string; name: string; description: string | null; owner_id: string | null; status: string; stage: string | null; due_date: string | null };
type GtmActivity = { id: string; action: string; record_type: string; created_at: string };

const nav: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'marketing', label: 'Marketing', icon: Target },
  { id: 'communications', label: 'Communications', icon: Megaphone },
  { id: 'brand', label: 'Brand Management', icon: Network },
  { id: 'content', label: 'Media & Content', icon: FileText },
  { id: 'partnerships', label: 'Partnerships', icon: Users },
  { id: 'business-development', label: 'Business Development', icon: BriefcaseBusiness },
];

export const GTMPage: React.FC = () => {
  const { users, currentUser } = useWorkspace();
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [activity, setActivity] = useState<GtmActivity[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', status: 'planned', stage: '', due_date: '' });
  const load = async () => {
    const [recordsResult, activityResult] = await Promise.all([
      supabase.from('gtm_records').select('id,name,description,owner_id,status,stage,due_date').order('created_at', { ascending: false }),
      supabase.from('gtm_activity').select('id,action,record_type,created_at').order('created_at', { ascending: false }).limit(50),
    ]);
    if (recordsResult.error || activityResult.error) { setError(recordsResult.error?.message || activityResult.error?.message || 'GTM data could not be loaded.'); return; }
    setRecords((recordsResult.data || []) as RecordItem[]);
    setActivity((activityResult.data || []) as GtmActivity[]);
  };
  useEffect(() => { void load(); const onRoute = () => setView(viewFromPath(window.location.pathname)); window.addEventListener('popstate', onRoute); return () => window.removeEventListener('popstate', onRoute); }, []);
  const navigate = (next: View) => { const path = next === 'overview' ? '/gtm' : `/gtm/${next}`; window.history.pushState({}, '', path); setView(next); };
  const visible = useMemo(() => records.filter((record) => `${record.name} ${record.description || ''} ${record.status} ${record.stage || ''}`.toLowerCase().includes(query.toLowerCase())), [records, query]);
  const createRecord = async () => {
    if (!form.name.trim()) return setError('A record name is required.');
    const { error: insertError } = await supabase.from('gtm_records').insert({ ...form, name: form.name.trim(), description: form.description.trim() || null, stage: form.stage.trim() || null, due_date: form.due_date || null, area: view, owner_id: currentUser.id, created_by: currentUser.id });
    if (insertError) { setError(insertError.message); return; }
    setForm({ name: '', description: '', status: 'planned', stage: '', due_date: '' }); setShowForm(false); await load();
  };
  const areaRecords = view === 'overview' ? records : visible.filter((record) => record.status !== 'archived');
  return <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
    <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Go-to-market</p><h1 className="mt-1 text-xl font-bold text-slate-900">{nav.find((item) => item.id === view)?.label}</h1><p className="mt-1 text-xs text-slate-500">Manage marketing, communications, brand, media, partnerships, and business development.</p></div><button type="button" onClick={() => setShowForm(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> New record</button></div></header>
    <div className="mx-auto max-w-7xl p-5 sm:p-8">{error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}{view === 'overview' ? <Overview records={records} activity={activity} users={users} onNavigate={navigate} /> : <RecordArea records={areaRecords} users={users} query={query} setQuery={setQuery} area={view} />}{showForm && <RecordModal form={form} setForm={setForm} area={view} onClose={() => setShowForm(false)} onSave={() => void createRecord()} />}</div>
  </main>;
};

const Overview: React.FC<{ records: RecordItem[]; activity: GtmActivity[]; users: { id: string; name: string }[]; onNavigate: (view: View) => void }> = ({ records, activity, onNavigate }) => <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active initiatives" value={String(records.filter((item) => !['completed', 'archived'].includes(item.status)).length)} detail="Across GTM areas" icon={Target} /><Metric label="Campaigns & outreach" value={String(records.filter((item) => item.status === 'active').length)} detail="Currently in motion" icon={Megaphone} /><Metric label="Partnership pipeline" value={String(records.filter((item) => item.stage).length)} detail="Records with a stage" icon={Users} /><Metric label="Recent activity" value={String(activity.length)} detail="Latest GTM updates" icon={Activity} /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{nav.slice(1).map((item) => <button key={item.id} type="button" onClick={() => onNavigate(item.id)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-300"><item.icon className="h-4 w-4 text-brand-600" /><p className="mt-3 text-sm font-bold text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-500">{records.filter((record) => record.status !== 'archived').length} active records available</p></button>)}</div></div>;
const RecordArea: React.FC<{ records: RecordItem[]; users: { id: string; name: string }[]; query: string; setQuery: (value: string) => void; area: View }> = ({ records, users, query, setQuery, area }) => <div className="space-y-4"><div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${nav.find((item) => item.id === area)?.label.toLowerCase()}`} className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{records.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-brand-600" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{record.name}</p><p className="mt-1 text-xs text-slate-500">{record.description || 'No description added.'}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">{record.status}</span>{record.stage && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{record.stage}</span>}</div><p className="mt-3 text-[10px] text-slate-400">Owner: {users.find((user) => user.id === record.owner_id)?.name || 'Unassigned'} · Due {record.due_date || 'not scheduled'}</p></div></div></article>)}</div>{!records.length && <Empty text="No GTM records match this area." />}</div>;
const RecordModal: React.FC<{ form: { name: string; description: string; status: string; stage: string; due_date: string }; setForm: React.Dispatch<React.SetStateAction<{ name: string; description: string; status: string; stage: string; due_date: string }>>; area: View; onClose: () => void; onSave: () => void }> = ({ form, setForm, area, onClose, onSave }) => <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-5"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">New {nav.find((item) => item.id === area)?.label} record</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Name<input value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><label className="text-xs font-semibold text-slate-600">Status<select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="planned">Planned</option><option value="active">Active</option><option value="draft">Draft</option><option value="completed">Completed</option></select></label><label className="text-xs font-semibold text-slate-600">Stage<input value={form.stage} onChange={(event) => setForm((value) => ({ ...value, stage: event.target.value }))} placeholder="Optional pipeline stage" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><label className="text-xs font-semibold text-slate-600">Due date<input type="date" value={form.due_date} onChange={(event) => setForm((value) => ({ ...value, due_date: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Description<textarea value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label></div><button type="button" onClick={onSave} className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">Create record</button></div></div>;
const Metric: React.FC<{ label: string; value: string; detail: string; icon: React.ElementType }> = ({ label, value, detail, icon: Icon }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-4 w-4 text-brand-600" /><p className="mt-3 text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></article>;
const Empty: React.FC<{ text: string }> = ({ text }) => <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">{text}</div>;
const viewFromPath = (path: string): View => { const value = path.split('/')[2] as View; return nav.some((item) => item.id === value) ? value : 'overview'; };
