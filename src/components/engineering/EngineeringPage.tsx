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

type EngineeringView = 'overview' | 'products' | 'requirements' | 'design' | 'cad-pcb' | 'testing' | 'changes' | 'reviews';
type RecordItem = { name: string; detail: string; status: string; owner: string; updated: string };

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
  overview: [],
  products: [
    { name: 'Field Operations Kit', detail: 'Portable deployment system', status: 'Active development', owner: 'Engineering', updated: 'Oct 30, 2026' },
    { name: 'Community Access Terminal', detail: 'Connected service platform', status: 'Prototype', owner: 'Product Engineering', updated: 'Oct 27, 2026' },
  ],
  requirements: [
    { name: 'REQ-104 — Battery runtime', detail: 'Minimum 12-hour field operation', status: 'Approved', owner: 'Systems', updated: 'Oct 29, 2026' },
    { name: 'REQ-109 — Environmental sealing', detail: 'Outdoor enclosure protection', status: 'In review', owner: 'Mechanical', updated: 'Oct 25, 2026' },
  ],
  design: [
    { name: 'System architecture v3', detail: 'Product-level design baseline', status: 'Released', owner: 'Systems', updated: 'Oct 28, 2026' },
    { name: 'Thermal management study', detail: 'Cooling and enclosure analysis', status: 'Draft', owner: 'Mechanical', updated: 'Oct 21, 2026' },
  ],
  'cad-pcb': [
    { name: 'Enclosure assembly CAD', detail: 'Revision C · STEP + drawing', status: 'Released', owner: 'Mechanical', updated: 'Oct 30, 2026' },
    { name: 'Controller PCB layout', detail: 'Revision B · manufacturing package', status: 'In review', owner: 'Electrical', updated: 'Oct 26, 2026' },
  ],
  testing: [
    { name: 'Environmental validation', detail: 'Temperature and humidity test plan', status: 'In progress', owner: 'Validation', updated: 'Oct 31, 2026' },
    { name: 'Power subsystem test', detail: 'Bench test report and evidence', status: 'Passed', owner: 'Electrical', updated: 'Oct 24, 2026' },
  ],
  changes: [
    { name: 'ECR-027 — Connector update', detail: 'Replace field-service connector', status: 'Pending approval', owner: 'Electrical', updated: 'Oct 31, 2026' },
    { name: 'ECR-024 — Bracket redesign', detail: 'Reduce assembly time', status: 'Implemented', owner: 'Mechanical', updated: 'Oct 20, 2026' },
  ],
  reviews: [
    { name: 'Design review — Field Operations Kit', detail: 'Gate 3 technical review', status: 'Scheduled', owner: 'Engineering Lead', updated: 'Oct 30, 2026' },
    { name: 'Architecture review — Terminal', detail: 'Interface and scalability review', status: 'Complete', owner: 'Systems', updated: 'Oct 18, 2026' },
  ],
};

export const EngineeringPage: React.FC = () => {
  const [view, setView] = useState<EngineeringView>(() => viewFromPath(window.location.pathname));
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const onRoute = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);

  const navigate = (next: EngineeringView) => {
    const path = next === 'overview' ? '/engineering' : `/engineering/${next}`;
    window.history.pushState({}, '', path);
    setView(next);
  };

  const filteredRecords = useMemo(() => records[view].filter((record) =>
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
        {view === 'overview' ? <Overview onNavigate={navigate} /> : <RecordSection view={view} items={filteredRecords} />}
      </div>
      {showNew && <NewEngineeringRecord onClose={() => setShowNew(false)} />}
    </main>
  );
};

const Overview: React.FC<{ onNavigate: (view: EngineeringView) => void }> = ({ onNavigate }) => (
  <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Active products" value="2" detail="1 prototype in development" />
      <Metric label="Open requirements" value="14" detail="11 approved · 3 in review" />
      <Metric label="Validation progress" value="78%" detail="18 of 23 checks complete" />
      <Metric label="Pending changes" value="4" detail="2 awaiting technical approval" color="text-amber-600" />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Panel title="Engineering workstreams" icon={<Layers3 className="h-4 w-4" />}>
        {navigation.slice(1).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => onNavigate(item.id)} className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0"><span className="text-brand-600"><Icon className="h-4 w-4" /></span><span className="flex-1"><b className="block text-xs text-slate-800">{item.label}</b><span className="text-[10px] text-slate-400">{item.id === 'testing' ? '18 complete · 5 remaining' : item.id === 'changes' ? '4 open changes · 2 pending approval' : 'Review current records and baselines'}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>;
        })}
      </Panel>
      <Panel title="Attention needed" icon={<AlertTriangle className="h-4 w-4" />}>
        <Attention title="Connector update awaiting approval" detail="ECR-027 · Electrical · due Nov 03" />
        <Attention title="Environmental validation in progress" detail="Field Operations Kit · 5 checks remaining" />
        <Attention title="PCB manufacturing package review" detail="Controller PCB layout · Revision B" />
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
const NewEngineeringRecord: React.FC<{ onClose: () => void }> = ({ onClose }) => <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">New engineering record</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 space-y-3"><input placeholder="Record name or identifier" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /><select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400"><option>Product or system</option><option>Requirement</option><option>Design document</option><option>CAD or PCB record</option><option>Test or validation</option><option>Engineering change</option><option>Technical review</option></select><textarea rows={3} placeholder="Description, owner, or next action" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /></div><button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white">Save engineering record</button></div></div>;
const viewFromPath = (path: string): EngineeringView => {
  const segment = path.split('/')[2] as EngineeringView;
  return navigation.some((item) => item.id === segment) ? segment : 'overview';
};
