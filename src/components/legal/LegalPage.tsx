import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, CheckCircle2, ChevronRight, ClipboardCheck,
  FileText, Gavel, Plus, Search, ShieldCheck, Scale, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

type LegalView = 'overview' | 'contracts' | 'compliance' | 'risk' | 'policies' | 'records';
type Contract = { name: string; counterparty: string; status: 'In review' | 'Active' | 'Expiring'; renewal: string };
type LegalRecord = { name: string; type: string; owner: string; updated: string };

const labels: Record<LegalView, string> = {
  overview: 'Overview',
  contracts: 'Contracts & Agreements',
  compliance: 'Compliance',
  risk: 'Risk Management',
  policies: 'Policies',
  records: 'Legal Records',
};
const contracts: Contract[] = [];
const records: LegalRecord[] = [];

export const LegalPage: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [view, setView] = useState<LegalView>(() => viewFromPath(window.location.pathname));
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [contractState, setContractState] = useState(contracts);
  const [recordState, setRecordState] = useState(records);
  const [error, setError] = useState('');
  useEffect(() => {
    void supabase.from('legal_records').select('id,record_type,name,description,status,owner_id,due_date,created_at').order('created_at', { ascending: false }).then(({ data, error: loadError }) => {
      if (loadError) { setError(loadError.message); return; }
      const loadedContracts: Contract[] = [];
      const loadedRecords: LegalRecord[] = [];
      for (const item of data || []) {
        const owner = item.owner_id || 'Unassigned';
        if (item.record_type === 'contracts') loadedContracts.push({ name: item.name, counterparty: item.description || '', status: item.status as Contract['status'], renewal: item.due_date || 'Not scheduled' });
        loadedRecords.push({ name: item.name, type: item.record_type, owner, updated: new Date(item.created_at).toLocaleDateString() });
      }
      setContractState(loadedContracts);
      setRecordState(loadedRecords);
    });
    const onRoute = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);
  const navigate = (next: LegalView) => {
    const path = next === 'overview' ? '/legal' : `/legal/${next}`;
    window.history.pushState({}, '', path);
    setView(next);
  };
  const filteredContracts = useMemo(() => contractState.filter((item) =>
    Object.values(item).join(' ').toLowerCase().includes(search.toLowerCase())), [contractState, search]);
  const filteredRecords = useMemo(() => recordState.filter((item) =>
    Object.values(item).join(' ').toLowerCase().includes(search.toLowerCase())), [search]);

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div><h1 className="mt-1 text-xl font-bold text-slate-900">{labels[view]}</h1><p className="mt-1 text-xs text-slate-500">Contracts, compliance, risk, policies, and legal records in one place.</p></div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap"><div className="relative w-full md:w-auto"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search legal" className="w-full md:w-48 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 text-xs outline-none focus:border-brand-400" /></div><button type="button" onClick={() => setShowNew(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add legal record</button></div>
      </header>
      <div className="mx-auto max-w-7xl p-5 sm:p-8">
        {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {view === 'overview' && <Overview onNavigate={navigate} />}
        {view === 'contracts' && <Contracts items={filteredContracts} onStatus={(name, status) => setContractState((items) => items.map((item) => item.name === name ? { ...item, status } : item))} />}
        {view === 'compliance' && <Compliance />}
        {view === 'risk' && <Risk />}
        {view === 'policies' && <Policies />}
        {view === 'records' && <Records items={filteredRecords} />}
      </div>
      {showNew && <NewRecordModal onClose={() => setShowNew(false)} onSaved={(record) => {
        void supabase.from('legal_records').insert({ ...record, owner_id: currentUser.id, created_by: currentUser.id }).then(({ error: insertError }) => {
          if (insertError) { setError(insertError.message); return; }
          setShowNew(false);
          window.location.reload();
        });
      }} />}
    </main>
  );
};

const Overview: React.FC<{ onNavigate: (view: LegalView) => void }> = ({ onNavigate }) => (
  <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Open contract reviews" value="0" detail="No legal records yet" />
      <Metric label="Compliance completion" value="0%" detail="No compliance records yet" />
      <Metric label="Active risk items" value="0" detail="No risk records yet" color="text-rose-600" />
      <Metric label="Policies current" value="0" detail="No policy records yet" />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Panel title="Legal work queue" icon={<Scale className="h-4 w-4" />}>
        <QueueItem icon={<FileText />} title="Contracts & Agreements" detail="Review legal records" onClick={() => onNavigate('contracts')} />
        <QueueItem icon={<ShieldCheck />} title="Compliance" detail="Review compliance records" onClick={() => onNavigate('compliance')} />
        <QueueItem icon={<AlertTriangle />} title="Risk Management" detail="Review risk records" onClick={() => onNavigate('risk')} />
      </Panel>
      <Panel title="Upcoming obligations" icon={<ClipboardCheck className="h-4 w-4" />}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Upcoming obligations will appear when legal records include due dates.</p>
        </div>
      </Panel>
    </div>
  </>
);
const Contracts: React.FC<{ items: Contract[]; onStatus: (name: string, status: Contract['status']) => void }> = ({ items, onStatus }) => (
  <Section title="Contracts & Agreements" description="Track counterparties, reviews, renewals, and execution status.">
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span>Agreement</span><span>Counterparty</span><span>Status</span><span>Renewal</span>
      </div>
      {items.map((item) => (
        <div key={item.name} className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] items-center border-t border-slate-100 px-4 py-3 text-xs">
          <b className="text-slate-800">{item.name}</b>
          <span className="text-slate-500">{item.counterparty}</span>
          <select value={item.status} onChange={(event) => onStatus(item.name, event.target.value as Contract['status'])} className="w-fit rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 outline-none">
            <option>In review</option><option>Active</option><option>Expiring</option>
          </select>
          <span className="text-slate-500">{item.renewal}</span>
        </div>
      ))}
    </div>
  </Section>
);
const Compliance: React.FC = () => <Section title="Compliance" description="Monitor regulatory obligations, control owners, evidence, and deadlines."><Panel title="Compliance checklist" icon={<CheckCircle2 className="h-4 w-4" />}><p className="text-xs text-slate-500">Compliance records will appear here after they are added.</p></Panel></Section>;
const Risk: React.FC = () => <Section title="Risk Management" description="Identify, assess, assign, and mitigate organizational legal and operational risks."><Panel title="Mitigation register" icon={<Gavel className="h-4 w-4" />}><p className="text-xs text-slate-500">Risk records will appear here after they are added.</p></Panel></Section>;
const Policies: React.FC = () => <Section title="Policies" description="Maintain the policy library, review cycles, owners, and staff acknowledgements."><Panel title="Policy library" icon={<BookOpen className="h-4 w-4" />}><p className="text-xs text-slate-500">Policy records will appear here after they are added.</p></Panel></Section>;
const Records: React.FC<{ items: LegalRecord[] }> = ({ items }) => <Section title="Legal Records" description="Centralize filings, resolutions, insurance, due diligence, and other legal evidence."><div className="grid gap-3 md:grid-cols-2">{items.map((item) => <div key={item.name} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start gap-3"><FileText className="h-5 w-5 text-brand-600" /><div className="min-w-0 flex-1"><b className="block text-xs text-slate-800">{item.name}</b><span className="mt-1 block text-xs text-slate-400">{item.type} · Owner: {item.owner}</span><span className="mt-3 block text-xs font-semibold text-slate-500">Updated {item.updated}</span></div></div></div>)}</div></Section>;

const Section: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => <div><div className="mb-5"><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div><div className="space-y-5">{children}</div></div>;
const Panel: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2 text-brand-600">{icon}<h2 className="text-sm font-bold text-slate-900">{title}</h2></div>{children}</section>;
const Metric: React.FC<{ label: string; value: string; detail: string; color?: string }> = ({ label, value, detail, color = 'text-brand-600' }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>;
const QueueItem: React.FC<{ icon: React.ReactNode; title: string; detail: string; onClick: () => void }> = ({ icon, title, detail, onClick }) => <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0"><span className="text-brand-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><span className="flex-1"><b className="block text-xs text-slate-800">{title}</b><span className="text-xs text-slate-400">{detail}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>;
const Obligation: React.FC<{ title: string; date: string }> = ({ title, date }) => <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><span className="h-2 w-2 rounded-full bg-amber-500" /><span className="flex-1 text-xs font-semibold text-slate-700">{title}</span><span className="text-xs text-slate-400">{date}</span></div>;
const ComplianceCard: React.FC<{ title: string; status: string; detail: string; warning?: boolean }> = ({ title, status, detail, warning }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><b className="text-xs text-slate-800">{title}</b><span className={`rounded-md px-2 py-1 text-xs font-bold ${warning ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>{status}</span></div><p className="mt-3 text-xs text-slate-400">{detail}</p></div>;
const RiskCard: React.FC<{ title: string; level: string; owner: string }> = ({ title, level, owner }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><b className="text-xs text-slate-800">{title}</b><span className={`rounded-md px-2 py-1 text-xs font-bold ${level === 'High' ? 'bg-rose-50 text-rose-700' : level === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>{level}</span></div><p className="mt-3 text-xs text-slate-400">Owner: {owner}</p></div>;
const NewRecordModal: React.FC<{ onClose: () => void; onSaved: (record: { name: string; record_type: string; description: string; status: string }) => void }> = ({ onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [recordType, setRecordType] = useState('contracts');
  const [description, setDescription] = useState('');
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Add legal record</h2><button type="button" onClick={onClose} aria-label="Close" className="flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0"><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 space-y-3"><input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Record or agreement name" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base md:text-xs outline-none focus:border-brand-400" /><select value={recordType} onChange={(event) => setRecordType(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base md:text-xs outline-none focus:border-brand-400"><option value="contracts">Contract or agreement</option><option value="compliance">Compliance record</option><option value="risk">Risk item</option><option value="policies">Policy</option></select><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description or next action" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base md:text-xs outline-none focus:border-brand-400" /></div><button type="button" disabled={!name.trim()} onClick={() => onSaved({ name: name.trim(), record_type: recordType, description: description.trim(), status: 'draft' })} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">Save legal record</button></div></div>;
};
const viewFromPath = (path: string): LegalView => { const segment = path.split('/')[2] as LegalView; return Object.keys(labels).includes(segment) ? segment : 'overview'; };
