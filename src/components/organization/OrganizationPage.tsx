import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Building2, CalendarDays, CheckCircle2, ClipboardCheck, FileText,
  KeyRound, Network, Plus, Search, ShieldCheck, UserRound, Users, Upload, X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import type { SystemActivityLog, User } from '../../types';
import { DocumentSigningDialog, OrganizationDocument } from './PolicySigning';

type View = 'overview' | 'people' | 'access' | 'onboarding' | 'approvals' | 'policies' | 'audit';
type Department = { id: string; name: string; description: string | null; head_id: string | null };
type Position = { id: string; title: string; department_id: string | null; reports_to_id: string | null; status: string };
type EmployeeRecord = { user_id: string; position_id: string | null; manager_id: string | null; employment_type: string; start_date: string | null };
type Onboarding = { id: string; employee_id: string; title: string; status: string; due_date: string | null };
type Absence = { id: string; employee_id: string; leave_type: string; starts_on: string; ends_on: string; status: string };

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
    systemActivityLogs, refreshSystemActivityLogs,
  } = useWorkspace();
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [onboarding, setOnboarding] = useState<Onboarding[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
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
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) { setError('Apply the Organization Supabase migration to enable organization records. Existing staff management remains available.'); return; }
    setDepartments((results[0].data || []) as Department[]);
    setPositions((results[1].data || []) as Position[]);
    setEmployees((results[2].data || []) as EmployeeRecord[]);
    setOnboarding((results[3].data || []) as Onboarding[]);
    setAbsences((results[4].data || []) as Absence[]);
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
    {view === 'overview' && <Overview users={users} employees={employees} departments={departments} userById={userById} />}
    {view === 'people' && <People users={visibleUsers} query={query} setQuery={setQuery} selected={selected} setSelected={setSelected} updateStaffUser={updateStaffUser} manageStaffAccount={manageStaffAccount} currentUser={currentUser} userById={userById} updateManager={updateManager} />}
    {view === 'access' && <Access users={users} />}
    {view === 'onboarding' && <Onboarding users={users} onboarding={onboarding} absences={absences} userById={userById} />}
    {view === 'approvals' && <Approvals />}
    {view === 'policies' && <Policies documents={documents} user={currentUser} users={users} onChanged={loadDocuments} />}
    {view === 'audit' && <AuditLogs logs={systemActivityLogs} />}
    </div></main>;
};

const viewFromPath = (path: string): View => { const value = path.split('/')[2] as View; return nav.some((item) => item.id === value) ? value : 'overview'; };
const Overview: React.FC<{ users: User[]; employees: EmployeeRecord[]; departments: Department[]; userById: (id: string | null | undefined) => User | undefined }> = ({ users, employees, departments, userById }) => <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="People" value={String(users.length)} detail="Staff profiles" /><Metric label="Departments" value={String(departments.length)} detail="Organization teams" /><Metric label="Managers assigned" value={String(employees.filter((item) => item.manager_id).length)} detail="Reporting relationships" /><Metric label="Unassigned" value={String(users.filter((user) => !employees.find((item) => item.user_id === user.id)?.manager_id).length)} detail="Needs an organizational owner" /></div><section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Network className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-bold text-slate-900">Organization chart</h2></div><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{users.filter((user) => !employees.find((item) => item.user_id === user.id)?.manager_id).map((user) => <div key={user.id} className="rounded-xl border border-brand-200 bg-brand-50 p-4"><Person user={user} /><div className="mt-3 space-y-1 border-t border-brand-100 pt-3">{employees.filter((item) => item.manager_id === user.id).map((item) => <p key={item.user_id} className="text-[10px] text-slate-600">↳ {userById(item.user_id)?.name}</p>)}</div></div>)}</div></section></>;
const People: React.FC<{ users: User[]; query: string; setQuery: (value: string) => void; selected: User | null; setSelected: (user: User | null) => void; updateStaffUser: (id: string, updates: Partial<User>) => Promise<void>; manageStaffAccount: (id: string, action: 'suspend' | 'reactivate' | 'remove', note?: string, duration?: '1h' | '24h' | '7d' | '30d' | 'indefinite') => Promise<void>; currentUser: User; userById: (id: string | null | undefined) => User | undefined; updateManager: (user: User, managerId: string) => Promise<void> }> = ({ users, query, setQuery, selected, setSelected, updateStaffUser, manageStaffAccount, currentUser, userById, updateManager }) => <><div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, departments, or roles" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{users.map((user) => <button key={user.id} type="button" onClick={() => setSelected(user)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-300"><Person user={user} /><p className="mt-3 text-[10px] text-slate-500">{user.email}</p><p className="mt-1 text-[10px] text-slate-500">{user.accountStatus || 'active'} · reports to {userById(user.id)?.name || 'not assigned'}</p></button>)}</div>{selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-5"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><Person user={selected} /><button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-400">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Role<input defaultValue={selected.role} onBlur={(event) => updateStaffUser(selected.id, { role: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><label className="text-xs font-semibold text-slate-600">Department<input defaultValue={selected.department} onBlur={(event) => updateStaffUser(selected.id, { department: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label></div><label className="mt-4 block text-xs font-semibold text-slate-600">Manager<select defaultValue="" onChange={(event) => updateManager(selected, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="">Not assigned</option>{users.filter((user) => user.id !== selected.id).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => manageStaffAccount(selected.id, selected.accountStatus === 'suspended' ? 'reactivate' : 'suspend', `Updated by ${currentUser.name}`, '7d')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">{selected.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend access'}</button><button type="button" onClick={() => manageStaffAccount(selected.id, 'remove', `Removed by ${currentUser.name}`)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">Remove access</button></div></div></div>}</>;
const Access: React.FC<{ users: User[] }> = ({ users }) => <div className="grid gap-5 lg:grid-cols-2"><Panel title="Role templates" icon={ShieldCheck}>{['Admin', 'Team member', 'Finance reviewer', 'Scoped guest'].map((role) => <div key={role} className="border-b border-slate-100 py-3 text-xs font-semibold text-slate-700">{role}<span className="mt-1 block text-[10px] font-normal text-slate-400">View, edit, and approve permissions can be scoped by module.</span></div>)}</Panel><Panel title="People access matrix" icon={KeyRound}>{users.slice(0, 8).map((user) => <div key={user.id} className="flex items-center gap-3 border-b border-slate-100 py-3"><span className="flex-1 text-xs font-semibold text-slate-700">{user.name}</span><span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">{user.systemRole}</span></div>)}</Panel></div>;
const Onboarding: React.FC<{ users: User[]; onboarding: Onboarding[]; absences: Absence[]; userById: (id: string | null | undefined) => User | undefined }> = ({ onboarding, absences, userById }) => <div className="grid gap-5 lg:grid-cols-2"><Panel title="Onboarding & offboarding" icon={ClipboardCheck}>{onboarding.length ? onboarding.map((item) => <Row key={item.id} title={item.title} detail={`${userById(item.employee_id)?.name || 'Employee'} · ${item.status}${item.due_date ? ` · due ${item.due_date}` : ''}`} />) : <Empty text="No onboarding checklists yet." />}</Panel><Panel title="Absence & leave" icon={CalendarDays}>{absences.length ? absences.map((item) => <Row key={item.id} title={`${userById(item.employee_id)?.name || 'Employee'} · ${item.leave_type}`} detail={`${item.starts_on} to ${item.ends_on} · ${item.status}`} />) : <Empty text="No leave records yet." />}</Panel></div>;
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
    {showCreate && <DocumentEditor user={user} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await onChanged(); }} />}
  </section>;
};

const DocumentResults: React.FC<{ documents: OrganizationDocument[]; users: User[] }> = ({ documents, users }) => {
  const [responses, setResponses] = useState<Record<string, { user_id: string; response_type: string; signed_name: string | null; signed_at: string | null; acknowledged_at: string | null }[]>>({});
  useEffect(() => { void (async () => { const { data } = await supabase.from('organization_document_responses').select('document_id,user_id,response_type,signed_name,signed_at,acknowledged_at'); const grouped: typeof responses = {}; (data || []).forEach((item) => { grouped[item.document_id] = [...(grouped[item.document_id] || []), item]; }); setResponses(grouped); })(); }, []);
  return <div className="space-y-3">{documents.map((document) => <div key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900">{document.title}</h3><p className="text-[10px] text-slate-500">{document.document_type} · {responses[document.id]?.length || 0} responses</p></div><span className="text-[10px] font-semibold text-slate-500">{document.required_onboarding ? 'Onboarding item' : 'General item'}</span></div>{responses[document.id]?.length ? <div className="mt-3 space-y-2">{responses[document.id].map((response) => <div key={response.user_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-2 text-[10px]"><span className="font-semibold text-slate-700">{response.signed_name || users.find((user) => user.id === response.user_id)?.name || response.user_id}</span><span className="text-slate-500">{response.response_type} · {new Date(response.signed_at || response.acknowledged_at || '').toLocaleString()}</span></div>)}</div> : <p className="mt-3 text-xs text-slate-400">No responses yet.</p>}</div>)}</div>;
};

const DocumentEditor: React.FC<{ user: User; onClose: () => void; onSaved: () => Promise<void> }> = ({ user, onClose, onSaved }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('policy');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [requiredOnboarding, setRequiredOnboarding] = useState(false);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const save = async () => {
    if (!title.trim()) return setError('Add a document title.');
    let storagePath: string | null = null;
    if (file) { storagePath = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`; const { error: uploadError } = await supabase.storage.from('organization-documents').upload(storagePath, file); if (uploadError) return setError(uploadError.message); }
    const { error: insertError } = await supabase.from('organization_documents').insert({ title: title.trim(), document_type: type, description: description.trim() || null, content: content.trim() || null, storage_path: storagePath, required_onboarding: requiredOnboarding, requires_signature: requiresSignature, requires_acknowledgement: requiresAcknowledgement, status: 'published', created_by: user.id, published_at: new Date().toISOString() });
    if (insertError) return setError(insertError.message);
    await onSaved();
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">Create policy or resource</h2><button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="rounded-lg border border-slate-200 px-3 py-2 text-xs sm:col-span-2" /><select value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="policy">Policy</option><option value="contract">Contract</option><option value="handbook">Handbook</option><option value="form">Form</option></select><input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short description" className="min-h-16 rounded-lg border border-slate-200 px-3 py-2 text-xs sm:col-span-2" /><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Document text or instructions" className="min-h-32 rounded-lg border border-slate-200 px-3 py-2 text-xs sm:col-span-2" /></div><div className="mt-4 space-y-2 text-xs text-slate-600"><label className="flex gap-2"><input type="checkbox" checked={requiredOnboarding} onChange={(event) => setRequiredOnboarding(event.target.checked)} /> Required during onboarding and tour</label><label className="flex gap-2"><input type="checkbox" checked={requiresSignature} onChange={(event) => setRequiresSignature(event.target.checked)} /> Require drawn signature and date</label><label className="flex gap-2"><input type="checkbox" checked={requiresAcknowledgement} onChange={(event) => setRequiresAcknowledgement(event.target.checked)} /> Require acknowledgement</label></div>{error && <p className="mt-3 text-xs text-rose-700">{error}</p>}<button type="button" onClick={() => void save()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white"><Upload className="h-3.5 w-3.5" /> Publish document</button></div></div>;
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
