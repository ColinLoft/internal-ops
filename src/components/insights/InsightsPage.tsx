import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Clock3, Download, FileText, FolderKanban, Landmark, Plus, Target, TrendingUp, } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Section = 'executive' | 'programs' | 'financial' | 'projects' | 'custom';
type Range = 'month' | 'quarter' | 'year';
type Program = { id: string; name: string; status: string; director_id: string | null };
type Project = { id: string; division_id: string | null; name: string; status: string; priority: string; progress: number; owner_id: string | null; end_date: string | null };
type Task = { id: string; project_id: string | null; title: string; status: string; due_date: string | null; progress: number };
type Budget = { id: string; division_id: string | null; project_id: string | null; allocated: number; committed: number; spent: number; fiscal_year: number };
type Performance = { id: string; division_id: string | null; metric_name: string; target: number; actual: number; unit: string; period: string };
type ActivityRecord = { id: string; action: string; entity_type: string; created_at: string };

const sections: { id: Section; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'executive', label: 'Executive Overview', icon: BarChart3, description: 'Organization-wide performance, delivery, and financial health.' },
  { id: 'programs', label: 'Program Performance', icon: Target, description: 'Compare program outcomes, targets, and delivery progress.' },
  { id: 'financial', label: 'Financial Reports', icon: Landmark, description: 'Review allocated, committed, and spent program funds.' },
  { id: 'projects', label: 'Project Reports', icon: FolderKanban, description: 'Track project progress, deadlines, risk, and open work.' },
  { id: 'custom', label: 'Custom Reports', icon: FileText, description: 'Build saved report views from organization data.' },
];

export const InsightsPage: React.FC = () => {
  const [section, setSection] = useState<Section>(() => sectionFromPath(window.location.pathname));
  const [range, setRange] = useState<Range>('quarter');
  const [showRange, setShowRange] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    const results = await Promise.all([
      supabase.from('program_divisions').select('id,name,status,director_id'),
      supabase.from('program_projects').select('id,division_id,name,status,priority,progress,owner_id,end_date'),
      supabase.from('program_tasks').select('id,project_id,title,status,due_date,progress'),
      supabase.from('program_budgets').select('id,division_id,project_id,allocated,committed,spent,fiscal_year'),
      supabase.from('program_performance').select('id,division_id,metric_name,target,actual,unit,period'),
      supabase.from('system_activity_logs').select('id,action:event_type,entity_type:target_type,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) { setError(failed.error.message); return; }
    setPrograms((results[0].data || []) as Program[]);
    setProjects((results[1].data || []) as Project[]);
    setTasks((results[2].data || []) as Task[]);
    setBudgets((results[3].data || []) as Budget[]);
    setPerformance((results[4].data || []) as Performance[]);
    setActivity((results[5].data || []) as ActivityRecord[]);
  };
  useEffect(() => { void load(); const onRoute = () => setSection(sectionFromPath(window.location.pathname)); window.addEventListener('popstate', onRoute); return () => window.removeEventListener('popstate', onRoute); }, []);
  const navigate = (next: Section) => { const path = next === 'executive' ? '/insights' : `/insights/${next}`; window.history.pushState({}, '', path); setSection(next); };
  const active = sections.find((item) => item.id === section) || sections[0];
  const exportReport = () => {
    const rows = section === 'programs' ? programs.map((item) => [item.name, item.status]) : section === 'projects' ? projects.map((item) => [item.name, item.status, `${item.progress}%`]) : section === 'financial' ? budgets.map((item) => [item.fiscal_year, item.allocated, item.committed, item.spent]) : performance.map((item) => [item.metric_name, item.target, item.actual, item.unit]);
    const csv = rows.map((row) => row.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `${section}-report.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
    <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="mt-1 text-xl font-bold text-slate-900">{active.label}</h1><p className="mt-1 text-xs text-slate-500">{active.description}</p></div><div className="flex items-center gap-2"><div className="relative"><button type="button" onClick={() => setShowRange((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><CalendarDays className="h-3.5 w-3.5 text-brand-600" />{rangeLabel(range)}<ChevronDown className="h-3.5 w-3.5 text-slate-400" /></button>{showRange && <div className="absolute right-0 top-full z-10 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{(['month', 'quarter', 'year'] as Range[]).map((value) => <button key={value} type="button" onClick={() => { setRange(value); setShowRange(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-brand-50">{rangeLabel(value)}</button>)}</div>}</div><button type="button" onClick={exportReport} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Download className="h-3.5 w-3.5" /> Export</button></div></div></header>
    <div className="mx-auto max-w-7xl p-5 sm:p-8">{error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}{section === 'executive' && <Executive programs={programs} projects={projects} tasks={tasks} budgets={budgets} activity={activity} onNavigate={navigate} />}{section === 'programs' && <ProgramReport programs={programs} projects={projects} performance={performance} />}{section === 'financial' && <FinancialReport budgets={budgets} programs={programs} />}{section === 'projects' && <ProjectReport projects={projects} tasks={tasks} programs={programs} />}{section === 'custom' && <CustomReport />}</div>
  </main>;
};

const Executive: React.FC<{ programs: Program[]; projects: Project[]; tasks: Task[]; budgets: Budget[]; activity: ActivityRecord[]; onNavigate: (section: Section) => void }> = ({ programs, projects, tasks, budgets, activity, onNavigate }) => { const allocated = budgets.reduce((sum, item) => sum + Number(item.allocated), 0); const spent = budgets.reduce((sum, item) => sum + Number(item.spent), 0); return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active programs" value={String(programs.filter((item) => item.status === 'active').length)} detail={`${programs.length} total programs`} icon={Target} /><Metric label="Active projects" value={String(projects.filter((item) => item.status === 'active').length)} detail={`${projects.length} total projects`} icon={FolderKanban} /><Metric label="Open tasks" value={String(tasks.filter((item) => taskIsOpen(item.status)).length)} detail="Across program delivery" icon={CheckCircle2} /><Metric label="Budget used" value={allocated ? `${Math.round((spent / allocated) * 100)}%` : '—'} detail={allocated ? `${money(spent)} of ${money(allocated)}` : 'No budget records'} icon={Landmark} /></div><div className="grid gap-5 lg:grid-cols-2"><ReportPanel title="Delivery snapshot" icon={TrendingUp}><ReportRow label="Programs with active delivery" value={`${programs.filter((item) => item.status === 'active').length} / ${programs.length}`} /><ReportRow label="Projects at risk" value={String(projects.filter((item) => item.status === 'at_risk').length)} /><ReportRow label="Tasks completed" value={String(tasks.filter((item) => item.status === 'completed').length)} /></ReportPanel><ReportPanel title="Recent reporting activity" icon={Activity}>{activity.slice(0, 5).map((item) => <p key={item.id} className="border-b border-slate-100 py-2 text-xs text-slate-600"><strong>{item.action}</strong><span className="ml-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span></p>)}{!activity.length && <Empty text="No activity records available." />}</ReportPanel></div><div className="grid gap-3 sm:grid-cols-3"><LinkCard title="Program Performance" detail="Outcomes and targets" onClick={() => onNavigate('programs')} /><LinkCard title="Financial Reports" detail="Budgets and spending" onClick={() => onNavigate('financial')} /><LinkCard title="Project Reports" detail="Delivery and deadlines" onClick={() => onNavigate('projects')} /></div></div>; };

const ProgramReport: React.FC<{ programs: Program[]; projects: Project[]; performance: Performance[] }> = ({ programs, projects, performance }) => <div className="space-y-4"><ReportPanel title="Program performance" icon={Target}><div className="grid gap-3 md:grid-cols-2">{programs.map((program) => { const items = performance.filter((item) => item.division_id === program.id); const projectsForProgram = projects.filter((item) => item.division_id === program.id); const progress = projectsForProgram.length ? Math.round(projectsForProgram.reduce((sum, item) => sum + item.progress, 0) / projectsForProgram.length) : 0; return <article key={program.id} className="rounded-xl border border-slate-100 p-4"><div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-900">{program.name}</p><span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">{program.status}</span></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-500">{progress}% average project progress · {items.length} performance metrics</p>{items.slice(0, 3).map((item) => <p key={item.id} className="mt-2 flex justify-between text-xs text-slate-600"><span>{item.metric_name}</span><strong>{item.actual} / {item.target} {item.unit}</strong></p>)}</article>; })}</div>{!programs.length && <Empty text="No program records available." />}</ReportPanel></div>;

const FinancialReport: React.FC<{ budgets: Budget[]; programs: Program[] }> = ({ budgets, programs }) => <ReportPanel title="Financial reports" icon={Landmark}><div className="grid gap-3 sm:grid-cols-3"><Metric label="Allocated" value={money(budgets.reduce((sum, item) => sum + Number(item.allocated), 0))} detail="Program budgets" icon={Landmark} /><Metric label="Committed" value={money(budgets.reduce((sum, item) => sum + Number(item.committed), 0))} detail="Recorded commitments" icon={Clock3} /><Metric label="Spent" value={money(budgets.reduce((sum, item) => sum + Number(item.spent), 0))} detail="Recorded spending" icon={CheckCircle2} /></div><div className="mt-5 space-y-2">{budgets.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3 text-xs"><span className="flex-1 font-semibold text-slate-800">{programs.find((program) => program.id === item.division_id)?.name || 'Unassigned program'}</span><span>Allocated {money(item.allocated)}</span><span>Spent {money(item.spent)}</span><span className="text-slate-400">{item.fiscal_year}</span></div>)}</div>{!budgets.length && <Empty text="No budget records available." />}</ReportPanel>;

const ProjectReport: React.FC<{ projects: Project[]; tasks: Task[]; programs: Program[] }> = ({ projects, tasks, programs }) => <ReportPanel title="Project reports" icon={FolderKanban}><div className="space-y-2">{projects.map((project) => <article key={project.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-center gap-3"><span className="flex-1 text-sm font-bold text-slate-900">{project.name}</span><span className="text-xs text-slate-500">{programs.find((program) => program.id === project.division_id)?.name || 'Unassigned'}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{project.status}</span></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${project.progress}%` }} /></div><p className="mt-2 text-xs text-slate-500">{project.progress}% complete · {tasks.filter((task) => task.project_id === project.id && taskIsOpen(task.status)).length} open tasks · due {project.end_date || 'not scheduled'}</p></article>)}</div>{!projects.length && <Empty text="No project records available." />}</ReportPanel>;

const CustomReport: React.FC = () => <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><FileText className="mx-auto h-8 w-8 text-brand-500" /><h2 className="mt-3 text-sm font-bold text-slate-900">Custom Reports</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">The custom report builder is reserved for a later release. The other report areas can be filtered by period and exported now.</p><div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500"><Plus className="h-3.5 w-3.5" /> Builder coming soon</div></div>;
const ReportPanel: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-bold text-slate-900">{title}</h2></div><div className="mt-4">{children}</div></section>;
const Metric: React.FC<{ label: string; value: string; detail: string; icon: React.ElementType }> = ({ label, value, detail, icon: Icon }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-4 w-4 text-brand-600" /><p className="mt-3 text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></article>;
const ReportRow: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="flex justify-between border-b border-slate-100 py-3 text-xs"><span className="text-slate-500">{label}</span><strong className="text-slate-800">{value}</strong></div>;
const LinkCard: React.FC<{ title: string; detail: string; onClick: () => void }> = ({ title, detail, onClick }) => <button type="button" onClick={onClick} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-brand-300"><p className="text-xs font-bold text-slate-800">{title}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></button>;
const Empty: React.FC<{ text: string }> = ({ text }) => <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">{text}</p>;
const sectionFromPath = (path: string): Section => { const value = path.split('/')[2]; return sections.some((item) => item.id === value) ? value as Section : 'executive'; };
const rangeLabel = (range: Range) => range === 'month' ? 'This month' : range === 'year' ? 'This year' : 'This quarter';
const taskIsOpen = (status: string) => !['completed', 'cancelled'].includes(status);
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
