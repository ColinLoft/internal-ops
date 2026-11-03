import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FolderKanban, ListChecks, Plus, Search, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { ProjectPage, navigate } from './ProjectPage';
import { TaskPage } from './TaskPage';

type View = 'projects' | 'tasks';
type Project = { id: string; name: string; description: string | null; owner_id: string | null; status: string; priority: string; start_date: string | null; end_date: string | null; progress: number };
type Task = { id: string; project_id: string | null; assignee_id: string | null; title: string; status: string; priority: string; due_date: string | null; progress: number; parent_task_id?: string | null };

const PROJECT_STATUS: Record<string, string> = { planning: 'Planning', active: 'Active', at_risk: 'At risk', completed: 'Completed', archived: 'Archived' };
const TASK_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };
const statusTone: Record<string, string> = { planning: 'bg-slate-100 text-slate-600', active: 'bg-emerald-50 text-emerald-700', at_risk: 'bg-amber-50 text-amber-700', completed: 'bg-brand-50 text-brand-700', archived: 'bg-slate-100 text-slate-400' };
const priorityTone: Record<string, string> = { low: 'text-slate-500', medium: 'text-amber-600', high: 'text-rose-600' };
const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';

const viewFromPath = (path: string): View => (path.split('/')[2] === 'tasks' ? 'tasks' : 'projects');
const detailFromPath = (path: string): { kind: 'project' | 'task'; id: string } | null => {
  const [, , kind, id] = path.split('/');
  return (kind === 'project' || kind === 'task') && id ? { kind, id } : null;
};
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" onClick={onClose}>
    <div role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="-m-2 p-2"><X className="h-4 w-4 text-slate-400" /></button></div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  </div>
);

const Progress: React.FC<{ value: number }> = ({ value }) => (
  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
);

export const ProgramsPage: React.FC = () => {
  const [detail, setDetail] = useState(() => detailFromPath(window.location.pathname));
  useEffect(() => {
    const sync = () => setDetail(detailFromPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  if (detail?.kind === 'project') return <ProjectPage key={detail.id} projectId={detail.id} />;
  if (detail?.kind === 'task') return <TaskPage key={detail.id} taskId={detail.id} />;
  return <ProgramsList />;
};

const ProgramsList: React.FC = () => {
  const { users, currentUser } = useWorkspace();
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [projectModal, setProjectModal] = useState<Project | 'new' | null>(null);
  const [taskModal, setTaskModal] = useState<{ project_id: string } | null>(null);

  const load = useCallback(async () => {
    const [projectResult, taskResult] = await Promise.all([
      supabase.from('program_projects').select('id,name,description,owner_id,status,priority,start_date,end_date,progress').order('created_at', { ascending: false }),
      supabase.from('program_tasks').select('id,project_id,assignee_id,parent_task_id,title,status,priority,due_date,progress').order('due_date', { ascending: true, nullsFirst: false }),
    ]);
    const failed = projectResult.error || taskResult.error;
    if (failed) setError(`Projects could not be loaded: ${failed.message}`);
    else { setError(''); setProjects((projectResult.data || []) as Project[]); setTasks((taskResult.data || []) as Task[]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onRoute = () => { setView(viewFromPath(window.location.pathname)); setStatusFilter('all'); };
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, [load]);

  const switchView = (next: View) => {
    window.history.pushState({}, '', next === 'tasks' ? '/programs/tasks' : '/programs');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const userName = (id: string | null | undefined) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const topTasks = useMemo(() => tasks.filter((task) => !task.parent_task_id), [tasks]);
  const projectProgress = (project: Project) => {
    const own = topTasks.filter((task) => task.project_id === project.id);
    return own.length ? Math.round((own.filter((task) => task.status === 'completed').length / own.length) * 100) : project.progress;
  };
  const needle = query.trim().toLowerCase();
  const shownProjects = projects.filter((project) => (statusFilter === 'all' || project.status === statusFilter) && `${project.name} ${project.description || ''}`.toLowerCase().includes(needle));
  const shownTasks = topTasks.filter((task) => (statusFilter === 'all' || task.status === statusFilter) && (!mineOnly || task.assignee_id === currentUser.id) && task.title.toLowerCase().includes(needle));
  const overdue = (task: Task) => Boolean(task.due_date) && task.status !== 'completed' && (task.due_date as string) < today();

  const updateTaskStatus = async (task: Task, status: string) => {
    const { error: updateError } = await supabase.from('program_tasks').update({ status, progress: status === 'completed' ? 100 : task.progress }).eq('id', task.id);
    if (updateError) setError(updateError.message); else await load();
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{view === 'projects' ? 'Projects' : 'Tasks'}</h1>
            <p className="mt-1 text-xs text-slate-500">{view === 'projects' ? `${projects.length} projects · ${projects.filter((p) => p.status === 'active').length} active` : `${topTasks.length} tasks · ${topTasks.filter((t) => t.status !== 'completed').length} open · ${topTasks.filter(overdue).length} overdue`}</p>
          </div>
          <div className="flex gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist">
              {([['projects', 'Projects', FolderKanban], ['tasks', 'Tasks', ListChecks]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => switchView(id)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold md:min-h-0 md:py-1.5 ${view === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}><Icon className="h-3.5 w-3.5" />{label}</button>
              ))}
            </div>
            <button type="button" onClick={() => (view === 'projects' ? setProjectModal('new') : setTaskModal({ project_id: '' }))} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />{view === 'projects' ? 'New project' : 'New task'}</button>
          </div>
        </div>
      </header>

      <div className="min-w-0 space-y-4 p-5 sm:p-8">
        {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${view}`} className={`${input} pl-9`} /></div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-base md:text-xs" aria-label="Filter by status">
            <option value="all">All statuses</option>
            {Object.entries(view === 'projects' ? PROJECT_STATUS : TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {view === 'tasks' && <label className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-slate-600 md:min-h-0"><input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />Assigned to me</label>}
        </div>

        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : view === 'projects' ? (
          shownProjects.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shownProjects.map((project) => {
                const own = topTasks.filter((task) => task.project_id === project.id);
                const progress = projectProgress(project);
                return (
                  <button type="button" key={project.id} onClick={() => navigate(`/programs/project/${project.id}`)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
                    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">{project.name}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[project.status] || statusTone.planning}`}>{PROJECT_STATUS[project.status] || project.status}</span></div>
                    <p className="mt-1 line-clamp-2 min-h-8 text-xs text-slate-500">{project.description || 'No description yet.'}</p>
                    <div className="mt-4 space-y-1.5"><div className="flex justify-between text-xs text-slate-500"><span>{own.filter((task) => task.status === 'completed').length}/{own.length} tasks done</span><span>{progress}%</span></div><Progress value={progress} /></div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{userName(project.owner_id)}</span><span><span className={`font-semibold capitalize ${priorityTone[project.priority]}`}>{project.priority}</span>{project.end_date ? ` · due ${project.end_date}` : ''}</span></div>
                  </button>
                );
              })}
            </div>
          ) : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">{projects.length ? 'No projects match your filters.' : 'No projects yet. Create one to start tracking work.'}</div>
        ) : (
          shownTasks.length ? (
            <div className="space-y-2">
              {shownTasks.map((task) => (
                <article key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <CheckCircle2 className={`h-4 w-4 shrink-0 ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => navigate(`/programs/task/${task.id}`)} className={`text-left text-sm font-semibold hover:text-brand-700 ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</button>
                    <p className="mt-0.5 text-xs text-slate-400">{projects.find((project) => project.id === task.project_id)?.name || 'No project'} · {userName(task.assignee_id)} · <span className={overdue(task) ? 'font-semibold text-rose-600' : ''}>{task.due_date ? `due ${task.due_date}` : 'no due date'}</span> · <span className={`capitalize ${priorityTone[task.priority]}`}>{task.priority}</span></p>
                  </div>
                  <select value={task.status} onChange={(event) => void updateTaskStatus(task, event.target.value)} aria-label={`Status for ${task.title}`} className="rounded-lg border border-slate-200 px-2 py-1.5 text-base md:text-xs">{Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </article>
              ))}
            </div>
          ) : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">{tasks.length ? 'No tasks match your filters.' : 'No tasks yet. Create one to track delivery work.'}</div>
        )}
      </div>

      {projectModal && <ProjectModal project={projectModal === 'new' ? null : projectModal} tasks={topTasks.filter((task) => projectModal !== 'new' && task.project_id === projectModal.id)} onClose={() => setProjectModal(null)} onSaved={async () => { setProjectModal(null); await load(); }} onAddTask={(projectId) => { setProjectModal(null); setTaskModal({ project_id: projectId }); }} onOpenTask={(task) => { navigate(`/programs/task/${task.id}`); setProjectModal(null); }} />}
      {taskModal && <TaskModal projects={projects} initialProject={taskModal.project_id} onClose={() => setTaskModal(null)} onSaved={(created) => { setTaskModal(null); setTasks((current) => [created, ...current]); }} />}
    </main>
  );
};

const ProjectModal: React.FC<{ project: Project | null; tasks: Task[]; onClose: () => void; onSaved: () => void; onAddTask: (projectId: string) => void; onOpenTask: (task: Task) => void }> = ({ project, tasks, onClose, onSaved, onAddTask, onOpenTask }) => {
  const { users, currentUser } = useWorkspace();
  const [form, setForm] = useState({ name: project?.name || '', description: project?.description || '', status: project?.status || 'planning', priority: project?.priority || 'medium', owner_id: project?.owner_id || currentUser.id, start_date: project?.start_date || '', end_date: project?.end_date || '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));

  const save = async () => {
    if (!form.name.trim()) { setError('Project name is required.'); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { setError('The end date must be after the start date.'); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description.trim() || null, status: form.status, priority: form.priority, owner_id: form.owner_id || null, start_date: form.start_date || null, end_date: form.end_date || null };
    const { error: saveError } = project ? await supabase.from('program_projects').update(payload).eq('id', project.id) : await supabase.from('program_projects').insert({ ...payload, progress: 0 });
    setSaving(false);
    if (saveError) setError(saveError.message); else onSaved();
  };
  const remove = async () => {
    if (!project || !window.confirm(`Delete "${project.name}"?`)) return;
    const { error: deleteError } = await supabase.from('program_projects').delete().eq('id', project.id);
    if (deleteError) setError(deleteError.message); else onSaved();
  };

  return (
    <Modal title={project ? 'Project details' : 'New project'} onClose={onClose}>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      <input autoFocus={!project} value={form.name} onChange={set('name')} placeholder="Project name" className={input} />
      <textarea value={form.description} onChange={set('description')} placeholder="Purpose and desired outcome" className={`${input} min-h-20`} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Status<select value={form.status} onChange={set('status')} className={`${input} mt-1`}>{Object.entries(PROJECT_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Priority<select value={form.priority} onChange={set('priority')} className={`${input} mt-1`}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Owner<select value={form.owner_id} onChange={set('owner_id')} className={`${input} mt-1`}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <span className="hidden sm:block" />
        <label className="text-xs font-semibold text-slate-600">Start date<input type="date" value={form.start_date} onChange={set('start_date')} className={`${input} mt-1`} /></label>
        <label className="text-xs font-semibold text-slate-600">Due date<input type="date" value={form.end_date} onChange={set('end_date')} className={`${input} mt-1`} /></label>
      </div>
      {project && (
        <div>
          <div className="mb-1.5 flex items-center justify-between"><p className="text-xs font-bold text-slate-700">Tasks ({tasks.length})</p><button type="button" onClick={() => onAddTask(project.id)} className="text-xs font-bold text-brand-600">+ Add task</button></div>
          <div className="max-h-40 space-y-1 overflow-y-auto">{tasks.map((task) => <button type="button" key={task.id} onClick={() => onOpenTask(task)} className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-left text-xs hover:bg-slate-100"><span className={task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}>{task.title}</span><span className="text-slate-400">{TASK_STATUS[task.status]}</span></button>)}{!tasks.length && <p className="text-xs text-slate-400">No tasks in this project yet.</p>}</div>
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        {project ? <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button> : <span />}
        <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}</button>
      </div>
    </Modal>
  );
};

const TaskModal: React.FC<{ projects: Project[]; initialProject: string; onClose: () => void; onSaved: (task: Task) => void }> = ({ projects, initialProject, onClose, onSaved }) => {
  const { users, currentUser } = useWorkspace();
  const [form, setForm] = useState({ title: '', project_id: initialProject, assignee_id: currentUser.id, priority: 'medium', due_date: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const save = async () => {
    if (!form.title.trim()) { setError('Task title is required.'); return; }
    setSaving(true);
    const { data, error: insertError } = await supabase.from('program_tasks').insert({ title: form.title.trim(), project_id: form.project_id || null, assignee_id: form.assignee_id || null, priority: form.priority, due_date: form.due_date || null, status: 'not_started', progress: 0, created_by: currentUser.id }).select('*').single();
    setSaving(false);
    if (insertError || !data) setError(insertError?.message || 'Could not create the task.'); else onSaved(data as Task);
  };
  return (
    <Modal title="New task" onClose={onClose}>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      <input autoFocus value={form.title} onChange={set('title')} placeholder="Task title" className={input} />
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={form.project_id} onChange={set('project_id')} className={input} aria-label="Project"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <select value={form.assignee_id} onChange={set('assignee_id')} className={input} aria-label="Assignee"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        <select value={form.priority} onChange={set('priority')} className={input} aria-label="Priority"><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select>
        <input type="date" value={form.due_date} onChange={set('due_date')} className={input} aria-label="Due date" />
      </div>
      <button type="button" onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">Create task</button>
    </Modal>
  );
};
