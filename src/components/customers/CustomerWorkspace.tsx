import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, Mail, Plus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppAccess } from '../../lib/useAppAccess';
import { useWorkspace } from '../../context/WorkspaceContext';
import { userFacingError } from '../../lib/userFacingError';
import { navigate } from '../../lib/navigate';

export type CrmOrg = { id: string; name: string; category: string; website: string | null; notes: string | null; owner_id: string | null; created_at: string; stage?: string; industry?: string | null; address?: string | null; phone?: string | null };
export type CrmContact = { id: string; organization_id: string | null; name: string; role_title: string | null; email: string | null; phone: string | null; notes?: string | null; owner_id?: string | null };
export type CrmInteraction = { id: string; organization_id: string | null; contact_id: string | null; kind: string; subject: string; body: string | null; occurred_at: string; follow_up_at: string | null; follow_up_done: boolean; owner_id?: string | null };
export type CrmDeal = { id: string; organization_id: string; name: string; amount: number | null; currency: string; stage: string; expected_close: string | null; notes: string | null; owner_id: string | null; created_at: string };
type Kind = 'org' | 'contact' | 'interaction' | 'deal';
type RecordRow = CrmOrg | CrmContact | CrmInteraction | CrmDeal;
type LinkedRecord = { id: string; title: string; status: string; path: string; at?: string; preview?: string | null };
const fmt = (date: string) => new Date(date).toLocaleDateString();
const button = 'workspace-control inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const panel = 'workspace-panel rounded-xl border border-slate-200 bg-white';
const label = (value: string) => value.replace(/_/g, ' ');
const websiteUrl = (value: string) => {
  try { const url = new URL(value.includes('://') ? value : `https://${value}`); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

interface Props {
  orgs: CrmOrg[]; contacts: CrmContact[]; items: CrmInteraction[]; deals: CrmDeal[];
  selectedId: string | null; focusedContactId?: string | null; onSelect: (id: string | null) => void; canEdit: boolean; canManage: boolean;
  onAdd: (kind: Kind, orgId?: string) => void; onEdit: (kind: Kind, row: RecordRow) => void;
  onRemove: (kind: Kind, row: { id: string; name?: string }) => void;
  onMutate: (operation: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
}

export const CustomerWorkspace: React.FC<Props> = ({ orgs, contacts, items, deals, selectedId, focusedContactId, onSelect, canEdit, canManage, onAdd, onEdit, onRemove, onMutate }) => {
  const { currentUser, users } = useWorkspace();
  const supportAccess = useAppAccess('support');
  const financeAccess = useAppAccess('finance');
  const wildfireAccess = useAppAccess('wildfire');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'customer' | 'funder'>('customer');
  const [section, setSection] = useState<'activity' | 'contacts' | 'opportunities' | 'records'>('contacts');
  const [linked, setLinked] = useState<LinkedRecord[]>([]);
  const [linkedError, setLinkedError] = useState('');
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [unlinked, setUnlinked] = useState(false);
  const org = orgs.find((row) => row.id === selectedId);
  const selectedCategory = org?.category;
  const orgContacts = contacts.filter((contact) => contact.organization_id === selectedId);
  const contactIds = new Set(orgContacts.map((contact) => contact.id));
  const history = items.filter((item) => item.organization_id === selectedId || !!item.contact_id && contactIds.has(item.contact_id)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const openFollowUps = history.filter((item) => item.follow_up_at && !item.follow_up_done).sort((a, b) => a.follow_up_at!.localeCompare(b.follow_up_at!));
  const companyDeals = deals.filter((deal) => deal.organization_id === selectedId);
  const person = (id?: string | null) => users.find((user) => user.id === id)?.name || 'Unassigned';
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orgs.filter((row) => (category === 'funder' ? row.category === 'funder' : row.category !== 'funder')
      && (!needle || `${row.name} ${row.website || ''} ${contacts.filter((contact) => contact.organization_id === row.id).map((contact) => `${contact.name} ${contact.email || ''}`).join(' ')}`.toLowerCase().includes(needle)));
  }, [orgs, contacts, category, query]);
  const orphanContacts = contacts.filter((contact) => !contact.organization_id);

  useEffect(() => { setNote(''); setLinked([]); setLinkedError(''); }, [selectedId]);
  useEffect(() => {
    if (selectedCategory) setCategory(selectedCategory === 'funder' ? 'funder' : 'customer');
  }, [selectedCategory, selectedId]);
  useEffect(() => {
    if (focusedContactId) { setUnlinked(!selectedId); setSection('contacts'); }
  }, [focusedContactId, selectedId]);
  useEffect(() => {
    if (!org) return;
    let active = true;
    setLinkedLoading(true);
    setLinkedError('');
    void (async () => {
      try {
        const records: LinkedRecord[] = [];
        const contracts = await supabase.from('customer_contracts').select('id,name,status').eq('organization_id', org.id).order('updated_at', { ascending: false });
        if (contracts.error) throw contracts.error;
        records.push(...(contracts.data || []).map((row) => ({ id: `contract-${row.id}`, title: row.name, status: row.status, path: `/customers/contracts?contract=${row.id}` })));
        if (financeAccess.canView) {
          const grants = await supabase.from('grants').select('id,name,stage').eq('funder_org_id', org.id);
          if (grants.error) throw grants.error;
          records.push(...(grants.data || []).map((row) => ({ id: `grant-${row.id}`, title: row.name, status: row.stage, path: `/company/grants/${row.id}` })));
        }
        if (supportAccess.canView) {
          const contactResult = orgContacts.length ? await supabase.from('support_customers').select('id').in('crm_contact_id', orgContacts.map((row) => row.id)) : { data: [], error: null };
          if (contactResult.error) throw contactResult.error;
          const byOrg = await supabase.from('support_customers').select('id').ilike('organization', org.name.replace(/[\\%_]/g, (char) => `\\${char}`));
          if (byOrg.error) throw byOrg.error;
          const ids = [...new Set([...(contactResult.data || []), ...(byOrg.data || [])].map((row) => row.id))];
          if (ids.length) {
            const conversations = await supabase.from('support_conversations').select('id,subject,status,last_message_at,last_message_preview').in('customer_id', ids).order('last_message_at', { ascending: false });
            if (conversations.error) throw conversations.error;
            records.push(...(conversations.data || []).map((row) => ({ id: `support-${row.id}`, title: row.subject, status: row.status, path: `/customers/support?conversation=${row.id}`, at: row.last_message_at, preview: row.last_message_preview })));
          }
        }
        if (wildfireAccess.canView) {
          const opportunities = await supabase.from('wildfire_opportunities').select('id,name,stage').eq('organization_id', org.id);
          if (opportunities.error) throw opportunities.error;
          records.push(...(opportunities.data || []).map((row) => ({ id: `wildfire-${row.id}`, title: row.name, status: row.stage, path: '/wildfire/opportunities' })));
        }
        if (active) setLinked(records);
      } catch (cause) {
        if (active) setLinkedError(userFacingError(cause, 'Linked records could not be loaded.'));
      } finally { if (active) setLinkedLoading(false); }
    })();
    return () => { active = false; };
  }, [org, contacts, financeAccess.canView, supportAccess.canView, wildfireAccess.canView]);

  const selectCompany = (id: string) => {
    onSelect(id); setUnlinked(false);
    const company = orgs.find((entry) => entry.id === id);
    setCategory(company?.category === 'funder' ? 'funder' : 'customer');
  };
  const actions = (kind: Kind, row: RecordRow) => <div className="flex shrink-0 gap-3 text-sm">
    {canEdit && <button type="button" onClick={() => onEdit(kind, row)} className="text-brand-600 hover:underline">Edit</button>}
    {canManage && <button type="button" onClick={() => onRemove(kind, row)} className="text-slate-500 hover:text-rose-600">Delete</button>}
  </div>;
  const contactCard = (contact: CrmContact) => <article key={contact.id} className={`${panel} space-y-3 ${contact.id === focusedContactId ? 'ring-2 ring-brand-500' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900">{contact.name}</h3>{contact.role_title && <p className="text-sm text-slate-500">{contact.role_title}</p>}</div>{actions('contact', contact)}</div>
    <div className="space-y-1 text-sm text-slate-700">{contact.email && <a className="block break-all hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.phone && <a className="block hover:underline" href={`tel:${contact.phone}`}>{contact.phone}</a>}{!contact.email && !contact.phone && <p className="text-slate-500">No contact details</p>}</div>
    {contact.notes && <p className="whitespace-pre-wrap text-sm text-slate-500">{contact.notes}</p>}
    <p className="text-xs text-slate-500">Owner: {person(contact.owner_id)}</p>
    {canEdit && contact.organization_id && <button type="button" className="text-sm text-brand-600 hover:underline" onClick={() => { setSection('activity'); onAdd('interaction', contact.organization_id!); }}>Log activity</button>}
  </article>;

  return <>
    <header className="workspace-page-header flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
      <h1 className="text-xl font-bold text-slate-900">Companies</h1>
      {canEdit && <button type="button" className="workspace-control inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700" onClick={() => onAdd('org')}><Plus className="h-4 w-4" />New company</button>}
    </header>
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className={`${org || unlinked ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col border-r border-slate-200 lg:w-72`}>
        <div className="space-y-3 p-4">
          <div className="flex gap-2" role="tablist" aria-label="Company relationship">
            {(['customer', 'funder'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={category === value} onClick={() => { setCategory(value); onSelect(null); setUnlinked(false); }} className={`${button} flex-1 ${category === value ? 'bg-slate-100 font-semibold' : ''}`}>{value === 'customer' ? 'Customers' : 'Funders'}</button>)}
          </div>
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search companies and contacts" placeholder="Search companies or contacts" className="workspace-control w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" /></label>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">{visible.map((row) => <li key={row.id}><button type="button" aria-current={row.id === selectedId ? 'page' : undefined} onClick={() => selectCompany(row.id)} className={`w-full px-4 py-4 text-left hover:bg-slate-50 ${row.id === selectedId ? 'bg-slate-100' : ''}`}><span className="block font-medium text-slate-900">{row.name}</span><span className="mt-1 block text-xs text-slate-500">{contacts.filter((contact) => contact.organization_id === row.id).length} contacts · {person(row.owner_id)}</span></button></li>)}
          {!visible.length && <li className="p-4 text-sm text-slate-500">No {category === 'funder' ? 'funders' : 'customers'} match.</li>}
        </ul>
        {orphanContacts.length > 0 && <button type="button" className="border-t border-slate-200 p-4 text-left text-sm text-slate-500 hover:bg-slate-50" onClick={() => { onSelect(null); setUnlinked(true); }}>Unlinked contacts ({orphanContacts.length})</button>}
      </aside>
      <section className={`${org || unlinked ? 'block' : 'hidden lg:flex'} min-w-0 flex-1 overflow-y-auto`}>
        {unlinked ? <div className="workspace-page-body space-y-4"><button type="button" className={button} onClick={() => setUnlinked(false)}><ArrowLeft className="h-4 w-4" />Companies</button><h2 className="text-lg font-semibold">Unlinked contacts</h2><p className="text-sm text-slate-500">Edit a contact to assign their company.</p><div className="grid gap-4 xl:grid-cols-2">{orphanContacts.map(contactCard)}</div></div>
          : !org ? <div className="m-auto p-8 text-center text-sm text-slate-500"><Building2 className="mx-auto mb-3 h-7 w-7" />Choose a company to see contacts, activity, and opportunities.</div>
            : <div className="workspace-page-body mx-auto max-w-6xl space-y-5">
              <button type="button" className={`${button} lg:hidden`} onClick={() => onSelect(null)}><ArrowLeft className="h-4 w-4" />Companies</button>
              <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-900">{org.name}</h2><p className="mt-1 text-sm text-slate-500">{org.category === 'funder' ? 'Funder' : 'Customer'} · {person(org.owner_id)}{org.industry ? ` · ${org.industry}` : ''}</p></div>{actions('org', org)}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">{org.website && (websiteUrl(org.website) ? <a href={websiteUrl(org.website)!} target="_blank" rel="noreferrer" className="break-all hover:underline">{org.website}</a> : <span>{org.website}</span>)}{org.phone && <a href={`tel:${org.phone}`}>{org.phone}</a>}{org.address && <p className="whitespace-pre-wrap">{org.address}</p>}</div>
              {org.notes && <p className="whitespace-pre-wrap text-sm text-slate-600">{org.notes}</p>}
              {openFollowUps.length > 0 && <section className={`${panel} space-y-3`}><h3 className="font-semibold text-slate-900">Upcoming follow-ups</h3>{openFollowUps.map((item) => <div key={item.id} className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-800">{item.subject}</p><p className={`text-xs ${new Date(item.follow_up_at!) < new Date() ? 'text-rose-600' : 'text-slate-500'}`}>{fmt(item.follow_up_at!)} · {person(item.owner_id)}</p></div>{canEdit && <button type="button" title="Complete follow-up" aria-label={`Complete ${item.subject}`} className={button} onClick={() => void onMutate(supabase.from('crm_interactions').update({ follow_up_done: true }).eq('id', item.id).select('id').single())}><CheckCircle2 className="h-4 w-4" /></button>}</div>)}</section>}
              <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Company details">{([['contacts', 'Company contacts'], ['activity', 'Activity'], ['opportunities', org.category === 'funder' ? 'Funding opportunities' : 'Deals'], ['records', 'Linked records']] as const).map(([key, title]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => setSection(key)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium ${section === key ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500'}`}>{title}</button>)}</nav>
              {section === 'contacts' && <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Company contacts</h3>{canEdit && <button type="button" className={button} onClick={() => onAdd('contact', org.id)}><Plus className="h-4 w-4" />Add contact</button>}</div><div className="grid gap-4 xl:grid-cols-2">{orgContacts.map(contactCard)}</div>{!orgContacts.length && <p className="text-sm text-slate-500">No company contacts yet.</p>}</section>}
              {section === 'opportunities' && <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{org.category === 'funder' ? 'Funding opportunities' : 'Deals'}</h3>{canEdit && <button type="button" className={button} onClick={() => onAdd('deal', org.id)}><Plus className="h-4 w-4" />Add opportunity</button>}</div>{companyDeals.map((deal) => <article key={deal.id} className={`${panel} space-y-2`}><div className="flex flex-wrap justify-between gap-3"><h4 className="font-semibold">{deal.name}</h4>{actions('deal', deal)}</div><p className="text-sm text-slate-700">{deal.amount == null ? 'Amount not set' : `${deal.currency} ${Number(deal.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} · {label(deal.stage)}{deal.expected_close ? ` · ${fmt(`${deal.expected_close}T12:00:00`)}` : ''}</p><p className="text-xs text-slate-500">Owner: {person(deal.owner_id)}</p>{deal.notes && <p className="whitespace-pre-wrap text-sm text-slate-500">{deal.notes}</p>}</article>)}{!companyDeals.length && <p className="text-sm text-slate-500">No opportunities tracked yet.</p>}</section>}
              {section === 'activity' && <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Activity</h3>{canEdit && <button type="button" className={button} onClick={() => onAdd('interaction', org.id)}><Plus className="h-4 w-4" />Log activity</button>}</div>
                {canEdit && <form className={`${panel} flex flex-wrap gap-3`} onSubmit={async (event) => { event.preventDefault(); if (!note.trim() || savingNote) return; setSavingNote(true); try { if (await onMutate(supabase.from('crm_interactions').insert({ organization_id: org.id, kind: 'note', subject: note.trim().split('\n')[0].slice(0, 80), body: note.trim(), owner_id: currentUser.id }).select('id').single())) setNote(''); } finally { setSavingNote(false); } }}><textarea aria-label="Internal note" required rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note…" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3 text-sm" /><button type="submit" disabled={!note.trim() || savingNote} className={`${button} self-end`}>{savingNote ? 'Saving…' : 'Add note'}</button></form>}
                {history.map((item) => <article key={item.id} className={`${panel} space-y-2`}><div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium text-slate-900">{item.subject}</h4>{actions('interaction', item)}</div><p className="text-xs capitalize text-slate-500">{label(item.kind)} · {fmt(item.occurred_at)} · {person(item.owner_id)}{item.contact_id ? ` · ${contacts.find((contact) => contact.id === item.contact_id)?.name || 'Contact'}` : ''}</p>{item.body && <p className="whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>}</article>)}
                {linked.filter((record) => record.at).map((record) => <button key={record.id} type="button" className={`${panel} block w-full space-y-2 text-left hover:bg-slate-50`} onClick={() => navigate(record.path)}><span className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4" />{record.title}</span><span className="block text-xs text-slate-500">Support · {fmt(record.at!)} · {record.status}</span>{record.preview && <span className="block text-sm text-slate-600">{record.preview}</span>}</button>)}
                {!history.length && !linked.some((record) => record.at) && <p className="text-sm text-slate-500">No activity yet.</p>}
              </section>}
              {(section === 'records' || section === 'activity') && linkedError && <p role="alert" className="text-sm text-rose-600">{linkedError}</p>}
              {section === 'records' && <section className="space-y-3"><h3 className="font-semibold">Contracts, support, and grants</h3>{linkedLoading ? <p className="text-sm text-slate-500">Loading linked records…</p> : linked.map((record) => <button key={record.id} type="button" onClick={() => navigate(record.path)} className={`${panel} flex w-full flex-wrap justify-between gap-2 text-left hover:bg-slate-50`}><span className="text-sm font-medium">{record.title}</span><span className="text-sm capitalize text-slate-500">{label(record.status)}</span></button>)}{!linkedLoading && !linkedError && !linked.length && <p className="text-sm text-slate-500">No linked records.</p>}</section>}
            </div>}
      </section>
    </div>
  </>;
};
