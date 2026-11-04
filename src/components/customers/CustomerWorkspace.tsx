import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarPlus, CheckCircle2, Clock3, Headset, ListTodo, Mail, MessageSquare, Phone, Plus, Search, StickyNote, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { PanelLayout } from '../common/PanelLayout';
import { EmptyState, ProvenanceBadge } from '../common/Feedback';
import { useConfirm } from '../common/useConfirm';

export type CrmOrg = { id: string; name: string; category: string; website: string | null; notes: string | null; owner_id: string | null; created_at: string; stage?: string };
export type CrmContact = { id: string; organization_id: string | null; name: string; role_title: string | null; email: string | null; phone: string | null };
export type CrmInteraction = { id: string; organization_id: string | null; contact_id: string | null; kind: string; subject: string; body: string | null; occurred_at: string; follow_up_at: string | null; follow_up_done: boolean };
type Conversation = { id: string; subject: string; status: string; last_message_at: string; last_message_preview: string | null; summary: unknown };

export const STAGES: [string, string, string][] = [
  ['lead', 'Lead', 'bg-slate-100 text-slate-600'],
  ['qualified', 'Qualified', 'bg-brand-50 text-brand-700'],
  ['active', 'Active', 'bg-emerald-50 text-emerald-700'],
  ['at_risk', 'At risk', 'bg-amber-50 text-amber-700'],
  ['inactive', 'Inactive', 'bg-slate-100 text-slate-400'],
];
const stageStyle = (stage?: string) => STAGES.find((item) => item[0] === stage)?.[2] ?? STAGES[0][2];
const stageLabel = (stage?: string) => STAGES.find((item) => item[0] === stage)?.[1] ?? 'Lead';
const label = (value: string) => value.replace('_', ' ').replace(/^\w/, (char) => char.toUpperCase());
const fmt = (value: string) => new Date(value).toLocaleDateString();
const daysSince = (value: string) => Math.floor((Date.now() - new Date(value).getTime()) / 86400000);

const go = (path: string) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

interface Props {
  orgs: CrmOrg[];
  contacts: CrmContact[];
  items: CrmInteraction[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  canEdit: boolean;
  canManage: boolean;
  userName: (id: string | null) => string;
  onAdd: (kind: 'org' | 'contact' | 'interaction', orgId?: string) => void;
  onMutate: (operation: PromiseLike<{ error: { message: string } | null }>) => Promise<void>;
}

export const CustomerWorkspace: React.FC<Props> = ({ orgs, contacts, items, selectedId, onSelect, canEdit, canManage, userName, onAdd, onMutate }) => {
  const { currentUser, setActiveTab } = useWorkspace();
  const { confirm, dialog } = useConfirm();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [note, setNote] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const org = orgs.find((item) => item.id === selectedId) || null;
  const orgContacts = useMemo(() => contacts.filter((contact) => contact.organization_id === org?.id), [contacts, org?.id]);
  const orgItems = useMemo(() => items.filter((item) => item.organization_id === org?.id), [items, org?.id]);
  const primary = orgContacts.find((contact) => contact.email || contact.phone) || orgContacts[0];

  useEffect(() => {
    setConversations([]);
    setDismissed([]);
    if (!org) return;
    let active = true;
    const escaped = org.name.replace(/[\\%_]/g, (char) => `\\${char}`);
    const emails = orgContacts.map((contact) => contact.email).filter((email): email is string => Boolean(email));
    void (async () => {
      const [byOrg, byEmail] = await Promise.all([
        supabase.from('support_customers').select('id').ilike('organization', escaped),
        emails.length ? supabase.from('support_customers').select('id').in('email', emails) : Promise.resolve({ data: [] as { id: string }[] }),
      ]);
      const ids = [...new Set([...(byOrg.data || []), ...(byEmail.data || [])].map((row) => row.id))];
      if (!ids.length) return;
      const { data } = await supabase.from('support_conversations').select('id,subject,status,last_message_at,last_message_preview,summary').in('customer_id', ids).order('last_message_at', { ascending: false }).limit(10);
      if (active && data) setConversations(data as Conversation[]);
    })();
    return () => { active = false; };
  }, [org, orgContacts]);

  const needle = query.trim().toLowerCase();
  const visible = orgs.filter((item) => (stage === 'all' || (item.stage ?? 'lead') === stage) && (!needle || `${item.name} ${item.website || ''}`.toLowerCase().includes(needle)));

  const timeline = useMemo(() => [
    ...orgItems.map((item) => ({ key: item.id, at: item.occurred_at, kind: item.kind, title: item.subject, body: item.body, interaction: item })),
    ...conversations.map((item) => ({ key: `c-${item.id}`, at: item.last_message_at, kind: 'conversation', title: item.subject, body: item.last_message_preview, interaction: null })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [orgItems, conversations]);

  const lastTouch = timeline[0]?.at;
  const openFollowUps = orgItems.filter((item) => item.follow_up_at && !item.follow_up_done);
  const overdueFollowUps = openFollowUps.filter((item) => new Date(item.follow_up_at as string) < new Date());

  const suggestions = useMemo(() => {
    if (!org) return [];
    const list: { id: string; text: string; action: string; run: () => void }[] = [];
    if (overdueFollowUps.length) list.push({ id: 'overdue', text: `${overdueFollowUps.length} follow-up${overdueFollowUps.length > 1 ? 's are' : ' is'} overdue.`, action: 'Create task', run: () => go(`/programs/tasks?newTask=${encodeURIComponent(`Follow up with ${org.name}`)}`) });
    if (!lastTouch || daysSince(lastTouch) > 30) list.push({ id: 'stale', text: lastTouch ? `No contact in ${daysSince(lastTouch)} days.` : 'No activity logged yet.', action: 'Log a call', run: () => onAdd('interaction', org.id) });
    if (!orgContacts.length) list.push({ id: 'contact', text: 'No contacts on file for this organization.', action: 'Add contact', run: () => onAdd('contact', org.id) });
    if ((org.stage ?? 'lead') === 'lead' && orgItems.length >= 3) list.push({ id: 'stage', text: 'Several touchpoints logged. Ready to qualify?', action: 'Mark qualified', run: () => void onMutate(supabase.from('crm_organizations').update({ stage: 'qualified' }).eq('id', org.id)) });
    return list.filter((item) => !dismissed.includes(item.id));
  }, [org, overdueFollowUps.length, lastTouch, orgContacts.length, orgItems.length, dismissed, onAdd, onMutate]);

  const addNote = async () => {
    if (!org || !note.trim()) return;
    const text = note.trim();
    await onMutate(supabase.from('crm_interactions').insert({ organization_id: org.id, kind: 'note', subject: text.split('\n')[0].slice(0, 80), body: text, owner_id: currentUser.id }));
    setNote('');
  };

  const removeInteraction = async (id: string) => {
    if (await confirm({ title: 'Delete this entry?', message: 'It will be removed from the customer history.' })) await onMutate(supabase.from('crm_interactions').delete().eq('id', id));
  };

  const list = (
    <section className="flex h-full w-full flex-col bg-white/70">
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">Companies <span className="text-slate-400">{visible.length}</span></h2>{canEdit && <button type="button" onClick={() => onAdd('org')} className="flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700"><Plus className="h-3.5 w-3.5" />New</button>}</div>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers…" aria-label="Search customers" className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-brand-400" /></div>
        <div className="flex flex-wrap gap-1">{[['all', 'All'], ...STAGES.map((item) => [item[0], item[1]])].map(([id, name]) => <button key={id} type="button" onClick={() => setStage(id)} className={`rounded-md px-2 py-0.5 text-xs font-medium ${stage === id ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{name}</button>)}</div>
      </div>
      <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {visible.length === 0 && <li className="p-3"><EmptyState icon={Building2} text="No customers match." action={canEdit ? 'Add a customer' : undefined} onClick={() => onAdd('org')} /></li>}
        {visible.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onSelect(item.id)} className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-brand-50/60 ${item.id === selectedId ? 'bg-brand-50' : ''}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700">{item.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{item.name}</span><span className="block truncate text-[11px] text-slate-400">{label(item.category)}</span></span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${stageStyle(item.stage)}`}>{stageLabel(item.stage)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  const details = org ? (
    <aside className="h-full w-full space-y-4 overflow-y-auto bg-white/70 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-sm font-bold text-brand-700">{org.name.slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{org.name}</p><p className="truncate text-xs text-slate-500">{label(org.category)}{org.website ? ` · ${org.website}` : ''}</p></div>
        <button type="button" onClick={() => onSelect(null)} aria-label="Close customer" className="rounded p-1 text-slate-400 hover:bg-slate-100 lg:hidden"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {([
          ['Call', Phone, primary?.phone ? () => { window.location.href = `tel:${primary.phone}`; } : undefined],
          ['Email', Mail, primary?.email ? () => { window.location.href = `mailto:${primary.email}`; } : undefined],
          ['Message', MessageSquare, () => go('/customers/support')],
          ['Task', ListTodo, () => go(`/programs/tasks?newTask=${encodeURIComponent(`${org.name}: `)}`)],
          ['Schedule', CalendarPlus, () => setActiveTab('calendar')],
        ] as const).map(([name, Icon, action]) => (
          <button key={name} type="button" disabled={!action} onClick={action} title={action ? name : `${name} (no contact details)`} className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white py-2 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-40"><Icon className="h-4 w-4" />{name}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
        <label>Stage<select disabled={!canEdit} value={org.stage ?? 'lead'} onChange={(event) => void onMutate(supabase.from('crm_organizations').update({ stage: event.target.value }).eq('id', org.id))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">{STAGES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <div>Relationship<p className="mt-1 rounded-lg bg-slate-50 px-2 py-1.5 font-semibold text-slate-700">{lastTouch ? (daysSince(lastTouch) <= 14 ? 'Warm' : daysSince(lastTouch) <= 45 ? 'Cooling' : 'Cold') : 'New'} <span className="font-normal text-slate-400">· {lastTouch ? `${daysSince(lastTouch)}d ago` : 'no touch'}</span></p></div>
      </div>
      <p className="text-xs text-slate-400">Owner: {userName(org.owner_id)} · Added {fmt(org.created_at)}</p>

      <div>
        <div className="mb-1.5 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Suggested next actions <ProvenanceBadge kind="automated" /></h4></div>
        {suggestions.length ? <ul className="space-y-1.5">{suggestions.map((item) => (
          <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
            <p>{item.text}</p>
            <div className="mt-1.5 flex gap-2"><button type="button" disabled={!canEdit} onClick={() => { item.run(); setDismissed((current) => [...current, item.id]); }} className="rounded-md bg-brand-600 px-2 py-0.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{item.action}</button><button type="button" onClick={() => setDismissed((current) => [...current, item.id])} className="text-slate-400 hover:underline">Dismiss</button></div>
          </li>
        ))}</ul> : <p className="text-xs text-slate-400">Nothing needs attention.</p>}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Contacts</h4>{canEdit && <button type="button" onClick={() => onAdd('contact', org.id)} className="text-xs font-semibold text-brand-700 hover:underline">Add</button>}</div>
        {orgContacts.length ? <ul className="space-y-1.5">{orgContacts.map((contact) => <li key={contact.id} className="rounded-lg border border-slate-100 p-2 text-xs"><p className="font-semibold text-slate-800">{contact.name}{contact.role_title ? <span className="font-normal text-slate-400"> · {contact.role_title}</span> : null}</p><p className="truncate text-slate-500">{[contact.email, contact.phone].filter(Boolean).join(' · ') || 'No contact details'}</p></li>)}</ul> : <p className="text-xs text-slate-400">No contacts yet.</p>}
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">Conversations</h4>
        {conversations.length ? <ul className="space-y-1.5">{conversations.slice(0, 4).map((item) => <li key={item.id}><button type="button" onClick={() => go('/customers/support')} className="w-full rounded-lg border border-slate-100 p-2 text-left text-xs hover:border-brand-200"><span className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-slate-800">{item.subject}</span><span className="shrink-0 text-[11px] capitalize text-slate-400">{item.status}</span></span><span className="mt-0.5 block truncate text-slate-500">{item.last_message_preview || 'No messages'}</span></button></li>)}</ul> : <p className="text-xs text-slate-400">No linked support conversations.</p>}
      </div>

      {org.notes && <div><h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Profile notes</h4><p className="whitespace-pre-wrap text-xs text-slate-600">{org.notes}</p></div>}

      {canManage && <button type="button" onClick={async () => { if (await confirm({ title: `Delete ${org.name}?`, message: 'Its contacts and interactions will also be removed.' })) { await onMutate(supabase.from('crm_organizations').delete().eq('id', org.id)); onSelect(null); } }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">Delete customer</button>}
    </aside>
  ) : undefined;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-white/40">
      <PanelLayout storageKey="customers" leftLabel="customers" rightLabel="customer details" leftWidth={280} rightWidth={340} showSidesOnMobile={!org} left={list} right={details}>
        {!org ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-slate-400"><Building2 className="h-7 w-7" />Select a customer to see their workspace.</div>
        ) : (
          <section className="flex h-full min-w-0 flex-1 flex-col">
            <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/70 px-4 py-2.5 pr-20">
              <button type="button" onClick={() => onSelect(null)} aria-label="Back" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"><X className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-slate-800">{org.name}</h3><p className="text-xs text-slate-500">{orgItems.length} interactions · {orgContacts.length} contacts · {conversations.length} conversations</p></div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${stageStyle(org.stage)}`}>{stageLabel(org.stage)}</span>
              {canEdit && <button type="button" onClick={() => onAdd('interaction', org.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Log interaction</button>}
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {timeline.length === 0 && <EmptyState icon={Clock3} title="No history yet" text="Notes, calls and conversations will build a timeline here." action={canEdit ? 'Log first interaction' : undefined} onClick={() => onAdd('interaction', org.id)} />}
              {timeline.map((entry) => {
                const interaction = entry.interaction;
                const Icon = entry.kind === 'conversation' ? Headset : entry.kind === 'note' ? StickyNote : entry.kind === 'email' ? Mail : entry.kind === 'call' ? Phone : Clock3;
                return (
                  <div key={entry.key} className={`flex items-start gap-3 rounded-xl border p-3 ${entry.kind === 'note' ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100 bg-white'}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800">{entry.title}</p>
                      <p className="text-[11px] text-slate-400">{entry.kind === 'conversation' ? 'Support conversation' : entry.kind === 'note' ? 'Internal note' : label(entry.kind)} · {fmt(entry.at)}</p>
                      {entry.body && entry.body !== entry.title && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-slate-600">{entry.body}</p>}
                      {interaction?.follow_up_at && <p className={`mt-1 text-xs font-semibold ${!interaction.follow_up_done && new Date(interaction.follow_up_at) < new Date() ? 'text-rose-600' : 'text-slate-400'}`}>Follow-up {fmt(interaction.follow_up_at)}{interaction.follow_up_done ? ' · done' : ''}</p>}
                    </div>
                    {canEdit && interaction?.follow_up_at && !interaction.follow_up_done && <button type="button" title="Mark follow-up done" onClick={() => void onMutate(supabase.from('crm_interactions').update({ follow_up_done: true }).eq('id', interaction.id))} className="text-emerald-600"><CheckCircle2 className="h-4 w-4" /></button>}
                    {canManage && interaction && <button type="button" title="Delete" onClick={() => void removeInteraction(interaction.id)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                );
              })}
            </div>
            {canEdit && (
              <footer className="border-t border-slate-200 bg-amber-50/50 p-3">
                <div className="flex gap-2">
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} aria-label="Internal note" placeholder="Add an internal note (only your team sees this)…" onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void addNote(); }} className="w-full resize-none rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs outline-none focus:border-amber-400" />
                  <button type="button" disabled={!note.trim()} onClick={() => void addNote()} className="self-end rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">Add note</button>
                </div>
              </footer>
            )}
          </section>
        )}
      </PanelLayout>
      {dialog}
    </div>
  );
};

export const CustomerPipeline: React.FC<{ orgs: CrmOrg[]; canEdit: boolean; onOpen: (id: string) => void; onMove: (id: string, stage: string) => void }> = ({ orgs, canEdit, onOpen, onMove }) => (
  <div className="grid flex-1 gap-3 overflow-auto p-4 md:grid-cols-3 xl:grid-cols-5">
    {STAGES.map(([id, name]) => {
      const column = orgs.filter((item) => (item.stage ?? 'lead') === id);
      return (
        <div key={id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const orgId = event.dataTransfer.getData('text/plain'); if (canEdit && orgId) onMove(orgId, id); }} className="min-h-40 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
          <p className="mb-2 flex items-center justify-between px-1 text-xs font-bold text-slate-600">{name}<span className="text-slate-400">{column.length}</span></p>
          <div className="space-y-1.5">
            {column.map((item) => <button key={item.id} type="button" draggable={canEdit} onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)} onClick={() => onOpen(item.id)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:border-brand-300"><span className="block truncate text-xs font-semibold text-slate-800">{item.name}</span><span className="text-[11px] text-slate-400">{label(item.category)}</span></button>)}
            {column.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-slate-400">Drop customers here</p>}
          </div>
        </div>
      );
    })}
  </div>
);
