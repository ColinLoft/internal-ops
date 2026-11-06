import { CustomSelect } from "../common/CustomSelect";
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ExternalLink, GanttChart, KanbanSquare, ListChecks, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ActivityPanel, CommentsPanel, logActivity } from '../work/EntityPanels';
import { PanelLayout } from '../common/PanelLayout';
import { TableSkeleton } from '../common/Feedback';
import { useConfirm } from '../common/useConfirm';
import { navigate } from '../../lib/navigate';

export type TaskRow = { id: string; project_id: string | null; eng_project_id?: string | null; assignee_id: string | null; title: string; status: string; priority: string; due_date: string | null; progress: number; parent_task_id?: string | null };
type Mode = 'list' | 'board' | 'calendar' | 'timeline';
type SortKey = 'title' | 'status' | 'priority' | 'due_date' | 'assignee';

export const TASK_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };
const statusDot: Record<string, string> = { not_started: 'bg-slate-300', in_progress: 'bg-brand-500', blocked: 'bg-rose-500', completed: 'bg-emerald-500' };
const statusPill: Record<string, string> = { not_started: 'bg-slate-100 text-slate-600', in_progress: 'bg-brand-50 text-brand-700', blocked: 'bg-rose-50 text-rose-700', completed: 'bg-emerald-50 text-emerald-700' };
const priorityTone: Record<string, string> = { low: 'text-slate-500', medium: 'text-amber-600', high: 'text-rose-600' };
const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
const sel = 'rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-400';
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayIso = () => iso(new Date());

const modes: [Mode, string, React.ElementType][] = [['list', 'List', ListChecks], ['board', 'Board', KanbanSquare], ['calendar', 'Calendar', CalendarDays], ['timeline', 'Timeline', GanttChart]];

interface Props {
  tasks: TaskRow[];
  allTasks: TaskRow[];
  projects: { id: string; name: string }[];
  loading: boolean;
  onChanged: () => Promise<void> | void;
  onError: (message: string) => void;
}

export const TasksViews: React.FC<Props> = ({ tasks, allTasks, projects, loading, onChanged, onError }) => {
  const { users } = useWorkspace();
  const { confirm, dialog } = useConfirm();
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('flown-tasks-mode') as Mode) || 'list');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(() => { try { return JSON.parse(localStorage.getItem('flown-tasks-sort') || '') ; } catch { return { key: 'due_date', dir: 1 }; } });
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  useEffect(() => { localStorage.setItem('flown-tasks-mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('flown-tasks-sort', JSON.stringify(sort)); }, [sort]);

  const userName = (id: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const projectName = (id: string | null) => projects.find((project) => project.id === id)?.name || 'No project';
  const isOverdue = (task: TaskRow) => Boolean(task.due_date) && task.status !== 'completed' && (task.due_date as string) < todayIso();

  const sorted = useMemo(() => {
    const value = (task: TaskRow): string | number => {
      if (sort.key === 'priority') return priorityRank[task.priority] ?? 9;
      if (sort.key === 'assignee') return userName(task.assignee_id).toLowerCase();
      if (sort.key === 'due_date') return task.due_date || '9999';
      return String(task[sort.key]).toLowerCase();
    };
    return tasks.slice().sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * sort.dir);
  }, [tasks, sort, users]);

  const open = tasks.find((task) => task.id === openId) || null;

  const patch = async (ids: string[], changes: Partial<TaskRow>, activity?: string) => {
    const body: Record<string, unknown> = { ...changes };
    if (changes.status === 'completed') body.progress = 100;
    const { error } = await supabase.from('program_tasks').update(body).in('id', ids);
    if (error) { onError(error.message); return; }
    if (activity) ids.forEach((id) => void logActivity('task', id, activity));
    await onChanged();
  };

  const bulkDelete = async () => {
    if (!(await confirm({ title: `Delete ${picked.size} task${picked.size === 1 ? '' : 's'}?`, message: 'This cannot be undone.', confirmLabel: 'Delete' }))) return;
    const { error } = await supabase.from('program_tasks').delete().in('id', [...picked]);
    if (error) onError(error.message);
    setPicked(new Set());
    await onChanged();
  };

  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const sortBy = (key: SortKey) => setSort((current) => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : 1 }));
  const head = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
      <button type="button" onClick={() => sortBy(key)} className="inline-flex items-center gap-1 hover:text-slate-600">{label}{sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button>
    </th>
  );

  const pill = (task: TaskRow) => <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPill[task.status]}`}><span className={`h-1.5 w-1.5 rounded-full ${statusDot[task.status]}`} />{TASK_STATUS[task.status]}</span>;

  const list = (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-xs">
        <thead><tr className="border-b border-slate-100 bg-slate-50/70">
          <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Select all" checked={picked.size > 0 && picked.size === sorted.length} onChange={(event) => setPicked(event.target.checked ? new Set(sorted.map((task) => task.id)) : new Set())} /></th>
          {head('title', 'Task')}{head('status', 'Status')}{head('priority', 'Priority')}{head('assignee', 'Assignee')}{head('due_date', 'Due')}
        </tr></thead>
        <tbody>
          {sorted.map((task) => {
            const subs = allTasks.filter((item) => item.parent_task_id === task.id);
            return (
              <tr key={task.id} className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/40 ${openId === task.id ? 'bg-brand-50/60' : ''}`} onClick={() => setOpenId(task.id)}>
                <td className="px-3 py-1.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${task.title}`} checked={picked.has(task.id)} onChange={() => toggle(task.id)} /></td>
                <td className="max-w-[320px] px-3 py-1.5"><span className={`block truncate font-semibold ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</span><span className="block truncate text-[11px] text-slate-400">{projectName(task.eng_project_id ?? null)}{subs.length ? ` · ${subs.filter((item) => item.status === 'completed').length}/${subs.length} subtasks` : ''}</span></td>
                <td className="px-3 py-1.5">{pill(task)}</td>
                <td className={`px-3 py-1.5 font-semibold capitalize ${priorityTone[task.priority]}`}>{task.priority}</td>
                <td className="px-3 py-1.5 text-slate-600">{userName(task.assignee_id)}</td>
                <td className={`px-3 py-1.5 ${isOverdue(task) ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{task.due_date || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const board = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Object.entries(TASK_STATUS).map(([status, label]) => {
        const column = sorted.filter((task) => task.status === status);
        return (
          <div key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const id = event.dataTransfer.getData('text/plain'); const task = tasks.find((item) => item.id === id); if (task && task.status !== status) void patch([id], { status }, `Moved to ${label}`); }} className="min-h-40 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
            <p className="mb-2 flex items-center justify-between px-1 text-xs font-bold text-slate-600"><span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${statusDot[status]}`} />{label}</span><span className="text-slate-400">{column.length}</span></p>
            <div className="space-y-1.5">
              {column.map((task) => (
                <button key={task.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)} onClick={() => setOpenId(task.id)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:border-brand-300">
                  <span className="block text-xs font-semibold text-slate-800">{task.title}</span>
                  <span className="mt-1 flex items-center justify-between text-[11px] text-slate-400"><span className={`font-semibold capitalize ${priorityTone[task.priority]}`}>{task.priority}</span><span className={isOverdue(task) ? 'font-semibold text-rose-600' : ''}>{task.due_date || userName(task.assignee_id)}</span></span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const calendar = (() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const cells = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + index));
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md px-2 py-1 text-xs font-semibold hover:bg-slate-100">‹ Prev</button>
          <span className="text-xs font-bold text-slate-700">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-md px-2 py-1 text-xs font-semibold hover:bg-slate-100">Next ›</button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase text-slate-400">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="py-1.5">{day}</div>)}</div>
        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const key = iso(date);
            const dayTasks = tasks.filter((task) => task.due_date === key);
            return (
              <div key={key} className={`min-h-20 border-l border-t border-slate-100 p-1 ${date.getMonth() !== month.getMonth() ? 'bg-slate-50/60 text-slate-300' : ''}`}>
                <span className={`text-[11px] font-semibold ${key === todayIso() ? 'rounded-full bg-brand-600 px-1.5 text-white' : 'text-slate-400'}`}>{date.getDate()}</span>
                {dayTasks.slice(0, 3).map((task) => <button key={task.id} type="button" onClick={() => setOpenId(task.id)} className={`mt-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[11px] font-semibold ${statusPill[task.status]}`}>{task.title}</button>)}
                {dayTasks.length > 3 && <span className="block text-[11px] text-slate-400">+{dayTasks.length - 3} more</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  const timeline = (() => {
    const dated = sorted.filter((task) => task.due_date);
    if (!dated.length) return <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">Give tasks due dates to see them on the timeline.</div>;
    const start = new Date(); start.setDate(start.getDate() - 7);
    const days = 56;
    const dayWidth = 100 / days;
    const position = (date: string) => Math.min(days - 1, Math.max(0, Math.round((new Date(`${date}T12:00:00`).getTime() - start.getTime()) / 86400000)));
    const ordered = dated.slice().sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string));
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="min-w-[760px]">
          <div className="relative h-7 border-b border-slate-100">
            {Array.from({ length: 8 }, (_, week) => { const date = new Date(start); date.setDate(date.getDate() + week * 7); return <span key={week} className="absolute top-1.5 text-[11px] text-slate-400" style={{ left: `calc(220px + (100% - 220px) * ${(week * 7) / days})` }}>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>; })}
          </div>
          {ordered.map((task) => {
            const end = position(task.due_date as string);
            const begin = Math.max(0, end - Math.max(1, Math.round((task.progress < 100 ? 3 : 1))));
            return (
              <button key={task.id} type="button" onClick={() => setOpenId(task.id)} className="flex w-full items-center border-b border-slate-50 text-left hover:bg-brand-50/40">
                <span className="w-[220px] shrink-0 truncate px-3 py-1.5 text-xs font-semibold text-slate-700">{task.title}</span>
                <span className="relative h-6 flex-1">
                  <span className={`absolute top-1.5 h-3 rounded-full ${statusDot[task.status]} ${isOverdue(task) ? 'ring-2 ring-rose-200' : ''}`} style={{ left: `${begin * dayWidth}%`, width: `${Math.max(dayWidth * 2, (end - begin + 1) * dayWidth)}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  })();

  const body = loading ? <TableSkeleton rows={6} /> : tasks.length === 0 ? (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">No tasks match. Clear your filters or create a task to get started.</div>
  ) : mode === 'list' ? list : mode === 'board' ? board : mode === 'calendar' ? calendar : timeline;

  const subtasks = open ? allTasks.filter((task) => task.parent_task_id === open.id) : [];
  const panel = open ? (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
        <div className="min-w-0"><h3 className="text-sm font-bold text-slate-900">{open.title}</h3><p className="text-xs text-slate-400">{projectName(open.project_id)}</p></div>
        <button type="button" onClick={() => setOpenId(null)} aria-label="Close panel" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4 text-xs text-slate-500">
        <label>Status<CustomSelect value={open.status} onChange={(event) => void patch([open.id], { status: event.target.value }, `Status set to ${TASK_STATUS[event.target.value]}`)} className={`${sel} mt-1 w-full`}>{Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect></label>
        <label>Priority<CustomSelect value={open.priority} onChange={(event) => void patch([open.id], { priority: event.target.value }, `Priority set to ${event.target.value}`)} className={`${sel} mt-1 w-full`}>{['low', 'medium', 'high'].map((value) => <option key={value} value={value}>{value}</option>)}</CustomSelect></label>
        <label>Assignee<CustomSelect value={open.assignee_id || ''} onChange={(event) => void patch([open.id], { assignee_id: event.target.value || null }, 'Assignee changed')} className={`${sel} mt-1 w-full`}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect></label>
        <label>Due<input type="date" value={open.due_date || ''} onChange={(event) => void patch([open.id], { due_date: event.target.value || null }, 'Due date changed')} className={`${sel} mt-1 w-full`} /></label>
      </div>
      {subtasks.length > 0 && (
        <div className="px-4 pb-3"><p className="mb-1 text-xs font-bold text-slate-600">Subtasks</p><ul className="space-y-1">{subtasks.map((task) => <li key={task.id}><button type="button" onClick={() => navigate(`/programs/task/${task.id}`)} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-slate-600 hover:bg-slate-50"><CheckCircle2 className={`h-3.5 w-3.5 ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300'}`} />{task.title}</button></li>)}</ul></div>
      )}
      <div className="px-4 pb-3"><button type="button" onClick={() => navigate(`/programs/task/${open.id}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink className="h-3.5 w-3.5" />Open full task (dependencies, time, files)</button></div>
      <div className="space-y-3 px-4 pb-4"><ActivityPanel entityType="task" entityId={open.id} /><CommentsPanel entityType="task" entityId={open.id} /></div>
    </aside>
  ) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="tablist" aria-label="Task view">
          {modes.map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${mode === id ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
        </div>
        {picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-2 py-1 text-xs">
            <span className="font-semibold text-brand-700">{picked.size} selected</span>
            <CustomSelect aria-label="Set status for selected" value="" onChange={(event) => { if (event.target.value) { void patch([...picked], { status: event.target.value }, `Bulk status: ${TASK_STATUS[event.target.value]}`); setPicked(new Set()); } }} className={sel}><option value="">Set status…</option>{Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect>
            <CustomSelect aria-label="Assign selected" value="" onChange={(event) => { if (event.target.value) { void patch([...picked], { assignee_id: event.target.value === 'none' ? null : event.target.value }, 'Bulk assigned'); setPicked(new Set()); } }} className={sel}><option value="">Assign…</option><option value="none">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect>
            <button type="button" onClick={() => void bulkDelete()} className="rounded-md px-2 py-1 font-semibold text-rose-600 hover:bg-rose-50">Delete</button>
            <button type="button" onClick={() => setPicked(new Set())} className="text-slate-500 hover:underline">Clear</button>
          </div>
        )}
      </div>
      <div className="flex min-h-[420px] overflow-hidden rounded-xl">
        <PanelLayout storageKey="tasks" rightLabel="task details" rightWidth={360} right={panel}><div className="min-w-0 flex-1 overflow-y-auto pr-1">{body}</div></PanelLayout>
      </div>
      {dialog}
    </div>
  );
};
