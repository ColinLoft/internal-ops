import React, { useCallback, useEffect, useState } from 'react';
import { BriefcaseBusiness, Building2, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

type Department = { id: string; name: string; description: string | null; head_id: string | null };
type Position = { id: string; title: string; department_id: string | null; reports_to_id: string | null; status: string };

const field = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';
const addButton = 'inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0';

const FormDialog: React.FC<{ title: string; onClose: () => void; onSave: () => void; error: string; children: React.ReactNode }> = ({ title, onClose, onSave, error, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" onClick={onClose}>
    <div role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">{title}</h3><button type="button" onClick={onClose} aria-label="Close" className="-m-2 p-2"><X className="h-4 w-4 text-slate-400" /></button></div>
      <div className="mt-4 space-y-3">{children}</div>
      {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={onSave} className={addButton}>Save</button>
      </div>
    </div>
  </div>
);

export const DepartmentsPositionsPanel: React.FC = () => {
  const { users } = useWorkspace();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [dialog, setDialog] = useState<'department' | 'position' | null>(null);
  const [error, setError] = useState('');
  const [department, setDepartment] = useState({ name: '', description: '', head_id: '' });
  const [position, setPosition] = useState({ title: '', department_id: '', reports_to_id: '', status: 'open' });

  const load = useCallback(async () => {
    const [departmentResult, positionResult] = await Promise.all([
      supabase.from('organization_departments').select('id,name,description,head_id').order('name'),
      supabase.from('organization_positions').select('id,title,department_id,reports_to_id,status').order('title'),
    ]);
    if (departmentResult.error || positionResult.error) setError((departmentResult.error || positionResult.error)?.message || '');
    setDepartments((departmentResult.data as Department[]) || []);
    setPositions((positionResult.data as Position[]) || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeUsers = users.filter((user) => user.accountStatus !== 'removed');
  const nameOf = (id: string | null) => users.find((user) => user.id === id)?.name;

  const saveDepartment = async () => {
    if (!department.name.trim()) return;
    const { error: saveError } = await supabase.from('organization_departments').insert({ name: department.name.trim(), description: department.description.trim() || null, head_id: department.head_id || null });
    if (saveError) { setError(saveError.message); return; }
    setDepartment({ name: '', description: '', head_id: '' });
    setDialog(null);
    setError('');
    await load();
  };

  const savePosition = async () => {
    if (!position.title.trim()) return;
    const { error: saveError } = await supabase.from('organization_positions').insert({ title: position.title.trim(), department_id: position.department_id || null, reports_to_id: position.reports_to_id || null, status: position.status });
    if (saveError) { setError(saveError.message); return; }
    setPosition({ title: '', department_id: '', reports_to_id: '', status: 'open' });
    setDialog(null);
    setError('');
    await load();
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Building2 className="h-4 w-4 text-brand-600" />Departments &amp; positions</div>
          <p className="mt-1 text-xs text-slate-500">Define teams, department heads, positions and reporting lines.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setError(''); setDialog('department'); }} className={addButton}><Plus className="h-3.5 w-3.5" />Department</button>
          <button type="button" onClick={() => { setError(''); setDialog('position'); }} className={addButton}><Plus className="h-3.5 w-3.5" />Position</button>
        </div>
      </div>
      {error && !dialog && <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">{error}</p>}
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Departments</h4>
          <div className="space-y-2">
            {departments.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-bold text-slate-900">{item.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.description || 'No description added.'}</p>
                <p className="mt-2 text-xs text-slate-400">Head: {nameOf(item.head_id) || 'Unassigned'}</p>
              </article>
            ))}
            {!departments.length && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">No departments yet.</p>}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Positions</h4>
          <div className="space-y-2">
            {positions.map((item) => (
              <article key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <BriefcaseBusiness className="h-4 w-4 shrink-0 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                  <p className="truncate text-xs text-slate-500">{departments.find((entry) => entry.id === item.department_id)?.name || 'No department'} · Reports to {nameOf(item.reports_to_id) || 'unassigned'}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.status}</span>
              </article>
            ))}
            {!positions.length && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">No positions yet.</p>}
          </div>
        </div>
      </div>

      {dialog === 'department' && (
        <FormDialog title="Add department" error={error} onClose={() => setDialog(null)} onSave={() => void saveDepartment()}>
          <label className="block text-xs font-semibold text-slate-600">Department name<input value={department.name} onChange={(event) => setDepartment((value) => ({ ...value, name: event.target.value }))} className={field} /></label>
          <label className="block text-xs font-semibold text-slate-600">Department head
            <select value={department.head_id} onChange={(event) => setDepartment((value) => ({ ...value, head_id: event.target.value }))} className={field}>
              <option value="">Unassigned</option>
              {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">Description<textarea value={department.description} onChange={(event) => setDepartment((value) => ({ ...value, description: event.target.value }))} className={`${field} min-h-20`} /></label>
        </FormDialog>
      )}
      {dialog === 'position' && (
        <FormDialog title="Add position" error={error} onClose={() => setDialog(null)} onSave={() => void savePosition()}>
          <label className="block text-xs font-semibold text-slate-600">Position title<input value={position.title} onChange={(event) => setPosition((value) => ({ ...value, title: event.target.value }))} className={field} /></label>
          <label className="block text-xs font-semibold text-slate-600">Department
            <select value={position.department_id} onChange={(event) => setPosition((value) => ({ ...value, department_id: event.target.value }))} className={field}>
              <option value="">No department</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">Reports to
            <select value={position.reports_to_id} onChange={(event) => setPosition((value) => ({ ...value, reports_to_id: event.target.value }))} className={field}>
              <option value="">Unassigned</option>
              {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">Status
            <select value={position.status} onChange={(event) => setPosition((value) => ({ ...value, status: event.target.value }))} className={field}>
              <option value="open">Open</option>
              <option value="filled">Filled</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </FormDialog>
      )}
    </section>
  );
};
