import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

export type TaskRow = {
  id: string; project_id: string | null; assignee_id: string | null; title: string; status: string; priority: string;
  due_date: string | null; progress: number;
};
type Full = TaskRow & { description: string | null; start_date: string | null; parent_task_id: string | null };
type Comment = { id: string; author_id: string; body: string; created_at: string };

const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400';

export const TaskDetail: React.FC<{ task: TaskRow; allTasks: TaskRow[]; onClose: () => void; onChanged: () => void }> = ({ task, allTasks, onClose, onChanged }) => {
  const { users, currentUser } = useWorkspace();
  const [full, setFull] = useState<Full | null>(null);
  const [subtasks, setSubtasks] = useState<Full[]>([]);
  const [deps, setDeps] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [subTitle, setSubTitle] = useState('');
  const [comment, setComment] = useState('');
  const [dep, setDep] = useState('');
  const [error, setError] = useState('');
  const userName = (id: string) => users.find((u) => u.id === id)?.name || 'Unknown';

  const load = useCallback(async () => {
    const [t, s, d, c] = await Promise.all([
      supabase.from('program_tasks').select('*').eq('id', task.id).single(),
      supabase.from('program_tasks').select('*').eq('parent_task_id', task.id).order('created_at'),
      supabase.from('program_task_dependencies').select('depends_on_task_id').eq('task_id', task.id),
      supabase.from('program_task_comments').select('id,author_id,body,created_at').eq('task_id', task.id).order('created_at'),
    ]);
    const failure = t.error || s.error || d.error || c.error;
    if (failure) setError(failure.message);
    setFull((t.data as Full) || null);
    setSubtasks((s.data as Full[]) || []);
    setDeps(((d.data as { depends_on_task_id: string }[]) || []).map((r) => r.depends_on_task_id));
    setComments((c.data as Comment[]) || []);
  }, [task.id]);
  useEffect(() => { void load(); }, [load]);

  const run = async (op: PromiseLike<{ error: { message: string } | null }>) => {
    const { error: e } = await op;
    if (e) { setError(e.message); return; }
    setError('');
    await load();
    onChanged();
  };
  const patch = (values: Record<string, unknown>) => run(supabase.from('program_tasks').update(values).eq('id', task.id));

  if (!full) return null;
  const blockers = deps.map((id) => allTasks.find((t) => t.id === id)).filter((t): t is TaskRow => !!t);
  const blocked = blockers.some((t) => t.status !== 'completed');
  const candidates = allTasks.filter((t) => t.id !== task.id && !deps.includes(t.id) && t.project_id === full.project_id);
  const done = subtasks.filter((s) => s.status === 'completed').length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose}>
      <aside className="h-full w-full max-w-lg space-y-4 overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <input defaultValue={full.title} maxLength={200} onBlur={(e) => e.target.value.trim() && e.target.value !== full.title && patch({ title: e.target.value.trim() })} className="flex-1 border-b border-transparent text-base font-bold text-slate-900 outline-none focus:border-brand-400" />
          <button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        {blocked && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Waiting on {blockers.filter((t) => t.status !== 'completed').length} unfinished dependenc{blockers.filter((t) => t.status !== 'completed').length === 1 ? 'y' : 'ies'}.</p>}

        <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
          <label>Status<select value={full.status} onChange={(e) => patch({ status: e.target.value, ...(e.target.value === 'completed' ? { progress: 100 } : {}) })} className={field}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></label>
          <label>Priority<select value={full.priority} onChange={(e) => patch({ priority: e.target.value })} className={field}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label>Start<input type="date" value={full.start_date || ''} onChange={(e) => patch({ start_date: e.target.value || null })} className={field} /></label>
          <label>Due<input type="date" value={full.due_date || ''} onChange={(e) => patch({ due_date: e.target.value || null })} className={field} /></label>
          <label className="col-span-2">Assignee<select value={full.assignee_id || ''} onChange={(e) => patch({ assignee_id: e.target.value || null })} className={field}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        </div>

        <label className="block text-xs text-slate-500">Description
          <textarea defaultValue={full.description || ''} rows={3} onBlur={(e) => e.target.value !== (full.description || '') && patch({ description: e.target.value.trim() || null })} className={field} />
        </label>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Subtasks {subtasks.length > 0 && `(${done}/${subtasks.length})`}</h3>
          <ul className="mt-2 space-y-1">{subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={s.status === 'completed'} onChange={(e) => run(supabase.from('program_tasks').update({ status: e.target.checked ? 'completed' : 'in_progress', progress: e.target.checked ? 100 : 0 }).eq('id', s.id))} />
              <span className={`flex-1 ${s.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{s.title}</span>
              <button type="button" aria-label="Delete subtask" onClick={() => run(supabase.from('program_tasks').delete().eq('id', s.id))}><Trash2 className="h-3.5 w-3.5 text-slate-300 hover:text-rose-600" /></button>
            </li>
          ))}</ul>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!subTitle.trim()) return; void run(supabase.from('program_tasks').insert({ title: subTitle.trim(), project_id: full.project_id, parent_task_id: full.id, assignee_id: full.assignee_id, status: 'not_started', progress: 0 })); setSubTitle(''); }}>
            <input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="Add subtask" maxLength={200} className={field} />
            <button type="submit" className="rounded-lg bg-brand-600 px-3 text-white" aria-label="Add subtask"><Plus className="h-3.5 w-3.5" /></button>
          </form>
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Depends on</h3>
          <ul className="mt-2 space-y-1">{blockers.map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-xs"><span className={`flex-1 ${b.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{b.title}</span>
              <button type="button" aria-label="Remove dependency" onClick={() => run(supabase.from('program_task_dependencies').delete().eq('task_id', task.id).eq('depends_on_task_id', b.id))}><X className="h-3.5 w-3.5 text-slate-300 hover:text-rose-600" /></button></li>
          ))}</ul>
          <div className="mt-2 flex gap-2">
            <select value={dep} onChange={(e) => setDep(e.target.value)} className={field}><option value="">Select a task…</option>{candidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
            <button type="button" disabled={!dep} onClick={() => { void run(supabase.from('program_task_dependencies').insert({ task_id: task.id, depends_on_task_id: dep })); setDep(''); }} className="rounded-lg bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-50">Add</button>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Comments</h3>
          <div className="mt-2 space-y-2">{comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-slate-50 p-2 text-xs"><p className="text-xs text-slate-400">{userName(c.author_id)} · {new Date(c.created_at).toLocaleString()}{c.author_id === currentUser.id && <button type="button" className="ml-2 text-rose-500" onClick={() => run(supabase.from('program_task_comments').delete().eq('id', c.id))}>delete</button>}</p><p className="whitespace-pre-wrap text-slate-700">{c.body}</p></div>
          ))}</div>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; void run(supabase.from('program_task_comments').insert({ task_id: task.id, body: comment.trim() })); setComment(''); }}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment" maxLength={4000} className={field} />
            <button type="submit" className="rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">Post</button>
          </form>
        </section>
      </aside>
    </div>
  );
};
