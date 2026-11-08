import React, { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { celebrateMilestone } from '../../lib/milestones';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { control, displayStage, primary, secondary, surface, type Property, type Organization } from './model';
type Deployment = { id: string; quote_id: string | null; organization_id: string; property_id: string; status: string; scheduled_at: string | null; completed_at: string | null; notes: string };
type Task = { id: string; deployment_id: string; title: string; status: string; assigned_to: string | null; due_at: string | null; notes: string };
type Event = { id: string; deployment_id: string; event_type: string; body: string; created_at: string };
const stages = ['contract_executed', 'planning', 'procurement', 'preparation', 'scheduled', 'installation', 'commissioning', 'handoff', 'completed', 'cancelled'];
export function Deployments({ properties, organizations, canEdit, onQuote }: { properties: Property[]; organizations: Organization[]; canEdit: boolean; onQuote: (id: string) => void }) {
  const { currentUser, users } = useWorkspace();
  const [items, setItems] = useState<Deployment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [activeId, setActiveId] = useState('');
  const [note, setNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [deployments, taskResult, eventResult] = await Promise.all([
      supabase.from('wildfire_deployments').select('id,quote_id,organization_id,property_id,status,scheduled_at,completed_at,notes').order('updated_at', { ascending: false }),
      supabase.from('wildfire_deployment_tasks').select('id,deployment_id,title,status,assigned_to,due_at,notes').order('created_at'),
      supabase.from('wildfire_deployment_events').select('id,deployment_id,event_type,body,created_at').order('created_at', { ascending: false }).limit(1000),
    ]);
    const failed = deployments.error || taskResult.error || eventResult.error;
    if (failed) { setError(failed.message); return; }
    setItems(deployments.data ?? []); setTasks(taskResult.data ?? []); setEvents(eventResult.data ?? []);
  }, []);
  useLiveRefresh(load, ['wildfire_deployments', 'wildfire_deployment_tasks', 'wildfire_deployment_events']);
  const active = items.find(item => item.id === activeId) ?? items[0] ?? null;
  const mutate = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Deployment update failed.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className={surface}><h2 className="text-lg font-semibold text-slate-900">Deployment delivery</h2><p className="mt-2 text-sm text-slate-500">Created automatically when a customer signs and accepts a quote. Track scheduling, procurement, installation, commissioning, handoff, tasks, and updates here.</p>
      <select aria-label="Select deployment" value={active?.id ?? ''} onChange={event => { setActiveId(event.target.value); setNote(''); }} className={`${control} mt-4`}>
        {!items.length && <option value="">No accepted quotes yet</option>}
        {items.map(item => <option key={item.id} value={item.id}>{properties.find(property => property.id === item.property_id)?.label || item.id.slice(0, 8)} · {displayStage(item.status)}</option>)}
      </select>
    </section>
    {active && <section className={surface}>
      <h2 className="text-lg font-semibold text-slate-900">{properties.find(property => property.id === active.property_id)?.label || 'Deployment'}</h2>
      <p className="mt-1 text-sm text-slate-500">{organizations.find(organization => organization.id === active.organization_id)?.name} · Quote {active.quote_id?.slice(0, 8) || 'Legacy deployment'}</p>
      {active.quote_id && <button type="button" className={`${secondary} mt-3`} onClick={() => active.quote_id && onQuote(active.quote_id)}>View accepted quote and proposal</button>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-700">Delivery stage<select disabled={!canEdit || busy} value={active.status} className={control} onChange={event => { const status = event.target.value; void mutate(async () => { const { data, error: updateError } = await supabase.from('wildfire_deployments').update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null }).eq('id', active.id).select('status').single(); if (updateError) throw new Error(updateError.message); if (data) celebrateMilestone('deployment', active.id, active.status, data.status); }); }}>
        {stages.map(stage => <option key={stage} value={stage}>{displayStage(stage)}</option>)}
      </select></label>
      <label className="text-sm text-slate-700">Scheduled date<input type="date" disabled={!canEdit || busy} value={active.scheduled_at?.slice(0, 10) ?? ''} className={control} onChange={event => { const scheduled_at = event.target.value ? `${event.target.value}T12:00:00Z` : null; void mutate(async () => { const { error: updateError } = await supabase.from('wildfire_deployments').update({ scheduled_at }).eq('id', active.id); if (updateError) throw new Error(updateError.message); }); }} /></label></div>
      <h3 className="mt-6 font-semibold text-slate-900">Delivery tasks</h3>
      <ul className="mt-3 space-y-2">{tasks.filter(task => task.deployment_id === active.id).map(task => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><div><p className="text-sm text-slate-900">{task.title}</p><p className="text-xs text-slate-500">{users.find(user => user.id === task.assigned_to)?.name || 'Unassigned'}{task.due_at ? ` · Due ${new Date(task.due_at).toLocaleDateString('en-US')}` : ''}</p></div><select aria-label={`Status for ${task.title}`} disabled={!canEdit || busy} value={task.status} className={`${control} w-auto`} onChange={event => { const status = event.target.value; void mutate(async () => { const { data, error: updateError } = await supabase.from('wildfire_deployment_tasks').update({ status }).eq('id', task.id).select('status').single(); if (updateError) throw new Error(updateError.message); if (data) celebrateMilestone('task', `deployment-task:${task.id}`, task.status === 'done' ? 'completed' : task.status, data.status === 'done' ? 'completed' : data.status); }); }}>{['todo', 'in_progress', 'done'].map(status => <option key={status} value={status}>{displayStage(status)}</option>)}</select></li>)}</ul>
      {canEdit && <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void mutate(async () => { const { error: saveError } = await supabase.from('wildfire_deployment_tasks').insert({ deployment_id: active.id, title: taskTitle.trim(), assigned_to: taskAssignee || null, due_at: dueDate ? `${dueDate}T12:00:00Z` : null, created_by: currentUser.id }); if (saveError) throw new Error(saveError.message); setTaskTitle(''); setDueDate(''); }); }}>
        <input aria-label="New deployment task" required maxLength={300} value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="New delivery task" className={control} />
        <select aria-label="Assigned team member" value={taskAssignee} onChange={event => setTaskAssignee(event.target.value)} className={control}><option value="">Unassigned</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        <label className="text-xs text-slate-500">Due date<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className={control} /></label><button disabled={busy} className={secondary}>Add task</button>
      </form>}
      <h3 className="mt-6 font-semibold text-slate-900">Updates and history</h3>
      {canEdit && <form className="mt-3 space-y-2" onSubmit={event => { event.preventDefault(); void mutate(async () => { const { error: saveError } = await supabase.from('wildfire_deployment_events').insert({ deployment_id: active.id, event_type: 'note', body: note.trim(), created_by: currentUser.id }); if (saveError) throw new Error(saveError.message); setNote(''); }); }}><textarea aria-label="Deployment update" required rows={3} value={note} onChange={event => setNote(event.target.value)} className={control} /><button disabled={busy} className={primary}>Post update</button></form>}
      <ul className="mt-4 space-y-3">{events.filter(event => event.deployment_id === active.id).map(event => <li key={event.id} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{displayStage(event.event_type)} · {new Date(event.created_at).toLocaleString('en-US')}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{event.body}</p></li>)}</ul>
    </section>}
  </div>;
}
