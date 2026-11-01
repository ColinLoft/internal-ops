import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, CheckCircle2, ChevronRight, ClipboardCheck,
  FileCheck2, FileText, Gavel, Plus, Search, ShieldCheck, Scale, X,
} from 'lucide-react';

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
const contracts: Contract[] = [
  { name: 'Partner memorandum', counterparty: 'Northstar Trust', status: 'In review', renewal: 'Nov 14, 2026' },
  { name: 'Independent contractor agreement', counterparty: 'Maya Patel', status: 'Active', renewal: 'Jan 31, 2027' },
  { name: 'Data processing addendum', counterparty: 'Civic Impact Fund', status: 'Expiring', renewal: 'Dec 15, 2026' },
  { name: 'Venue liability waiver', counterparty: 'Community Center', status: 'Active', renewal: 'Aug 02, 2027' },
];
const records: LegalRecord[] = [
  { name: 'Board resolution — fiscal year plan', type: 'Governance', owner: 'Operations', updated: 'Oct 29, 2026' },
  { name: 'Certificate of insurance', type: 'Insurance', owner: 'Administration', updated: 'Oct 22, 2026' },
  { name: 'State charitable registration', type: 'Regulatory filing', owner: 'Finance', updated: 'Oct 18, 2026' },
  { name: 'Vendor review register', type: 'Due diligence', owner: 'Procurement', updated: 'Oct 12, 2026' },
];

export const LegalPage: React.FC = () => {
  const [view, setView] = useState<LegalView>(() => viewFromPath(window.location.pathname));
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [contractState, setContractState] = useState(contracts);
  useEffect(() => {
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
  const filteredRecords = useMemo(() => records.filter((item) =>
    Object.values(item).join(' ').toLowerCase().includes(search.toLowerCase())), [search]);

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Legal workspace</p><h1 className="mt-1 text-xl font-bold text-slate-900">{labels[view]}</h1><p className="mt-1 text-xs text-slate-500">Contracts, compliance, risk, policies, and legal records in one place.</p></div>
        <div className="flex items-center gap-2"><div className="relative hidden md:block"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search legal" className="w-48 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 text-[11px] outline-none focus:border-brand-400" /></div><button type="button" onClick={() => setShowNew(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add legal record</button></div>
      </header>
      <div className="mx-auto max-w-7xl p-5 sm:p-8">
        {view === 'overview' && <Overview onNavigate={navigate} />}
        {view === 'contracts' && <Contracts items={filteredContracts} onStatus={(name, status) => setContractState((items) => items.map((item) => item.name === name ? { ...item, status } : item))} />}
        {view === 'compliance' && <Compliance />}
        {view === 'risk' && <Risk />}
        {view === 'policies' && <Policies />}
        {view === 'records' && <Records items={filteredRecords} />}
      </div>
      {showNew && <NewRecordModal onClose={() => setShowNew(false)} />}
    </main>
  );
};

const Overview: React.FC<{ onNavigate: (view: LegalView) => void }> = ({ onNavigate }) => (
  <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Open contract reviews" value="4" detail="2 require action this week" />
      <Metric label="Compliance completion" value="96%" detail="18 of 19 controls current" />
      <Metric label="Active risk items" value="3" detail="1 high priority" color="text-rose-600" />
      <Metric label="Policies current" value="28" detail="3 due for review" />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Panel title="Legal work queue" icon={<Scale className="h-4 w-4" />}>
        <QueueItem icon={<FileText />} title="Contracts & Agreements" detail="4 reviews · 2 renewals approaching" onClick={() => onNavigate('contracts')} />
        <QueueItem icon={<ShieldCheck />} title="Compliance" detail="18 controls current · 1 action overdue" onClick={() => onNavigate('compliance')} />
        <QueueItem icon={<AlertTriangle />} title="Risk Management" detail="3 active risks · highest: insurance renewal" onClick={() => onNavigate('risk')} />
      </Panel>
      <Panel title="Upcoming obligations" icon={<ClipboardCheck className="h-4 w-4" />}>
        <div className="space-y-3">
          <Obligation title="Data processing addendum renewal" date="Dec 15, 2026" />
          <Obligation title="Annual charitable registration" date="Jan 31, 2027" />
          <Obligation title="Policy review cycle" date="Feb 01, 2027" />
        </div>
      </Panel>
    </div>
  </>
);
const Contracts: React.FC<{ items: Contract[]; onStatus: (name: string, status: Contract['status']) => void }> = ({ items, onStatus }) => (
  <Section title="Contracts & Agreements" description="Track counterparties, reviews, renewals, and execution status.">
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <span>Agreement</span><span>Counterparty</span><span>Status</span><span>Renewal</span>
      </div>
      {items.map((item) => (
        <div key={item.name} className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] items-center border-t border-slate-100 px-4 py-3 text-xs">
          <b className="text-slate-800">{item.name}</b>
          <span className="text-slate-500">{item.counterparty}</span>
          <select value={item.status} onChange={(event) => onStatus(item.name, event.target.value as Contract['status'])} className="w-fit rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 outline-none">
            <option>In review</option><option>Active</option><option>Expiring</option>
          </select>
          <span className="text-slate-500">{item.renewal}</span>
        </div>
      ))}
    </div>
  </Section>
);
const Compliance: React.FC = () => (
  <Section title="Compliance" description="Monitor regulatory obligations, control owners, evidence, and deadlines.">
    <div className="grid gap-4 md:grid-cols-3">
      <ComplianceCard title="Charitable registration" status="Current" detail="Next filing due Jan 31, 2027" />
      <ComplianceCard title="Data privacy controls" status="Action needed" detail="1 evidence item needs review" warning />
      <ComplianceCard title="Insurance coverage" status="Current" detail="Certificate verified Oct 22, 2026" />
    </div>
    <Panel title="Compliance checklist" icon={<CheckCircle2 className="h-4 w-4" />}>
      <div className="space-y-3">
        {['Annual state registration', 'Board governance records', 'Privacy and data handling', 'Worker classification review', 'Insurance certificates'].map((item, index) => (
          <div key={item} className="flex items-center gap-3 text-xs"><CheckCircle2 className={`h-4 w-4 ${index === 1 ? 'text-amber-500' : 'text-brand-600'}`} /><span className="flex-1 font-semibold text-slate-700">{item}</span><span className="text-[10px] text-slate-400">{index === 1 ? 'Review needed' : 'Verified'}</span></div>
        ))}
      </div>
    </Panel>
  </Section>
);
const Risk: React.FC = () => <Section title="Risk Management" description="Identify, assess, assign, and mitigate organizational legal and operational risks."><div className="grid gap-4 md:grid-cols-3"><RiskCard title="Insurance renewal" level="High" owner="Administration" /><RiskCard title="Vendor data access" level="Medium" owner="Operations" /><RiskCard title="Contractor classification" level="Low" owner="People Operations" /></div><Panel title="Mitigation register" icon={<Gavel className="h-4 w-4" />}><div className="space-y-3">{['Confirm updated liability certificate', 'Complete vendor data processing review', 'Refresh contractor onboarding checklist'].map((item) => <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-xs"><span className="h-2 w-2 rounded-full bg-amber-500" /><span className="flex-1 font-semibold text-slate-700">{item}</span><ChevronRight className="h-4 w-4 text-slate-300" /></div>)}</div></Panel></Section>;
const Policies: React.FC = () => <Section title="Policies" description="Maintain the policy library, review cycles, owners, and staff acknowledgements."><div className="grid gap-3 md:grid-cols-2">{['Conflict of interest policy', 'Privacy and data handling', 'Records retention', 'Whistleblower protection', 'Expense and procurement policy', 'Safeguarding and conduct'].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><BookOpen className="h-5 w-5 text-brand-600" /><span className="flex-1"><b className="block text-xs text-slate-800">{item}</b><span className="text-[10px] text-slate-400">{index < 3 ? 'Current · reviewed Oct 2026' : 'Review due Feb 2027'}</span></span><FileCheck2 className="h-4 w-4 text-slate-300" /></div>)}</div></Section>;
const Records: React.FC<{ items: LegalRecord[] }> = ({ items }) => <Section title="Legal Records" description="Centralize filings, resolutions, insurance, due diligence, and other legal evidence."><div className="grid gap-3 md:grid-cols-2">{items.map((item) => <div key={item.name} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start gap-3"><FileText className="h-5 w-5 text-brand-600" /><div className="min-w-0 flex-1"><b className="block text-xs text-slate-800">{item.name}</b><span className="mt-1 block text-[10px] text-slate-400">{item.type} · Owner: {item.owner}</span><span className="mt-3 block text-[10px] font-semibold text-slate-500">Updated {item.updated}</span></div></div></div>)}</div></Section>;

const Section: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => <div><div className="mb-5"><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div><div className="space-y-5">{children}</div></div>;
const Panel: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2 text-brand-600">{icon}<h2 className="text-sm font-bold text-slate-900">{title}</h2></div>{children}</section>;
const Metric: React.FC<{ label: string; value: string; detail: string; color?: string }> = ({ label, value, detail, color = 'text-brand-600' }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
const QueueItem: React.FC<{ icon: React.ReactNode; title: string; detail: string; onClick: () => void }> = ({ icon, title, detail, onClick }) => <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0"><span className="text-brand-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><span className="flex-1"><b className="block text-xs text-slate-800">{title}</b><span className="text-[10px] text-slate-400">{detail}</span></span><ChevronRight className="h-4 w-4 text-slate-300" /></button>;
const Obligation: React.FC<{ title: string; date: string }> = ({ title, date }) => <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><span className="h-2 w-2 rounded-full bg-amber-500" /><span className="flex-1 text-xs font-semibold text-slate-700">{title}</span><span className="text-[10px] text-slate-400">{date}</span></div>;
const ComplianceCard: React.FC<{ title: string; status: string; detail: string; warning?: boolean }> = ({ title, status, detail, warning }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><b className="text-xs text-slate-800">{title}</b><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${warning ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>{status}</span></div><p className="mt-3 text-[10px] text-slate-400">{detail}</p></div>;
const RiskCard: React.FC<{ title: string; level: string; owner: string }> = ({ title, level, owner }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><b className="text-xs text-slate-800">{title}</b><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${level === 'High' ? 'bg-rose-50 text-rose-700' : level === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>{level}</span></div><p className="mt-3 text-[10px] text-slate-400">Owner: {owner}</p></div>;
const NewRecordModal: React.FC<{ onClose: () => void }> = ({ onClose }) => <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Add legal record</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 space-y-3"><input placeholder="Record or agreement name" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /><select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400"><option>Contract or agreement</option><option>Compliance record</option><option>Risk item</option><option>Policy</option></select><textarea placeholder="Description or next action" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400" /></div><button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white">Save legal record</button></div></div>;
const viewFromPath = (path: string): LegalView => { const segment = path.split('/')[2] as LegalView; return Object.keys(labels).includes(segment) ? segment : 'overview'; };
