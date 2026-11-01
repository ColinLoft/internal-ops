import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Beaker,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileCheck2,
  FileText,
  GitBranch,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

type EngineeringView = 'overview' | 'products' | 'requirements' | 'design' | 'cad-pcb' | 'testing' | 'changes' | 'reviews';
type RecordItem = { id: string; name: string; detail: string; status: string; owner: string; updated: string };

const navigation: { id: EngineeringView; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'products', label: 'Products & Systems', icon: Layers3 },
  { id: 'requirements', label: 'Requirements', icon: FileCheck2 },
  { id: 'design', label: 'Design Documentation', icon: BookOpen },
  { id: 'cad-pcb', label: 'CAD & PCB Records', icon: Code2 },
  { id: 'testing', label: 'Testing & Validation', icon: Beaker },
  { id: 'changes', label: 'Engineering Changes', icon: GitBranch },
  { id: 'reviews', label: 'Technical Reviews', icon: ShieldCheck },
];

const records: Record<EngineeringView, RecordItem[]> = {
  overview: [], products: [], requirements: [], design: [], 'cad-pcb': [],
  testing: [], changes: [], reviews: [],
};

export const EngineeringPage: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [view, setView] = useState<EngineeringView>(() => viewFromPath(window.location.pathname));
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [recordState, setRecordState] = useState(records);
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase.from('engineering_records').select('id,record_type,name,description,status,owner_id,created_at').order('created_at', { ascending: false }).then(({ data, error: loadError }) => {
      if (loadError) { setError(loadError.message); return; }
      const next = { ...records };
      for (const item of data || []) {
        const target = item.record_type as EngineeringView;
        if (!Object.prototype.hasOwnProperty.call(next, target)) continue;
        next[target] = [...next[target], {
          id: item.id,
          name: item.name,
          detail: item.description || '',
          status: item.status,
          owner: item.owner_id || 'Unassigned',
          updated: new Date(item.created_at).toLocaleDateString(),
        }];
      }
      setRecordState(next);
    });
    const onRoute = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);

  const navigate = (next: EngineeringView) => {
    const path = next === 'overview' ? '/engineering' : `/engineering/${next}`;
    window.history.pushState({}, '', path);
    setView(next);
  };

  const filteredRecords = useMemo(() => recordState[view].filter((record) =>
    Object.values(record).join(' ').toLowerCase().includes(search.toLowerCase())), [view, search]);
  const currentLabel = navigation.find((item) => item.id === view)?.label || 'Overview';

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Engineering workspace</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{currentLabel}</h1>
          <p className="mt-1 text-xs text-slate-500">Manage product development, technical documentation, requirements, records, testing, revisions, and engineering reviews.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search engineering" className="w-52 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 text-[11px] outline-none focus:border-brand-400" />
          </div>
          <button type="button" onClick={() => setShowNew(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><Plus className="mr-1 inline h-3.5 w-3.5" /> New record</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl p-5 sm:p-8">
        {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {view === 'overview' ? <Overview onNavigate={navigate} /> : <RecordSection view={view} items={filteredRecords} />}
      </div>
      {showNew && <NewEngineeringRecord onClose={() => setShowNew(false)} onSaved={(record) => {
        void supabase.from('engineering_records').insert({ ...record, created_by: currentUser.id, owner_id: currentUser.id }).then(({ error: insertError }) => {
          if (insertError) { setError(insertError.message); return; }
          setShowNew(false);
          window.location.reload();
        });
      }} />}
    </main>
  );
};

const Overview: React.FC<{ onNavigate: (view: EngineeringView) => void }> = ({ onNavigate }) => (
  <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Active products" value="0" detail="No engineering records yet" />
      <Metric label="Open requirements" value="0" detail="No engineering records yet" />
      <Metric label="Validation progress" value="0%" detail="No validation records yet" />
      <Metric label="Pending changes" value="0" detail="No engineering records yet" color="text-amber-600" />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Panel title="Engineering workstreams" icon={<Layers3 className="h-4 w-4" />}>
        {navigation.slice(1).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => onNavigate(item.id)} className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0"><span className="text-brand-600"><Icon className="h-4 w-4" /></span><span className="flex-1"><b className="block text-xs text-slate-800">{item.label}</b><span className="text-[10px] text-slate-400">{item.id === 'testing' ? '18 complete · 5 remaining' : item.id === 'changes' ? '4 open changes · 2 pending approval' : 'Review current records and baselines'}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>;
        })}
      </Panel>
      <Panel title="Attention needed" icon={<AlertTriangle className="h-4 w-4" />}>
        <p className="text-xs text-slate-500">Attention items will appear when engineering records are added.</p>
      </Panel>
    </div>
  </>
);

const RecordSection: React.FC<{ view: EngineeringView; items: RecordItem[] }> = ({ view, items }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">{navigation.find((item) => item.id === view)?.label}</h2><p className="mt-1 text-xs text-slate-500">Track ownership, status, revisions, and supporting engineering evidence.</p></div><span className="rounded-lg bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-700">{items.length} records</span></div>
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.8fr] bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span>Record</span><span>Details</span><span>Status</span><span>Updated</span></div>
      {items.map((item) => <div key={item.name} className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.8fr] items-center border-t border-slate-100 px-4 py-3 text-xs"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-brand-600" /><b className="text-slate-800">{item.name}</b></div><span className="text-slate-500">{item.detail} · {item.owner}</span><span className="w-fit rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{item.status}</span><span className="text-slate-500">{item.updated}</span></div>)}
    </div>
  </section>
);

const Panel: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2 text-brand-600">{icon}<h2 className="text-sm font-bold text-slate-900">{title}</h2></div>{children}</section>;
const Metric: React.FC<{ label: string; value: string; detail: string; color?: string }> = ({ label, value, detail, color = 'text-brand-600' }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
const Attention: React.FC<{ title: string; detail: string }> = ({ title, detail }) => <div className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0"><span className="h-2 w-2 rounded-full bg-amber-500" /><span className="flex-1"><b className="block text-xs text-slate-800">{title}</b><span className="text-[10px] text-slate-400">{detail}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></div>;
const NewEngineeringRecord: React.FC<{ onClose: () => void; onSaved: (record: { name: string; record_type: string; description: string; status: string }) => void }> = ({ onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [recordType, setRecordType] = useState<EngineeringView>('products');
  const [description, setDescription] = useState('');
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">New engineering record</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 space-y-3"><input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Record name or identifier" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /><select value={recordType} onChange={(event) => setRecordType(event.target.value as EngineeringView)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400">{navigation.slice(1).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Description" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /></div><button type="button" disabled={!name.trim()} onClick={() => onSaved({ name: name.trim(), record_type: recordType, description: description.trim(), status: 'draft' })} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">Save engineering record</button></div></div>;
};
const viewFromPath = (path: string): EngineeringView => {
  const segment = path.split('/')[2] as EngineeringView;
  return navigation.some((item) => item.id === segment) ? segment : 'overview';
};
