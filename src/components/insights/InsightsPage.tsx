import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DollarSign,
  Download,
  FileText,
  Target,
  TrendingUp,
  Users,
  Activity,
  Building2,
  FolderKanban,
  Landmark,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

type Range = 'This month' | 'This quarter' | 'This year';

const metrics = [
  { label: 'Active programs', value: '12', change: '+2 this quarter', icon: Target },
  { label: 'People reached', value: '8,420', change: '+18.4% vs last period', icon: Users },
  { label: 'Funds deployed', value: '$184,600', change: '72% of annual budget', icon: DollarSign },
  { label: 'Open commitments', value: '34', change: '8 due this week', icon: CheckCircle2 },
];

const programProgress = [
  { name: 'Community Learning', owner: 'Programs team', progress: 82, participants: '1,240 participants' },
  { name: 'Youth Leadership', owner: 'GTM team', progress: 68, participants: '680 participants' },
  { name: 'Emergency Support', owner: 'Operations team', progress: 54, participants: '320 participants' },
  { name: 'Volunteer Network', owner: 'People team', progress: 41, participants: '96 active volunteers' },
];

const reports = [
  { title: 'Quarterly impact report', detail: 'Program outcomes and participation', updated: 'Updated 2 days ago', status: 'Ready' },
  { title: 'Budget-to-actual summary', detail: 'Confirmed expenses and commitments', updated: 'Updated yesterday', status: 'Ready' },
  { title: 'Grant reporting tracker', detail: 'Upcoming funder deliverables', updated: '3 deadlines this month', status: 'Needs review' },
];

export const InsightsPage: React.FC = () => {
  const { calendarEvents, conversations, currentUser } = useWorkspace();
  const [section, setSection] = useState(() => window.location.pathname.split('/')[2] || 'overview');
  const [range, setRange] = useState<Range>('This quarter');
  const [showRangeMenu, setShowRangeMenu] = useState(false);
  const trend = useMemo(() => (range === 'This year' ? [42, 48, 55, 62, 67, 74, 81] : range === 'This month' ? [36, 44, 41, 58, 64, 71, 78] : [32, 39, 48, 51, 63, 69, 76]), [range]);

  React.useEffect(() => {
    const handlePathChange = () => setSection(window.location.pathname.split('/')[2] || 'overview');
    window.addEventListener('popstate', handlePathChange);
    return () => window.removeEventListener('popstate', handlePathChange);
  }, []);

  const sectionContent: Record<string, { title: string; description: string; icon: React.ElementType }> = {
    overview: { title: 'Overview', description: 'A high-level view of organizational health and momentum.', icon: BarChart3 },
    activity: { title: 'Activity', description: 'Trends across work, communication, engagement, and team participation.', icon: Activity },
    customers: { title: 'Customers', description: 'Customer relationships, support health, and outcomes.', icon: Building2 },
    finance: { title: 'Finance', description: 'Funding, expenses, budgets, and financial performance.', icon: Landmark },
    programs: { title: 'Programs', description: 'Program delivery, outcomes, and reusable reports for stakeholders.', icon: FolderKanban },
  };
  const activeSection = sectionContent[section] || sectionContent.overview;
  const ActiveIcon = activeSection.icon;
  const showOverview = section === 'overview';

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-6 sm:px-8">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Organization analytics</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{activeSection.title}</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">{activeSection.description}</p></div>
        <div className="flex items-center gap-2"><div className="relative"><button type="button" onClick={() => setShowRangeMenu((open) => !open)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><CalendarDays className="h-3.5 w-3.5 text-brand-600" />{range}<ChevronDown className="h-3.5 w-3.5 text-slate-400" /></button>{showRangeMenu && <div className="absolute right-0 top-full z-10 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{(['This month', 'This quarter', 'This year'] as Range[]).map((option) => <button key={option} type="button" onClick={() => { setRange(option); setShowRangeMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-slate-600 hover:bg-brand-50 hover:text-brand-700">{option}</button>)}</div>}</div><button type="button" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><Download className="h-3.5 w-3.5" /> Export</button></div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
        {!showOverview && <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><ActiveIcon className="mx-auto h-8 w-8 text-brand-500" /><h2 className="mt-3 text-sm font-bold text-slate-900">{activeSection.title} analytics are ready for data</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">This section is set up for live reporting. Connect the relevant workspace records to begin showing verified metrics instead of invented numbers.</p><div className="mt-5 grid gap-3 text-left sm:grid-cols-3">{['Define measures', 'Connect source data', 'Publish a report'].map((step, index) => <div key={step} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="text-[10px] font-bold text-brand-600">0{index + 1}</span><p className="mt-1 text-xs font-semibold text-slate-700">{step}</p></div>)}</div></section>}
        {!showOverview && section === 'activity' && <section className="grid gap-4 md:grid-cols-3"><InsightEmptyCard title="Workspace activity" detail={`${conversations.length} conversations available`} icon={Activity} /><InsightEmptyCard title="Upcoming events" detail={`${calendarEvents.length} calendar events available`} icon={CalendarDays} /><InsightEmptyCard title="Current user" detail={currentUser.name} icon={Users} /></section>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, change, icon: Icon }) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-4 w-4" /></span><TrendingUp className="h-4 w-4 text-brand-500" /></div><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-[10px] font-semibold text-brand-700">{change}</p></article>)}</div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="text-sm font-bold text-slate-900">Organization performance</h2><p className="mt-1 text-xs text-slate-500">Progress against the current period goals</p></div><BarChart3 className="h-5 w-5 text-brand-600" /></div><div className="mt-6 flex h-48 items-end gap-3 border-b border-l border-slate-100 px-3 pb-0">{trend.map((height, index) => <div key={index} className="group flex flex-1 flex-col items-center justify-end gap-2"><div className="w-full max-w-10 rounded-t-lg bg-brand-500 transition-all group-hover:bg-brand-600" style={{ height: `${height}%` }} /><span className="text-[10px] text-slate-400">{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'][index]}</span></div>)}</div><div className="mt-4 flex items-center justify-between text-[10px] text-slate-400"><span>Participation, delivery, and outcomes</span><span className="font-semibold text-brand-700">+14.2% overall</span></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Financial snapshot</h2><p className="mt-1 text-xs text-slate-500">Confirmed figures for this period</p></div><DollarSign className="h-5 w-5 text-brand-600" /></div><div className="mt-5 space-y-4">{[['Confirmed funding', '$256,400', 'bg-brand-500'], ['Spent', '$184,600', 'bg-brand-400'], ['Committed', '$42,800', 'bg-brand-300']].map(([label, value, color]) => <div key={label}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{label}</span><strong className="text-slate-900">{value}</strong></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: label === 'Confirmed funding' ? '100%' : label === 'Spent' ? '72%' : '24%' }} /></div></div>)}</div><button type="button" className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-brand-700">View Finance <ArrowUpRight className="h-3.5 w-3.5" /></button></section>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Program progress</h2><p className="mt-1 text-xs text-slate-500">Delivery progress across active programs</p></div><Target className="h-5 w-5 text-brand-600" /></div><div className="mt-4 space-y-4">{programProgress.map((program) => <div key={program.name}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-800">{program.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{program.owner} · {program.participants}</p></div><span className="text-xs font-bold text-brand-700">{program.progress}%</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${program.progress}%` }} /></div></div>)}</div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Reports</h2><p className="mt-1 text-xs text-slate-500">Reusable views for managers and teams</p></div><FileText className="h-5 w-5 text-brand-600" /></div><div className="mt-4 space-y-2">{reports.map((report) => <button key={report.title} type="button" className="flex w-full items-start gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-brand-200 hover:bg-brand-50/40"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800">{report.title}</span><span className="mt-1 block text-[10px] text-slate-500">{report.detail}</span><span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" />{report.updated}</span></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${report.status === 'Ready' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{report.status}</span></button>)}</div></section>
        </div>
      </div>
    </main>
  );
};

const InsightEmptyCard: React.FC<{ title: string; detail: string; icon: React.ElementType }> = ({ title, detail, icon: Icon }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-4 w-4 text-brand-600" /><p className="mt-3 text-xs font-bold text-slate-800">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{detail}</p><p className="mt-3 text-[10px] font-semibold text-slate-400">Live metric not connected</p></article>
);
