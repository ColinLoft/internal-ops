import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Building2, CalendarDays, CheckCircle2, ClipboardCheck, FileText,
  KeyRound, Network, Plus, Search, ShieldCheck, UserRound, Users, X, GraduationCap,
  BriefcaseBusiness, ChevronDown, ChevronRight, List, Mail, MapPin,
  Phone, RotateCcw, SlidersHorizontal, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import type { SystemActivityLog, User } from '../../types';
import { DocumentSigningDialog, OrganizationDocument } from './PolicySigning';
import { LeaveRequestModal } from './LeaveRequestModal';

type View = 'overview' | 'people' | 'access' | 'onboarding' | 'approvals' | 'policies' | 'audit';
type Department = { id: string; name: string; description: string | null; head_id: string | null };
type Position = { id: string; title: string; department_id: string | null; reports_to_id: string | null; status: string };
type EmployeeRecord = { user_id: string; position_id: string | null; manager_id: string | null; employment_type: string; start_date: string | null };
type Onboarding = { id: string; employee_id: string; title: string; status: string; due_date: string | null };
type Absence = { id: string; employee_id: string; leave_type: string; starts_on: string; ends_on: string; status: string };
type OnboardingTask = { id: string; employee_id: string; title: string; task_type: string; status: string; due_date: string | null; notes: string | null; completed_at: string | null };
type LeaveRequest = { id: string; employee_id: string; leave_type: string; starts_on: string; ends_on: string; reason: string | null; status: string; reviewed_at: string | null };

const nav: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview & chart', icon: Network },
  { id: 'people', label: 'People & teams', icon: Users },
  { id: 'access', label: 'Roles & access', icon: ShieldCheck },
  { id: 'onboarding', label: 'Onboarding & leave', icon: ClipboardCheck },
  { id: 'approvals', label: 'Approvals', icon: CheckCircle2 },
  { id: 'policies', label: 'Policies & resources', icon: FileText },
  { id: 'audit', label: 'Audit logs', icon: Activity },
];

export const OrganizationPage: React.FC = () => {
  const {
    users, currentUser, setIsAddTeammateOpen, updateStaffUser, manageStaffAccount,
    systemActivityLogs, refreshSystemActivityLogs, addNotification,
  } = useWorkspace();
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [onboarding, setOnboarding] = useState<Onboarding[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<User | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const results = await Promise.all([
      supabase.from('organization_departments').select('id,name,description,head_id').order('name'),
      supabase.from('organization_positions').select('id,title,department_id,reports_to_id,status').order('title'),
      supabase.from('organization_employee_records').select('user_id,position_id,manager_id,employment_type,start_date'),
      supabase.from('organization_onboarding').select('id,employee_id,title,status,due_date').order('created_at', { ascending: false }),
      supabase.from('organization_absences').select('id,employee_id,leave_type,starts_on,ends_on,status').order('starts_on'),
      supabase.from('organization_onboarding_tasks').select('id,employee_id,title,task_type,status,due_date,notes,completed_at').order('due_date'),
      supabase.from('organization_leave_requests').select('id,employee_id,leave_type,starts_on,ends_on,reason,status,reviewed_at').order('created_at', { ascending: false }),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) { setError('Apply the Organization Supabase migration to enable organization records. Existing staff management remains available.'); return; }
    setDepartments((results[0].data || []) as Department[]);
    setPositions((results[1].data || []) as Position[]);
    setEmployees((results[2].data || []) as EmployeeRecord[]);
    setOnboarding((results[3].data || []) as Onboarding[]);
    setAbsences((results[4].data || []) as Absence[]);
    setTasks((results[5].data || []) as OnboardingTask[]);
    setLeaveRequests((results[6].data || []) as LeaveRequest[]);
  };
  const loadDocuments = async () => {
    const { data, error: documentError } = await supabase.from('organization_documents').select('*').order('created_at', { ascending: false });
    if (!documentError) setDocuments((data || []) as OrganizationDocument[]);
  };
  useEffect(() => { void load(); void loadDocuments(); refreshSystemActivityLogs().catch(() => undefined); const onRoute = () => setView(viewFromPath(window.location.pathname)); window.addEventListener('popstate', onRoute); return () => window.removeEventListener('popstate', onRoute); }, [refreshSystemActivityLogs]);
  const navigate = (next: View) => { window.history.pushState({}, '', next === 'overview' ? '/organization' : `/organization/${next}`); setView(next); };
  const userById = (id: string | null | undefined) => users.find((user) => user.id === id);
  const visibleUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.department} ${user.role}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  const updateManager = async (user: User, managerId: string) => {
    const { error: updateError } = await supabase.from('organization_employee_records').upsert({ user_id: user.id, manager_id: managerId || null });
    if (updateError) setError(updateError.message); else await load();
  };

  return <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]"><header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">People and structure</p><h1 className="mt-1 text-xl font-bold text-slate-900">{nav.find((item) => item.id === view)?.label}</h1><p className="mt-1 text-xs text-slate-500">Manage personnel, departments, leadership, access, onboarding, and organizational operations.</p></div>{view === 'people' && <button type="button" onClick={() => setIsAddTeammateOpen(true)} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> Invite staff</button>}</div></header><div className="mx-auto max-w-7xl p-5 sm:p-8">{error && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>}
    {view === 'overview' && <Overview users={users} employees={employees} departments={departments} userById={userById} onAddStaff={() => setIsAddTeammateOpen(true)} />}
    {view === 'people' && <People users={visibleUsers} query={query} setQuery={setQuery} selected={selected} setSelected={setSelected} updateStaffUser={updateStaffUser} manageStaffAccount={manageStaffAccount} currentUser={currentUser} userById={userById} updateManager={updateManager} />}
    {view === 'access' && <Access users={users} />}
    {view === 'onboarding' && <Onboarding users={users} currentUser={currentUser} onboarding={onboarding} tasks={tasks} absences={absences} leaveRequests={leaveRequests} userById={userById} addNotification={addNotification} onChanged={load} />}
    {view === 'approvals' && <Approvals />}
    {view === 'policies' && <Policies documents={documents} user={currentUser} users={users} onChanged={loadDocuments} />}
    {view === 'audit' && <AuditLogs logs={systemActivityLogs} />}
    </div></main>;
};

const viewFromPath = (path: string): View => { const value = path.split('/')[2] as View; return nav.some((item) => item.id === value) ? value : 'overview'; };
const Overview: React.FC<{ users: User[]; employees: EmployeeRecord[]; departments: Department[]; userById: (id: string | null | undefined) => User | undefined; onAddStaff: () => void }> = ({ users, employees, departments, userById, onAddStaff }) => {
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(100);
  const [layout, setLayout] = useState<'chart' | 'list'>('chart');
  const employeeByUser = useMemo(() => new Map(employees.map((employee) => [employee.user_id, employee])), [employees]);
  const childrenByManager = useMemo(() => {
    const map = new Map<string, User[]>();
    employees.forEach((employee) => {
      if (!employee.manager_id) return;
      const user = userById(employee.user_id);
      if (!user) return;
      map.set(employee.manager_id, [...(map.get(employee.manager_id) || []), user]);
    });
    return map;
  }, [employees, userById]);
  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchesQuery = `${user.name} ${user.email} ${user.role} ${user.department}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (department === 'all' || user.department === department) && (status === 'all' || user.status === status);
  }), [users, query, department, status]);
  const filteredIds = useMemo(() => new Set(filteredUsers.map((user) => user.id)), [filteredUsers]);
  const roots = filteredUsers.filter((user) => !employeeByUser.get(user.id)?.manager_id || !filteredIds.has(employeeByUser.get(user.id)?.manager_id || ''));
  const selected = selectedId ? userById(selectedId) : undefined;
  const manager = selected ? userById(employeeByUser.get(selected.id)?.manager_id) : undefined;
  const directReports = selected ? (childrenByManager.get(selected.id) || []).filter((user) => filteredIds.has(user.id)) : [];
  const toggleCollapsed = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const resetView = () => { setQuery(''); setDepartment('all'); setStatus('all'); setCollapsed(new Set()); setZoom(100); setSelectedId(null); };
  const activeCount = users.filter((user) => user.status === 'online').length;
  const unassignedCount = users.filter((user) => !employeeByUser.get(user.id)?.manager_id).length;
  const renderBranch = (user: User, level = 0): React.ReactNode => {
    const reports = (childrenByManager.get(user.id) || []).filter((child) => filteredIds.has(child.id));
    const isCollapsed = collapsed.has(user.id);
    return <div key={user.id} className="min-w-[220px]">
      <button type="button" onClick={() => setSelectedId(user.id)} className={`group w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md ${selectedId === user.id ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200'}`}>
        <div className="flex items-start gap-3"><Avatar user={user} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900">{user.name}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{user.role || 'Team member'}</span><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700"><span className={`h-1.5 w-1.5 rounded-full ${user.status === 'online' ? 'bg-emerald-500' : user.status === 'busy' ? 'bg-amber-500' : 'bg-slate-300'}`} />{user.department || 'Unassigned'}</span></span></div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400"><span>{reports.length ? `${reports.length} direct report${reports.length === 1 ? '' : 's'}` : 'No direct reports'}</span>{reports.length > 0 && <span onClick={(event) => { event.stopPropagation(); toggleCollapsed(user.id); }} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-brand-700 hover:bg-brand-50">{isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}{isCollapsed ? 'Expand' : 'Collapse'}</span>}</div>
      </button>
      {!isCollapsed && reports.length > 0 && <div className="ml-5 mt-3 border-l-2 border-brand-100 pl-5"><div className="grid gap-3">{reports.map((child) => renderBranch(child, level + 1))}</div></div>}
    </div>;
  };
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="People" value={String(users.length)} detail={`${activeCount} online now`} />
      <Metric label="Departments" value={String(departments.length)} detail="Organization teams" />
      <Metric label="Reporting lines" value={String(employees.filter((item) => item.manager_id).length)} detail="Managers assigned" />
      <Metric label="Needs attention" value={String(unassignedCount)} detail="People without a manager" />
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2"><div className="rounded-lg bg-brand-50 p-2 text-brand-700"><Network className="h-4 w-4" /></div><div><h2 className="text-sm font-bold text-slate-900">Organization chart</h2><p className="mt-0.5 text-[11px] text-slate-500">Explore reporting lines, teams, and organizational ownership.</p></div></div></div>
          <div className="flex items-center gap-2"><button type="button" onClick={onAddStaff} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700"><Plus className="h-3.5 w-3.5" /> Add employee</button><div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1"><button type="button" onClick={() => setLayout('chart')} className={`rounded-md p-1.5 ${layout === 'chart' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`} aria-label="Chart view"><Network className="h-4 w-4" /></button><button type="button" onClick={() => setLayout('list')} className={`rounded-md p-1.5 ${layout === 'list' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`} aria-label="List view"><List className="h-4 w-4" /></button></div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search an employee, role, or team" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-400 focus:bg-white" /></div>
          <label className="relative"><SlidersHorizontal className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><select value={department} onChange={(event) => setDepartment(event.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs"><option value="all">All departments</option>{[...new Set(users.map((user) => user.department).filter(Boolean))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="all">All statuses</option><option value="online">Online</option><option value="busy">Busy</option><option value="away">Away</option><option value="offline">Offline</option></select>
          <button type="button" onClick={resetView} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
        </div>
      </div>
      <div className="bg-[#f8fafc] p-4 sm:p-6">
        {layout === 'chart' ? <div className="overflow-auto rounded-xl border border-slate-200 bg-[radial-gradient(#d7dee9_1px,transparent_1px)] [background-size:18px_18px] p-5" style={{ maxHeight: '620px' }}><div className="origin-top-left space-y-4" style={{ transform: `scale(${zoom / 100})`, width: `${100 / (zoom / 100)}%` }}><div className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />Leadership and reporting structure<span className="h-px flex-1 bg-slate-200" /></div>{roots.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{roots.map((user) => renderBranch(user))}</div> : <EmptyChart query={query} />}</div></div> : <div className="grid gap-2">{filteredUsers.map((user) => <button type="button" key={user.id} onClick={() => setSelectedId(user.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-brand-300"><Avatar user={user} /><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-900">{user.name}</span><span className="block text-[10px] text-slate-500">{user.role || 'Team member'} · {user.department || 'Unassigned'}</span></span><span className="text-[10px] text-slate-400">{childrenByManager.get(user.id)?.length || 0} reports</span><ChevronRight className="h-4 w-4 text-slate-300" /></button>)}</div>}
        <div className="mt-4 flex items-center justify-between"><p className="text-[10px] text-slate-400">{filteredUsers.length} of {users.length} people shown</p><div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"><button type="button" onClick={() => setZoom((value) => Math.max(70, value - 10))} className="rounded p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></button><span className="min-w-10 text-center text-[10px] font-semibold text-slate-600">{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(130, value + 10))} className="rounded p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></button></div></div>
      </div>
    </section>
    {selected && <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-sm border-l border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Profile overview</p><button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50" aria-label="Close profile"><X className="h-4 w-4" /></button></div><div className="mt-6 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white"><Avatar user={selected} large /><h3 className="mt-4 text-lg font-bold">{selected.name}</h3><p className="mt-1 text-xs text-brand-100">{selected.role || 'Team member'} · {selected.department || 'Unassigned'}</p><p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold capitalize"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{selected.status}</p></div><div className="mt-5 space-y-3 text-xs text-slate-600"><Detail icon={Mail} value={selected.email} /><Detail icon={Phone} value={selected.phone || 'No phone listed'} /><Detail icon={MapPin} value={selected.location || 'No location listed'} /><Detail icon={BriefcaseBusiness} value={manager ? `Reports to ${manager.name}` : 'No manager assigned'} /></div><div className="mt-6 rounded-xl border border-slate-200 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Direct reports</p>{directReports.length ? <div className="mt-3 space-y-2">{directReports.map((report) => <button type="button" key={report.id} onClick={() => setSelectedId(report.id)} className="flex w-full items-center gap-2 rounded-lg p-1 text-left hover:bg-slate-50"><Avatar user={report} /><span className="text-xs font-semibold text-slate-700">{report.name}</span></button>)}</div> : <p className="mt-2 text-xs text-slate-500">No direct reports.</p>}</div></aside>}
  </div>;
};
const Avatar: React.FC<{ user: User; large?: boolean }> = ({ user, large }) => <div className={`relative shrink-0 ${large ? 'h-16 w-16' : 'h-9 w-9'}`}><img src={user.avatar} alt="" className={`${large ? 'h-16 w-16 rounded-2xl' : 'h-9 w-9 rounded-lg'} object-cover ring-2 ring-white/60`} /><span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${user.status === 'online' ? 'bg-emerald-500' : user.status === 'busy' ? 'bg-amber-500' : user.status === 'away' ? 'bg-sky-500' : 'bg-slate-300'}`} /></div>;
const Detail: React.FC<{ icon: React.ElementType; value: string }> = ({ icon: Icon, value }) => <p className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-brand-600" />{value}</p>;
const EmptyChart: React.FC<{ query: string }> = ({ query }) => <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><Network className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No people match this view</p><p className="mt-1 text-xs text-slate-500">{query ? 'Try a different search or reset your filters.' : 'Add staff to start building your organization chart.'}</p></div>;
const People: React.FC<{ users: User[]; query: string; setQuery: (value: string) => void; selected: User | null; setSelected: (user: User | null) => void; updateStaffUser: (id: string, updates: Partial<User>) => Promise<void>; manageStaffAccount: (id: string, action: 'suspend' | 'reactivate' | 'remove', note?: string, duration?: '1h' | '24h' | '7d' | '30d' | 'indefinite') => Promise<void>; currentUser: User; userById: (id: string | null | undefined) => User | undefined; updateManager: (user: User, managerId: string) => Promise<void> }> = ({ users, query, setQuery, selected, setSelected, updateStaffUser, manageStaffAccount, currentUser, userById, updateManager }) => {
  const [form, setForm] = useState<Partial<User>>({});
  const [managerId, setManagerId] = useState('');
  const [employmentType, setEmploymentType] = useState('staff');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const openEditor = (user: User) => {
    setSelected(user);
    setForm({ name: user.name, email: user.email, role: user.role, department: user.department, phone: user.phone, location: user.location || '', bio: user.bio || '', status: user.status, statusMessage: user.statusMessage || '', banner: user.banner, systemRole: user.systemRole });
    setManagerId('');
    setError('');
  };
  const save = async () => {
    if (!selected || !form.name?.trim()) return setError('Name is required.');
    setSaving(true);
    setError('');
    try {
      await updateStaffUser(selected.id, form);
      const { error: recordError } = await supabase.from('organization_employee_records').upsert({ user_id: selected.id, manager_id: managerId || null, employment_type: employmentType, start_date: startDate || null, notes: notes || null });
      if (recordError) throw recordError;
      setSelected(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Staff details could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  const field = (label: string, key: keyof User, type = 'text') => <label className="text-xs font-semibold text-slate-600">{label}<input type={type} value={String(form[key] || '')} onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>;
  return <><div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, departments, or roles" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{users.map((user) => <button key={user.id} type="button" onClick={() => openEditor(user)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-300"><Person user={user} /><p className="mt-3 text-[10px] text-slate-500">{user.email}</p><p className="mt-1 text-[10px] text-slate-500">{user.accountStatus || 'active'} · reports to {userById(user.id)?.name || 'not assigned'}</p></button>)}</div>{selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-5"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><Person user={selected} /><button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-400">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{field('Full name', 'name')}{field('Email', 'email', 'email')}{field('Role / position', 'role')}{field('Department', 'department')}{field('Phone', 'phone')}{field('Location', 'location')}{field('Status message', 'statusMessage')}<label className="text-xs font-semibold text-slate-600">Presence<select value={String(form.status || 'offline')} onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value as User['status'] }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="online">Online</option><option value="busy">Busy</option><option value="away">Away</option><option value="offline">Offline</option></select></label><label className="text-xs font-semibold text-slate-600">Workspace role<select value={String(form.systemRole || 'member')} onChange={(event) => setForm((previous) => ({ ...previous, systemRole: event.target.value as User['systemRole'] }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="admin">Admin</option><option value="coordinator">Coordinator</option><option value="member">Member</option></select></label></div><label className="mt-3 block text-xs font-semibold text-slate-600">Bio<textarea value={String(form.bio || '')} onChange={(event) => setForm((previous) => ({ ...previous, bio: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Manager<select value={managerId} onChange={(event) => setManagerId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="">Not assigned</option>{users.filter((user) => user.id !== selected.id).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Employment type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="staff">Staff</option><option value="contractor">Contractor</option><option value="volunteer">Volunteer</option><option value="intern">Intern</option></select></label><label className="text-xs font-semibold text-slate-600">Employment start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><label className="text-xs font-semibold text-slate-600">Employment notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label></div>{error && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}<div className="mt-5 flex flex-wrap justify-between gap-2"><div className="flex gap-2"><button type="button" onClick={() => void manageStaffAccount(selected.id, selected.accountStatus === 'suspended' ? 'reactivate' : 'suspend', `Updated by ${currentUser.name}`, '7d')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">{selected.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend access'}</button><button type="button" onClick={() => void manageStaffAccount(selected.id, 'remove', `Removed by ${currentUser.name}`)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">Remove access</button></div><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save staff changes'}</button></div></div></div>}</>;
};
const Access: React.FC<{ users: User[] }> = ({ users }) => <div className="grid gap-5 lg:grid-cols-2"><Panel title="Role templates" icon={ShieldCheck}>{['Admin', 'Team member', 'Finance reviewer', 'Scoped guest'].map((role) => <div key={role} className="border-b border-slate-100 py-3 text-xs font-semibold text-slate-700">{role}<span className="mt-1 block text-[10px] font-normal text-slate-400">View, edit, and approve permissions can be scoped by module.</span></div>)}</Panel><Panel title="People access matrix" icon={KeyRound}>{users.slice(0, 8).map((user) => <div key={user.id} className="flex items-center gap-3 border-b border-slate-100 py-3"><span className="flex-1 text-xs font-semibold text-slate-700">{user.name}</span><span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">{user.systemRole}</span></div>)}</Panel></div>;
const Onboarding: React.FC<{ users: User[]; currentUser: User; onboarding: Onboarding[]; tasks: OnboardingTask[]; absences: Absence[]; leaveRequests: LeaveRequest[]; userById: (id: string | null | undefined) => User | undefined; addNotification: (notification: Omit<import('../../types').NotificationItem, 'id' | 'timestamp' | 'isRead'>) => void; onChanged: () => Promise<void> }> = ({ users, currentUser, onboarding, tasks, absences, leaveRequests, userById, addNotification, onChanged }) => {
  const [tab, setTab] = useState<'onboarding' | 'leave'>('onboarding');
  const [showLeave, setShowLeave] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(currentUser.id);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState('checklist');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const isAdmin = currentUser.systemRole === 'admin';
  const createTask = async () => {
    if (!taskTitle.trim() || !selectedEmployee) return setError('Choose an employee and task title.');
    const { error: saveError } = await supabase.from('organization_onboarding_tasks').insert({ employee_id: selectedEmployee, title: taskTitle.trim(), task_type: taskType, due_date: dueDate || null });
    if (saveError) return setError(saveError.message);
    setShowTask(false); setTaskTitle(''); setError(''); await onChanged();
  };
  const reviewLeave = async (request: LeaveRequest, status: 'approved' | 'denied') => {
    const { error: reviewError } = await supabase.from('organization_leave_requests').update({ status, reviewed_at: new Date().toISOString() }).eq('id', request.id);
    if (reviewError) setError(reviewError.message); else await onChanged();
  };
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">Onboarding & leave</h2><p className="mt-1 text-xs text-slate-500">Manage onboarding progress, required work, and time away for the team.</p></div><div className="flex gap-2"><button type="button" onClick={() => setShowLeave(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">Request leave</button>{isAdmin && <button type="button" onClick={() => setShowTask(true)} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add onboarding task</button>}</div></div>
    <div className="flex gap-2 border-b border-slate-200"><button type="button" onClick={() => setTab('onboarding')} className={`border-b-2 px-3 py-2 text-xs font-bold ${tab === 'onboarding' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>Onboarding workspace</button><button type="button" onClick={() => setTab('leave')} className={`border-b-2 px-3 py-2 text-xs font-bold ${tab === 'leave' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>Leave calendar & requests</button></div>
    {tab === 'onboarding' ? <div className="grid gap-5 lg:grid-cols-2"><Panel title="Progress & required work" icon={ClipboardCheck}>{tasks.length ? <div className="space-y-2">{tasks.map((task) => <Row key={task.id} title={`${userById(task.employee_id)?.name || 'Employee'} · ${task.title}`} detail={`${task.task_type} · ${task.status}${task.due_date ? ` · due ${task.due_date}` : ''}`} />)}</div> : <Empty text="No onboarding tasks yet." />}</Panel><Panel title="Documents, training & milestones" icon={GraduationCap}>{onboarding.length ? onboarding.map((item) => <Row key={item.id} title={item.title} detail={`${userById(item.employee_id)?.name || 'Employee'} · ${item.status}${item.due_date ? ` · due ${item.due_date}` : ''}`} />) : <Empty text="Required documents and milestones will appear here." />}</Panel><Panel title="Offboarding checklist" icon={ClipboardCheck}><Empty text="No offboarding tasks are open." /></Panel><Panel title="Existing leave records" icon={CalendarDays}>{absences.length ? absences.map((item) => <Row key={item.id} title={`${userById(item.employee_id)?.name || 'Employee'} · ${item.leave_type}`} detail={`${item.starts_on} to ${item.ends_on} · ${item.status}`} />) : <Empty text="No leave records yet." />}</Panel></div> : <div className="grid gap-5 lg:grid-cols-2"><Panel title="Leave requests" icon={CalendarDays}>{leaveRequests.length ? leaveRequests.map((request) => <div key={request.id} className="border-b border-slate-100 py-3 last:border-0"><Row title={`${userById(request.employee_id)?.name || 'Employee'} · ${request.leave_type}`} detail={`${request.starts_on} to ${request.ends_on} · ${request.status}`} />{isAdmin && request.status === 'pending' && <div className="mt-2 flex gap-2"><button type="button" onClick={() => void reviewLeave(request, 'approved')} className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">Approve</button><button type="button" onClick={() => void reviewLeave(request, 'denied')} className="rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white">Deny</button></div>}</div>) : <Empty text="No leave requests yet." />}</Panel><Panel title="Team leave calendar" icon={CalendarDays}><div className="space-y-2">{leaveRequests.filter((request) => request.status === 'approved').map((request) => <Row key={request.id} title={`${userById(request.employee_id)?.name || 'Employee'} is out`} detail={`${request.starts_on} to ${request.ends_on} · ${request.leave_type}`} />)}</div></Panel></div>}
    {showLeave && <LeaveRequestModal userId={selectedEmployee} addNotification={addNotification} onClose={() => setShowLeave(false)} onSubmitted={() => void onChanged()} />}
    {showTask && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><h3 className="text-lg font-bold text-slate-900">Add onboarding task</h3><button type="button" onClick={() => setShowTask(false)}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 space-y-3"><select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs">{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Task title" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /><select value={taskType} onChange={(event) => setTaskType(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="checklist">Checklist</option><option value="training">Training</option><option value="equipment">Equipment / setup</option><option value="milestone">30/60/90-day milestone</option><option value="offboarding">Offboarding</option><option value="document">Required document</option></select><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />{error && <p className="text-xs text-rose-700">{error}</p>}<button type="button" onClick={() => void createTask()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">Create task</button></div></div></div>}
  </section>;
};
const Approvals: React.FC = () => <Panel title="Approvals" icon={CheckCircle2}><Empty text="No pending organization approvals. Approval workflows for access changes, sensitive exports, and spend requests will appear here." /></Panel>;
const Policies: React.FC<{ documents: OrganizationDocument[]; user: User; users: User[]; onChanged: () => Promise<void> }> = ({ documents, user, users, onChanged }) => {
  const [tab, setTab] = useState<'library' | 'results'>('library');
  const [selected, setSelected] = useState<OrganizationDocument | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const isAdmin = user.systemRole === 'admin';
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">Policies & resources</h2><p className="mt-1 text-xs text-slate-500">Create, publish, sign, and acknowledge company documents without leaving Organization.</p></div>{isAdmin && <button type="button" onClick={() => setShowCreate(true)} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> New document</button>}</div>
    <div className="flex gap-2 border-b border-slate-200"><button type="button" onClick={() => setTab('library')} className={`border-b-2 px-3 py-2 text-xs font-bold ${tab === 'library' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>Document library</button>{isAdmin && <button type="button" onClick={() => setTab('results')} className={`border-b-2 px-3 py-2 text-xs font-bold ${tab === 'results' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>Signed & acknowledged results</button>}</div>
    {tab === 'library' ? <div className="grid gap-3 md:grid-cols-2">{documents.filter((document) => document.status !== 'archived').map((document) => <button key={document.id} type="button" onClick={() => setSelected(document)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-300"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-brand-600">{document.document_type} · v{document.version}</p><h3 className="mt-1 text-sm font-bold text-slate-900">{document.title}</h3></div>{document.required_onboarding && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">Onboarding</span>}</div><p className="mt-2 line-clamp-2 text-xs text-slate-500">{document.description || document.content || 'Open document'}</p><p className="mt-3 text-[10px] font-semibold text-slate-400">{document.requires_signature ? 'Signature required' : 'Acknowledgement required'}</p></button>)}{!documents.length && <div className="md:col-span-2"><Panel title="Document library" icon={FileText}><Empty text="No policies or resources have been published yet." /></Panel></div>}</div> : <DocumentResults documents={documents} users={users} />}
    {selected && <DocumentSigningDialog document={selected} userId={user.id} onClose={() => setSelected(null)} onComplete={() => { setSelected(null); }} />}
    {showCreate && <DocumentEditor user={user} users={users} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await onChanged(); }} />}
  </section>;
};

const DocumentResults: React.FC<{ documents: OrganizationDocument[]; users: User[] }> = ({ documents, users }) => {
  const [responses, setResponses] = useState<Record<string, { user_id: string; response_type: string; signed_name: string | null; signed_at: string | null; acknowledged_at: string | null }[]>>({});
  useEffect(() => { void (async () => { const { data } = await supabase.from('organization_document_responses').select('document_id,user_id,response_type,signed_name,signed_at,acknowledged_at'); const grouped: typeof responses = {}; (data || []).forEach((item) => { grouped[item.document_id] = [...(grouped[item.document_id] || []), item]; }); setResponses(grouped); })(); }, []);
  return <div className="space-y-3">{documents.map((document) => <div key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900">{document.title}</h3><p className="text-[10px] text-slate-500">{document.document_type} · {responses[document.id]?.length || 0} responses</p></div><span className="text-[10px] font-semibold text-slate-500">{document.required_onboarding ? 'Onboarding item' : 'General item'}</span></div>{responses[document.id]?.length ? <div className="mt-3 space-y-2">{responses[document.id].map((response) => <div key={response.user_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-2 text-[10px]"><span className="font-semibold text-slate-700">{response.signed_name || users.find((user) => user.id === response.user_id)?.name || response.user_id}</span><span className="text-slate-500">{response.response_type} · {new Date(response.signed_at || response.acknowledged_at || '').toLocaleString()}</span></div>)}</div> : <p className="mt-3 text-xs text-slate-400">No responses yet.</p>}</div>)}</div>;
};

const DocumentEditor: React.FC<{ user: User; users: User[]; onClose: () => void; onSaved: () => Promise<void> }> = ({ user, users, onClose, onSaved }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('policy');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [requiredOnboarding, setRequiredOnboarding] = useState(false);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(true);
  const [preview, setPreview] = useState(false);
  const [assignedUsers, setAssignedUsers] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const save = async () => {
    if (!title.trim()) return setError('Add a document title.');
    if (type === 'contract' && !content.trim()) return setError('Add the contract terms before publishing.');
    let storagePath: string | null = null;
    if (file && type !== 'contract') { storagePath = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`; const { error: uploadError } = await supabase.storage.from('organization-documents').upload(storagePath, file); if (uploadError) return setError(uploadError.message); }
    const { data: document, error: insertError } = await supabase.from('organization_documents').insert({ title: title.trim(), document_type: type, description: description.trim() || null, content: content.trim() || null, storage_path: storagePath, required_onboarding: requiredOnboarding, requires_signature: requiresSignature, requires_acknowledgement: requiresAcknowledgement, status: 'published', created_by: user.id, published_at: new Date().toISOString() }).select('id').single();
    if (insertError || !document) return setError(insertError?.message || 'The document could not be published.');
    if (type === 'contract' && assignedUsers.length) {
      const { error: assignmentError } = await supabase.from('organization_document_assignments').insert(assignedUsers.map((userId) => ({ document_id: document.id, user_id: userId, assigned_by: user.id })));
      if (assignmentError) return setError(assignmentError.message);
    }
    await onSaved();
  };
  const renderedContent = content
    .replaceAll('{{employee_name}}', 'Jordan Lee')
    .replaceAll('{{employee_role}}', 'Program Manager')
    .replaceAll('{{department}}', 'Programs')
    .replaceAll('{{start_date}}', 'November 1, 2026')
    .replaceAll('{{manager_name}}', 'Colin Loftus')
    .replaceAll('{{effective_date}}', new Date().toLocaleDateString());
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Create {type === 'contract' ? 'contract' : 'policy or resource'}</h2><p className="text-xs text-slate-500">Write it here and preview exactly what staff will read.</p></div><button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 flex gap-2 border-b border-slate-200"><button type="button" onClick={() => setPreview(false)} className={`px-3 py-2 text-xs font-bold ${!preview ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500'}`}>Editor</button><button type="button" onClick={() => setPreview(true)} className={`px-3 py-2 text-xs font-bold ${preview ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500'}`}>Preview</button></div>{preview ? <div className="mt-4 rounded-xl border border-slate-200 bg-white p-8"><p className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{type} · Company document</p><h1 className="mt-3 text-center text-2xl font-bold text-slate-900">{title || 'Untitled document'}</h1>{description && <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-500">{description}</p>}<div className="mx-auto mt-8 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-slate-700">{renderedContent || 'Your contract preview will appear here.'}</div>{type === 'contract' && <div className="mx-auto mt-10 grid max-w-3xl gap-8 border-t border-slate-200 pt-6 sm:grid-cols-2"><div><p className="text-xs font-bold text-slate-700">Employee signature</p><div className="mt-8 border-b border-slate-400" /><p className="mt-2 text-[10px] text-slate-500">Name and date</p></div><div><p className="text-xs font-bold text-slate-700">Company representative</p><div className="mt-8 border-b border-slate-400" /><p className="mt-2 text-[10px] text-slate-500">Name and date</p></div></div>}</div> : <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-3"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /><select value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="policy">Policy</option><option value="contract">Contract</option><option value="handbook">Handbook</option><option value="form">Form</option></select><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short description" className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /><div className="flex flex-wrap gap-1">{['{{employee_name}}', '{{employee_role}}', '{{department}}', '{{start_date}}', '{{manager_name}}', '{{effective_date}}'].map((token) => <button key={token} type="button" onClick={() => setContent((value) => `${value}${value ? '\n' : ''}${token}`)} className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-700">{token}</button>)}</div><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write the contract terms, clauses, and sections here..." className="min-h-64 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs leading-6" /></div><div className="space-y-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600"><label className="flex gap-2"><input type="checkbox" checked={requiredOnboarding} onChange={(event) => setRequiredOnboarding(event.target.checked)} /> Required during onboarding and tour</label><label className="flex gap-2"><input type="checkbox" checked={requiresSignature} onChange={(event) => setRequiresSignature(event.target.checked)} /> Require drawn signature and date</label><label className="flex gap-2"><input type="checkbox" checked={requiresAcknowledgement} onChange={(event) => setRequiresAcknowledgement(event.target.checked)} /> Require acknowledgement</label>{type === 'contract' && <label className="block">Send to staff<select multiple value={assignedUsers} onChange={(event) => setAssignedUsers(Array.from(event.target.selectedOptions, (option) => option.value))} className="mt-1 h-28 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs">{users.filter((item) => item.id !== user.id).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select><span className="mt-1 block text-[10px] text-slate-400">Selected staff will see a sign-and-read prompt the next time they load the app.</span></label>}{type !== 'contract' && <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-[10px]" />}</div></div>}{error && <p className="mt-3 text-xs text-rose-700">{error}</p>}<button type="button" onClick={() => void save()} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">{type === 'contract' ? 'Publish and send contract' : 'Publish document'}</button></div></div>;
};
const AuditLogs: React.FC<{ logs: SystemActivityLog[] }> = ({ logs }) => {
  const [query, setQuery] = useState('');
  const [eventType, setEventType] = useState('all');
  const [actor, setActor] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const eventTypes = useMemo(() => [...new Set(logs.map((log) => log.event_type))].sort(), [logs]);
  const actors = useMemo(() => [...new Set(logs.map((log) => log.actor_name))].sort(), [logs]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((log) => {
      const searchable = [
        log.id, log.actor_name, log.event_type, log.target_type || '', log.target_id || '',
        log.target_name || '', log.summary, JSON.stringify(log.metadata),
      ].join(' ').toLowerCase();
      return (eventType === 'all' || log.event_type === eventType)
        && (actor === 'all' || log.actor_name === actor)
        && (!needle || searchable.includes(needle));
    });
  }, [actor, eventType, logs, query]);
  const metadataValue = (log: SystemActivityLog, key: string) => {
    const value = log.metadata?.[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  };
  return <section className="space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-bold text-slate-900">Organization audit logs</h2></div><p className="mt-1 text-xs text-slate-500">A complete record of who did what, where, and when across the company.</p></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{filtered.length} of {logs.length} events</span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tracking number, person, action, target, or details..." className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-400" /></label>
        <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><option value="all">All actions</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
        <select value={actor} onChange={(event) => setActor(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><option value="all">All people</option>{actors.map((name) => <option key={name} value={name}>{name}</option>)}</select>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {filtered.length ? filtered.map((log) => {
        const location = metadataValue(log, 'location') || metadataValue(log, 'source') || 'Workspace';
        const trackingNumber = log.id;
        return <div key={log.id} className="border-b border-slate-100 p-4 last:border-0">
          <button type="button" onClick={() => setExpanded(expanded === log.id ? null : log.id)} className="w-full text-left">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-900">{log.summary}</p><p className="mt-1 text-[10px] text-slate-500">{log.actor_name} · {log.event_type}{log.target_name ? ` · ${log.target_name}` : ''}</p></div>
              <div className="text-right text-[10px] text-slate-500"><p>{new Date(log.created_at).toLocaleString()}</p><p className="mt-1 font-mono text-[9px] text-slate-400">#{trackingNumber}</p></div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500"><span className="rounded-full bg-slate-100 px-2 py-1">Where: {location}</span>{log.target_id && <span className="rounded-full bg-slate-100 px-2 py-1">Target: {log.target_id}</span>}</div>
          </button>
          {expanded === log.id && <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-5 text-slate-200">{JSON.stringify({ trackingNumber, actor: { id: log.actor_id, name: log.actor_name }, action: log.event_type, target: { type: log.target_type, id: log.target_id, name: log.target_name }, occurredAt: log.created_at, location, metadata: log.metadata }, null, 2)}</pre>}
        </div>;
      }) : <div className="p-8 text-center text-xs text-slate-500">No audit events match these filters.</div>}
    </div>
  </section>;
};
const Person: React.FC<{ user: User }> = ({ user }) => <div className="flex items-center gap-3"><img src={user.avatar} alt="" className="h-10 w-10 rounded-xl object-cover" /><div><p className="text-xs font-bold text-slate-900">{user.name}</p><p className="text-[10px] text-slate-500">{user.role} · {user.department}</p></div></div>;
const Panel: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Icon className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-bold text-slate-900">{title}</h2></div>{children}</section>;
const Row: React.FC<{ title: string; detail: string }> = ({ title, detail }) => <div className="border-b border-slate-100 py-3"><p className="text-xs font-semibold text-slate-700">{title}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div>;
const Empty: React.FC<{ text: string }> = ({ text }) => <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">{text}</div>;
const Metric: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-brand-700">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
