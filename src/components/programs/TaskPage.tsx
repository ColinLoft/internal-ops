import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { AttachmentsPanel, ChecklistPanel, CommentsPanel, LinksPanel, TimePanel, card, field, formatMinutes, logActivity } from '../work/EntityPanels';
import { AssignedField, assignedIds, TaskDateField } from './taskFields';
import { RichNotes } from '../work/RichNotes';
import { navigate } from '../../lib/navigate';
import { useConfirm } from '../common/useConfirm';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

type Task = {
  id: string; project_id: string | null; eng_project_id: string | null; assignee_id: string | null; assigned_ids: string[]; parent_task_id: string | null; title: string; description: string | null; notes: string | null;
  status: string; priority: string; due_date: string | null; start_date: string | null; progress: number; estimate_hours: number | null; grant_id: string | null;
};
type Lite = { id: string; title: string; status: string; assignee_id: string | null; due_date: string | null };

const STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };

export const TaskPage: React.FC<{ taskId: string }> = ({ taskId }) => {
  const { currentUser } = useWorkspace();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [task, setTask] = useState<Task | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string; discipline: string }[]>([]);
  const [subtasks, setSubtasks] = useState<Lite[]>([]);
  const [siblings, setSiblings] = useState<Lite[]>([]);
  const [deps, setDeps] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(0);
  const [subTitle, setSubTitle] = useState('');
  const [dep, setDep] = useState('');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const estimateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task) return;
    for (const [element, value] of [
      [titleInput.current, task.title],
      [descriptionInput.current, task.description || ''],
      [estimateInput.current, String(task.estimate_hours ?? '')],
    ] as const) {
      if (element && document.activeElement !== element) element.value = value;
    }
  }, [task]);

  const load = useCallback(async () => {
    const [t, p, s, d, time] = await Promise.all([
      supabase.from('program_tasks').select('*').eq('id', taskId).maybeSingle(),
      supabase.from('eng_projects').select('id,name,discipline').order('name'),
      supabase.from('program_tasks').select('id,title,status,assignee_id,due_date').eq('parent_task_id', taskId).order('created_at'),
      supabase.from('program_task_dependencies').select('depends_on_task_id').eq('task_id', taskId),
      supabase.from('entity_time_entries').select('minutes').eq('entity_type', 'task').eq('entity_id', taskId),
    ]);
    const failure = t.error || p.error || s.error || d.error || time.error;
    if (failure) { setError(`Task could not be refreshed: ${failure.message}`); return; }
    if (!t.data) { setMissing(true); return; }
    setMissing(false);
    setError('');
    const row = t.data as Task;
    setTask(row);
    setProjects((p.data || []) as { id: string; name: string; discipline: string }[]);
    setSubtasks((s.data || []) as Lite[]);
    setDeps(((d.data || []) as { depends_on_task_id: string }[]).map((r) => r.depends_on_task_id));
    setMinutes(((time.data || []) as { minutes: number }[]).reduce((sum, r) => sum + r.minutes, 0));
    const sib = await supabase.from('program_tasks').select('id,title,status,assignee_id,due_date').is('parent_task_id', null).neq('id', taskId).order('created_at', { ascending: false }).limit(200);
    if (sib.error) { setError(`Related tasks could not be refreshed: ${sib.error.message}`); return; }
    setSiblings((sib.data || []) as Lite[]);
  }, [taskId]);
  useLiveRefresh(load, ['program_tasks', 'program_task_dependencies', 'entity_time_entries']);

  const patch = async (values: Partial<Task> & { completed_at?: string | null }, activity?: string) => {
    setTask((current) => (current ? { ...current, ...values } : current));
    const { data, error: updateError } = await supabase.from('program_tasks').update({ ...values, updated_at: new Date().toISOString() }).eq('id', taskId).select('*').single();
    if (updateError) { setError(updateError.message); void load(); return; }
    setError('');
    if (data) setTask(data as Task);
    if (activity) void logActivity('task', taskId, activity);
  };

  const addSubtask = async () => {
    if (!subTitle.trim() || !task) return;
    const title = subTitle.trim();
    setSubTitle('');
    const { data, error: insertError } = await supabase.from('program_tasks').insert({ title, parent_task_id: taskId, project_id: task.project_id, eng_project_id: task.eng_project_id, assigned_ids: assignedIds(task), status: 'not_started', priority: task.priority, progress: 0 }).select('id,title,status,assignee_id,due_date').single();
    if (insertError) { setError(insertError.message); return; }
    setSubtasks((current) => [...current, data as Lite]);
    void logActivity('task', taskId, 'added subtask', title);
  };
  const toggleSub = async (sub: Lite) => {
    const status = sub.status === 'completed' ? 'not_started' : 'completed';
    setSubtasks((current) => current.map((row) => (row.id === sub.id ? { ...row, status } : row)));
    await supabase.from('program_tasks').update({ status, progress: status === 'completed' ? 100 : 0 }).eq('id', sub.id);
  };
  const addDep = async () => {
    if (!dep) return;
    const { error: insertError } = await supabase.from('program_task_dependencies').insert({ task_id: taskId, depends_on_task_id: dep });
    if (insertError) { setError(insertError.message); return; }
    setDep(''); await load();
  };
  const remove = async () => {
    if (!await confirm({ title: 'Delete this task?', message: 'This cannot be undone.', confirmLabel: 'Delete' })) return;
    const { error: deleteError } = await supabase.from('program_tasks').delete().eq('id', taskId);
    if (deleteError) setError(deleteError.message); else navigate(backPath);
  };

  if (missing) return <main className="flex-1 p-8 text-sm text-slate-500">This task could not be found. <button type="button" onClick={() => navigate('/programs/tasks')} className="font-bold text-brand-600">Back to tasks</button></main>;
  if (!task) return <main className="flex-1 p-8 text-xs text-slate-400">{error || 'Loading task…'}</main>;

  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.due_date && task.status !== 'completed' && task.due_date < today;
  const subDone = subtasks.filter((row) => row.status === 'completed').length;
  const estimate = Number(task.estimate_hours || 0);
  const project = projects.find((row) => row.id === task.eng_project_id);
  const backPath = project ? `/engineering/${project.discipline}/${project.id}` : '/programs/tasks';

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <button type="button" onClick={() => navigate(backPath)} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-brand-600"><ArrowLeft className="h-3.5 w-3.5" />{project ? project.name : 'Tasks'}</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <input ref={titleInput} defaultValue={task.title} onBlur={(event) => event.target.value.trim() && event.target.value.trim() !== task.title && void patch({ title: event.target.value.trim() }, 'renamed the task')} aria-label="Task title" className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-xl font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-brand-400" />
          <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>
        </div>
        {task.grant_id && <button type="button" onClick={() => navigate(`/company/grants/${task.grant_id}`)} className="mt-1 text-xs font-bold text-brand-600">From a grant award · open grant</button>}
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs font-semibold text-slate-500">Status<CustomSelect value={task.status} onChange={(event) => void patch({ status: event.target.value, progress: event.target.value === 'completed' ? 100 : task.progress, completed_at: event.target.value === 'completed' ? new Date().toISOString() : null }, `set status to ${STATUS[event.target.value]}`)} className={field}>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect></label>
          <label className="text-xs font-semibold text-slate-500">Priority<CustomSelect value={task.priority} onChange={(event) => void patch({ priority: event.target.value }, `set priority to ${event.target.value}`)} className={field}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></CustomSelect></label>
          <div><AssignedField value={assignedIds(task)} onChange={(ids) => void patch({ assigned_ids: ids }, 'changed assigned people')} />{assignedIds(task).length === 0 && <button type="button" onClick={() => void patch({ assigned_ids: [currentUser.id] }, 'claimed task')} className="mt-2 text-xs font-semibold text-brand-600">Claim task</button>}</div>
          <label className="text-xs font-semibold text-slate-500">Project<CustomSelect value={task.eng_project_id || ''} onChange={(event) => void patch({ eng_project_id: event.target.value || null }, 'moved the task')} className={field}><option value="">No project</option>{projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</CustomSelect></label>
          <TaskDateField label={overdue ? 'Due date (overdue)' : 'Due date'} value={task.due_date} onChange={(date) => void patch({ due_date: date })} />
          <label className="text-xs font-semibold text-slate-500">Estimate (hours)<input ref={estimateInput} type="number" min="0" step="0.5" defaultValue={task.estimate_hours ?? ''} onBlur={(event) => void patch({ estimate_hours: event.target.value === '' ? null : Number(event.target.value) })} className={field} /></label>
        </div>
        {estimate > 0 && <p className="mt-2 text-xs text-slate-500">Logged {formatMinutes(minutes)} of {estimate}h estimated ({Math.round((minutes / 60 / estimate) * 100)}%)</p>}
      </header>

      <div className="grid gap-4 p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-4">
          {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
          <section className={card}>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Description</h3>
            <textarea ref={descriptionInput} defaultValue={task.description || ''} onBlur={(event) => void patch({ description: event.target.value.trim() || null })} rows={3} placeholder="What needs to be done?" className={field} />
          </section>
          <section><h3 className="mb-2 text-sm font-bold text-slate-900">Notes</h3><RichNotes value={task.notes || ''} onSave={(html) => patch({ notes: html }, 'updated notes')} placeholder="Working notes, findings, what you did…" /></section>
          <section className={card}>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Subtasks {subtasks.length > 0 && <span className="font-normal text-slate-500">({subDone}/{subtasks.length})</span>}</h3>
            <ul className="space-y-1">
              {subtasks.map((sub) => <li key={sub.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sub.status === 'completed'} onChange={() => void toggleSub(sub)} className="h-4 w-4" /><button type="button" onClick={() => navigate(`/programs/task/${sub.id}`)} className={`truncate text-left hover:text-brand-600 ${sub.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{sub.title}</button></li>)}
            </ul>
            <div className="mt-2 flex gap-2"><input value={subTitle} onChange={(event) => setSubTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addSubtask(); }} placeholder="Add a subtask" className={field} /><button type="button" onClick={() => void addSubtask()} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" />Add</button></div>
          </section>
          <ChecklistPanel entityType="task" entityId={taskId} />
          <section className={card}>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Blocked by</h3>
            <ul className="space-y-1">{deps.map((id) => <li key={id} className="flex items-center justify-between text-xs"><button type="button" onClick={() => navigate(`/programs/task/${id}`)} className="truncate text-left font-semibold text-slate-700 hover:text-brand-600">{siblings.find((row) => row.id === id)?.title || 'Task'}</button><button type="button" aria-label="Remove dependency" onClick={() => void supabase.from('program_task_dependencies').delete().eq('task_id', taskId).eq('depends_on_task_id', id).then(() => load())} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></li>)}{!deps.length && <li className="text-xs text-slate-400">Not blocked by anything.</li>}</ul>
            <div className="mt-2 flex gap-2"><CustomSelect value={dep} onChange={(event) => setDep(event.target.value)} className={field} aria-label="Add dependency"><option value="">Choose a task…</option>{siblings.filter((row) => !deps.includes(row.id)).map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</CustomSelect><button type="button" onClick={() => void addDep()} className="rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">Add</button></div>
          </section>
          <AttachmentsPanel entityType="task" entityId={taskId} />
          <LinksPanel entityType="task" entityId={taskId} />
        </div>
        <div className="min-w-0 space-y-4">
          <TimePanel entityType="task" entityId={taskId} onChanged={() => void load()} />
          <CommentsPanel entityType="task" entityId={taskId} />
        </div>
      </div>
      {confirmDialog}
    </main>
  );
};
