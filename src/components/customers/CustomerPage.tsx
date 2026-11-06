import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Search, Trash2, X, Clock3, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppAccess } from '../../lib/useAppAccess';
import { useWorkspace } from '../../context/WorkspaceContext';
import { SupportPage } from '../support/SupportPage';
import { CustomerPipeline, CustomerWorkspace } from './CustomerWorkspace';
import { ContractSuite } from './ContractSuite';
import { CardSkeleton } from '../common/Feedback';
import { useConfirm } from '../common/useConfirm';

type View = 'overview' | 'contacts' | 'organizations' | 'pipeline' | 'activity' | 'support' | 'contracts';
type Org = { id: string; name: string; category: string; website: string | null; notes: string | null; owner_id: string | null; created_at: string; stage?: string };
type Contact = { id: string; organization_id: string | null; name: string; role_title: string | null; email: string | null; phone: string | null; notes: string | null; owner_id: string | null };
type Interaction = { id: string; organization_id: string | null; contact_id: string | null; kind: string; subject: string; body: string | null; occurred_at: string; follow_up_at: string | null; follow_up_done: boolean; owner_id: string | null };

const categories = ['customer', 'funder'];
const kinds = ['note', 'call', 'email', 'meeting', 'follow_up'];
const label = (v: string) => v.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
const viewFromPath = (path: string): View => {
  if (path.split('/')[1] === 'help') return 'support';
  const seg = path.split('/')[2];
  return seg === 'organizations' || seg === 'companies' ? 'organizations' : seg === 'support' ? 'support' : seg === 'contracts' ? 'contracts' : 'contacts';
};
const fmt = (d: string) => new Date(d).toLocaleDateString();
const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400';
const btn = 'inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50';

type Dialog = { kind: 'org' | 'contact' | 'interaction'; orgId?: string } | null;

export const CustomerPage: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const { canView, canEdit, canManage } = useAppAccess('customers');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [items, setItems] = useState<Interaction[]>([]);
  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [contactHistory, setContactHistory] = useState<Interaction[]>([]);
  const [contactHistoryError, setContactHistoryError] = useState('');
  const [contactHistoryLoading, setContactHistoryLoading] = useState(false);
  const [contactConversations, setContactConversations] = useState<{ id: string; subject: string; status: string; last_message_at: string; last_message_preview: string | null }[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onRoute = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);

  useEffect(() => {
    setContactHistory([]);
    setContactConversations([]);
    setContactHistoryError('');
    if (view !== 'contacts' || !selectedContactId) return;
    const contact = contacts.find((item) => item.id === selectedContactId);
    if (!contact) return;
    let active = true;
    setContactHistoryLoading(true);
    void (async () => {
      const { data: history, error: historyError } = await supabase.from('crm_interactions')
        .select('*').eq('contact_id', contact.id).order('occurred_at', { ascending: false });
      if (!active) return;
      if (historyError) setContactHistoryError(historyError.message);
      else setContactHistory((history || []) as Interaction[]);

      if (['admin', 'coordinator'].includes(currentUser.systemRole)) {
        const customerResult = await supabase.from('support_customers').select('id').eq('crm_contact_id', contact.id);
        if (customerResult.error) {
          if (active) setContactHistoryError((current) => current || customerResult.error.message);
        } else if (customerResult.data?.length) {
          const { data: conversations, error: conversationsError } = await supabase.from('support_conversations')
            .select('id,subject,status,last_message_at,last_message_preview')
            .in('customer_id', customerResult.data.map((item) => item.id))
            .order('last_message_at', { ascending: false });
          if (active) {
            if (conversationsError) setContactHistoryError((current) => current || conversationsError.message);
            else setContactConversations(conversations || []);
          }
        }
      }
      if (active) setContactHistoryLoading(false);
    })();
    return () => { active = false; };
  }, [contacts, currentUser.systemRole, selectedContactId, view]);

  const load = useCallback(async () => {
    const [o, c, i] = await Promise.all([
      supabase.from('crm_organizations').select('*').order('name'),
      supabase.from('crm_contacts').select('*').order('name'),
      supabase.from('crm_interactions').select('*').order('occurred_at', { ascending: false }).limit(500),
    ]);
    const failure = o.error || c.error || i.error;
    if (failure) setError(failure.message);
    else setError('');
    setOrgs((o.data as Org[]) || []);
    setContacts((c.data as Contact[]) || []);
    setItems((i.data as Interaction[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const orgName = useCallback((id: string | null) => orgs.find((o) => o.id === id)?.name || '—', [orgs]);
  const contactName = useCallback((id: string | null) => contacts.find((c) => c.id === id)?.name || '', [contacts]);
  const userName = (id: string | null) => users.find((u) => u.id === id)?.name || '—';
  const q = search.trim().toLowerCase();

  const run = async (op: PromiseLike<{ error: { message: string } | null }>) => {
    const { error: e } = await op;
    if (e) setError(e.message); else { setError(''); await load(); }
  };

  const today = new Date();
  const followUps = useMemo(() => items.filter((i) => i.follow_up_at && !i.follow_up_done).sort((a, b) => a.follow_up_at!.localeCompare(b.follow_up_at!)), [items]);
  const overdue = followUps.filter((i) => new Date(i.follow_up_at!) < today);

  const tabs: [View, string][] = [['organizations', 'Companies'], ['contacts', 'Contacts'], ['contracts', 'Contracts'], ['support', 'Support']];
  const go = (v: View) => { window.history.pushState({}, '', v === 'overview' ? '/customers' : `/customers/${v}`); setView(v); };

  const filteredContacts = contacts.filter((c) => !q || `${c.name} ${c.email || ''} ${c.role_title || ''} ${orgName(c.organization_id)}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  const filteredItems = items.filter((i) => !q || `${i.subject} ${i.body || ''} ${orgName(i.organization_id)}`.toLowerCase().includes(q));

  const interactionRow = (i: Interaction) => (
    <div key={i.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{i.follow_up_at && !i.follow_up_done ? <Clock3 className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-800">{i.subject}</p>
        <p className="text-xs text-slate-500">{label(i.kind)} · {orgName(i.organization_id)}{i.contact_id ? ` · ${contactName(i.contact_id)}` : ''} · {fmt(i.occurred_at)}</p>
        {i.body && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{i.body}</p>}
        {i.follow_up_at && <p className={`mt-1 text-xs font-semibold ${!i.follow_up_done && new Date(i.follow_up_at) < today ? 'text-rose-600' : 'text-slate-400'}`}>Follow-up {fmt(i.follow_up_at)}{i.follow_up_done ? ' · done' : ''}</p>}
      </div>
      {canEdit && i.follow_up_at && !i.follow_up_done && <button type="button" title="Mark follow-up done" onClick={() => run(supabase.from('crm_interactions').update({ follow_up_done: true }).eq('id', i.id))} className="text-emerald-600"><CheckCircle2 className="h-4 w-4" /></button>}
      {canManage && <button type="button" title="Delete" onClick={async () => { if (await confirm({ title: 'Delete this interaction?' })) await run(supabase.from('crm_interactions').delete().eq('id', i.id)); }} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );

  const addLabel = view === 'contacts' ? 'contact' : view === 'activity' ? 'interaction' : 'company';

  const tabNav = null;

  if (view === 'contracts') return <ContractSuite />;

  if (view === 'support') {
    return (
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f9fc]">
        {tabNav}
        <SupportPage />
      </main>
    );
  }

  if (view === 'organizations' || view === 'pipeline') {
    return (
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f9fc]">
        {tabNav}
        {error && <p role="alert" className="m-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
        {loading ? <div className="p-5"><CardSkeleton lines={5} /></div> : view === 'organizations' ? (
          <CustomerWorkspace orgs={orgs} contacts={contacts} items={items} selectedId={selectedOrg} onSelect={setSelectedOrg} canEdit={canEdit} canManage={canManage} userName={userName} onAdd={(kind, orgId) => setDialog({ kind: kind === 'org' ? 'org' : kind, orgId })} onMutate={run} />
        ) : (
          <CustomerPipeline orgs={orgs} canEdit={canEdit} onOpen={(id) => { setSelectedOrg(id); go('organizations'); }} onMove={(id, stage) => void run(supabase.from('crm_organizations').update({ stage }).eq('id', id))} />
        )}
        {confirmDialog}
      {dialog && <RecordDialog dialog={dialog} orgs={orgs} contacts={contacts} userId={currentUser.id} onClose={() => setDialog(null)} onSave={async (table, row) => { const { error: e } = await supabase.from(table).insert(row); if (e) return e.message; setDialog(null); await load(); return ''; }} />}
      </main>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden bg-[#f7f9fc]">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
          <div>
            <h1 className="mt-1 text-xl font-bold text-slate-900">{tabs.find((t) => t[0] === view)?.[1]}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-52 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-2 text-xs outline-none focus:border-brand-400" /></div>
            {canEdit && view !== 'overview' && <button type="button" className={btn} onClick={() => setDialog({ kind: view === 'contacts' ? 'contact' : view === 'activity' ? 'interaction' : 'org' })}><Plus className="h-3.5 w-3.5" /> Add {addLabel}</button>}
          </div>
        </header>
        {tabNav}
        <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
          {loading ? <p className="text-xs text-slate-400">Loading…</p> : !canView && orgs.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-500">You don't have access to Customers. Ask an admin to assign the Customers team role.</p> : <>
            {view === 'overview' && <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[['Organizations', orgs.length], ['Contacts', contacts.length], ['Follow-ups due', followUps.length], ['Overdue', overdue.length]].map(([l, v]) => <div key={l} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{l}</p><p className={`mt-2 text-2xl font-bold ${l === 'Overdue' && Number(v) > 0 ? 'text-rose-600' : 'text-brand-600'}`}>{v}</p></div>)}
              </div>
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-bold text-slate-900">Follow-ups</h2>
                <div className="mt-3 space-y-2">{followUps.length ? followUps.slice(0, 10).map(interactionRow) : <p className="text-xs text-slate-400">Nothing waiting. Log an interaction with a follow-up date to track it here.</p>}</div>
              </section>
            </>}
            {view === 'contacts' && (
              <div className="grid min-h-[65vh] gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.8fr)]">
                <section className={`${selectedContactId ? 'hidden lg:block' : ''} overflow-hidden rounded-xl border border-slate-200 bg-white`}>
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-slate-800">Contacts <span className="text-slate-400">{filteredContacts.length}</span></h2>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {filteredContacts.map((contact) => (
                      <li key={contact.id}>
                        <button type="button" onClick={() => setSelectedContactId(contact.id)} className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selectedContactId === contact.id ? 'bg-brand-50' : ''}`}>
                          <span className="block truncate text-sm font-semibold text-slate-800">{contact.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{contact.role_title || 'Contact'}{contact.organization_id ? ` · ${orgName(contact.organization_id)}` : ''}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-400">{contact.email || contact.phone || 'No contact details'}</span>
                        </button>
                      </li>
                    ))}
                    {!filteredContacts.length && <li className="p-5 text-xs text-slate-400">No contacts match your search.</li>}
                  </ul>
                </section>
                <section className={`${selectedContactId ? '' : 'hidden lg:flex'} min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5`}>
                  {(() => {
                    const contact = contacts.find((item) => item.id === selectedContactId);
                    if (!contact) return <p className="m-auto text-sm text-slate-400">Select a contact to see their profile and history.</p>;
                    const organization = orgs.find((item) => item.id === contact.organization_id);
                    const history = contactHistory.map((item) => ({ id: item.id, date: item.occurred_at, title: item.subject, detail: `${label(item.kind)}${item.body ? ` · ${item.body}` : ''}`, status: item.follow_up_at ? `Follow-up ${fmt(item.follow_up_at)}${item.follow_up_done ? ' · done' : ''}` : '' }));
                    const conversationHistory = contactConversations.map((item) => ({ id: item.id, date: item.last_message_at, title: item.subject, detail: item.last_message_preview || 'Support conversation', status: label(item.status) }));
                    const timeline = [...history, ...conversationHistory].sort((a, b) => b.date.localeCompare(a.date));
                    return (
                      <>
                        <div className="flex items-start gap-3">
                          <button type="button" onClick={() => setSelectedContactId(null)} className="mr-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 lg:hidden">Back</button>
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{contact.name.split(/\\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate text-lg font-bold text-slate-900">{contact.name}</h2>
                            <p className="text-sm text-slate-500">{contact.role_title || 'Contact'}{organization ? ` · ${organization.name}` : ''}</p>
                          </div>
                        </div>
                        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div><dt className="text-xs text-slate-500">Email</dt><dd className="mt-1 break-all text-sm text-slate-800">{contact.email || '—'}</dd></div>
                          <div><dt className="text-xs text-slate-500">Phone</dt><dd className="mt-1 text-sm text-slate-800">{contact.phone || '—'}</dd></div>
                          <div><dt className="text-xs text-slate-500">Company</dt><dd className="mt-1 text-sm text-slate-800">{organization?.name || '—'}</dd></div>
                          <div><dt className="text-xs text-slate-500">Relationship</dt><dd className="mt-1 text-sm text-slate-800">{organization ? label(organization.category) : 'Not linked'}</dd></div>
                        </dl>
                        {contact.notes && <section className="mt-5"><h3 className="text-xs font-semibold text-slate-500">Internal notes</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{contact.notes}</p></section>}
                        <section className="mt-6 min-h-0 flex-1">
                          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">History</h3><span className="text-xs text-slate-400">{timeline.length} records</span></div>
                          {contactHistoryError && <p role="alert" className="mt-2 text-xs text-rose-600">{contactHistoryError}</p>}
                          {contactHistoryLoading ? <p className="mt-4 text-sm text-slate-400">Loading history…</p> : timeline.length ? <ol className="mt-3 space-y-3">{timeline.map((item) => <li key={item.id} className="border-l-2 border-slate-200 pl-3"><p className="text-sm font-medium text-slate-800">{item.title}</p><p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{item.detail}</p><p className="mt-1 text-xs text-slate-400">{fmt(item.date)}{item.status ? ` · ${item.status}` : ''}</p></li>)}</ol> : <p className="mt-3 text-sm text-slate-400">No history has been recorded for this contact.</p>}
                        </section>
                      </>
                    );
                  })()}
                </section>
              </div>
            )}
            {view === 'activity' && <div className="space-y-2">{filteredItems.length ? filteredItems.map(interactionRow) : <p className="text-xs text-slate-400">No interactions logged.</p>}</div>}
          </>}
        </div>
      </section>

      {confirmDialog}
      {dialog && <RecordDialog dialog={dialog} orgs={orgs} contacts={contacts} userId={currentUser.id} onClose={() => setDialog(null)} onSave={async (table, row) => { const { error: e } = await supabase.from(table).insert(row); if (e) return e.message; setDialog(null); await load(); return ''; }} />}
    </main>
  );
};

const RecordDialog: React.FC<{
  dialog: NonNullable<Dialog>; orgs: Org[]; contacts: Contact[]; userId: string; onClose: () => void;
  onSave: (table: string, row: Record<string, unknown>) => Promise<string>;
}> = ({ dialog, orgs, contacts, userId, onClose, onSave }) => {
  const [f, setF] = useState<Record<string, string>>({ organization_id: dialog.orgId || '', category: 'customer', kind: 'note' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const blank = (v?: string) => (v && v.trim() ? v.trim() : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    let table = 'crm_organizations';
    let row: Record<string, unknown> = { name: f.name?.trim(), category: f.category, website: blank(f.website), notes: blank(f.notes), owner_id: userId };
    if (dialog.kind === 'contact') {
      table = 'crm_contacts';
      row = { name: f.name?.trim(), organization_id: blank(f.organization_id), role_title: blank(f.role_title), email: blank(f.email), phone: blank(f.phone), notes: blank(f.notes), owner_id: userId };
    } else if (dialog.kind === 'interaction') {
      table = 'crm_interactions';
      row = { subject: f.subject?.trim(), kind: f.kind, body: blank(f.body), organization_id: blank(f.organization_id), contact_id: blank(f.contact_id), follow_up_at: f.follow_up_at ? new Date(f.follow_up_at).toISOString() : null, owner_id: userId };
    }
    setErr(await onSave(table, row));
    setBusy(false);
  };

  const orgSelect = <CustomSelect value={f.organization_id} onChange={set('organization_id')} className={input}><option value="">No organization</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</CustomSelect>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">New {dialog.kind === 'org' ? 'organization' : dialog.kind}</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        {dialog.kind === 'org' && <><input required maxLength={200} placeholder="Name" value={f.name || ''} onChange={set('name')} className={input} /><CustomSelect value={f.category} onChange={set('category')} className={input}>{categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}</CustomSelect><input placeholder="Website" value={f.website || ''} onChange={set('website')} className={input} /><textarea placeholder="Notes" value={f.notes || ''} onChange={set('notes')} className={input} rows={3} /></>}
        {dialog.kind === 'contact' && <><input required maxLength={200} placeholder="Name" value={f.name || ''} onChange={set('name')} className={input} />{orgSelect}<input placeholder="Role / title" value={f.role_title || ''} onChange={set('role_title')} className={input} /><input type="email" placeholder="Email" value={f.email || ''} onChange={set('email')} className={input} /><input placeholder="Phone" value={f.phone || ''} onChange={set('phone')} className={input} /></>}
        {dialog.kind === 'interaction' && <><input required maxLength={300} placeholder="Subject" value={f.subject || ''} onChange={set('subject')} className={input} /><CustomSelect value={f.kind} onChange={set('kind')} className={input}>{kinds.map((k) => <option key={k} value={k}>{label(k)}</option>)}</CustomSelect>{orgSelect}<CustomSelect value={f.contact_id || ''} onChange={set('contact_id')} className={input}><option value="">No contact</option>{contacts.filter((c) => !f.organization_id || c.organization_id === f.organization_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</CustomSelect><textarea placeholder="Details" value={f.body || ''} onChange={set('body')} className={input} rows={3} /><label className="block text-xs text-slate-500">Follow-up date (optional)<input type="date" value={f.follow_up_at || ''} onChange={set('follow_up_at')} className={`${input} mt-1`} /></label></>}
        {err && <p role="alert" className="text-xs text-rose-600">{err}</p>}
        <button type="submit" disabled={busy} className={`${btn} w-full justify-center`}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
};
