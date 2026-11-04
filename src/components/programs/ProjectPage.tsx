import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, DollarSign, Plus, Trash2, Users } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { ActivityPanel, AttachmentsPanel, ChecklistPanel, CommentsPanel, LinksPanel, TimePanel, card, field, formatMinutes, logActivity } from '../work/EntityPanels';
import { RichNotes } from '../work/RichNotes';

export const navigate = (path: string) => {
  if (window.location.pathname !== path) window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

type Project = {
  id: string; name: string; description: string | null; notes: string | null; owner_id: string | null; status: string; priority: string;
  start_date: string | null; end_date: string | null; progress: number; budget_amount: number | null; health: string | null;
};
type TaskLite = { id: string; title: string; status: string; priority: string; assignee_id: string | null; due_date: string | null; parent_task_id: string | null };
type Milestone = { id: string; title: string; due_date: string | null; status: string };
type Member = { user_id: string; role: string };
type FinanceLite = { id: string; record_type: string; name: string; amount: number | null; status: string };

const STATUS: Record<string, string> = { planning: 'Planning', active: 'Active', at_risk: 'At risk', completed: 'Completed', archived: 'Archived' };
const TASK_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };
const MILESTONE_STATUS: Record<string, string> = { upcoming: 'Upcoming', in_progress: 'In progress', complete: 'Complete', at_risk: 'At risk' };
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const tabs = ['Overview', 'Tasks', 'Milestones', 'Team', 'Funding', 'Files & links', 'Time', 'Discussion'] as const;

export const ProjectPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { users, currentUser } = useWorkspace();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [finance, setFinance] = useState<FinanceLite[]>([]);
  const [minutes, setMinutes] = useState(0);
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newMilestone, setNewMilestone] = useState({ title: '', due_date: '' });
  const [memberId, setMemberId] = useState('');

  const load = useCallback(async () => {
    const [p, t, m, mem, f, time] = await Promise.all([
      supabase.from('program_projects').select('*').eq('id', projectId).maybeSingle(),
      supabase.from('program_tasks').select('id,title,status,priority,assignee_id,due_date,parent_task_id').eq('project_id', projectId).order('created_at', { ascending: true }),
      supabase.from('program_milestones').select('id,title,due_date,status').eq('project_id', projectId).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('project_members').select('user_id,role').eq('project_id', projectId),
      supabase.from('grants').select('id,stage,name,amount_awarded,amount_requested').eq('project_id', projectId),
      supabase.from('entity_time_entries').select('minutes').eq('entity_type', 'project').eq('entity_id', projectId),
    ]);
    if (p.error) { setError(p.error.message); return; }
    if (!p.data) { setMissing(true); return; }
    setProject(p.data as Project);
    setTasks((t.data || []) as TaskLite[]);
    setMilestones((m.data || []) as Milestone[]);
    setMembers((mem.data || []) as Member[]);
    setFinance(((f.data || []) as { id: string; stage: string; name: string; amount_awarded: number | null; amount_requested: number | null }[]).map((g) => ({ id: g.id, record_type: g.stage, name: g.name, amount: g.amount_awarded ?? g.amount_requested, status: g.stage })));
    const taskMinutes = await supabase.from('entity_time_entries').select('minutes,entity_id').eq('entity_type', 'task').in('entity_id', (t.data || []).map((row) => row.id));
    setMinutes(((time.data || []) as { minutes: number }[]).reduce((s, r) => s + r.minutes, 0) + ((taskMinutes.data || []) as { minutes: number }[]).reduce((s, r) => s + r.minutes, 0));
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const patch = async (values: Partial<Project>, activity?: string) => {
    setProject((current) => (current ? { ...current, ...values } : current));
    const { error: updateError } = await supabase.from('program_projects').update({ ...values, updated_at: new Date().toISOString() }).eq('id', projectId);
    if (updateError) { setError(updateError.message); void load(); return; }
    setError('');
    if (activity) void logActivity('project', projectId, activity);
  };

  const top = useMemo(() => tasks.filter((task) => !task.parent_task_id), [tasks]);
  const done = top.filter((task) => task.status === 'completed').length;
  const progress = top.length ? Math.round((done / top.length) * 100) : project?.progress ?? 0;
  const spent = finance.filter((row) => ['awarded', 'reporting', 'closed'].includes(row.record_type)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const budget = Number(project?.budget_amount || 0);
  const today = new Date().toISOString().slice(0, 10);
  const userName = (id: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';

  const addTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    setNewTask('');
    const { data, error: insertError } = await supabase.from('program_tasks').insert({ title, project_id: projectId, assignee_id: currentUser.id, status: 'not_started', priority: 'medium', progress: 0 }).select('id,title,status,priority,assignee_id,due_date,parent_task_id').single();
    if (insertError) { setError(insertError.message); setNewTask(title); return; }
    setTasks((current) => [...current, data as TaskLite]);
    void logActivity('project', projectId, 'added task', title);
  };
  const setTaskStatus = async (task: TaskLite, status: string) => {
    setTasks((current) => current.map((row) => (row.id === task.id ? { ...row, status } : row)));
    const { error: updateError } = await supabase.from('program_tasks').update({ status, progress: status === 'completed' ? 100 : 0, completed_at: status === 'completed' ? new Date().toISOString() : null }).eq('id', task.id);
    if (updateError) { setError(updateError.message); void load(); }
  };
  const addMilestone = async () => {
    if (!newMilestone.title.trim()) return;
    const { error: insertError } = await supabase.from('program_milestones').insert({ project_id: projectId, title: newMilestone.title.trim(), due_date: newMilestone.due_date || null });
    if (insertError) { setError(insertError.message); return; }
    void logActivity('project', projectId, 'added milestone', newMilestone.title.trim());
    setNewMilestone({ title: '', due_date: '' });
    await load();
  };
  const addMember = async () => {
    if (!memberId) return;
    const { error: insertError } = await supabase.from('project_members').upsert({ project_id: projectId, user_id: memberId, role: 'member' });
    if (insertError) { setError(insertError.message); return; }
    void logActivity('project', projectId, 'added team member', userName(memberId));
    setMemberId(''); await load();
  };
  const removeProject = async () => {
    if (!window.confirm('Delete this project and all of its tasks? This cannot be undone.')) return;
    const { error: deleteError } = await supabase.from('program_projects').delete().eq('id', projectId);
    if (deleteError) setError(deleteError.message); else navigate('/programs');
  };

  if (missing) return <main className="flex-1 p-8 text-sm text-slate-500">This project could not be found. <button type="button" onClick={() => navigate('/programs')} className="font-bold text-brand-600">Back to projects</button></main>;
  if (!project) return <main className="flex-1 p-8 text-xs text-slate-400">{error || 'Loading project…'}</main>;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <button type="button" onClick={() => navigate('/programs')} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-brand-600"><ArrowLeft className="h-3.5 w-3.5" />Projects</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <input value={project.name} onChange={(event) => setProject({ ...project, name: event.target.value })} onBlur={(event) => event.target.value.trim() && void patch({ name: event.target.value.trim() }, 'renamed the project')} aria-label="Project name" className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-xl font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-brand-400" />
          <button type="button" onClick={() => void removeProject()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs font-semibold text-slate-500">Status<select value={project.status} onChange={(event) => void patch({ status: event.target.value }, `set status to ${STATUS[event.target.value]}`)} className={field}>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-500">Priority<select value={project.priority} onChange={(event) => void patch({ priority: event.target.value }, `set priority to ${event.target.value}`)} className={field}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="text-xs font-semibold text-slate-500">Owner<select value={project.owner_id || ''} onChange={(event) => void patch({ owner_id: event.target.value || null }, `set owner to ${userName(event.target.value || null)}`)} className={field}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-500">Start<input type="date" value={project.start_date || ''} onChange={(event) => void patch({ start_date: event.target.value || null })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-500">Due<input type="date" value={project.end_date || ''} onChange={(event) => void patch({ end_date: event.target.value || null })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-500">Budget ($)<input type="number" min="0" value={project.budget_amount ?? ''} onChange={(event) => setProject({ ...project, budget_amount: event.target.value === '' ? null : Number(event.target.value) })} onBlur={(event) => void patch({ budget_amount: event.target.value === '' ? null : Number(event.target.value) }, 'updated the budget')} className={field} /></label>
        </div>
        <nav className="-mb-4 mt-4 flex gap-1 overflow-x-auto" aria-label="Project sections">
          {tabs.map((name) => <button key={name} type="button" onClick={() => setTab(name)} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-bold ${tab === name ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{name}</button>)}
        </nav>
      </header>

      <div className="space-y-4 p-5 sm:p-8">
        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}

        {tab === 'Overview' && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { icon: CheckCircle2, label: 'Progress', value: `${progress}%`, detail: `${done} of ${top.length} tasks done` },
                { icon: Clock, label: 'Time logged', value: formatMinutes(minutes), detail: 'Project and task time' },
                { icon: DollarSign, label: 'Funded by grants', value: budget ? `${Math.round((spent / budget) * 100)}%` : money(spent), detail: `${money(spent)} of ${budget ? money(budget) : 'no budget set'}` },
                { icon: CalendarDays, label: 'Milestones', value: `${milestones.filter((m) => m.status === 'complete').length}/${milestones.length}`, detail: project.end_date ? `Due ${project.end_date}` : 'No due date' },
              ].map(({ icon: Icon, label, value, detail }) => <div key={label} className={card}><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icon className="h-4 w-4 text-brand-600" />{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>)}
            </section>
            <section className={card}>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Summary</h3>
              <textarea value={project.description || ''} onChange={(event) => setProject({ ...project, description: event.target.value })} onBlur={(event) => void patch({ description: event.target.value.trim() || null })} rows={3} placeholder="What is this project and what does success look like?" className={field} />
            </section>
            <section><h3 className="mb-2 text-sm font-bold text-slate-900">Project notes</h3><RichNotes value={project.notes || ''} onSave={(html) => patch({ notes: html }, 'updated notes')} placeholder="Meeting notes, decisions, plans, links…" /></section>
            <ChecklistPanel entityType="project" entityId={projectId} />
            <ActivityPanel entityType="project" entityId={projectId} />
          </>
        )}

        {tab === 'Tasks' && (
          <section className={card}>
            <div className="flex gap-2"><input value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addTask(); }} placeholder="Add a task and press Enter" className={field} /><button type="button" onClick={() => void addTask()} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0"><Plus className="h-3.5 w-3.5" />Add</button></div>
            <ul className="mt-3 divide-y divide-slate-100">
              {top.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                  <input type="checkbox" checked={task.status === 'completed'} onChange={() => void setTaskStatus(task, task.status === 'completed' ? 'not_started' : 'completed')} aria-label={`Complete ${task.title}`} className="h-4 w-4" />
                  <button type="button" onClick={() => navigate(`/programs/task/${task.id}`)} className={`min-w-0 flex-1 truncate text-left font-semibold hover:text-brand-600 ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</button>
                  <span className="text-slate-500">{userName(task.assignee_id)}</span>
                  <span className={task.due_date && task.due_date < today && task.status !== 'completed' ? 'font-bold text-rose-600' : 'text-slate-500'}>{task.due_date || 'No date'}</span>
                  <select value={task.status} onChange={(event) => void setTaskStatus(task, event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-base md:text-xs" aria-label="Status">{Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </li>
              ))}
              {!top.length && <li className="py-4 text-xs text-slate-400">No tasks yet.</li>}
            </ul>
          </section>
        )}

        {tab === 'Milestones' && (
          <section className={card}>
            <div className="flex flex-wrap gap-2"><input value={newMilestone.title} onChange={(event) => setNewMilestone({ ...newMilestone, title: event.target.value })} placeholder="Milestone" className={`${field} min-w-0 flex-1`} /><input type="date" value={newMilestone.due_date} onChange={(event) => setNewMilestone({ ...newMilestone, due_date: event.target.value })} className={`${field} w-40`} /><button type="button" onClick={() => void addMilestone()} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0"><Plus className="h-3.5 w-3.5" />Add</button></div>
            <ul className="mt-3 divide-y divide-slate-100">
              {milestones.map((milestone) => (
                <li key={milestone.id} className="flex flex-wrap items-center gap-2 py-2 text-xs"><span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{milestone.title}</span><span className="text-slate-500">{milestone.due_date || 'No date'}</span>
                  <select value={milestone.status} onChange={(event) => void supabase.from('program_milestones').update({ status: event.target.value }).eq('id', milestone.id).then(() => load())} className="rounded-lg border border-slate-200 px-2 py-1 text-base md:text-xs" aria-label="Milestone status">{Object.entries(MILESTONE_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <button type="button" aria-label="Delete milestone" onClick={() => void supabase.from('program_milestones').delete().eq('id', milestone.id).then(() => load())} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></li>
              ))}
              {!milestones.length && <li className="py-4 text-xs text-slate-400">No milestones yet.</li>}
            </ul>
          </section>
        )}

        {tab === 'Team' && (
          <section className={card}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><Users className="h-4 w-4 text-brand-600" />Team</h3>
            <div className="flex gap-2"><select value={memberId} onChange={(event) => setMemberId(event.target.value)} className={field} aria-label="Add member"><option value="">Add a team member…</option>{users.filter((user) => !members.some((m) => m.user_id === user.id)).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><button type="button" onClick={() => void addMember()} className="rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">Add</button></div>
            <ul className="mt-3 divide-y divide-slate-100">
              <li className="flex items-center justify-between py-2 text-xs"><span className="font-semibold text-slate-800">{userName(project.owner_id)}</span><span className="text-slate-500">Owner</span></li>
              {members.map((member) => <li key={member.user_id} className="flex items-center justify-between py-2 text-xs"><span className="font-semibold text-slate-800">{userName(member.user_id)}</span><span className="flex items-center gap-2 text-slate-500">{member.role}<button type="button" aria-label="Remove member" onClick={() => void supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', member.user_id).then(() => load())} className="hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></span></li>)}
            </ul>
          </section>
        )}

        {tab === 'Funding' && (
          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">Grants funding this project</h3><button type="button" onClick={() => navigate('/company/grants')} className="text-xs font-bold text-brand-600">Open Grants</button></div>
            <p className="mt-2 text-xs text-slate-500">Budget {budget ? money(budget) : 'not set'} · Awarded {money(spent)}{budget ? ` · Gap ${money(Math.max(0, budget - spent))}` : ''}</p>
            {budget > 0 && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${'bg-brand-500'}`} style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} /></div>}
            <ul className="mt-3 divide-y divide-slate-100">
              {finance.map((row) => <li key={row.id} className="flex items-center justify-between py-2 text-xs"><span className="font-semibold text-slate-800">{row.name}<span className="ml-2 text-slate-400">{row.record_type}</span></span><span className="text-slate-700">{row.amount == null ? '—' : money(Number(row.amount))}</span></li>)}
              {!finance.length && <li className="py-3 text-xs text-slate-400">No grants are linked yet. Choose this project on a grant to show it here.</li>}
            </ul>
          </section>
        )}

        {tab === 'Files & links' && (<><AttachmentsPanel entityType="project" entityId={projectId} /><LinksPanel entityType="project" entityId={projectId} /></>)}
        {tab === 'Time' && <TimePanel entityType="project" entityId={projectId} onChanged={() => void load()} />}
        {tab === 'Discussion' && (<><CommentsPanel entityType="project" entityId={projectId} /><ActivityPanel entityType="project" entityId={projectId} /></>)}
      </div>
    </main>
  );
};
