import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { card, field } from '../work/EntityPanels';
import { Grant, askGrantAi, daysFromNow, dueTone, goTo } from './grantShared';

type Contact = { id: string; crm_contact_id: string | null; name: string; role: string | null; title: string | null; email: string | null; phone: string | null; is_primary: boolean; notes: string | null };
type CrmContact = { id: string; name: string; role_title: string | null; email: string | null; phone: string | null };
type Requirement = { id: string; title: string; kind: string | null; status: string; due_date: string | null; assignee_id: string | null; notes: string | null; position: number };

const label = 'text-xs font-semibold text-slate-500';

export const KeyDates: React.FC<{ grant: Grant }> = ({ grant }) => {
  const items = [
    ['Applied', grant.application_submitted_at], ['Decision expected', grant.decision_due_at], ['Decision', grant.decision_at], ['Awarded', grant.award_date],
    ['Term starts', grant.term_start], ['Term ends', grant.term_end], ['Follow up', grant.next_follow_up_at?.slice(0, 10)],
  ].filter((item): item is [string, string] => Boolean(item[1])).sort((a, b) => a[1].localeCompare(b[1]));
  if (!items.length) return null;
  return (
    <div className={`${card} overflow-x-auto`}><ol className="flex min-w-max items-start gap-0">{items.map(([name, date], index) => { const days = daysFromNow(date); const past = days != null && days < 0; return (
      <li key={name} className="flex items-start"><div className="w-28 text-center"><span className={`mx-auto mb-1 block h-3 w-3 rounded-full ${past ? 'bg-brand-600' : 'border-2 border-brand-400 bg-white'}`} /><p className="text-xs font-semibold text-slate-800">{name}</p><p className={`text-xs ${past ? 'text-slate-400' : dueTone(date)}`}>{date}</p></div>{index < items.length - 1 && <span className="mt-1.5 block h-0.5 w-6 bg-slate-200" />}</li>
    ); })}</ol></div>
  );
};

export const PeopleTab: React.FC<{ grant: Grant; onError: (message: string) => void; onGrantChange: (values: Partial<Grant>) => void }> = ({ grant, onError, onGrantChange }) => {
  const { currentUser } = useWorkspace();
  const [rows, setRows] = useState<Contact[]>([]);
  const [crm, setCrm] = useState<CrmContact[]>([]);
  const [draft, setDraft] = useState({ name: '', role: '', title: '', email: '', phone: '' });
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('grant_contacts').select('*').eq('grant_id', grant.id).order('is_primary', { ascending: false }).order('created_at');
    if (error) onError(error.message); else setRows((data || []) as Contact[]);
    if (grant.funder_org_id) { const result = await supabase.from('crm_contacts').select('id,name,role_title,email,phone').eq('organization_id', grant.funder_org_id).order('name'); setCrm((result.data || []) as CrmContact[]); } else setCrm([]);
  }, [grant.id, grant.funder_org_id, onError]);
  useEffect(() => { void load(); }, [load]);

  const add = async (values: Partial<Contact>) => {
    const { error } = await supabase.from('grant_contacts').insert({ grant_id: grant.id, is_primary: rows.length === 0, ...values });
    if (error) onError(error.message); else { setDraft({ name: '', role: '', title: '', email: '', phone: '' }); await load(); }
  };
  const makePrimary = async (row: Contact) => {
    await supabase.from('grant_contacts').update({ is_primary: false }).eq('grant_id', grant.id);
    await supabase.from('grant_contacts').update({ is_primary: true }).eq('id', row.id);
    onGrantChange({ contact_name: row.name, contact_email: row.email, contact_phone: row.phone });
    await load();
  };
  const saveToCrm = async (row: Contact) => {
    if (!grant.funder_org_id) { onError('Link a funder organization on the Overview tab first.'); return; }
    const { data, error } = await supabase.from('crm_contacts').insert({ organization_id: grant.funder_org_id, name: row.name, role_title: row.title || row.role, email: row.email, phone: row.phone, owner_id: currentUser.id, created_by: currentUser.id }).select('id').single();
    if (error || !data) { onError(error?.message || 'Could not save to the CRM.'); return; }
    await supabase.from('grant_contacts').update({ crm_contact_id: data.id }).eq('id', row.id);
    await load();
  };
  const linked = new Set(rows.map((row) => row.crm_contact_id));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${card} space-y-2`}>
        <h3 className="text-sm font-bold text-slate-900">Points of contact</h3>
        <ul className="space-y-2">{rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-slate-100 p-3 text-xs">
            <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-slate-800">{row.name}{row.is_primary && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">Primary</span>}</p><p className="text-slate-500">{[row.title, row.role].filter(Boolean).join(' · ')}</p>{row.email && <a href={`mailto:${row.email}`} className="block text-brand-600">{row.email}</a>}{row.phone && <p className="text-slate-500">{row.phone}</p>}</div>
              <button type="button" aria-label="Remove contact" onClick={() => void supabase.from('grant_contacts').delete().eq('id', row.id).then(() => load())} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>
            <div className="mt-2 flex flex-wrap gap-3 font-bold">{!row.is_primary && <button type="button" onClick={() => void makePrimary(row)} className="inline-flex items-center gap-1 text-slate-600 hover:text-brand-600"><Star className="h-3 w-3" />Make primary</button>}{!row.crm_contact_id && <button type="button" onClick={() => void saveToCrm(row)} className="text-brand-600">Save to CRM</button>}{row.crm_contact_id && <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="h-3 w-3" />In CRM</span>}</div>
          </li>
        ))}{!rows.length && <li className="text-xs text-slate-400">No contacts yet. Add everyone you talk to at the funder: program officer, finance contact, board liaison.</li>}</ul>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name" className={field} />
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Title" className={field} />
          <input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} placeholder="Role (program officer…)" className={field} />
          <input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="Email" className={field} />
          <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Phone" className={field} />
        </div>
        <button type="button" disabled={!draft.name.trim()} onClick={() => void add({ name: draft.name.trim(), role: draft.role || null, title: draft.title || null, email: draft.email.trim().toLowerCase() || null, phone: draft.phone || null })} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add contact</button>
      </section>
      <section className={`${card} space-y-2`}>
        <h3 className="text-sm font-bold text-slate-900">From the CRM</h3>
        {grant.funder_org_id ? <ul className="space-y-1">{crm.filter((row) => !linked.has(row.id)).map((row) => <li key={row.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs"><span><span className="font-semibold text-slate-800">{row.name}</span><span className="block text-slate-500">{row.role_title || row.email}</span></span><button type="button" onClick={() => void add({ crm_contact_id: row.id, name: row.name, title: row.role_title, email: row.email, phone: row.phone })} className="font-bold text-brand-600">Add</button></li>)}{!crm.filter((row) => !linked.has(row.id)).length && <li className="text-xs text-slate-400">No other CRM contacts at this funder.</li>}</ul> : <p className="text-xs text-slate-400">Link a funder organization on the Overview tab to pull in its CRM contacts.</p>}
      </section>
    </div>
  );
};

export const RequirementsTab: React.FC<{ grantId: string; userName: (id: string | null) => string; users: { id: string; name: string }[]; onError: (message: string) => void }> = ({ grantId, users, onError }) => {
  const [rows, setRows] = useState<Requirement[]>([]);
  const [title, setTitle] = useState('');
  const load = useCallback(async () => { const { data, error } = await supabase.from('grant_requirements').select('*').eq('grant_id', grantId).order('position').order('created_at'); if (error) onError(error.message); else setRows((data || []) as Requirement[]); }, [grantId, onError]);
  useEffect(() => { void load(); }, [load]);
  const update = async (id: string, values: Partial<Requirement>) => { setRows((current) => current.map((row) => (row.id === id ? { ...row, ...values } : row))); const { error } = await supabase.from('grant_requirements').update(values).eq('id', id); if (error) onError(error.message); };
  const add = async () => { if (!title.trim()) return; const { error } = await supabase.from('grant_requirements').insert({ grant_id: grantId, title: title.trim(), position: rows.length + 1 }); if (error) onError(error.message); else { setTitle(''); await load(); } };
  const done = rows.filter((row) => ['done', 'na'].includes(row.status)).length;
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Application requirements</h3><span className="text-xs text-slate-500">{done} of {rows.length} complete</span></div>
      {rows.length > 0 && <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500" style={{ width: `${(done / rows.length) * 100}%` }} /></div>}
      <ul className="space-y-2">{rows.map((row) => (
        <li key={row.id} className="rounded-xl border border-slate-100 p-3">
          <div className="flex items-center gap-2"><input type="checkbox" aria-label="Done" checked={row.status === 'done'} onChange={(event) => void update(row.id, { status: event.target.checked ? 'done' : 'todo' })} className="h-4 w-4" /><span className={`flex-1 text-xs font-semibold ${row.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{row.title}</span><button type="button" aria-label="Delete requirement" onClick={() => void supabase.from('grant_requirements').delete().eq('id', row.id).then(() => load())} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <select aria-label="Status" value={row.status} onChange={(event) => void update(row.id, { status: event.target.value })} className={field}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="na">Not needed</option></select>
            <input type="date" aria-label="Due" value={row.due_date || ''} onChange={(event) => void update(row.id, { due_date: event.target.value || null })} className={field} />
            <select aria-label="Assignee" value={row.assignee_id || ''} onChange={(event) => void update(row.id, { assignee_id: event.target.value || null })} className={field}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
          </div>
        </li>
      ))}{!rows.length && <li className="text-xs text-slate-400">Add the narrative, budget, attachments, letters and forms the funder asks for.</li>}</ul>
      <div className="flex gap-2"><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add(); }} placeholder="Add a requirement (e.g. Project narrative, 990, Board list)" className={field} /><button type="button" onClick={() => void add()} className="rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">Add</button></div>
    </section>
  );
};

const DRAFTS = [['follow_up_email', 'Follow-up email'], ['thank_you', 'Thank-you note'], ['decline_feedback', 'Request feedback after decline'], ['check_in', 'Relationship check-in'], ['report_summary', 'Report summary'], ['application_section', 'Application section']] as const;

export const AiTab: React.FC<{ grantId: string; onSaveDraft: (title: string, body: string) => Promise<boolean> }> = ({ grantId, onSaveDraft }) => {
  const [kind, setKind] = useState<string>('follow_up_email');
  const [instructions, setInstructions] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const run = async (action: 'summarize' | 'draft') => {
    setBusy(action); setError('');
    try { const result = await askGrantAi<{ text?: string }>({ action, grantId, kind, instructions }); setOutput(result.text || ''); }
    catch (e) { setError(e instanceof Error ? e.message : 'AI request failed.'); } finally { setBusy(''); }
  };
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600" /><h3 className="text-sm font-bold text-slate-900">AI assistant</h3></div>
      <p className="text-xs text-slate-500">Uses this grant's details, timeline and your saved boilerplate. Always review before sending.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>Draft type<select value={kind} onChange={(event) => setKind(event.target.value)} className={field}>{DRAFTS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label className={label}>Instructions (optional)<input value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Tone, points to mention…" className={field} /></label>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => void run('draft')} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{busy === 'draft' ? 'Drafting…' : 'Draft'}</button><button type="button" disabled={Boolean(busy)} onClick={() => void run('summarize')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-60">{busy === 'summarize' ? 'Summarizing…' : 'Summarize this grant'}</button></div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      {output && <><textarea value={output} onChange={(event) => setOutput(event.target.value)} rows={12} className={field} aria-label="AI output" /><div className="flex gap-3 text-xs font-bold"><button type="button" onClick={async () => { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 text-slate-600"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy'}</button><button type="button" onClick={() => void onSaveDraft(DRAFTS.find(([value]) => value === kind)?.[1] || 'AI draft', output)} className="text-brand-600">Save to timeline</button></div></>}
    </section>
  );
};

export const FunderPicker: React.FC<{ grant: Grant; onLink: (values: Partial<Grant>) => void; onError: (message: string) => void }> = ({ grant, onLink, onError }) => {
  const { currentUser } = useWorkspace();
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { void supabase.from('crm_organizations').select('id,name').order('name').then(({ data }) => setOrgs((data || []) as { id: string; name: string }[])); }, []);
  const createFromName = async () => {
    if (!grant.funder_name?.trim()) { onError('Enter a funder name first.'); return; }
    const { data, error } = await supabase.from('crm_organizations').insert({ name: grant.funder_name.trim(), category: 'funder', website: grant.website_url, owner_id: currentUser.id, created_by: currentUser.id }).select('id,name').single();
    if (error || !data) { onError(error?.message || 'Could not create the CRM organization.'); return; }
    setOrgs((current) => [...current, data as { id: string; name: string }]);
    onLink({ funder_org_id: data.id });
  };
  return (
    <div className="space-y-1"><label className={label}>CRM funder organization<select value={grant.funder_org_id || ''} onChange={(event) => onLink({ funder_org_id: event.target.value || null })} className={field}><option value="">Not linked</option>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      {!grant.funder_org_id && <button type="button" onClick={() => void createFromName()} className="text-xs font-bold text-brand-600">Create a CRM funder from this name</button>}</div>
  );
};

export const UpcomingDates: React.FC<{ grants: Grant[] }> = ({ grants }) => {
  const [reports, setReports] = useState<{ grant_id: string; title: string; due_date: string | null; status: string }[]>([]);
  const [prospects, setProspects] = useState<{ name: string; deadline: string | null; status: string }[]>([]);
  useEffect(() => {
    void supabase.from('grant_reports').select('grant_id,title,due_date,status').in('status', ['upcoming', 'overdue']).then(({ data }) => setReports(data || []));
    void supabase.from('grant_prospects').select('name,deadline,status').in('status', ['new', 'reviewing', 'pursuing']).not('deadline', 'is', null).then(({ data }) => setProspects(data || []));
  }, []);
  const items: { date: string; label: string; kind: string; path: string }[] = [];
  prospects.forEach((row) => row.deadline && items.push({ date: row.deadline, label: row.name, kind: 'Application deadline', path: '/finance/prospects' }));
  reports.forEach((row) => row.due_date && items.push({ date: row.due_date, label: `${row.title} — ${grants.find((g) => g.id === row.grant_id)?.name || ''}`, kind: 'Report due', path: `/finance/grants/${row.grant_id}` }));
  grants.forEach((g) => {
    if (g.decision_due_at && g.stage === 'applied') items.push({ date: g.decision_due_at, label: g.name, kind: 'Decision expected', path: `/finance/grants/${g.id}` });
    if (g.next_follow_up_at && !['declined', 'closed'].includes(g.stage)) items.push({ date: g.next_follow_up_at.slice(0, 10), label: g.name, kind: 'Follow up', path: `/finance/grants/${g.id}` });
    if (g.term_end && ['awarded', 'reporting'].includes(g.stage)) items.push({ date: g.term_end, label: g.name, kind: 'Grant term ends', path: `/finance/grants/${g.id}` });
  });
  const shown = items.filter((item) => (daysFromNow(item.date) ?? 999) <= 45).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  if (!shown.length) return null;
  return (
    <section className={card}><h2 className="mb-2 text-sm font-bold text-slate-900">Upcoming dates</h2>
      <ul className="divide-y divide-slate-100">{shown.map((item, index) => { const days = daysFromNow(item.date); return <li key={index}><button type="button" onClick={() => goTo(item.path)} className="flex w-full items-center justify-between gap-3 py-2 text-left text-xs"><span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{item.label}</span><span className="text-slate-400">{item.kind}</span></span><span className={`shrink-0 text-right ${dueTone(item.date)}`}>{item.date}<span className="block">{days == null ? '' : days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : `in ${days}d`}</span></span></button></li>; })}</ul>
    </section>
  );
};
