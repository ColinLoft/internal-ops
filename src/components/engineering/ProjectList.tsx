import { userFacingError } from '../../lib/userFacingError';
import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Dropdown } from '../common/Dropdown';
import { type Discipline, type EngProject, Modal, PROJECT_STATUS, disciplineOf, inputClass, navigate, statusTone, today } from './shared';

type TaskLite = { eng_project_id: string | null; status: string; parent_task_id: string | null };

export const ProjectList: React.FC<{ discipline: Discipline }> = ({ discipline }) => {
  const { users } = useWorkspace();
  const def = disciplineOf(discipline);
  const [projects, setProjects] = useState<EngProject[]>([]);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('eng_projects').select('*').eq('discipline', discipline).order('created_at', { ascending: false });
    if (loadError) { setError(`Projects could not be loaded: ${loadError.message}. Run the latest migration (20261105120000).`); setLoading(false); return; }
    const list = (data || []) as EngProject[];
    setProjects(list);
    setError('');
    if (list.length) {
      const { data: taskRows } = await supabase.from('program_tasks').select('eng_project_id,status,parent_task_id').in('eng_project_id', list.map((project) => project.id));
      setTasks((taskRows || []) as TaskLite[]);
    } else setTasks([]);
    setLoading(false);
  }, [discipline]);

  useEffect(() => { setLoading(true); setQuery(''); setStatus('all'); void load(); }, [load]);

  const owner = (id: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const progress = (project: EngProject) => {
    const own = tasks.filter((task) => task.eng_project_id === project.id && !task.parent_task_id);
    return { done: own.filter((task) => task.status === 'completed').length, total: own.length };
  };
  const shown = useMemo(() => projects.filter((project) => (status === 'all' || project.status === status) && `${project.name} ${project.description || ''}`.toLowerCase().includes(query.toLowerCase())), [projects, status, query]);
  const Icon = def.icon;
  const active = projects.filter((project) => ['planning', 'active', 'in_review'].includes(project.status)).length;
  const late = projects.filter((project) => project.target_date && project.target_date < today() && !['completed', 'archived'].includes(project.status)).length;

  return (
    <main data-onboarding-target="product-projects" className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-8 sm:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
          <div className="min-w-0"><h1 className="text-xl font-bold text-slate-900">{def.label}</h1><p className="mt-0.5 text-xs text-slate-500">{def.blurb} {projects.length} projects · {active} open · {late} past target.</p></div>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0 md:py-2"><Plus className="h-3.5 w-3.5" />New project</button>
      </header>
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{userFacingError(error)}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" className={`${inputClass} pl-9`} /></div>
          <Dropdown value={status} onChange={setStatus} ariaLabel="Filter by status" className="min-w-40" options={[{ id: 'all', label: 'All statuses' }, ...Object.entries(PROJECT_STATUS).map(([id, label]) => ({ id, label }))]} />
        </div>
        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : shown.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((project) => {
              const { done, total } = progress(project);
              const pct = total ? Math.round((done / total) * 100) : 0;
              const overdue = project.target_date && project.target_date < today() && !['completed', 'archived'].includes(project.status);
              return (
                <button key={project.id} type="button" onClick={() => navigate(`/engineering/${discipline}/${project.id}`)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-400">
                  <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">{project.name}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[project.status]}`}>{PROJECT_STATUS[project.status]}</span></div>
                  <p className="mt-1 line-clamp-2 min-h-8 text-xs text-slate-500">{project.description || 'No description yet.'}</p>
                  <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>{done}/{total} tasks done</span><span>{pct}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div></div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500"><span>{owner(project.owner_id)}</span><span className={overdue ? 'font-semibold text-rose-600' : ''}>{project.target_date ? `Target ${project.target_date}` : 'No target date'}</span></div>
                </button>
              );
            })}
          </div>
        ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">{projects.length ? 'No projects match your filters.' : `No ${def.label.toLowerCase()} projects yet. Create one to start logging work, tasks and files.`}</div>}
      </div>
      {creating && <NewProject discipline={discipline} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); navigate(`/engineering/${discipline}/${id}`); }} />}
    </main>
  );
};

const NewProject: React.FC<{ discipline: Discipline; onClose: () => void; onCreated: (id: string) => void }> = ({ discipline, onClose, onCreated }) => {
  const { users, currentUser } = useWorkspace();
  const [form, setForm] = useState({ name: '', description: '', owner_id: currentUser.id, start_date: today(), target_date: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const save = async () => {
    if (!form.name.trim()) { setError('A project name is required.'); return; }
    if (form.target_date && form.target_date < form.start_date) { setError('The target date must be after the start date.'); return; }
    setSaving(true);
    const { data, error: insertError } = await supabase.from('eng_projects').insert({ discipline, name: form.name.trim(), description: form.description.trim() || null, owner_id: form.owner_id || null, start_date: form.start_date || null, target_date: form.target_date || null, created_by: currentUser.id }).select('id').single();
    setSaving(false);
    if (insertError || !data) setError(insertError?.message || 'Could not create the project.'); else onCreated(data.id);
  };
  return (
    <Modal title={`New ${disciplineOf(discipline).label.toLowerCase()} project`} onClose={onClose}>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{userFacingError(error)}</p>}
      <input autoFocus value={form.name} onChange={set('name')} placeholder="Project name" className={inputClass} />
      <textarea value={form.description} onChange={set('description')} placeholder="Goal and scope" className={`${inputClass} min-h-20`} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">Owner<CustomSelect value={form.owner_id} onChange={set('owner_id')} className={`${inputClass} mt-1`}><option value="">Unassigned</option>{users.filter((user) => user.accountStatus !== 'removed').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect></label>
        <label className="text-xs font-semibold text-slate-600">Start<input type="date" value={form.start_date} onChange={set('start_date')} className={`${inputClass} mt-1`} /></label>
        <label className="text-xs font-semibold text-slate-600">Target<input type="date" value={form.target_date} onChange={set('target_date')} className={`${inputClass} mt-1`} /></label>
      </div>
      <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create project'}</button>
    </Modal>
  );
};
