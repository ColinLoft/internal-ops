import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, ChevronRight, ClipboardCheck, Network, Plus, Search, UserRound, Users } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import type { User } from '../../types';

type View = 'chart' | 'employees' | 'departments' | 'positions' | 'onboarding' | 'absence' | 'records';
type Department = { id: string; name: string; description: string | null; head_id: string | null };
type Position = { id: string; title: string; department_id: string | null; reports_to_id: string | null; status: string };
type EmployeeRecord = { user_id: string; position_id: string | null; manager_id: string | null; employment_type: string; start_date: string | null; notes: string | null };
type Onboarding = { id: string; employee_id: string; title: string; status: string; due_date: string | null };
type Absence = { id: string; employee_id: string; leave_type: string; starts_on: string; ends_on: string; status: string };
type OrgRecord = { id: string; title: string; record_type: string; owner_id: string | null; status: string; description: string | null };

const nav: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'chart', label: 'Organization chart', icon: Network },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'positions', label: 'Positions & roles', icon: UserRound },
  { id: 'onboarding', label: 'Onboarding', icon: ClipboardCheck },
  { id: 'absence', label: 'Absence & leave', icon: CalendarDays },
  { id: 'records', label: 'Organizational records', icon: Building2 },
];

export const OrganizationPage: React.FC = () => {
  const { users, currentUser } = useWorkspace();
  const [view, setView] = useState<View>(() => (window.location.pathname.split('/')[2] as View) || 'chart');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [onboarding, setOnboarding] = useState<Onboarding[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [records, setRecords] = useState<OrgRecord[]>([]);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const results = await Promise.all([
      supabase.from('organization_departments').select('id,name,description,head_id').order('name'),
      supabase.from('organization_positions').select('id,title,department_id,reports_to_id,status').order('title'),
      supabase.from('organization_employee_records').select('user_id,position_id,manager_id,employment_type,start_date,notes'),
      supabase.from('organization_onboarding').select('id,employee_id,title,status,due_date').order('created_at', { ascending: false }),
      supabase.from('organization_absences').select('id,employee_id,leave_type,starts_on,ends_on,status').order('starts_on'),
      supabase.from('organization_records').select('id,title,record_type,owner_id,status,description').order('created_at', { ascending: false }),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) { setError('Organization tables are not available yet. Apply the latest Supabase migration to enable editing.'); return; }
    setDepartments((results[0].data || []) as Department[]);
    setPositions((results[1].data || []) as Position[]);
    setEmployees((results[2].data || []) as EmployeeRecord[]);
    setOnboarding((results[3].data || []) as Onboarding[]);
    setAbsences((results[4].data || []) as Absence[]);
    setRecords((results[5].data || []) as OrgRecord[]);
  };
  useEffect(() => { void load(); const onRoute = () => setView((window.location.pathname.split('/')[2] as View) || 'chart'); window.addEventListener('popstate', onRoute); return () => window.removeEventListener('popstate', onRoute); }, []);
  const navigate = (next: View) => { window.history.pushState({}, '', next === 'chart' ? '/organization' : `/organization/${next}`); setView(next); };
  const userById = (id: string | null) => users.find((user) => user.id === id);
  const visibleUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.department} ${user.role}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  const addDepartment = async () => { if (!name.trim()) return; const { error: insertError } = await supabase.from('organization_departments').insert({ name: name.trim() }); if (insertError) { setError(insertError.message); return; } setName(''); setShowAdd(false); await load(); };

  return <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]"><header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">People and structure</p><h1 className="mt-1 text-xl font-bold text-slate-900">{nav.find((item) => item.id === view)?.label}</h1><p className="mt-1 text-xs text-slate-500">Manage personnel, departments, leadership, positions, reporting structures, and organizational records.</p></div>{(view === 'departments' || view === 'positions' || view === 'records') && <button type="button" onClick={() => setShowAdd(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add {view === 'departments' ? 'department' : view === 'positions' ? 'position' : 'record'}</button>}</div></header><div className="mx-auto max-w-7xl p-5 sm:p-8">{error && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>}<div className="mb-5 flex gap-2 overflow-x-auto">{nav.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${view === item.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-brand-50'}`}><Icon className="h-3.5 w-3.5" />{item.label}</button>; })}</div>
    {view === 'chart' && <OrgChart users={users} employees={employees} positions={positions} userById={userById} />}
    {view === 'employees' && <section><div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleUsers.map((user) => <EmployeeCard key={user.id} user={user} record={employees.find((record) => record.user_id === user.id)} manager={userById(employees.find((record) => record.user_id === user.id)?.manager_id || null)} />)}</div></section>}
    {view === 'departments' && <ListView empty="No departments yet" items={departments.map((item) => ({ title: item.name, detail: item.description || 'Add a department description and leader.' }))} />}
    {view === 'positions' && <ListView empty="No positions yet" items={positions.map((item) => ({ title: item.title, detail: `${item.status} · ${userById(item.reports_to_id)?.name || 'No manager assigned'}` }))} />}
    {view === 'onboarding' && <ListView empty="No onboarding tasks yet" items={onboarding.map((item) => ({ title: item.title, detail: `${userById(item.employee_id)?.name || 'Employee'} · ${item.status}${item.due_date ? ` · due ${item.due_date}` : ''}` }))} />}
    {view === 'absence' && <ListView empty="No leave records yet" items={absences.map((item) => ({ title: `${userById(item.employee_id)?.name || 'Employee'} · ${item.leave_type}`, detail: `${item.starts_on} to ${item.ends_on} · ${item.status}` }))} />}
    {view === 'records' && <ListView empty="No organizational records yet" items={records.map((item) => ({ title: item.title, detail: `${item.record_type} · ${item.status} · ${userById(item.owner_id)?.name || 'No owner'}` }))} />}
    {showAdd && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-5"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-sm font-bold text-slate-900">Add {view === 'departments' ? 'department' : view === 'positions' ? 'position' : 'record'}</h2><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowAdd(false)} className="rounded-lg px-3 py-2 text-xs text-slate-500">Cancel</button><button type="button" onClick={addDepartment} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white">Save</button></div></div></div>}</div></main>;
};

const EmployeeCard: React.FC<{ user: User; record?: EmployeeRecord; manager?: User }> = ({ user, record, manager }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><img src={user.avatar} alt="" className="h-10 w-10 rounded-xl object-cover" /><div><h3 className="text-xs font-bold text-slate-900">{user.name}</h3><p className="text-[10px] text-slate-500">{user.role} · {user.department}</p></div></div><div className="mt-4 space-y-2 text-[10px] text-slate-500"><p>Reports to: <strong className="text-slate-700">{manager?.name || 'Not assigned'}</strong></p><p>Employment: <strong className="text-slate-700">{record?.employment_type || 'Staff'}</strong></p><p>Start date: <strong className="text-slate-700">{record?.start_date || 'Not recorded'}</strong></p></div></article>;
const ListView: React.FC<{ empty: string; items: { title: string; detail: string }[] }> = ({ empty, items }) => <section className="space-y-2">{items.length ? items.map((item) => <div key={`${item.title}-${item.detail}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><ChevronRight className="h-4 w-4" /></span><div><p className="text-xs font-bold text-slate-800">{item.title}</p><p className="mt-1 text-[10px] text-slate-500">{item.detail}</p></div></div>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">{empty}</div>}</section>;
const OrgChart: React.FC<{ users: User[]; employees: EmployeeRecord[]; positions: Position[]; userById: (id: string | null) => User | undefined }> = ({ users, employees, positions, userById }) => { const roots = users.filter((user) => !employees.find((record) => record.user_id === user.id)?.manager_id); return <section><div className="mb-4 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-xs text-brand-800">Create positions and assign managers to turn this into a connected reporting chart. People without managers appear at the top level.</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{roots.map((user) => <div key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><img src={user.avatar} alt="" className="h-10 w-10 rounded-xl object-cover" /><div><p className="text-xs font-bold text-slate-900">{user.name}</p><p className="text-[10px] text-slate-500">{user.role} · {user.department}</p></div></div><div className="mt-4 border-t border-slate-100 pt-3">{employees.filter((record) => record.manager_id === user.id).map((record) => <p key={record.user_id} className="py-1 text-[10px] text-slate-600">↳ {userById(record.user_id)?.name || 'Unknown employee'}{positions.find((position) => position.id === record.position_id)?.title ? ` · ${positions.find((position) => position.id === record.position_id)?.title}` : ''}</p>)}</div></div>)}</div></section>; };
