import { userFacingError } from '../../lib/userFacingError';
import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, UserRound, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { TaskPage } from './TaskPage';
import { TableSkeleton } from '../common/Feedback';
import { TasksViews } from './TasksViews';
import { AssignedField, assignedIds, TaskDateField } from './taskFields';
import { Dropdown } from '../common/Dropdown';

type EngProject = { id: string; name: string; discipline: string };
type Task = { id: string; project_id: string | null; eng_project_id: string | null; assignee_id: string | null; assigned_ids: string[]; notes: string | null; grant_id: string | null; title: string; status: string; priority: string; due_date: string | null; progress: number; parent_task_id?: string | null };

const TASK_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };
const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';

const taskIdFromPath = (path: string) => { const [, , kind, id] = path.split('/'); return kind === 'task' && id ? id : null; };

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" onClick={onClose}>
    <div role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="-m-2 p-2"><X className="h-4 w-4 text-slate-400" /></button></div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  </div>
);

export const ProgramsPage: React.FC = () => {
  const [taskId, setTaskId] = useState(() => taskIdFromPath(window.location.pathname));
  useEffect(() => {
    const sync = () => setTaskId(taskIdFromPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  if (taskId) return <TaskPage key={taskId} taskId={taskId} />;
  return <TasksList />;
};

const TasksList: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [projects, setProjects] = useState<EngProject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [taskModal, setTaskModal] = useState<{ title?: string } | null>(null);

  const load = useCallback(async () => {
    const [projectResult, taskResult] = await Promise.all([
      supabase.from('eng_projects').select('id,name,discipline').order('name'),
      supabase.from('program_tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
    ]);
    if (taskResult.error) setError(`Tasks could not be loaded: ${taskResult.error.message}`);
    else { setError(''); setTasks((taskResult.data || []) as Task[]); }
    setProjects((projectResult.data || []) as EngProject[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const consume = () => {
      const requested = new URLSearchParams(window.location.search).get('newTask');
      if (requested !== null) { setTaskModal({ title: requested }); window.history.replaceState({}, '', window.location.pathname); }
    };
    consume();
    window.addEventListener('popstate', consume);
    return () => window.removeEventListener('popstate', consume);
  }, [load]);

  useEffect(() => {
    const channel = supabase.channel('shared-program-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'program_tasks' }, () => void load())
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('Task subscription failed:', error);
      });
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10000);
    return () => { window.clearInterval(poll); void supabase.removeChannel(channel); };
  }, [load]);

  const topTasks = useMemo(() => tasks.filter((task) => !task.parent_task_id), [tasks]);
  const needle = query.trim().toLowerCase();
  const shownTasks = topTasks.filter((task) => (statusFilter === 'all' || task.status === statusFilter) && (projectFilter === 'all' || (projectFilter === 'none' ? !task.eng_project_id : task.eng_project_id === projectFilter)) && (!mineOnly || assignedIds(task).includes(currentUser.id)) && task.title.toLowerCase().includes(needle));

  return (
    <main data-onboarding-target="tasks-workspace" className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="workspace-page-header border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
          </div>
          <button type="button" onClick={() => setTaskModal({})} className="workspace-control inline-flex items-center gap-2 bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" />New task</button>
        </div>
      </header>

      <div className="workspace-page-body min-w-0 space-y-4">
        {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{userFacingError(error)}</div>}
        <div className="workspace-toolbar flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" className={`${input} pl-9`} /></div>
          <Dropdown value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" className="min-w-36" options={[{ id: 'all', label: 'All statuses' }, ...Object.entries(TASK_STATUS).map(([id, label]) => ({ id, label }))]} />
          <Dropdown value={projectFilter} onChange={setProjectFilter} ariaLabel="Filter by project" className="min-w-40" options={[{ id: 'all', label: 'All projects' }, { id: 'none', label: 'No project' }, ...projects.map((project) => ({ id: project.id, label: `${project.name} (${project.discipline})` }))]} />
          <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly((value) => !value)} className={`workspace-control inline-flex items-center gap-2 border px-3 text-sm font-medium ${mineOnly ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><UserRound className="h-4 w-4" />Assigned to me</button>
        </div>
        {loading ? <TableSkeleton rows={6} /> : <TasksViews tasks={shownTasks} allTasks={tasks} projects={projects} loading={false} onChanged={load} onError={setError} onPatched={(ids, changes) => setTasks((current) => current.map((task) => ids.includes(task.id) ? { ...task, ...changes } : task))} />}
      </div>

      {taskModal && <TaskModal projects={projects} initialTitle={taskModal.title} onClose={() => setTaskModal(null)} onSaved={(created) => { setTaskModal(null); setTasks((current) => [created, ...current.filter((task) => task.id !== created.id)]); }} />}
    </main>
  );
};

const TaskModal: React.FC<{ projects: EngProject[]; initialTitle?: string; onClose: () => void; onSaved: (task: Task) => void }> = ({ projects, initialTitle = '', onClose, onSaved }) => {
  const { currentUser } = useWorkspace();
  const [form, setForm] = useState({ title: initialTitle, eng_project_id: '', assigned_ids: [] as string[], priority: 'medium', due_date: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const save = async () => {
    if (!form.title.trim()) { setError('Task title is required.'); return; }
    setSaving(true);
    const { data, error: insertError } = await supabase.from('program_tasks').insert({ title: form.title.trim(), eng_project_id: form.eng_project_id || null, assigned_ids: form.assigned_ids, priority: form.priority, due_date: form.due_date || null, status: 'not_started', progress: 0, created_by: currentUser.id }).select('*').single();
    setSaving(false);
    if (insertError || !data) setError(insertError?.message || 'Could not create the task.'); else onSaved(data as Task);
  };
  return (
    <Modal title="New task" onClose={onClose}>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{userFacingError(error)}</p>}
      <input autoFocus value={form.title} onChange={set('title')} placeholder="Task title" className={input} />
      <div className="grid gap-3 sm:grid-cols-2">
        <CustomSelect value={form.eng_project_id} onChange={set('eng_project_id')} className={input} aria-label="Project"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</CustomSelect>
        <AssignedField value={form.assigned_ids} onChange={(ids) => setForm((current) => ({ ...current, assigned_ids: ids }))} />
        <CustomSelect value={form.priority} onChange={set('priority')} className={input} aria-label="Priority"><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></CustomSelect>
        <TaskDateField value={form.due_date || null} onChange={(date) => setForm((current) => ({ ...current, due_date: date || '' }))} />
      </div>
      <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create task'}</button>
    </Modal>
  );
};
