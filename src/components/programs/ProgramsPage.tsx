import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { TaskPage } from './TaskPage';
import { TableSkeleton } from '../common/Feedback';
import { TasksViews } from './TasksViews';
import { Dropdown } from '../common/Dropdown';

type EngProject = { id: string; name: string; discipline: string };
type Task = { id: string; project_id: string | null; eng_project_id: string | null; assignee_id: string | null; title: string; status: string; priority: string; due_date: string | null; progress: number; parent_task_id?: string | null };

const TASK_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };
const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';

const taskIdFromPath = (path: string) => { const [, , kind, id] = path.split('/'); return kind === 'task' && id ? id : null; };
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

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
      supabase.from('program_tasks').select('id,project_id,eng_project_id,assignee_id,parent_task_id,title,status,priority,due_date,progress').order('due_date', { ascending: true, nullsFirst: false }),
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

  const topTasks = useMemo(() => tasks.filter((task) => !task.parent_task_id), [tasks]);
  const needle = query.trim().toLowerCase();
  const shownTasks = topTasks.filter((task) => (statusFilter === 'all' || task.status === statusFilter) && (projectFilter === 'all' || (projectFilter === 'none' ? !task.eng_project_id : task.eng_project_id === projectFilter)) && (!mineOnly || task.assignee_id === currentUser.id) && task.title.toLowerCase().includes(needle));
  const overdue = (task: Task) => Boolean(task.due_date) && task.status !== 'completed' && (task.due_date as string) < today();

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-8 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
            <p className="mt-1 text-xs text-slate-500">{topTasks.length} tasks · {topTasks.filter((t) => t.status !== 'completed').length} open · {topTasks.filter(overdue).length} overdue. Includes tasks from Software, Mechanical, Electrical and Systems projects.</p>
          </div>
          <button type="button" onClick={() => setTaskModal({})} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />New task</button>
        </div>
      </header>

      <div className="min-w-0 space-y-4 p-4 sm:p-8">
        {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" className={`${input} pl-9`} /></div>
          <Dropdown value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" className="min-w-36" options={[{ id: 'all', label: 'All statuses' }, ...Object.entries(TASK_STATUS).map(([id, label]) => ({ id, label }))]} />
          <Dropdown value={projectFilter} onChange={setProjectFilter} ariaLabel="Filter by project" className="min-w-40" options={[{ id: 'all', label: 'All projects' }, { id: 'none', label: 'No project' }, ...projects.map((project) => ({ id: project.id, label: `${project.name} (${project.discipline})` }))]} />
          <label className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-slate-600 md:min-h-0"><input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />Assigned to me</label>
        </div>
        {loading ? <TableSkeleton rows={6} /> : <TasksViews tasks={shownTasks} allTasks={tasks} projects={projects} loading={false} onChanged={load} onError={setError} />}
      </div>

      {taskModal && <TaskModal projects={projects} initialTitle={taskModal.title} onClose={() => setTaskModal(null)} onSaved={(created) => { setTaskModal(null); setTasks((current) => [created, ...current]); }} />}
    </main>
  );
};

const TaskModal: React.FC<{ projects: EngProject[]; initialTitle?: string; onClose: () => void; onSaved: (task: Task) => void }> = ({ projects, initialTitle = '', onClose, onSaved }) => {
  const { users, currentUser } = useWorkspace();
  const [form, setForm] = useState({ title: initialTitle, eng_project_id: '', assignee_id: currentUser.id, priority: 'medium', due_date: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const save = async () => {
    if (!form.title.trim()) { setError('Task title is required.'); return; }
    setSaving(true);
    const { data, error: insertError } = await supabase.from('program_tasks').insert({ title: form.title.trim(), eng_project_id: form.eng_project_id || null, assignee_id: form.assignee_id || null, priority: form.priority, due_date: form.due_date || null, status: 'not_started', progress: 0, created_by: currentUser.id }).select('*').single();
    setSaving(false);
    if (insertError || !data) setError(insertError?.message || 'Could not create the task.'); else onSaved(data as Task);
  };
  return (
    <Modal title="New task" onClose={onClose}>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      <input autoFocus value={form.title} onChange={set('title')} placeholder="Task title" className={input} />
      <div className="grid gap-3 sm:grid-cols-2">
        <CustomSelect value={form.eng_project_id} onChange={set('eng_project_id')} className={input} aria-label="Project"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</CustomSelect>
        <CustomSelect value={form.assignee_id} onChange={set('assignee_id')} className={input} aria-label="Assignee"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect>
        <CustomSelect value={form.priority} onChange={set('priority')} className={input} aria-label="Priority"><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></CustomSelect>
        <input type="date" value={form.due_date} onChange={set('due_date')} className={input} aria-label="Due date" />
      </div>
      <button type="button" onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">Create task</button>
    </Modal>
  );
};
