import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, FileUp, Plus, Send, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  type EngEntry, type EngFile, type EngProject, type EngReview, type ReviewType, ENTRY_KINDS, FILE_KINDS, Modal, PROJECT_STATUS, REVIEW_TYPES,
  ago, defaultReviewType, disciplineOf, fileSize, inputClass, navigate, outcomeTone, statusTone, today,
} from './shared';
import { useConfirm } from '../common/useConfirm';
import { AssignedField, assignedIds, formatTaskDate, TaskDateField } from '../programs/taskFields';

type Tab = 'log' | 'tasks' | 'files' | 'reviews';
type TaskRow = { id: string; title: string; status: string; priority: string; due_date: string | null; assignee_id: string | null; assigned_ids: string[]; parent_task_id: string | null };

const MAX_BYTES = 50 * 1024 * 1024;
const kindFor = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['stl', '3mf', 'obj', 'gcode'].includes(ext)) return 'model_3d';
  if (['step', 'stp', 'f3d', 'dxf', 'sldprt', 'iges', 'igs', 'dwg'].includes(ext)) return 'cad';
  if (['gbr', 'zip', 'kicad_pcb', 'kicad_sch', 'brd', 'sch', 'pcbdoc'].includes(ext)) return 'pcb';
  if (['py', 'ts', 'js', 'c', 'cpp', 'h', 'rs', 'ino', 'patch', 'diff'].includes(ext)) return 'code';
  if (['pdf', 'doc', 'docx', 'md', 'txt', 'xlsx', 'csv'].includes(ext)) return 'doc';
  return 'other';
};

export const openEngFile = async (path: string) => {
  const { data, error } = await supabase.storage.from('engineering-files').createSignedUrl(path, 300);
  if (error || !data) return error?.message || 'Could not open the file.';
  window.open(data.signedUrl, '_blank', 'noopener');
  return '';
};

export const ProjectDetail: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { users, currentUser } = useWorkspace();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [project, setProject] = useState<EngProject | null>(null);
  const [missing, setMissing] = useState(false);
  const [entries, setEntries] = useState<EngEntry[]>([]);
  const [files, setFiles] = useState<EngFile[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [reviews, setReviews] = useState<EngReview[]>([]);
  const [tab, setTab] = useState<Tab>('log');
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState<string | null | false>(false);

  const load = useCallback(async () => {
    const [p, e, f, t, r] = await Promise.all([
      supabase.from('eng_projects').select('*').eq('id', projectId).maybeSingle(),
      supabase.from('eng_project_entries').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('eng_project_files').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('program_tasks').select('id,title,status,priority,due_date,assignee_id,assigned_ids,parent_task_id').eq('eng_project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('eng_reviews').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);
    if (p.error) { setError(p.error.message); return; }
    if (!p.data) { setMissing(true); return; }
    setProject(p.data as EngProject);
    setEntries((e.data || []) as EngEntry[]);
    setFiles((f.data || []) as EngFile[]);
    setTasks(((t.data || []) as TaskRow[]).filter((task) => !task.parent_task_id));
    setReviews((r.data || []) as EngReview[]);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const name = (id: string | null) => (id === currentUser.id ? 'You' : users.find((user) => user.id === id)?.name || 'Unknown');
  const canManage = !!project && (project.created_by === currentUser.id || project.owner_id === currentUser.id || ['admin', 'coordinator'].includes(currentUser.systemRole));

  const patch = async (values: Partial<EngProject>, note?: string) => {
    if (!project) return;
    const { error: updateError } = await supabase.from('eng_projects').update({ ...values, updated_at: new Date().toISOString() }).eq('id', project.id);
    if (updateError) { setError(updateError.message); return; }
    if (note) await supabase.from('eng_project_entries').insert({ project_id: project.id, author_id: currentUser.id, kind: 'update', body: note });
    await load();
  };

  const remove = async () => {
    if (!project || !await confirm({ title: `Delete “${project.name}”?`, message: 'Its log, files, tasks and reviews will also be deleted.', confirmLabel: 'Delete' })) return;
    const paths = files.map((file) => file.storage_path);
    if (paths.length) await supabase.storage.from('engineering-files').remove(paths);
    const { error: deleteError } = await supabase.from('eng_projects').delete().eq('id', project.id);
    if (deleteError) setError(deleteError.message); else navigate(`/engineering/${project.discipline}`);
  };

  if (missing) return <main className="flex-1 p-8 text-sm text-slate-500">This project could not be found. <button type="button" onClick={() => navigate('/engineering')} className="font-bold text-brand-600">Back</button></main>;
  if (!project) return <main className="flex-1 p-8 text-xs text-slate-400">{error || 'Loading…'}</main>;

  const def = disciplineOf(project.discipline);
  const done = tasks.filter((task) => task.status === 'completed').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const openReviews = reviews.filter((review) => review.status !== 'decided').length;
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'log', label: 'Log', count: entries.length }, { id: 'tasks', label: 'Tasks', count: tasks.length },
    { id: 'files', label: 'Files', count: files.length }, { id: 'reviews', label: 'Reviews', count: reviews.length },
  ];

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-8">
        <button type="button" onClick={() => navigate(`/engineering/${project.discipline}`)} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-brand-600"><ArrowLeft className="h-3.5 w-3.5" />{def.label}</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
            {project.description && <p className="mt-1 max-w-3xl text-xs text-slate-500">{project.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRequesting(null)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0 md:py-2"><Send className="h-3.5 w-3.5" />Request review</button>
            {canManage && <button type="button" onClick={() => void remove()} aria-label="Delete project" className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 md:min-h-0 md:h-8 md:w-8"><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
          <label className="font-semibold text-slate-500">Status<CustomSelect value={project.status} disabled={!canManage} onChange={(event) => void patch({ status: event.target.value }, `Status changed to ${PROJECT_STATUS[event.target.value]}.`)} className={`${inputClass} mt-1 ${statusTone[project.status]}`}>{Object.entries(PROJECT_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect></label>
          <label className="font-semibold text-slate-500">Owner<CustomSelect value={project.owner_id || ''} disabled={!canManage} onChange={(event) => void patch({ owner_id: event.target.value || null })} className={`${inputClass} mt-1`}><option value="">Unassigned</option>{users.filter((user) => user.accountStatus !== 'removed').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect></label>
          <label className="font-semibold text-slate-500">Start<input type="date" value={project.start_date || ''} disabled={!canManage} onChange={(event) => void patch({ start_date: event.target.value || null })} className={`${inputClass} mt-1`} /></label>
          <label className="font-semibold text-slate-500">Target<input type="date" value={project.target_date || ''} disabled={!canManage} onChange={(event) => void patch({ target_date: event.target.value || null })} className={`${inputClass} mt-1`} /></label>
          <div className="col-span-2 md:col-span-1"><p className="font-semibold text-slate-500">Progress</p><p className="mt-2 text-sm font-bold text-slate-900">{pct}% <span className="text-xs font-normal text-slate-400">· {done}/{tasks.length} tasks · {openReviews} open reviews</span></p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div></div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-8">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab === item.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item.label} <span className="text-xs text-slate-400">{item.count}</span></button>)}
        </div>

        {tab === 'log' && <LogTab projectId={project.id} entries={entries} name={name} onChanged={load} onError={setError} />}
        {tab === 'tasks' && <TasksTab projectId={project.id} tasks={tasks} onChanged={load} onError={setError} />}
        {tab === 'files' && <FilesTab project={project} files={files} name={name} onChanged={load} onError={setError} onRequest={(fileId) => setRequesting(fileId)} />}
        {tab === 'reviews' && (
          <div className="space-y-2">
            {reviews.map((review) => (
              <button key={review.id} type="button" onClick={() => navigate(`/engineering/review/${review.id}`)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-brand-400">
                <span className="min-w-0"><b className="block truncate text-sm text-slate-900">{review.title}</b><span className="text-xs text-slate-500">{REVIEW_TYPES[review.review_type].label}{review.requested_action ? ` · for ${review.requested_action}` : ''} · {name(review.submitted_by)} · {ago(review.created_at)}</span></span>
                <span className={`rounded-md px-2 py-1 text-xs font-bold ${review.status === 'decided' ? outcomeTone(review.outcome) : 'bg-amber-50 text-amber-700'}`}>{review.status === 'decided' ? review.outcome : review.status === 'in_review' ? 'In review' : 'Waiting for reviewers'}</span>
              </button>
            ))}
            {!reviews.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">No reviews yet. Use Request review to send a file to the review team.</p>}
          </div>
        )}
      </div>

      {requesting !== false && <RequestReview project={project} files={files} initialFile={requesting} onClose={() => setRequesting(false)} onCreated={async (id) => { setRequesting(false); await load(); navigate(`/engineering/review/${id}`); }} />}
      {confirmDialog}
    </main>
  );
};

const LogTab: React.FC<{ projectId: string; entries: EngEntry[]; name: (id: string | null) => string; onChanged: () => void; onError: (message: string) => void }> = ({ projectId, entries, name, onChanged, onError }) => {
  const { currentUser } = useWorkspace();
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('update');
  const add = async () => {
    if (!body.trim()) return;
    const { error } = await supabase.from('eng_project_entries').insert({ project_id: projectId, author_id: currentUser.id, kind, body: body.trim() });
    if (error) { onError(error.message); return; }
    setBody('');
    onChanged();
  };
  const remove = async (id: string) => { const { error } = await supabase.from('eng_project_entries').delete().eq('id', id); if (error) onError(error.message); else onChanged(); };
  const kindTone: Record<string, string> = { update: 'bg-slate-100 text-slate-600', decision: 'bg-brand-50 text-brand-700', issue: 'bg-rose-50 text-rose-700', milestone: 'bg-emerald-50 text-emerald-700' };
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What happened? Progress, a decision, a problem, a milestone…" className={`${inputClass} min-h-20`} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">{Object.entries(ENTRY_KINDS).map(([id, label]) => <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${kind === id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div>
          <button type="button" onClick={() => void add()} disabled={!body.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Post entry</button>
        </div>
      </div>
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2"><span className={`rounded-md px-2 py-0.5 font-bold ${kindTone[entry.kind]}`}>{ENTRY_KINDS[entry.kind]}</span><b className="text-slate-700">{name(entry.author_id)}</b><span className="text-slate-400">{ago(entry.created_at)}</span></span>
            {entry.author_id === currentUser.id && <button type="button" aria-label="Delete entry" onClick={() => void remove(entry.id)} className="p-1 text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{entry.body}</p>
        </article>
      ))}
      {!entries.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">The project log is empty. Post the first update.</p>}
    </div>
  );
};

const TasksTab: React.FC<{ projectId: string; tasks: TaskRow[]; onChanged: () => void; onError: (message: string) => void }> = ({ projectId, tasks, onChanged, onError }) => {
  const { users, currentUser } = useWorkspace();
  const [title, setTitle] = useState('');
  const [assigned, setAssigned] = useState<string[]>([]);
  const [due, setDue] = useState('');
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from('program_tasks').insert({ title: title.trim(), eng_project_id: projectId, assigned_ids: assigned, due_date: due || null, status: 'not_started', priority: 'medium', progress: 0, created_by: currentUser.id });
    if (error) { onError(error.message); return; }
    setTitle(''); setDue(''); setAssigned([]);
    onChanged();
  };
  const toggle = async (task: TaskRow) => {
    const completed = task.status !== 'completed';
    const { error } = await supabase.from('program_tasks').update({ status: completed ? 'completed' : 'not_started', progress: completed ? 100 : 0, updated_at: new Date().toISOString() }).eq('id', task.id);
    if (error) onError(error.message); else onChanged();
  };
  const person = (task: TaskRow) => users.filter((user) => assignedIds(task).includes(user.id)).map((user) => user.name).join(', ') || 'Unassigned';
  const statusLabel: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Done' };
  return (
    <div className="space-y-3">
      <form onSubmit={(event) => void add(event)} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New task for this project" aria-label="Task title" className={`${inputClass} min-w-48 flex-1`} />
        <AssignedField value={assigned} onChange={setAssigned} />
        <TaskDateField value={due || null} onChange={(date) => setDue(date || '')} />
        <button type="submit" disabled={!title.trim()} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand-600 px-4 text-xs font-bold text-white disabled:opacity-40 md:min-h-0"><Plus className="h-3.5 w-3.5" />Add</button>
      </form>
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-3 py-2.5">
            <input type="checkbox" checked={task.status === 'completed'} onChange={() => void toggle(task)} aria-label={`Mark ${task.title} ${task.status === 'completed' ? 'open' : 'done'}`} className="h-4 w-4 shrink-0" />
            <button type="button" onClick={() => navigate(`/programs/task/${task.id}`)} className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800 hover:text-brand-600'}`}>{task.title}</button>
            <span className="hidden text-xs text-slate-400 sm:block">{person(task)}</span>
            <span className={`text-xs ${task.due_date && task.due_date < today() && task.status !== 'completed' ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{formatTaskDate(task.due_date)}</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{statusLabel[task.status]}</span>
          </div>
        ))}
        {!tasks.length && <p className="p-8 text-center text-xs text-slate-500">No tasks yet. Tasks added here also appear on the main Tasks page.</p>}
      </div>
    </div>
  );
};

const FilesTab: React.FC<{ project: EngProject; files: EngFile[]; name: (id: string | null) => string; onChanged: () => void; onError: (message: string) => void; onRequest: (fileId: string) => void }> = ({ project, files, name, onChanged, onError, onRequest }) => {
  const { currentUser } = useWorkspace();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(event.target.files || []);
    event.target.value = '';
    if (!list.length) return;
    setBusy(true);
    onError('');
    for (const file of list) {
      if (file.size > MAX_BYTES) { onError(`${file.name} is larger than 50 MB.`); continue; }
      const path = `${currentUser.id}/${project.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('engineering-files').upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (uploadError) { onError(`${file.name}: ${uploadError.message}`); continue; }
      const { error: rowError } = await supabase.from('eng_project_files').insert({ project_id: project.id, uploaded_by: currentUser.id, name: file.name, storage_path: path, size_bytes: file.size, mime_type: file.type || null, kind: kindFor(file.name) });
      if (rowError) { onError(rowError.message); await supabase.storage.from('engineering-files').remove([path]); }
    }
    setBusy(false);
    onChanged();
  };
  const remove = async (file: EngFile) => {
    if (!await confirm({ title: `Delete “${file.name}”?`, message: 'This file will be removed from the project.', confirmLabel: 'Delete' })) return;
    await supabase.storage.from('engineering-files').remove([file.storage_path]);
    const { error } = await supabase.from('eng_project_files').delete().eq('id', file.id);
    if (error) onError(error.message); else onChanged();
  };
  return (
    <div className="space-y-3">
      <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:border-brand-400 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <FileUp className="h-5 w-5 text-brand-600" /><span className="text-sm font-semibold text-slate-700">{busy ? 'Uploading…' : 'Upload files'}</span><span className="text-xs text-slate-400">3D models (STL, STEP, 3MF), PCB packages, code archives and documents, up to 50 MB each</span>
        <input type="file" multiple onChange={(event) => void upload(event)} className="sr-only" />
      </label>
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {files.map((file) => (
          <div key={file.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{FILE_KINDS[file.kind]}</span>
            <span className="min-w-0 flex-1"><b className="block truncate text-sm text-slate-800">{file.name}</b><span className="text-xs text-slate-400">{fileSize(file.size_bytes)} · {name(file.uploaded_by)} · {ago(file.created_at)}</span></span>
            <button type="button" onClick={() => void openEngFile(file.storage_path).then((message) => message && onError(message))} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 md:min-h-0 md:py-1.5"><Download className="h-3.5 w-3.5" />Open</button>
            <button type="button" onClick={() => onRequest(file.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 md:min-h-0 md:py-1.5"><Send className="h-3.5 w-3.5" />Request review</button>
            {(file.uploaded_by === currentUser.id || ['admin', 'coordinator'].includes(currentUser.systemRole)) && <button type="button" aria-label={`Delete ${file.name}`} onClick={() => void remove(file)} className="p-1.5 text-slate-300 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
        {!files.length && <p className="p-8 text-center text-xs text-slate-500">No files yet.</p>}
      </div>
      {confirmDialog}
    </div>
  );
};

const RequestReview: React.FC<{ project: EngProject; files: EngFile[]; initialFile: string | null; onClose: () => void; onCreated: (id: string) => void }> = ({ project, files, initialFile, onClose, onCreated }) => {
  const { currentUser } = useWorkspace();
  const initialType = defaultReviewType[project.discipline];
  const [form, setForm] = useState<{ review_type: ReviewType; title: string; summary: string; requested_action: string; file_id: string }>({
    review_type: initialType, title: '', summary: '', requested_action: REVIEW_TYPES[initialType].actions[0], file_id: initialFile || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const changeType = (type: ReviewType) => setForm((value) => ({ ...value, review_type: type, requested_action: REVIEW_TYPES[type].actions[0] }));
  const save = async () => {
    const file = files.find((item) => item.id === form.file_id);
    const title = form.title.trim() || `${REVIEW_TYPES[form.review_type].label}: ${file?.name || project.name}`;
    setSaving(true);
    const { data, error: insertError } = await supabase.from('eng_reviews').insert({ project_id: project.id, file_id: form.file_id || null, review_type: form.review_type, title, summary: form.summary.trim() || null, requested_action: form.requested_action || null, submitted_by: currentUser.id }).select('id').single();
    setSaving(false);
    if (insertError || !data) { setError(insertError?.message || 'Could not submit the review.'); return; }
    await supabase.from('eng_project_entries').insert({ project_id: project.id, author_id: currentUser.id, kind: 'update', body: `Requested ${REVIEW_TYPES[form.review_type].label.toLowerCase()}: ${title}` });
    onCreated(data.id);
  };
  return (
    <Modal title="Request a review" onClose={onClose}>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Review type<CustomSelect value={form.review_type} onChange={(event) => changeType(event.target.value as ReviewType)} className={`${inputClass} mt-1`}>{Object.entries(REVIEW_TYPES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</CustomSelect></label>
        <label className="text-xs font-semibold text-slate-600">What do you need it for?<CustomSelect value={form.requested_action} onChange={(event) => setForm((value) => ({ ...value, requested_action: event.target.value }))} className={`${inputClass} mt-1`}>{REVIEW_TYPES[form.review_type].actions.map((action) => <option key={action} value={action}>{action}</option>)}</CustomSelect></label>
      </div>
      <label className="block text-xs font-semibold text-slate-600">File to review<CustomSelect value={form.file_id} onChange={(event) => setForm((value) => ({ ...value, file_id: event.target.value }))} className={`${inputClass} mt-1`}><option value="">No file (describe below)</option>{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</CustomSelect></label>
      <input value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} placeholder="Title (optional)" className={inputClass} />
      <textarea value={form.summary} onChange={(event) => setForm((value) => ({ ...value, summary: event.target.value }))} placeholder="What changed, what to look at, constraints (material, quantity, deadline)…" className={`${inputClass} min-h-24`} />
      <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Submitting…' : 'Submit for review'}</button>
    </Modal>
  );
};
