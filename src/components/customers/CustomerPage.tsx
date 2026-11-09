import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppAccess } from '../../lib/useAppAccess';
import { useWorkspace } from '../../context/WorkspaceContext';
import { userFacingError } from '../../lib/userFacingError';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { CustomSelect } from '../common/CustomSelect';
import { useConfirm } from '../common/useConfirm';
import { navigate } from '../../lib/navigate';
import { SupportPage } from '../support/SupportPage';
import { ContractSuite } from './ContractSuite';
import { CustomerWorkspace, type CrmOrg, type CrmContact, type CrmInteraction, type CrmDeal } from './CustomerWorkspace';

type RecordKind = 'org' | 'contact' | 'interaction' | 'deal';
type Dialog = { kind: RecordKind; orgId?: string; record?: CrmOrg | CrmContact | CrmInteraction | CrmDeal };
const input = 'workspace-control w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900';
const button = 'workspace-control inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const tables: Record<RecordKind, string> = { org: 'crm_organizations', contact: 'crm_contacts', interaction: 'crm_interactions', deal: 'crm_deals' };
const kinds = ['note', 'call', 'email', 'meeting', 'follow_up'];
const label = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
const route = () => window.location.pathname.split('/')[1] === 'help' ? 'support' : window.location.pathname.split('/')[2];

export const CustomerPage: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const access = useAppAccess('customers');
  const [view, setView] = useState(route);
  const [orgs, setOrgs] = useState<CrmOrg[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [items, setItems] = useState<CrmInteraction[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(location.search).get('company'));
  const [contactId, setContactId] = useState<string | null>(() => new URLSearchParams(location.search).get('contact'));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmation } = useConfirm();

  useEffect(() => {
    const sync = () => {
      setView(route());
      const params = new URLSearchParams(location.search);
      setSelectedId(params.get('company'));
      setContactId(params.get('contact'));
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const load = useCallback(async () => {
    if (view === 'contracts' || view === 'support') return;
    try {
      const read = async <T,>(table: string, order: string): Promise<T[]> => {
        const rows: T[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await supabase.from(table).select('*').order(order).order('id').range(offset, offset + 499);
          if (result.error) throw result.error;
          rows.push(...(result.data || []) as T[]);
          if (!result.data || result.data.length < 500) return rows;
        }
      };
      const [o, c, i, d] = await Promise.all([
        read<CrmOrg>('crm_organizations', 'name'), read<CrmContact>('crm_contacts', 'name'),
        read<CrmInteraction>('crm_interactions', 'occurred_at'), read<CrmDeal>('crm_deals', 'created_at'),
      ]);
      setOrgs(o); setContacts(c); setItems(i); setDeals(d); setError('');
    } catch (cause) {
      setError(userFacingError(cause, 'Company records could not be loaded. Apply the CRM migration and retry.'));
    } finally { setLoading(false); }
  }, [view]);
  useLiveRefresh(load, ['crm_organizations', 'crm_contacts', 'crm_interactions', 'crm_deals']);

  const contactOrganizationId = contacts.find((contact) => contact.id === contactId)?.organization_id;
  useEffect(() => {
    if (contactId && contactOrganizationId) setSelectedId(contactOrganizationId);
  }, [contactId, contactOrganizationId]);

  const mutate = async (operation: PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const result = await operation;
      if (result.error) { setError(userFacingError(result.error)); return false; }
      await load();
      return true;
    } catch (cause) {
      setError(userFacingError(cause)); return false;
    }
  };
  const remove = async (kind: RecordKind, record: { id: string; name?: string }) => {
    if (!await confirm({ title: `Delete ${record.name || label(kind)}?`, message: kind === 'org' ? 'Company activity and deals will be removed. Contacts are kept as unlinked contacts.' : 'This record will be permanently removed.' })) return;
    if (await mutate(supabase.from(tables[kind]).delete().eq('id', record.id).select('id').single()) && kind === 'org') navigate('/customers/organizations');
  };

  if (view === 'contracts') return <ContractSuite />;
  if (view === 'support') return <SupportPage />;
  return (
    <main data-onboarding-target="customers-workspace" className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
      {access.error && <p role="alert" className="p-4 text-sm text-rose-600">{access.error}</p>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 bg-rose-50 p-4 text-sm text-rose-700">{error}<button type="button" onClick={() => void load()} className="underline">Retry</button></div>}
      {loading ? <p className="p-6 text-sm text-slate-500">Loading companies…</p> : <CustomerWorkspace
        orgs={orgs} contacts={contacts} items={items} deals={deals} selectedId={selectedId} focusedContactId={contactId}
        onSelect={(id) => navigate(`/customers/organizations${id ? `?company=${encodeURIComponent(id)}` : ''}`)}
        canEdit={access.canEdit} canManage={access.canManage}
        onAdd={(kind, orgId) => setDialog({ kind, orgId })}
        onEdit={(kind, record) => setDialog({ kind, record })}
        onRemove={(kind, record) => void remove(kind, record)} onMutate={mutate}
      />}
      {confirmation}
      {dialog && <RecordDialog key={`${dialog.kind}-${dialog.record?.id || 'new'}`} dialog={dialog} orgs={orgs} contacts={contacts} users={users} userId={currentUser.id}
        onClose={() => setDialog(null)} onSave={async (row) => {
          const operation = dialog.record
            ? supabase.from(tables[dialog.kind]).update(row).eq('id', dialog.record.id).select('id').single()
            : supabase.from(tables[dialog.kind]).insert(row).select('id').single();
          const result = await operation;
          if (result.error) return userFacingError(result.error);
          if (dialog.kind === 'org') navigate(`/customers/organizations?company=${encodeURIComponent(result.data.id)}`);
          setDialog(null); await load(); return '';
        }} />}
    </main>
  );
};

const RecordDialog: React.FC<{
  dialog: Dialog; orgs: CrmOrg[]; contacts: CrmContact[]; users: { id: string; name: string }[];
  userId: string; onClose: () => void; onSave: (row: Record<string, unknown>) => Promise<string>;
}> = ({ dialog, orgs, contacts, users, userId, onClose, onSave }) => {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    organization_id: dialog.orgId || '', category: 'customer', kind: 'note', owner_id: userId, currency: 'USD', stage: 'open',
    ...Object.fromEntries(Object.entries(dialog.record || {}).map(([key, value]) => [key, value == null ? '' : String(value)])),
    ...(dialog.record && 'follow_up_at' in dialog.record ? { follow_up_at: dialog.record.follow_up_at?.slice(0, 10) || '' } : {}),
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value, ...(key === 'organization_id' ? { contact_id: '' } : {}) }));
  const field = (key: string, title: string, type = 'text', required = false) => <label className="block text-sm font-medium text-slate-700">{title}<input type={type} required={required} maxLength={key === 'name' ? 200 : 300} value={values[key] || ''} onChange={(event) => set(key, event.target.value)} className={`${input} mt-1`} /></label>;
  const area = (key: string, title: string) => <label className="block text-sm font-medium text-slate-700">{title}<textarea rows={3} maxLength={10000} value={values[key] || ''} onChange={(event) => set(key, event.target.value)} className={`${input} mt-1`} /></label>;
  const companySelect = <label className="block text-sm font-medium text-slate-700">Company<CustomSelect value={values.organization_id} onChange={(event) => set('organization_id', event.target.value)} className={`${input} mt-1`}><option value="">Unlinked contact</option>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</CustomSelect></label>;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const blank = (key: string) => values[key]?.trim() || null;
    const common = { owner_id: blank('owner_id') };
    let row: Record<string, unknown>;
    if (dialog.kind === 'org') row = { ...common, name: blank('name'), category: values.category, website: blank('website'), notes: blank('notes'), phone: blank('phone'), address: blank('address'), industry: blank('industry') };
    else if (dialog.kind === 'contact') row = { ...common, name: blank('name'), organization_id: blank('organization_id'), role_title: blank('role_title'), email: blank('email'), phone: blank('phone'), notes: blank('notes') };
    else if (dialog.kind === 'deal') row = { ...common, organization_id: blank('organization_id'), name: blank('name'), amount: blank('amount') == null ? null : Number(values.amount), currency: values.currency.toUpperCase(), stage: values.stage, expected_close: blank('expected_close'), notes: blank('notes') };
    else row = { ...common, organization_id: blank('organization_id'), contact_id: blank('contact_id'), subject: blank('subject'), kind: values.kind, body: blank('body'), follow_up_at: values.follow_up_at ? `${values.follow_up_at}T12:00:00Z` : null };
    if ((dialog.kind === 'deal' || dialog.kind === 'interaction') && !row.organization_id) { setError('Choose a company.'); return; }
    setBusy(true); setError('');
    try { setError(await onSave(row)); }
    catch (cause) { setError(userFacingError(cause)); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`${dialog.record ? 'Edit' : 'New'} ${dialog.kind === 'org' ? 'company' : dialog.kind}`}>
    <form onSubmit={(event) => void save(event)} className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
      <header className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">{dialog.record ? 'Edit' : 'New'} {dialog.kind === 'org' ? 'company' : dialog.kind}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close" className="p-2"><X className="h-5 w-5" /></button></header>
      {(dialog.kind === 'org' || dialog.kind === 'contact' || dialog.kind === 'deal') && field('name', 'Name', 'text', true)}
      {dialog.kind === 'org' && <>
        <label className="block text-sm font-medium text-slate-700">Relationship<CustomSelect value={values.category} onChange={(event) => set('category', event.target.value)} className={`${input} mt-1`}><option value="customer">Customer</option><option value="funder">Funder</option>{values.category !== 'customer' && values.category !== 'funder' && <option value={values.category}>{label(values.category)}</option>}</CustomSelect></label>
        {field('website', 'Website')}{field('industry', 'Industry')}{field('phone', 'Phone', 'tel')}{area('address', 'Address')}{area('notes', 'Company notes')}
      </>}
      {dialog.kind === 'contact' && <>{companySelect}{field('role_title', 'Role / title')}{field('email', 'Email', 'email')}{field('phone', 'Phone', 'tel')}{area('notes', 'Contact notes')}</>}
      {dialog.kind === 'deal' && <>{companySelect}<div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Amount<input type="number" min="0" step="0.01" value={values.amount || ''} onChange={(event) => set('amount', event.target.value)} className={`${input} mt-1`} /></label><label className="text-sm font-medium">Currency<input required pattern="[A-Za-z]{3}" maxLength={3} value={values.currency} onChange={(event) => set('currency', event.target.value)} className={`${input} mt-1`} /></label></div><label className="text-sm font-medium">Status<CustomSelect value={values.stage} onChange={(event) => set('stage', event.target.value)} className={`${input} mt-1`}>{['open', 'negotiating', 'won', 'lost'].map((stage) => <option key={stage} value={stage}>{label(stage)}</option>)}</CustomSelect></label>{field('expected_close', 'Expected close', 'date')}{area('notes', 'Details')}</>}
      {dialog.kind === 'interaction' && <>{field('subject', 'Subject', 'text', true)}<label className="text-sm font-medium">Activity<CustomSelect value={values.kind} onChange={(event) => set('kind', event.target.value)} className={`${input} mt-1`}>{kinds.map((kind) => <option key={kind} value={kind}>{label(kind)}</option>)}</CustomSelect></label>{companySelect}<label className="text-sm font-medium">Contact<CustomSelect value={values.contact_id || ''} onChange={(event) => set('contact_id', event.target.value)} className={`${input} mt-1`}><option value="">Company activity</option>{contacts.filter((contact) => contact.organization_id === values.organization_id).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</CustomSelect></label>{area('body', 'Details')}{field('follow_up_at', 'Follow-up date', 'date')}</>}
      <label className="block text-sm font-medium text-slate-700">Owner<CustomSelect value={values.owner_id || ''} onChange={(event) => set('owner_id', event.target.value)} className={`${input} mt-1`}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect></label>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className={`${button} w-full`}>{busy ? 'Saving…' : 'Save'}</button>
    </form>
  </div>;
};
