import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ContactRound, Plus, Search, Trash2, X, Clock3, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppAccess } from '../../lib/useAppAccess';
import { useWorkspace } from '../../context/WorkspaceContext';
import { SupportPage } from '../support/SupportPage';
import { CustomerPipeline, CustomerWorkspace } from './CustomerWorkspace';
import { CardSkeleton } from '../common/Feedback';
import { useConfirm } from '../common/useConfirm';

type View = 'overview' | 'contacts' | 'organizations' | 'pipeline' | 'activity' | 'support';
type Org = { id: string; name: string; category: string; website: string | null; notes: string | null; owner_id: string | null; created_at: string; stage?: string };
type Contact = { id: string; organization_id: string | null; name: string; role_title: string | null; email: string | null; phone: string | null; notes: string | null; owner_id: string | null };
type Interaction = { id: string; organization_id: string | null; contact_id: string | null; kind: string; subject: string; body: string | null; occurred_at: string; follow_up_at: string | null; follow_up_done: boolean; owner_id: string | null };

const categories = ['customer', 'prospect', 'partner', 'funder', 'vendor', 'government', 'media', 'community', 'other'];
const kinds = ['note', 'call', 'email', 'meeting', 'follow_up'];
const label = (v: string) => v.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
const viewFromPath = (path: string): View => {
  if (path.split('/')[1] === 'help') return 'support';
  const seg = path.split('/')[2];
  return seg === 'contacts' || seg === 'organizations' || seg === 'pipeline' || seg === 'activity' || seg === 'support' ? seg : 'overview';
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
  const [contactSort, setContactSort] = useState<{ col: number; dir: 1 | -1 }>({ col: 0, dir: 1 });
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onRoute = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);

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

  const tabs: [View, string][] = [['overview', 'Overview'], ['organizations', 'Customers'], ['pipeline', 'Pipeline'], ['contacts', 'Contacts'], ['activity', 'Interactions'], ['support', 'Support']];
  const go = (v: View) => { window.history.pushState({}, '', v === 'overview' ? '/customers' : `/customers/${v}`); setView(v); };

    const contactKey = (c: Contact) => [c.name, orgName(c.organization_id), c.role_title || '', c.email || '', c.phone || ''][contactSort.col].toLowerCase();
  const filteredContacts = contacts.filter((c) => !q || `${c.name} ${c.email || ''} ${c.role_title || ''} ${orgName(c.organization_id)}`.toLowerCase().includes(q)).sort((a, b) => contactKey(a).localeCompare(contactKey(b)) * contactSort.dir);
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

  const table = (heads: string[], rows: React.ReactNode[][], empty: string, sort?: { col: number; dir: 1 | -1; set: (col: number) => void }) => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-xs">
        <thead><tr className="border-b border-slate-100 bg-slate-50/70">{heads.map((h, index) => <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">{sort ? <button type="button" onClick={() => sort.set(index)} className="hover:text-slate-600">{h}{sort.col === index ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button> : h}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={heads.length} className="px-4 py-8 text-center text-slate-400">{empty}</td></tr> : rows.map((r, i) => <tr key={i} className="border-b border-slate-100 last:border-0">{r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-600">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );

  const addLabel = view === 'contacts' ? 'contact' : view === 'activity' ? 'interaction' : 'organization';

  const tabNav = (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-5 sm:px-8">
      {tabs.map(([id, name]) => <button key={id} type="button" onClick={() => go(id)} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold ${view === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{name}</button>)}
    </nav>
  );

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
            {view === 'contacts' && table(['Contact', 'Organization', 'Role', 'Email', 'Phone'], filteredContacts.map((c) => [
              <span className="flex items-center gap-2 font-bold text-slate-800"><ContactRound className="h-4 w-4 text-brand-600" />{c.name}</span>, orgName(c.organization_id), c.role_title || '—', c.email || '—', c.phone || '—',
            ]), 'No contacts yet.', { ...contactSort, set: (col) => setContactSort((current) => ({ col, dir: current.col === col && current.dir === 1 ? -1 : 1 })) })}
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
  const [f, setF] = useState<Record<string, string>>({ organization_id: dialog.orgId || '', category: 'other', kind: 'note' });
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

  const orgSelect = <select value={f.organization_id} onChange={set('organization_id')} className={input}><option value="">No organization</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">New {dialog.kind === 'org' ? 'organization' : dialog.kind}</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        {dialog.kind === 'org' && <><input required maxLength={200} placeholder="Name" value={f.name || ''} onChange={set('name')} className={input} /><select value={f.category} onChange={set('category')} className={input}>{categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select><input placeholder="Website" value={f.website || ''} onChange={set('website')} className={input} /><textarea placeholder="Notes" value={f.notes || ''} onChange={set('notes')} className={input} rows={3} /></>}
        {dialog.kind === 'contact' && <><input required maxLength={200} placeholder="Name" value={f.name || ''} onChange={set('name')} className={input} />{orgSelect}<input placeholder="Role / title" value={f.role_title || ''} onChange={set('role_title')} className={input} /><input type="email" placeholder="Email" value={f.email || ''} onChange={set('email')} className={input} /><input placeholder="Phone" value={f.phone || ''} onChange={set('phone')} className={input} /></>}
        {dialog.kind === 'interaction' && <><input required maxLength={300} placeholder="Subject" value={f.subject || ''} onChange={set('subject')} className={input} /><select value={f.kind} onChange={set('kind')} className={input}>{kinds.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>{orgSelect}<select value={f.contact_id || ''} onChange={set('contact_id')} className={input}><option value="">No contact</option>{contacts.filter((c) => !f.organization_id || c.organization_id === f.organization_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><textarea placeholder="Details" value={f.body || ''} onChange={set('body')} className={input} rows={3} /><label className="block text-xs text-slate-500">Follow-up date (optional)<input type="date" value={f.follow_up_at || ''} onChange={set('follow_up_at')} className={`${input} mt-1`} /></label></>}
        {err && <p role="alert" className="text-xs text-rose-600">{err}</p>}
        <button type="submit" disabled={busy} className={`${btn} w-full justify-center`}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
};
