import React, { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { supabase } from '../../lib/supabase';
import { celebrateMilestone } from '../../lib/milestones';
import { useWorkspace } from '../../context/WorkspaceContext';
import { PanelLayout } from '../common/PanelLayout';
import { TableSkeleton } from '../common/Feedback';
import { navigate } from '../../lib/navigate';
import { AssignedField, assignedIds, formatTaskDate, plainTaskNotes, TaskDateField } from './taskFields';

export type TaskRow = {
  id: string; project_id: string | null; eng_project_id?: string | null;
  assignee_id: string | null; assigned_ids?: string[]; title: string; status: string;
  priority: string; due_date: string | null; progress: number; parent_task_id?: string | null;
  notes?: string | null; grant_id?: string | null;
};
export const TASK_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };
const statusDot: Record<string, string> = { not_started: 'bg-slate-300', in_progress: 'bg-brand-500', blocked: 'bg-rose-500', completed: 'bg-emerald-500' };
const field = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs';

interface Props {
  tasks: TaskRow[]; allTasks: TaskRow[]; projects: { id: string; name: string; discipline?: string }[];
  loading: boolean; onChanged: () => Promise<void> | void; onError: (message: string) => void;
  onPatched?: (ids: string[], changes: Partial<TaskRow>) => void;
}

export const TasksViews: React.FC<Props> = ({ tasks, projects, loading, onChanged, onError, onPatched }) => {
  const { users, currentUser } = useWorkspace();
  const [openId, setOpenId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Partial<TaskRow>>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const visibleTasks = tasks.map((task) => ({ ...task, ...overrides[task.id] }));
  const open = visibleTasks.find((task) => task.id === openId);
  const patch = async (task: TaskRow, changes: Partial<TaskRow>, claiming = false) => {
    if (pending.has(task.id)) return;
    const body = { ...changes, ...(changes.status === 'completed' ? { progress: 100 } : {}) };
    setPending((current) => new Set(current).add(task.id));
    setOverrides((current) => ({ ...current, [task.id]: { ...current[task.id], ...body } }));
    try {
      let query = supabase.from('program_tasks').update(body).eq('id', task.id);
      if (claiming) query = query.eq('assigned_ids', '{}');
      const { data, error } = await query.select('*').single();
      if (error || !data) throw new Error(error?.message || 'The task update was not saved.');
      if (changes.status) celebrateMilestone('task', task.id, task.status, data.status);
      onPatched?.([task.id], data as TaskRow);
      setOverrides((current) => ({ ...current, [task.id]: data as TaskRow }));
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The task update failed.');
    } finally {
      setOverrides((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setPending((current) => { const next = new Set(current); next.delete(task.id); return next; });
    }
  };
  const assignedNames = (task: TaskRow) => {
    const ids = assignedIds(task);
    return ids.length ? users.filter((user) => ids.includes(user.id)).map((user) => user.name).join(', ') || `${ids.length} people` : 'Unassigned';
  };
  const board = <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    {Object.entries(TASK_STATUS).map(([status, label]) => {
      const column = visibleTasks.filter((task) => task.status === status);
      return <section key={status} aria-label={label} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        const task = visibleTasks.find((item) => item.id === event.dataTransfer.getData('text/plain'));
        if (task && task.status !== status) void patch(task, { status });
      }} className="min-h-40 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
        <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${statusDot[status]}`} />{label}</span><span>{column.length}</span></h2>
        <div className="space-y-2">{column.map((task) => <article key={task.id} draggable={!pending.has(task.id)} onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)} className="rounded-lg border border-slate-200 bg-white p-3">
          <button type="button" onClick={() => setOpenId(task.id)} className="w-full text-left">
            <span className="block text-sm font-semibold text-slate-800">{task.title}</span>
            <span className="mt-2 block text-xs text-slate-500">{formatTaskDate(task.due_date)}</span>
            <span className="mt-1 block text-xs text-slate-500">Assigned: {assignedNames(task)}</span>
            <span className="mt-1 block text-xs capitalize text-slate-500">{task.priority} priority</span>
          </button>
          {assignedIds(task).length === 0 && <button type="button" disabled={pending.has(task.id)} onClick={() => void patch(task, { assigned_ids: [currentUser.id] }, true)} className="mt-2 text-xs font-semibold text-brand-600 disabled:opacity-50">Claim task</button>}
        </article>)}</div>
      </section>;
    })}
  </div>;
  const project = projects.find((item) => item.id === open?.eng_project_id);
  const panel = open ? <aside className="h-full overflow-y-auto border-l border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-3"><h2 className="text-sm font-semibold text-slate-900">{open.title}</h2><button type="button" onClick={() => setOpenId(null)} aria-label="Close panel"><X className="h-4 w-4" /></button></div>
    <fieldset disabled={pending.has(open.id)} className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-slate-500">Status<CustomSelect aria-label="Task status" value={open.status} onChange={(event) => void patch(open, { status: event.target.value })} className={field}>{Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect></label>
        <label className="text-xs text-slate-500">Priority<CustomSelect value={open.priority} onChange={(event) => void patch(open, { priority: event.target.value })} className={field}>{['low', 'medium', 'high'].map((value) => <option key={value} value={value}>{value}</option>)}</CustomSelect></label>
      </div>
      <AssignedField value={assignedIds(open)} onChange={(ids) => void patch(open, { assigned_ids: ids })} />
      {assignedIds(open).length === 0 && <button type="button" onClick={() => void patch(open, { assigned_ids: [currentUser.id] }, true)} className="text-xs font-semibold text-brand-600">Claim task</button>}
      <TaskDateField value={open.due_date} onChange={(date) => void patch(open, { due_date: date })} />
      <label className="block text-xs font-semibold text-slate-500">Notes<textarea key={`${open.id}:${open.notes}`} defaultValue={plainTaskNotes(open.notes)} rows={7} onBlur={(event) => { if (event.target.value !== plainTaskNotes(open.notes)) void patch(open, { notes: event.target.value || null }); }} className={`${field} resize-y`} /></label>
    </fieldset>
    {open.grant_id && <button type="button" onClick={() => navigate(`/company/grants/${open.grant_id}`)} className="mt-4 flex items-center gap-2 text-xs font-semibold text-brand-600"><ExternalLink className="h-4 w-4" />Open grant</button>}
    {project && <button type="button" onClick={() => navigate(`/engineering/${project.discipline || 'software'}/${project.id}`)} className="mt-4 flex items-center gap-2 text-xs font-semibold text-brand-600"><ExternalLink className="h-4 w-4" />Open {project.name}</button>}
  </aside> : undefined;
  return <div className="space-y-3">
    <div className="flex min-h-[420px] overflow-hidden rounded-xl"><PanelLayout storageKey="tasks" rightLabel="task details" rightWidth={360} right={wide ? panel : undefined}><div className="min-w-0 flex-1 overflow-auto pr-1">{loading ? <TableSkeleton rows={6} /> : visibleTasks.length ? board : <p className="p-10 text-center text-sm text-slate-500">No tasks match these filters.</p>}</div></PanelLayout></div>
    {!wide && panel && <div role="dialog" aria-modal="true" aria-label="Task details" className="fixed inset-0 z-50 bg-white">{panel}</div>}
  </div>;
};
